"""Production settings. Refuses to start with unsafe or missing essential configuration."""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import env_bool, env_int, env_list, env_str

DJANGO_ENV = "production"
IS_PRODUCTION = True
DEBUG = False
SERVE_MEDIA = False
API_DOCS_ENABLED = env_bool("API_DOCS_ENABLED", False)

_errors: list[str] = []

if len(SECRET_KEY) < 50 or SECRET_KEY.startswith("change-me"):  # noqa: F405
    _errors.append("DJANGO_SECRET_KEY must be a strong random value (>= 50 chars).")
if not ALLOWED_HOSTS or "*" in ALLOWED_HOSTS:  # noqa: F405
    _errors.append("DJANGO_ALLOWED_HOSTS must list explicit hostnames.")
if not PUBLIC_BASE_URL.startswith("https://"):  # noqa: F405
    _errors.append("PUBLIC_BASE_URL must use https:// in production.")
if any(not origin.startswith("https://") for origin in CSRF_TRUSTED_ORIGINS):  # noqa: F405
    _errors.append("CSRF_TRUSTED_ORIGINS must be https origins.")
if not MFA_ENCRYPTION_KEY:  # noqa: F405
    _errors.append("MFA_ENCRYPTION_KEY is required.")
if MFA_DEV_BYPASS:  # noqa: F405
    _errors.append("MFA_DEV_BYPASS must never be enabled in production.")
if PAYMENT_MOCK_ENABLED or PAYMENT_PROVIDER == "mock":  # noqa: F405
    _errors.append("The mock payment gateway cannot be enabled in production.")
if PAYMENT_PROVIDER != "zarinpal":  # noqa: F405
    _errors.append("PAYMENT_PROVIDER must be 'zarinpal' in production.")
if ZARINPAL_MODE not in {"sandbox", "live"}:  # noqa: F405
    _errors.append("ZARINPAL_MODE must be sandbox or live.")
if ZARINPAL_MODE == "live" and len(ZARINPAL_MERCHANT_ID) != 36:  # noqa: F405
    _errors.append("A real 36-character ZARINPAL_MERCHANT_ID is required for live mode.")
if not PAYMENT_CALLBACK_URL.startswith("https://"):  # noqa: F405
    _errors.append("PAYMENT_CALLBACK_URL must be https in production.")
if not FRONTEND_REVALIDATE_SECRET or len(FRONTEND_REVALIDATE_SECRET) < 32:  # noqa: F405
    _errors.append("FRONTEND_REVALIDATE_SECRET must be set (>= 32 chars).")
if EMAIL_BACKEND.endswith("console.EmailBackend") or EMAIL_BACKEND.endswith("locmem.EmailBackend"):  # noqa: F405
    _errors.append("Configure a real EMAIL_BACKEND for production.")

if _errors:
    raise ImproperlyConfigured("Unsafe production configuration:\n- " + "\n- ".join(_errors))

# Host-scoped secure cookies (__Host- prefix requires Secure, Path=/ and no Domain).
SESSION_COOKIE_NAME = "__Host-tp_session"
CSRF_COOKIE_NAME = "__Host-tp_csrftoken"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_AGE = env_int("SESSION_COOKIE_AGE", 60 * 60 * 24 * 7)

# TLS terminates at the reverse proxy; trust X-Forwarded-Proto only from that proxy.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
TRUSTED_PROXY_COUNT = env_int("TRUSTED_PROXY_COUNT", 1)
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/"]
SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = env_bool("SECURE_HSTS_INCLUDE_SUBDOMAINS", False)
SECURE_HSTS_PRELOAD = False

# Object storage for uploaded media (S3-compatible).
if env_bool("USE_S3_MEDIA", False):
    STORAGES = {  # noqa: F405
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "bucket_name": env_str("S3_BUCKET", required=True),
                "endpoint_url": env_str("S3_ENDPOINT_URL") or None,
                "region_name": env_str("S3_REGION") or None,
                "access_key": env_str("S3_ACCESS_KEY_ID", required=True),
                "secret_key": env_str("S3_SECRET_ACCESS_KEY", required=True),
                "custom_domain": env_str("S3_CUSTOM_DOMAIN") or None,
                "default_acl": None,
                "querystring_auth": False,
                "file_overwrite": False,
                "object_parameters": {"CacheControl": "public, max-age=31536000, immutable"},
            },
        },
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }

ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS")
