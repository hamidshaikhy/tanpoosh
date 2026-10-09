"""Durable, caller-scoped idempotency keys for non-idempotent mutations.

Same key + same payload  -> the stored response of the first successful execution.
Same key + other payload -> 409 idempotency_conflict.
Keys are scoped to the authenticated user or the anonymous session, so one caller can never
read another caller's stored response by reusing their key.

The record is inserted inside the caller's transaction: if the operation fails and rolls back,
the key is not consumed. Concurrent requests with the same key serialize on the unique index.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from django.db import IntegrityError, transaction

from .errors import ApiError, Conflict
from .models import IdempotencyRecord

_KEY_RE = re.compile(r"^[A-Za-z0-9_\-]{16,80}$")


def require_key(request: Any) -> str:
    key = request.headers.get("Idempotency-Key", "")
    if not _KEY_RE.match(key):
        raise ApiError(
            "idempotency_key_required",
            "شناسهٔ یکتای درخواست ارسال نشده یا نامعتبر است. صفحه را تازه کنید.",
        )
    return key


def scope_for(request: Any) -> str:
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return f"u:{user.pk}"
    session = request.session
    if not session.session_key:
        session.save()
    return f"s:{session.session_key}"


def request_hash(payload: Any) -> str:
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


class IdempotentOperation:
    """Usage (inside transaction.atomic()):

    op = IdempotentOperation(request, "order.create", payload)
    if op.replay is not None:
        return Response(op.replay.response_body, status=op.replay.response_status)
    ... perform ...
    op.complete(201, body, resource_id=str(order.pk))
    """

    def __init__(self, request: Any, endpoint: str, payload: Any, *, key: str | None = None) -> None:
        if not transaction.get_connection().in_atomic_block:
            raise RuntimeError("IdempotentOperation must run inside transaction.atomic()")
        self.key = key or require_key(request)
        self.scope = scope_for(request)
        self.endpoint = endpoint
        self.hash = request_hash(payload)
        self.replay: IdempotencyRecord | None = None
        try:
            with transaction.atomic():
                self.record = IdempotencyRecord.objects.create(
                    scope=self.scope, endpoint=endpoint, key=self.key, request_hash=self.hash
                )
        except IntegrityError:
            existing = IdempotencyRecord.objects.select_for_update().get(scope=self.scope, endpoint=endpoint, key=self.key)
            if existing.request_hash != self.hash:
                raise Conflict(
                    "idempotency_conflict",
                    "این درخواست با اطلاعات متفاوت قبلاً ثبت شده است. صفحه را تازه کنید.",
                ) from None
            if existing.response_status is None:
                raise Conflict("idempotency_in_progress", "درخواست قبلی هنوز در حال پردازش است.") from None
            self.replay = existing
            self.record = existing

    def complete(self, status_code: int, body: Any, *, resource_id: str = "") -> None:
        self.record.response_status = status_code
        self.record.response_body = json.loads(json.dumps(body, default=str))
        self.record.resource_id = resource_id
        self.record.save(update_fields=["response_status", "response_body", "resource_id"])
