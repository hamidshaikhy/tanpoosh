"""ZarinPal v4 adapter: request/verify/inquiry parsing against the documented response shapes
(including the sandbox's object-shaped `errors`), units and transport failures. No network."""

from __future__ import annotations

import httpx
import pytest

from apps.payments.providers import ZarinPalProvider


@pytest.fixture
def zp(settings):  # type: ignore[no-untyped-def]
    settings.PAYMENT_PROVIDER = "zarinpal"
    settings.ZARINPAL_MODE = "sandbox"
    settings.ZARINPAL_MERCHANT_ID = "8bb06c09-6551-4609-a7c1-2940690ca579"
    return ZarinPalProvider()


def _resp(status: int, payload: object) -> httpx.Response:
    return httpx.Response(status, json=payload, request=httpx.Request("POST", "https://sandbox.zarinpal.com"))


def test_request_success(zp, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    sent = {}

    def fake_post(url, json, headers, timeout):  # type: ignore[no-untyped-def]
        sent.update(json)
        return _resp(
            200,
            {
                "data": {
                    "code": 100,
                    "message": "Success",
                    "authority": "S000000000000000000000000000000ABCD",
                    "fee": 3600,
                    "fee_type": "Merchant",
                },
                "errors": [],
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    r = zp.request(
        amount=zp.provider_amount(10_800_000), description="d", callback_url="https://x/cb", metadata={"mobile": "09121234567"}
    )
    assert r.ok and r.authority.startswith("S") and r.redirect_url.endswith("/pg/StartPay/" + r.authority)
    assert sent["amount"] == 108_000_000 and sent["currency"] == "IRR"


def test_request_error_object_shape(zp, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: _resp(
            200, {"data": [], "errors": {"code": -9, "message": "The input params invalid, validation error.", "validations": []}}
        ),
    )
    r = zp.request(amount=10000, description="d", callback_url="https://x/cb", metadata={})
    assert not r.ok and r.code == -9 and not r.transient


@pytest.mark.parametrize(
    ("payload", "status"),
    [
        ({"data": {"code": 100, "ref_id": 201, "card_pan": "5022****5995", "fee": 0}, "errors": []}, "verified"),
        ({"data": {"code": 101, "ref_id": 201}, "errors": []}, "already_verified"),
        ({"data": {}, "errors": {"code": -51, "message": "Session is not valid, session is not active paid try."}}, "failed"),
        ({"data": {}, "errors": {"code": -50, "message": "amounts values is not the same"}}, "mismatch"),
        ({"data": {}, "errors": {"code": -52, "message": "Oops!!"}}, "unknown"),
        ({"weird": True}, "unknown"),
    ],
)
def test_verify_outcomes(zp, monkeypatch, payload, status) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(200, payload))
    assert zp.verify(amount=108_000_000, authority="S0000").status == status


def test_verify_never_stores_card_data(zp, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        httpx,
        "post",
        lambda *a, **k: _resp(
            200, {"data": {"code": 100, "ref_id": 9, "card_pan": "502229******5995", "card_hash": "AB"}, "errors": []}
        ),
    )
    result = zp.verify(amount=1000, authority="S1")
    assert "5022" not in repr(result)


def test_transport_errors_are_unknown_not_failed(zp, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    def boom(*a, **k):  # type: ignore[no-untyped-def]
        raise httpx.ReadTimeout("timeout")

    monkeypatch.setattr(httpx, "post", boom)
    assert zp.verify(amount=1000, authority="S1").status == "unknown"
    assert zp.request(amount=1000, description="d", callback_url="https://x", metadata={}).transient
    assert zp.inquiry(authority="S1").status == "UNKNOWN"
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _resp(502, {}))
    assert zp.verify(amount=1000, authority="S1").status == "unknown"


def test_invalid_merchant_config(settings) -> None:  # type: ignore[no-untyped-def]
    from django.core.exceptions import ImproperlyConfigured

    settings.ZARINPAL_MERCHANT_ID = "short"
    with pytest.raises(ImproperlyConfigured):
        ZarinPalProvider()
