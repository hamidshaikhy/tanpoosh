"""Local development. Insecure localhost conveniences are confined to this module."""

from .base import *  # noqa: F403
from .base import env_bool

DJANGO_ENV = "development"
IS_PRODUCTION = False
DEBUG = env_bool("DJANGO_DEBUG", True)
# Local demo staff sign in with their password only.
MFA_DEV_BYPASS = env_bool("MFA_DEV_BYPASS", True)

# Media is served by Django only in development (production uses object storage / proxy).
SERVE_MEDIA = True
API_DOCS_ENABLED = env_bool("API_DOCS_ENABLED", True)

if not SECRET_KEY:  # noqa: F405
    raise RuntimeError("DJANGO_SECRET_KEY is empty. Run `python manage.py init_local_env` or copy .env.example to .env.")
