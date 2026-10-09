from __future__ import annotations

import secrets
from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomerAuthenticated
from apps.catalog.models import Product, Variant
from apps.core import ratelimit
from apps.core.errors import ApiError
from apps.core.net import client_ip
from apps.core.text import PlainTextField

from .models import SavedLook

SLOTS = ["top", "outerwear", "bottom", "shoes", "accessory"]
MAX_LOOKS = 50


class LookItemSerializer(serializers.Serializer):
    slot = serializers.ChoiceField(choices=SLOTS)
    product_id = serializers.IntegerField(min_value=1)
    color_code = serializers.SlugField(max_length=32)
    size = serializers.RegexField(r"^[A-Z0-9]{1,8}$", required=False, allow_blank=True)


class LookSerializer(serializers.Serializer):
    name = PlainTextField(max_length=60, allow_blank=False)
    items = LookItemSerializer(many=True, max_length=5, min_length=1)

    def validate_items(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        slots = [i["slot"] for i in items]
        if len(slots) != len(set(slots)):
            raise serializers.ValidationError("از هر بخش فقط یک لباس انتخاب کنید.")
        products = {
            p.pk: p for p in Product.objects.filter(pk__in=[i["product_id"] for i in items], status=Product.Status.PUBLISHED)
        }
        clean = []
        for item in items:
            p = products.get(item["product_id"])
            if p is None or p.studio_slot != item["slot"]:
                raise serializers.ValidationError("یکی از لباس‌ها در دسترس نیست یا با این بخش سازگار نیست.")
            variants = Variant.objects.filter(product=p, color__code=item["color_code"], is_active=True)
            if not variants.exists():
                raise serializers.ValidationError("رنگ انتخاب‌شده برای یکی از لباس‌ها موجود نیست.")
            size = item.get("size") or ""
            if size and not variants.filter(size=size).exists():
                raise serializers.ValidationError("سایز انتخاب‌شده برای یکی از لباس‌ها معتبر نیست.")
            clean.append({"slot": item["slot"], "product_id": p.pk, "color_code": item["color_code"], "size": size})
        return clean


def look_items_payload(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    products = {p.pk: p for p in Product.objects.filter(pk__in=[i["product_id"] for i in items])}
    out = []
    for i in items:
        p = products.get(i["product_id"])
        out.append(
            {
                **i,
                "product_slug": p.slug if p else "",
                "product_name": p.name if p else "",
                "available": bool(p and p.status == Product.Status.PUBLISHED),
            }
        )
    return out


def look_payload(look: SavedLook) -> dict[str, Any]:
    return {
        "id": str(look.pk),
        "name": look.name,
        "items": look_items_payload(look.items),
        "shared": bool(look.share_token),
        "share_token": look.share_token,
        "created_at": look.created_at,
        "updated_at": look.updated_at,
    }


class LookListView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    def get(self, request: Request) -> Response:
        return Response([look_payload(lk) for lk in SavedLook.objects.filter(user=request.user)[:MAX_LOOKS]])

    @extend_schema(request=LookSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        data = LookSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if SavedLook.objects.filter(user=request.user).count() >= MAX_LOOKS:
            raise ApiError("too_many_looks", f"حداکثر {MAX_LOOKS} استایل می‌توانید ذخیره کنید.")
        look = SavedLook.objects.create(user=request.user, name=data.validated_data["name"], items=data.validated_data["items"])
        return Response(look_payload(look), status=status.HTTP_201_CREATED)


def _own(request: Request, look_id: str) -> SavedLook:
    look = SavedLook.objects.filter(pk=look_id, user=request.user).first()
    if look is None:
        raise ApiError("not_found", "استایل پیدا نشد.", status_code=404)
    return look


class LookDetailView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    def get(self, request: Request, look_id: str) -> Response:
        return Response(look_payload(_own(request, look_id)))

    @extend_schema(request=LookSerializer)
    def patch(self, request: Request, look_id: str) -> Response:
        look = _own(request, look_id)
        data = LookSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        if "name" in data.validated_data:
            look.name = data.validated_data["name"]
        if "items" in data.validated_data:
            look.items = data.validated_data["items"]
        look.save()
        return Response(look_payload(look))

    def delete(self, request: Request, look_id: str) -> Response:
        _own(request, look_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class LookShareView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=None)
    def post(self, request: Request, look_id: str) -> Response:
        look = _own(request, look_id)
        if not look.share_token:
            look.share_token = secrets.token_urlsafe(24)
            look.save(update_fields=["share_token", "updated_at"])
        return Response(look_payload(look))

    def delete(self, request: Request, look_id: str) -> Response:
        look = _own(request, look_id)
        look.share_token = None
        look.save(update_fields=["share_token", "updated_at"])
        return Response(look_payload(look))


class SharedLookView(APIView):
    """Public view of an intentionally shared look: clothing selections only — never the
    owner's identity, account, address or other data."""

    permission_classes = [AllowAny]

    def get(self, request: Request, token: str) -> Response:
        ratelimit.enforce("share_look.ip", client_ip(request._request))
        look = SavedLook.objects.filter(share_token=token[:43]).first() if len(token) >= 20 else None
        if look is None:
            raise ApiError("not_found", "این استایل پیدا نشد یا دیگر به اشتراک گذاشته نمی‌شود.", status_code=404)
        return Response({"name": look.name, "items": look_items_payload(look.items)})
