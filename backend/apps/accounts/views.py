from __future__ import annotations

from typing import Any

from django.db import transaction
from django.middleware.csrf import get_token
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core import audit
from apps.core.errors import ApiError, Conflict

from . import iran, mfa, services
from .models import Address
from .permissions import IsCustomerAuthenticated, IsStaffMember, require_recent_reauth
from .serializers import (
    AddressSerializer,
    AuthResultSerializer,
    ChangeEmailSerializer,
    ChangePasswordSerializer,
    EmailOnlySerializer,
    LoginSerializer,
    MeSerializer,
    MfaCodeSerializer,
    PasswordResetConfirmSerializer,
    ProfileSerializer,
    ReauthSerializer,
    SessionSerializer,
    SignupSerializer,
    TokenSerializer,
)
from .tokens import decode_uid

OK = inline_serializer("Ok", {"ok": serializers.BooleanField(), "detail": serializers.CharField(required=False)})


class CsrfView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=inline_serializer("CsrfToken", {"csrf_token": serializers.CharField()}))
    def get(self, request: Request) -> Response:
        return Response({"csrf_token": get_token(request._request)})


class MeView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=MeSerializer)
    def get(self, request: Request) -> Response:
        return Response(services.serialize_me(request._request))


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=LoginSerializer, responses=AuthResultSerializer)
    def post(self, request: Request) -> Response:
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = services.login(request._request, data.validated_data["identifier"], data.validated_data["password"])
        return Response(result)


class LogoutView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses=AuthResultSerializer)
    def post(self, request: Request) -> Response:
        return Response(services.logout(request._request))


class SignupView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=SignupSerializer, responses={201: AuthResultSerializer})
    def post(self, request: Request) -> Response:
        if request.user.is_authenticated:
            raise ApiError("already_authenticated", "شما وارد حساب کاربری شده‌اید.")
        data = SignupSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        result = services.register(request._request, **data.validated_data)
        return Response(result, status=status.HTTP_201_CREATED)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=TokenSerializer, responses=OK)
    def post(self, request: Request) -> Response:
        from apps.core import ratelimit
        from apps.core.net import client_ip

        ratelimit.enforce("verify_confirm.ip", client_ip(request._request))
        data = TokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = decode_uid(data.validated_data["uid"])
        services.confirm_email(user, data.validated_data["token"])
        return Response({"ok": True, "detail": "ایمیل شما تأیید شد."})


class ResendVerificationView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=None, responses=OK)
    def post(self, request: Request) -> Response:
        services.resend_verification(request._request)
        return Response({"ok": True, "detail": "اگر ایمیل شما هنوز تأیید نشده باشد، پیوند تأیید ارسال شد."})


class ChangeEmailView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=ChangeEmailSerializer, responses=OK)
    def post(self, request: Request) -> Response:
        data = ChangeEmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.request_email_change(request._request, data.validated_data["password"], data.validated_data["new_email"])
        return Response({"ok": True, "detail": "پیوند تأیید به ایمیل جدید ارسال شد. تا تأیید آن، ایمیل فعلی شما تغییر نمی‌کند."})


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=EmailOnlySerializer, responses=OK)
    def post(self, request: Request) -> Response:
        data = EmailOnlySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.request_password_reset(request._request, data.validated_data["email"])
        return Response({"ok": True, "detail": "اگر حسابی با این ایمیل وجود داشته باشد، پیوند بازیابی رمز برای آن ارسال می‌شود."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=PasswordResetConfirmSerializer, responses=OK)
    def post(self, request: Request) -> Response:
        data = PasswordResetConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = decode_uid(data.validated_data["uid"])
        services.reset_password(request._request, user, data.validated_data["token"], data.validated_data["new_password"])
        return Response({"ok": True, "detail": "رمز عبور تغییر کرد. اکنون می‌توانید وارد شوید."})


class ChangePasswordView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=ChangePasswordSerializer, responses=AuthResultSerializer)
    def post(self, request: Request) -> Response:
        data = ChangePasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.change_password(request._request, data.validated_data["current_password"], data.validated_data["new_password"])
        return Response({**services.serialize_me(request._request), "csrf_token": get_token(request._request)})


class SessionsView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(responses=SessionSerializer(many=True))
    def get(self, request: Request) -> Response:
        return Response(SessionSerializer(services.list_sessions(request._request), many=True).data)


class SessionDetailView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(responses={204: None})
    def delete(self, request: Request, session_id: str) -> Response:
        if not services.revoke_session(request._request, session_id):
            raise ApiError("not_found", status_code=404)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RevokeOtherSessionsView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=None, responses=inline_serializer("RevokeResult", {"revoked": serializers.IntegerField()}))
    def post(self, request: Request) -> Response:
        return Response({"revoked": services.revoke_other_sessions(request._request)})


# --- MFA --------------------------------------------------------------------


class _PasswordAuthenticatedStaff(IsCustomerAuthenticated):
    """Staff user who has passed the password step (MFA may still be pending)."""

    def has_permission(self, request: Any, view: Any) -> bool:
        return super().has_permission(request, view) and request.user.is_staff


class MfaEnrollView(APIView):
    permission_classes = [_PasswordAuthenticatedStaff]

    @extend_schema(
        request=None,
        responses=inline_serializer("MfaEnroll", {"secret": serializers.CharField(), "otpauth_uri": serializers.CharField()}),
    )
    def post(self, request: Request) -> Response:
        try:
            secret, uri = mfa.start_enrollment(request.user)
        except ValueError:
            raise Conflict("mfa_already_enrolled", "تأیید دومرحله‌ای قبلاً فعال شده است.") from None
        audit.record("auth.mfa_enroll_started", request=request, obj=request.user)
        return Response({"secret": secret, "otpauth_uri": uri})


class MfaConfirmView(APIView):
    permission_classes = [_PasswordAuthenticatedStaff]

    @extend_schema(
        request=MfaCodeSerializer,
        responses=inline_serializer("MfaConfirm", {"recovery_codes": serializers.ListField(child=serializers.CharField())}),
    )
    def post(self, request: Request) -> Response:
        from apps.core import ratelimit

        ratelimit.enforce("mfa.user", str(request.user.pk))
        data = MfaCodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        codes = mfa.confirm_enrollment(request.user, data.validated_data.get("code", ""))
        if codes is None:
            raise ApiError("invalid_mfa_code", "کد تأیید نادرست یا منقضی است.")
        services.mark_mfa_verified(request._request)
        audit.record("auth.mfa_enrolled", request=request, obj=request.user)
        return Response({"recovery_codes": codes})


class MfaVerifyView(APIView):
    permission_classes = [_PasswordAuthenticatedStaff]

    @extend_schema(request=MfaCodeSerializer, responses=MeSerializer)
    def post(self, request: Request) -> Response:
        data = MfaCodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not mfa.is_enrolled(request.user):
            raise ApiError("mfa_not_enrolled", "ابتدا تأیید دومرحله‌ای را راه‌اندازی کنید.")
        services.verify_mfa(request._request, data.validated_data.get("code"), data.validated_data.get("recovery_code"))
        return Response({**services.serialize_me(request._request), "csrf_token": get_token(request._request)})


class MfaRecoveryCodesView(APIView):
    permission_classes = [IsStaffMember]

    @extend_schema(
        request=None,
        responses=inline_serializer(
            "MfaRecoveryCodes",
            {
                "recovery_codes": serializers.ListField(child=serializers.CharField(), required=False),
                "remaining": serializers.IntegerField(),
            },
        ),
    )
    def get(self, request: Request) -> Response:
        return Response({"remaining": mfa.remaining_recovery_codes(request.user)})

    @extend_schema(request=None)
    def post(self, request: Request) -> Response:
        require_recent_reauth(request._request)
        codes = mfa.regenerate_recovery_codes(request.user)
        audit.record("auth.mfa_recovery_regenerated", request=request, obj=request.user)
        return Response({"recovery_codes": codes, "remaining": len(codes)})


class ReauthView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(request=ReauthSerializer, responses=OK)
    def post(self, request: Request) -> Response:
        data = ReauthSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.reauthenticate(request._request, data.validated_data["password"], data.validated_data.get("code", ""))
        return Response({"ok": True})


# --- Account profile & addresses -------------------------------------------


class ProfileView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(responses=MeSerializer)
    def get(self, request: Request) -> Response:
        return Response(services.serialize_me(request._request))

    @extend_schema(request=ProfileSerializer, responses=MeSerializer)
    def patch(self, request: Request) -> Response:
        data = ProfileSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        services.update_profile(request.user, data.validated_data)
        return Response(services.serialize_me(request._request))


MAX_ADDRESSES = 20


class AddressListView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    @extend_schema(responses=AddressSerializer(many=True))
    def get(self, request: Request) -> Response:
        rows = Address.objects.filter(user=request.user)
        return Response(AddressSerializer(rows, many=True).data)

    @extend_schema(request=AddressSerializer, responses={201: AddressSerializer})
    def post(self, request: Request) -> Response:
        data = AddressSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            existing = Address.objects.select_for_update().filter(user=request.user)
            count = existing.count()
            if count >= MAX_ADDRESSES:
                raise ApiError("too_many_addresses", "حداکثر ۲۰ نشانی می‌توانید ذخیره کنید.")
            make_default = data.validated_data.get("is_default") or count == 0
            if make_default:
                existing.filter(is_default=True).update(is_default=False)
            address = data.save(user=request.user, is_default=make_default)
        return Response(AddressSerializer(address).data, status=status.HTTP_201_CREATED)


class AddressDetailView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    def _get(self, request: Request, address_id: str) -> Address:
        # Ownership is part of the lookup: another user's address is indistinguishable from missing.
        address = Address.objects.filter(pk=address_id, user=request.user).first()
        if address is None:
            raise ApiError("not_found", status_code=404)
        return address

    @extend_schema(responses=AddressSerializer)
    def get(self, request: Request, address_id: str) -> Response:
        return Response(AddressSerializer(self._get(request, address_id)).data)

    @extend_schema(request=AddressSerializer, responses=AddressSerializer)
    def patch(self, request: Request, address_id: str) -> Response:
        address = self._get(request, address_id)
        data = AddressSerializer(address, data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            if data.validated_data.get("is_default"):
                Address.objects.select_for_update().filter(user=request.user, is_default=True).exclude(pk=address.pk).update(
                    is_default=False
                )
            address = data.save()
        return Response(AddressSerializer(address).data)

    @extend_schema(responses={204: None})
    def delete(self, request: Request, address_id: str) -> Response:
        address = self._get(request, address_id)
        with transaction.atomic():
            was_default = address.is_default
            address.delete()
            if was_default:
                nxt = Address.objects.filter(user=request.user).order_by("-updated_at").first()
                if nxt:
                    nxt.is_default = True
                    nxt.save(update_fields=["is_default"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProvincesView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            "Province",
            {"name": serializers.CharField(), "cities": serializers.ListField(child=serializers.CharField())},
            many=True,
        )
    )
    def get(self, request: Request) -> Response:
        return Response(iran.as_list())
