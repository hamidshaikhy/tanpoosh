"""Read-side catalog queries for the public API (published content only)."""

from __future__ import annotations

from typing import Any

from django.db.models import Avg, Count, Exists, F, Max, Min, OuterRef, Prefetch, Q, QuerySet, Subquery
from django.db.models.functions import Coalesce

from apps.core.errors import ApiError
from apps.core.normalize import search_tokens, to_ascii_digits

from .models import Category, Collection, Product, ProductColor, ProductMedia, Variant

SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]


def size_sort_key(size: str) -> tuple[int, int, str]:
    if size in SIZE_ORDER:
        return (0, SIZE_ORDER.index(size), size)
    if size.isdigit():
        return (1, int(size), size)
    return (2, 0, size)


SORTS = {
    "featured": ["sort_order", "-published_at", "-id"],
    "newest": ["-published_at", "-id"],
    "price_asc": ["price_min", "-id"],
    "price_desc": ["-price_max", "-id"],
}


def published_products() -> QuerySet[Product]:
    return Product.objects.filter(status=Product.Status.PUBLISHED, category__is_visible=True)


def _available_variant_exists(**extra: Any) -> Exists:
    return Exists(
        Variant.objects.filter(
            product=OuterRef("pk"),
            is_active=True,
            stock__on_hand__gt=F("stock__reserved"),
            **extra,
        )
    )


def with_card_data(qs: QuerySet[Product]) -> QuerySet[Product]:
    active_variants = Variant.objects.filter(is_active=True).select_related("stock", "color").order_by("sort_order", "id")
    return (
        qs.select_related("category")
        .annotate(
            price_min=Subquery(_variant_price_agg(Min)),
            price_max=Subquery(_variant_price_agg(Max)),
        )
        .prefetch_related(
            Prefetch("variants", queryset=active_variants, to_attr="active_variants"),
            Prefetch("colors", queryset=ProductColor.objects.order_by("sort_order", "id")),
            Prefetch("media", queryset=ProductMedia.objects.select_related("color").order_by("sort_order", "id")),
        )
    )


def _variant_price_agg(func: Any) -> QuerySet[Variant]:
    return (
        Variant.objects.filter(product=OuterRef("pk"), is_active=True)
        .order_by()
        .values("product")
        .annotate(v=func("price_toman"))
        .values("v")
    )


def with_rating(qs: QuerySet[Product]) -> QuerySet[Product]:
    from apps.reviews.models import Review

    approved = Review.objects.filter(product=OuterRef("pk"), status="approved").order_by().values("product")
    return qs.annotate(
        rating_avg=Subquery(approved.annotate(v=Avg("rating")).values("v")),
        rating_count=Coalesce(Subquery(approved.annotate(v=Count("id")).values("v")), 0),
    )


def _int_param(params: Any, name: str, *, lo: int, hi: int) -> int | None:
    raw = params.get(name)
    if raw in (None, ""):
        return None
    try:
        value = int(to_ascii_digits(str(raw)))
    except ValueError:
        raise ApiError("validation_error", fields={name: ["مقدار عددی معتبر نیست."]}) from None
    if not lo <= value <= hi:
        raise ApiError("validation_error", fields={name: ["مقدار خارج از محدودهٔ مجاز است."]})
    return value


def _list_param(params: Any, name: str, *, max_items: int = 12) -> list[str]:
    raw = params.get(name, "")
    if not raw:
        return []
    items = [p.strip() for p in str(raw).split(",") if p.strip()]
    if len(items) > max_items or any(len(i) > 40 for i in items):
        raise ApiError("validation_error", fields={name: ["تعداد یا طول مقادیر فیلتر بیش از حد مجاز است."]})
    return items


def filter_products(params: Any) -> tuple[QuerySet[Product], dict[str, Any]]:
    qs = published_products()
    applied: dict[str, Any] = {}

    category = params.get("category")
    if category:
        qs = qs.filter(category__slug=str(category)[:80])
        applied["category"] = category
    collection = params.get("collection")
    if collection:
        qs = qs.filter(collections__slug=str(collection)[:80], collections__is_visible=True)
        applied["collection"] = collection

    sizes = [s.upper() for s in _list_param(params, "size")]
    if sizes:
        qs = qs.filter(_available_variant_exists(size__in=sizes))
        applied["size"] = sizes
    colors = _list_param(params, "color")
    if colors:
        qs = qs.filter(Exists(Variant.objects.filter(product=OuterRef("pk"), is_active=True, color__code__in=colors)))
        applied["color"] = colors

    min_price = _int_param(params, "min_price", lo=0, hi=1_000_000_000)
    max_price = _int_param(params, "max_price", lo=0, hi=1_000_000_000)
    if min_price is not None:
        qs = qs.filter(Exists(Variant.objects.filter(product=OuterRef("pk"), is_active=True, price_toman__gte=min_price)))
    if max_price is not None:
        qs = qs.filter(Exists(Variant.objects.filter(product=OuterRef("pk"), is_active=True, price_toman__lte=max_price)))

    if str(params.get("in_stock", "")).lower() in {"1", "true"}:
        qs = qs.filter(_available_variant_exists())
        applied["in_stock"] = True
    if str(params.get("is_new", "")).lower() in {"1", "true"}:
        qs = qs.filter(is_new=True)
    if str(params.get("studio", "")).lower() in {"1", "true"}:
        qs = qs.exclude(studio_slot="none")

    query = str(params.get("q", ""))
    if len(query) > 80:
        raise ApiError("validation_error", fields={"q": ["عبارت جستجو حداکثر ۸۰ نویسه است."]})
    tokens = search_tokens(query)
    for token in tokens:
        qs = qs.filter(search_text__contains=token)
    if tokens:
        applied["q"] = query

    sort = params.get("sort") or ("featured" if not tokens else "newest")
    if sort not in SORTS:
        raise ApiError("validation_error", fields={"sort": ["مرتب‌سازی پشتیبانی نمی‌شود."]})
    qs = with_rating(with_card_data(qs.distinct())).order_by(*SORTS[sort])
    applied["sort"] = sort
    return qs, applied


def available_filters() -> dict[str, Any]:
    base = Variant.objects.filter(is_active=True, product__status=Product.Status.PUBLISHED, product__category__is_visible=True)
    sizes = sorted(set(base.values_list("size", flat=True)), key=size_sort_key)
    colors: dict[str, dict[str, str]] = {}
    for code, name, hex_ in base.values_list("color__code", "color__name", "color__hex").order_by("color__code"):
        colors.setdefault(code, {"code": code, "name": name, "hex": hex_})
    price = base.aggregate(lo=Min("price_toman"), hi=Max("price_toman"))
    categories = list(
        Category.objects.filter(is_visible=True, products__status=Product.Status.PUBLISHED)
        .annotate(product_count=Count("products", filter=Q(products__status="published"), distinct=True))
        .order_by("sort_order", "id")
        .values("slug", "name", "product_count")
    )
    collections = list(Collection.objects.filter(is_visible=True).order_by("sort_order", "id").values("slug", "name"))
    return {
        "sizes": sizes,
        "colors": list(colors.values()),
        "price_min": price["lo"] or 0,
        "price_max": price["hi"] or 0,
        "categories": categories,
        "collections": collections,
        "sorts": [
            {"value": "featured", "label": "پیشنهاد تن‌پوش"},
            {"value": "newest", "label": "جدیدترین"},
            {"value": "price_asc", "label": "ارزان‌ترین"},
            {"value": "price_desc", "label": "گران‌ترین"},
        ],
    }
