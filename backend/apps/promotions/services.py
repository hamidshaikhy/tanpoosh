"""Coupon evaluation. One coupon per checkout.

Rounding rule: percent discounts are computed once on the eligible merchandise subtotal and
rounded half-up to an integer toman: (eligible * percent + 50) // 100.
Capacity (global and per-customer) counts redemptions that are reserved or consumed; at order
placement the coupon row is locked (SELECT ... FOR UPDATE) so concurrent checkouts serialize.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.core.jalali import format_toman
from apps.core.normalize import normalize_coupon_code

from .models import Coupon, CouponRedemption


@dataclass
class CouponLine:
    key: Any
    product_id: int
    category_id: int
    line_total: int


@dataclass
class CouponOutcome:
    coupon: Coupon | None
    discount: int
    shares: dict[Any, int]
    error_code: str | None = None
    error_message: str | None = None


def round_percent(amount: int, percent: int) -> int:
    return (amount * percent + 50) // 100


def allocate(discount: int, lines: list[CouponLine]) -> dict[Any, int]:
    """Split a discount across lines proportionally (largest remainder) so shares sum exactly."""
    total = sum(line.line_total for line in lines)
    if discount <= 0 or total <= 0:
        return {line.key: 0 for line in lines}
    raw = [(line.key, discount * line.line_total // total, (discount * line.line_total) % total) for line in lines]
    shares = {key: base for key, base, _ in raw}
    remainder = discount - sum(shares.values())
    for key, _, _ in sorted(raw, key=lambda r: r[2], reverse=True)[:remainder]:
        shares[key] += 1
    return shares


def _fail(code: str, message: str) -> CouponOutcome:
    return CouponOutcome(None, 0, {}, code, message)


def evaluate(
    code: str, lines: list[CouponLine], *, user: Any, email: str, lock: bool = False, exclude_order_id: Any = None
) -> CouponOutcome:
    normalized = normalize_coupon_code(code)
    if not normalized:
        return CouponOutcome(None, 0, {})
    if len(normalized) > 32:
        return _fail("coupon_invalid", "کد تخفیف معتبر نیست.")
    qs = Coupon.objects.select_for_update() if lock else Coupon.objects.all()
    coupon = qs.filter(code=normalized).first()
    if coupon is None or not coupon.is_active:
        return _fail("coupon_invalid", "کد تخفیف معتبر نیست.")
    now = timezone.now()
    if coupon.starts_at and coupon.starts_at > now:
        return _fail("coupon_not_started", "زمان استفاده از این کد هنوز شروع نشده است.")
    if coupon.ends_at and coupon.ends_at <= now:
        return _fail("coupon_expired", "مهلت استفاده از این کد به پایان رسیده است.")

    product_ids = set(coupon.products.values_list("id", flat=True))
    category_ids = set(coupon.categories.values_list("id", flat=True))
    if product_ids or category_ids:
        eligible = [ln for ln in lines if ln.product_id in product_ids or ln.category_id in category_ids]
    else:
        eligible = list(lines)
    if not eligible:
        return _fail("coupon_not_applicable", "این کد برای کالاهای سبد شما قابل استفاده نیست.")
    eligible_total = sum(ln.line_total for ln in eligible)
    if eligible_total < coupon.min_subtotal_toman:
        return _fail(
            "coupon_min_subtotal",
            f"حداقل مبلغ خرید برای این کد {format_toman(coupon.min_subtotal_toman)} است.",
        )

    active = CouponRedemption.objects.filter(
        coupon=coupon, status__in=[CouponRedemption.Status.RESERVED, CouponRedemption.Status.CONSUMED]
    )
    if exclude_order_id is not None:
        active = active.exclude(order_id=exclude_order_id)
    if coupon.usage_limit is not None and active.count() >= coupon.usage_limit:
        return _fail("coupon_exhausted", "ظرفیت استفاده از این کد تکمیل شده است.")
    owner_q = Q(email=email.lower()) if email else Q(pk__in=[])
    if user is not None and getattr(user, "is_authenticated", False):
        owner_q |= Q(user=user)
    if active.filter(owner_q).count() >= coupon.per_customer_limit:
        return _fail("coupon_used", "شما قبلاً از این کد استفاده کرده‌اید.")

    if coupon.kind == Coupon.Kind.PERCENT:
        discount = round_percent(eligible_total, coupon.value)
    else:
        discount = min(coupon.value, eligible_total)
    if coupon.max_discount_toman is not None:
        discount = min(discount, coupon.max_discount_toman)
    discount = max(0, min(discount, eligible_total))
    shares = allocate(discount, eligible)
    for ln in lines:
        shares.setdefault(ln.key, 0)
    return CouponOutcome(coupon, discount, shares)
