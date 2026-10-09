from __future__ import annotations

from typing import Any

from django.db.models import Count, Prefetch, Q
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.errors import ApiError
from apps.core.normalize import to_ascii_digits
from apps.core.pagination import StandardPagination

from . import selectors, studio
from .models import Category, Collection, Product, ProductMedia, Variant
from .serializers import (
    CategorySerializer,
    CollectionSerializer,
    ProductCardSerializer,
    ProductDetailSerializer,
    build_card,
    media_payload,
    variant_payload,
)

LIST_PARAMS = [
    OpenApiParameter("category", str),
    OpenApiParameter("collection", str),
    OpenApiParameter("size", str, description="comma separated size codes"),
    OpenApiParameter("color", str, description="comma separated color codes"),
    OpenApiParameter("min_price", int),
    OpenApiParameter("max_price", int),
    OpenApiParameter("in_stock", bool),
    OpenApiParameter("is_new", bool),
    OpenApiParameter("studio", bool),
    OpenApiParameter("q", str),
    OpenApiParameter("sort", str, enum=list(selectors.SORTS)),
    OpenApiParameter("page", int),
    OpenApiParameter("page_size", int),
]


class PublicView(APIView):
    permission_classes = [AllowAny]


class ProductListView(PublicView):
    @extend_schema(parameters=LIST_PARAMS, responses=ProductCardSerializer(many=True))
    def get(self, request: Request) -> Response:
        qs, _ = selectors.filter_products(request.query_params)
        paginator = StandardPagination()
        page = paginator.paginate_queryset(qs, request, view=self)
        return paginator.get_paginated_response([build_card(p) for p in page or []])


def _published_detail(slug: str) -> Product:
    qs = selectors.with_rating(selectors.with_card_data(selectors.published_products().filter(slug=slug[:120])))
    product = qs.prefetch_related(Prefetch("collections", queryset=Collection.objects.order_by("sort_order"))).first()
    if product is None:
        raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
    return product


class ProductDetailView(PublicView):
    @extend_schema(responses=ProductDetailSerializer)
    def get(self, request: Request, slug: str) -> Response:
        return Response(ProductDetailSerializer(_published_detail(slug)).data)


class RelatedProductsView(PublicView):
    @extend_schema(responses=ProductCardSerializer(many=True))
    def get(self, request: Request, slug: str) -> Response:
        product = selectors.published_products().filter(slug=slug[:120]).first()
        if product is None:
            raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
        qs = selectors.with_rating(
            selectors.with_card_data(
                selectors.published_products().filter(category_id=product.category_id).exclude(pk=product.pk)
            )
        ).order_by("sort_order", "-published_at")[:4]
        related = list(qs)
        if len(related) < 4:
            extra = selectors.with_rating(
                selectors.with_card_data(selectors.published_products().exclude(pk__in=[product.pk, *[p.pk for p in related]]))
            ).order_by("sort_order", "-published_at")[: 4 - len(related)]
            related += list(extra)
        return Response([build_card(p) for p in related])


def _category_image(category: Category) -> dict[str, Any] | None:
    media = (
        ProductMedia.objects.filter(product__category=category, product__status=Product.Status.PUBLISHED)
        .select_related("color")
        .order_by("product__sort_order", "sort_order", "id")
        .first()
    )
    return media_payload(media)


def category_payloads() -> list[dict[str, Any]]:
    rows = (
        Category.objects.filter(is_visible=True)
        .annotate(product_count=Count("products", filter=Q(products__status="published"), distinct=True))
        .order_by("sort_order", "id")
    )
    return [
        {
            "slug": c.slug,
            "name": c.name,
            "description": c.description,
            "product_count": c.product_count,
            "image": _category_image(c),
        }
        for c in rows
    ]


class CategoryListView(PublicView):
    @extend_schema(responses=CategorySerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(category_payloads())


def _collection_payload(c: Collection) -> dict[str, Any]:
    media = (
        ProductMedia.objects.filter(product__collections=c, product__status=Product.Status.PUBLISHED)
        .select_related("color")
        .order_by("product__sort_order", "sort_order", "id")
        .first()
    )
    return {
        "slug": c.slug,
        "name": c.name,
        "description": c.description,
        "product_count": getattr(c, "product_count", 0),
        "image": media_payload(media),
    }


class CollectionListView(PublicView):
    @extend_schema(responses=CollectionSerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = (
            Collection.objects.filter(is_visible=True)
            .annotate(product_count=Count("products", filter=Q(products__status="published"), distinct=True))
            .order_by("sort_order", "id")
        )
        return Response([_collection_payload(c) for c in rows])


class CollectionDetailView(PublicView):
    @extend_schema(responses=CollectionSerializer)
    def get(self, request: Request, slug: str) -> Response:
        c = (
            Collection.objects.filter(is_visible=True, slug=slug[:80])
            .annotate(product_count=Count("products", filter=Q(products__status="published"), distinct=True))
            .first()
        )
        if c is None:
            raise ApiError("not_found", "کالکشن پیدا نشد.", status_code=404)
        return Response(_collection_payload(c))


class FiltersView(PublicView):
    @extend_schema(
        responses=inline_serializer(
            "CatalogFilters",
            {
                "sizes": serializers.ListField(child=serializers.CharField()),
                "colors": serializers.ListField(child=serializers.DictField()),
                "price_min": serializers.IntegerField(),
                "price_max": serializers.IntegerField(),
                "categories": serializers.ListField(child=serializers.DictField()),
                "collections": serializers.ListField(child=serializers.DictField()),
                "sorts": serializers.ListField(child=serializers.DictField()),
            },
        )
    )
    def get(self, request: Request) -> Response:
        return Response(selectors.available_filters())


class VariantLookupView(PublicView):
    """Resolve variant ids (e.g. from a shared look link) to public, published data only."""

    @extend_schema(parameters=[OpenApiParameter("ids", str, required=True)])
    def get(self, request: Request) -> Response:
        raw = str(request.query_params.get("ids", ""))
        try:
            ids = [int(to_ascii_digits(x)) for x in raw.split(",") if x.strip()][:30]
        except ValueError:
            raise ApiError("validation_error", fields={"ids": ["شناسه‌ها معتبر نیستند."]}) from None
        variants = Variant.objects.filter(pk__in=ids, is_active=True, product__status=Product.Status.PUBLISHED).select_related(
            "product", "color", "stock"
        )
        out = []
        for v in variants:
            item = variant_payload(v)
            item.update({"product_slug": v.product.slug, "product_name": v.product.name, "color_name": v.color.name})
            out.append(item)
        return Response(out)


class StudioCatalogView(PublicView):
    """Manifest + products that can be styled. Items without prepared photographs are
    included with studio_supported=false so the UI can mark them honestly."""

    @extend_schema(
        responses=inline_serializer(
            "StudioCatalog",
            {
                "manifest": serializers.DictField(allow_null=True),
                "products": serializers.ListField(child=serializers.DictField()),
            },
        )
    )
    def get(self, request: Request) -> Response:
        qs = selectors.with_rating(selectors.with_card_data(selectors.published_products().exclude(studio_slot="none"))).order_by(
            "sort_order", "-published_at"
        )
        products = []
        for p in qs:
            card = build_card(p)
            card["studio_asset"] = p.studio_asset if card["studio_supported"] else ""
            card["variants"] = [variant_payload(v) for v in getattr(p, "active_variants", [])]
            products.append(card)
        return Response({"manifest": studio.load_manifest(), "products": products})
