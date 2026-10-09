"""Staff-side catalog mutations (create/edit/publish/archive, media). Every write is validated
on the backend regardless of what the management UI allows."""

from __future__ import annotations

from typing import Any

from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.utils import timezone

from apps.core import audit
from apps.core.errors import ApiError, Conflict
from apps.core.revalidate import request_revalidation
from apps.inventory.models import InventoryMovement, StockLevel

from . import studio
from .media import process_upload
from .models import Category, Collection, Product, ProductColor, ProductMedia, Variant


def _revalidate(product: Product, *, old_slug: str | None = None) -> None:
    tags = ["catalog", f"product:{product.slug}"]
    if old_slug and old_slug != product.slug:
        tags.append(f"product:{old_slug}")
    request_revalidation(*tags)


def _validate_studio(data: dict[str, Any]) -> None:
    slot = data.get("studio_slot", "none")
    asset = data.get("studio_asset", "")
    if asset:
        garments = studio.image_set_ids_by_slot()
        if asset not in garments:
            raise ApiError("validation_error", fields={"studio_asset": ["این مجموعه عکس در فهرست تصاویر استودیو نیست."]})
        if garments[asset] != slot:
            raise ApiError("validation_error", fields={"studio_asset": ["دستهٔ مجموعه عکس با دستهٔ محصول یکسان نیست."]})


def apply_product(product: Product | None, data: dict[str, Any], *, actor: Any, request: Any = None) -> Product:
    with transaction.atomic():
        old_slug = None
        if product is not None:
            product = Product.objects.select_for_update().get(pk=product.pk)
            if data.get("version") is not None and int(data["version"]) != product.version:
                raise Conflict(
                    "stale_version",
                    "این محصول در همین فاصله توسط کاربر دیگری ویرایش شده است. صفحه را تازه کنید.",
                    extra={"current_version": product.version},
                )
            old_slug = product.slug
        else:
            product = Product(created_by=actor, status=Product.Status.DRAFT)

        category = Category.objects.filter(pk=data["category_id"]).first()
        if category is None:
            raise ApiError("validation_error", fields={"category_id": ["دسته‌بندی معتبر نیست."]})
        if Product.objects.filter(slug=data["slug"]).exclude(pk=product.pk).exists():
            raise ApiError("validation_error", fields={"slug": ["این نامک (slug) قبلاً استفاده شده است."]})
        _validate_studio(data)

        for field in (
            "name",
            "slug",
            "short_description",
            "description",
            "materials",
            "care",
            "fit_notes",
            "size_chart",
            "is_new",
            "studio_slot",
            "studio_asset",
            "seo_title",
            "seo_description",
            "sort_order",
        ):
            if field in data:
                setattr(product, field, data[field])
        product.category = category
        product.version = (product.version or 0) + 1 if product.pk else 1
        product.save()

        if "collection_ids" in data:
            collections = list(Collection.objects.filter(pk__in=data["collection_ids"]))
            if len(collections) != len(set(data["collection_ids"])):
                raise ApiError("validation_error", fields={"collection_ids": ["کالکشن نامعتبر است."]})
            product.collections.set(collections)

        colors_by_code: dict[str, ProductColor] = {c.code: c for c in product.colors.all()}
        seen_codes = set()
        for index, c in enumerate(data.get("colors", [])):
            if c["code"] in seen_codes:
                raise ApiError("validation_error", fields={f"colors.{index}.code": ["کد رنگ تکراری است."]})
            seen_codes.add(c["code"])
            color = colors_by_code.get(c["code"]) or ProductColor(product=product, code=c["code"])
            color.name = c["name"]
            color.hex = c["hex"]
            color.sort_order = c.get("sort_order", index)
            color.save()
            colors_by_code[c["code"]] = color

        existing = {(v.color.code, v.size): v for v in product.variants.select_related("color")}
        seen_keys = set()
        for index, v in enumerate(data.get("variants", [])):
            key = (v["color_code"], v["size"])
            if key in seen_keys:
                raise ApiError("validation_error", fields={f"variants.{index}": ["ترکیب رنگ و سایز تکراری است."]})
            seen_keys.add(key)
            color = colors_by_code.get(v["color_code"])
            if color is None or v["color_code"] not in seen_codes:
                raise ApiError("validation_error", fields={f"variants.{index}.color_code": ["رنگ این تنوع در فهرست رنگ‌ها نیست."]})
            variant = existing.get(key)
            created = variant is None
            if created:
                variant = Variant(product=product, color=color, size=v["size"])
            variant.sku = v["sku"]
            variant.price_toman = v["price_toman"]
            variant.is_active = v.get("is_active", True)
            variant.weight_grams = v.get("weight_grams", 0)
            variant.sort_order = index
            try:
                with transaction.atomic():
                    variant.save()
            except IntegrityError:
                raise ApiError("validation_error", fields={f"variants.{index}.sku": ["این SKU قبلاً استفاده شده است."]}) from None
            if created:
                initial = int(v.get("initial_stock") or 0)
                StockLevel.objects.create(variant=variant, on_hand=initial)
                if initial:
                    InventoryMovement.objects.create(
                        variant=variant,
                        kind=InventoryMovement.Kind.RECEIVE,
                        delta_on_hand=initial,
                        on_hand_after=initial,
                        reserved_after=0,
                        reason="موجودی اولیه هنگام ایجاد",
                        actor=actor,
                    )
        for key, variant in existing.items():
            if key not in seen_keys and variant.is_active:
                variant.is_active = False
                variant.save(update_fields=["is_active", "updated_at"])

        product.rebuild_search_text()
        product.save(update_fields=["search_text"])
        if product.status == Product.Status.PUBLISHED:
            problems = publish_problems(product)
            if problems:
                raise ApiError("publish_blocked", "محصول منتشرشده باید معتبر بماند.", fields={"publish": problems})
            _revalidate(product, old_slug=old_slug)
        audit.record("product.save", actor=actor, request=request, obj=product, metadata={"version": product.version})
        return product


def publish_problems(product: Product) -> list[str]:
    problems = []
    if not product.name.strip():
        problems.append("نام محصول خالی است.")
    if not product.variants.filter(is_active=True).exists():
        problems.append("حداقل یک تنوع (رنگ/سایز) فعال لازم است.")
    if not product.media.exists():
        problems.append("حداقل یک تصویر محصول لازم است.")
    if product.media.filter(alt_text="").exists():
        problems.append("همهٔ تصاویر باید متن جایگزین (alt) داشته باشند.")
    if not product.category.is_visible:
        problems.append("دسته‌بندی محصول پنهان است.")
    if product.studio_asset and not studio.is_supported(product.studio_slot, product.studio_asset):
        problems.append("مجموعه عکس انتخاب‌شده معتبر نیست.")
    return problems


def change_status(product: Product, action: str, *, version: int | None, actor: Any, request: Any = None) -> Product:
    with transaction.atomic():
        product = Product.objects.select_for_update().get(pk=product.pk)
        if version is not None and version != product.version:
            raise Conflict("stale_version", "این محصول در همین فاصله ویرایش شده است. صفحه را تازه کنید.")
        if action == "publish":
            problems = publish_problems(product)
            if problems:
                raise ApiError("publish_blocked", "پیش از انتشار این موارد را برطرف کنید.", fields={"publish": problems})
            product.status = Product.Status.PUBLISHED
            product.published_at = product.published_at or timezone.now()
        elif action == "unpublish":
            product.status = Product.Status.DRAFT
        elif action == "archive":
            product.status = Product.Status.ARCHIVED
        elif action == "restore":
            if product.status != Product.Status.ARCHIVED:
                raise Conflict("invalid_transition", "فقط محصولات بایگانی‌شده قابل بازگردانی هستند.")
            product.status = Product.Status.DRAFT
        else:
            raise ApiError("validation_error", fields={"action": ["عملیات معتبر نیست."]})
        product.version += 1
        product.save()
        _revalidate(product)
        audit.record(f"product.{action}", actor=actor, request=request, obj=product)
        return product


def delete_product(product: Product, *, actor: Any, request: Any = None) -> None:
    if product.status != Product.Status.DRAFT:
        raise Conflict("not_deletable", "فقط محصولات پیش‌نویس قابل حذف هستند؛ سایر محصولات را بایگانی کنید.")
    label = str(product)
    try:
        with transaction.atomic():
            StockLevel.objects.filter(variant__product=product).delete()
            product.delete()
    except ProtectedError:
        raise Conflict("not_deletable", "این محصول سابقهٔ سفارش یا موجودی دارد؛ به جای حذف، بایگانی کنید.") from None
    audit.record("product.delete", actor=actor, request=request, object_type="product", object_label=label)


def add_media(
    product: Product, upload: Any, *, color_code: str, kind: str, alt_text: str, actor: Any, request: Any = None
) -> ProductMedia:
    from django.conf import settings

    if product.media.count() >= settings.PRODUCT_MEDIA_MAX_PER_PRODUCT:
        raise ApiError("too_many_media", "تعداد تصاویر این محصول به حداکثر رسیده است.")
    color = None
    if color_code:
        color = product.colors.filter(code=color_code).first()
        if color is None:
            raise ApiError("validation_error", fields={"color_code": ["این رنگ برای محصول تعریف نشده است."]})
    processed = process_upload(upload, declared_size=getattr(upload, "size", None))
    media = ProductMedia(
        product=product,
        color=color,
        kind=kind,
        alt_text=alt_text or product.name,
        width=processed.width,
        height=processed.height,
        mime="image/webp",
        sort_order=(product.media.order_by("-sort_order").values_list("sort_order", flat=True).first() or 0) + 1,
        uploaded_by=actor,
    )
    media.image.save("image.webp", processed.main, save=False)
    media.thumb.save("thumb.webp", processed.thumb, save=False)
    media.save()
    if product.status == Product.Status.PUBLISHED:
        _revalidate(product)
    audit.record("product.media_upload", actor=actor, request=request, obj=product, metadata={"media": media.pk})
    return media


def delete_media(media: ProductMedia, *, actor: Any, request: Any = None) -> None:
    product = media.product
    if product.status == Product.Status.PUBLISHED and product.media.count() <= 1:
        raise Conflict("last_media", "محصول منتشرشده باید حداقل یک تصویر داشته باشد.")
    image_name, thumb_name = media.image.name, media.thumb.name
    storage = media.image.storage
    media.delete()

    def _cleanup() -> None:
        for name in (image_name, thumb_name):
            try:
                storage.delete(name)
            except Exception as exc:  # noqa: BLE001 -- best-effort storage cleanup must not undo a committed DB deletion
                import logging

                logging.getLogger("tanpoosh.media").warning("Orphan media cleanup failed: %s", exc.__class__.__name__)

    transaction.on_commit(_cleanup)
    if product.status == Product.Status.PUBLISHED:
        _revalidate(product)
    audit.record("product.media_delete", actor=actor, request=request, obj=product)
