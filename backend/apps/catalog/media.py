"""Untrusted image ingestion.

* size limit enforced before decoding; pixel-count limit guards decompression bombs
* only real JPEG/PNG/WebP raster content is accepted (decoded by Pillow, not by extension/MIME)
* SVG/HTML/anything else is rejected; no remote URL ingestion exists (no SSRF surface)
* EXIF orientation applied, then re-encoded to WebP -> all metadata (GPS etc.) dropped
* storage keys are generated server-side (no client filenames, no path traversal/overwrites)
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from typing import BinaryIO

from django.conf import settings
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.core.errors import ApiError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAIN_MAX_SIDE = 1600
THUMB_MAX_SIDE = 640


@dataclass
class ProcessedImage:
    main: ContentFile
    thumb: ContentFile
    width: int
    height: int


def _reject(message: str) -> ApiError:
    return ApiError("invalid_image", message, fields={"file": [message]})


def _encode(img: Image.Image, max_side: int, quality: int) -> tuple[bytes, int, int]:
    copy = img.copy()
    copy.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    copy.save(buffer, format="WEBP", quality=quality, method=5)
    return buffer.getvalue(), copy.width, copy.height


def process_upload(stream: BinaryIO, *, declared_size: int | None = None) -> ProcessedImage:
    max_bytes = settings.UPLOAD_IMAGE_MAX_BYTES
    if declared_size is not None and declared_size > max_bytes:
        raise _reject(f"حجم تصویر حداکثر {max_bytes // (1024 * 1024)} مگابایت است.")
    raw = stream.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise _reject(f"حجم تصویر حداکثر {max_bytes // (1024 * 1024)} مگابایت است.")
    if not raw:
        raise _reject("فایل خالی است.")
    head = raw[:512].lstrip().lower()
    # Raster metadata can legitimately contain XML/SVG (e.g. C2PA). Its bytes are
    # never rendered and are stripped below; only reject a document at the start.
    if head.startswith(b"<"):
        raise _reject("فایل‌های SVG و HTML مجاز نیستند؛ فقط JPEG، PNG یا WebP بارگذاری کنید.")

    Image.MAX_IMAGE_PIXELS = settings.UPLOAD_IMAGE_MAX_PIXELS
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            probe = Image.open(io.BytesIO(raw))
            fmt = probe.format
            probe.verify()
            img = Image.open(io.BytesIO(raw))
            img.load()
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise _reject("ابعاد تصویر بیش از حد مجاز است.") from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise _reject("فایل یک تصویر معتبر نیست.") from None

    if fmt not in ALLOWED_FORMATS:
        raise _reject("فقط تصاویر JPEG، PNG یا WebP پذیرفته می‌شود.")
    width, height = img.size
    if min(width, height) < settings.UPLOAD_IMAGE_MIN_SIDE:
        raise _reject(f"کمترین ضلع تصویر باید {settings.UPLOAD_IMAGE_MIN_SIDE} پیکسل باشد.")
    if max(width, height) > settings.UPLOAD_IMAGE_MAX_SIDE:
        raise _reject("ابعاد تصویر بیش از حد مجاز است.")
    if getattr(img, "n_frames", 1) > 1:
        raise _reject("تصاویر متحرک پذیرفته نمی‌شوند.")

    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() or img.mode == "P" else "RGB")

    main_bytes, w, h = _encode(img, MAIN_MAX_SIDE, 84)
    thumb_bytes, _, _ = _encode(img, THUMB_MAX_SIDE, 80)
    return ProcessedImage(
        main=ContentFile(main_bytes, name="image.webp"),
        thumb=ContentFile(thumb_bytes, name="thumb.webp"),
        width=w,
        height=h,
    )
