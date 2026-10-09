"""Public (storefront) catalog serializers. They operate on prefetched objects from selectors."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from rest_framework import serializers

from .models import Product, ProductMedia, Variant
from .selectors import size_sort_key
from .studio import is_supported


def media_payload(media: ProductMedia | None) -> dict[str, Any] | None:
    if media is None:
        return None
    return {
        "id": media.pk,
        "url": media.image.url,
        "thumb": media.thumb.url,
        "alt": media.alt_text,
        "width": media.width,
        "height": media.height,
        "kind": media.kind,
        "color_code": media.color.code if media.color_id and media.color else None,
    }


def _variant_available(variant: Variant) -> int:
    stock = getattr(variant, "stock", None)
    if stock is None:
        return 0
    return max(0, stock.on_hand - stock.reserved)


class ImageSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    url = serializers.CharField()
    thumb = serializers.CharField()
    alt = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    kind = serializers.CharField()
    color_code = serializers.CharField(allow_null=True)


class CardColorSerializer(serializers.Serializer):
    code = serializers.CharField()
    name = serializers.CharField()
    hex = serializers.CharField()
    in_stock = serializers.BooleanField()
    image = ImageSerializer(allow_null=True)


class CardSizeSerializer(serializers.Serializer):
    code = serializers.CharField()
    in_stock = serializers.BooleanField()


class CategoryRefSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()


class RatingSerializer(serializers.Serializer):
    average = serializers.FloatField(allow_null=True)
    count = serializers.IntegerField()


class ProductCardSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    slug = serializers.CharField()
    name = serializers.CharField()
    category = CategoryRefSerializer()
    is_new = serializers.BooleanField()
    price_min = serializers.IntegerField(allow_null=True)
    price_max = serializers.IntegerField(allow_null=True)
    currency = serializers.CharField()
    in_stock = serializers.BooleanField()
    colors = CardColorSerializer(many=True)
    sizes = CardSizeSerializer(many=True)
    primary_image = ImageSerializer(allow_null=True)
    hover_image = ImageSerializer(allow_null=True)
    studio_slot = serializers.CharField()
    studio_supported = serializers.BooleanField()
    rating = RatingSerializer()

    def to_representation(self, product: Product) -> dict[str, Any]:
        return build_card(product)


def build_card(product: Product) -> dict[str, Any]:
    variants: list[Variant] = list(getattr(product, "active_variants", None) or product.variants.filter(is_active=True))
    media: list[ProductMedia] = list(product.media.all())
    colors_out = []
    for color in product.colors.all():
        color_variants = [v for v in variants if v.color_id == color.pk]
        if not color_variants:
            continue
        color_media = next((m for m in media if m.color_id == color.pk), None)
        colors_out.append(
            {
                "code": color.code,
                "name": color.name,
                "hex": color.hex,
                "in_stock": any(_variant_available(v) > 0 for v in color_variants),
                "image": media_payload(color_media),
            }
        )
    sizes: dict[str, bool] = {}
    for v in variants:
        sizes[v.size] = sizes.get(v.size, False) or _variant_available(v) > 0
    primary = media[0] if media else None
    first_color_id = primary.color_id if primary else None
    hover = next((m for m in media[1:] if m.color_id == first_color_id and m.kind in ("back", "model", "detail")), None)
    rating_avg = getattr(product, "rating_avg", None)
    return {
        "id": product.pk,
        "slug": product.slug,
        "name": product.name,
        "category": {"slug": product.category.slug, "name": product.category.name},
        "is_new": product.is_new,
        "price_min": getattr(product, "price_min", None),
        "price_max": getattr(product, "price_max", None),
        "currency": settings.CURRENCY,
        "in_stock": any(_variant_available(v) > 0 for v in variants),
        "colors": colors_out,
        "sizes": [{"code": k, "in_stock": sizes[k]} for k in sorted(sizes, key=size_sort_key)],
        "primary_image": media_payload(primary),
        "hover_image": media_payload(hover),
        "studio_slot": product.studio_slot,
        "studio_supported": is_supported(product.studio_slot, product.studio_asset),
        "rating": {
            "average": round(float(rating_avg), 1) if rating_avg is not None else None,
            "count": int(getattr(product, "rating_count", 0) or 0),
        },
    }


class VariantPublicSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    sku = serializers.CharField()
    color_code = serializers.CharField()
    size = serializers.CharField()
    price_toman = serializers.IntegerField()
    in_stock = serializers.BooleanField()
    max_quantity = serializers.IntegerField()
    low_stock = serializers.BooleanField()


def variant_payload(v: Variant) -> dict[str, Any]:
    available = _variant_available(v)
    threshold = v.stock.low_stock_threshold if getattr(v, "stock", None) else 0
    return {
        "id": v.pk,
        "sku": v.sku,
        "color_code": v.color.code,
        "size": v.size,
        "price_toman": v.price_toman,
        "in_stock": available > 0,
        "max_quantity": min(available, settings.CART_MAX_LINE_QUANTITY),
        "low_stock": 0 < available <= threshold,
    }


class ProductDetailSerializer(ProductCardSerializer):
    short_description = serializers.CharField()
    description = serializers.CharField()
    materials = serializers.CharField()
    care = serializers.CharField()
    fit_notes = serializers.CharField()
    size_chart = serializers.CharField()
    studio_asset = serializers.CharField()
    seo_title = serializers.CharField()
    seo_description = serializers.CharField()
    media = ImageSerializer(many=True)
    variants = VariantPublicSerializer(many=True)
    collections = CategoryRefSerializer(many=True)
    updated_at = serializers.DateTimeField()

    def to_representation(self, product: Product) -> dict[str, Any]:
        card = build_card(product)
        variants = sorted(
            getattr(product, "active_variants", None) or [],
            key=lambda v: (v.color.sort_order, size_sort_key(v.size)),
        )
        return {
            **card,
            "short_description": product.short_description,
            "description": product.description,
            "materials": product.materials,
            "care": product.care,
            "fit_notes": product.fit_notes,
            "size_chart": product.size_chart,
            "studio_asset": product.studio_asset if card["studio_supported"] else "",
            "seo_title": product.seo_title or product.name,
            "seo_description": product.seo_description or product.short_description,
            "media": [media_payload(m) for m in product.media.all()],
            "variants": [variant_payload(v) for v in variants],
            "collections": [{"slug": c.slug, "name": c.name} for c in product.collections.all() if c.is_visible],
            "updated_at": product.updated_at,
        }


class CategorySerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    product_count = serializers.IntegerField()
    image = ImageSerializer(allow_null=True)


class CollectionSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    description = serializers.CharField()
    product_count = serializers.IntegerField()
    image = ImageSerializer(allow_null=True)
