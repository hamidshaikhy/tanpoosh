"""Stock accounting model (documented in docs/ARCHITECTURE.md):

    available = on_hand - reserved

* Order placement reserves:     reserved += q              (requires available >= q)
* Verified payment consumes:    on_hand -= q, reserved -= q
* Expiry / unpaid cancel:       reserved -= q
* Late payment after release:   on_hand -= q if available >= q, else order needs_review
* Accepted returned goods:      on_hand += q (only quantities staff accept as restockable)
* Staff adjustment:             on_hand += delta (never below reserved)

Database CHECK constraints make negative stock and over-reservation impossible even if a code
path were wrong; every change writes an InventoryMovement ledger row.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class StockLevel(models.Model):
    variant = models.OneToOneField("catalog.Variant", primary_key=True, on_delete=models.CASCADE, related_name="stock")
    on_hand = models.IntegerField(default=0)
    reserved = models.IntegerField(default=0)
    low_stock_threshold = models.PositiveSmallIntegerField(default=3)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(on_hand__gte=0), name="stock_on_hand_nonnegative"),
            models.CheckConstraint(condition=Q(reserved__gte=0), name="stock_reserved_nonnegative"),
            models.CheckConstraint(condition=Q(reserved__lte=F("on_hand")), name="stock_reserved_le_on_hand"),
        ]

    def __str__(self) -> str:
        return f"StockLevel: {self.pk}"

    @property
    def available(self) -> int:
        return max(0, self.on_hand - self.reserved)


class InventoryMovement(models.Model):
    class Kind(models.TextChoices):
        ADJUSTMENT = "adjustment", "اصلاح دستی"
        RECEIVE = "receive", "ورود کالا"
        RESERVE = "reserve", "رزرو سفارش"
        RELEASE = "release", "آزادسازی رزرو"
        SALE = "sale", "فروش (پرداخت تأییدشده)"
        LATE_SALE = "late_sale", "فروش پس از انقضای رزرو"
        CANCEL_RESTOCK = "cancel_restock", "بازگشت به انبار (لغو سفارش)"
        RETURN_RESTOCK = "return_restock", "بازگشت به انبار (مرجوعی)"
        SEED = "seed", "موجودی اولیه"

    id = models.BigAutoField(primary_key=True)
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="movements")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    delta_on_hand = models.IntegerField(default=0)
    delta_reserved = models.IntegerField(default=0)
    on_hand_after = models.IntegerField()
    reserved_after = models.IntegerField()
    reason = models.CharField(max_length=300, blank=True)
    reference = models.CharField(max_length=64, blank=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self) -> str:
        return f"InventoryMovement: {self.pk}"
