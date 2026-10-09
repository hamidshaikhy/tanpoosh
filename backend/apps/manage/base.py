from __future__ import annotations

import csv
import io
from collections.abc import Iterable
from typing import Any

from django.http import HttpResponse
from rest_framework.views import APIView

from apps.accounts.permissions import HasStaffPermission
from apps.core.pagination import ManagePagination


class ManageView(APIView):
    """Base for all /api/v1/manage endpoints: authenticated active staff + completed MFA +
    explicit per-method permission (`permission_map`). Unmapped methods are denied."""

    permission_classes = [HasStaffPermission]
    permission_map: dict[str, str] = {}

    def paginate(self, qs: Any, serialize: Any) -> Any:
        paginator = ManagePagination()
        page = paginator.paginate_queryset(qs, self.request, view=self)
        return paginator.get_paginated_response([serialize(o) for o in page or []])


_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r", "＝", "＋", "－", "＠")


def csv_safe(value: Any) -> str:
    """Neutralize spreadsheet formula injection (CSV/Excel): prefix risky leading characters."""
    text = "" if value is None else str(value)
    if text.startswith(_FORMULA_PREFIXES) or text.lstrip().startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text


def csv_response(filename: str, header: list[str], rows: Iterable[Iterable[Any]]) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([csv_safe(h) for h in header])
    for row in rows:
        writer.writerow([csv_safe(v) for v in row])
    response = HttpResponse("﻿" + buffer.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Cache-Control"] = "no-store"
    return response
