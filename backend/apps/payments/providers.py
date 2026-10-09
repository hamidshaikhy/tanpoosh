"""Payment provider adapters.

ZarinPal v4 (https://www.zarinpal.com/docs/paymentGateway/connectToGateway):
  request  POST {base}/pg/v4/payment/request.json  {merchant_id, amount, currency, description, callback_url, metadata}
           -> data.code == 100, data.authority
  redirect {base}/pg/StartPay/{authority}
  callback GET callback_url?Authority=...&Status=OK|NOK   (UNTRUSTED trigger; carries no signature)
  verify   POST {base}/pg/v4/payment/verify.json   {merchant_id, amount, authority}
           -> data.code 100 (verified now) | 101 (already verified); errors.code -51 failed, -50 amount mismatch, ...
  inquiry  POST {base}/pg/v4/payment/inquiry.json  {merchant_id, authority} -> data.status VERIFIED|PAID|IN_BANK|FAILED|REVERSED

Currency convention (one explicit, tested conversion): amounts are stored in TOMAN; the adapter
sends IRR with amount_rial = amount_toman * 10, records that provider amount/currency on the
attempt, and verifies with exactly the same stored values (never re-derived, never doubled).
Error responses return `errors` as an object ({"code","message",...}) — parsed defensively.
"""

from __future__ import annotations

import logging
import secrets
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger("tanpoosh.payments")

RIAL_PER_TOMAN = 10


def toman_to_rial(amount_toman: int) -> int:
    if amount_toman <= 0:
        raise ValueError("amount must be positive")
    return int(amount_toman) * RIAL_PER_TOMAN


@dataclass
class RequestResult:
    ok: bool
    authority: str | None = None
    redirect_url: str | None = None
    code: int | None = None
    message: str = ""
    fee: int | None = None
    transient: bool = False


@dataclass
class VerifyResult:
    status: str  # verified | already_verified | failed | mismatch | unknown
    ref_id: str = ""
    code: int | None = None
    message: str = ""
    fee: int | None = None


@dataclass
class InquiryResult:
    status: str  # VERIFIED | PAID | IN_BANK | FAILED | REVERSED | UNKNOWN
    code: int | None = None


class PaymentProvider(Protocol):
    name: str
    mode: str
    currency: str

    def provider_amount(self, amount_toman: int) -> int: ...
    def request(self, *, amount: int, description: str, callback_url: str, metadata: dict[str, str]) -> RequestResult: ...
    def verify(self, *, amount: int, authority: str) -> VerifyResult: ...
    def inquiry(self, *, authority: str) -> InquiryResult: ...


def _parse(response: httpx.Response) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        body = response.json()
    except ValueError:
        return {}, {}
    if not isinstance(body, dict):
        return {}, {}
    data = body.get("data") if isinstance(body.get("data"), dict) else {}
    errors_raw = body.get("errors")
    if isinstance(errors_raw, dict):
        errors = errors_raw
    elif isinstance(errors_raw, list) and errors_raw and isinstance(errors_raw[0], dict):
        errors = errors_raw[0]
    else:
        errors = {}
    return data, errors


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


class ZarinPalProvider:
    name = "zarinpal"
    currency = "IRR"
    BASES = {"sandbox": "https://sandbox.zarinpal.com", "live": "https://payment.zarinpal.com"}

    def __init__(self) -> None:
        self.mode = settings.ZARINPAL_MODE
        if self.mode not in self.BASES:
            raise ImproperlyConfigured("ZARINPAL_MODE must be sandbox or live")
        self.merchant_id = settings.ZARINPAL_MERCHANT_ID
        if len(self.merchant_id) != 36:
            raise ImproperlyConfigured("ZARINPAL_MERCHANT_ID must be a 36-character merchant code")
        self.base = self.BASES[self.mode]
        self.timeout = httpx.Timeout(settings.ZARINPAL_TIMEOUT_SECONDS, connect=5.0)

    def provider_amount(self, amount_toman: int) -> int:
        return toman_to_rial(amount_toman)

    def _post(self, path: str, payload: dict[str, Any]) -> httpx.Response:
        return httpx.post(
            f"{self.base}{path}",
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=self.timeout,
        )

    def request(self, *, amount: int, description: str, callback_url: str, metadata: dict[str, str]) -> RequestResult:
        payload = {
            "merchant_id": self.merchant_id,
            "amount": amount,
            "currency": self.currency,
            "description": description[:200],
            "callback_url": callback_url,
            "metadata": {k: v for k, v in metadata.items() if v},
        }
        try:
            response = self._post("/pg/v4/payment/request.json", payload)
        except httpx.HTTPError as exc:
            logger.warning("ZarinPal request transport error: %s", exc.__class__.__name__)
            return RequestResult(ok=False, message="transport_error", transient=True)
        data, errors = _parse(response)
        code = _int_or_none(data.get("code")) if data else _int_or_none(errors.get("code"))
        authority = data.get("authority") if data else None
        if code == 100 and isinstance(authority, str) and 10 <= len(authority) <= 64:
            return RequestResult(
                ok=True,
                authority=authority,
                redirect_url=f"{self.base}/pg/StartPay/{authority}",
                code=code,
                fee=_int_or_none(data.get("fee")),
            )
        return RequestResult(
            ok=False,
            code=code,
            message=str(errors.get("message") or data.get("message") or f"HTTP {response.status_code}")[:200],
            transient=response.status_code >= 500,
        )

    def verify(self, *, amount: int, authority: str) -> VerifyResult:
        payload = {"merchant_id": self.merchant_id, "amount": amount, "authority": authority}
        try:
            response = self._post("/pg/v4/payment/verify.json", payload)
        except httpx.HTTPError as exc:
            logger.warning("ZarinPal verify transport error: %s", exc.__class__.__name__)
            return VerifyResult(status="unknown", message="transport_error")
        if response.status_code >= 500:
            return VerifyResult(status="unknown", message=f"HTTP {response.status_code}")
        data, errors = _parse(response)
        code = _int_or_none(data.get("code")) if data else _int_or_none(errors.get("code"))
        ref_id = str(data.get("ref_id") or "") if data else ""
        if code in (100, 101) and ref_id:
            return VerifyResult(
                status="verified" if code == 100 else "already_verified",
                ref_id=ref_id[:40],
                code=code,
                fee=_int_or_none(data.get("fee")),
            )
        message = str(errors.get("message") or data.get("message") or "")[:200]
        if code == -50:
            return VerifyResult(status="mismatch", code=code, message=message)
        if code in (-51, -54, -53, -55, -9, -11, -15, -19):
            return VerifyResult(status="failed", code=code, message=message)
        return VerifyResult(status="unknown", code=code, message=message or f"HTTP {response.status_code}")

    def inquiry(self, *, authority: str) -> InquiryResult:
        try:
            response = self._post("/pg/v4/payment/inquiry.json", {"merchant_id": self.merchant_id, "authority": authority})
        except httpx.HTTPError:
            return InquiryResult(status="UNKNOWN")
        data, errors = _parse(response)
        status = str(data.get("status") or "").upper() if data else ""
        if status in {"VERIFIED", "PAID", "IN_BANK", "FAILED", "REVERSED"}:
            return InquiryResult(status=status, code=_int_or_none(data.get("code")))
        return InquiryResult(status="UNKNOWN", code=_int_or_none(errors.get("code")))


class MockProvider:
    """DEVELOPMENT/TEST ONLY offline gateway. Refuses to exist in production."""

    name = "mock"
    mode = "mock"
    currency = "IRR"

    def __init__(self) -> None:
        if settings.IS_PRODUCTION or not settings.PAYMENT_MOCK_ENABLED:
            raise ImproperlyConfigured("Mock payment gateway is disabled")

    def provider_amount(self, amount_toman: int) -> int:
        return toman_to_rial(amount_toman)

    def request(self, *, amount: int, description: str, callback_url: str, metadata: dict[str, str]) -> RequestResult:
        from .models import MockGatewayTransaction

        authority = "MOCK" + secrets.token_hex(14).upper()
        MockGatewayTransaction.objects.create(
            authority=authority, amount=amount, currency=self.currency, callback_url=callback_url
        )
        return RequestResult(
            ok=True,
            authority=authority,
            redirect_url=f"{settings.PUBLIC_BASE_URL}/payment/mock?authority={authority}",
            code=100,
        )

    def verify(self, *, amount: int, authority: str) -> VerifyResult:
        from django.db import transaction

        from .models import MockGatewayTransaction

        with transaction.atomic():
            tx = MockGatewayTransaction.objects.select_for_update().filter(authority=authority).first()
            if tx is None:
                return VerifyResult(status="failed", code=-54, message="Invalid authority")
            if tx.state != MockGatewayTransaction.State.PAID:
                return VerifyResult(status="failed", code=-51, message="Session is not valid")
            if tx.amount != amount:
                return VerifyResult(status="mismatch", code=-50, message="amount mismatch")
            if tx.verified:
                return VerifyResult(status="already_verified", ref_id=tx.ref_id, code=101)
            tx.verified = True
            tx.ref_id = tx.ref_id or str(secrets.randbelow(10**9) + 10**9)
            tx.save(update_fields=["verified", "ref_id"])
            return VerifyResult(status="verified", ref_id=tx.ref_id, code=100)

    def inquiry(self, *, authority: str) -> InquiryResult:
        from .models import MockGatewayTransaction

        tx = MockGatewayTransaction.objects.filter(authority=authority).first()
        if tx is None:
            return InquiryResult(status="UNKNOWN")
        if tx.state == MockGatewayTransaction.State.PAID:
            return InquiryResult(status="VERIFIED" if tx.verified else "PAID")
        if tx.state == MockGatewayTransaction.State.PENDING:
            return InquiryResult(status="IN_BANK")
        return InquiryResult(status="FAILED")


def get_provider() -> PaymentProvider:
    if settings.PAYMENT_PROVIDER == "mock":
        return MockProvider()
    if settings.PAYMENT_PROVIDER == "zarinpal":
        return ZarinPalProvider()
    raise ImproperlyConfigured(f"Unknown PAYMENT_PROVIDER {settings.PAYMENT_PROVIDER!r}")
