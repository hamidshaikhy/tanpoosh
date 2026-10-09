from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class PaymentAttempt(models.Model):
    class Status(models.TextChoices):
        CREATED = "created", "ایجادشده"
        REQUEST_FAILED = "request_failed", "خطا در اتصال به درگاه"
        REDIRECTED = "redirected", "در درگاه پرداخت"
        VERIFYING = "verifying", "در حال تأیید"
        VERIFIED = "verified", "تأییدشده"
        FAILED = "failed", "ناموفق"
        CANCELLED = "cancelled", "لغو یا منقضی"
        UNKNOWN = "unknown", "نامشخص — در انتظار بررسی"

    FINAL = {Status.VERIFIED, Status.FAILED, Status.CANCELLED, Status.REQUEST_FAILED}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payment_attempts")
    provider = models.CharField(max_length=20)  # zarinpal | mock
    mode = models.CharField(max_length=10)  # sandbox | live | mock
    amount_toman = models.PositiveBigIntegerField()
    provider_amount = models.PositiveBigIntegerField()
    provider_currency = models.CharField(max_length=3)  # IRR | IRT
    authority = models.CharField(max_length=64, null=True, blank=True, unique=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.CREATED, db_index=True)
    ref_id = models.CharField(max_length=40, blank=True)
    fee = models.BigIntegerField(null=True, blank=True)
    provider_code = models.IntegerField(null=True, blank=True)
    failure_reason = models.CharField(max_length=200, blank=True)
    callback_count = models.PositiveIntegerField(default=0)
    check_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    redirected_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(provider_currency__in=["IRR", "IRT"]), name="attempt_currency"),
            models.CheckConstraint(condition=Q(mode__in=["sandbox", "live", "mock"]), name="attempt_mode"),
            models.CheckConstraint(condition=~Q(status="verified") | Q(ref_id__gt=""), name="attempt_verified_has_ref"),
        ]

    def __str__(self) -> str:
        return f"PaymentAttempt: {self.pk}"

    @property
    def is_test(self) -> bool:
        return self.mode != "live"


class Refund(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "درخواست‌شده"
        APPROVED = "approved", "تأییدشده"
        PROCESSING = "processing", "در حال انجام"
        COMPLETED = "completed", "انجام‌شده"
        FAILED = "failed", "ناموفق"
        REJECTED = "rejected", "ردشده"

    class Method(models.TextChoices):
        MANUAL = "manual", "بازپرداخت دستی (ثبت مرجع)"

    ACTIVE = {Status.REQUESTED, Status.APPROVED, Status.PROCESSING, Status.COMPLETED}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="refunds")
    return_request = models.ForeignKey(
        "orders.ReturnRequest", null=True, blank=True, on_delete=models.PROTECT, related_name="refunds"
    )
    amount_toman = models.PositiveBigIntegerField()
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.MANUAL)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.REQUESTED, db_index=True)
    reason = models.CharField(max_length=300)
    reference = models.CharField(max_length=80, blank=True)
    evidence_note = models.CharField(max_length=500, blank=True)
    failure_reason = models.CharField(max_length=300, blank=True)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    processed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    is_test = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount_toman__gte=1), name="refund_amount_positive"),
            models.CheckConstraint(condition=~Q(status="completed") | Q(reference__gt=""), name="refund_completed_has_reference"),
        ]

    def __str__(self) -> str:
        return f"Refund: {self.pk}"


class MockGatewayTransaction(models.Model):
    """State for the DEVELOPMENT/TEST-ONLY mock gateway. Never used when PAYMENT_PROVIDER=zarinpal."""

    class State(models.TextChoices):
        PENDING = "pending", "در انتظار"
        PAID = "paid", "پرداخت‌شده"
        FAILED = "failed", "ناموفق"
        CANCELLED = "cancelled", "لغو"

    authority = models.CharField(max_length=64, unique=True)
    amount = models.PositiveBigIntegerField()
    currency = models.CharField(max_length=3)
    callback_url = models.CharField(max_length=300)
    state = models.CharField(max_length=10, choices=State.choices, default=State.PENDING)
    verified = models.BooleanField(default=False)
    ref_id = models.CharField(max_length=40, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"MockGatewayTransaction: {self.pk}"
