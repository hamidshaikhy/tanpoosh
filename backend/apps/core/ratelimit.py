"""Atomic, cross-worker rate limiting backed by Redis.

Fixed windows implemented with a single Lua script (INCR + PEXPIRE) so concurrent workers
cannot race past the limit. Identifiers are hashed so raw emails/usernames never land in Redis.
If Redis is unavailable, protected endpoints fail closed with HTTP 503.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from functools import lru_cache

import redis
from django.conf import settings
from rest_framework import exceptions

from .errors import ServiceUnavailable

logger = logging.getLogger("tanpoosh.ratelimit")

_LUA_HIT = """
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
"""


@dataclass(frozen=True)
class Rate:
    limit: int
    window_seconds: int


# Central policy table (documented in SECURITY_REPORT.md).
RATES: dict[str, Rate] = {
    "login.ip": Rate(30, 15 * 60),
    "login.account": Rate(8, 15 * 60),
    "signup.ip": Rate(10, 60 * 60),
    "password_reset.ip": Rate(10, 60 * 60),
    "password_reset.email": Rate(3, 60 * 60),
    "password_reset_confirm.ip": Rate(20, 60 * 60),
    "verify_resend.user": Rate(3, 60 * 60),
    "verify_confirm.ip": Rate(30, 60 * 60),
    "mfa.user": Rate(8, 15 * 60),
    "reauth.user": Rate(8, 15 * 60),
    "support.ip": Rate(5, 60 * 60),
    "coupon.session": Rate(20, 10 * 60),
    "order_create.actor": Rate(15, 10 * 60),
    "payment_start.order": Rate(10, 10 * 60),
    "guest_order_lookup.ip": Rate(5, 60 * 60),
    "review.user": Rate(10, 60 * 60),
    "return.user": Rate(10, 60 * 60),
    "upload.user": Rate(120, 60 * 60),
    "export.user": Rate(10, 60 * 60),
    "email_change.user": Rate(5, 60 * 60),
    "share_look.ip": Rate(60, 60 * 60),
}


@lru_cache(maxsize=1)
def _client() -> redis.Redis:
    return redis.Redis.from_url(settings.RATELIMIT_REDIS_URL, socket_connect_timeout=2, socket_timeout=2)


def _key(scope: str, identifier: str) -> str:
    digest = hashlib.sha256(f"{scope}:{identifier}".encode()).hexdigest()[:40]
    return f"rl:{scope}:{digest}"


@dataclass(frozen=True)
class RateResult:
    allowed: bool
    count: int
    retry_after: int


def hit(scope: str, identifier: str, *, count: bool = True) -> RateResult:
    rate = RATES[scope]
    if not settings.RATELIMIT_ENABLED:
        return RateResult(True, 0, 0)
    try:
        client = _client()
        if count:
            current, ttl_ms = client.eval(_LUA_HIT, 1, _key(scope, identifier), rate.window_seconds * 1000)
        else:
            raw = client.get(_key(scope, identifier))
            current = int(raw or 0)
            ttl_ms = client.pttl(_key(scope, identifier))
    except redis.RedisError as exc:
        logger.error("Rate limiter unavailable for scope %s: %s", scope, exc.__class__.__name__)
        raise ServiceUnavailable() from exc
    current = int(current)
    retry_after = max(1, int(ttl_ms) // 1000) if ttl_ms and int(ttl_ms) > 0 else rate.window_seconds
    allowed = current <= rate.limit if count else current < rate.limit
    return RateResult(allowed, current, retry_after)


def enforce(scope: str, identifier: str) -> None:
    result = hit(scope, identifier)
    if not result.allowed:
        raise exceptions.Throttled(wait=result.retry_after)


def is_blocked(scope: str, identifier: str) -> RateResult:
    """Check without incrementing (used before evaluating credentials)."""
    return hit(scope, identifier, count=False)


def reset(scope: str, identifier: str) -> None:
    try:
        _client().delete(_key(scope, identifier))
    except redis.RedisError:  # pragma: no cover - best effort
        logger.warning("Could not reset rate limit for scope %s", scope)


def ping() -> bool:
    try:
        return bool(_client().ping())
    except redis.RedisError:
        return False
