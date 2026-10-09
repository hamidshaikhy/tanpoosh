"""Run the production safety check with ephemeral safe test configuration."""
import os
from pathlib import Path
import secrets
import subprocess
import sys
from cryptography.fernet import Fernet

backend=Path(__file__).resolve().parents[1]/'backend'
env={**os.environ,'DJANGO_SETTINGS_MODULE':'config.settings.production','DJANGO_SECRET_KEY':secrets.token_urlsafe(64),'DJANGO_ALLOWED_HOSTS':'shop.example.invalid','PUBLIC_BASE_URL':'https://shop.example.invalid','CSRF_TRUSTED_ORIGINS':'https://shop.example.invalid','MFA_ENCRYPTION_KEY':Fernet.generate_key().decode(),'MFA_DEV_BYPASS':'false','PAYMENT_PROVIDER':'zarinpal','PAYMENT_MOCK_ENABLED':'false','ZARINPAL_MODE':'sandbox','PAYMENT_CALLBACK_URL':'https://shop.example.invalid/api/v1/payments/callback','FRONTEND_REVALIDATE_SECRET':secrets.token_urlsafe(32),'EMAIL_BACKEND':'django.core.mail.backends.smtp.EmailBackend'}
sys.exit(subprocess.call([sys.executable,'manage.py','check','--deploy','--fail-level','ERROR'],cwd=backend,env=env))
