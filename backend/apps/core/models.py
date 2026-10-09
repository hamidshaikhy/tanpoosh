from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class AuditEvent(models.Model):
    """Append-only record of sensitive actions. No update/delete API is exposed."""

    class Result(models.TextChoices):
        SUCCESS = "success", "موفق"
        DENIED = "denied", "رد شده"
        FAILED = "failed", "ناموفق"

    id = models.BigAutoField(primary_key=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    actor_label = models.CharField(max_length=80, blank=True)
    action = models.CharField(max_length=80, db_index=True)
    object_type = models.CharField(max_length=60, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_label = models.CharField(max_length=160, blank=True)
    result = models.CharField(max_length=10, choices=Result.choices, default=Result.SUCCESS)
    ip_prefix = models.CharField(max_length=64, blank=True)
    request_id = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["object_type", "object_id"])]

    def __str__(self) -> str:
        return f"AuditEvent: {self.pk}"

    def save(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        if self.pk and not kwargs.pop("_allow_update", False):
            raise RuntimeError("Audit events are append-only")
        super().save(*args, **kwargs)


class OutboxEvent(models.Model):
    """Durable intent for side effects (emails, staff alerts, cache revalidation).

    Written in the same transaction as the state change; dispatched after commit by a Celery task
    and re-swept periodically, so a crash between commit and enqueue cannot lose the effect.
    `dedupe_key` guarantees a side effect is recorded at most once.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        SENT = "sent", "ارسال شده"
        FAILED = "failed", "ناموفق"

    id = models.BigAutoField(primary_key=True)
    kind = models.CharField(max_length=60)
    dedupe_key = models.CharField(max_length=160, unique=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=300, blank=True)
    available_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return f"OutboxEvent: {self.pk}"


class IdempotencyRecord(models.Model):
    """Durable idempotency key, scoped to the caller (user id or anonymous session)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    scope = models.CharField(max_length=80)
    endpoint = models.CharField(max_length=60)
    key = models.CharField(max_length=80)
    request_hash = models.CharField(max_length=64)
    response_status = models.PositiveSmallIntegerField(null=True, blank=True)
    response_body = models.JSONField(null=True, blank=True)
    resource_id = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["scope", "endpoint", "key"], name="uniq_idempotency_scope_key")]

    def __str__(self) -> str:
        return f"IdempotencyRecord: {self.pk}"
