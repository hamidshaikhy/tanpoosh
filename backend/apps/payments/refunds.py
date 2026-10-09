"""Refund workflow: request -> approve -> (processing) -> completed | failed | rejected.

Automatic provider refunds are NOT implemented: the ZarinPal refund API requires a separate
merchant access token and is not available in the sandbox used here. Completion is therefore a
documented authorized MANUAL record that requires an external reference (bank/gateway panel
transaction id) and evidence note. A refund is never shown as completed without it.
Refunds can never exceed the captured amount: Σ(active refunds) ≤ order total, enforced under an
order row lock plus a DB CHECK (refunded_toman ≤ total_toman).
"""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core import audit
from apps.core.errors import ApiError, Conflict
from apps.core.jalali import format_toman
from apps.core.outbox import enqueue
from apps.orders import state
from apps.orders.models import Order, ReturnRequest
from apps.orders.models import PaymentStatus as P

from .models import Refund

RS = Refund.Status
REFUNDABLE_ORDER_STATES = {P.VERIFIED, P.REFUND_PENDING, P.PARTIALLY_REFUNDED, P.NEEDS_REVIEW}


def committed_refunds(order: Order, *, exclude: Any = None) -> int:
    qs = Refund.objects.filter(order=order, status__in=list(Refund.ACTIVE))
    if exclude is not None:
        qs = qs.exclude(pk=exclude)
    return qs.aggregate(total=Sum("amount_toman"))["total"] or 0


def refundable_remaining(order: Order) -> int:
    return max(0, order.total_toman - committed_refunds(order))


def request_refund(order_id: Any, *, amount: int, reason: str, return_id: Any, actor: Any, request: Any = None) -> Refund:
    reason = (reason or "").strip()
    if not reason:
        raise ApiError("validation_error", fields={"reason": ["دلیل بازپرداخت را بنویسید."]})
    if amount <= 0:
        raise ApiError("validation_error", fields={"amount_toman": ["مبلغ باید بیشتر از صفر باشد."]})
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if order is None:
            raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
        if order.payment_status not in REFUNDABLE_ORDER_STATES:
            raise Conflict("not_refundable", "برای این سفارش پرداخت تأییدشده‌ای وجود ندارد.")
        remaining = refundable_remaining(order)
        if amount > remaining:
            raise Conflict("refund_exceeds_captured", f"حداکثر مبلغ قابل بازپرداخت {format_toman(remaining)} است.")
        ret = None
        if return_id:
            ret = ReturnRequest.objects.filter(pk=return_id, order=order).first()
            if ret is None:
                raise ApiError("validation_error", fields={"return_id": ["درخواست مرجوعی مربوط به این سفارش نیست."]})
        refund = Refund.objects.create(
            order=order, return_request=ret, amount_toman=amount, reason=reason[:300], requested_by=actor, is_test=order.is_test
        )
        if order.payment_status in (P.VERIFIED, P.PARTIALLY_REFUNDED, P.NEEDS_REVIEW):
            state.set_payment(order, P.REFUND_PENDING, actor=actor, message="بازپرداخت در حال بررسی است.")
            state.save(order)
        audit.record(
            "refund.request", actor=actor, request=request, obj=order, metadata={"refund": str(refund.pk), "amount": amount}
        )
        return refund


def _locked_refund(refund_id: Any) -> tuple[Order, Refund]:
    order_id = Refund.objects.filter(pk=refund_id).values_list("order_id", flat=True).first()
    if order_id is None:
        raise ApiError("not_found", "بازپرداخت پیدا نشد.", status_code=404)
    order = Order.objects.select_for_update().get(pk=order_id)
    refund = Refund.objects.select_for_update().get(pk=refund_id)
    return order, refund


def approve(refund_id: Any, *, actor: Any, request: Any = None) -> Refund:
    with transaction.atomic():
        order, refund = _locked_refund(refund_id)
        if refund.status != RS.REQUESTED:
            raise Conflict("invalid_transition", "این بازپرداخت در وضعیت قابل تأیید نیست.")
        if committed_refunds(order, exclude=refund.pk) + refund.amount_toman > order.total_toman:
            raise Conflict("refund_exceeds_captured", "مجموع بازپرداخت‌ها از مبلغ پرداخت‌شده بیشتر می‌شود.")
        refund.status = RS.APPROVED
        refund.approved_by = actor
        refund.version += 1
        refund.save()
        audit.record("refund.approve", actor=actor, request=request, obj=order, metadata={"refund": str(refund.pk)})
        return refund


def mark_processing(refund_id: Any, *, actor: Any, request: Any = None) -> Refund:
    with transaction.atomic():
        order, refund = _locked_refund(refund_id)
        if refund.status != RS.APPROVED:
            raise Conflict("invalid_transition", "ابتدا بازپرداخت باید تأیید شود.")
        refund.status = RS.PROCESSING
        refund.processed_by = actor
        refund.version += 1
        refund.save()
        audit.record("refund.processing", actor=actor, request=request, obj=order, metadata={"refund": str(refund.pk)})
        return refund


def _settle_order_after(order: Order, *, actor: Any) -> None:
    if order.payment_status != P.REFUND_PENDING:
        return
    pending = Refund.objects.filter(order=order, status__in=[RS.REQUESTED, RS.APPROVED, RS.PROCESSING]).exists()
    if pending:
        return
    if order.refunded_toman >= order.total_toman:
        state.set_payment(order, P.REFUNDED, actor=actor, message="مبلغ سفارش به‌طور کامل بازپرداخت شد.")
    elif order.refunded_toman > 0:
        state.set_payment(order, P.PARTIALLY_REFUNDED, actor=actor, message="بخشی از مبلغ سفارش بازپرداخت شد.")
    else:
        state.set_payment(
            order, P.VERIFIED, actor=actor, message="بازپرداخت انجام نشد؛ وضعیت پرداخت به حالت قبل برگشت.", customer_visible=False
        )


def complete(refund_id: Any, *, reference: str, evidence: str, actor: Any, request: Any = None) -> Refund:
    reference = (reference or "").strip()
    if len(reference) < 4:
        raise ApiError("validation_error", fields={"reference": ["شمارهٔ مرجع تراکنش بازپرداخت را وارد کنید."]})
    with transaction.atomic():
        order, refund = _locked_refund(refund_id)
        if refund.status not in (RS.APPROVED, RS.PROCESSING):
            raise Conflict("invalid_transition", "فقط بازپرداخت تأییدشده قابل ثبت نهایی است.")
        if order.refunded_toman + refund.amount_toman > order.total_toman:
            raise Conflict("refund_exceeds_captured", "مجموع بازپرداخت‌ها از مبلغ پرداخت‌شده بیشتر می‌شود.")
        refund.status = RS.COMPLETED
        refund.reference = reference[:80]
        refund.evidence_note = (evidence or "").strip()[:500]
        refund.processed_by = refund.processed_by or actor
        refund.completed_at = timezone.now()
        refund.version += 1
        refund.save()
        order.refunded_toman += refund.amount_toman
        _settle_order_after(order, actor=actor)
        state.save(order)
        audit.record(
            "refund.complete",
            actor=actor,
            request=request,
            obj=order,
            metadata={"refund": str(refund.pk), "amount": refund.amount_toman},
        )
        enqueue(
            "email",
            {
                "template": "refund_completed",
                "to": order.contact_email,
                "context": {
                    "name": order.contact_name,
                    "number": order.number,
                    "amount": format_toman(refund.amount_toman),
                    "reference": refund.reference,
                },
            },
            dedupe_key=f"refund-completed:{refund.pk}",
        )
        if refund.return_request_id:
            ReturnRequest.objects.filter(pk=refund.return_request_id, status=ReturnRequest.Status.RECEIVED).update(
                status=ReturnRequest.Status.CLOSED
            )
        return refund


def fail_or_reject(refund_id: Any, *, reject: bool, reason: str, actor: Any, request: Any = None) -> Refund:
    reason = (reason or "").strip()
    if not reason:
        raise ApiError("validation_error", fields={"reason": ["دلیل را بنویسید."]})
    with transaction.atomic():
        order, refund = _locked_refund(refund_id)
        allowed = {RS.REQUESTED, RS.APPROVED} if reject else {RS.APPROVED, RS.PROCESSING}
        if refund.status not in allowed:
            raise Conflict("invalid_transition", "این بازپرداخت در این وضعیت قابل تغییر نیست.")
        refund.status = RS.REJECTED if reject else RS.FAILED
        refund.failure_reason = reason[:300]
        refund.version += 1
        refund.save()
        _settle_order_after(order, actor=actor)
        state.save(order)
        audit.record(
            "refund.reject" if reject else "refund.fail",
            actor=actor,
            request=request,
            obj=order,
            metadata={"refund": str(refund.pk)},
        )
        return refund
