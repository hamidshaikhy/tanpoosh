"""Order placement, holds, expiry, cancellation and fulfillment transitions.

Lock ordering (to avoid deadlocks): Order row -> StockLevel rows (ascending variant id) ->
Coupon / CouponRedemption rows. Checkout locks Cart -> StockLevel -> Coupon and never touches
existing orders while holding stock locks (expired holds are swept in separate transactions
before checkout begins). Cart cleanup after payment runs in its own transaction on commit.
"""

from __future__ import annotations

import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import Address
from apps.accounts.serializers import AddressSerializer
from apps.carts.models import Cart
from apps.carts.services import get_cart
from apps.core import audit
from apps.core.errors import ApiError, Conflict
from apps.core.jalali import jalali_date_compact
from apps.core.normalize import normalize_email, normalize_mobile
from apps.core.outbox import enqueue
from apps.inventory import services as inventory
from apps.inventory.models import InventoryMovement
from apps.promotions.models import CouponRedemption

from . import state
from .models import FulfillmentStatus as F
from .models import Order, OrderEvent, OrderItem, Shipment, StockReservation
from .models import PaymentStatus as P
from .pricing import compute_quote, quote_payload

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _new_number() -> str:
    return f"TP{jalali_date_compact(timezone.now())}-" + "".join(secrets.choice(_ALPHABET) for _ in range(5))


# --- holds -------------------------------------------------------------------


def release_hold(order: Order, *, reason: str) -> None:
    """Release active reservations and a reserved coupon. Caller holds the order lock."""
    reservations = list(order.reservations.filter(status=StockReservation.Status.ACTIVE))
    if reservations:
        stocks = inventory.lock_stock([r.variant_id for r in reservations])
        for r in reservations:
            inventory.release(stocks[r.variant_id], r.quantity, reference=order.number, reason=reason)
            r.status = StockReservation.Status.RELEASED
            r.save(update_fields=["status", "updated_at"])
    CouponRedemption.objects.filter(order=order, status=CouponRedemption.Status.RESERVED).update(
        status=CouponRedemption.Status.RELEASED, updated_at=timezone.now()
    )


def extend_hold_for_payment(order: Order) -> None:
    """While the shopper is on the gateway page, keep the hold for the payment window."""
    until = timezone.now() + timedelta(minutes=settings.PAYMENT_WINDOW_MINUTES)
    order.reservations.filter(status=StockReservation.Status.ACTIVE, expires_at__lt=until).update(expires_at=until)
    if order.reservation_expires_at is None or order.reservation_expires_at < until:
        order.reservation_expires_at = until


def expire_due_orders(*, variant_ids: list[int] | None = None, limit: int = 200) -> int:
    now = timezone.now()
    qs = StockReservation.objects.filter(status=StockReservation.Status.ACTIVE, expires_at__lte=now)
    if variant_ids:
        qs = qs.filter(variant_id__in=variant_ids)
    order_ids = list(qs.values_list("order_id", flat=True).distinct()[:limit])
    expired = 0
    for order_id in order_ids:
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(pk=order_id).first()
            if order is None:
                continue
            if order.payment_attempts.filter(status="verifying", updated_at__gte=now - timedelta(minutes=5)).exists():
                continue  # a verification is in flight; let it settle first
            due = order.reservations.filter(status=StockReservation.Status.ACTIVE, expires_at__lte=timezone.now())
            if not due.exists():
                continue
            release_hold(order, reason="انقضای مهلت پرداخت")
            if order.payment_status in (P.UNPAID, P.PENDING, P.FAILED):
                state.set_payment(order, P.CANCELLED, message="مهلت پرداخت به پایان رسید و سفارش لغو شد.")
                state.set_fulfillment(order, F.CANCELLED, message="لغو خودکار به دلیل عدم پرداخت.")
            order.reservation_expires_at = None
            state.save(order)
            expired += 1
    return expired


# --- placement -----------------------------------------------------------------


def _resolve_address(request: Any, data: dict[str, Any]) -> dict[str, Any]:
    user = request.user
    if data.get("address_id"):
        if not user.is_authenticated:
            raise ApiError("validation_error", fields={"address_id": ["برای استفاده از نشانی ذخیره‌شده وارد شوید."]})
        address = Address.objects.filter(pk=data["address_id"], user=user).first()
        if address is None:
            raise ApiError("validation_error", fields={"address_id": ["نشانی انتخاب‌شده پیدا نشد."]})
        return {
            "recipient_name": address.recipient_name,
            "phone": address.phone,
            "province": address.province,
            "city": address.city,
            "postal_code": address.postal_code,
            "line": address.line,
            "plaque": address.plaque,
            "unit": address.unit,
        }
    raw = data.get("address")
    if not isinstance(raw, dict):
        raise ApiError("validation_error", fields={"address": ["نشانی تحویل را وارد کنید."]})
    serializer = AddressSerializer(data=raw)
    if not serializer.is_valid():
        raise ApiError(
            "validation_error",
            fields={f"address.{k}": [str(m) for m in v] for k, v in serializer.errors.items()},
        )
    return {
        k: serializer.validated_data.get(k, "")
        for k in ("recipient_name", "phone", "province", "city", "postal_code", "line", "plaque", "unit")
    }


def _resolve_contact(request: Any, contact: dict[str, Any]) -> dict[str, str]:
    user = request.user
    name = (contact.get("name") or "").strip()
    phone = normalize_mobile(contact.get("phone") or "")
    email = normalize_email(contact.get("email") or (user.email if user.is_authenticated else ""))
    fields: dict[str, list[str]] = {}
    if not name:
        fields["contact.name"] = ["نام و نام خانوادگی را وارد کنید."]
    if not phone:
        fields["contact.phone"] = ["شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)."]
    if not email or "@" not in email:
        fields["contact.email"] = ["ایمیل معتبر وارد کنید."]
    if fields:
        raise ApiError("validation_error", fields=fields)
    return {"name": name[:120], "phone": phone or "", "email": email}


def cart_items_for_checkout(cart: Cart) -> list[Any]:
    return list(
        cart.items.select_related("variant__product__category", "variant__color", "variant__stock")
        .prefetch_related("variant__product__media")
        .order_by("variant_id")
    )


def place_order(request: Any, data: dict[str, Any]) -> Order:
    """Must be called inside transaction.atomic() (the view wraps it with the idempotency record)."""
    user = request.user if request.user.is_authenticated else None
    contact = _resolve_contact(request, data.get("contact") or {})
    address = _resolve_address(request, data)

    cart = get_cart(request, lock=True)
    if cart is None or not cart.items.exists():
        raise ApiError("empty_cart", "سبد خرید خالی است.")
    items = cart_items_for_checkout(cart)
    stocks = inventory.lock_stock([i.variant_id for i in items])
    quote = compute_quote(
        items,
        coupon_code=data.get("coupon_code") or "",
        shipping_code=data.get("shipping_method"),
        user=user,
        email=contact["email"],
        stocks=stocks,
        lock_coupon=True,
    )
    payload = quote_payload(quote)
    if quote.coupon_error:
        raise Conflict("coupon_error", quote.coupon_error["message"], extra={"quote": payload})
    if not quote.purchasable:
        raise Conflict("quote_invalid", "برخی اقلام سبد خرید قابل خرید نیست. سبد را بررسی کنید.", extra={"quote": payload})
    if data.get("quote_fingerprint") != quote.fingerprint:
        raise Conflict(
            "quote_changed",
            "قیمت، تخفیف، هزینهٔ ارسال یا موجودی تغییر کرده است. مبلغ جدید را بررسی و دوباره تأیید کنید.",
            extra={"quote": payload},
        )

    expires = timezone.now() + timedelta(minutes=settings.RESERVATION_MINUTES)
    order = None
    for _ in range(5):
        try:
            with transaction.atomic():
                order = Order.objects.create(
                    number=_new_number(),
                    user=user,
                    is_guest=user is None,
                    contact_name=contact["name"],
                    contact_phone=contact["phone"],
                    contact_email=contact["email"],
                    ship_recipient=address["recipient_name"],
                    ship_phone=address["phone"],
                    ship_province=address["province"],
                    ship_city=address["city"],
                    ship_postal_code=address["postal_code"],
                    ship_line=address["line"],
                    ship_plaque=address.get("plaque") or "",
                    ship_unit=address.get("unit") or "",
                    shipping_method_code=quote.shipping_method.code,  # type: ignore[union-attr]
                    shipping_method_name=quote.shipping_method.name,  # type: ignore[union-attr]
                    subtotal_toman=quote.subtotal,
                    discount_toman=quote.discount,
                    shipping_toman=quote.shipping_fee,
                    total_toman=quote.total,
                    currency=settings.CURRENCY,
                    coupon_code=quote.coupon_code,
                    reservation_expires_at=expires,
                    customer_note=(data.get("note") or "")[:300],
                    source_cart_id=cart.pk,
                    is_test=settings.PAYMENT_PROVIDER == "mock" or settings.ZARINPAL_MODE != "live",
                )
            break
        except IntegrityError:
            continue
    if order is None:
        raise ApiError("server_error", status_code=500)

    for line in quote.lines:
        v = line.variant
        media = list(v.product.media.all())
        image = next((m for m in media if m.color_id == v.color_id), media[0] if media else None)
        OrderItem.objects.create(
            order=order,
            variant=v,
            product=v.product,
            product_name=v.product.name,
            product_slug=v.product.slug,
            color_name=v.color.name,
            color_code=v.color.code,
            size=v.size,
            sku=v.sku,
            image_url=image.thumb.url if image else "",
            unit_price_toman=line.unit_price,
            quantity=line.quantity,
            line_total_toman=line.line_total,
            discount_share_toman=line.discount_share,
        )
        inventory.reserve(stocks[v.pk], line.quantity, reference=order.number)
        StockReservation.objects.create(order=order, variant=v, quantity=line.quantity, expires_at=expires)

    if quote.coupon:
        CouponRedemption.objects.create(
            coupon=quote.coupon,
            order=order,
            user=user,
            email=contact["email"],
            discount_toman=quote.discount,
            status=CouponRedemption.Status.RESERVED,
        )

    OrderEvent.objects.create(
        order=order, kind=OrderEvent.Kind.SYSTEM, to_status=P.UNPAID, message="سفارش ثبت شد و کالاها برای پرداخت رزرو شدند."
    )

    if (
        user is not None
        and data.get("save_address")
        and not data.get("address_id")
        and Address.objects.filter(user=user).count() < 20
    ):
        Address.objects.create(
            user=user,
            is_default=not Address.objects.filter(user=user).exists(),
            **{
                "recipient_name": address["recipient_name"],
                "phone": address["phone"],
                "province": address["province"],
                "city": address["city"],
                "postal_code": address["postal_code"],
                "line": address["line"],
                "plaque": address.get("plaque") or "",
                "unit": address.get("unit") or "",
            },
        )
    if user is None:
        remember_guest_order(request, order)
    return order


def remember_guest_order(request: Any, order: Order) -> None:
    ids = [i for i in request.session.get("guest_orders", []) if i != str(order.pk)]
    ids.append(str(order.pk))
    request.session["guest_orders"] = ids[-20:]


# --- access ---------------------------------------------------------------------


def accessible_orders(request: Any):  # type: ignore[no-untyped-def]
    user = request.user
    guest_ids = request.session.get("guest_orders", [])
    if user.is_authenticated:
        from django.db.models import Q

        return Order.objects.filter(Q(user=user) | Q(pk__in=guest_ids, is_guest=True))
    return Order.objects.filter(pk__in=guest_ids, is_guest=True)


def get_accessible_order(request: Any, order_id: Any, *, lock: bool = False) -> Order:
    qs = accessible_orders(request)
    if lock:
        qs = qs.select_for_update()
    try:
        order = qs.filter(pk=order_id).first()
    except (ValueError, Exception):  # noqa: BLE001 - malformed UUID
        order = None
    if order is None:
        raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
    return order


# --- customer cancel ---------------------------------------------------------------


def cancel_unpaid(request: Any, order_id: Any) -> Order:
    with transaction.atomic():
        order = get_accessible_order(request, order_id, lock=True)
        if order.payment_status not in (P.UNPAID, P.FAILED) or order.fulfillment_status != F.AWAITING_PAYMENT:
            raise Conflict(
                "not_cancellable",
                "این سفارش قابل لغو نیست. برای سفارش‌های پرداخت‌شده از درخواست مرجوعی یا پشتیبانی استفاده کنید.",
            )
        if order.payment_attempts.filter(status__in=["verifying", "unknown"]).exists():
            raise Conflict("payment_in_progress", "وضعیت پرداخت این سفارش در حال بررسی است؛ کمی بعد دوباره تلاش کنید.")
        release_hold(order, reason="لغو توسط مشتری")
        state.set_payment(order, P.CANCELLED, actor=request.user, message="سفارش توسط مشتری لغو شد.")
        state.set_fulfillment(order, F.CANCELLED, actor=request.user, message="لغو توسط مشتری.")
        order.reservation_expires_at = None
        state.save(order)
        return order


# --- staff fulfillment ---------------------------------------------------------------


def staff_fulfillment_action(order_id: Any, action: str, *, actor: Any, data: dict[str, Any], request: Any = None) -> Order:
    if action not in state.STAFF_FULFILLMENT_ACTIONS:
        raise ApiError("validation_error", fields={"action": ["عملیات معتبر نیست."]})
    expected_from, target = state.STAFF_FULFILLMENT_ACTIONS[action]
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:
            raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
        if data.get("version") is not None and int(data["version"]) != order.version:
            raise Conflict("stale_version", "این سفارش در همین فاصله تغییر کرده است. صفحه را تازه کنید.")
        if order.payment_status != P.VERIFIED:
            raise Conflict("payment_not_verified", "فقط سفارش‌های با پرداخت تأییدشده قابل پردازش هستند.")
        if order.fulfillment_status != expected_from:
            raise Conflict("invalid_transition", "وضعیت فعلی سفارش اجازهٔ این عملیات را نمی‌دهد.")
        message = (data.get("note") or "").strip()[:300]
        if action == "ship":
            carrier = (data.get("carrier") or "").strip()
            if not carrier:
                raise ApiError("validation_error", fields={"carrier": ["نام شرکت حمل را وارد کنید."]})
            Shipment.objects.create(
                order=order,
                carrier=carrier[:60],
                tracking_code=(data.get("tracking_code") or "").strip()[:60],
                note=message,
                shipped_at=timezone.now(),
                created_by=actor,
            )
            message = message or f"مرسوله با {carrier} ارسال شد."
        if action == "deliver":
            order.shipments.filter(delivered_at__isnull=True).update(delivered_at=timezone.now())
        state.set_fulfillment(
            order,
            target,
            actor=actor,
            message=message
            or {
                "pack": "سفارش بسته‌بندی شد.",
                "unpack": "بسته‌بندی برای اصلاح باز شد.",
                "deliver": "سفارش تحویل شد.",
            }.get(action, ""),
        )
        state.save(order)
        audit.record(f"order.{action}", actor=actor, request=request, obj=order, metadata={"to": target})
        if action == "ship":
            shipment = order.shipments.order_by("-created_at").first()
            enqueue(
                "email",
                {
                    "template": "order_shipped",
                    "to": order.contact_email,
                    "context": {
                        "name": order.contact_name,
                        "number": order.number,
                        "carrier": shipment.carrier if shipment else "",
                        "tracking": shipment.tracking_code if shipment else "",
                    },
                },
                dedupe_key=f"order-shipped:{order.pk}:{shipment.pk if shipment else 0}",
            )
        return order


def staff_cancel(order_id: Any, *, actor: Any, reason: str, request: Any = None) -> Order:
    """Cancel before shipment. Unpaid: release hold. Paid: restock consumed goods and open a
    refund request for the captured amount (money is never 'refunded' by this action)."""
    from apps.payments.models import Refund

    reason = (reason or "").strip()
    if not reason:
        raise ApiError("validation_error", fields={"reason": ["دلیل لغو را بنویسید."]})
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:
            raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
        if order.fulfillment_status not in (F.AWAITING_PAYMENT, F.PROCESSING, F.PACKED):
            raise Conflict("not_cancellable", "سفارش ارسال‌شده قابل لغو نیست؛ از مسیر مرجوعی استفاده کنید.")
        if order.payment_status in (P.UNPAID, P.FAILED, P.PENDING):
            if order.payment_attempts.filter(status__in=["verifying", "unknown", "redirected"]).exists():
                raise Conflict("payment_in_progress", "پرداخت این سفارش در جریان است؛ پس از روشن شدن وضعیت پرداخت اقدام کنید.")
            release_hold(order, reason=f"لغو توسط کارکنان: {reason}")
            state.set_payment(order, P.CANCELLED, actor=actor, message=reason)
            state.set_fulfillment(order, F.CANCELLED, actor=actor, message=reason)
        elif order.payment_status == P.VERIFIED:
            stocks = inventory.lock_stock([i.variant_id for i in order.items.all()])
            for item in order.items.all():
                inventory.restock(
                    stocks[item.variant_id],
                    item.quantity,
                    kind=InventoryMovement.Kind.CANCEL_RESTOCK,
                    reference=order.number,
                    actor=actor,
                    reason=reason,
                )
            state.set_fulfillment(order, F.CANCELLED, actor=actor, message=reason)
            state.set_payment(order, P.REFUND_PENDING, actor=actor, message="سفارش پرداخت‌شده لغو شد؛ بازپرداخت باید انجام شود.")
            Refund.objects.create(
                order=order,
                amount_toman=order.total_toman - order.refunded_toman,
                reason=f"لغو سفارش: {reason}"[:300],
                requested_by=actor,
                is_test=order.is_test,
            )
        else:
            raise Conflict("not_cancellable", "وضعیت پرداخت این سفارش اجازهٔ لغو را نمی‌دهد.")
        order.reservation_expires_at = None
        state.save(order)
        audit.record("order.cancel", actor=actor, request=request, obj=order, metadata={"reason": reason})
        enqueue(
            "email",
            {
                "template": "order_cancelled",
                "to": order.contact_email,
                "context": {"name": order.contact_name, "number": order.number, "reason": reason},
            },
            dedupe_key=f"order-cancelled:{order.pk}",
        )
        return order
