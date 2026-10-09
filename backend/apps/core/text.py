"""Plain-text and URL policies for user/staff supplied content.

Policy: product copy, reviews, support messages and CMS fields are stored as *plain text*
(normalized, length-bounded, control/bidi-override characters stripped). They are rendered by
React as text nodes (escaped). No HTML is accepted or rendered anywhere.
"""

from __future__ import annotations

import re
from urllib.parse import unquote, urlsplit

from rest_framework import serializers

from .normalize import normalize_text

_TAG_RE = re.compile(r"<\s*/?\s*[a-zA-Z!][^>]*>")


def clean_plain(value: str, *, max_length: int, multiline: bool = False, allow_empty: bool = True) -> str:
    value = normalize_text(value or "", multiline=multiline)
    if _TAG_RE.search(value):
        raise serializers.ValidationError("استفاده از کد HTML مجاز نیست؛ فقط متن ساده وارد کنید.")
    if len(value) > max_length:
        raise serializers.ValidationError(f"حداکثر {max_length} نویسه مجاز است.")
    if not allow_empty and not value:
        raise serializers.ValidationError("این مقدار لازم است.")
    return value


class PlainTextField(serializers.CharField):
    def __init__(self, *, max_length: int, multiline: bool = False, **kwargs):  # type: ignore[no-untyped-def]
        self.multiline = multiline
        self._max = max_length
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("trim_whitespace", False)
        super().__init__(max_length=max_length * 2, **kwargs)

    def to_internal_value(self, data):  # type: ignore[no-untyped-def]
        value = super().to_internal_value(data)
        return clean_plain(value, max_length=self._max, multiline=self.multiline, allow_empty=self.allow_blank)


def safe_external_url(value: str) -> str:
    """Allow only https:// absolute URLs (no javascript:, data:, credentials, etc.)."""
    value = (value or "").strip()
    if not value:
        return ""
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.netloc or parts.username or parts.password:
        raise serializers.ValidationError("فقط نشانی‌های امن https مجاز است.")
    if any(ch in value for ch in "<>\"' \n\r\t"):
        raise serializers.ValidationError("نشانی معتبر نیست.")
    return value


def safe_internal_path(value: str) -> str:
    """Allow only site-local paths like /shop?category=x (blocks //evil.com and schemes)."""
    value = (value or "").strip()
    if not value:
        return ""
    if not value.startswith("/") or value.startswith("//") or "\\" in value:
        raise serializers.ValidationError("فقط مسیرهای داخلی سایت (شروع با /) مجاز است.")
    decoded = unquote(value)
    if decoded.startswith("//") or re.search(r"[%\\\x00-\x20\x7f]", decoded):
        raise serializers.ValidationError("مسیر معتبر نیست.")
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        raise serializers.ValidationError("فقط مسیرهای داخلی سایت مجاز است.")
    if any(ch in value for ch in "<>\"' \n\r\t"):
        raise serializers.ValidationError("مسیر معتبر نیست.")
    return value[:300]
