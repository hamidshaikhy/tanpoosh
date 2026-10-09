"""The single canonical money calculation (all integer toman). Frontend totals are previews.

subtotal              = Σ unit_price × quantity           (current DB prices)
discount              = coupon on eligible lines (rounded once, half-up)
merchandise_after     = subtotal − discount
shipping              = method fee, or 0 when method has a free threshold and
                        merchandise_after ≥ threshold (express has no threshold)
total                 = merchandise_after + shipping
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

from apps.carts.models import CartItem
from apps.catalog.models import Product, Variant
from apps.promotions import services as coupons

from .models import ShippingMethod


@dataclass
class QuoteLine:
    variant: Variant
    quantity: int
    unit_price: int
    line_total: int
    discount_share: int = 0
    issue: str | None = None
    available: int = 0


@dataclass
class Quote:
    lines: list[QuoteLine]
    subtotal: int
    discount: int
    shipping_fee: int
    total: int
    coupon: Any
    coupon_code: str
    coupon_error: dict[str, str] | None
    shipping_method: ShippingMethod | None
    shipping_options: list[dict[str, Any]]
    issues: list[dict[str, Any]] = field(default_factory=list)

    @property
    def purchasable(self) -> bool:
        return bool(self.lines) and not self.issues and self.shipping_method is not None and self.coupon_error is None

    @property
    def fingerprint(self) -> str:
        payload = {
            "lines": [[ln.variant.pk, ln.quantity, ln.unit_price, ln.discount_share] for ln in self.lines],
            "coupon": self.coupon_code if self.coupon else "",
            "discount": self.discount,
            "shipping": [self.shipping_method.code if self.shipping_method else "", self.shipping_fee],
            "total": self.total,
        }
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:32]


def shipping_fee_for(method: ShippingMethod, merchandise_after_discount: int) -> int:
    if method.free_threshold_toman is not None and merchandise_after_discount >= method.free_threshold_toman:
        return 0
    return method.fee_toman


def _available(variant: Variant, stocks: dict[int, Any] | None) -> int:
    stock = (stocks or {}).get(variant.pk) or getattr(variant, "stock", None)
    return max(0, stock.on_hand - stock.reserved) if stock else 0


def compute_quote(
    items: list[CartItem],
    *,
    coupon_code: str = "",
    shipping_code: str | None = None,
    user: Any = None,
    email: str = "",
    stocks: dict[int, Any] | None = None,
    lock_coupon: bool = False,
) -> Quote:
    lines: list[QuoteLine] = []
    issues: list[dict[str, Any]] = []
    for item in items:
        v = item.variant
        available = _available(v, stocks)
        issue = None
        if not v.is_active or v.product.status != Product.Status.PUBLISHED:
            issue = "unavailable"
        elif available < item.quantity:
            issue = "insufficient_stock" if available else "out_of_stock"
        if issue:
            issues.append(
                {
                    "code": issue,
                    "variant_id": v.pk,
                    "message": f"«{v.product.name}» (سایز {v.size}) "
                    + (
                        "دیگر در دسترس نیست."
                        if issue == "unavailable"
                        else ("ناموجود است." if issue == "out_of_stock" else f"فقط {available} عدد موجود است.")
                    ),
                }
            )
        lines.append(QuoteLine(v, item.quantity, v.price_toman, v.price_toman * item.quantity, issue=issue, available=available))

    valid_lines = [ln for ln in lines if ln.issue is None]
    subtotal = sum(ln.line_total for ln in valid_lines)

    coupon_error = None
    coupon_obj = None
    discount = 0
    if coupon_code:
        outcome = coupons.evaluate(
            coupon_code,
            [
                coupons.CouponLine(ln.variant.pk, ln.variant.product_id, ln.variant.product.category_id, ln.line_total)
                for ln in valid_lines
            ],
            user=user,
            email=email,
            lock=lock_coupon,
        )
        if outcome.error_code:
            coupon_error = {"code": outcome.error_code, "message": outcome.error_message or ""}
        elif outcome.coupon:
            coupon_obj = outcome.coupon
            discount = outcome.discount
            for ln in valid_lines:
                ln.discount_share = outcome.shares.get(ln.variant.pk, 0)

    after = subtotal - discount
    methods = list(ShippingMethod.objects.filter(is_active=True).order_by("sort_order", "id"))
    options = [
        {
            "code": m.code,
            "name": m.name,
            "description": m.description,
            "eta_text": m.eta_text,
            "fee_toman": shipping_fee_for(m, after),
            "base_fee_toman": m.fee_toman,
            "free_threshold_toman": m.free_threshold_toman,
            "is_free": shipping_fee_for(m, after) == 0,
        }
        for m in methods
    ]
    chosen = next((m for m in methods if m.code == shipping_code), None) if shipping_code else (methods[0] if methods else None)
    shipping_fee = shipping_fee_for(chosen, after) if chosen else 0
    total = after + shipping_fee

    if not lines:
        issues.append({"code": "empty_cart", "message": "سبد خرید خالی است."})
    if shipping_code and chosen is None:
        issues.append({"code": "shipping_unavailable", "message": "روش ارسال انتخاب‌شده در دسترس نیست."})
    if total > 100_000_000:
        issues.append({"code": "amount_too_large", "message": "مبلغ سفارش از سقف پرداخت آنلاین (۱۰۰ میلیون تومان) بیشتر است."})

    return Quote(
        lines=lines,
        subtotal=subtotal,
        discount=discount,
        shipping_fee=shipping_fee,
        total=total,
        coupon=coupon_obj,
        coupon_code=coupon_obj.code if coupon_obj else "",
        coupon_error=coupon_error,
        shipping_method=chosen,
        shipping_options=options,
        issues=issues,
    )


def quote_payload(quote: Quote) -> dict[str, Any]:
    return {
        "fingerprint": quote.fingerprint,
        "purchasable": quote.purchasable,
        "currency": settings.CURRENCY,
        "subtotal_toman": quote.subtotal,
        "discount_toman": quote.discount,
        "shipping_toman": quote.shipping_fee,
        "total_toman": quote.total,
        "coupon_code": quote.coupon_code,
        "coupon_error": quote.coupon_error,
        "shipping_method": quote.shipping_method.code if quote.shipping_method else None,
        "shipping_options": quote.shipping_options,
        "issues": quote.issues,
        "lines": [
            {
                "variant_id": ln.variant.pk,
                "product_name": ln.variant.product.name,
                "product_slug": ln.variant.product.slug,
                "color_name": ln.variant.color.name,
                "size": ln.variant.size,
                "quantity": ln.quantity,
                "unit_price_toman": ln.unit_price,
                "line_total_toman": ln.line_total,
                "discount_share_toman": ln.discount_share,
                "issue": ln.issue,
            }
            for ln in quote.lines
        ],
    }
