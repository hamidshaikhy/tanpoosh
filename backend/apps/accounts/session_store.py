"""DB-backed session engine that records the owning user, IP prefix and user agent."""

from __future__ import annotations

import contextlib
from typing import Any

from django.contrib.sessions.backends.db import SessionStore as DBStore


class SessionStore(DBStore):
    @classmethod
    def get_model_class(cls):  # type: ignore[no-untyped-def]
        from .models import UserSession

        return UserSession

    def create_model_instance(self, data: dict[str, Any]):  # type: ignore[no-untyped-def]
        obj = super().create_model_instance(data)
        user_id = data.get("_auth_user_id")
        obj.user_id = user_id or None
        obj.ip_prefix = str(data.get("_ip_prefix", ""))[:64]
        obj.user_agent = str(data.get("_ua", ""))[:200]
        meta = data.get("_created_at")
        if meta:
            from datetime import datetime

            with contextlib.suppress(ValueError):
                obj.created_at = datetime.fromisoformat(meta)
        last_seen = data.get("_last_seen")
        if last_seen:
            from datetime import datetime

            with contextlib.suppress(ValueError):
                obj.last_seen_at = datetime.fromisoformat(last_seen)
        return obj
