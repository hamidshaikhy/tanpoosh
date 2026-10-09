from __future__ import annotations

from typing import Any

from django.db.models import Count, F, Q
from rest_framework import serializers, status
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.catalog import manage_services as svc
from apps.catalog import studio
from apps.catalog.models import Category, Collection, Product, ProductMedia, SizeChart, StudioSlot, Variant
from apps.catalog.selectors import size_sort_key
from apps.catalog.serializers import media_payload
from apps.core import audit, ratelimit
from apps.core.errors import ApiError, Conflict
from apps.core.normalize import search_tokens
from apps.core.revalidate import request_revalidation
from apps.core.text import PlainTextField
from apps.inventory import services as inventory
from apps.inventory.models import InventoryMovement, StockLevel

from .base import ManageView

# --- serializers ---------------------------------------------------------------


class ColorInSerializer(serializers.Serializer):
    code = serializers.RegexField(r"^[a-z0-9-]{2,32}$")
    name = PlainTextField(max_length=40, allow_blank=False)
    hex = serializers.RegexField(r"^#[0-9A-Fa-f]{6}$")
    sort_order = serializers.IntegerField(min_value=0, max_value=100, required=False)


class VariantInSerializer(serializers.Serializer):
    color_code = serializers.RegexField(r"^[a-z0-9-]{2,32}$")
    size = serializers.RegexField(r"^[A-Z0-9]{1,8}$")
    sku = serializers.RegexField(r"^[A-Z0-9][A-Z0-9-]{2,39}$")
    price_toman = serializers.IntegerField(min_value=1000, max_value=100_000_000)
    is_active = serializers.BooleanField(required=False, default=True)
    weight_grams = serializers.IntegerField(min_value=0, max_value=20000, required=False, default=0)
    initial_stock = serializers.IntegerField(min_value=0, max_value=10000, required=False, default=0)


class ProductWriteSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)
    name = PlainTextField(max_length=120, allow_blank=False)
    slug = serializers.RegexField(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=120)
    category_id = serializers.IntegerField()
    collection_ids = serializers.ListField(child=serializers.IntegerField(), max_length=20, required=False, default=list)
    short_description = PlainTextField(max_length=200, required=False)
    description = PlainTextField(max_length=4000, multiline=True, required=False)
    materials = PlainTextField(max_length=1000, multiline=True, required=False)
    care = PlainTextField(max_length=1000, multiline=True, required=False)
    fit_notes = PlainTextField(max_length=1000, multiline=True, required=False)
    size_chart = serializers.ChoiceField(choices=SizeChart.choices, default=SizeChart.TOPS)
    is_new = serializers.BooleanField(required=False, default=False)
    studio_slot = serializers.ChoiceField(choices=StudioSlot.choices, default=StudioSlot.NONE)
    studio_asset = serializers.CharField(max_length=64, required=False, allow_blank=True, default="")
    seo_title = PlainTextField(max_length=70, required=False)
    seo_description = PlainTextField(max_length=160, required=False)
    sort_order = serializers.IntegerField(min_value=-1000, max_value=1000, required=False, default=0)
    colors = ColorInSerializer(many=True, min_length=1, max_length=12)
    variants = VariantInSerializer(many=True, min_length=1, max_length=150)


def product_row(p: Product) -> dict[str, Any]:
    media = list(p.media.all())
    variants = list(p.variants.all())
    stocks = [getattr(v, "stock", None) for v in variants if v.is_active]
    return {
        "id": p.pk,
        "name": p.name,
        "slug": p.slug,
        "status": p.status,
        "status_label": p.get_status_display(),
        "category": p.category.name,
        "is_new": p.is_new,
        "thumb": media[0].thumb.url if media else None,
        "variant_count": sum(1 for v in variants if v.is_active),
        "price_min": min((v.price_toman for v in variants if v.is_active), default=None),
        "price_max": max((v.price_toman for v in variants if v.is_active), default=None),
        "on_hand": sum(s.on_hand for s in stocks if s),
        "available": sum(max(0, s.on_hand - s.reserved) for s in stocks if s),
        "studio_supported": studio.is_supported(p.studio_slot, p.studio_asset),
        "updated_at": p.updated_at,
        "version": p.version,
    }


def product_detail(p: Product) -> dict[str, Any]:
    variants = sorted(p.variants.select_related("color", "stock"), key=lambda v: (v.color.sort_order, size_sort_key(v.size)))
    return {
        **product_row(p),
        "category_id": p.category_id,
        "collection_ids": list(p.collections.values_list("id", flat=True)),
        "short_description": p.short_description,
        "description": p.description,
        "materials": p.materials,
        "care": p.care,
        "fit_notes": p.fit_notes,
        "size_chart": p.size_chart,
        "studio_slot": p.studio_slot,
        "studio_asset": p.studio_asset,
        "seo_title": p.seo_title,
        "seo_description": p.seo_description,
        "sort_order": p.sort_order,
        "published_at": p.published_at,
        "publish_problems": svc.publish_problems(p),
        "colors": [
            {"id": c.pk, "code": c.code, "name": c.name, "hex": c.hex, "sort_order": c.sort_order} for c in p.colors.all()
        ],
        "variants": [
            {
                "id": v.pk,
                "color_code": v.color.code,
                "size": v.size,
                "sku": v.sku,
                "price_toman": v.price_toman,
                "is_active": v.is_active,
                "weight_grams": v.weight_grams,
                "on_hand": v.stock.on_hand if hasattr(v, "stock") else 0,
                "reserved": v.stock.reserved if hasattr(v, "stock") else 0,
            }
            for v in variants
        ],
        "media": [
            {**(media_payload(m) or {}), "sort_order": m.sort_order}
            for m in p.media.select_related("color").order_by("sort_order", "id")
        ],
    }


def _get_product(product_id: int) -> Product:
    product = Product.objects.select_related("category").filter(pk=product_id).first()
    if product is None:
        raise ApiError("not_found", "محصول پیدا نشد.", status_code=404)
    return product


# --- views -------------------------------------------------------------------------


class CatalogMetaView(ManageView):
    permission_map = {"GET": "catalog.view"}

    def get(self, request: Request) -> Response:
        manifest = studio.load_manifest()
        return Response(
            {
                "categories": list(Category.objects.order_by("sort_order").values("id", "name", "slug", "is_visible")),
                "collections": list(Collection.objects.order_by("sort_order").values("id", "name", "slug", "is_visible")),
                "size_charts": [{"value": v, "label": label} for v, label in SizeChart.choices],
                "studio_slots": [{"value": v, "label": label} for v, label in StudioSlot.choices],
                "studio_garments": [
                    {
                        "id": g["id"],
                        "slot": g["slot"],
                        "label": g.get("label", g["id"]),
                    }
                    for g in (manifest or {}).get("garments", [])
                ],
                "size_presets": {
                    "tops": ["S", "M", "L", "XL", "XXL"],
                    "bottoms": ["30", "31", "32", "33", "34", "36", "38"],
                    "shoes": ["40", "41", "42", "43", "44", "45"],
                },
                "media_kinds": [{"value": v, "label": label} for v, label in ProductMedia.Kind.choices],
            }
        )


class ProductListCreateView(ManageView):
    permission_map = {"GET": "catalog.view", "POST": "catalog.edit"}

    def get(self, request: Request) -> Response:
        qs = Product.objects.select_related("category").prefetch_related("media", "variants__stock").order_by("-updated_at")
        status_filter = request.query_params.get("status")
        if status_filter in Product.Status.values:
            qs = qs.filter(status=status_filter)
        category = request.query_params.get("category")
        if category and str(category).isdigit():
            qs = qs.filter(category_id=int(category))
        for token in search_tokens(str(request.query_params.get("q", ""))[:80]):
            qs = qs.filter(Q(search_text__contains=token) | Q(slug__icontains=token) | Q(variants__sku__icontains=token))
        return self.paginate(qs.distinct(), product_row)

    def post(self, request: Request) -> Response:
        data = ProductWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        product = svc.apply_product(None, data.validated_data, actor=request.user, request=request)
        return Response(product_detail(_get_product(product.pk)), status=status.HTTP_201_CREATED)


class ProductDetailView(ManageView):
    permission_map = {"GET": "catalog.view", "PATCH": "catalog.edit", "DELETE": "catalog.edit"}

    def get(self, request: Request, product_id: int) -> Response:
        return Response(product_detail(_get_product(product_id)))

    def patch(self, request: Request, product_id: int) -> Response:
        product = _get_product(product_id)
        data = ProductWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data.get("version") is None:
            raise ApiError("validation_error", fields={"version": ["نسخهٔ محصول ارسال نشده است."]})
        svc.apply_product(product, data.validated_data, actor=request.user, request=request)
        return Response(product_detail(_get_product(product_id)))

    def delete(self, request: Request, product_id: int) -> Response:
        svc.delete_product(_get_product(product_id), actor=request.user, request=request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProductStatusSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=["publish", "unpublish", "archive", "restore"])
    version = serializers.IntegerField(required=False)


class ProductStatusView(ManageView):
    permission_map = {"POST": "catalog.publish"}

    def post(self, request: Request, product_id: int) -> Response:
        data = ProductStatusSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        svc.change_status(
            _get_product(product_id),
            data.validated_data["action"],
            version=data.validated_data.get("version"),
            actor=request.user,
            request=request,
        )
        return Response(product_detail(_get_product(product_id)))


class MediaUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    color_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=ProductMedia.Kind.choices, default=ProductMedia.Kind.FRONT)
    alt_text = PlainTextField(max_length=160, required=False)


class ProductMediaView(ManageView):
    permission_map = {"POST": "media.upload"}
    parser_classes = [MultiPartParser]

    def post(self, request: Request, product_id: int) -> Response:
        ratelimit.enforce("upload.user", str(request.user.pk))
        product = _get_product(product_id)
        data = MediaUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        svc.add_media(
            product,
            data.validated_data["file"],
            color_code=data.validated_data.get("color_code", ""),
            kind=data.validated_data["kind"],
            alt_text=data.validated_data.get("alt_text", ""),
            actor=request.user,
            request=request,
        )
        return Response(product_detail(_get_product(product_id)), status=status.HTTP_201_CREATED)


class MediaEditSerializer(serializers.Serializer):
    alt_text = PlainTextField(max_length=160, required=False, allow_blank=False)
    kind = serializers.ChoiceField(choices=ProductMedia.Kind.choices, required=False)
    color_code = serializers.CharField(max_length=32, required=False, allow_blank=True)


class ProductMediaDetailView(ManageView):
    permission_map = {"PATCH": "catalog.edit", "DELETE": "catalog.edit"}

    def _get(self, product_id: int, media_id: int) -> ProductMedia:
        media = ProductMedia.objects.select_related("product").filter(pk=media_id, product_id=product_id).first()
        if media is None:
            raise ApiError("not_found", "تصویر پیدا نشد.", status_code=404)
        return media

    def patch(self, request: Request, product_id: int, media_id: int) -> Response:
        media = self._get(product_id, media_id)
        data = MediaEditSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        if "alt_text" in data.validated_data:
            media.alt_text = data.validated_data["alt_text"]
        if "kind" in data.validated_data:
            media.kind = data.validated_data["kind"]
        if "color_code" in data.validated_data:
            code = data.validated_data["color_code"]
            media.color = media.product.colors.filter(code=code).first() if code else None
            if code and media.color is None:
                raise ApiError("validation_error", fields={"color_code": ["این رنگ برای محصول تعریف نشده است."]})
        media.save()
        if media.product.status == Product.Status.PUBLISHED:
            request_revalidation("catalog", f"product:{media.product.slug}")
        return Response(product_detail(_get_product(product_id)))

    def delete(self, request: Request, product_id: int, media_id: int) -> Response:
        svc.delete_media(self._get(product_id, media_id), actor=request.user, request=request)
        return Response(product_detail(_get_product(product_id)))


class ProductMediaReorderView(ManageView):
    permission_map = {"POST": "catalog.edit"}

    def post(self, request: Request, product_id: int) -> Response:
        product = _get_product(product_id)
        ids = request.data.get("ids")
        current = set(product.media.values_list("id", flat=True))
        if not isinstance(ids, list) or set(ids) != current or len(ids) != len(current):
            raise ApiError("validation_error", fields={"ids": ["فهرست ترتیب تصاویر کامل نیست."]})
        for index, media_id in enumerate(ids):
            ProductMedia.objects.filter(pk=media_id, product=product).update(sort_order=index)
        if product.status == Product.Status.PUBLISHED:
            request_revalidation("catalog", f"product:{product.slug}")
        return Response(product_detail(_get_product(product_id)))


class CategorySerializer(serializers.Serializer):
    name = PlainTextField(max_length=80, allow_blank=False)
    slug = serializers.RegexField(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)
    description = PlainTextField(max_length=300, required=False)
    sort_order = serializers.IntegerField(min_value=0, max_value=1000, required=False, default=0)
    is_visible = serializers.BooleanField(required=False, default=True)


def _taxonomy_row(obj: Any) -> dict[str, Any]:
    return {
        "id": obj.pk,
        "name": obj.name,
        "slug": obj.slug,
        "description": obj.description,
        "sort_order": obj.sort_order,
        "is_visible": obj.is_visible,
        "product_count": getattr(obj, "product_count", 0),
    }


def _taxonomy_views(model: Any, perm_view: str, perm_edit: str, label: str) -> tuple[type, type]:
    class ListCreate(ManageView):
        permission_map = {"GET": perm_view, "POST": perm_edit}

        def get(self, request: Request) -> Response:
            rows = model.objects.annotate(product_count=Count("products", distinct=True)).order_by("sort_order", "id")
            return Response([_taxonomy_row(r) for r in rows])

        def post(self, request: Request) -> Response:
            data = CategorySerializer(data=request.data)
            data.is_valid(raise_exception=True)
            if model.objects.filter(slug=data.validated_data["slug"]).exists():
                raise ApiError("validation_error", fields={"slug": ["این نامک قبلاً استفاده شده است."]})
            obj = model.objects.create(**data.validated_data)
            request_revalidation("catalog")
            audit.record(f"{label}.create", request=request, obj=obj)
            return Response(_taxonomy_row(obj), status=status.HTTP_201_CREATED)

    class Detail(ManageView):
        permission_map = {"PATCH": perm_edit, "DELETE": perm_edit}

        def patch(self, request: Request, pk: int) -> Response:
            obj = model.objects.filter(pk=pk).first()
            if obj is None:
                raise ApiError("not_found", status_code=404)
            data = CategorySerializer(data=request.data, partial=True)
            data.is_valid(raise_exception=True)
            if "slug" in data.validated_data and model.objects.filter(slug=data.validated_data["slug"]).exclude(pk=pk).exists():
                raise ApiError("validation_error", fields={"slug": ["این نامک قبلاً استفاده شده است."]})
            for key, value in data.validated_data.items():
                setattr(obj, key, value)
            obj.save()
            request_revalidation("catalog")
            audit.record(f"{label}.update", request=request, obj=obj)
            return Response(_taxonomy_row(obj))

        def delete(self, request: Request, pk: int) -> Response:
            obj = model.objects.filter(pk=pk).first()
            if obj is None:
                raise ApiError("not_found", status_code=404)
            if obj.products.exists():
                raise Conflict("not_deletable", "این مورد محصول دارد؛ ابتدا محصولات را منتقل کنید یا آن را پنهان کنید.")
            obj.delete()
            request_revalidation("catalog")
            audit.record(f"{label}.delete", request=request, object_type=label, object_label=obj.name)
            return Response(status=status.HTTP_204_NO_CONTENT)

    return ListCreate, Detail


CategoryListCreateView, CategoryDetailView = _taxonomy_views(Category, "catalog.view", "catalog.edit", "category")
CollectionListCreateView, CollectionDetailView = _taxonomy_views(Collection, "catalog.view", "catalog.edit", "collection")


# --- inventory -------------------------------------------------------------------------


def inventory_row(v: Variant) -> dict[str, Any]:
    stock = getattr(v, "stock", None)
    on_hand = stock.on_hand if stock else 0
    reserved = stock.reserved if stock else 0
    return {
        "variant_id": v.pk,
        "product_id": v.product_id,
        "product_name": v.product.name,
        "product_status": v.product.status,
        "color_name": v.color.name,
        "size": v.size,
        "sku": v.sku,
        "is_active": v.is_active,
        "on_hand": on_hand,
        "reserved": reserved,
        "available": max(0, on_hand - reserved),
        "low_stock_threshold": stock.low_stock_threshold if stock else 3,
        "is_low": stock is not None and v.is_active and (on_hand - reserved) <= stock.low_stock_threshold,
        "version": stock.version if stock else 0,
    }


class InventoryListView(ManageView):
    permission_map = {"GET": "inventory.view"}

    def get(self, request: Request) -> Response:
        qs = Variant.objects.select_related("product", "color", "stock").exclude(product__status=Product.Status.ARCHIVED)
        if str(request.query_params.get("low", "")) in {"1", "true"}:
            qs = qs.filter(is_active=True, stock__on_hand__lte=F("stock__reserved") + F("stock__low_stock_threshold"))
        q = str(request.query_params.get("q", ""))[:80]
        for token in search_tokens(q):
            qs = qs.filter(Q(product__search_text__contains=token) | Q(sku__icontains=token))
        return self.paginate(qs.order_by("product__name", "color__sort_order", "size"), inventory_row)


class AdjustSerializer(serializers.Serializer):
    delta = serializers.IntegerField(min_value=-10000, max_value=10000)
    reason = PlainTextField(max_length=300, allow_blank=False)
    kind = serializers.ChoiceField(
        choices=[InventoryMovement.Kind.ADJUSTMENT, InventoryMovement.Kind.RECEIVE], default=InventoryMovement.Kind.ADJUSTMENT
    )
    expected_version = serializers.IntegerField(required=False)


class InventoryAdjustView(ManageView):
    permission_map = {"POST": "inventory.adjust"}

    def post(self, request: Request, variant_id: int) -> Response:
        variant = Variant.objects.select_related("product", "color").filter(pk=variant_id).first()
        if variant is None:
            raise ApiError("not_found", status_code=404)
        data = AdjustSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        inventory.adjust(
            variant.pk,
            delta=data.validated_data["delta"],
            reason=data.validated_data["reason"],
            actor=request.user,
            expected_version=data.validated_data.get("expected_version"),
            kind=data.validated_data["kind"],
        )
        audit.record("inventory.adjust", request=request, obj=variant, metadata={"delta": data.validated_data["delta"]})
        if variant.product.status == Product.Status.PUBLISHED:
            request_revalidation("catalog", f"product:{variant.product.slug}")
        variant = Variant.objects.select_related("product", "color", "stock").get(pk=variant.pk)
        return Response(inventory_row(variant))


class InventoryThresholdView(ManageView):
    permission_map = {"PATCH": "inventory.adjust"}

    def patch(self, request: Request, variant_id: int) -> Response:
        value = request.data.get("low_stock_threshold")
        if not isinstance(value, int) or not 0 <= value <= 1000:
            raise ApiError("validation_error", fields={"low_stock_threshold": ["عدد ۰ تا ۱۰۰۰ وارد کنید."]})
        StockLevel.objects.get_or_create(variant_id=variant_id)
        StockLevel.objects.filter(variant_id=variant_id).update(low_stock_threshold=value)
        variant = Variant.objects.select_related("product", "color", "stock").filter(pk=variant_id).first()
        if variant is None:
            raise ApiError("not_found", status_code=404)
        return Response(inventory_row(variant))


class InventoryMovementsView(ManageView):
    permission_map = {"GET": "inventory.view"}

    def get(self, request: Request, variant_id: int) -> Response:
        qs = InventoryMovement.objects.filter(variant_id=variant_id).select_related("actor").order_by("-created_at", "-id")
        return self.paginate(
            qs,
            lambda m: {
                "id": m.pk,
                "kind": m.kind,
                "kind_label": m.get_kind_display(),
                "delta_on_hand": m.delta_on_hand,
                "delta_reserved": m.delta_reserved,
                "on_hand_after": m.on_hand_after,
                "reserved_after": m.reserved_after,
                "reason": m.reason,
                "reference": m.reference,
                "actor": m.actor.username if m.actor else "سیستم",
                "created_at": m.created_at,
            },
        )
