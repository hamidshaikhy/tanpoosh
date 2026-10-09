from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core import signing
from django.db import transaction
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.carts.services import get_cart
from apps.core import ratelimit
from apps.core.errors import ApiError
from apps.core.idempotency import IdempotentOperation
from apps.core.net import client_ip
from apps.core.normalize import normalize_email
from apps.core.outbox import enqueue
from apps.core.pagination import StandardPagination

from . import returns, services
from .models import Order
from .payloads import order_detail, order_summary
from .pricing import compute_quote, quote_payload

GUEST_ORDER_SALT = "tanpoosh.orders.guest-access"


class QuoteRequestSerializer(serializers.Serializer):
    coupon_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    shipping_method = serializers.SlugField(max_length=32, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)


class ContactSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)


class AddressInputSerializer(serializers.Serializer):
    recipient_name = serializers.CharField(max_length=120)
    phone = serializers.CharField(max_length=20)
    province = serializers.CharField(max_length=40)
    city = serializers.CharField(max_length=60)
    postal_code = serializers.CharField(max_length=20)
    line = serializers.CharField(max_length=300)
    plaque = serializers.CharField(max_length=20, required=False, allow_blank=True)
    unit = serializers.CharField(max_length=20, required=False, allow_blank=True)


class PlaceOrderSerializer(serializers.Serializer):
    contact = ContactSerializer()
    address_id = serializers.UUIDField(required=False, allow_null=True)
    address = AddressInputSerializer(required=False, allow_null=True)
    save_address = serializers.BooleanField(required=False, default=False)
    shipping_method = serializers.SlugField(max_length=32)
    coupon_code = serializers.CharField(max_length=40, required=False, allow_blank=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True)
    quote_fingerprint = serializers.CharField(max_length=64)


class CheckoutQuoteView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=QuoteRequestSerializer, responses=inline_serializer("Quote", {"fingerprint": serializers.CharField()}))
    def post(self, request: Request) -> Response:
        data = QuoteRequestSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        django_request = request._request
        coupon_code = data.validated_data.get("coupon_code", "")
        if coupon_code:
            if not django_request.session.session_key:
                django_request.session.save()
            actor = str(request.user.pk) if request.user.is_authenticated else django_request.session.session_key
            ratelimit.enforce("coupon.session", actor)
        services.expire_due_orders(limit=50)
        cart = get_cart(django_request)
        items = services.cart_items_for_checkout(cart) if cart else []
        email = normalize_email(data.validated_data.get("email") or (request.user.email if request.user.is_authenticated else ""))
        quote = compute_quote(
            items,
            coupon_code=coupon_code,
            shipping_code=data.validated_data.get("shipping_method") or None,
            user=request.user,
            email=email,
        )
        return Response(quote_payload(quote))


class CheckoutOrderView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=PlaceOrderSerializer, responses={201: inline_serializer("PlacedOrder", {"id": serializers.CharField()})}
    )
    def post(self, request: Request) -> Response:
        django_request = request._request
        data = PlaceOrderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        payload = {**data.validated_data}
        if payload.get("address_id"):
            payload["address_id"] = str(payload["address_id"])
        actor = (
            str(request.user.pk)
            if request.user.is_authenticated
            else (django_request.session.session_key or client_ip(django_request))
        )
        ratelimit.enforce("order_create.actor", actor)

        cart = get_cart(django_request)
        if cart is not None:
            services.expire_due_orders(variant_ids=list(cart.items.values_list("variant_id", flat=True)))
        with transaction.atomic():
            op = IdempotentOperation(django_request, "order.create", payload)
            if op.replay is not None:
                return Response(op.replay.response_body, status=op.replay.response_status)
            order = services.place_order(django_request, payload)
            body = order_detail(order)
            op.complete(201, body, resource_id=str(order.pk))
        return Response(body, status=status.HTTP_201_CREATED)


class OrderListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        qs = services.accessible_orders(request._request).prefetch_related("items").order_by("-placed_at")
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([order_summary(o) for o in page or []])


def _detail_qs(request: Request) -> Any:
    return services.accessible_orders(request._request).prefetch_related(
        "items", "events", "shipments", "returns__items", "payment_attempts"
    )


class OrderDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, order_id: str) -> Response:
        order = _detail_qs(request).filter(pk=order_id).first()
        if order is None:
            raise ApiError("not_found", "سفارش پیدا نشد.", status_code=404)
        return Response(order_detail(order))


class OrderCancelView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None)
    def post(self, request: Request, order_id: str) -> Response:
        services.cancel_unpaid(request._request, order_id)
        order = _detail_qs(request).get(pk=order_id)
        return Response(order_detail(order))


class OrderPayView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            "PaymentStart",
            {"redirect_url": serializers.CharField(), "attempt_id": serializers.CharField(), "mode": serializers.CharField()},
        ),
    )
    def post(self, request: Request, order_id: str) -> Response:
        from apps.payments.services import start_payment

        status_code, body = start_payment(request._request, order_id)
        return Response(body, status=status_code)


class ReturnItemInputSerializer(serializers.Serializer):
    order_item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1, max_value=50)


class ReturnCreateSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=20)
    description = serializers.CharField(max_length=1000, required=False, allow_blank=True)
    items = ReturnItemInputSerializer(many=True, max_length=30)


class OrderReturnView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=ReturnCreateSerializer)
    def post(self, request: Request, order_id: str) -> Response:
        data = ReturnCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        returns.create_return(request._request, order_id, data.validated_data)
        order = _detail_qs(request).get(pk=order_id)
        return Response(order_detail(order), status=status.HTTP_201_CREATED)


class GuestLookupSerializer(serializers.Serializer):
    number = serializers.CharField(max_length=20)
    email = serializers.EmailField(max_length=254)


class GuestOrderLookupView(APIView):
    """Cross-device guest order access: never reveals order data on screen. If number+email
    match a guest order, an expiring signed link is emailed to the order's address."""

    permission_classes = [AllowAny]

    @extend_schema(request=GuestLookupSerializer)
    def post(self, request: Request) -> Response:
        ratelimit.enforce("guest_order_lookup.ip", client_ip(request._request))
        data = GuestLookupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        number = data.validated_data["number"].strip().upper()
        email = normalize_email(data.validated_data["email"])
        order = Order.objects.filter(number=number, contact_email=email, is_guest=True).first()
        if order is not None:
            token = signing.dumps({"o": str(order.pk)}, salt=GUEST_ORDER_SALT, compress=True)
            enqueue(
                "email",
                {
                    "template": "guest_order_link",
                    "to": order.contact_email,
                    "context": {
                        "name": order.contact_name,
                        "number": order.number,
                        "link": f"{settings.PUBLIC_BASE_URL}/orders/access#token={token}",
                        "hours": settings.GUEST_ORDER_LINK_TIMEOUT // 3600,
                    },
                },
                dedupe_key=f"guest-link:{order.pk}:{token[-16:]}",
            )
        return Response(
            {"ok": True, "detail": "اگر سفارشی با این مشخصات ثبت شده باشد، پیوند مشاهدهٔ آن به ایمیل سفارش ارسال می‌شود."}
        )


class GuestOrderAccessView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=inline_serializer("GuestAccess", {"token": serializers.CharField()}))
    def post(self, request: Request) -> Response:
        token = str(request.data.get("token", ""))[:400]
        try:
            data = signing.loads(token, salt=GUEST_ORDER_SALT, max_age=settings.GUEST_ORDER_LINK_TIMEOUT)
        except signing.BadSignature:
            raise ApiError("invalid_token", "پیوند نامعتبر است یا منقضی شده است.") from None
        order = Order.objects.filter(pk=data.get("o"), is_guest=True).first()
        if order is None:
            raise ApiError("invalid_token", "پیوند نامعتبر است یا منقضی شده است.")
        services.remember_guest_order(request._request, order)
        return Response({"order_id": str(order.pk)})
