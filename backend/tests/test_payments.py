"""Payment verification, idempotent settlement, forged/duplicate callbacks, timeouts,
reconciliation, late settlement after reservation expiry and double payment.

Uses the DEVELOPMENT/TEST-ONLY mock provider (offline, deterministic). The ZarinPal adapter's
parsing is unit-tested against recorded response shapes in test_zarinpal_adapter.py.
"""

from __future__ import annotations

import uuid
from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import InventoryMovement, StockLevel
from apps.orders.models import Order, StockReservation
from apps.orders.services import expire_due_orders
from apps.payments import services as pay
from apps.payments.models import MockGatewayTransaction, PaymentAttempt
from apps.payments.providers import VerifyResult
from apps.promotions.models import CouponRedemption

from .conftest import checkout, make_product

pytestmark = pytest.mark.django_db


def _order(client: APIClient, *, qty: int = 1, stock: int = 3, coupon: str = "") -> tuple[dict, int]:
    _, v = make_product(price=2_000_000, stock=stock)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": qty}, format="json")
    r = checkout(client, coupon=coupon)
    assert r.status_code == 201, r.content
    return r.json(), v.pk


def _start(client: APIClient, order_id: str) -> str:
    r = client.post(f"/api/v1/orders/{order_id}/pay", HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex)
    assert r.status_code == 200, r.content
    return r.json()["redirect_url"].split("authority=")[1]


def _gateway(authority: str, outcome: str) -> None:
    c = APIClient()
    assert c.post(f"/api/v1/payments/mock/{authority}/complete", {"outcome": outcome}, format="json").status_code == 200


def test_success_settles_once_and_consumes_stock_once(client: APIClient, shipping: None, tan10: None) -> None:
    order, vid = _order(client, qty=2, coupon="TAN10")
    authority = _start(client, order["id"])
    attempt = PaymentAttempt.objects.get(authority=authority)
    assert attempt.provider_amount == attempt.amount_toman * 10 and attempt.provider_currency == "IRR"
    _gateway(authority, "success")
    for _ in range(3):  # duplicate / replayed browser returns
        r = client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
        assert r.status_code == 302 and "order=" in r["Location"]
    o = Order.objects.get(pk=order["id"])
    assert o.payment_status == "verified" and o.fulfillment_status == "processing"
    stock = StockLevel.objects.get(variant_id=vid)
    assert (stock.on_hand, stock.reserved) == (1, 0)
    assert InventoryMovement.objects.filter(variant_id=vid, kind="sale").count() == 1
    assert CouponRedemption.objects.get(order=o).status == "consumed"
    assert PaymentAttempt.objects.get(pk=attempt.pk).ref_id


def test_forged_callback_does_not_mark_paid(client: APIClient, shipping: None) -> None:
    order, vid = _order(client)
    authority = _start(client, order["id"])
    # Browser claims success but the gateway never received payment.
    client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    o = Order.objects.get(pk=order["id"])
    assert o.payment_status == "failed"
    assert StockLevel.objects.get(variant_id=vid).reserved == 1  # hold kept for retry
    # Unknown authority: nothing changes, generic redirect
    r = APIClient().get("/api/v1/payments/callback?Authority=MOCKDOESNOTEXIST&Status=OK")
    assert r.status_code == 302 and "status=unknown" in r["Location"]


def test_retry_after_failure_then_success(client: APIClient, shipping: None) -> None:
    order, _ = _order(client)
    a1 = _start(client, order["id"])
    _gateway(a1, "cancel")
    client.get(f"/api/v1/payments/callback?Authority={a1}&Status=NOK")
    assert Order.objects.get(pk=order["id"]).payment_status == "failed"
    a2 = _start(client, order["id"])
    _gateway(a2, "success")
    client.get(f"/api/v1/payments/callback?Authority={a2}&Status=OK")
    assert Order.objects.get(pk=order["id"]).payment_status == "verified"


def test_timeout_after_provider_success_is_unknown_then_reconciled(client: APIClient, shipping: None) -> None:
    order, _ = _order(client)
    authority = _start(client, order["id"])
    _gateway(authority, "success")
    with mock.patch(
        "apps.payments.providers.MockProvider.verify", return_value=VerifyResult(status="unknown", message="timeout")
    ):
        client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    attempt = PaymentAttempt.objects.get(authority=authority)
    assert attempt.status == "unknown"  # never marked failed on uncertainty
    assert Order.objects.get(pk=order["id"]).payment_status == "pending"
    PaymentAttempt.objects.filter(pk=attempt.pk).update(created_at=timezone.now() - timedelta(minutes=5))
    assert pay.reconcile_due() == 1
    assert Order.objects.get(pk=order["id"]).payment_status == "verified"


def test_late_payment_after_expiry_reacquires_stock(client: APIClient, shipping: None) -> None:
    order, vid = _order(client, stock=3)
    authority = _start(client, order["id"])
    StockReservation.objects.filter(order_id=order["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert expire_due_orders() == 1
    o = Order.objects.get(pk=order["id"])
    assert (o.payment_status, o.fulfillment_status) == ("cancelled", "cancelled")
    assert StockLevel.objects.get(variant_id=vid).reserved == 0
    _gateway(authority, "success")
    client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    o.refresh_from_db()
    assert (o.payment_status, o.fulfillment_status) == ("verified", "processing")
    assert StockLevel.objects.get(variant_id=vid).on_hand == 2
    assert InventoryMovement.objects.filter(variant_id=vid, kind="late_sale").count() == 1


def test_late_payment_without_stock_needs_review(client: APIClient, shipping: None) -> None:
    order, vid = _order(client, stock=1)
    authority = _start(client, order["id"])
    StockReservation.objects.filter(order_id=order["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
    expire_due_orders()
    # someone else buys the last unit meanwhile
    StockLevel.objects.filter(variant_id=vid).update(on_hand=0)
    _gateway(authority, "success")
    client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    o = Order.objects.get(pk=order["id"])
    assert o.payment_status == "needs_review"
    assert o.fulfillment_status == "cancelled"  # cannot be fulfilled
    assert PaymentAttempt.objects.get(authority=authority).status == "verified"  # real money never discarded
    assert StockLevel.objects.get(variant_id=vid).on_hand == 0  # no negative stock


def test_double_payment_is_flagged_not_double_fulfilled(client: APIClient, shipping: None) -> None:
    order, vid = _order(client, stock=5)
    a1 = _start(client, order["id"])
    a2 = _start(client, order["id"])  # second tab
    _gateway(a1, "success")
    _gateway(a2, "success")
    client.get(f"/api/v1/payments/callback?Authority={a1}&Status=OK")
    client.get(f"/api/v1/payments/callback?Authority={a2}&Status=OK")
    o = Order.objects.get(pk=order["id"])
    assert o.payment_status == "needs_review"
    assert "تکراری" in o.review_reason
    assert InventoryMovement.objects.filter(variant_id=vid, kind__in=["sale", "late_sale"]).count() == 1


def test_amount_mismatch_flags_review(client: APIClient, shipping: None) -> None:
    order, _ = _order(client)
    authority = _start(client, order["id"])
    _gateway(authority, "success")
    MockGatewayTransaction.objects.filter(authority=authority).update(amount=1)
    client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    assert Order.objects.get(pk=order["id"]).payment_status == "needs_review"


def test_cannot_pay_expired_or_cancelled_order(client: APIClient, shipping: None) -> None:
    order, _ = _order(client)
    client.post(f"/api/v1/orders/{order['id']}/cancel")
    r = client.post(f"/api/v1/orders/{order['id']}/pay", HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex)
    assert r.status_code == 409


def test_mock_gateway_disabled_when_provider_is_zarinpal(settings) -> None:  # type: ignore[no-untyped-def]
    from django.core.exceptions import ImproperlyConfigured

    from apps.payments.providers import MockProvider

    settings.PAYMENT_MOCK_ENABLED = False
    with pytest.raises(ImproperlyConfigured):
        MockProvider()
    settings.PAYMENT_MOCK_ENABLED = True
    settings.IS_PRODUCTION = True
    with pytest.raises(ImproperlyConfigured):
        MockProvider()
