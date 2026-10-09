"""Signup/login/logout/reset/verify, CSRF on anonymous endpoints, sessions, rate limits, MFA."""

from __future__ import annotations

import re

import pyotp
import pytest
from rest_framework.test import APIClient

from apps.accounts import mfa
from apps.accounts.models import Role, User, UserSession
from apps.accounts.tokens import email_verification_tokens, encode_uid, password_reset_tokens

from .conftest import flush_outbox, login, make_user, staff_client

pytestmark = pytest.mark.django_db
PW = "Sufficiently-Long-Pass-91"


def test_signup_normalizes_and_ignores_privileged_fields(client: APIClient) -> None:
    r = client.post(
        "/api/v1/auth/signup",
        {
            "username": " Reza.K ",
            "email": "Reza@Example.COM",
            "password": PW,
            "first_name": "رضا",
            "last_name": "کریمی",
            "role": "owner",
            "is_staff": True,
            "email_verified": True,
        },
        format="json",
    )
    assert r.status_code == 201, r.content
    user = User.objects.get(username="reza.k")
    assert user.email == "reza@example.com"
    assert user.role == Role.CUSTOMER and not user.is_staff and not user.email_verified
    assert r.json()["authenticated"] is True


def test_signup_rejects_duplicates_and_weak_passwords(client: APIClient) -> None:
    make_user(username="taken")
    r = client.post(
        "/api/v1/auth/signup",
        {"username": "taken", "email": "n@example.com", "password": PW, "first_name": "a", "last_name": "b"},
        format="json",
    )
    assert r.status_code == 400 and "username" in r.json()["error"]["fields"]
    r = client.post(
        "/api/v1/auth/signup",
        {"username": "fresh", "email": "n@example.com", "password": "12345678", "first_name": "a", "last_name": "b"},
        format="json",
    )
    assert r.status_code == 400 and "password" in r.json()["error"]["fields"]
    r = client.post(
        "/api/v1/auth/signup",
        {"username": "fresh", "email": "n@example.com", "password": "x" * 300, "first_name": "a", "last_name": "b"},
        format="json",
    )
    assert r.status_code == 400  # explicit error, never silent truncation


def test_login_with_username_or_email_and_generic_errors(client: APIClient) -> None:
    user = make_user()
    assert client.post("/api/v1/auth/login", {"identifier": user.email.upper(), "password": PW}, format="json").status_code == 200
    c2 = APIClient()
    r1 = c2.post("/api/v1/auth/login", {"identifier": user.username, "password": "wrong-pass-123"}, format="json")
    r2 = c2.post("/api/v1/auth/login", {"identifier": "nobody", "password": "wrong-pass-123"}, format="json")
    assert r1.status_code == r2.status_code == 400
    assert r1.json()["error"]["message"] == r2.json()["error"]["message"]


def test_csrf_enforced_on_anonymous_login_and_logout() -> None:
    user = make_user()
    c = APIClient(enforce_csrf_checks=True)
    r = c.post("/api/v1/auth/login", {"identifier": user.username, "password": PW}, format="json")
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    token = c.get("/api/v1/auth/csrf").json()["csrf_token"]
    r = c.post("/api/v1/auth/login", {"identifier": user.username, "password": PW}, format="json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200
    new_token = r.json()["csrf_token"]
    assert c.post("/api/v1/auth/logout").status_code == 403
    assert c.post("/api/v1/auth/logout", HTTP_X_CSRFTOKEN=new_token).status_code == 200
    # cart mutation as anonymous also requires CSRF
    assert c.post("/api/v1/cart/items", {"variant_id": 1, "quantity": 1}, format="json").status_code == 403


def test_login_rate_limit_is_temporary_and_per_account(client: APIClient) -> None:
    user = make_user()
    for _ in range(8):
        client.post("/api/v1/auth/login", {"identifier": user.username, "password": "bad-password-x"}, format="json")
    r = client.post("/api/v1/auth/login", {"identifier": user.username, "password": PW}, format="json")
    assert r.status_code == 429 and r.json()["error"]["code"] == "rate_limited" and "Retry-After" in r
    other = make_user()
    assert client.post("/api/v1/auth/login", {"identifier": other.username, "password": PW}, format="json").status_code == 200


def test_password_reset_single_use_and_no_enumeration(client: APIClient, mailoutbox: list) -> None:
    user = make_user()
    other_session = APIClient()
    login(other_session, user)  # (a login AFTER the request would itself invalidate the token)
    a = client.post("/api/v1/auth/password/forgot", {"email": user.email}, format="json").json()
    b = client.post("/api/v1/auth/password/forgot", {"email": "ghost@example.com"}, format="json").json()
    assert a == b
    flush_outbox()
    assert len(mailoutbox) == 1
    body = mailoutbox[0].body
    uid, token = re.search(r"#uid=([^&\s]+)&token=([^\s]+)", body).groups()
    r = client.post(
        "/api/v1/auth/password/reset", {"uid": uid, "token": token, "new_password": "Another-Strong-Pass-77"}, format="json"
    )
    assert r.status_code == 200
    assert not UserSession.objects.filter(user=user).exists()  # all sessions revoked
    assert other_session.get("/api/v1/auth/me").json()["authenticated"] is False
    r = client.post(
        "/api/v1/auth/password/reset", {"uid": uid, "token": token, "new_password": "Third-Strong-Pass-55"}, format="json"
    )
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_token"


def test_expired_reset_token(client: APIClient, settings) -> None:  # type: ignore[no-untyped-def]
    user = make_user()
    token = password_reset_tokens._make(user, 1)  # issued in 1970
    r = client.post(
        "/api/v1/auth/password/reset",
        {"uid": encode_uid(user), "token": token, "new_password": "Another-Strong-Pass-77"},
        format="json",
    )
    assert r.status_code == 400


def test_email_verification_and_change(client: APIClient) -> None:
    user = make_user()
    token = email_verification_tokens.make_token(user)
    assert client.post("/api/v1/auth/email/verify", {"uid": encode_uid(user), "token": token}, format="json").status_code == 200
    assert client.post("/api/v1/auth/email/verify", {"uid": encode_uid(user), "token": token}, format="json").status_code == 400
    login(client, user)
    r = client.post("/api/v1/auth/email/change", {"password": PW, "new_email": "new@example.com"}, format="json")
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.email != "new@example.com" and user.pending_email == "new@example.com"
    token = email_verification_tokens.make_token(user)
    client.post("/api/v1/auth/email/verify", {"uid": encode_uid(user), "token": token}, format="json")
    user.refresh_from_db()
    assert user.email == "new@example.com" and user.email_verified


def test_change_password_revokes_other_sessions(client: APIClient) -> None:
    user = make_user()
    login(client, user)
    other = APIClient()
    login(other, user)
    r = client.post(
        "/api/v1/auth/password/change", {"current_password": PW, "new_password": "Brand-New-Pass-4455"}, format="json"
    )
    assert r.status_code == 200
    assert client.get("/api/v1/auth/me").json()["authenticated"] is True
    assert other.get("/api/v1/auth/me").json()["authenticated"] is False


def test_profile_cannot_escalate(client: APIClient) -> None:
    user = make_user()
    login(client, user)
    r = client.patch(
        "/api/v1/account/profile", {"first_name": "علی", "role": "owner", "is_active": False, "email": "x@y.z"}, format="json"
    )
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.role == Role.CUSTOMER and user.is_active and user.email.startswith("user")


def test_mfa_pending_session_cannot_use_management_api() -> None:
    c, user = staff_client(Role.OWNER, enrol_mfa=False)
    for path in ("/api/v1/manage/dashboard", "/api/v1/manage/orders", "/api/v1/manage/staff"):
        r = c.get(path)
        assert r.status_code == 403 and r.json()["error"]["code"] == "mfa_required"
    # enrolled but not verified in this session
    secret, _ = mfa.start_enrollment(user)
    mfa.confirm_enrollment(user, pyotp.TOTP(secret).now())
    c2 = APIClient()
    login(c2, user)
    assert c2.get("/api/v1/manage/dashboard").status_code == 403
    r = c2.post("/api/v1/auth/mfa/verify", {"code": "000000"}, format="json")
    assert r.status_code == 400
    recovery = mfa.regenerate_recovery_codes(user)
    assert c2.post("/api/v1/auth/mfa/verify", {"recovery_code": recovery[0]}, format="json").status_code == 200
    assert c2.get("/api/v1/manage/dashboard").status_code == 200
    c3 = APIClient()
    login(c3, user)
    assert c3.post("/api/v1/auth/mfa/verify", {"recovery_code": recovery[0]}, format="json").status_code == 400  # single use


def test_customer_cannot_enrol_mfa_or_reach_manage(client: APIClient) -> None:
    user = make_user()
    login(client, user)
    assert client.post("/api/v1/auth/mfa/enroll").status_code == 403
    assert client.get("/api/v1/manage/dashboard").status_code == 403
    assert APIClient().get("/api/v1/manage/dashboard").status_code == 401


def test_sessions_list_and_revoke(client: APIClient) -> None:
    user = make_user()
    login(client, user)
    other = APIClient()
    login(other, user)
    sessions = client.get("/api/v1/auth/sessions").json()
    assert len(sessions) == 2 and sum(s["current"] for s in sessions) == 1
    target = next(s for s in sessions if not s["current"])
    assert client.delete(f"/api/v1/auth/sessions/{target['id']}").status_code == 204
    assert other.get("/api/v1/auth/me").json()["authenticated"] is False
    # cannot revoke another user's session by id guessing
    intruder = APIClient()
    login(intruder, make_user())
    mine = client.get("/api/v1/auth/sessions").json()[0]["id"]
    assert intruder.delete(f"/api/v1/auth/sessions/{mine}").status_code == 404


def test_local_staff_password_login_without_mfa(settings):
    settings.MFA_DEV_BYPASS = True
    settings.IS_PRODUCTION = False
    c, _ = staff_client(Role.OWNER, enrol_mfa=False)
    me = c.get("/api/v1/auth/me").json()
    assert me["user"]["mfa"]["verified"] is True
    assert me["user"]["mfa"]["enrolled"] is False
    assert c.get("/api/v1/manage/dashboard").status_code == 200
    customer = APIClient()
    login(customer, make_user())
    assert customer.get("/api/v1/manage/dashboard").status_code == 403


def test_production_ignores_staff_mfa_bypass(settings):
    settings.MFA_DEV_BYPASS = True
    settings.IS_PRODUCTION = True
    c, _ = staff_client(Role.OWNER, enrol_mfa=False)
    assert c.get("/api/v1/manage/dashboard").status_code == 403
