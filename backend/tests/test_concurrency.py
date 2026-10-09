"""Real PostgreSQL concurrency: parallel checkouts racing for the last unit and for a
single-use coupon, and concurrent duplicate order submissions with the same idempotency key."""

from __future__ import annotations

import threading
import uuid

import pytest
from django.db import connection
from rest_framework.test import APIClient

from apps.inventory.models import StockLevel
from apps.orders.models import Order
from apps.promotions.models import Coupon, CouponRedemption

from .conftest import checkout, make_product

pytestmark = pytest.mark.django_db(transaction=True)


def _run_parallel(fns: list) -> list:  # type: ignore[type-arg]
    results: list = [None] * len(fns)
    barrier = threading.Barrier(len(fns))

    def runner(i: int) -> None:
        try:
            barrier.wait()
            results[i] = fns[i]()
        finally:
            connection.close()

    threads = [threading.Thread(target=runner, args=(i,)) for i in range(len(fns))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def _shipping() -> None:
    from apps.orders.models import ShippingMethod

    ShippingMethod.objects.create(code="standard", name="ارسال عادی", fee_toman=150_000, free_threshold_toman=5_000_000)


def test_last_unit_cannot_be_oversold() -> None:
    _shipping()
    _, v = make_product(stock=1)
    clients = [APIClient() for _ in range(4)]
    for c in clients:
        assert c.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json").status_code == 201
    results = _run_parallel([lambda c=c: checkout(c).status_code for c in clients])
    assert sorted(results) == [201, 409, 409, 409]
    stock = StockLevel.objects.get(variant=v)
    assert (stock.on_hand, stock.reserved) == (1, 1)
    assert Order.objects.count() == 1


def test_single_use_coupon_race() -> None:
    _shipping()
    Coupon.objects.create(code="ONCE", kind="percent", value=10, usage_limit=1, per_customer_limit=1)
    _, v = make_product(stock=10)
    clients = [APIClient() for _ in range(3)]
    for c in clients:
        c.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    results = _run_parallel(
        [lambda c=c, i=i: checkout(c, coupon="ONCE", email=f"r{i}@example.com").status_code for i, c in enumerate(clients)]
    )
    assert results.count(201) == 1
    assert CouponRedemption.objects.filter(status__in=["reserved", "consumed"]).count() == 1


def test_duplicate_concurrent_submissions_create_one_order() -> None:
    _shipping()
    _, v = make_product(stock=10)
    c = APIClient()
    c.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    key = uuid.uuid4().hex
    quote = c.post("/api/v1/checkout/quote", {"shipping_method": "standard"}, format="json").json()
    from .conftest import ADDRESS

    body = {
        "contact": {"name": "x y", "phone": "09121234567", "email": "a@example.com"},
        "address": ADDRESS,
        "shipping_method": "standard",
        "quote_fingerprint": quote["fingerprint"],
    }
    session_cookie = c.cookies

    def submit() -> int:
        cc = APIClient()
        cc.cookies = session_cookie
        return cc.post("/api/v1/checkout/orders", body, format="json", HTTP_IDEMPOTENCY_KEY=key).status_code

    results = _run_parallel([submit, submit, submit])
    assert all(r in (201, 409) for r in results)
    assert Order.objects.count() == 1
    assert StockLevel.objects.get(variant=v).reserved == 1
