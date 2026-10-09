"""Structured, validated storefront content. No arbitrary HTML/JS is stored or rendered."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class StoreSettings(models.Model):
    """Singleton (pk=1). Public, non-secret configuration only."""

    hero_title = models.CharField(max_length=60, default="خوش‌پوش، به سبک خودت")
    hero_subtitle = models.CharField(max_length=120, default="لباس‌های روزمره، انتخاب‌های شخصی")
    hero_primary_label = models.CharField(max_length=30, default="مشاهده کالکشن")
    hero_primary_href = models.CharField(max_length=200, default="/shop")
    hero_secondary_label = models.CharField(max_length=30, default="ورود به استودیو")
    hero_secondary_href = models.CharField(max_length=200, default="/studio")
    picks_title = models.CharField(max_length=60, default="انتخاب‌های روزمره")
    picks_subtitle = models.CharField(max_length=120, default="ساده، خوش‌دوخت، ماندگار.")
    featured_products = models.JSONField(default=list, blank=True)  # ordered list of product ids
    featured_collection = models.ForeignKey(
        "catalog.Collection", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    studio_title = models.CharField(max_length=60, default="بپوش، ببین، انتخاب کن")
    studio_subtitle = models.CharField(max_length=160, default="لباس‌ها را روی مدل ببین و استایل خودت را بساز")
    announcement_enabled = models.BooleanField(default=True)
    # When blank the announcement is generated from the actual shipping configuration.
    announcement_text = models.CharField(max_length=120, blank=True)
    footer_about = models.CharField(max_length=300, default="تن‌پوش؛ لباس روزمرهٔ مردانه با طراحی ساده و دوخت دقیق.")
    contact_email = models.EmailField(max_length=254, blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_hours = models.CharField(max_length=120, blank=True)
    contact_address = models.CharField(max_length=300, blank=True)
    instagram_url = models.URLField(max_length=200, blank=True)
    telegram_url = models.URLField(max_length=200, blank=True)
    seo_title = models.CharField(max_length=70, default="تن‌پوش | پوشاک روزمرهٔ مردانه")
    seo_description = models.CharField(
        max_length=160, default="خرید آنلاین کاپشن، تیشرت، شلوار و کفش مردانه با طراحی مینیمال و استودیوی پرو روی مدل."
    )
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self) -> str:
        return f"StoreSettings: {self.pk}"

    @classmethod
    def load(cls) -> StoreSettings:
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class InfoPage(models.Model):
    """Informational page (about, contact, shipping, returns, privacy, terms, size guide).

    `blocks` is a validated list of {"type": "heading"|"paragraph"|"list"|"note", "text"/"items"}.
    """

    slug = models.SlugField(max_length=40, unique=True)
    title = models.CharField(max_length=80)
    summary = models.CharField(max_length=200, blank=True)
    blocks = models.JSONField(default=list)
    is_seed_content = models.BooleanField(default=True)
    is_published = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["slug"]

    def __str__(self) -> str:
        return self.title
