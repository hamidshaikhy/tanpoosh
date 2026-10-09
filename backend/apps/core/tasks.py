from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import IdempotencyRecord, OutboxEvent

logger = logging.getLogger("tanpoosh.outbox")
MAX_ATTEMPTS = 8


def _handlers():  # lazy import to avoid app-loading cycles
    from .emails import send_staff_alert, send_templated_email
    from .revalidate import revalidate_frontend

    return {
        "email": lambda p: send_templated_email(p["template"], p["to"], p.get("context", {})),
        "staff_alert": lambda p: send_staff_alert(p["subject"], p["message"]),
        "revalidate": lambda p: revalidate_frontend(p.get("tags", [])),
    }


@shared_task(ignore_result=True)
def dispatch_outbox_event(event_id: int) -> None:
    with transaction.atomic():
        event = (
            OutboxEvent.objects.select_for_update(skip_locked=True)
            .filter(pk=event_id, status=OutboxEvent.Status.PENDING, available_at__lte=timezone.now())
            .first()
        )
        if event is None:
            return
        handler = _handlers().get(event.kind)
        try:
            if handler is None:
                raise RuntimeError(f"No handler for outbox kind {event.kind}")
            handler(event.payload)
        except Exception as exc:  # noqa: BLE001 - recorded and retried with backoff
            event.attempts += 1
            event.last_error = f"{exc.__class__.__name__}: {str(exc)[:200]}"
            if event.attempts >= MAX_ATTEMPTS:
                event.status = OutboxEvent.Status.FAILED
                logger.error("Outbox event %s permanently failed: %s", event.pk, event.last_error)
            else:
                event.available_at = timezone.now() + timedelta(seconds=min(3600, 30 * 2**event.attempts))
                logger.warning("Outbox event %s failed (attempt %s)", event.pk, event.attempts)
            event.save(update_fields=["attempts", "last_error", "status", "available_at"])
            return
        event.status = OutboxEvent.Status.SENT
        event.processed_at = timezone.now()
        event.attempts += 1
        event.save(update_fields=["status", "processed_at", "attempts"])


@shared_task(ignore_result=True)
def dispatch_pending_outbox() -> int:
    ids = list(
        OutboxEvent.objects.filter(status=OutboxEvent.Status.PENDING, available_at__lte=timezone.now())
        .order_by("id")
        .values_list("id", flat=True)[:200]
    )
    for event_id in ids:
        dispatch_outbox_event(event_id)
    return len(ids)


@shared_task(ignore_result=True)
def cleanup_idempotency_records() -> int:
    cutoff = timezone.now() - timedelta(days=7)
    deleted, _ = IdempotencyRecord.objects.filter(created_at__lt=cutoff).delete()
    return deleted
