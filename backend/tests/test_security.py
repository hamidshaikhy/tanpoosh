"""Attack-oriented checks for raster ingestion, URLs, exports and abuse limits."""

import io
import os
import subprocess
import sys

import pytest
from PIL import Image
from rest_framework import serializers
from rest_framework.test import APIClient

from apps.catalog.media import process_upload
from apps.content.services import validate_blocks
from apps.core.errors import ApiError
from apps.core.text import safe_internal_path
from apps.manage.base import csv_safe
from tests.conftest import login, make_user


def raster(*, exif=False):
    buf = io.BytesIO()
    image = Image.new("RGB", (320, 320), "ivory")
    metadata = Image.Exif()
    if exif:
        metadata[270] = "private camera metadata"
        metadata[315] = "private owner"
    image.save(buf, "JPEG", exif=metadata)
    buf.seek(0)
    return buf


@pytest.mark.parametrize(
    "content",
    [b"<svg xmlns='http://www.w3.org/2000/svg'></svg>", b"<html><script>alert(1)</script></html>", b"not an image.jpg", b""],
)
def test_non_raster_uploads_are_rejected(content):
    with pytest.raises(ApiError):
        process_upload(io.BytesIO(content))


def test_decompression_bomb_and_byte_limits(settings):
    settings.UPLOAD_IMAGE_MAX_PIXELS = 1000
    with pytest.raises(ApiError):
        process_upload(raster())
    settings.UPLOAD_IMAGE_MAX_BYTES = 8
    with pytest.raises(ApiError):
        process_upload(io.BytesIO(b"x" * 9))


def test_reencoding_strips_metadata():
    out = process_upload(raster(exif=True))
    for file in (out.main, out.thumb):
        image = Image.open(file)
        assert image.format == "WEBP"
        assert not image.getexif()
        assert "exif" not in image.info


def test_valid_png_with_xml_metadata_is_decoded_and_cleaned():
    from PIL.PngImagePlugin import PngInfo

    meta = PngInfo()
    meta.add_text("provenance", "<svg>benign image provenance metadata</svg>")
    buffer = io.BytesIO()
    Image.new("RGB", (320, 320), "ivory").save(buffer, "PNG", pnginfo=meta)
    buffer.seek(0)
    output = process_upload(buffer)
    assert Image.open(output.main).info.get("provenance") is None


@pytest.mark.parametrize(
    "value", ["//evil.com", "javascript:alert(1)", "/\\evil.com", "/%2f%2fevil.com", "/%5cevil.com", "/%0a/evil.com"]
)
def test_internal_urls_reject_external_and_encoded_targets(value):
    with pytest.raises(serializers.ValidationError):
        safe_internal_path(value)


@pytest.mark.parametrize("value", ["=1+1", "+cmd", "-cmd", "@SUM(A1)", "\t=1", "\r=1", "  =1", "\n=1", "＝1"])
def test_csv_formula_injection(value):
    assert csv_safe(value).startswith("'")
    assert csv_safe("تهران") == "تهران"


@pytest.mark.parametrize(
    "block",
    [{"type": "paragraph", "text": "<script>alert(1)</script>"}, {"type": "list", "items": ["<img src=x onerror=alert(1)>"]}],
)
def test_cms_blocks_reject_html(block):
    with pytest.raises(serializers.ValidationError):
        validate_blocks([block])


@pytest.mark.django_db
def test_media_traversal_is_404(settings):
    settings.SERVE_MEDIA = True
    from django.http import Http404
    from django.test import RequestFactory

    from apps.core.views import serve_media

    with pytest.raises(Http404):
        serve_media(RequestFactory().get("/media/../.env"), "../.env")


@pytest.mark.django_db
def test_support_reset_and_verification_limits():
    c = APIClient()
    support = {
        "name": "کاربر نمونه",
        "email": "limits@example.com",
        "topic": "other",
        "subject": "پرسش",
        "body": "این یک پیام نمونه برای پشتیبانی است.",
    }
    for _ in range(5):
        assert c.post("/api/v1/support/messages", support, format="json").status_code == 201
    assert c.post("/api/v1/support/messages", support, format="json").status_code == 429
    for _ in range(3):
        assert c.post("/api/v1/auth/password/forgot", {"email": "missing@example.com"}, format="json").status_code == 200
    assert c.post("/api/v1/auth/password/forgot", {"email": "missing@example.com"}, format="json").status_code == 429
    login(c, make_user())
    for _ in range(3):
        assert c.post("/api/v1/auth/email/resend").status_code == 200
    assert c.post("/api/v1/auth/email/resend").status_code == 429


def test_unsafe_production_configuration_refused():
    env = {
        **os.environ,
        "DJANGO_SETTINGS_MODULE": "config.settings.production",
        "DJANGO_SECRET_KEY": "unsafe",
        "MFA_DEV_BYPASS": "true",
        "PAYMENT_PROVIDER": "mock",
    }
    result = subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"], env=env, capture_output=True, text=True, timeout=30
    )
    assert result.returncode != 0
    assert "Unsafe production configuration" in result.stderr
    assert "mock payment gateway" in result.stderr
