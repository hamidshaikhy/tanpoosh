"""Order state machine. Payment and fulfillment states are independent; only the transitions
listed here are allowed, and every transition writes an OrderEvent (actor/time/reason).

Payment:
  unpaid ──► pending ──► verified ──► refund_pending ──► partially_refunded ──► refunded
     │          │  ▲         │                                    └───────────► refunded
     │          ▼  │         └──► needs_review (double payment / late payment w/o stock)
     │        failed ─► pending (retry)
     └──► cancelled (unpaid order expired/cancelled) ──► verified | needs_review (late settlement)

Fulfillment:
  awaiting_payment ─► processing ─► packed ─► shipped ─► delivered ─► returned
         │                │           │
         └─► cancelled ◄──┴───────────┘          (cancelled ─► processing only for an accepted late payment)
"""

from __future__ import annotations

from typing import Any

from django.utils import timezone

from apps.core.errors import Conflict

from .models import FulfillmentStatus as F
from .models import Order, OrderEvent
from .models import PaymentStatus as P

PAYMENT_TRANSITIONS: dict[str, set[str]] = {
    P.UNPAID: {P.PENDING, P.CANCELLED},
    P.PENDING: {P.VERIFIED, P.FAILED, P.UNPAID, P.CANCELLED, P.NEEDS_REVIEW},
    P.FAILED: {P.PENDING, P.CANCELLED, P.VERIFIED, P.NEEDS_REVIEW},
    P.CANCELLED: {P.VERIFIED, P.NEEDS_REVIEW},
    P.VERIFIED: {P.REFUND_PENDING, P.NEEDS_REVIEW},
    P.NEEDS_REVIEW: {P.VERIFIED, P.REFUND_PENDING},
    P.REFUND_PENDING: {P.PARTIALLY_REFUNDED, P.REFUNDED, P.VERIFIED, P.NEEDS_REVIEW},
    P.PARTIALLY_REFUNDED: {P.REFUND_PENDING, P.REFUNDED},
    P.REFUNDED: set(),
}

FULFILLMENT_TRANSITIONS: dict[str, set[str]] = {
    F.AWAITING_PAYMENT: {F.PROCESSING, F.CANCELLED},
    F.PROCESSING: {F.PACKED, F.CANCELLED},
    F.PACKED: {F.SHIPPED, F.PROCESSING, F.CANCELLED},
    F.SHIPPED: {F.DELIVERED},
    F.DELIVERED: {F.RETURNED},
    F.CANCELLED: {F.PROCESSING},
    F.RETURNED: set(),
}

# Fulfillment transitions staff may request through the management API.
STAFF_FULFILLMENT_ACTIONS = {
    "pack": (F.PROCESSING, F.PACKED),
    "unpack": (F.PACKED, F.PROCESSING),
    "ship": (F.PACKED, F.SHIPPED),
    "deliver": (F.SHIPPED, F.DELIVERED),
}


def _event(order: Order, kind: str, old: str, new: str, *, actor: Any, message: str, customer_visible: bool) -> None:
    OrderEvent.objects.create(
        order=order,
        kind=kind,
        from_status=old,
        to_status=new,
        message=message[:300],
        actor=actor if getattr(actor, "pk", None) else None,
        actor_label=(getattr(actor, "username", "") or "سیستم")[:80],
        customer_visible=customer_visible,
    )


def set_payment(order: Order, new: str, *, actor: Any = None, message: str = "", customer_visible: bool = True) -> None:
    old = order.payment_status
    if old == new:
        return
    if new not in PAYMENT_TRANSITIONS.get(old, set()):
        raise Conflict("invalid_transition", f"تغییر وضعیت پرداخت از «{P(old).label}» به «{P(new).label}» مجاز نیست.")
    order.payment_status = new
    if new == P.VERIFIED and order.paid_at is None:
        order.paid_at = timezone.now()
    _event(order, OrderEvent.Kind.PAYMENT, old, new, actor=actor, message=message, customer_visible=customer_visible)


def set_fulfillment(order: Order, new: str, *, actor: Any = None, message: str = "", customer_visible: bool = True) -> None:
    old = order.fulfillment_status
    if old == new:
        return
    if new not in FULFILLMENT_TRANSITIONS.get(old, set()):
        raise Conflict("invalid_transition", f"تغییر وضعیت ارسال از «{F(old).label}» به «{F(new).label}» مجاز نیست.")
    order.fulfillment_status = new
    now = timezone.now()
    if new == F.SHIPPED:
        order.shipped_at = now
    elif new == F.DELIVERED:
        order.delivered_at = now
    elif new == F.CANCELLED:
        order.cancelled_at = now
    _event(order, OrderEvent.Kind.FULFILLMENT, old, new, actor=actor, message=message, customer_visible=customer_visible)


def save(order: Order) -> None:
    order.version += 1
    order.save()
