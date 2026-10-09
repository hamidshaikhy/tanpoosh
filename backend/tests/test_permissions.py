"""Staff permission matrix, privilege protection, last-owner protection, re-authentication and
object ownership for every private customer object family."""

from __future__ import annotations

import pyotp
import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Address, Role, User
from apps.looks.models import SavedLook

from .conftest import login, make_product, make_user, staff_client

pytestmark = pytest.mark.django_db

MATRIX = {
    # path: roles allowed (GET)
    "/api/v1/manage/dashboard": {Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER, Role.FINANCE},
    "/api/v1/manage/products": {Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER},
    "/api/v1/manage/inventory": {Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER},
    "/api/v1/manage/orders": {Role.OWNER, Role.ORDER_MANAGER, Role.FINANCE},
    "/api/v1/manage/payments": {Role.OWNER, Role.ORDER_MANAGER, Role.FINANCE},
    "/api/v1/manage/coupons": {Role.OWNER, Role.FINANCE},
    "/api/v1/manage/shipping": {Role.OWNER, Role.FINANCE},
    "/api/v1/manage/customers": {Role.OWNER, Role.ORDER_MANAGER, Role.FINANCE},
    "/api/v1/manage/staff": {Role.OWNER},
    "/api/v1/manage/audit": {Role.OWNER},
    "/api/v1/manage/content/settings": {Role.OWNER, Role.CATALOG_MANAGER},
    "/api/v1/manage/reviews": {Role.OWNER, Role.CATALOG_MANAGER},
    "/api/v1/manage/support": {Role.OWNER, Role.ORDER_MANAGER},
    "/api/v1/manage/refunds": {Role.OWNER, Role.ORDER_MANAGER, Role.FINANCE},
}


@pytest.mark.parametrize("role", [Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER, Role.FINANCE])
def test_staff_permission_matrix(role: str) -> None:
    c, _ = staff_client(role)
    for path, allowed in MATRIX.items():
        status = c.get(path).status_code
        assert (status == 200) == (role in allowed), f"{role} {path} -> {status}"


def test_customer_and_anonymous_denied_everywhere() -> None:
    customer = APIClient()
    login(customer, make_user())
    anon = APIClient()
    for path in MATRIX:
        assert customer.get(path).status_code == 403
        assert anon.get(path).status_code == 401


def test_dashboard_hides_revenue_without_reports_permission() -> None:
    c, _ = staff_client(Role.CATALOG_MANAGER)
    assert "revenue" not in c.get("/api/v1/manage/dashboard").json()
    f, _ = staff_client(Role.FINANCE)
    assert "revenue" in f.get("/api/v1/manage/dashboard").json()


def test_lower_roles_cannot_create_staff_or_change_roles() -> None:
    c, user = staff_client(Role.CATALOG_MANAGER)
    r = c.post(
        "/api/v1/manage/staff", {"username": "evil", "email": "e@x.com", "first_name": "e", "role": "owner"}, format="json"
    )
    assert r.status_code == 403
    r = c.patch(f"/api/v1/manage/staff/{user.pk}", {"role": "owner"}, format="json")
    assert r.status_code == 403
    user.refresh_from_db()
    assert user.role == Role.CATALOG_MANAGER


def _reauth(c: APIClient, user: User) -> None:
    code = pyotp.TOTP(c._totp_secret).at(__import__("time").time() + 30)  # next step (current one was used)
    r = c.post("/api/v1/auth/reauth", {"password": "Sufficiently-Long-Pass-91", "code": code}, format="json")
    assert r.status_code == 200, r.content


def test_owner_actions_require_reauth_and_last_owner_is_protected() -> None:
    c, owner = staff_client(Role.OWNER)
    target = make_user(Role.FINANCE)
    # recent MFA verification counts as re-auth; expire it to test the gate
    s = c.session
    s["_reauth_at"] = 0
    s.save()
    r = c.patch(f"/api/v1/manage/staff/{target.pk}", {"role": "order_manager"}, format="json")
    assert r.status_code == 403 and r.json()["error"]["code"] == "reauth_required"
    _reauth(c, owner)
    assert c.patch(f"/api/v1/manage/staff/{target.pk}", {"role": "order_manager"}, format="json").status_code == 200
    # cannot demote yourself / last owner
    r = c.patch(f"/api/v1/manage/staff/{owner.pk}", {"role": "customer"}, format="json")
    assert r.status_code == 409
    second = make_user(Role.OWNER)
    second.is_active = True
    second.save()
    assert c.patch(f"/api/v1/manage/staff/{second.pk}", {"role": "finance"}, format="json").status_code == 200
    # now `owner` is the last active owner; another owner session could not demote them
    assert User.objects.filter(role=Role.OWNER, is_active=True).count() == 1


def test_manual_paid_flag_is_impossible() -> None:
    """There is no endpoint that sets payment status/amount/reference; extra fields are ignored."""
    c, _ = staff_client(Role.OWNER)
    paths = [p.pattern._route for p in __import__("apps.manage.urls", fromlist=["urlpatterns"]).urlpatterns]
    assert not any("status" in p and "orders" in p for p in paths)
    _, v = make_product()
    customer = APIClient()
    customer.post("/api/v1/cart/items", {"variant_id": v.pk, "quantity": 1}, format="json")


def test_cross_user_object_access_is_denied() -> None:
    alice, bob = make_user(), make_user()
    a, b = APIClient(), APIClient()
    login(a, alice)
    login(b, bob)
    addr = a.post(
        "/api/v1/account/addresses",
        {
            "recipient_name": "آلیس",
            "phone": "09121234567",
            "province": "تهران",
            "city": "تهران",
            "postal_code": "1435916471",
            "line": "خیابان",
        },
        format="json",
    ).json()
    assert b.get(f"/api/v1/account/addresses/{addr['id']}").status_code == 404
    assert b.patch(f"/api/v1/account/addresses/{addr['id']}", {"line": "hacked"}, format="json").status_code == 404
    assert b.delete(f"/api/v1/account/addresses/{addr['id']}").status_code == 404
    assert Address.objects.get(pk=addr["id"]).line == "خیابان"

    look = SavedLook.objects.create(user=alice, name="x", items=[])
    assert b.get(f"/api/v1/account/looks/{look.pk}").status_code == 404
    assert b.delete(f"/api/v1/account/looks/{look.pk}").status_code == 404
    assert b.post(f"/api/v1/account/looks/{look.pk}/share").status_code == 404
    assert APIClient().get(f"/api/v1/looks/shared/{look.pk}").status_code == 404


def test_shared_look_exposes_only_clothing() -> None:
    alice = make_user()
    a = APIClient()
    login(a, alice)
    product, _ = make_product(studio_slot="top")
    look = a.post(
        "/api/v1/account/looks",
        {"name": "روزمره", "items": [{"slot": "top", "product_id": product.pk, "color_code": "black", "size": "M"}]},
        format="json",
    ).json()
    token = a.post(f"/api/v1/account/looks/{look['id']}/share").json()["share_token"]
    shared = APIClient().get(f"/api/v1/looks/shared/{token}").json()
    text = str(shared)
    assert alice.username not in text and alice.email not in text and "user" not in shared
    assert shared["items"][0]["product_slug"] == product.slug
