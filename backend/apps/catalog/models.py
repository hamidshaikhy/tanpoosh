from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.db import models
from django.db.models import Q

from apps.core.normalize import search_key


class Category(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.CharField(max_length=300, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class Collection(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(max_length=80, unique=True)
    description = models.CharField(max_length=400, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.name


class SizeChart(models.TextChoices):
    TOPS = "tops", "بالاپوش"
    BOTTOMS = "bottoms", "شلوار"
    SHOES = "shoes", "کفش"

    NONE = "none", "بدون جدول"


class StudioSlot(models.TextChoices):
    NONE = "none", "بدون پرو"
    TOP = "top", "بالاپوش"
    OUTERWEAR = "outerwear", "کاپشن و رویی"
    BOTTOM = "bottom", "شلوار"
    SHOES = "shoes", "کفش"
    ACCESSORY = "accessory", "عینک و اکسسوری"


class Product(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"
        ARCHIVED = "archived", "بایگانی"

    name = models.CharField(max_length=120)
    slug = models.SlugField(max_length=120, unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT, db_index=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="products")
    collections = models.ManyToManyField(Collection, blank=True, related_name="products")
    short_description = models.CharField(max_length=200, blank=True)
    description = models.TextField(max_length=4000, blank=True)
    materials = models.TextField(max_length=1000, blank=True)
    care = models.TextField(max_length=1000, blank=True)
    fit_notes = models.TextField(max_length=1000, blank=True)
    size_chart = models.CharField(max_length=10, choices=SizeChart.choices, default=SizeChart.TOPS)
    is_new = models.BooleanField(default=False)
    studio_slot = models.CharField(max_length=10, choices=StudioSlot.choices, default=StudioSlot.NONE)
    studio_asset = models.CharField(max_length=64, blank=True)
    seo_title = models.CharField(max_length=70, blank=True)
    seo_description = models.CharField(max_length=160, blank=True)
    search_text = models.TextField(blank=True, editable=False)
    sort_order = models.IntegerField(default=0)
    version = models.PositiveIntegerField(default=1)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["sort_order", "-published_at", "-id"]
        indexes = [
            models.Index(fields=["status", "category"]),
            models.Index(fields=["status", "-published_at"]),
            GinIndex(fields=["search_text"], name="product_search_trgm", opclasses=["gin_trgm_ops"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="published") | Q(published_at__isnull=False),
                name="product_published_has_date",
            )
        ]

    def __str__(self) -> str:
        return self.name

    def rebuild_search_text(self) -> None:
        parts = [self.name, self.short_description, self.category.name if self.category_id else ""]
        parts += list(self.colors.values_list("name", flat=True)) if self.pk else []
        self.search_text = search_key(" ".join(p for p in parts if p))


class ProductColor(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="colors")
    code = models.SlugField(max_length=32)
    name = models.CharField(max_length=40)
    hex = models.CharField(max_length=7)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["product", "code"], name="uniq_product_color_code"),
            models.CheckConstraint(condition=Q(hex__regex=r"^#[0-9A-Fa-f]{6}$"), name="color_hex_format"),
        ]

    def __str__(self) -> str:
        return f"{self.product.name} — {self.name}"


class Variant(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    color = models.ForeignKey(ProductColor, on_delete=models.PROTECT, related_name="variants")
    size = models.CharField(max_length=8)
    sku = models.CharField(max_length=40, unique=True)
    price_toman = models.PositiveBigIntegerField()
    is_active = models.BooleanField(default=True)
    weight_grams = models.PositiveIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["product", "color", "size"], name="uniq_variant_color_size"),
            models.CheckConstraint(
                condition=Q(price_toman__gte=1000) & Q(price_toman__lte=100_000_000),
                name="variant_price_bounds",
            ),
            models.CheckConstraint(condition=Q(size__regex=r"^[A-Z0-9]{1,8}$"), name="variant_size_code"),
        ]

    def __str__(self) -> str:
        return self.sku


def media_upload_key(instance: ProductMedia, filename: str) -> str:
    # Generated storage key; the client's filename is never used for the path.
    return f"products/{uuid.uuid4().hex}.webp"


def media_thumb_key(instance: ProductMedia, filename: str) -> str:
    return f"products/thumbs/{uuid.uuid4().hex}.webp"


class ProductMedia(models.Model):
    class Kind(models.TextChoices):
        FRONT = "front", "روبه‌رو"
        BACK = "back", "پشت"
        DETAIL = "detail", "جزئیات"
        MODEL = "model", "روی مدل"
        FLATLAY = "flatlay", "چیدمان"

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="media")
    color = models.ForeignKey(ProductColor, null=True, blank=True, on_delete=models.SET_NULL, related_name="media")
    image = models.ImageField(upload_to=media_upload_key, max_length=200)
    thumb = models.ImageField(upload_to=media_thumb_key, max_length=200)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    mime = models.CharField(max_length=30, default="image/webp")
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.FRONT)
    alt_text = models.CharField(max_length=160)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self) -> str:
        return self.alt_text
