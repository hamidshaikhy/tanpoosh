"""Money rules: integer toman, coupon rounding, post-discount free-shipping threshold, provider units."""

from __future__ import annotations

import pytest

from apps.payments.providers import toman_to_rial
from apps.promotions.services import CouponLine, allocate, round_percent

from .conftest import make_product


def test_round_percent_half_up_once() -> None:
    assert round_percent(12_000_000, 10) == 1_200_000
    assert round_percent(1_234_565, 10) == 123_457  # 123456.5 -> half up
    assert round_percent(1_234_564, 10) == 123_456
    assert round_percent(1, 10) == 0


def test_allocation_sums_exactly() -> None:
    lines = [CouponLine(k, 1, 1, amt) for k, amt in enumerate([333_333, 333_333, 333_334])]
    shares = allocate(100_001, lines)
    assert sum(shares.values()) == 100_001
    assert all(v >= 0 for v in shares.values())


def test_toman_to_rial_single_conversion() -> None:
    assert toman_to_rial(10_800_000) == 108_000_000
    with pytest.raises(ValueError):
        toman_to_rial(0)


@pytest.mark.django_db
def test_reference_basket_totals(client, shipping, tan10) -> None:  # type: ignore[no-untyped-def]
    _, bomber = make_product(price=4_800_000)
    _, trousers = make_product(price=3_200_000, size="32")
    _, boots = make_product(price=4_000_000, size="42")
    for v in (bomber, trousers, boots):
        assert client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json").status_code == 201

    q = client.post("/api/v1/checkout/quote", {"shipping_method": "standard"}, format="json").json()
    assert q["subtotal_toman"] == 12_000_000
    assert q["shipping_toman"] == 0  # >= 5,000,000

    q = client.post("/api/v1/checkout/quote", {"coupon_code": "tan10", "shipping_method": "standard"}, format="json").json()
    assert (q["discount_toman"], q["shipping_toman"], q["total_toman"]) == (1_200_000, 0, 10_800_000)

    q = client.post("/api/v1/checkout/quote", {"coupon_code": "TAN10", "shipping_method": "express"}, format="json").json()
    assert (q["shipping_toman"], q["total_toman"]) == (250_000, 11_050_000)  # express never free


@pytest.mark.django_db
def test_free_shipping_uses_post_discount_amount(client, shipping, tan10) -> None:  # type: ignore[no-untyped-def]
    _, v = make_product(price=5_200_000)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    q = client.post("/api/v1/checkout/quote", {"shipping_method": "standard"}, format="json").json()
    assert q["shipping_toman"] == 0
    q = client.post("/api/v1/checkout/quote", {"coupon_code": "TAN10", "shipping_method": "standard"}, format="json").json()
    # 5,200,000 - 520,000 = 4,680,000 < 5,000,000 -> standard fee applies
    assert q["discount_toman"] == 520_000
    assert q["shipping_toman"] == 150_000
    assert q["total_toman"] == 4_680_000 + 150_000


@pytest.mark.django_db
def test_coupon_window_and_limits(client, shipping) -> None:  # type: ignore[no-untyped-def]
    from datetime import timedelta

    from django.utils import timezone

    from apps.promotions.models import Coupon

    _, v = make_product(price=2_000_000)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    Coupon.objects.create(code="OLD", kind="percent", value=10, ends_at=timezone.now() - timedelta(days=1))
    Coupon.objects.create(code="SOON", kind="percent", value=10, starts_at=timezone.now() + timedelta(days=1))
    Coupon.objects.create(code="MIN", kind="fixed", value=100_000, min_subtotal_toman=3_000_000)
    Coupon.objects.create(code="OFF", kind="percent", value=10, is_active=False)
    for code, expected in [
        ("OLD", "coupon_expired"),
        ("SOON", "coupon_not_started"),
        ("MIN", "coupon_min_subtotal"),
        ("OFF", "coupon_invalid"),
        ("NOPE", "coupon_invalid"),
    ]:
        q = client.post("/api/v1/checkout/quote", {"coupon_code": code}, format="json").json()
        assert q["coupon_error"]["code"] == expected, code
        assert q["discount_toman"] == 0
        assert q["purchasable"] is False
