"""Payment initiation, server-to-server verification, settlement and reconciliation.

Principles:
* The browser return (callback) is only a trigger. Paid state changes only after the backend
  verifies with the provider using the attempt's stored authority + provider amount.
* Network calls never run while holding DB row locks.
* Settlement is idempotent: an attempt is settled at most once; a second successful attempt on
  an already-paid order is recorded as a double payment and flagged for review (never shipped twice).
* Unknown outcomes (timeouts) stay `unknown` and are reconciled later — never marked failed.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import F as DbF
from django.utils import timezone

from apps.carts.services import remove_purchased
from apps.core import audit, ratelimit
from apps.core.errors import ApiError, Conflict
from apps.core.idempotency import IdempotentOperation
from apps.core.jalali import format_toman
from apps.core.outbox import enqueue
from apps.inventory import services as inventory
from apps.orders import state
from apps.orders.models import FulfillmentStatus as F
from apps.orders.models import Order, OrderEvent, StockReservation
from apps.orders.models import PaymentStatus as P
from apps.orders.services import extend_hold_for_payment, get_accessible_order
from apps.promotions.models import CouponRedemption

from .models import PaymentAttempt
from .providers import get_provider

logger = logging.getLogger("tanpoosh.payments")
A = PaymentAttempt.Status
PAYABLE = {P.UNPAID, P.FAILED, P.PENDING}
IN_FLIGHT = [A.CREATED, A.REDIRECTED, A.VERIFYING, A.UNKNOWN]


# --- initiation -------------------------------------------------------------------


def start_payment(request: Any, order_id: Any) -> tuple[int, dict[str, Any]]:
    ratelimit.enforce("payment_start.order", str(order_id))
    provider = get_provider()
    with transaction.atomic():
        order = get_accessible_order(request, order_id, lock=True)
        op = IdempotentOperation(request, "payment.start", {"order": str(order.pk)})
        if op.replay is not None:
            return op.replay.response_status or 200, op.replay.response_body or {}
        if order.payment_status not in PAYABLE or order.fulfillment_status != F.AWAITING_PAYMENT:
            raise Conflict("not_payable", "این سفارش در وضعیت قابل پرداخت نیست.")
        if not order.reservations.filter(status=StockReservation.Status.ACTIVE).exists() or (
            order.reservation_expires_at and order.reservation_expires_at <= timezone.now()
        ):
            raise Conflict("hold_expired", "مهلت پرداخت این سفارش به پایان رسیده است. لطفاً دوباره سفارش ثبت کنید.")
        if order.payment_attempts.filter(status=A.VERIFYING).exists():
            raise Conflict("payment_in_progress", "پرداخت قبلی در حال تأیید است؛ چند لحظه بعد وضعیت را بررسی کنید.")
        attempt = PaymentAttempt.objects.create(
            order=order,
            provider=provider.name,
            mode=provider.mode,
            amount_toman=order.total_toman,
            provider_amount=provider.provider_amount(order.total_toman),
            provider_currency=provider.currency,
        )
        record_id = op.record.pk

    result = provider.request(
        amount=attempt.provider_amount,
        description=f"سفارش {order.number} — تن‌پوش",
        callback_url=settings.PAYMENT_CALLBACK_URL,
        metadata={"mobile": order.contact_phone, "email": order.contact_email, "order_id": order.number},
    )

    from apps.core.models import IdempotencyRecord

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        attempt = PaymentAttempt.objects.select_for_update().get(pk=attempt.pk)
        record = IdempotencyRecord.objects.select_for_update().get(pk=record_id)
        if result.ok:
            attempt.authority = result.authority
            attempt.status = A.REDIRECTED
            attempt.redirected_at = timezone.now()
            attempt.fee = result.fee
            attempt.provider_code = result.code
            attempt.save()
            if order.payment_status != P.PENDING:
                state.set_payment(order, P.PENDING, message="انتقال به درگاه پرداخت.", customer_visible=False)
            extend_hold_for_payment(order)
            state.save(order)
            status_code, body = (
                200,
                {
                    "redirect_url": result.redirect_url,
                    "attempt_id": str(attempt.pk),
                    "mode": attempt.mode,
                },
            )
        else:
            attempt.status = A.REQUEST_FAILED
            attempt.provider_code = result.code
            attempt.failure_reason = result.message[:200]
            attempt.save()
            status_code, body = (
                502,
                {
                    "error": {
                        "code": "gateway_unavailable",
                        "message": "اتصال به درگاه پرداخت برقرار نشد. چند لحظه بعد دوباره تلاش کنید؛ مبلغی از حساب شما کسر نشده است.",
                        "request_id": getattr(request, "request_id", None),
                    }
                },
            )
        record.response_status = status_code
        record.response_body = body
        record.resource_id = str(attempt.pk)
        record.save(update_fields=["response_status", "response_body", "resource_id"])
    return status_code, body


# --- verification & settlement ---------------------------------------------------------


def handle_callback(authority: str, provider_name: str) -> PaymentAttempt | None:
    if not authority or len(authority) > 64:
        return None
    attempt = PaymentAttempt.objects.filter(authority=authority, provider=provider_name).first()
    if attempt is None:
        logger.warning("Callback for unknown authority")
        return None
    PaymentAttempt.objects.filter(pk=attempt.pk).update(callback_count=DbF("callback_count") + 1)
    verify_attempt(attempt.pk)
    attempt.refresh_from_db()
    return attempt


def verify_attempt(attempt_id: Any) -> str:
    with transaction.atomic():
        attempt = PaymentAttempt.objects.select_for_update().get(pk=attempt_id)
        if attempt.status in PaymentAttempt.FINAL:
            return attempt.status
        if not attempt.authority:
            return attempt.status
        if attempt.status == A.VERIFYING and attempt.updated_at > timezone.now() - timedelta(seconds=45):
            return attempt.status  # another worker is verifying right now
        attempt.status = A.VERIFYING
        attempt.check_count += 1
        attempt.last_checked_at = timezone.now()
        attempt.save(update_fields=["status", "check_count", "last_checked_at", "updated_at"])
        amount, authority = attempt.provider_amount, attempt.authority

    provider = get_provider_for(attempt)
    result = provider.verify(amount=amount, authority=authority)
    if result.status in ("verified", "already_verified"):
        settle_success(attempt_id, ref_id=result.ref_id, code=result.code, fee=result.fee)
        return A.VERIFIED
    if result.status == "failed":
        settle_failure(attempt_id, code=result.code, reason=result.message or "پرداخت ناموفق")
        return A.FAILED
    if result.status == "mismatch":
        settle_review(attempt_id, reason="مغایرت مبلغ در تأیید پرداخت", code=result.code)
        return A.UNKNOWN
    with transaction.atomic():
        attempt = PaymentAttempt.objects.select_for_update().get(pk=attempt_id)
        if attempt.status == A.VERIFYING:
            attempt.status = A.UNKNOWN
            attempt.failure_reason = (result.message or "نتیجهٔ تأیید نامشخص")[:200]
            attempt.provider_code = result.code
            attempt.save(update_fields=["status", "failure_reason", "provider_code", "updated_at"])
    return A.UNKNOWN


def get_provider_for(attempt: PaymentAttempt) -> Any:
    provider = get_provider()
    if provider.name != attempt.provider or provider.mode != attempt.mode:
        # Never verify a sandbox attempt against live (or vice versa) after a config change.
        raise ApiError("payment_config_mismatch", "پیکربندی درگاه با این تراکنش سازگار نیست.", status_code=503)
    return provider


def _lock_order_and_attempt(attempt_id: Any) -> tuple[Order, PaymentAttempt]:
    order_id = PaymentAttempt.objects.values_list("order_id", flat=True).get(pk=attempt_id)
    order = Order.objects.select_for_update().get(pk=order_id)
    attempt = PaymentAttempt.objects.select_for_update().get(pk=attempt_id)
    return order, attempt


def settle_success(attempt_id: Any, *, ref_id: str, code: int | None, fee: int | None) -> None:
    alerts: list[tuple[str, str]] = []
    with transaction.atomic():
        order, attempt = _lock_order_and_attempt(attempt_id)
        if attempt.status == A.VERIFIED:
            return
        attempt.status = A.VERIFIED
        attempt.ref_id = ref_id
        attempt.provider_code = code
        if fee is not None:
            attempt.fee = fee
        attempt.verified_at = timezone.now()
        attempt.failure_reason = ""
        attempt.save()

        if order.payment_status in (P.VERIFIED, P.REFUND_PENDING, P.PARTIALLY_REFUNDED, P.REFUNDED, P.NEEDS_REVIEW):
            # A second successful payment for an already-settled order: never fulfil twice.
            message = f"پرداخت تکراری تأیید شد (مرجع {ref_id}). نیاز به بازپرداخت مبلغ اضافه."
            if order.payment_status == P.VERIFIED:
                state.set_payment(order, P.NEEDS_REVIEW, message=message, customer_visible=False)
            else:
                OrderEvent.objects.create(
                    order=order, kind=OrderEvent.Kind.PAYMENT, message=message[:300], customer_visible=False
                )
            order.review_reason = message[:300]
            state.save(order)
            alerts.append(("پرداخت تکراری", f"سفارش {order.number}: {message}"))
        else:
            purchased = {i.variant_id: i.quantity for i in order.items.all()}
            stocks = inventory.lock_stock(list(purchased))
            active = {
                r.variant_id: r for r in order.reservations.select_for_update().filter(status=StockReservation.Status.ACTIVE)
            }
            stock_ok = True
            if len(active) == len(purchased):
                for vid, qty in purchased.items():
                    inventory.consume_reserved(stocks[vid], qty, reference=order.number)
                    active[vid].status = StockReservation.Status.CONSUMED
                    active[vid].save(update_fields=["status", "updated_at"])
            else:
                # Hold already released (late payment). Re-acquire atomically or flag for review.
                for vid, r in active.items():  # partially active holds: release then re-take uniformly
                    inventory.release(stocks[vid], r.quantity, reference=order.number, reason="تسویهٔ پرداخت دیرهنگام")
                    r.status = StockReservation.Status.RELEASED
                    r.save(update_fields=["status", "updated_at"])
                if all(stocks[vid].available >= qty for vid, qty in purchased.items()):
                    for vid, qty in purchased.items():
                        inventory.take_unreserved(stocks[vid], qty, reference=order.number, reason="پرداخت پس از انقضای رزرو")
                else:
                    stock_ok = False

            CouponRedemption.objects.filter(order=order).exclude(status=CouponRedemption.Status.CONSUMED).update(
                status=CouponRedemption.Status.CONSUMED, updated_at=timezone.now()
            )
            order.payment_mode = attempt.mode
            order.is_test = attempt.mode != "live"
            order.reservation_expires_at = None
            if stock_ok:
                state.set_payment(order, P.VERIFIED, message=f"پرداخت تأیید شد. کد پیگیری: {ref_id}")
                if order.fulfillment_status in (F.AWAITING_PAYMENT, F.CANCELLED):
                    late = order.fulfillment_status == F.CANCELLED
                    state.set_fulfillment(
                        order,
                        F.PROCESSING,
                        message="پرداخت دیرهنگام پذیرفته شد و سفارش در حال آماده‌سازی است."
                        if late
                        else "سفارش در صف آماده‌سازی قرار گرفت.",
                    )
                    if late:
                        alerts.append(
                            (
                                "پرداخت دیرهنگام پذیرفته شد",
                                f"سفارش {order.number} پس از انقضای مهلت پرداخت شد و موجودی دوباره تأمین شد.",
                            )
                        )
            else:
                reason = "پرداخت پس از انقضای رزرو تأیید شد اما موجودی کافی نیست؛ تأمین کالا یا بازپرداخت لازم است."
                state.set_payment(order, P.NEEDS_REVIEW, message=reason, customer_visible=False)
                order.review_reason = reason
                alerts.append(("پرداخت بدون موجودی", f"سفارش {order.number}: {reason}"))
            state.save(order)
            enqueue(
                "email",
                {
                    "template": "order_paid",
                    "to": order.contact_email,
                    "context": {
                        "name": order.contact_name,
                        "number": order.number,
                        "total": format_toman(order.total_toman),
                        "ref_id": ref_id,
                        "is_test": order.is_test,
                        "review": not stock_ok,
                        "items": [
                            {"name": i.product_name, "color": i.color_name, "size": i.size, "qty": i.quantity}
                            for i in order.items.all()
                        ],
                    },
                },
                dedupe_key=f"order-paid:{order.pk}",
            )
            cart_id = order.source_cart_id
            transaction.on_commit(lambda: remove_purchased(cart_id, purchased))
        audit.record("payment.verified", obj=order, metadata={"attempt": str(attempt.pk), "mode": attempt.mode, "ref_id": ref_id})
        for subject, body in alerts:
            enqueue("staff_alert", {"subject": subject, "message": body}, dedupe_key=f"alert:{subject}:{attempt.pk}")


def settle_failure(attempt_id: Any, *, code: int | None, reason: str, cancelled: bool = False) -> None:
    with transaction.atomic():
        order, attempt = _lock_order_and_attempt(attempt_id)
        if attempt.status in PaymentAttempt.FINAL:
            return
        attempt.status = A.CANCELLED if cancelled else A.FAILED
        attempt.provider_code = code
        attempt.failure_reason = reason[:200]
        attempt.save()
        others_in_flight = order.payment_attempts.exclude(pk=attempt.pk).filter(status__in=IN_FLIGHT).exists()
        if order.payment_status == P.PENDING and not others_in_flight:
            state.set_payment(order, P.FAILED, message="پرداخت انجام نشد. می‌توانید دوباره تلاش کنید.")
            state.save(order)


def settle_review(attempt_id: Any, *, reason: str, code: int | None) -> None:
    with transaction.atomic():
        order, attempt = _lock_order_and_attempt(attempt_id)
        attempt.status = A.UNKNOWN
        attempt.provider_code = code
        attempt.failure_reason = reason[:200]
        attempt.save()
        if order.payment_status in (
            P.PENDING,
            P.FAILED,
            P.UNPAID,
            P.CANCELLED,
        ) and P.NEEDS_REVIEW in state.PAYMENT_TRANSITIONS.get(order.payment_status, set()):
            state.set_payment(order, P.NEEDS_REVIEW, message=reason, customer_visible=False)
            order.review_reason = reason[:300]
            state.save(order)
        enqueue(
            "staff_alert",
            {"subject": "مغایرت پرداخت", "message": f"سفارش {order.number}: {reason}"},
            dedupe_key=f"alert:mismatch:{attempt.pk}",
        )


# --- reconciliation ------------------------------------------------------------------


def reconcile_attempt(attempt_id: Any) -> str:
    attempt = PaymentAttempt.objects.get(pk=attempt_id)
    if attempt.status in PaymentAttempt.FINAL:
        return attempt.status
    now = timezone.now()
    if not attempt.authority:
        if attempt.created_at < now - timedelta(minutes=10):
            PaymentAttempt.objects.filter(pk=attempt.pk, authority__isnull=True, status=A.CREATED).update(
                status=A.REQUEST_FAILED, failure_reason="درخواست درگاه کامل نشد"
            )
        return A.REQUEST_FAILED
    provider = get_provider_for(attempt)
    inquiry = provider.inquiry(authority=attempt.authority)
    PaymentAttempt.objects.filter(pk=attempt.pk).update(last_checked_at=now, check_count=DbF("check_count") + 1)
    if inquiry.status in ("VERIFIED", "PAID"):
        return verify_attempt(attempt.pk)
    if inquiry.status in ("FAILED", "REVERSED"):
        settle_failure(attempt.pk, code=inquiry.code, reason=f"وضعیت درگاه: {inquiry.status}")
        return A.FAILED
    started = attempt.redirected_at or attempt.created_at
    if inquiry.status == "IN_BANK" and started < now - timedelta(minutes=settings.PAYMENT_WINDOW_MINUTES + 20):
        settle_failure(attempt.pk, code=inquiry.code, reason="پرداخت در مهلت درگاه تکمیل نشد", cancelled=True)
        return A.CANCELLED
    if inquiry.status == "UNKNOWN" and attempt.check_count >= 20 and attempt.status != A.UNKNOWN:
        PaymentAttempt.objects.filter(pk=attempt.pk).update(status=A.UNKNOWN)
    return attempt.status


def reconcile_due(limit: int = 100) -> int:
    cutoff = timezone.now() - timedelta(minutes=2)
    ids = list(
        PaymentAttempt.objects.filter(status__in=IN_FLIGHT, created_at__lte=cutoff)
        .order_by("last_checked_at", "created_at")
        .values_list("pk", flat=True)[:limit]
    )
    for attempt_id in ids:
        try:
            reconcile_attempt(attempt_id)
        except Exception:  # noqa: BLE001 - one bad attempt must not stop the sweep
            logger.exception("Reconciliation failed for attempt %s", attempt_id)
    return len(ids)
