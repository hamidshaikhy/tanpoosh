from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import mfa
from apps.accounts.models import Role, User, UserSession
from apps.accounts.permissions import require_recent_reauth, role_has_permission, role_permissions
from apps.accounts.tokens import encode_uid, password_reset_tokens
from apps.catalog.models import Category, Product, Variant
from apps.content.models import InfoPage, StoreSettings
from apps.content.services import page_payload, validate_blocks
from apps.core import audit
from apps.core.errors import ApiError, Conflict
from apps.core.jalali import TEHRAN
from apps.core.models import AuditEvent
from apps.core.normalize import is_valid_username, normalize_coupon_code, normalize_email, normalize_username
from apps.core.outbox import enqueue
from apps.core.revalidate import request_revalidation
from apps.core.text import PlainTextField, safe_external_url, safe_internal_path
from apps.orders.models import FulfillmentStatus as F_
from apps.orders.models import Order, OrderItem, ReturnRequest, ShippingMethod
from apps.orders.models import PaymentStatus as P
from apps.payments.models import PaymentAttempt, Refund
from apps.promotions.models import Coupon, CouponRedemption
from apps.reviews.models import Review
from apps.support.models import SupportMessage, SupportReply

from .base import ManageView

CAPTURED = [P.VERIFIED, P.REFUND_PENDING, P.PARTIALLY_REFUNDED, P.REFUNDED, P.NEEDS_REVIEW]
PERIODS = {"today": 1, "7d": 7, "30d": 30, "90d": 90}


# --- dashboard -------------------------------------------------------------------


class DashboardView(ManageView):
    permission_map = {"GET": "dashboard.view"}

    def get(self, request: Request) -> Response:
        period = request.query_params.get("period", "30d")
        days = PERIODS.get(period, 30)
        mode = request.query_params.get("mode", "live")
        if mode not in ("live", "test", "all"):
            mode = "live"
        today = timezone.now().astimezone(TEHRAN).date()
        start_day = today - timedelta(days=days - 1)
        start = datetime.combine(start_day, time.min, tzinfo=TEHRAN)

        def scoped(qs: Any) -> Any:
            if mode == "live":
                return qs.filter(is_test=False)
            if mode == "test":
                return qs.filter(is_test=True)
            return qs

        out: dict[str, Any] = {"period": period, "mode": mode, "start": start, "days": days}
        paid = scoped(Order.objects.filter(paid_at__gte=start, payment_status__in=CAPTURED))
        if role_has_permission(request.user.role, "reports.view"):
            agg = paid.aggregate(gross=Sum("total_toman"), count=Count("id"))
            refunded = (
                scoped(Refund.objects.filter(status=Refund.Status.COMPLETED, completed_at__gte=start)).aggregate(
                    total=Sum("amount_toman")
                )["total"]
                or 0
            )
            gross = agg["gross"] or 0
            series_rows = {
                row["day"]: row
                for row in paid.annotate(day=TruncDate("paid_at", tzinfo=TEHRAN))
                .values("day")
                .annotate(gross=Sum("total_toman"), orders=Count("id"))
            }
            series = []
            for i in range(days):
                day = start_day + timedelta(days=i)
                row = series_rows.get(day)
                series.append(
                    {"date": day.isoformat(), "gross": (row or {}).get("gross") or 0, "orders": (row or {}).get("orders") or 0}
                )
            top = (
                OrderItem.objects.filter(order__in=paid)
                .values("product_name")
                .annotate(quantity=Sum("quantity"), revenue=Sum("line_total_toman"))
                .order_by("-quantity")[:5]
            )
            out["revenue"] = {
                "gross_toman": gross,
                "refunds_toman": refunded,
                "net_toman": gross - refunded,
                "orders": agg["count"] or 0,
                "average_order_toman": (gross // agg["count"]) if agg["count"] else 0,
                "series": series,
                "top_products": list(top),
            }
        low_stock = Variant.objects.filter(
            is_active=True,
            product__status=Product.Status.PUBLISHED,
            stock__on_hand__lte=F("stock__reserved") + F("stock__low_stock_threshold"),
        ).count()
        stale = timezone.now() - timedelta(minutes=30)
        out["operations"] = {
            "to_fulfill": scoped(
                Order.objects.filter(payment_status=P.VERIFIED, fulfillment_status__in=[F_.PROCESSING, F_.PACKED])
            ).count(),
            "needs_review": scoped(Order.objects.filter(payment_status=P.NEEDS_REVIEW)).count(),
            "refunds_pending": scoped(
                Refund.objects.filter(status__in=[Refund.Status.REQUESTED, Refund.Status.APPROVED, Refund.Status.PROCESSING])
            ).count(),
            "returns_open": ReturnRequest.objects.filter(
                status__in=[ReturnRequest.Status.REQUESTED, ReturnRequest.Status.APPROVED]
            ).count(),
            "returns_in_period": ReturnRequest.objects.filter(created_at__gte=start).count(),
            "unresolved_payments": PaymentAttempt.objects.filter(
                status__in=["created", "redirected", "verifying", "unknown"], created_at__lt=stale
            ).count(),
            "low_stock": low_stock,
            "support_open": SupportMessage.objects.exclude(status=SupportMessage.Status.CLOSED).count(),
            "reviews_pending": Review.objects.filter(status=Review.Status.PENDING).count(),
        }
        if role_has_permission(request.user.role, "orders.view"):
            recent = scoped(Order.objects.prefetch_related("items")).order_by("-placed_at")[:6]
            out["recent_orders"] = [
                {
                    "id": str(o.pk),
                    "number": o.number,
                    "placed_at": o.placed_at,
                    "contact_name": o.contact_name,
                    "total_toman": o.total_toman,
                    "payment_status": o.payment_status,
                    "payment_status_label": P(o.payment_status).label,
                    "fulfillment_status_label": F_(o.fulfillment_status).label,
                    "is_test": o.is_test,
                }
                for o in recent
            ]
        return Response(out)


# --- coupons ---------------------------------------------------------------------


class CouponSerializer(serializers.Serializer):
    version = serializers.IntegerField(required=False)
    code = serializers.CharField(max_length=32)
    description = PlainTextField(max_length=200, required=False)
    kind = serializers.ChoiceField(choices=Coupon.Kind.choices)
    value = serializers.IntegerField(min_value=1, max_value=50_000_000)
    max_discount_toman = serializers.IntegerField(min_value=1000, max_value=100_000_000, required=False, allow_null=True)
    min_subtotal_toman = serializers.IntegerField(min_value=0, max_value=100_000_000, required=False, default=0)
    starts_at = serializers.DateTimeField(required=False, allow_null=True)
    ends_at = serializers.DateTimeField(required=False, allow_null=True)
    usage_limit = serializers.IntegerField(min_value=1, max_value=1_000_000, required=False, allow_null=True)
    per_customer_limit = serializers.IntegerField(min_value=1, max_value=100, required=False, default=1)
    product_ids = serializers.ListField(child=serializers.IntegerField(), max_length=200, required=False, default=list)
    category_ids = serializers.ListField(child=serializers.IntegerField(), max_length=50, required=False, default=list)
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_code(self, value: str) -> str:
        code = normalize_coupon_code(value)
        import re

        if not re.fullmatch(r"[A-Z0-9_-]{3,32}", code):
            raise serializers.ValidationError("کد فقط حروف انگلیسی بزرگ، عدد، خط تیره یا زیرخط (۳ تا ۳۲ نویسه).")
        return code

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["kind"] == Coupon.Kind.PERCENT and not 1 <= attrs["value"] <= 90:
            raise serializers.ValidationError({"value": ["درصد تخفیف باید بین ۱ و ۹۰ باشد."]})
        if attrs["kind"] == Coupon.Kind.FIXED and not 1000 <= attrs["value"] <= 50_000_000:
            raise serializers.ValidationError({"value": ["مبلغ تخفیف باید بین ۱٬۰۰۰ و ۵۰٬۰۰۰٬۰۰۰ تومان باشد."]})
        if attrs.get("starts_at") and attrs.get("ends_at") and attrs["ends_at"] <= attrs["starts_at"]:
            raise serializers.ValidationError({"ends_at": ["پایان باید بعد از شروع باشد."]})
        return attrs


def coupon_row(c: Coupon) -> dict[str, Any]:
    used = c.redemptions.filter(status=CouponRedemption.Status.CONSUMED).count()
    reserved = c.redemptions.filter(status=CouponRedemption.Status.RESERVED).count()
    return {
        "id": c.pk,
        "code": c.code,
        "description": c.description,
        "kind": c.kind,
        "value": c.value,
        "max_discount_toman": c.max_discount_toman,
        "min_subtotal_toman": c.min_subtotal_toman,
        "starts_at": c.starts_at,
        "ends_at": c.ends_at,
        "usage_limit": c.usage_limit,
        "per_customer_limit": c.per_customer_limit,
        "product_ids": list(c.products.values_list("id", flat=True)),
        "category_ids": list(c.categories.values_list("id", flat=True)),
        "is_active": c.is_active,
        "used": used,
        "reserved": reserved,
        "version": c.version,
    }


def _save_coupon(coupon: Coupon, data: dict[str, Any]) -> Coupon:
    for key in (
        "code",
        "description",
        "kind",
        "value",
        "max_discount_toman",
        "min_subtotal_toman",
        "starts_at",
        "ends_at",
        "usage_limit",
        "per_customer_limit",
        "is_active",
    ):
        if key in data:
            setattr(coupon, key, data[key])
    coupon.version = (coupon.version or 0) + 1
    try:
        with transaction.atomic():
            coupon.save()
    except IntegrityError:
        raise ApiError("validation_error", fields={"code": ["این کد قبلاً تعریف شده است."]}) from None
    coupon.products.set(Product.objects.filter(pk__in=data.get("product_ids", [])))
    coupon.categories.set(Category.objects.filter(pk__in=data.get("category_ids", [])))
    return coupon


class CouponListCreateView(ManageView):
    permission_map = {"GET": "coupons.manage", "POST": "coupons.manage"}

    def get(self, request: Request) -> Response:
        return self.paginate(Coupon.objects.order_by("-created_at"), coupon_row)

    def post(self, request: Request) -> Response:
        data = CouponSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        coupon = _save_coupon(Coupon(created_by=request.user, version=0), data.validated_data)
        audit.record("coupon.create", request=request, obj=coupon)
        return Response(coupon_row(coupon), status=status.HTTP_201_CREATED)


class CouponDetailView(ManageView):
    permission_map = {"GET": "coupons.manage", "PATCH": "coupons.manage"}

    def get(self, request: Request, coupon_id: int) -> Response:
        coupon = Coupon.objects.filter(pk=coupon_id).first()
        if coupon is None:
            raise ApiError("not_found", status_code=404)
        return Response(coupon_row(coupon))

    def patch(self, request: Request, coupon_id: int) -> Response:
        data = CouponSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            coupon = Coupon.objects.select_for_update().filter(pk=coupon_id).first()
            if coupon is None:
                raise ApiError("not_found", status_code=404)
            if data.validated_data.get("version") != coupon.version:
                raise Conflict("stale_version", "این کد تخفیف در همین فاصله تغییر کرده است. صفحه را تازه کنید.")
            if coupon.redemptions.exists() and data.validated_data["code"] != coupon.code:
                raise Conflict("code_locked", "کد تخفیفی که استفاده شده قابل تغییر نام نیست.")
            coupon = _save_coupon(coupon, data.validated_data)
        audit.record("coupon.update", request=request, obj=coupon, metadata={"is_active": coupon.is_active})
        return Response(coupon_row(coupon))


# --- shipping ---------------------------------------------------------------------


class ShippingSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    name = PlainTextField(max_length=60, allow_blank=False)
    description = PlainTextField(max_length=200, required=False)
    eta_text = PlainTextField(max_length=60, required=False)
    fee_toman = serializers.IntegerField(min_value=0, max_value=10_000_000)
    free_threshold_toman = serializers.IntegerField(min_value=0, max_value=100_000_000, required=False, allow_null=True)
    is_active = serializers.BooleanField()


def shipping_row(m: ShippingMethod) -> dict[str, Any]:
    return {
        "id": m.pk,
        "code": m.code,
        "name": m.name,
        "description": m.description,
        "eta_text": m.eta_text,
        "fee_toman": m.fee_toman,
        "free_threshold_toman": m.free_threshold_toman,
        "is_active": m.is_active,
        "version": m.version,
    }


class ShippingListView(ManageView):
    permission_map = {"GET": "shipping.manage"}

    def get(self, request: Request) -> Response:
        return Response([shipping_row(m) for m in ShippingMethod.objects.order_by("sort_order", "id")])


class ShippingDetailView(ManageView):
    permission_map = {"PATCH": "shipping.manage"}

    def patch(self, request: Request, method_id: int) -> Response:
        data = ShippingSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            method = ShippingMethod.objects.select_for_update().filter(pk=method_id).first()
            if method is None:
                raise ApiError("not_found", status_code=404)
            if data.validated_data["version"] != method.version:
                raise Conflict("stale_version", "این روش ارسال در همین فاصله تغییر کرده است.")
            if (
                not data.validated_data["is_active"]
                and not ShippingMethod.objects.filter(is_active=True).exclude(pk=method.pk).exists()
            ):
                raise Conflict("last_shipping_method", "حداقل یک روش ارسال باید فعال بماند.")
            for key in ("name", "description", "eta_text", "fee_toman", "free_threshold_toman", "is_active"):
                if key in data.validated_data:
                    setattr(method, key, data.validated_data[key])
            method.version += 1
            method.save()
        request_revalidation("content")
        audit.record(
            "shipping.update",
            request=request,
            obj=method,
            metadata={"fee": method.fee_toman, "free_threshold": method.free_threshold_toman},
        )
        return Response(shipping_row(method))


# --- customers ----------------------------------------------------------------------


def customer_row(u: User) -> dict[str, Any]:
    return {
        "id": str(u.pk),
        "username": u.username,
        "email": u.email,
        "name": u.full_name,
        "phone": u.phone,
        "is_active": u.is_active,
        "email_verified": u.email_verified,
        "date_joined": u.date_joined,
        "orders_count": getattr(u, "orders_count", 0),
        "last_login": u.last_login,
    }


class CustomerListView(ManageView):
    permission_map = {"GET": "customers.view"}

    def get(self, request: Request) -> Response:
        qs = (
            User.objects.filter(role=Role.CUSTOMER)
            .annotate(orders_count=Count("orders", filter=Q(orders__payment_status__in=CAPTURED), distinct=True))
            .order_by("-date_joined")
        )
        q = str(request.query_params.get("q", "")).strip()[:60]
        if q:
            qs = qs.filter(
                Q(username__icontains=q)
                | Q(email__icontains=q.lower())
                | Q(first_name__icontains=q)
                | Q(last_name__icontains=q)
                | Q(phone__icontains=q)
            )
        return self.paginate(qs, customer_row)


class CustomerDetailView(ManageView):
    permission_map = {"GET": "customers.view", "POST": "customers.manage"}

    def _get(self, customer_id: str) -> User:
        user = User.objects.filter(pk=customer_id, role=Role.CUSTOMER).first()
        if user is None:
            raise ApiError("not_found", status_code=404)
        return user

    def get(self, request: Request, customer_id: str) -> Response:
        user = self._get(customer_id)
        orders = Order.objects.filter(user=user).order_by("-placed_at")[:20]
        captured = (
            Order.objects.filter(user=user, payment_status__in=CAPTURED, is_test=False).aggregate(t=Sum("total_toman"))["t"] or 0
        )
        return Response(
            {
                **customer_row(user),
                "live_spent_toman": captured,
                "orders": [
                    {
                        "id": str(o.pk),
                        "number": o.number,
                        "placed_at": o.placed_at,
                        "total_toman": o.total_toman,
                        "payment_status_label": P(o.payment_status).label,
                        "fulfillment_status_label": F_(o.fulfillment_status).label,
                        "is_test": o.is_test,
                    }
                    for o in orders
                ],
                "support_messages": SupportMessage.objects.filter(user=user).count(),
            }
        )

    def post(self, request: Request, customer_id: str) -> Response:
        require_recent_reauth(request._request)
        user = self._get(customer_id)
        active = request.data.get("is_active")
        if not isinstance(active, bool):
            raise ApiError("validation_error", fields={"is_active": ["وضعیت را مشخص کنید."]})
        user.is_active = active
        user.save(update_fields=["is_active"])
        if not active:
            UserSession.objects.filter(user=user).delete()
        audit.record("customer.activate" if active else "customer.deactivate", request=request, obj=user)
        return Response(customer_row(user))


# --- staff (owner only) ---------------------------------------------------------------


def staff_row(u: User) -> dict[str, Any]:
    return {
        "id": str(u.pk),
        "username": u.username,
        "email": u.email,
        "name": u.full_name,
        "role": u.role,
        "role_label": Role(u.role).label,
        "is_active": u.is_active,
        "mfa_enrolled": mfa.is_enrolled(u),
        "last_login": u.last_login,
        "date_joined": u.date_joined,
        "permissions": sorted(role_permissions(u.role)),
    }


STAFF_ROLE_VALUES = [Role.OWNER, Role.CATALOG_MANAGER, Role.ORDER_MANAGER, Role.FINANCE]


class StaffCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=40)
    email = serializers.EmailField(max_length=254)
    first_name = PlainTextField(max_length=60, allow_blank=False)
    last_name = PlainTextField(max_length=60, required=False)
    role = serializers.ChoiceField(choices=[(r.value, r.label) for r in STAFF_ROLE_VALUES])


def _active_owner_count(exclude: Any = None) -> int:
    qs = User.objects.filter(role=Role.OWNER, is_active=True)
    if exclude is not None:
        qs = qs.exclude(pk=exclude)
    return qs.count()


class StaffListCreateView(ManageView):
    permission_map = {"GET": "staff.manage", "POST": "staff.manage"}

    def get(self, request: Request) -> Response:
        rows = User.objects.exclude(role=Role.CUSTOMER).order_by("role", "username")
        return Response([staff_row(u) for u in rows])

    def post(self, request: Request) -> Response:
        require_recent_reauth(request._request)
        data = StaffCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        username = normalize_username(data.validated_data["username"])
        email = normalize_email(data.validated_data["email"])
        if not is_valid_username(username):
            raise ApiError("validation_error", fields={"username": ["نام کاربری معتبر نیست."]})
        if User.objects.filter(Q(username=username) | Q(email=email)).exists():
            raise ApiError("validation_error", fields={"username": ["این نام کاربری یا ایمیل قبلاً استفاده شده است."]})
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                email=email,
                password=None,  # unusable until the invitee sets one via the emailed link
                first_name=data.validated_data["first_name"],
                last_name=data.validated_data.get("last_name", ""),
                role=data.validated_data["role"],
                created_by=request.user,
            )
            user.email_verified_at = None
            user.save()
            token = password_reset_tokens.make_token(user)
            enqueue(
                "email",
                {
                    "template": "staff_invite",
                    "to": user.email,
                    "context": {
                        "name": user.first_name,
                        "role": Role(user.role).label,
                        "username": user.username,
                        "link": f"{settings.PUBLIC_BASE_URL}/reset-password#uid={encode_uid(user)}&token={token}",
                    },
                },
                dedupe_key=f"staff-invite:{user.pk}",
            )
            audit.record("staff.create", request=request, obj=user, metadata={"role": user.role})
        return Response(staff_row(user), status=status.HTTP_201_CREATED)


class StaffUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)


class StaffDetailView(ManageView):
    permission_map = {"PATCH": "staff.manage", "POST": "staff.manage"}

    def _get(self, user_id: str) -> User:
        user = User.objects.filter(pk=user_id).first()
        if user is None:
            raise ApiError("not_found", status_code=404)
        return user

    def patch(self, request: Request, user_id: str) -> Response:
        require_recent_reauth(request._request)
        data = StaffUpdateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            # Serialize owner changes so two owners cannot demote each other concurrently.
            list(User.objects.select_for_update().filter(role=Role.OWNER))
            user = User.objects.select_for_update().filter(pk=user_id).first()
            if user is None:
                raise ApiError("not_found", status_code=404)
            new_role = data.validated_data.get("role", user.role)
            new_active = data.validated_data.get("is_active", user.is_active)
            if user.pk == request.user.pk and (new_role != user.role or not new_active):
                raise Conflict("self_change", "نقش یا وضعیت حساب خودتان را از این بخش نمی‌توانید تغییر دهید.")
            losing_owner = user.role == Role.OWNER and user.is_active and (new_role != Role.OWNER or not new_active)
            if losing_owner and _active_owner_count(exclude=user.pk) == 0:
                raise Conflict("last_owner", "آخرین مالک فعال فروشگاه را نمی‌توان حذف یا تنزل داد.")
            old_role = user.role
            user.role = new_role
            user.is_active = new_active
            user.save(update_fields=["role", "is_active"])
            if old_role != new_role or not new_active:
                UserSession.objects.filter(user=user).delete()  # force re-login with new privileges
            audit.record(
                "staff.update", request=request, obj=user, metadata={"from": old_role, "to": new_role, "active": new_active}
            )
        return Response(staff_row(user))

    def post(self, request: Request, user_id: str) -> Response:
        """Actions: reset-mfa | revoke-sessions (passed as ?action=)."""
        require_recent_reauth(request._request)
        action = request.query_params.get("action")
        user = self._get(user_id)
        if action == "reset-mfa":
            if user.pk == request.user.pk:
                raise Conflict("self_change", "برای بازنشانی تأیید دومرحله‌ای خودتان از مالک دیگر یا فرمان مدیریتی استفاده کنید.")
            mfa.disable(user)
            UserSession.objects.filter(user=user).delete()
            audit.record("staff.mfa_reset", request=request, obj=user)
        elif action == "revoke-sessions":
            UserSession.objects.filter(user=user).exclude(session_key=request._request.session.session_key).delete()
            audit.record("staff.sessions_revoked", request=request, obj=user)
        else:
            raise ApiError("validation_error", fields={"action": ["عملیات معتبر نیست."]})
        return Response(staff_row(user))


# --- content ---------------------------------------------------------------------------


class SettingsSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    hero_title = PlainTextField(max_length=60, allow_blank=False)
    hero_subtitle = PlainTextField(max_length=120, required=False)
    hero_primary_label = PlainTextField(max_length=30, allow_blank=False)
    hero_primary_href = serializers.CharField(max_length=200)
    hero_secondary_label = PlainTextField(max_length=30, allow_blank=False)
    hero_secondary_href = serializers.CharField(max_length=200)
    picks_title = PlainTextField(max_length=60, allow_blank=False)
    picks_subtitle = PlainTextField(max_length=120, required=False)
    featured_products = serializers.ListField(child=serializers.IntegerField(), max_length=8)
    featured_collection_id = serializers.IntegerField(required=False, allow_null=True)
    studio_title = PlainTextField(max_length=60, allow_blank=False)
    studio_subtitle = PlainTextField(max_length=160, required=False)
    announcement_enabled = serializers.BooleanField()
    announcement_text = PlainTextField(max_length=120, required=False)
    footer_about = PlainTextField(max_length=300, required=False)
    contact_email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    contact_phone = serializers.RegexField(r"^[0-9۰-۹+\- ]{0,20}$", required=False, allow_blank=True)
    contact_hours = PlainTextField(max_length=120, required=False)
    contact_address = PlainTextField(max_length=300, required=False)
    instagram_url = serializers.CharField(max_length=200, required=False, allow_blank=True)
    telegram_url = serializers.CharField(max_length=200, required=False, allow_blank=True)
    seo_title = PlainTextField(max_length=70, allow_blank=False)
    seo_description = PlainTextField(max_length=160, allow_blank=False)

    def validate_hero_primary_href(self, v: str) -> str:
        return safe_internal_path(v) or "/shop"

    def validate_hero_secondary_href(self, v: str) -> str:
        return safe_internal_path(v) or "/studio"

    def validate_instagram_url(self, v: str) -> str:
        return safe_external_url(v)

    def validate_telegram_url(self, v: str) -> str:
        return safe_external_url(v)

    def validate_featured_products(self, ids: list[int]) -> list[int]:
        found = set(Product.objects.filter(pk__in=ids, status=Product.Status.PUBLISHED).values_list("id", flat=True))
        if set(ids) - found:
            raise serializers.ValidationError("فقط محصولات منتشرشده را می‌توان انتخاب کرد.")
        return list(dict.fromkeys(ids))


SETTINGS_FIELDS = [
    "hero_title",
    "hero_subtitle",
    "hero_primary_label",
    "hero_primary_href",
    "hero_secondary_label",
    "hero_secondary_href",
    "picks_title",
    "picks_subtitle",
    "featured_products",
    "studio_title",
    "studio_subtitle",
    "announcement_enabled",
    "announcement_text",
    "footer_about",
    "contact_email",
    "contact_phone",
    "contact_hours",
    "contact_address",
    "instagram_url",
    "telegram_url",
    "seo_title",
    "seo_description",
]


def settings_payload(s: StoreSettings) -> dict[str, Any]:
    return {
        **{f: getattr(s, f) for f in SETTINGS_FIELDS},
        "featured_collection_id": s.featured_collection_id,
        "version": s.version,
    }


class ContentSettingsView(ManageView):
    permission_map = {"GET": "content.manage", "PATCH": "content.manage"}

    def get(self, request: Request) -> Response:
        return Response(settings_payload(StoreSettings.load()))

    def patch(self, request: Request) -> Response:
        data = SettingsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            StoreSettings.load()
            s = StoreSettings.objects.select_for_update().get(pk=1)
            if data.validated_data["version"] != s.version:
                raise Conflict("stale_version", "تنظیمات در همین فاصله تغییر کرده است. صفحه را تازه کنید.")
            for field in SETTINGS_FIELDS:
                if field in data.validated_data:
                    setattr(s, field, data.validated_data[field])
            s.featured_collection_id = data.validated_data.get("featured_collection_id")
            s.version += 1
            s.updated_by = request.user
            s.save()
        request_revalidation("content", "catalog")
        audit.record("content.settings_update", request=request, object_type="store_settings", object_id="1")
        return Response(settings_payload(s))


class PageEditSerializer(serializers.Serializer):
    version = serializers.IntegerField()
    title = PlainTextField(max_length=80, allow_blank=False)
    summary = PlainTextField(max_length=200, required=False)
    blocks = serializers.JSONField()
    is_published = serializers.BooleanField()

    def validate_blocks(self, value: Any) -> list[dict[str, Any]]:
        return validate_blocks(value)


class ContentPagesView(ManageView):
    permission_map = {"GET": "content.manage"}

    def get(self, request: Request) -> Response:
        return Response(
            [
                {
                    "slug": p.slug,
                    "title": p.title,
                    "is_published": p.is_published,
                    "is_seed_content": p.is_seed_content,
                    "updated_at": p.updated_at,
                    "version": p.version,
                }
                for p in InfoPage.objects.order_by("slug")
            ]
        )


class ContentPageDetailView(ManageView):
    permission_map = {"GET": "content.manage", "PATCH": "content.manage"}

    def get(self, request: Request, slug: str) -> Response:
        page = InfoPage.objects.filter(slug=slug).first()
        if page is None:
            raise ApiError("not_found", status_code=404)
        return Response({**page_payload(page), "is_published": page.is_published, "version": page.version})

    def patch(self, request: Request, slug: str) -> Response:
        data = PageEditSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            page = InfoPage.objects.select_for_update().filter(slug=slug).first()
            if page is None:
                raise ApiError("not_found", status_code=404)
            if data.validated_data["version"] != page.version:
                raise Conflict("stale_version", "این صفحه در همین فاصله تغییر کرده است.")
            page.title = data.validated_data["title"]
            page.summary = data.validated_data.get("summary", "")
            page.blocks = data.validated_data["blocks"]
            page.is_published = data.validated_data["is_published"]
            page.is_seed_content = False
            page.version += 1
            page.updated_by = request.user
            page.save()
        request_revalidation("content", f"page:{slug}")
        audit.record("content.page_update", request=request, obj=page)
        return Response({**page_payload(page), "is_published": page.is_published, "version": page.version})


# --- reviews ---------------------------------------------------------------------------


def review_row(r: Review) -> dict[str, Any]:
    return {
        "id": r.pk,
        "product_name": r.product.name,
        "product_slug": r.product.slug,
        "author": r.user.username,
        "rating": r.rating,
        "title": r.title,
        "body": r.body,
        "status": r.status,
        "status_label": r.get_status_display(),
        "verified_purchase": r.order_item_id is not None,
        "moderation_note": r.moderation_note,
        "created_at": r.created_at,
    }


class ReviewListView(ManageView):
    permission_map = {"GET": "reviews.moderate"}

    def get(self, request: Request) -> Response:
        qs = Review.objects.select_related("product", "user").order_by("-created_at")
        if request.query_params.get("status") in Review.Status.values:
            qs = qs.filter(status=request.query_params["status"])
        return self.paginate(qs, review_row)


class ReviewModerateView(ManageView):
    permission_map = {"POST": "reviews.moderate"}

    def post(self, request: Request, review_id: int) -> Response:
        new_status = request.data.get("status")
        if new_status not in (Review.Status.APPROVED, Review.Status.REJECTED):
            raise ApiError("validation_error", fields={"status": ["وضعیت معتبر نیست."]})
        review = Review.objects.select_related("product", "user").filter(pk=review_id).first()
        if review is None:
            raise ApiError("not_found", status_code=404)
        review.status = new_status
        review.moderation_note = PlainTextField(max_length=300).run_validation(request.data.get("note", ""))
        review.moderated_by = request.user
        review.moderated_at = timezone.now()
        review.save()
        request_revalidation("catalog", f"product:{review.product.slug}")
        audit.record("review.moderate", request=request, obj=review.product, metadata={"review": review.pk, "status": new_status})
        return Response(review_row(review))


# --- support ---------------------------------------------------------------------------


def support_row(m: SupportMessage, *, full: bool = False) -> dict[str, Any]:
    row = {
        "id": str(m.pk),
        "name": m.name,
        "email": m.email,
        "topic": m.topic,
        "topic_label": m.get_topic_display(),
        "subject": m.subject,
        "order_number": m.order_number,
        "status": m.status,
        "status_label": m.get_status_display(),
        "is_customer": m.user_id is not None,
        "created_at": m.created_at,
    }
    if full:
        row.update(
            {
                "body": m.body,
                "staff_note": m.staff_note,
                "replies": [
                    {"body": r.body, "author": r.author_label, "created_at": r.created_at, "emailed": r.emailed}
                    for r in m.replies.all()
                ],
            }
        )
    return row


class SupportListView(ManageView):
    permission_map = {"GET": "support.manage"}

    def get(self, request: Request) -> Response:
        qs = SupportMessage.objects.order_by("-created_at")
        if request.query_params.get("status") in SupportMessage.Status.values:
            qs = qs.filter(status=request.query_params["status"])
        q = str(request.query_params.get("q", "")).strip()[:60]
        if q:
            qs = qs.filter(Q(subject__icontains=q) | Q(email__icontains=q.lower()) | Q(order_number__icontains=q))
        return self.paginate(qs, support_row)


class SupportDetailView(ManageView):
    permission_map = {"GET": "support.manage", "PATCH": "support.manage", "POST": "support.manage"}

    def _get(self, message_id: str) -> SupportMessage:
        m = SupportMessage.objects.prefetch_related("replies").filter(pk=message_id).first()
        if m is None:
            raise ApiError("not_found", status_code=404)
        return m

    def get(self, request: Request, message_id: str) -> Response:
        return Response(support_row(self._get(message_id), full=True))

    def patch(self, request: Request, message_id: str) -> Response:
        m = self._get(message_id)
        if "status" in request.data:
            if request.data["status"] not in SupportMessage.Status.values:
                raise ApiError("validation_error", fields={"status": ["وضعیت معتبر نیست."]})
            m.status = request.data["status"]
        if "staff_note" in request.data:
            m.staff_note = PlainTextField(max_length=2000, multiline=True).run_validation(request.data["staff_note"])
        m.save()
        return Response(support_row(self._get(message_id), full=True))

    def post(self, request: Request, message_id: str) -> Response:
        m = self._get(message_id)
        body = PlainTextField(max_length=3000, multiline=True, allow_blank=False).run_validation(request.data.get("body", ""))
        reply = SupportReply.objects.create(
            message=m, author=request.user, author_label=request.user.username, body=body, emailed=True
        )
        if m.status == SupportMessage.Status.OPEN:
            m.status = SupportMessage.Status.IN_PROGRESS
            m.save(update_fields=["status", "updated_at"])
        enqueue(
            "email",
            {"template": "support_reply", "to": m.email, "context": {"name": m.name, "subject": m.subject, "body": body}},
            dedupe_key=f"support-reply:{reply.pk}",
        )
        audit.record("support.reply", request=request, object_type="support_message", object_id=str(m.pk))
        return Response(support_row(self._get(message_id), full=True), status=status.HTTP_201_CREATED)


# --- audit -------------------------------------------------------------------------------


class AuditListView(ManageView):
    permission_map = {"GET": "audit.view"}

    def get(self, request: Request) -> Response:
        qs = AuditEvent.objects.order_by("-created_at", "-id")
        action = str(request.query_params.get("action", "")).strip()[:80]
        if action:
            qs = qs.filter(action__startswith=action)
        actor = str(request.query_params.get("actor", "")).strip()[:40]
        if actor:
            qs = qs.filter(actor_label__iexact=actor)
        if request.query_params.get("result") in AuditEvent.Result.values:
            qs = qs.filter(result=request.query_params["result"])
        return self.paginate(
            qs,
            lambda e: {
                "id": e.pk,
                "created_at": e.created_at,
                "actor": e.actor_label,
                "action": e.action,
                "object_type": e.object_type,
                "object_id": e.object_id,
                "object_label": e.object_label,
                "result": e.result,
                "ip_prefix": e.ip_prefix,
                "request_id": e.request_id,
                "metadata": e.metadata,
            },
        )
