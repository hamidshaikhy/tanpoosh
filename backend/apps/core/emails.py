"""Templated Persian (RTL) emails. Called from outbox handlers only (never inline in requests)."""

from __future__ import annotations

from typing import Any

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

ALLOWED_TEMPLATES = {
    "verify_email",
    "password_reset",
    "password_changed",
    "email_change_verify",
    "order_paid",
    "order_shipped",
    "order_cancelled",
    "guest_order_link",
    "return_update",
    "refund_completed",
    "support_received",
    "support_reply",
    "staff_invite",
}


def send_templated_email(template: str, to: str | list[str], context: dict[str, Any]) -> None:
    if template not in ALLOWED_TEMPLATES:
        raise ValueError(f"Unknown email template {template}")
    recipients = [to] if isinstance(to, str) else list(to)
    ctx = {"brand": "تن‌پوش", "base_url": settings.PUBLIC_BASE_URL, **context}
    subject = render_to_string(f"emails/{template}.subject.txt", ctx).strip().replace("\n", " ")
    text_body = render_to_string(f"emails/{template}.txt", ctx)
    html_body = render_to_string(f"emails/{template}.html", ctx)
    message = EmailMultiAlternatives(subject, text_body, settings.DEFAULT_FROM_EMAIL, recipients)
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


def send_staff_alert(subject: str, message: str) -> None:
    from apps.accounts.models import Role, User

    recipients = set(settings.STAFF_ALERT_EMAILS)
    recipients.update(User.objects.filter(role=Role.OWNER, is_active=True).values_list("email", flat=True))
    if not recipients:
        return
    mail = EmailMultiAlternatives(f"[تن‌پوش — هشدار] {subject}", message, settings.DEFAULT_FROM_EMAIL, sorted(recipients))
    mail.send(fail_silently=False)
