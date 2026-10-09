"""Customer return requests and staff handling. Restocking follows what staff actually accept
as restockable on receipt — never automatically because a refund or request exists."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core import audit, ratelimit
from apps.core.errors import ApiError, Conflict
from apps.core.outbox import enqueue
from apps.core.text import clean_plain
from apps.inventory import services as inventory
from apps.inventory.models import InventoryMovement

from . import state
from .models import FulfillmentStatus as F
from .models import Order, OrderEvent, OrderItem, ReturnItem, ReturnRequest
from .services import get_accessible_order

R = ReturnRequest.Status


def requested_quantity(item: OrderItem, *, exclude_return: Any = None) -> int:
    qs = ReturnItem.objects.filter(order_item=item).exclude(return_request__status=R.REJECTED)
    if exclude_return is not None:
        qs = qs.exclude(return_request=exclude_return)
    return qs.aggregate(total=Sum("quantity"))["total"] or 0


def return_deadline(order: Order):  # type: ignore[no-untyped-def]
    if order.delivered_at is None:
        return None
    return order.delivered_at + timedelta(days=settings.RETURN_WINDOW_DAYS)


def returnable_items(order: Order) -> list[dict[str, Any]]:
    out = []
    for item in order.items.all():
        remaining = item.quantity - requested_quantity(item)
        out.append({"order_item_id": item.pk, "remaining": max(0, remaining)})
    return out


def can_request_return(order: Order) -> bool:
    deadline = return_deadline(order)
    return (
        order.fulfillment_status == F.DELIVERED
        and deadline is not None
        and timezone.now() <= deadline
        and any(r["remaining"] > 0 for r in returnable_items(order))
    )


def create_return(request: Any, order_id: Any, data: dict[str, Any]) -> ReturnRequest:
    actor_key = str(request.user.pk) if request.user.is_authenticated else request.session.session_key or "anon"
    ratelimit.enforce("return.user", actor_key)
    reason = data.get("reason")
    if reason not in ReturnRequest.Reason.values:
        raise ApiError("validation_error", fields={"reason": ["دلیل مرجوعی را انتخاب کنید."]})
    description = clean_plain(data.get("description") or "", max_length=1000, multiline=True)
    lines = data.get("items") or []
    if not lines or len(lines) > 30:
        raise ApiError("validation_error", fields={"items": ["کالاهای مرجوعی را انتخاب کنید."]})
    with transaction.atomic():
        order = get_accessible_order(request, order_id, lock=True)
        deadline = return_deadline(order)
        if order.fulfillment_status != F.DELIVERED or deadline is None:
            raise Conflict("not_returnable", "فقط سفارش‌های تحویل‌شده قابل مرجوع هستند.")
        if timezone.now() > deadline:
            raise Conflict(
                "return_window_closed", f"مهلت {settings.RETURN_WINDOW_DAYS} روزهٔ مرجوعی این سفارش به پایان رسیده است."
            )
        items = {i.pk: i for i in order.items.select_for_update()}
        errors: dict[str, list[str]] = {}
        parsed: list[tuple[OrderItem, int]] = []
        seen: set[int] = set()
        for index, line in enumerate(lines):
            try:
                item_id = int(line.get("order_item_id"))
                qty = int(line.get("quantity"))
            except (TypeError, ValueError, AttributeError):
                errors[f"items.{index}"] = ["مقدار نامعتبر است."]
                continue
            item = items.get(item_id)
            if item is None or item_id in seen:
                errors[f"items.{index}"] = ["این کالا در سفارش نیست."]
                continue
            seen.add(item_id)
            remaining = item.quantity - requested_quantity(item)
            if qty < 1 or qty > remaining:
                errors[f"items.{index}"] = [f"حداکثر {remaining} عدد از این کالا قابل مرجوع است."]
                continue
            parsed.append((item, qty))
        if errors:
            raise ApiError("validation_error", fields=errors)
        ret = ReturnRequest.objects.create(
            order=order,
            user=request.user if request.user.is_authenticated else None,
            reason=reason,
            description=description,
        )
        for item, qty in parsed:
            ReturnItem.objects.create(return_request=ret, order_item=item, quantity=qty)
        OrderEvent.objects.create(order=order, kind=OrderEvent.Kind.NOTE, message="درخواست مرجوعی ثبت شد.")
        enqueue(
            "email",
            {
                "template": "return_update",
                "to": order.contact_email,
                "context": {"name": order.contact_name, "number": order.number, "status": ret.get_status_display()},
            },
            dedupe_key=f"return:{ret.pk}:requested",
        )
        return ret


def _get_locked(return_id: Any) -> ReturnRequest:
    ret = ReturnRequest.objects.select_for_update().select_related("order").filter(pk=return_id).first()
    if ret is None:
        raise ApiError("not_found", "درخواست مرجوعی پیدا نشد.", status_code=404)
    return ret


def decide(return_id: Any, *, approve: bool, note: str, actor: Any, request: Any = None) -> ReturnRequest:
    with transaction.atomic():
        ret = _get_locked(return_id)
        if ret.status != R.REQUESTED:
            raise Conflict("invalid_transition", "این درخواست قبلاً بررسی شده است.")
        ret.status = R.APPROVED if approve else R.REJECTED
        ret.staff_note = clean_plain(note, max_length=1000, multiline=True)
        ret.decided_by = actor
        ret.decided_at = timezone.now()
        ret.version += 1
        ret.save()
        OrderEvent.objects.create(
            order=ret.order,
            kind=OrderEvent.Kind.NOTE,
            actor=actor,
            actor_label=actor.username,
            message="درخواست مرجوعی تأیید شد؛ لطفاً کالا را ارسال کنید." if approve else "درخواست مرجوعی رد شد.",
        )
        audit.record(
            "return.approve" if approve else "return.reject",
            actor=actor,
            request=request,
            obj=ret.order,
            metadata={"return": str(ret.pk)},
        )
        enqueue(
            "email",
            {
                "template": "return_update",
                "to": ret.order.contact_email,
                "context": {
                    "name": ret.order.contact_name,
                    "number": ret.order.number,
                    "status": ret.get_status_display(),
                    "note": ret.staff_note,
                },
            },
            dedupe_key=f"return:{ret.pk}:{ret.status}",
        )
        return ret


def receive(return_id: Any, *, lines: list[dict[str, Any]], note: str, actor: Any, request: Any = None) -> ReturnRequest:
    with transaction.atomic():
        ret = _get_locked(return_id)
        if ret.status != R.APPROVED:
            raise Conflict("invalid_transition", "فقط درخواست‌های تأییدشده قابل ثبت دریافت هستند.")
        order = Order.objects.select_for_update().get(pk=ret.order_id)
        items = {ri.pk: ri for ri in ret.items.select_related("order_item")}
        decisions: dict[int, tuple[int, int]] = {}
        for line in lines:
            try:
                rid = int(line["return_item_id"])
                accepted = int(line["accepted_quantity"])
                restock_qty = int(line.get("restock_quantity", 0))
            except (KeyError, TypeError, ValueError):
                raise ApiError("validation_error", fields={"items": ["مقادیر دریافت نامعتبر است."]}) from None
            ri = items.get(rid)
            if ri is None or not 0 <= accepted <= ri.quantity or not 0 <= restock_qty <= accepted:
                raise ApiError("validation_error", fields={f"items.{rid}": ["تعداد پذیرفته/قابل فروش معتبر نیست."]})
            decisions[rid] = (accepted, restock_qty)
        if set(decisions) != set(items):
            raise ApiError("validation_error", fields={"items": ["وضعیت همهٔ اقلام را مشخص کنید."]})
        variant_ids = [items[rid].order_item.variant_id for rid, (_, r) in decisions.items() if r > 0]
        stocks = inventory.lock_stock(variant_ids) if variant_ids else {}
        for rid, (accepted, restock_qty) in decisions.items():
            ri = items[rid]
            ri.accepted_quantity = accepted
            ri.restock_quantity = restock_qty
            ri.save(update_fields=["accepted_quantity", "restock_quantity"])
            oi = OrderItem.objects.select_for_update().get(pk=ri.order_item_id)
            oi.returned_quantity = min(oi.quantity, oi.returned_quantity + accepted)
            oi.save(update_fields=["returned_quantity"])
            if restock_qty:
                inventory.restock(
                    stocks[oi.variant_id],
                    restock_qty,
                    kind=InventoryMovement.Kind.RETURN_RESTOCK,
                    reference=order.number,
                    actor=actor,
                    reason=f"مرجوعی {str(ret.pk)[:8]}",
                )
        ret.status = R.RECEIVED
        ret.received_at = timezone.now()
        if note:
            ret.staff_note = clean_plain(note, max_length=1000, multiline=True)
        ret.version += 1
        ret.save()
        if all(i.returned_quantity >= i.quantity for i in order.items.all()) and order.fulfillment_status == F.DELIVERED:
            state.set_fulfillment(order, F.RETURNED, actor=actor, message="همهٔ کالاهای سفارش مرجوع شد.")
        state.save(order)
        audit.record("return.receive", actor=actor, request=request, obj=order, metadata={"return": str(ret.pk)})
        return ret


def suggested_refund(ret: ReturnRequest) -> int:
    total = 0
    for ri in ret.items.select_related("order_item"):
        oi = ri.order_item
        qty = ri.accepted_quantity if ri.accepted_quantity is not None else ri.quantity
        if qty <= 0:
            continue
        net_line = oi.line_total_toman - oi.discount_share_toman
        total += net_line if qty == oi.quantity else net_line * qty // oi.quantity
    return total
