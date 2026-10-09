from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Coupon(models.Model):
    class Kind(models.TextChoices):
        PERCENT = "percent", "درصدی"
        FIXED = "fixed", "مبلغ ثابت"

    code = models.CharField(max_length=32, unique=True)
    description = models.CharField(max_length=200, blank=True)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.PERCENT)
    value = models.PositiveIntegerField()
    max_discount_toman = models.PositiveBigIntegerField(null=True, blank=True)
    min_subtotal_toman = models.PositiveBigIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    per_customer_limit = models.PositiveIntegerField(default=1)
    categories = models.ManyToManyField("catalog.Category", blank=True, related_name="+")
    products = models.ManyToManyField("catalog.Product", blank=True, related_name="+")
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(code__regex=r"^[A-Z0-9_-]{3,32}$"), name="coupon_code_format"),
            models.CheckConstraint(
                condition=~Q(kind="percent") | (Q(value__gte=1) & Q(value__lte=90)),
                name="coupon_percent_bounds",
            ),
            models.CheckConstraint(
                condition=~Q(kind="fixed") | (Q(value__gte=1000) & Q(value__lte=50_000_000)),
                name="coupon_fixed_bounds",
            ),
            models.CheckConstraint(
                condition=Q(ends_at__isnull=True) | Q(starts_at__isnull=True) | Q(ends_at__gt=F("starts_at")),
                name="coupon_window_order",
            ),
        ]

    def __str__(self) -> str:
        return self.code


class CouponRedemption(models.Model):
    class Status(models.TextChoices):
        RESERVED = "reserved", "رزرو"
        CONSUMED = "consumed", "مصرف‌شده"
        RELEASED = "released", "آزادشده"

    coupon = models.ForeignKey(Coupon, on_delete=models.PROTECT, related_name="redemptions")
    order = models.OneToOneField("orders.Order", on_delete=models.PROTECT, related_name="coupon_redemption")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    email = models.EmailField(max_length=254)
    discount_toman = models.PositiveBigIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RESERVED, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["coupon", "status"]), models.Index(fields=["coupon", "email"])]

    def __str__(self) -> str:
        return f"CouponRedemption: {self.pk}"
