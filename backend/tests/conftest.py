from __future__ import annotations

import itertools
import uuid
from typing import Any

import pyotp
import pytest
import redis
from django.conf import settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts import mfa
from apps.accounts.models import Role, User
from apps.catalog.models import Category, Product, ProductColor, Variant
from apps.inventory.models import StockLevel
from apps.orders.models import ShippingMethod
from apps.promotions.models import Coupon

_seq = itertools.count(1)


@pytest.fixture(autouse=True)
def _flush_redis() -> None:
    for url in (settings.RATELIMIT_REDIS_URL, settings.CACHES["default"]["LOCATION"]):
        redis.Redis.from_url(url).flushdb()


@pytest.fixture(autouse=True)
def _media(tmp_path: Any, settings: Any) -> None:
    settings.MEDIA_ROOT = str(tmp_path / "media")


def make_product(
    *,
    price: int = 1_000_000,
    stock: int = 5,
    size: str = "M",
    color: str = "black",
    slug: str | None = None,
    category: Category | None = None,
    studio_slot: str = "none",
) -> tuple[Product, Variant]:
    n = next(_seq)
    category = category or Category.objects.create(name=f"دسته {n}", slug=f"cat-{n}")
    product = Product.objects.create(
        name=f"محصول {n}",
        slug=slug or f"product-{n}",
        category=category,
        status=Product.Status.PUBLISHED,
        published_at=timezone.now(),
        studio_slot=studio_slot,
    )
    c = ProductColor.objects.create(product=product, code=color, name="مشکی", hex="#111111")
    v = Variant.objects.create(product=product, color=c, size=size, sku=f"TP-T{n}-{size}", price_toman=price)
    StockLevel.objects.create(variant=v, on_hand=stock)
    product.rebuild_search_text()
    product.save()
    return product, v


@pytest.fixture
def shipping(db: Any) -> None:
    ShippingMethod.objects.create(
        code="standard", name="ارسال عادی", fee_toman=150_000, free_threshold_toman=5_000_000, sort_order=1
    )
    ShippingMethod.objects.create(code="express", name="ارسال سریع", fee_toman=250_000, free_threshold_toman=None, sort_order=2)


@pytest.fixture
def tan10(db: Any) -> Coupon:
    return Coupon.objects.create(code="TAN10", kind="percent", value=10, per_customer_limit=3)


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def make_user(role: str = Role.CUSTOMER, *, username: str | None = None, password: str = "Sufficiently-Long-Pass-91") -> User:
    n = next(_seq)
    user = User.objects.create_user(
        username=username or f"user{n}", email=f"user{n}@example.com", password=password, role=role, first_name="کاربر"
    )
    return user


def staff_client(role: str, *, enrol_mfa: bool = True) -> tuple[APIClient, User]:
    user = make_user(role)
    c = APIClient()
    resp = c.post("/api/v1/auth/login", {"identifier": user.username, "password": "Sufficiently-Long-Pass-91"}, format="json")
    assert resp.status_code == 200, resp.content
    if enrol_mfa:
        secret, _ = mfa.start_enrollment(user)
        code = pyotp.TOTP(secret).now()
        resp = c.post("/api/v1/auth/mfa/confirm", {"code": code}, format="json")
        assert resp.status_code == 200, resp.content
        c._totp_secret = secret  # type: ignore[attr-defined]
    return c, user


def login(c: APIClient, user: User, password: str = "Sufficiently-Long-Pass-91") -> None:
    resp = c.post("/api/v1/auth/login", {"identifier": user.username, "password": password}, format="json")
    assert resp.status_code == 200, resp.content


ADDRESS = {
    "recipient_name": "سارا محمدی",
    "phone": "09121234567",
    "province": "تهران",
    "city": "تهران",
    "postal_code": "1435916471",
    "line": "خیابان ولیعصر، پلاک ۱۲",
}


def checkout(
    c: APIClient,
    *,
    coupon: str = "",
    shipping_method: str = "standard",
    email: str = "buyer@example.com",
    key: str | None = None,
    extra: dict[str, Any] | None = None,
) -> Any:
    quote = c.post(
        "/api/v1/checkout/quote", {"coupon_code": coupon, "shipping_method": shipping_method, "email": email}, format="json"
    ).json()
    body = {
        "contact": {"name": "سارا محمدی", "phone": "09121234567", "email": email},
        "address": ADDRESS,
        "shipping_method": shipping_method,
        "coupon_code": coupon,
        "quote_fingerprint": quote["fingerprint"],
        **(extra or {}),
    }
    return c.post("/api/v1/checkout/orders", body, format="json", HTTP_IDEMPOTENCY_KEY=key or uuid.uuid4().hex)


def flush_outbox() -> None:
    """Outbox events are normally dispatched on commit by Celery; tests dispatch synchronously."""
    from apps.core.tasks import dispatch_pending_outbox

    dispatch_pending_outbox()
