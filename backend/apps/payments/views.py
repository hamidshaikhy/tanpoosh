from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings
from django.db import transaction
from django.http import HttpResponseRedirect
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import ApiError

from .models import MockGatewayTransaction, PaymentAttempt
from .providers import get_provider
from .services import handle_callback


class PaymentCallbackView(APIView):
    """Browser return from the gateway: GET ?Authority=...&Status=OK|NOK.

    UNTRUSTED trigger. It never marks anything paid itself — it looks up the known attempt by
    authority and performs server-to-server verification with the stored amount. The redirect
    target is our configured result page (no caller-supplied URLs) with only the order id,
    which is readable solely by the session that owns the order.
    """

    permission_classes = [AllowAny]

    @extend_schema(exclude=True)
    def get(self, request: Request) -> HttpResponseRedirect:
        authority = str(request.query_params.get("Authority", ""))[:64]
        provider = get_provider()
        attempt = handle_callback(authority, provider.name) if authority else None
        params = {"order": str(attempt.order_id)} if attempt else {"status": "unknown"}
        response = HttpResponseRedirect(f"{settings.PAYMENT_RESULT_URL}?{urlencode(params)}")
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        return response


class PaymentStatusView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, order_id: str) -> Response:
        from apps.orders.payloads import order_detail
        from apps.orders.services import get_accessible_order

        order = get_accessible_order(request._request, order_id)
        detail = order_detail(order)
        return Response(
            {
                "order_id": detail["id"],
                "number": detail["number"],
                "payment_status": detail["payment_status"],
                "payment_status_label": detail["payment_status_label"],
                "fulfillment_status": detail["fulfillment_status"],
                "total_toman": detail["total_toman"],
                "payment_reference": detail["payment_reference"],
                "is_test": detail["is_test"],
                "payment_mode": detail["payment_mode"],
                "can_pay": detail["can_pay"],
                "last_attempt": detail["payment_attempts"][0] if detail["payment_attempts"] else None,
            }
        )


# --- DEVELOPMENT/TEST-ONLY mock gateway ---------------------------------------------------


def _require_mock() -> None:
    if settings.IS_PRODUCTION or not settings.PAYMENT_MOCK_ENABLED or settings.PAYMENT_PROVIDER != "mock":
        raise ApiError("not_found", status_code=404)


class MockGatewayView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(tags=["Development mock gateway"])
    def get(self, request: Request, authority: str) -> Response:
        _require_mock()
        tx = MockGatewayTransaction.objects.filter(authority=authority).first()
        if tx is None:
            raise ApiError("not_found", status_code=404)
        attempt = PaymentAttempt.objects.filter(authority=authority).select_related("order").first()
        return Response(
            {
                "authority": tx.authority,
                "amount": tx.amount,
                "currency": tx.currency,
                "state": tx.state,
                "order_number": attempt.order.number if attempt else "",
                "notice": "درگاه آزمایشی توسعه (Mock) — هیچ پولی جابه‌جا نمی‌شود.",
            }
        )


class MockCompleteSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=["success", "failure", "cancel"])


class MockGatewayCompleteView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(tags=["Development mock gateway"])
    def post(self, request: Request, authority: str) -> Response:
        _require_mock()
        data = MockCompleteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        outcome = data.validated_data["outcome"]
        with transaction.atomic():
            tx = MockGatewayTransaction.objects.select_for_update().filter(authority=authority).first()
            if tx is None:
                raise ApiError("not_found", status_code=404)
            if tx.state == MockGatewayTransaction.State.PENDING:
                tx.state = {
                    "success": MockGatewayTransaction.State.PAID,
                    "failure": MockGatewayTransaction.State.FAILED,
                    "cancel": MockGatewayTransaction.State.CANCELLED,
                }[outcome]
                tx.save(update_fields=["state"])
        status_param = "OK" if tx.state == MockGatewayTransaction.State.PAID else "NOK"
        return Response({"redirect_url": f"{tx.callback_url}?{urlencode({'Authority': authority, 'Status': status_param})}"})
