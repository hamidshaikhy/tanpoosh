from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.core.jalali import fa_digits
from apps.core.text import clean_plain
from apps.orders.models import ShippingMethod

from .models import InfoPage, StoreSettings

BLOCK_TYPES = {"heading", "paragraph", "list", "note"}
INFO_SLUGS = ["about", "contact", "shipping", "returns", "privacy", "terms", "size-guide"]


def humanize_toman(amount: int) -> str:
    if amount >= 1_000_000 and amount % 1_000_000 == 0:
        return f"{fa_digits(amount // 1_000_000)} میلیون تومان"
    if amount >= 1_000 and amount % 1_000 == 0 and amount < 1_000_000:
        return f"{fa_digits(amount // 1_000)} هزار تومان"
    return fa_digits(f"{amount:,}").replace(",", "٬") + " تومان"


def shipping_announcement() -> str:
    method = (
        ShippingMethod.objects.filter(is_active=True, free_threshold_toman__isnull=False).order_by("free_threshold_toman").first()
    )
    if method is None:
        return ""
    name = method.name.split("(")[0].strip()
    return f"{name} رایگان برای خرید بالای {humanize_toman(method.free_threshold_toman or 0)}"


def public_settings() -> dict[str, Any]:
    s = StoreSettings.load()
    announcement = ""
    if s.announcement_enabled:
        announcement = s.announcement_text or shipping_announcement()
    return {
        "announcement": announcement,
        "footer_about": s.footer_about,
        "contact": {
            "email": s.contact_email,
            "phone": s.contact_phone,
            "hours": s.contact_hours,
            "address": s.contact_address,
        },
        "social": {"instagram": s.instagram_url, "telegram": s.telegram_url},
        "seo": {"title": s.seo_title, "description": s.seo_description},
        "shipping_methods": [
            {
                "code": m.code,
                "name": m.name,
                "fee_toman": m.fee_toman,
                "free_threshold_toman": m.free_threshold_toman,
                "eta_text": m.eta_text,
                "description": m.description,
            }
            for m in ShippingMethod.objects.filter(is_active=True).order_by("sort_order", "id")
        ],
        "version": s.version,
    }


def validate_blocks(blocks: Any) -> list[dict[str, Any]]:
    if not isinstance(blocks, list) or len(blocks) > 60:
        raise serializers.ValidationError("ساختار محتوا معتبر نیست (حداکثر ۶۰ بخش).")
    clean: list[dict[str, Any]] = []
    for block in blocks:
        if not isinstance(block, dict) or block.get("type") not in BLOCK_TYPES:
            raise serializers.ValidationError("نوع بخش محتوا معتبر نیست.")
        kind = block["type"]
        if kind == "list":
            items = block.get("items")
            if not isinstance(items, list) or not 1 <= len(items) <= 30:
                raise serializers.ValidationError("فهرست باید ۱ تا ۳۰ مورد داشته باشد.")
            clean.append({"type": kind, "items": [clean_plain(str(i), max_length=400, allow_empty=False) for i in items]})
        else:
            max_len = 120 if kind == "heading" else 2000
            clean.append(
                {
                    "type": kind,
                    "text": clean_plain(
                        str(block.get("text", "")), max_length=max_len, multiline=kind != "heading", allow_empty=False
                    ),
                }
            )
    return clean


def page_payload(page: InfoPage) -> dict[str, Any]:
    return {
        "slug": page.slug,
        "title": page.title,
        "summary": page.summary,
        "blocks": page.blocks,
        "is_seed_content": page.is_seed_content,
        "updated_at": page.updated_at,
    }
