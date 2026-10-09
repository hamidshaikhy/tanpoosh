from __future__ import annotations

import uuid
from typing import Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.password_validation import validate_password
from django.contrib.sessions.base_session import AbstractBaseSession
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower
from django.utils import timezone

from apps.core.normalize import normalize_email, normalize_username


class Role(models.TextChoices):
    CUSTOMER = "customer", "مشتری"
    OWNER = "owner", "مالک فروشگاه"
    CATALOG_MANAGER = "catalog_manager", "مدیر کاتالوگ"
    ORDER_MANAGER = "order_manager", "مدیر سفارش‌ها"
    FINANCE = "finance", "امور مالی"


STAFF_ROLES = {Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER, Role.FINANCE}


class UserManager(BaseUserManager["User"]):
    use_in_migrations = True

    def create_user(self, username: str, email: str, password: str | None = None, **extra: Any) -> User:
        if not username or not email:
            raise ValueError("username and email are required")
        user = self.model(
            username=normalize_username(username),
            email=normalize_email(email),
            **extra,
        )
        if password:
            validate_password(password, user)
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.full_clean(exclude=["password"])
        user.save(using=self._db)
        return user

    def get_by_natural_key(self, username: str | None) -> User:
        return self.get(username=normalize_username(username or ""))


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField("نام کاربری", max_length=32, unique=True)
    email = models.EmailField("ایمیل", max_length=254, unique=True)
    first_name = models.CharField("نام", max_length=60, blank=True)
    last_name = models.CharField("نام خانوادگی", max_length=60, blank=True)
    phone = models.CharField("موبایل", max_length=11, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True)
    is_active = models.BooleanField(default=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    pending_email = models.EmailField(max_length=254, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    objects = UserManager()

    USERNAME_FIELD = "username"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["email"]

    class Meta:
        ordering = ["-date_joined"]
        constraints = [
            models.UniqueConstraint(Lower("email"), name="uniq_user_email_ci"),
            models.CheckConstraint(
                condition=Q(username__regex=r"^[a-z0-9][a-z0-9._]{1,30}[a-z0-9]$"),
                name="user_username_format",
            ),
            models.CheckConstraint(condition=Q(email=Lower("email")), name="user_email_lowercase"),
        ]

    def __str__(self) -> str:
        return self.username

    @property
    def is_staff(self) -> bool:
        return self.role in STAFF_ROLES

    @property
    def is_owner(self) -> bool:
        return self.role == Role.OWNER

    @property
    def is_superuser(self) -> bool:  # no superuser concept; permissions are role-based
        return False

    @property
    def email_verified(self) -> bool:
        return self.email_verified_at is not None

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def has_perm(self, perm: str, obj: Any = None) -> bool:
        from .permissions import role_has_permission

        return self.is_active and role_has_permission(self.role, perm)

    def has_module_perms(self, app_label: str) -> bool:
        return False


class MFADevice(models.Model):
    """TOTP authenticator (RFC 6238 via pyotp). Secret is Fernet-encrypted at rest."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="mfa_device")
    secret_encrypted = models.TextField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"MFADevice: {self.pk}"

    @property
    def confirmed(self) -> bool:
        return self.confirmed_at is not None


class MFARecoveryCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mfa_recovery_codes")
    code_hash = models.CharField(max_length=64)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "code_hash"], name="uniq_recovery_code")]

    def __str__(self) -> str:
        return f"MFARecoveryCode: {self.pk}"


class UserSession(AbstractBaseSession):
    """Server-side session row with an indexed owner so sessions can be listed and revoked."""

    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.CASCADE, related_name="sessions")
    created_at = models.DateTimeField(default=timezone.now)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    ip_prefix = models.CharField(max_length=64, blank=True)
    user_agent = models.CharField(max_length=200, blank=True)

    class Meta(AbstractBaseSession.Meta):
        db_table = "accounts_user_session"

    @classmethod
    def get_session_store_class(cls):  # type: ignore[no-untyped-def]
        from .session_store import SessionStore

        return SessionStore


class Address(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="addresses")
    title = models.CharField(max_length=40, blank=True)
    recipient_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=11)
    province = models.CharField(max_length=40)
    city = models.CharField(max_length=60)
    postal_code = models.CharField(max_length=10)
    line = models.CharField(max_length=300)
    plaque = models.CharField(max_length=20, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "-updated_at"]
        constraints = [
            models.UniqueConstraint(fields=["user"], condition=Q(is_default=True), name="one_default_address_per_user"),
            models.CheckConstraint(condition=Q(phone__regex=r"^09\d{9}$"), name="address_phone_format"),
            models.CheckConstraint(condition=Q(postal_code__regex=r"^\d{10}$"), name="address_postal_format"),
        ]

    def __str__(self) -> str:
        return f"{self.recipient_name} — {self.city}"
