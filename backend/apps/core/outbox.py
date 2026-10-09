from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import OutboxEvent


def enqueue(kind: str, payload: dict[str, Any], *, dedupe_key: str, delay_seconds: int = 0) -> OutboxEvent | None:
    """Record a side effect inside the current transaction; dispatch after commit.

    Returns None if an event with the same dedupe key already exists (duplicate guard).
    """
    try:
        with transaction.atomic():
            event = OutboxEvent.objects.create(
                kind=kind,
                payload=payload,
                dedupe_key=dedupe_key[:160],
                available_at=timezone.now() + timedelta(seconds=delay_seconds),
            )
    except IntegrityError:
        return None

    def _dispatch() -> None:
        from .tasks import dispatch_outbox_event

        try:
            dispatch_outbox_event.delay(event.pk)
        except Exception as exc:  # noqa: BLE001 -- delivery is durable; the sweeper retries broker failures
            logging.getLogger("tanpoosh.outbox").warning("Outbox dispatch deferred: %s", exc.__class__.__name__)

    transaction.on_commit(_dispatch)
    return event
