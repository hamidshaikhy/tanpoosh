from __future__ import annotations

from typing import Any

from django.db import IntegrityError
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomerAuthenticated
from apps.catalog.models import Product
from apps.core import ratelimit
from apps.core.errors import ApiError, Conflict
from apps.core.pagination import StandardPagination
from apps.core.text import PlainTextField
from apps.orders.models import FulfillmentStatus, OrderItem

from .models import Review


def _display_name(user: Any) -> str:
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    if first:
        return f"{first} {last[:1]}." if last else first
    return "خریدار تن‌پوش"


def review_payload(r: Review, *, own: bool = False) -> dict[str, Any]:
    data = {
        "id": r.pk,
        "rating": r.rating,
        "title": r.title,
        "body": r.body,
        "size_feedback": r.size_feedback,
        "author": _display_name(r.user),
        "verified_purchase": r.order_item_id is not None,
        "created_at": r.created_at,
    }
    if own:
        data.update(
            {
                "status": r.status,
                "status_label": r.get_status_display(),
                "product_slug": r.product.slug,
                "product_name": r.product.name,
            }
        )
    return data


def eligible_item(user: Any, product: Product) -> OrderItem | None:
    return (
        OrderItem.objects.filter(
            order__user=user,
            product=product,
            order__fulfillment_status__in=[FulfillmentStatus.DELIVERED, FulfillmentStatus.RETURNED],
        )
        .order_by("-order__delivered_at")
        .first()
    )


class ReviewCreateSerializer(serializers.Serializer):
    rating = serializers.IntegerField(min_value=1, max_value=5)
    title = PlainTextField(max_length=80, required=False)
    body = PlainTextField(max_length=2000, multiline=True, allow_blank=False)
    size_feedback = serializers.ChoiceField(choices=["small", "true", "large", ""], required=False, allow_blank=True)


class ProductReviewsView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        product = Product.objects.filter(slug=slug[:120], status=Product.Status.PUBLISHED).first()
        if product is None:
            raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
        qs = Review.objects.filter(product=product, status=Review.Status.APPROVED).select_related("user").order_by("-created_at")
        paginator = StandardPagination()
        paginator.page_size = 10
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([review_payload(r) for r in page or []])

    @extend_schema(request=ReviewCreateSerializer, responses={201: None})
    def post(self, request: Request, slug: str) -> Response:
        if not request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated()
        ratelimit.enforce("review.user", str(request.user.pk))
        product = Product.objects.filter(slug=slug[:120], status=Product.Status.PUBLISHED).first()
        if product is None:
            raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
        data = ReviewCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        item = eligible_item(request.user, product)
        if item is None:
            raise Conflict("review_not_eligible", "فقط خریدارانی که سفارششان تحویل شده می‌توانند نظر ثبت کنند.")
        try:
            review = Review.objects.create(
                product=product,
                user=request.user,
                order_item=item,
                rating=data.validated_data["rating"],
                title=data.validated_data.get("title", ""),
                body=data.validated_data["body"],
                size_feedback=data.validated_data.get("size_feedback", ""),
            )
        except IntegrityError:
            raise Conflict("review_exists", "شما قبلاً برای این محصول نظر ثبت کرده‌اید.") from None
        return Response(
            {"ok": True, "id": review.pk, "detail": "نظر شما ثبت شد و پس از بررسی نمایش داده می‌شود."},
            status=status.HTTP_201_CREATED,
        )


class OwnReviewsView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    def get(self, request: Request) -> Response:
        rows = Review.objects.filter(user=request.user).select_related("product", "user")[:100]
        reviewed = {r.product_id for r in rows}
        eligible = (
            OrderItem.objects.filter(
                order__user=request.user,
                order__fulfillment_status__in=[FulfillmentStatus.DELIVERED, FulfillmentStatus.RETURNED],
                product__status=Product.Status.PUBLISHED,
            )
            .exclude(product_id__in=reviewed)
            .values("product__slug", "product__name")
            .distinct()[:50]
        )
        return Response(
            {
                "reviews": [review_payload(r, own=True) for r in rows],
                "reviewable": [{"product_slug": e["product__slug"], "product_name": e["product__name"]} for e in eligible],
            }
        )
