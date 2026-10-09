from __future__ import annotations

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.catalog import selectors
from apps.catalog.models import Product
from apps.catalog.serializers import build_card
from apps.catalog.views import _collection_payload, category_payloads
from apps.core.errors import ApiError

from .models import InfoPage, StoreSettings
from .services import page_payload, public_settings


class PublicSettingsView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=inline_serializer("PublicSettings", {"announcement": serializers.CharField()}))
    def get(self, request: Request) -> Response:
        return Response(public_settings())


class HomeView(APIView):
    """Homepage content driven by published DB data + structured admin settings."""

    permission_classes = [AllowAny]

    @extend_schema(responses=inline_serializer("Home", {"hero": serializers.DictField()}))
    def get(self, request: Request) -> Response:
        s = StoreSettings.load()
        base = selectors.with_rating(selectors.with_card_data(selectors.published_products()))
        featured_ids = list(dict.fromkeys(int(i) for i in (s.featured_products or []) if str(i).isdigit()))[:16]
        by_id = {p.pk: p for p in base.filter(pk__in=featured_ids)}
        picks = [by_id[i] for i in featured_ids if i in by_id]
        if len(picks) < 16:
            extra = base.exclude(pk__in=[p.pk for p in picks]).order_by("sort_order", "-published_at")[: 16 - len(picks)]
            picks += list(extra)
        available_categories = [c for c in category_payloads() if c["product_count"]]
        categories = [c for c in available_categories if c["slug"] != "sunglasses"][:4]
        categories += [c for c in available_categories if c["slug"] == "sunglasses"]
        eyewear = base.filter(category__slug="sunglasses").order_by("sort_order", "-published_at")[:6]
        collection = None
        if s.featured_collection_id and s.featured_collection and s.featured_collection.is_visible:
            from django.db.models import Count, Q

            c = (
                type(s.featured_collection)
                .objects.annotate(
                    product_count=Count("products", filter=Q(products__status=Product.Status.PUBLISHED), distinct=True)
                )
                .get(pk=s.featured_collection_id)
            )
            collection = _collection_payload(c)
        return Response(
            {
                "hero": {
                    "title": s.hero_title,
                    "subtitle": s.hero_subtitle,
                    "primary": {"label": s.hero_primary_label, "href": s.hero_primary_href},
                    "secondary": {"label": s.hero_secondary_label, "href": s.hero_secondary_href},
                },
                "picks": {"title": s.picks_title, "subtitle": s.picks_subtitle, "products": [build_card(p) for p in picks]},
                "categories": categories,
                "eyewear": [build_card(p) for p in eyewear],
                "studio": {"title": s.studio_title, "subtitle": s.studio_subtitle},
                "featured_collection": collection,
                "settings": public_settings(),
            }
        )


class InfoPageListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request) -> Response:
        rows = InfoPage.objects.filter(is_published=True).order_by("slug")
        return Response([{"slug": p.slug, "title": p.title} for p in rows])


class InfoPageView(APIView):
    permission_classes = [AllowAny]

    def get(self, request: Request, slug: str) -> Response:
        page = InfoPage.objects.filter(slug=slug[:40], is_published=True).first()
        if page is None:
            raise ApiError("not_found", "صفحه پیدا نشد.", status_code=404)
        return Response(page_payload(page))
