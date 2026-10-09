"""Ask the Next.js server to invalidate public catalog/content caches by tag."""

from __future__ import annotations

import logging

import httpx
from django.conf import settings

logger = logging.getLogger("tanpoosh.revalidate")


def revalidate_frontend(tags: list[str]) -> None:
    base = settings.FRONTEND_INTERNAL_URL
    if not base or not tags:
        return
    response = httpx.post(
        f"{base}/internal/revalidate",
        json={"tags": sorted(set(tags))[:50]},
        headers={"X-Revalidate-Secret": settings.FRONTEND_REVALIDATE_SECRET},
        timeout=5.0,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Revalidation failed with HTTP {response.status_code}")


def request_revalidation(*tags: str) -> None:
    """Queue (transactionally) a revalidation; dedupe per tag set within the same second."""
    from django.utils import timezone

    from .outbox import enqueue

    if not settings.FRONTEND_INTERNAL_URL:
        return
    key = "revalidate:" + ",".join(sorted(set(tags))) + ":" + timezone.now().strftime("%Y%m%d%H%M%S%f")
    enqueue("revalidate", {"tags": list(tags)}, dedupe_key=key)
