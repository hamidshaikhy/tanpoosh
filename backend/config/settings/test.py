"""Test settings: real PostgreSQL + Redis (row locks and constraints matter), fast hashing."""

from cryptography.fernet import Fernet

from .base import *  # noqa: F403

DJANGO_ENV = "test"
IS_PRODUCTION = False
DEBUG = False
SECRET_KEY = SECRET_KEY or "test-only-secret-key-not-used-anywhere-else-0123456789abcdef"  # noqa: F405
MFA_ENCRYPTION_KEY = Fernet.generate_key().decode()  # per-test-run key
FRONTEND_REVALIDATE_SECRET = "test-revalidate-secret-0123456789abcdef"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

PAYMENT_PROVIDER = "mock"
PAYMENT_MOCK_ENABLED = True
ZARINPAL_MERCHANT_ID = "00000000-0000-0000-0000-000000000000"
MFA_DEV_BYPASS = False

CACHES = {  # noqa: F405
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://127.0.0.1:6379/9",
        "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
        "KEY_PREFIX": "tptest",
    }
}
RATELIMIT_REDIS_URL = "redis://127.0.0.1:6379/10"
MEDIA_ROOT = str(BASE_DIR / ".test-media")  # noqa: F405
FRONTEND_INTERNAL_URL = ""  # disables revalidation webhooks during tests
LOGGING["root"]["level"] = "WARNING"  # noqa: F405
