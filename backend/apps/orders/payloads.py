from __future__ import annotations

from typing import Any

from django.utils import timezone

from .models import FulfillmentStatus, Order, PaymentStatus
from .returns import can_request_return, return_deadline, returnable_items


def order_summary(order: Order) -> dict[str, Any]:
    return {
        "id": str(order.pk),
        "number": order.number,
        "placed_at": order.placed_at,
        "payment_status": order.payment_status,
        "payment_status_label": PaymentStatus(order.payment_status).label,
        "fulfillment_status": order.fulfillment_status,
        "fulfillment_status_label": FulfillmentStatus(order.fulfillment_status).label,
        "total_toman": order.total_toman,
        "currency": order.currency,
        "item_count": sum(i.quantity for i in order.items.all()),
        "is_test": order.is_test,
        "thumbnail": next((i.image_url for i in order.items.all() if i.image_url), ""),
    }


def order_detail(order: Order, *, staff: bool = False) -> dict[str, Any]:
    now = timezone.now()
    payable = (
        order.payment_status in (PaymentStatus.UNPAID, PaymentStatus.FAILED, PaymentStatus.PENDING)
        and order.fulfillment_status == FulfillmentStatus.AWAITING_PAYMENT
        and order.reservation_expires_at is not None
        and order.reservation_expires_at > now
    )
    attempts = list(order.payment_attempts.all().order_by("-created_at"))
    verified = next((a for a in attempts if a.status == "verified"), None)
    events = order.events.all() if staff else order.events.filter(customer_visible=True)
    deadline = return_deadline(order)
    data: dict[str, Any] = {
        **order_summary(order),
        "contact": {"name": order.contact_name, "phone": order.contact_phone, "email": order.contact_email},
        "shipping_address": {
            "recipient_name": order.ship_recipient,
            "phone": order.ship_phone,
            "province": order.ship_province,
            "city": order.ship_city,
            "postal_code": order.ship_postal_code,
            "line": order.ship_line,
            "plaque": order.ship_plaque,
            "unit": order.ship_unit,
        },
        "shipping_method": {"code": order.shipping_method_code, "name": order.shipping_method_name},
        "subtotal_toman": order.subtotal_toman,
        "discount_toman": order.discount_toman,
        "shipping_toman": order.shipping_toman,
        "refunded_toman": order.refunded_toman,
        "coupon_code": order.coupon_code,
        "customer_note": order.customer_note,
        "paid_at": order.paid_at,
        "shipped_at": order.shipped_at,
        "delivered_at": order.delivered_at,
        "cancelled_at": order.cancelled_at,
        "reservation_expires_at": order.reservation_expires_at if payable else None,
        "payment_mode": order.payment_mode,
        "payment_reference": verified.ref_id if verified else "",
        "can_pay": payable,
        "can_cancel": order.payment_status in (PaymentStatus.UNPAID, PaymentStatus.FAILED)
        and order.fulfillment_status == FulfillmentStatus.AWAITING_PAYMENT,
        "can_return": can_request_return(order),
        "return_deadline": deadline,
        "returnable": returnable_items(order) if order.fulfillment_status == FulfillmentStatus.DELIVERED else [],
        "items": [
            {
                "id": i.pk,
                "product_name": i.product_name,
                "product_slug": i.product_slug,
                "color_name": i.color_name,
                "color_code": i.color_code,
                "size": i.size,
                "sku": i.sku,
                "image": i.image_url,
                "unit_price_toman": i.unit_price_toman,
                "quantity": i.quantity,
                "line_total_toman": i.line_total_toman,
                "discount_share_toman": i.discount_share_toman,
                "returned_quantity": i.returned_quantity,
            }
            for i in order.items.all()
        ],
        "events": [
            {
                "kind": e.kind,
                "from_status": e.from_status,
                "to_status": e.to_status,
                "message": e.message,
                "created_at": e.created_at,
                **({"actor": e.actor_label} if staff else {}),
            }
            for e in events
        ],
        "shipments": [
            {"carrier": s.carrier, "tracking_code": s.tracking_code, "shipped_at": s.shipped_at, "delivered_at": s.delivered_at}
            for s in order.shipments.all()
        ],
        "returns": [
            {
                "id": str(r.pk),
                "status": r.status,
                "status_label": r.get_status_display(),
                "reason": r.reason,
                "reason_label": r.get_reason_display(),
                "created_at": r.created_at,
                "staff_note": r.staff_note,
                "items": [
                    {"order_item_id": ri.order_item_id, "quantity": ri.quantity, "accepted_quantity": ri.accepted_quantity}
                    for ri in r.items.all()
                ],
            }
            for r in order.returns.all()
        ],
        "payment_attempts": [
            {
                "id": str(a.pk),
                "status": a.status,
                "status_label": a.get_status_display(),
                "mode": a.mode,
                "ref_id": a.ref_id,
                "created_at": a.created_at,
                **(
                    {
                        "provider": a.provider,
                        "amount_toman": a.amount_toman,
                        "provider_amount": a.provider_amount,
                        "provider_currency": a.provider_currency,
                        "authority": a.authority,
                        "provider_code": a.provider_code,
                        "failure_reason": a.failure_reason,
                        "fee": a.fee,
                        "verified_at": a.verified_at,
                        "callback_count": a.callback_count,
                        "check_count": a.check_count,
                    }
                    if staff
                    else {}
                ),
            }
            for a in attempts
        ],
    }
    if staff:
        data.update(
            {
                "version": order.version,
                "user_id": str(order.user_id) if order.user_id else None,
                "is_guest": order.is_guest,
                "review_reason": order.review_reason,
                "refunds": [
                    {
                        "id": str(r.pk),
                        "amount_toman": r.amount_toman,
                        "status": r.status,
                        "status_label": r.get_status_display(),
                        "reason": r.reason,
                        "reference": r.reference,
                        "evidence_note": r.evidence_note,
                        "failure_reason": r.failure_reason,
                        "return_id": str(r.return_request_id) if r.return_request_id else None,
                        "created_at": r.created_at,
                        "completed_at": r.completed_at,
                        "version": r.version,
                    }
                    for r in order.refunds.all()
                ],
            }
        )
    return data
