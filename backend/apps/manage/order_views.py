from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.permissions import require_recent_reauth
from apps.core import audit, ratelimit
from apps.core.errors import ApiError, Conflict
from apps.core.jalali import TEHRAN
from apps.core.text import PlainTextField
from apps.inventory import services as inventory
from apps.inventory.models import InventoryMovement
from apps.orders import returns as returns_svc
from apps.orders import services as order_svc
from apps.orders import state
from apps.orders.models import FulfillmentStatus as F
from apps.orders.models import Order, OrderEvent, ReturnRequest
from apps.orders.models import PaymentStatus as P
from apps.orders.payloads import order_detail
from apps.payments import refunds as refund_svc
from apps.payments import services as pay_svc
from apps.payments.models import PaymentAttempt, Refund

from .base import ManageView, csv_response


def _mode_filter(qs: Any, mode: str | None, field_prefix: str = "") -> Any:
    if mode == "live":
        return qs.filter(**{f"{field_prefix}is_test": False})
    if mode == "test":
        return qs.filter(**{f"{field_prefix}is_test": True})
    return qs


def _parse_date(value: str | None, *, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        day = datetime.strptime(value[:10], "%Y-%m-%d").date()
    except ValueError:
        raise ApiError("validation_error", fields={"date": ["تاریخ معتبر نیست (YYYY-MM-DD)."]}) from None
    moment = datetime.combine(day, time.max if end else time.min, tzinfo=TEHRAN)
    return moment


def order_row(o: Order) -> dict[str, Any]:
    return {
        "id": str(o.pk),
        "number": o.number,
        "placed_at": o.placed_at,
        "contact_name": o.contact_name,
        "city": o.ship_city,
        "total_toman": o.total_toman,
        "payment_status": o.payment_status,
        "payment_status_label": P(o.payment_status).label,
        "fulfillment_status": o.fulfillment_status,
        "fulfillment_status_label": F(o.fulfillment_status).label,
        "is_test": o.is_test,
        "is_guest": o.is_guest,
        "item_count": sum(i.quantity for i in o.items.all()),
    }


class OrderListView(ManageView):
    permission_map = {"GET": "orders.view"}

    def get(self, request: Request) -> Response:
        qs = Order.objects.prefetch_related("items").order_by("-placed_at")
        params = request.query_params
        if params.get("payment_status") in P.values:
            qs = qs.filter(payment_status=params["payment_status"])
        if params.get("fulfillment_status") in F.values:
            qs = qs.filter(fulfillment_status=params["fulfillment_status"])
        qs = _mode_filter(qs, params.get("mode"))
        start, end = _parse_date(params.get("from")), _parse_date(params.get("to"), end=True)
        if start:
            qs = qs.filter(placed_at__gte=start)
        if end:
            qs = qs.filter(placed_at__lte=end)
        q = str(params.get("q", "")).strip()[:60]
        if q:
            qs = qs.filter(
                Q(number__icontains=q)
                | Q(contact_name__icontains=q)
                | Q(contact_email__icontains=q.lower())
                | Q(contact_phone__icontains=q)
            )
        return self.paginate(qs, order_row)


def _staff_detail(order_id: Any) -> dict[str, Any]:
    order = (
        Order.objects.prefetch_related("items", "events", "shipments", "returns__items", "payment_attempts", "refunds")
        .filter(pk=order_id)
        .first()
    )
    if order is None:
        raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
    return order_detail(order, staff=True)


class OrderDetailView(ManageView):
    permission_map = {"GET": "orders.view"}

    def get(self, request: Request, order_id: str) -> Response:
        return Response(_staff_detail(order_id))


class FulfillmentSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=list(state.STAFF_FULFILLMENT_ACTIONS))
    carrier = PlainTextField(max_length=60, required=False)
    tracking_code = serializers.RegexField(r"^[A-Za-z0-9\-]{0,60}$", required=False, allow_blank=True)
    note = PlainTextField(max_length=300, required=False)
    version = serializers.IntegerField(required=False)


class OrderFulfillmentView(ManageView):
    permission_map = {"POST": "orders.fulfill"}

    def post(self, request: Request, order_id: str) -> Response:
        data = FulfillmentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        order_svc.staff_fulfillment_action(
            order_id, data.validated_data["action"], actor=request.user, data=data.validated_data, request=request
        )
        return Response(_staff_detail(order_id))


class OrderCancelView(ManageView):
    permission_map = {"POST": "orders.cancel"}

    def post(self, request: Request, order_id: str) -> Response:
        reason = str(request.data.get("reason", ""))[:300]
        order_svc.staff_cancel(order_id, actor=request.user, reason=reason, request=request)
        return Response(_staff_detail(order_id))


class OrderNoteView(ManageView):
    permission_map = {"POST": "orders.fulfill"}

    def post(self, request: Request, order_id: str) -> Response:
        message = PlainTextField(max_length=300, allow_blank=False).run_validation(request.data.get("message", ""))
        order = Order.objects.filter(pk=order_id).first()
        if order is None:
            raise ApiError("not_found", status_code=404)
        OrderEvent.objects.create(
            order=order,
            kind=OrderEvent.Kind.NOTE,
            message=message,
            customer_visible=False,
            actor=request.user,
            actor_label=request.user.username,
        )
        return Response(_staff_detail(order_id))


class ResolveReviewView(ManageView):
    """Resolve a payment that needs review (late payment without stock, double payment,
    amount mismatch). 'accept' re-acquires stock if it was never deducted; 'refund' opens a
    refund request. Never edits amounts or provider references."""

    permission_map = {"POST": "payments.reconcile"}

    def post(self, request: Request, order_id: str) -> Response:
        require_recent_reauth(request._request)
        action = request.data.get("action")
        note = PlainTextField(max_length=300, allow_blank=False).run_validation(request.data.get("note", ""))
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(pk=order_id).first()
            if order is None:
                raise ApiError("not_found", status_code=404)
            if order.payment_status != P.NEEDS_REVIEW:
                raise Conflict("invalid_transition", "این سفارش در وضعیت «نیازمند بررسی» نیست.")
            if not order.payment_attempts.filter(status=PaymentAttempt.Status.VERIFIED).exists():
                raise Conflict("no_verified_payment", "برای این سفارش پرداخت تأییدشده‌ای ثبت نشده است.")
            if action == "accept":
                deducted = InventoryMovement.objects.filter(
                    reference=order.number, kind__in=[InventoryMovement.Kind.SALE, InventoryMovement.Kind.LATE_SALE]
                ).exists()
                if not deducted:
                    items = {i.variant_id: i.quantity for i in order.items.all()}
                    stocks = inventory.lock_stock(list(items))
                    if not all(stocks[v].available >= q for v, q in items.items()):
                        raise Conflict(
                            "insufficient_stock",
                            "موجودی کافی برای تأمین این سفارش نیست؛ موجودی را افزایش دهید یا بازپرداخت کنید.",
                        )
                    for v, q in items.items():
                        inventory.take_unreserved(stocks[v], q, reference=order.number, reason=f"تأیید دستی پرداخت: {note}")
                state.set_payment(order, P.VERIFIED, actor=request.user, message=f"بررسی پرداخت انجام و تأیید شد. {note}")
                if order.fulfillment_status in (F.AWAITING_PAYMENT, F.CANCELLED):
                    state.set_fulfillment(order, F.PROCESSING, actor=request.user, message="سفارش برای آماده‌سازی آزاد شد.")
                order.review_reason = ""
                state.save(order)
            elif action == "refund":
                remaining = refund_svc.refundable_remaining(order)
                if remaining <= 0:
                    raise Conflict("not_refundable", "مبلغی برای بازپرداخت باقی نمانده است.")
                state.set_payment(order, P.REFUND_PENDING, actor=request.user, message=f"تصمیم به بازپرداخت: {note}")
                Refund.objects.create(
                    order=order,
                    amount_toman=remaining,
                    reason=f"نتیجهٔ بررسی پرداخت: {note}"[:300],
                    requested_by=request.user,
                    is_test=order.is_test,
                )
                state.save(order)
            else:
                raise ApiError("validation_error", fields={"action": ["عملیات معتبر نیست."]})
            audit.record("payment.review_resolved", request=request, obj=order, metadata={"action": action})
        return Response(_staff_detail(order_id))


# --- payments ---------------------------------------------------------------------


def attempt_row(a: PaymentAttempt) -> dict[str, Any]:
    return {
        "id": str(a.pk),
        "order_id": str(a.order_id),
        "order_number": a.order.number,
        "provider": a.provider,
        "mode": a.mode,
        "status": a.status,
        "status_label": a.get_status_display(),
        "amount_toman": a.amount_toman,
        "provider_amount": a.provider_amount,
        "provider_currency": a.provider_currency,
        "ref_id": a.ref_id,
        "authority": a.authority,
        "provider_code": a.provider_code,
        "failure_reason": a.failure_reason,
        "created_at": a.created_at,
        "verified_at": a.verified_at,
        "last_checked_at": a.last_checked_at,
        "check_count": a.check_count,
    }


class PaymentListView(ManageView):
    permission_map = {"GET": "payments.view"}

    def get(self, request: Request) -> Response:
        qs = PaymentAttempt.objects.select_related("order").order_by("-created_at")
        params = request.query_params
        if params.get("status") in PaymentAttempt.Status.values:
            qs = qs.filter(status=params["status"])
        if params.get("mode") in ("sandbox", "live", "mock"):
            qs = qs.filter(mode=params["mode"])
        q = str(params.get("q", "")).strip()[:60]
        if q:
            qs = qs.filter(Q(order__number__icontains=q) | Q(ref_id__icontains=q) | Q(authority__icontains=q))
        return self.paginate(qs, attempt_row)


class PaymentReconcileView(ManageView):
    permission_map = {"POST": "payments.reconcile"}

    def post(self, request: Request, attempt_id: str) -> Response:
        attempt = PaymentAttempt.objects.select_related("order").filter(pk=attempt_id).first()
        if attempt is None:
            raise ApiError("not_found", status_code=404)
        outcome = pay_svc.reconcile_attempt(attempt.pk)
        audit.record(
            "payment.reconcile", request=request, obj=attempt.order, metadata={"attempt": str(attempt.pk), "outcome": outcome}
        )
        attempt.refresh_from_db()
        return Response(attempt_row(attempt))


class PaymentReconcileAllView(ManageView):
    permission_map = {"POST": "payments.reconcile"}

    def post(self, request: Request) -> Response:
        count = pay_svc.reconcile_due(limit=50)
        audit.record("payment.reconcile_all", request=request, metadata={"count": count})
        return Response({"checked": count})


class PaymentExportView(ManageView):
    permission_map = {"GET": "payments.export"}

    def get(self, request: Request) -> Any:
        require_recent_reauth(request._request)
        ratelimit.enforce("export.user", str(request.user.pk))
        params = request.query_params
        start = _parse_date(params.get("from")) or timezone.now() - timedelta(days=31)
        end = _parse_date(params.get("to"), end=True) or timezone.now()
        if end - start > timedelta(days=366):
            raise ApiError("validation_error", fields={"to": ["بازهٔ خروجی حداکثر یک سال است."]})
        qs = (
            PaymentAttempt.objects.select_related("order")
            .filter(created_at__gte=start, created_at__lte=end)
            .order_by("created_at")
        )
        if params.get("mode") in ("sandbox", "live", "mock"):
            qs = qs.filter(mode=params["mode"])
        rows = (
            [
                a.order.number,
                a.created_at.astimezone(TEHRAN).strftime("%Y-%m-%d %H:%M"),
                a.mode,
                a.get_status_display(),
                a.amount_toman,
                a.ref_id,
                a.order.ship_city,
            ]
            for a in qs[:5000]
        )
        audit.record("payment.export", request=request, metadata={"from": str(start.date()), "to": str(end.date())})
        return csv_response(
            "tanpoosh-payments.csv",
            ["شماره سفارش", "زمان (تهران)", "حالت", "وضعیت", "مبلغ (تومان)", "کد پیگیری", "شهر"],
            rows,
        )


# --- refunds ------------------------------------------------------------------------


def refund_row(r: Refund) -> dict[str, Any]:
    return {
        "id": str(r.pk),
        "order_id": str(r.order_id),
        "order_number": r.order.number,
        "amount_toman": r.amount_toman,
        "status": r.status,
        "status_label": r.get_status_display(),
        "method": r.method,
        "reason": r.reason,
        "reference": r.reference,
        "evidence_note": r.evidence_note,
        "failure_reason": r.failure_reason,
        "is_test": r.is_test,
        "created_at": r.created_at,
        "completed_at": r.completed_at,
        "requested_by": r.requested_by.username if r.requested_by else "",
        "approved_by": r.approved_by.username if r.approved_by else "",
        "version": r.version,
    }


class RefundListView(ManageView):
    permission_map = {"GET": "payments.view"}

    def get(self, request: Request) -> Response:
        qs = Refund.objects.select_related("order", "requested_by", "approved_by").order_by("-created_at")
        if request.query_params.get("status") in Refund.Status.values:
            qs = qs.filter(status=request.query_params["status"])
        return self.paginate(qs, refund_row)


class RefundCreateSerializer(serializers.Serializer):
    amount_toman = serializers.IntegerField(min_value=1, max_value=100_000_000)
    reason = PlainTextField(max_length=300, allow_blank=False)
    return_id = serializers.UUIDField(required=False, allow_null=True)


class OrderRefundCreateView(ManageView):
    permission_map = {"POST": "refunds.manage"}

    def post(self, request: Request, order_id: str) -> Response:
        require_recent_reauth(request._request)
        data = RefundCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        refund_svc.request_refund(
            order_id,
            amount=data.validated_data["amount_toman"],
            reason=data.validated_data["reason"],
            return_id=data.validated_data.get("return_id"),
            actor=request.user,
            request=request,
        )
        return Response(_staff_detail(order_id), status=status.HTTP_201_CREATED)


class RefundActionView(ManageView):
    permission_map = {"POST": "refunds.manage"}

    def post(self, request: Request, refund_id: str, action: str) -> Response:
        require_recent_reauth(request._request)
        actor = request.user
        if action == "approve":
            refund = refund_svc.approve(refund_id, actor=actor, request=request)
        elif action == "processing":
            refund = refund_svc.mark_processing(refund_id, actor=actor, request=request)
        elif action == "complete":
            refund = refund_svc.complete(
                refund_id,
                reference=str(request.data.get("reference", ""))[:80],
                evidence=str(request.data.get("evidence_note", ""))[:500],
                actor=actor,
                request=request,
            )
        elif action in ("fail", "reject"):
            refund = refund_svc.fail_or_reject(
                refund_id,
                reject=action == "reject",
                reason=str(request.data.get("reason", ""))[:300],
                actor=actor,
                request=request,
            )
        else:
            raise ApiError("not_found", status_code=404)
        refund = Refund.objects.select_related("order", "requested_by", "approved_by").get(pk=refund.pk)
        return Response(refund_row(refund))


# --- returns -----------------------------------------------------------------------


def return_row(r: ReturnRequest) -> dict[str, Any]:
    return {
        "id": str(r.pk),
        "order_id": str(r.order_id),
        "order_number": r.order.number,
        "status": r.status,
        "status_label": r.get_status_display(),
        "reason": r.reason,
        "reason_label": r.get_reason_display(),
        "description": r.description,
        "staff_note": r.staff_note,
        "created_at": r.created_at,
        "decided_at": r.decided_at,
        "received_at": r.received_at,
        "suggested_refund_toman": returns_svc.suggested_refund(r),
        "items": [
            {
                "id": ri.pk,
                "order_item_id": ri.order_item_id,
                "product_name": ri.order_item.product_name,
                "color_name": ri.order_item.color_name,
                "size": ri.order_item.size,
                "sku": ri.order_item.sku,
                "quantity": ri.quantity,
                "accepted_quantity": ri.accepted_quantity,
                "restock_quantity": ri.restock_quantity,
            }
            for ri in r.items.select_related("order_item")
        ],
    }


class ReturnListView(ManageView):
    permission_map = {"GET": "returns.view"}

    def get(self, request: Request) -> Response:
        qs = ReturnRequest.objects.select_related("order").order_by("-created_at")
        if request.query_params.get("status") in ReturnRequest.Status.values:
            qs = qs.filter(status=request.query_params["status"])
        return self.paginate(qs, return_row)


class ReturnDetailView(ManageView):
    permission_map = {"GET": "returns.view"}

    def get(self, request: Request, return_id: str) -> Response:
        r = ReturnRequest.objects.select_related("order").filter(pk=return_id).first()
        if r is None:
            raise ApiError("not_found", status_code=404)
        return Response(return_row(r))


class ReturnDecideView(ManageView):
    permission_map = {"POST": "returns.manage"}

    def post(self, request: Request, return_id: str) -> Response:
        approve = request.data.get("approve")
        if not isinstance(approve, bool):
            raise ApiError("validation_error", fields={"approve": ["تأیید یا رد را مشخص کنید."]})
        r = returns_svc.decide(
            return_id, approve=approve, note=str(request.data.get("note", ""))[:1000], actor=request.user, request=request
        )
        return Response(return_row(ReturnRequest.objects.select_related("order").get(pk=r.pk)))


class ReturnReceiveView(ManageView):
    permission_map = {"POST": "returns.manage"}

    def post(self, request: Request, return_id: str) -> Response:
        items = request.data.get("items")
        if not isinstance(items, list):
            raise ApiError("validation_error", fields={"items": ["اقلام دریافتی را مشخص کنید."]})
        r = returns_svc.receive(
            return_id, lines=items, note=str(request.data.get("note", ""))[:1000], actor=request.user, request=request
        )
        return Response(return_row(ReturnRequest.objects.select_related("order").get(pk=r.pk)))
