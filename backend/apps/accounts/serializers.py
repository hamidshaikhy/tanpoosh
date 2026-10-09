from __future__ import annotations

from typing import Any

from django.conf import settings
from rest_framework import serializers

from apps.core.normalize import normalize_mobile, normalize_postal_code
from apps.core.text import PlainTextField

from .iran import is_valid_city, is_valid_province
from .models import Address

PASSWORD_FIELD_KW = {"max_length": 1024, "trim_whitespace": False, "write_only": True}


class LoginSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    password = serializers.CharField(**PASSWORD_FIELD_KW)


class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=40)
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(**PASSWORD_FIELD_KW)
    first_name = PlainTextField(max_length=60, allow_blank=False)
    last_name = PlainTextField(max_length=60, allow_blank=False)


class EmailOnlySerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class TokenSerializer(serializers.Serializer):
    uid = serializers.CharField(max_length=80)
    token = serializers.CharField(max_length=100)


class PasswordResetConfirmSerializer(TokenSerializer):
    new_password = serializers.CharField(**PASSWORD_FIELD_KW)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(**PASSWORD_FIELD_KW)
    new_password = serializers.CharField(**PASSWORD_FIELD_KW)


class ChangeEmailSerializer(serializers.Serializer):
    password = serializers.CharField(**PASSWORD_FIELD_KW)
    new_email = serializers.EmailField(max_length=254)


class ProfileSerializer(serializers.Serializer):
    first_name = PlainTextField(max_length=60, required=False)
    last_name = PlainTextField(max_length=60, required=False)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class MfaCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=12, required=False, allow_blank=True)
    recovery_code = serializers.CharField(max_length=40, required=False, allow_blank=True)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("code") and not attrs.get("recovery_code"):
            raise serializers.ValidationError({"code": ["کد تأیید را وارد کنید."]})
        return attrs


class ReauthSerializer(serializers.Serializer):
    password = serializers.CharField(**PASSWORD_FIELD_KW)
    code = serializers.CharField(max_length=12, required=False, allow_blank=True)


class MeUserSerializer(serializers.Serializer):
    id = serializers.CharField()
    username = serializers.CharField()
    email = serializers.EmailField()
    email_verified = serializers.BooleanField()
    pending_email = serializers.CharField()
    first_name = serializers.CharField()
    last_name = serializers.CharField()
    phone = serializers.CharField()
    role = serializers.CharField()
    role_label = serializers.CharField()
    is_staff = serializers.BooleanField()
    permissions = serializers.ListField(child=serializers.CharField())
    mfa = serializers.DictField()


class MeSerializer(serializers.Serializer):
    authenticated = serializers.BooleanField()
    user = MeUserSerializer(allow_null=True)


class AuthResultSerializer(MeSerializer):
    csrf_token = serializers.CharField()
    merge_notices = serializers.ListField(child=serializers.DictField(), required=False)


class SessionSerializer(serializers.Serializer):
    id = serializers.CharField()
    current = serializers.BooleanField()
    created_at = serializers.DateTimeField()
    last_seen_at = serializers.DateTimeField(allow_null=True)
    ip_prefix = serializers.CharField()
    user_agent = serializers.CharField()


class AddressSerializer(serializers.ModelSerializer):
    title = PlainTextField(max_length=40, required=False)
    recipient_name = PlainTextField(max_length=120, allow_blank=False)
    line = PlainTextField(max_length=300, allow_blank=False)
    plaque = PlainTextField(max_length=20, required=False)
    unit = PlainTextField(max_length=20, required=False)
    phone = serializers.CharField(max_length=20)
    postal_code = serializers.CharField(max_length=20)

    class Meta:
        model = Address
        fields = [
            "id",
            "title",
            "recipient_name",
            "phone",
            "province",
            "city",
            "postal_code",
            "line",
            "plaque",
            "unit",
            "is_default",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_phone(self, value: str) -> str:
        phone = normalize_mobile(value)
        if not phone:
            raise serializers.ValidationError("شمارهٔ موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹).")
        return phone

    def validate_postal_code(self, value: str) -> str:
        code = normalize_postal_code(value)
        if not code:
            raise serializers.ValidationError("کد پستی باید ۱۰ رقم باشد.")
        return code

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        province = attrs.get("province", getattr(self.instance, "province", None))
        city = attrs.get("city", getattr(self.instance, "city", None))
        if province is not None and not is_valid_province(province):
            raise serializers.ValidationError({"province": ["استان را از فهرست انتخاب کنید."]})
        if city is not None and province is not None and not is_valid_city(province, city):
            raise serializers.ValidationError({"city": ["شهر را از فهرست استان انتخاب کنید."]})
        return attrs


def password_max() -> int:
    return settings.PASSWORD_MAX_LENGTH
