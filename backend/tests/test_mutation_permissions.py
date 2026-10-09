"""Independent least-privilege matrix for every management mutation route."""

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Role
from tests.conftest import login, make_user, staff_client

pytestmark = pytest.mark.django_db
C = {Role.OWNER, Role.CATALOG_MANAGER}
ORDERS = {Role.OWNER, Role.ORDER_MANAGER}
F = {Role.OWNER, Role.FINANCE}
OWNER = {Role.OWNER}
U = "00000000-0000-0000-0000-000000000001"

# Expected policy is separate from the permission maps used in implementation.
MUTATIONS = [
    ("POST", "products", C),
    ("PATCH", "products/1", C),
    ("DELETE", "products/1", C),
    ("POST", "products/1/status", C),
    ("POST", "products/1/media", C),
    ("POST", "products/1/media/reorder", C),
    ("PATCH", "products/1/media/1", C),
    ("DELETE", "products/1/media/1", C),
    ("POST", "categories", C),
    ("PATCH", "categories/1", C),
    ("DELETE", "categories/1", C),
    ("POST", "collections", C),
    ("PATCH", "collections/1", C),
    ("DELETE", "collections/1", C),
    ("POST", "inventory/1/adjust", C),
    ("PATCH", "inventory/1/threshold", C),
    ("POST", f"orders/{U}/fulfillment", ORDERS),
    ("POST", f"orders/{U}/cancel", ORDERS),
    ("POST", f"orders/{U}/note", ORDERS),
    ("POST", f"orders/{U}/resolve-review", F),
    ("POST", f"orders/{U}/refunds", F),
    ("POST", "payments/reconcile", F),
    ("POST", f"payments/{U}/reconcile", F),
    ("POST", f"refunds/{U}/approve", F),
    ("POST", f"refunds/{U}/complete", F),
    ("POST", f"refunds/{U}/reject", F),
    ("POST", f"refunds/{U}/processing", F),
    ("POST", f"refunds/{U}/fail", F),
    ("POST", f"returns/{U}/decide", ORDERS),
    ("POST", f"returns/{U}/receive", ORDERS),
    ("POST", "coupons", F),
    ("PATCH", "coupons/1", F),
    ("PATCH", "shipping/1", F),
    ("PATCH", "content/settings", C),
    ("PATCH", "content/pages/about", C),
    ("POST", "staff", OWNER),
    ("PATCH", f"staff/{U}", OWNER),
    ("POST", f"staff/{U}", OWNER),
    ("POST", "reviews/1/moderate", C),
    ("PATCH", f"support/{U}", ORDERS),
    ("POST", f"support/{U}", ORDERS),
    ("POST", f"customers/{U}", OWNER),
]


@pytest.mark.parametrize("role", [Role.CATALOG_MANAGER, Role.ORDER_MANAGER, Role.FINANCE, Role.CUSTOMER, "anonymous"])
def test_forbidden_mutations_fail_before_object_lookup(role):
    if role == "anonymous":
        c = APIClient()
    elif role == Role.CUSTOMER:
        c = APIClient()
        login(c, make_user())
    else:
        c, _ = staff_client(role)
    for method, route, allowed in MUTATIONS:
        if role in allowed:
            continue
        response = c.generic(method, "/api/v1/manage/" + route, "{}", content_type="application/json")
        assert response.status_code == (401 if role == "anonymous" else 403), (role, method, route, response.content)


def test_mutation_inventory_covers_actual_endpoints():
    # A new management verb cannot silently escape the independent matrix.
    import re

    from apps.manage.urls import urlpatterns

    inventory = {
        (method, re.sub(r"<[^:>]+:([^>]+)>", "{}", p.pattern._route))
        for p in urlpatterns
        for method in p.callback.view_class.permission_map
        if method in {"POST", "PATCH", "DELETE"}
    }
    values = {"1", U, "about", "approve", "complete", "reject", "processing", "fail"}
    covered = {
        (method, "/".join("{}" if part in values else part for part in route.split("/"))) for method, route, _ in MUTATIONS
    }
    assert inventory <= covered
