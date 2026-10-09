"""Cart ownership, quote integrity, idempotent order creation and order access control."""

from __future__ import annotations

import uuid

import pytest
from rest_framework.test import APIClient

from apps.carts.models import CartItem
from apps.inventory.models import StockLevel
from apps.orders.models import Order, OrderItem, StockReservation

from .conftest import checkout, flush_outbox, login, make_product, make_user

pytestmark = pytest.mark.django_db


def test_cart_rejects_tampered_quantities_and_unknown_variants(client: APIClient) -> None:
    _, v = make_product(stock=3)
    assert client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 0}, format="json").status_code == 400
    assert client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": -2}, format="json").status_code == 400
    assert client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 11}, format="json").status_code == 400
    assert client.post("/api/v1/cart/items", {"variant_id": 999999, "quantity": 1}, format="json").status_code == 404
    r = client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 4}, format="json")
    assert r.status_code == 409 and r.json()["error"]["code"] == "insufficient_stock"
    # client-supplied price is ignored entirely (not a writable field)
    r = client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1, "price_toman": 1}, format="json")
    assert r.status_code == 201
    assert r.json()["items"][0]["unit_price_toman"] == v.price_toman


def test_other_session_cannot_touch_cart_item(client: APIClient) -> None:
    _, v = make_product()
    item_id = client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json").json()["items"][0]["id"]
    intruder = APIClient()
    assert intruder.patch(f"/api/v1/cart/items/{item_id}", {"quantity": 5}, format="json").status_code == 404
    assert intruder.delete(f"/api/v1/cart/items/{item_id}").status_code == 404
    assert CartItem.objects.get(pk=item_id).quantity == 1


def test_batch_add_is_all_or_nothing(client: APIClient) -> None:
    _, ok = make_product(stock=5)
    _, out = make_product(stock=0)
    r = client.post(
        "/api/v1/cart/items/batch",
        {"items": [{"variant_id": ok.pk, "quantity": 1}, {"variant_id": out.pk, "quantity": 1}]},
        format="json",
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "batch_invalid"
    assert client.get("/api/v1/cart").json()["items"] == []


def test_price_change_produces_quote_changed(client: APIClient, shipping: None) -> None:
    _, v = make_product(price=1_000_000)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    quote = client.post("/api/v1/checkout/quote", {"shipping_method": "standard"}, format="json").json()
    v.price_toman = 1_100_000
    v.save()
    body = {
        "contact": {"name": "x y", "phone": "09121234567", "email": "a@example.com"},
        "address": {
            "recipient_name": "x",
            "phone": "09121234567",
            "province": "تهران",
            "city": "تهران",
            "postal_code": "1435916471",
            "line": "خیابان",
        },
        "shipping_method": "standard",
        "quote_fingerprint": quote["fingerprint"],
    }
    r = client.post("/api/v1/checkout/orders", body, format="json", HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex)
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "quote_changed"
    assert err["quote"]["total_toman"] == 1_100_000 + 150_000  # never silently charged


def test_order_snapshot_reservation_and_idempotency(client: APIClient, shipping: None) -> None:
    product, v = make_product(price=2_000_000, stock=4)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 2}, format="json")
    key = uuid.uuid4().hex
    r1 = checkout(client, key=key)
    assert r1.status_code == 201, r1.content
    r2 = checkout(client, key=key)  # same key + same payload -> same order, no duplicate
    assert r2.status_code == 201 and r2.json()["id"] == r1.json()["id"]
    assert Order.objects.count() == 1
    stock = StockLevel.objects.get(variant=v)
    assert (stock.on_hand, stock.reserved) == (4, 2)
    assert StockReservation.objects.get().status == "active"
    # catalog edits never rewrite the order snapshot
    product.name = "نام جدید"
    product.save()
    v.price_toman = 9_000_000
    v.save()
    item = OrderItem.objects.get()
    assert item.unit_price_toman == 2_000_000 and item.product_name != "نام جدید"


def test_order_access_requires_ownership(client: APIClient, shipping: None) -> None:
    _, v = make_product()
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    order_id = checkout(client).json()["id"]
    assert client.get(f"/api/v1/orders/{order_id}").status_code == 200
    stranger = APIClient()
    assert stranger.get(f"/api/v1/orders/{order_id}").status_code == 404
    assert stranger.post(f"/api/v1/orders/{order_id}/pay", HTTP_IDEMPOTENCY_KEY=uuid.uuid4().hex).status_code == 404
    assert stranger.post(f"/api/v1/orders/{order_id}/cancel").status_code == 404
    other_user = make_user()
    login(stranger, other_user)
    assert stranger.get(f"/api/v1/orders/{order_id}").status_code == 404
    assert stranger.get("/api/v1/orders").json()["count"] == 0


def test_guest_lookup_never_reveals_order(client: APIClient, shipping: None, mailoutbox: list) -> None:
    _, v = make_product()
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")
    order = checkout(client, email="guest@example.com").json()
    stranger = APIClient()
    r1 = stranger.post("/api/v1/orders/lookup", {"number": order["number"], "email": "guest@example.com"}, format="json")
    r2 = stranger.post("/api/v1/orders/lookup", {"number": order["number"], "email": "wrong@example.com"}, format="json")
    assert r1.json() == r2.json()  # identical responses
    assert "contact" not in r1.json()
    assert stranger.get(f"/api/v1/orders/{order['id']}").status_code == 404
    # the emailed signed link grants access
    flush_outbox()
    link = next(m for m in mailoutbox if "orders/access" in m.body).body
    token = link.split("#token=")[1].split()[0]
    assert stranger.post("/api/v1/orders/access", {"token": token}, format="json").status_code == 200
    assert stranger.get(f"/api/v1/orders/{order['id']}").status_code == 200
    assert APIClient().post("/api/v1/orders/access", {"token": token[:-3] + "abc"}, format="json").status_code == 400


def test_customer_cancel_releases_hold(client: APIClient, shipping: None) -> None:
    _, v = make_product(stock=2)
    client.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 2}, format="json")
    order_id = checkout(client).json()["id"]
    assert StockLevel.objects.get(variant=v).reserved == 2
    r = client.post(f"/api/v1/orders/{order_id}/cancel")
    assert r.status_code == 200 and r.json()["payment_status"] == "cancelled"
    assert StockLevel.objects.get(variant=v).reserved == 0
    assert client.post(f"/api/v1/orders/{order_id}/cancel").status_code == 409


def test_guest_cart_merges_on_login_with_stock_cap(shipping: None) -> None:
    _, a = make_product(stock=3)
    _, b = make_product(stock=5)
    user = make_user()
    c1 = APIClient()
    login(c1, user)
    c1.post("/api/v1/cart/items", {"variant_id": a.pk, "quantity": 2}, format="json")
    c1.post("/api/v1/auth/logout")
    guest = APIClient()
    guest.post("/api/v1/cart/items", {"variant_id": a.pk, "quantity": 2}, format="json")
    guest.post("/api/v1/cart/items", {"variant_id": b.pk, "quantity": 1}, format="json")
    r = guest.post("/api/v1/auth/login", {"identifier": user.username, "password": "Sufficiently-Long-Pass-91"}, format="json")
    assert r.status_code == 200
    assert any(n["code"] == "reduced" for n in r.json()["merge_notices"])
    cart = guest.get("/api/v1/cart").json()
    qty = {i["variant_id"]: i["quantity"] for i in cart["items"]}
    assert qty == {a.pk: 3, b.pk: 1}  # 2+2 capped at stock 3; distinct variant kept
    # repeated login does not merge twice
    guest.post("/api/v1/auth/logout")
    login(guest, user)
    qty2 = {i["variant_id"]: i["quantity"] for i in guest.get("/api/v1/cart").json()["items"]}
    assert qty2 == qty
