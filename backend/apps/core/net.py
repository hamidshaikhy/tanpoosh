"""Client IP extraction that only trusts X-Forwarded-For from configured proxies."""

from __future__ import annotations

import hashlib
import ipaddress
from typing import Any

from django.conf import settings


def client_ip(request: Any) -> str:
    remote = request.META.get("REMOTE_ADDR", "") or ""
    trusted = int(getattr(settings, "TRUSTED_PROXY_COUNT", 0) or 0)
    if trusted > 0:
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        # The right-most `trusted` entries were appended by our proxies; the one before them
        # is the address our outermost proxy actually saw.
        if len(parts) >= trusted:
            candidate = parts[-trusted]
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                pass
    return remote


def ip_prefix(ip: str) -> str:
    """Privacy-reduced IP for display (/24 for IPv4, /48 for IPv6)."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ""
    if addr.version == 4:
        return str(ipaddress.ip_network(f"{ip}/24", strict=False).network_address) + "/24"
    return str(ipaddress.ip_network(f"{ip}/48", strict=False).network_address) + "/48"


def ip_hash(ip: str) -> str:
    return hashlib.sha256(f"{settings.SECRET_KEY}:{ip}".encode()).hexdigest()[:32]
