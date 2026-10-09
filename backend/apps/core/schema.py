"""Schema for command-style APIViews and the CSRF-enforced cookie authenticator.

Existing per-method extend_schema annotations take precedence. Command payloads that
do not use a DRF serializer are deliberately represented as extensible JSON objects;
this does not pretend the generated types replace runtime business validation.
"""

import re

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.types import OpenApiTypes


class CookieAuthentication(OpenApiAuthenticationExtension):
    target_class = "apps.core.auth.CsrfEnforcedSessionAuthentication"
    name = "cookieSession"

    def get_security_definition(self, auto_schema):
        from django.conf import settings

        return {
            "type": "apiKey",
            "in": "cookie",
            "name": settings.SESSION_COOKIE_NAME,
            "description": "Server session. Unsafe requests also require X-CSRFToken from /auth/csrf.",
        }


class CommandSchema(AutoSchema):
    def _get_serializer(self):
        view = self.view
        if any(hasattr(view, attr) for attr in ("serializer_class", "get_serializer", "get_serializer_class")):
            return super()._get_serializer()
        return OpenApiTypes.OBJECT

    def get_operation_id(self):
        # Unique and stable even for list/detail endpoints that share a view verb.
        return re.sub(r"[^a-zA-Z0-9]+", "_", self.path.removeprefix("/api/v1/")).strip("_") + "_" + self.method.lower()


def canonical_endpoints(endpoints):
    # /cart/ and /orders/ are compatibility aliases of slashless endpoints.
    return [e for e in endpoints if not e[0].endswith("/")]
