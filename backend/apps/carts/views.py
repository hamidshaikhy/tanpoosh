from __future__ import annotations

import contextlib

from django.db import IntegrityError
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomerAuthenticated
from apps.catalog.models import Product
from apps.catalog.selectors import with_card_data, with_rating
from apps.catalog.serializers import build_card
from apps.core.errors import ApiError

from . import services
from .models import WishlistItem


class CartLineSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    variant_id = serializers.IntegerField()
    product_slug = serializers.CharField()
    product_name = serializers.CharField()
    color_code = serializers.CharField()
    color_name = serializers.CharField()
    color_hex = serializers.CharField()
    size = serializers.CharField()
    sku = serializers.CharField()
    unit_price_toman = serializers.IntegerField()
    quantity = serializers.IntegerField()
    line_total_toman = serializers.IntegerField()
    image = serializers.CharField(allow_null=True)
    image_alt = serializers.CharField()
    max_quantity = serializers.IntegerField()
    issue = serializers.CharField(allow_null=True)


class CartSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    items = CartLineSerializer(many=True)
    item_count = serializers.IntegerField()
    subtotal_toman = serializers.IntegerField()
    currency = serializers.CharField()
    has_issues = serializers.BooleanField()


CartOut = CartSerializer


class AddItemSerializer(serializers.Serializer):
    variant_id = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=10, default=1)


class BatchSerializer(serializers.Serializer):
    items = AddItemSerializer(many=True, max_length=8)


class UpdateItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1, max_value=10)
    cart_version = serializers.IntegerField(required=False, min_value=0)


class CartView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=CartOut)
    def get(self, request: Request) -> Response:
        return Response(services.cart_payload(services.get_cart(request._request)))

    @extend_schema(responses=CartOut)
    def delete(self, request: Request) -> Response:
        services.clear(request._request)
        return Response(services.cart_payload(services.get_cart(request._request)))


class CartItemsView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=AddItemSerializer, responses={201: CartOut})
    def post(self, request: Request) -> Response:
        data = AddItemSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        cart = services.add_item(request._request, data.validated_data["variant_id"], data.validated_data["quantity"])
        return Response(services.cart_payload(cart), status=status.HTTP_201_CREATED)


class CartBatchView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=BatchSerializer, responses={201: CartOut})
    def post(self, request: Request) -> Response:
        data = BatchSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        cart = services.add_items_batch(request._request, data.validated_data["items"])
        return Response(services.cart_payload(cart), status=status.HTTP_201_CREATED)


class CartItemDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=UpdateItemSerializer, responses=CartOut)
    def patch(self, request: Request, item_id: int) -> Response:
        data = UpdateItemSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        cart = services.update_item(
            request._request, item_id, data.validated_data["quantity"], data.validated_data.get("cart_version")
        )
        return Response(services.cart_payload(cart))

    @extend_schema(responses=CartOut)
    def delete(self, request: Request, item_id: int) -> Response:
        cart = services.remove_item(request._request, item_id)
        return Response(services.cart_payload(cart))


class WishlistSerializer(serializers.Serializer):
    product_slug = serializers.SlugField(max_length=120)
    color_code = serializers.SlugField(max_length=32, required=False, allow_blank=True)


class WishlistView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(
        responses=inline_serializer(
            "WishlistEntry",
            {
                "product": serializers.DictField(),
                "color_code": serializers.CharField(),
                "created_at": serializers.DateTimeField(),
            },
            many=True,
        )
    )
    def get(self, request: Request) -> Response:
        rows = list(WishlistItem.objects.filter(user=request.user).order_by("-created_at")[:100])
        products = {p.pk: p for p in with_rating(with_card_data(Product.objects.filter(pk__in=[r.product_id for r in rows])))}
        out = []
        for r in rows:
            p = products.get(r.product_id)
            if p is None:
                continue
            card = build_card(p)
            card["available"] = p.status == Product.Status.PUBLISHED
            out.append({"product": card, "color_code": r.color_code, "created_at": r.created_at})
        return Response(out)

    @extend_schema(request=WishlistSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        data = WishlistSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        product = Product.objects.filter(slug=data.validated_data["product_slug"], status=Product.Status.PUBLISHED).first()
        if product is None:
            raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
        if WishlistItem.objects.filter(user=request.user).count() >= 200:
            raise ApiError("wishlist_full", "فهرست علاقه‌مندی‌ها پر است.")
        with contextlib.suppress(IntegrityError):
            WishlistItem.objects.update_or_create(
                user=request.user, product=product, defaults={"color_code": data.validated_data.get("color_code", "")}
            )
        return Response({"ok": True}, status=status.HTTP_201_CREATED)


class WishlistItemView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, product_slug: str) -> Response:
        WishlistItem.objects.filter(user=request.user, product__slug=product_slug[:120]).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
