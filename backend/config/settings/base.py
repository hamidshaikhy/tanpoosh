"""Shared settings. Environment-specific modules import * from here and tighten/override.

Nothing secret lives in this file; all secrets come from the environment.
"""

from __future__ import annotations

from datetime import timedelta

from celery.schedules import crontab

from config.env import BASE_DIR, env_bool, env_int, env_list, env_str, load_dotenv

load_dotenv(BASE_DIR / ".env")

DJANGO_ENV = env_str("DJANGO_ENV", "development")
IS_PRODUCTION = DJANGO_ENV == "production"

SECRET_KEY = env_str("DJANGO_SECRET_KEY")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", ["localhost", "127.0.0.1"])

# Public origin the browser uses (same origin for Next.js + /api/v1 via reverse proxy).
PUBLIC_BASE_URL = env_str("PUBLIC_BASE_URL", "http://localhost:8088").rstrip("/")
# Internal URL Django uses to ask the Next.js server to revalidate public catalog caches.
FRONTEND_INTERNAL_URL = env_str("FRONTEND_INTERNAL_URL", "http://127.0.0.1:3000").rstrip("/")
FRONTEND_REVALIDATE_SECRET = env_str("FRONTEND_REVALIDATE_SECRET")

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.catalog",
    "apps.inventory",
    "apps.promotions",
    "apps.carts",
    "apps.orders",
    "apps.payments",
    "apps.content",
    "apps.support",
    "apps.reviews",
    "apps.looks",
]

MIDDLEWARE = [
    "apps.core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "apps.core.middleware.ApiSecurityHeadersMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "apps.accounts.middleware.SessionActivityMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
APPEND_SLASH = False
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    }
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env_str("POSTGRES_DB", "tanpoosh"),
        "USER": env_str("POSTGRES_USER", "tanpoosh"),
        "PASSWORD": env_str("POSTGRES_PASSWORD"),
        "HOST": env_str("POSTGRES_HOST", "127.0.0.1"),
        "PORT": env_str("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": env_int("POSTGRES_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {
            "connect_timeout": 5,
        },
        "TEST": {"NAME": env_str("POSTGRES_TEST_DB", "test_tanpoosh")},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["apps.accounts.backends.IdentifierBackend"]

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
# Upper bound accepted by serializers (rejected with an explicit error, never truncated).
PASSWORD_MAX_LENGTH = 256

# --- Sessions / CSRF -------------------------------------------------------
SESSION_ENGINE = "apps.accounts.session_store"
SESSION_COOKIE_NAME = env_str("SESSION_COOKIE_NAME", "tp_session")
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", False)
SESSION_COOKIE_AGE = env_int("SESSION_COOKIE_AGE", 60 * 60 * 24 * 14)
SESSION_COOKIE_DOMAIN = None  # host-only cookie
SESSION_SAVE_EVERY_REQUEST = False

CSRF_COOKIE_NAME = env_str("CSRF_COOKIE_NAME", "tp_csrftoken")
CSRF_COOKIE_HTTPONLY = True  # token is handed to the SPA via /api/v1/auth/csrf, never read from document.cookie
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", False)
CSRF_COOKIE_DOMAIN = None
CSRF_USE_SESSIONS = False
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS", [PUBLIC_BASE_URL])
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"

# Staff sessions idle out sooner than customer sessions.
STAFF_SESSION_IDLE_SECONDS = env_int("STAFF_SESSION_IDLE_SECONDS", 60 * 60 * 4)
REAUTH_WINDOW_SECONDS = env_int("REAUTH_WINDOW_SECONDS", 60 * 10)

# --- Proxy / client IP ------------------------------------------------------
# Number of trusted reverse proxies in front of Django that append to X-Forwarded-For.
TRUSTED_PROXY_COUNT = env_int("TRUSTED_PROXY_COUNT", 0)
USE_X_FORWARDED_HOST = False

# --- I18N ------------------------------------------------------------------
LANGUAGE_CODE = "fa"
LANGUAGES = [("fa", "Persian")]
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

# --- Static & media --------------------------------------------------------
STATIC_URL = "/django-static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = env_str("MEDIA_URL", "/media/")
MEDIA_ROOT = env_str("MEDIA_ROOT", str(BASE_DIR / "media"))
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}
SERVE_MEDIA = env_bool("DJANGO_SERVE_MEDIA", False)

DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FIELDS = 400
DATA_UPLOAD_MAX_NUMBER_FILES = 10
UPLOAD_IMAGE_MAX_BYTES = env_int("UPLOAD_IMAGE_MAX_BYTES", 8 * 1024 * 1024)
UPLOAD_IMAGE_MAX_PIXELS = env_int("UPLOAD_IMAGE_MAX_PIXELS", 40_000_000)
UPLOAD_IMAGE_MIN_SIDE = 300
UPLOAD_IMAGE_MAX_SIDE = 8000
PRODUCT_MEDIA_MAX_PER_PRODUCT = 40

# --- Cache / Redis ---------------------------------------------------------
REDIS_URL = env_str("REDIS_URL", "redis://127.0.0.1:6379/0")
CACHE_REDIS_URL = env_str("CACHE_REDIS_URL", "redis://127.0.0.1:6379/1")
RATELIMIT_REDIS_URL = env_str("RATELIMIT_REDIS_URL", "redis://127.0.0.1:6379/2")
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": CACHE_REDIS_URL,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SOCKET_CONNECT_TIMEOUT": 3,
            "SOCKET_TIMEOUT": 3,
        },
        "KEY_PREFIX": "tp",
    }
}
RATELIMIT_ENABLED = env_bool("RATELIMIT_ENABLED", True)

# --- Celery ----------------------------------------------------------------
CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TASK_IGNORE_RESULT = True
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TASK_ALWAYS_EAGER = env_bool("CELERY_TASK_ALWAYS_EAGER", False)
CELERY_TASK_TIME_LIMIT = 120
CELERY_TASK_SOFT_TIME_LIMIT = 90
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TIMEZONE = "UTC"
CELERY_BEAT_SCHEDULE = {
    "expire-reservations": {
        "task": "apps.orders.tasks.expire_reservations",
        "schedule": timedelta(seconds=60),
    },
    "reconcile-payments": {
        "task": "apps.payments.tasks.reconcile_payments",
        "schedule": timedelta(minutes=3),
    },
    "dispatch-outbox": {
        "task": "apps.core.tasks.dispatch_pending_outbox",
        "schedule": timedelta(seconds=30),
    },
    "cleanup-sessions": {
        "task": "apps.accounts.tasks.cleanup_expired_sessions",
        "schedule": crontab(minute=17, hour="*/6"),
    },
    "cleanup-stale-carts": {
        "task": "apps.carts.tasks.cleanup_stale_guest_carts",
        "schedule": crontab(minute=41, hour=3),
    },
    "cleanup-idempotency": {
        "task": "apps.core.tasks.cleanup_idempotency_records",
        "schedule": crontab(minute=5, hour=4),
    },
}

# --- Email -----------------------------------------------------------------
EMAIL_BACKEND = env_str("EMAIL_BACKEND", "django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST = env_str("EMAIL_HOST", "127.0.0.1")
EMAIL_PORT = env_int("EMAIL_PORT", 2525)
EMAIL_HOST_USER = env_str("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env_str("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", False)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = env_str("DEFAULT_FROM_EMAIL", "TANPOOSH <no-reply@tanpoosh.local>")
STAFF_ALERT_EMAILS = env_list("STAFF_ALERT_EMAILS", [])

# Token lifetimes
PASSWORD_RESET_TIMEOUT = env_int("PASSWORD_RESET_TIMEOUT", 60 * 60)
EMAIL_VERIFICATION_TIMEOUT = env_int("EMAIL_VERIFICATION_TIMEOUT", 60 * 60 * 24 * 3)
GUEST_ORDER_LINK_TIMEOUT = env_int("GUEST_ORDER_LINK_TIMEOUT", 60 * 60 * 24)

# --- MFA -------------------------------------------------------------------
# Fernet key (urlsafe base64, 32 bytes) used to encrypt TOTP secrets at rest.
MFA_ENCRYPTION_KEY = env_str("MFA_ENCRYPTION_KEY")
MFA_ISSUER = "TANPOOSH"
# Development-only convenience. Production settings refuse to start if it is enabled.
MFA_DEV_BYPASS = env_bool("MFA_DEV_BYPASS", False)

# --- Commerce --------------------------------------------------------------
CURRENCY = "IRT"  # toman, integer amounts everywhere in DB/API
RESERVATION_MINUTES = env_int("RESERVATION_MINUTES", 15)
PAYMENT_WINDOW_MINUTES = env_int("PAYMENT_WINDOW_MINUTES", 20)
CART_MAX_LINES = 30
CART_MAX_LINE_QUANTITY = 10
RETURN_WINDOW_DAYS = env_int("RETURN_WINDOW_DAYS", 7)
GUEST_CART_RETENTION_DAYS = 30

# --- Payments --------------------------------------------------------------
# PAYMENT_PROVIDER: "zarinpal" (sandbox or live) or "mock" (development/testing only).
PAYMENT_PROVIDER = env_str("PAYMENT_PROVIDER", "zarinpal")
ZARINPAL_MODE = env_str("ZARINPAL_MODE", "sandbox")  # sandbox | live
ZARINPAL_MERCHANT_ID = env_str("ZARINPAL_MERCHANT_ID")
ZARINPAL_TIMEOUT_SECONDS = env_int("ZARINPAL_TIMEOUT_SECONDS", 10)
PAYMENT_CALLBACK_URL = env_str("PAYMENT_CALLBACK_URL", f"{PUBLIC_BASE_URL}/api/v1/payments/callback")
PAYMENT_RESULT_URL = env_str("PAYMENT_RESULT_URL", f"{PUBLIC_BASE_URL}/payment/result")
PAYMENT_MOCK_ENABLED = env_bool("PAYMENT_MOCK_ENABLED", False)

# --- Studio 3D asset manifest ---------------------------------------------
STUDIO_MANIFEST_PATH = env_str(
    "STUDIO_MANIFEST_PATH", str(BASE_DIR.parent / "frontend" / "public" / "studio-images" / "manifest.json")
)

# --- Bootstrap -------------------------------------------------------------
OWNER_USERNAME = env_str("OWNER_USERNAME", "tanpoosh_admin")
LOCAL_CREDENTIALS_DIR = BASE_DIR / ".local-credentials"

# --- DRF -------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.auth.CsrfEnforcedSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 24,
    "EXCEPTION_HANDLER": "apps.core.errors.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "apps.core.schema.CommandSchema",
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
    "DEFAULT_THROTTLE_CLASSES": [],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "TANPOOSH API",
    "DESCRIPTION": "REST API فروشگاه تن‌پوش. همهٔ مبالغ به تومان (عدد صحیح) هستند.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "ENUM_NAME_OVERRIDES": {},
    "PREPROCESSING_HOOKS": ["apps.core.schema.canonical_endpoints"],
    "POSTPROCESSING_HOOKS": ["drf_spectacular.hooks.postprocess_schema_enums"],
}
API_DOCS_ENABLED = env_bool("API_DOCS_ENABLED", False)

# --- Security headers (also see production.py) ----------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# --- Logging ---------------------------------------------------------------
LOG_LEVEL = env_str("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_id": {"()": "apps.core.logging.RequestIdFilter"},
        "redact": {"()": "apps.core.logging.RedactingFilter"},
    },
    "formatters": {
        "plain": {
            "format": "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "plain",
            "filters": ["request_id", "redact"],
        }
    },
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.db.backends": {"level": "WARNING"},
    },
}
