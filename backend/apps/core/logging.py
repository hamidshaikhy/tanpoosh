"""Logging filters: request-id injection and redaction of secrets / PII-like tokens."""

from __future__ import annotations

import logging
import re
from contextvars import ContextVar

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_REDACTIONS = [
    (
        re.compile(
            r"(password|passwd|secret|token|authorization|cookie|merchant_id|otp|code)(\"?\s*[:=]\s*\"?)([^\s\",&]+)", re.I
        ),
        r"\1\2[REDACTED]",
    ),
    (re.compile(r"\b\d{16}\b"), "[REDACTED-PAN]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[REDACTED-EMAIL]"),
    (re.compile(r"\b09\d{9}\b"), "[REDACTED-PHONE]"),
]


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except (TypeError, ValueError):  # pragma: no cover - malformed log call
            record.msg = "[Unformattable log entry]"
            record.args = ()
            return True
        redacted = message
        for pattern, replacement in _REDACTIONS:
            redacted = pattern.sub(replacement, redacted)
        if redacted != message:
            record.msg = redacted
            record.args = None
        return True


def redact_text(value: str) -> str:
    for pattern, replacement in _REDACTIONS:
        value = pattern.sub(replacement, value)
    return value
