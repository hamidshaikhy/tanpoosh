from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class ShippingMethod(models.Model):
    code = models.SlugField(max_length=32, unique=True)
    name = models.CharField(max_length=60)
    description = models.CharField(max_length=200, blank=True)
    eta_text = models.CharField(max_length=60, blank=True)
    fee_toman = models.PositiveBigIntegerField()
    # Free when the post-discount merchandise amount reaches this threshold (null = never free).
    free_threshold_toman = models.PositiveBigIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(fee_toman__lte=10_000_000), name="shipping_fee_bounds"),
        ]

    def __str__(self) -> str:
        return self.name


class PaymentStatus(models.TextChoices):
    UNPAID = "unpaid", "پرداخت‌نشده"
    PENDING = "pending", "در انتظار تأیید پرداخت"
    VERIFIED = "verified", "پرداخت‌شده"
    FAILED = "failed", "پرداخت ناموفق"
    CANCELLED = "cancelled", "لغوشده"
    REFUND_PENDING = "refund_pending", "در انتظار بازپرداخت"
    PARTIALLY_REFUNDED = "partially_refunded", "بازپرداخت جزئی"
    REFUNDED = "refunded", "بازپرداخت کامل"
    NEEDS_REVIEW = "needs_review", "نیازمند بررسی"


class FulfillmentStatus(models.TextChoices):
    AWAITING_PAYMENT = "awaiting_payment", "در انتظار پرداخت"
    PROCESSING = "processing", "در حال آماده‌سازی"
    PACKED = "packed", "بسته‌بندی‌شده"
    SHIPPED = "shipped", "ارسال‌شده"
    DELIVERED = "delivered", "تحویل‌شده"
    CANCELLED = "cancelled", "لغوشده"
    RETURNED = "returned", "مرجوع‌شده"


class Order(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=20, unique=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="orders")
    is_guest = models.BooleanField(default=False)

    contact_name = models.CharField(max_length=120)
    contact_phone = models.CharField(max_length=11)
    contact_email = models.EmailField(max_length=254)

    ship_recipient = models.CharField(max_length=120)
    ship_phone = models.CharField(max_length=11)
    ship_province = models.CharField(max_length=40)
    ship_city = models.CharField(max_length=60)
    ship_postal_code = models.CharField(max_length=10)
    ship_line = models.CharField(max_length=300)
    ship_plaque = models.CharField(max_length=20, blank=True)
    ship_unit = models.CharField(max_length=20, blank=True)

    shipping_method_code = models.CharField(max_length=32)
    shipping_method_name = models.CharField(max_length=60)

    subtotal_toman = models.PositiveBigIntegerField()
    discount_toman = models.PositiveBigIntegerField(default=0)
    shipping_toman = models.PositiveBigIntegerField(default=0)
    total_toman = models.PositiveBigIntegerField()
    refunded_toman = models.PositiveBigIntegerField(default=0)
    currency = models.CharField(max_length=3, default="IRT")
    coupon_code = models.CharField(max_length=32, blank=True)

    payment_status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.UNPAID, db_index=True)
    fulfillment_status = models.CharField(
        max_length=20, choices=FulfillmentStatus.choices, default=FulfillmentStatus.AWAITING_PAYMENT, db_index=True
    )
    payment_mode = models.CharField(max_length=10, blank=True)  # sandbox | live | mock (set when paid)
    is_test = models.BooleanField(default=False, db_index=True)
    review_reason = models.CharField(max_length=300, blank=True)

    reservation_expires_at = models.DateTimeField(null=True, blank=True, db_index=True)
    placed_at = models.DateTimeField(auto_now_add=True, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True, db_index=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    shipped_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)

    customer_note = models.CharField(max_length=300, blank=True)
    source_cart_id = models.UUIDField(null=True, blank=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-placed_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(total_toman=F("subtotal_toman") - F("discount_toman") + F("shipping_toman")),
                name="order_total_consistent",
            ),
            models.CheckConstraint(condition=Q(discount_toman__lte=F("subtotal_toman")), name="order_discount_le_subtotal"),
            models.CheckConstraint(condition=Q(refunded_toman__lte=F("total_toman")), name="order_refund_le_total"),
            models.CheckConstraint(condition=Q(user__isnull=False) | Q(is_guest=True), name="order_owner_present"),
        ]

    def __str__(self) -> str:
        return self.number

    def delete(self, *args, **kwargs):  # type: ignore[no-untyped-def]
        raise RuntimeError("Orders are financial records and are never deleted")


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="+")
    product = models.ForeignKey("catalog.Product", on_delete=models.PROTECT, related_name="+")
    product_name = models.CharField(max_length=120)
    product_slug = models.CharField(max_length=120)
    color_name = models.CharField(max_length=40)
    color_code = models.CharField(max_length=32)
    size = models.CharField(max_length=8)
    sku = models.CharField(max_length=40)
    image_url = models.CharField(max_length=300, blank=True)
    unit_price_toman = models.PositiveBigIntegerField()
    quantity = models.PositiveSmallIntegerField()
    line_total_toman = models.PositiveBigIntegerField()
    discount_share_toman = models.PositiveBigIntegerField(default=0)
    returned_quantity = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=1) & Q(quantity__lte=50), name="order_item_qty_bounds"),
            models.CheckConstraint(
                condition=Q(line_total_toman=F("unit_price_toman") * F("quantity")), name="order_item_line_total"
            ),
            models.CheckConstraint(condition=Q(returned_quantity__lte=F("quantity")), name="order_item_returned_le_qty"),
            models.CheckConstraint(
                condition=Q(discount_share_toman__lte=F("line_total_toman")), name="order_item_discount_le_line"
            ),
        ]

    def __str__(self) -> str:
        return f"OrderItem: {self.pk}"


class StockReservation(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "فعال"
        CONSUMED = "consumed", "مصرف‌شده"
        RELEASED = "released", "آزادشده"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="reservations")
    variant = models.ForeignKey("catalog.Variant", on_delete=models.PROTECT, related_name="+")
    quantity = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=["status", "expires_at"])]
        constraints = [
            models.UniqueConstraint(fields=["order", "variant"], name="uniq_reservation_order_variant"),
        ]

    def __str__(self) -> str:
        return f"StockReservation: {self.pk}"


class OrderEvent(models.Model):
    class Kind(models.TextChoices):
        PAYMENT = "payment", "پرداخت"
        FULFILLMENT = "fulfillment", "ارسال"
        NOTE = "note", "یادداشت"
        SYSTEM = "system", "سیستم"

    id = models.BigAutoField(primary_key=True)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=12, choices=Kind.choices)
    from_status = models.CharField(max_length=20, blank=True)
    to_status = models.CharField(max_length=20, blank=True)
    message = models.CharField(max_length=300, blank=True)
    customer_visible = models.BooleanField(default=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    actor_label = models.CharField(max_length=80, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"OrderEvent: {self.pk}"


class Shipment(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="shipments")
    carrier = models.CharField(max_length=60)
    tracking_code = models.CharField(max_length=60, blank=True)
    note = models.CharField(max_length=300, blank=True)
    shipped_at = models.DateTimeField()
    delivered_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Shipment: {self.pk}"


class ReturnRequest(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "ثبت‌شده"
        APPROVED = "approved", "تأییدشده — منتظر دریافت کالا"
        REJECTED = "rejected", "ردشده"
        RECEIVED = "received", "کالا دریافت شد"
        CLOSED = "closed", "بسته‌شده"

    class Reason(models.TextChoices):
        SIZE = "size", "سایز مناسب نبود"
        DAMAGED = "damaged", "آسیب‌دیده یا معیوب"
        WRONG_ITEM = "wrong_item", "کالای اشتباه"
        NOT_AS_DESCRIBED = "not_as_described", "مطابق توضیحات نبود"
        CHANGED_MIND = "changed_mind", "انصراف از خرید"
        OTHER = "other", "سایر"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="returns")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.REQUESTED, db_index=True)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    description = models.CharField(max_length=1000, blank=True)
    staff_note = models.CharField(max_length=1000, blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    decided_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"ReturnRequest: {self.pk}"


class ReturnItem(models.Model):
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name="items")
    order_item = models.ForeignKey(OrderItem, on_delete=models.PROTECT, related_name="return_items")
    quantity = models.PositiveSmallIntegerField()
    accepted_quantity = models.PositiveSmallIntegerField(null=True, blank=True)
    restock_quantity = models.PositiveSmallIntegerField(default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=1), name="return_item_qty_positive"),
            models.CheckConstraint(
                condition=Q(accepted_quantity__isnull=True) | Q(accepted_quantity__lte=F("quantity")),
                name="return_item_accepted_le_qty",
            ),
            models.UniqueConstraint(fields=["return_request", "order_item"], name="uniq_return_item"),
        ]

    def __str__(self) -> str:
        return f"ReturnItem: {self.pk}"
