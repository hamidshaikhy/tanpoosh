from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsCustomerAuthenticated
from apps.core import ratelimit
from apps.core.net import client_ip, ip_hash
from apps.core.normalize import normalize_email
from apps.core.outbox import enqueue
from apps.core.text import PlainTextField

from .models import SupportMessage


class SupportCreateSerializer(serializers.Serializer):
    name = PlainTextField(max_length=120, allow_blank=False)
    email = serializers.EmailField(max_length=254)
    topic = serializers.ChoiceField(choices=SupportMessage.Topic.choices)
    subject = PlainTextField(max_length=120, allow_blank=False)
    body = PlainTextField(max_length=3000, multiline=True, allow_blank=False)
    order_number = serializers.RegexField(r"^[A-Za-z0-9\-]{0,20}$", required=False, allow_blank=True)


def message_payload(m: SupportMessage) -> dict:
    return {
        "id": str(m.pk),
        "topic": m.topic,
        "topic_label": m.get_topic_display(),
        "subject": m.subject,
        "body": m.body,
        "order_number": m.order_number,
        "status": m.status,
        "status_label": m.get_status_display(),
        "created_at": m.created_at,
        "replies": [{"body": r.body, "author": "پشتیبانی تن‌پوش", "created_at": r.created_at} for r in m.replies.all()],
    }


class SupportMessageView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=SupportCreateSerializer, responses={201: None})
    def post(self, request: Request) -> Response:
        ip = client_ip(request._request)
        ratelimit.enforce("support.ip", ip)
        data = SupportCreateSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = request.user if request.user.is_authenticated else None
        message = SupportMessage.objects.create(
            user=user,
            name=data.validated_data["name"],
            email=normalize_email(user.email if user else data.validated_data["email"]),
            topic=data.validated_data["topic"],
            subject=data.validated_data["subject"],
            body=data.validated_data["body"],
            order_number=(data.validated_data.get("order_number") or "").upper(),
            ip_hash=ip_hash(ip),
        )
        enqueue(
            "email",
            {"template": "support_received", "to": message.email, "context": {"name": message.name, "subject": message.subject}},
            dedupe_key=f"support-received:{message.pk}",
        )
        return Response(
            {"ok": True, "id": str(message.pk), "detail": "پیام شما ثبت شد. پاسخ از طریق ایمیل و حساب کاربری اطلاع داده می‌شود."},
            status=status.HTTP_201_CREATED,
        )

    def get(self, request: Request) -> Response:
        if not request.user.is_authenticated:
            from rest_framework.exceptions import NotAuthenticated

            raise NotAuthenticated()
        rows = SupportMessage.objects.filter(user=request.user).prefetch_related("replies")[:50]
        return Response([message_payload(m) for m in rows])


class SupportOwnListView(APIView):
    permission_classes = [IsCustomerAuthenticated]

    def get(self, request: Request) -> Response:
        rows = SupportMessage.objects.filter(user=request.user).prefetch_related("replies")[:50]
        return Response([message_payload(m) for m in rows])
