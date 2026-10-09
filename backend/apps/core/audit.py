from __future__ import annotations

from typing import Any

from .logging import redact_text
from .models import AuditEvent
from .net import client_ip, ip_prefix

_FORBIDDEN_KEYS = {"password", "new_password", "current_password", "token", "secret", "otp", "code", "session"}


def _clean(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if not metadata:
        return {}
    clean: dict[str, Any] = {}
    for key, value in metadata.items():
        if key.lower() in _FORBIDDEN_KEYS:
            continue
        if isinstance(value, str):
            clean[key] = redact_text(value)[:300]
        elif isinstance(value, (int, float, bool)) or value is None:
            clean[key] = value
        elif isinstance(value, (list, tuple)):
            clean[key] = [v if isinstance(v, (int, float, bool)) else str(v)[:120] for v in list(value)[:30]]
        elif isinstance(value, dict):
            clean[key] = _clean(value)
        else:
            clean[key] = str(value)[:120]
    return clean


def record(
    action: str,
    *,
    actor: Any = None,
    request: Any = None,
    obj: Any = None,
    object_type: str = "",
    object_id: str = "",
    object_label: str = "",
    result: str = AuditEvent.Result.SUCCESS,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    if request is not None and actor is None:
        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            actor = user
    if obj is not None:
        object_type = object_type or obj.__class__.__name__.lower()
        object_id = object_id or str(getattr(obj, "pk", ""))
        object_label = object_label or str(obj)[:160]
    django_request = getattr(request, "_request", request)
    return AuditEvent.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        actor_label=(getattr(actor, "username", "") or "system")[:80],
        action=action,
        object_type=object_type,
        object_id=object_id,
        object_label=object_label[:160],
        result=result,
        ip_prefix=ip_prefix(client_ip(django_request)) if django_request is not None else "",
        request_id=getattr(django_request, "request_id", "") if django_request is not None else "",
        metadata=_clean(metadata),
    )
