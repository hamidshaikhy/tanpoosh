"""Real paid orders exercise fulfillment, manual refund and returns invariants."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role
from apps.core.errors import ApiError
from apps.inventory.models import StockLevel
from apps.orders import returns, services
from apps.orders.models import Order
from apps.payments import refunds
from tests.conftest import make_user
from tests.test_payments import _gateway, _order, _start

pytestmark = pytest.mark.django_db


def paid_order(client, qty=2):
    data, vid = _order(client, qty=qty, stock=5)
    authority = _start(client, data["id"])
    _gateway(authority, "success")
    client.get(f"/api/v1/payments/callback?Authority={authority}&Status=OK")
    return Order.objects.get(pk=data["id"]), vid


def test_fulfillment_does_not_skip_states(client, shipping):
    actor = make_user(Role.ORDER_MANAGER)
    data, _ = _order(client)
    with pytest.raises(ApiError):
        services.staff_fulfillment_action(data["id"], "pack", actor=actor, data={})
    order, _ = paid_order(APIClient())
    with pytest.raises(ApiError):
        services.staff_fulfillment_action(order.pk, "deliver", actor=actor, data={})
    services.staff_fulfillment_action(order.pk, "pack", actor=actor, data={})
    services.staff_fulfillment_action(order.pk, "ship", actor=actor, data={"carrier": "پست", "tracking_code": "TEST123"})
    services.staff_fulfillment_action(order.pk, "deliver", actor=actor, data={})
    order.refresh_from_db()
    assert order.fulfillment_status == "delivered" and order.delivered_at


def test_refund_bounds_reference_and_repeat_completion(client, shipping):
    actor = make_user(Role.FINANCE)
    order, _ = paid_order(client)
    with pytest.raises(ApiError):
        refunds.request_refund(order.pk, amount=order.total_toman + 1, reason="آزمایش", return_id=None, actor=actor)
    refund = refunds.request_refund(order.pk, amount=order.total_toman, reason="آزمایش", return_id=None, actor=actor)
    with pytest.raises(ApiError):
        refunds.request_refund(order.pk, amount=1, reason="اضافی", return_id=None, actor=actor)
    refunds.approve(refund.pk, actor=actor)
    with pytest.raises(ApiError):
        refunds.complete(refund.pk, reference="", evidence="", actor=actor)
    refunds.complete(refund.pk, reference="LOCAL-REF-001", evidence="test only", actor=actor)
    with pytest.raises(ApiError):
        refunds.complete(refund.pk, reference="LOCAL-REF-001", evidence="test only", actor=actor)
    order.refresh_from_db()
    assert order.refunded_toman == order.total_toman
    assert order.payment_status == "refunded"


def test_returns_restock_only_accepted_quantity(client, shipping):
    actor = make_user(Role.ORDER_MANAGER)
    order, vid = paid_order(client)
    for action in ("pack", "ship", "deliver"):
        services.staff_fulfillment_action(order.pk, action, actor=actor, data={"carrier": "پست"})
    item = order.items.get()
    path = f"/api/v1/orders/{order.pk}/returns"
    payload = {"reason": "size", "items": [{"order_item_id": item.pk, "quantity": 3}]}
    assert client.post(path, payload, format="json").status_code == 400
    payload["items"][0]["quantity"] = 2
    response = client.post(path, payload, format="json")
    assert response.status_code == 201, response.content
    from apps.orders.models import ReturnRequest

    rid = ReturnRequest.objects.get(order=order).pk
    assert client.post(path, payload, format="json").status_code == 400
    returns.decide(rid, approve=True, note="", actor=actor)
    from apps.orders.models import ReturnItem

    ri = ReturnItem.objects.get(return_request_id=rid)
    with pytest.raises(ApiError):
        returns.receive(
            rid, lines=[{"return_item_id": ri.pk, "accepted_quantity": 1, "restock_quantity": 2}], note="", actor=actor
        )
    returns.receive(rid, lines=[{"return_item_id": ri.pk, "accepted_quantity": 1, "restock_quantity": 1}], note="", actor=actor)
    assert StockLevel.objects.get(variant_id=vid).on_hand == 4
    item.refresh_from_db()
    assert item.returned_quantity == 1
    with pytest.raises(ApiError):
        returns.receive(
            rid, lines=[{"return_item_id": ri.pk, "accepted_quantity": 1, "restock_quantity": 1}], note="", actor=actor
        )
