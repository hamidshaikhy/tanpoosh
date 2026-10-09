"""Persian text, digit, phone and postal-code normalization.

Stored text keeps its natural form (including ZWNJ half-spaces); search uses a separate
normalized key so that Arabic/Persian letter variants, digits and half-space/space choices
all match the same products.
"""

from __future__ import annotations

import re
import unicodedata

ZWNJ = "‌"
_LETTER_MAP = str.maketrans(
    {
        "ي": "ی",  # ي -> ی
        "ى": "ی",  # ى -> ی
        "ك": "ک",  # ك -> ک
        "ة": "ه",  # ة -> ه
        "ۀ": "هٔ",  # ۀ -> هٔ
        "ـ": None,  # tatweel
    }
)
_DIGIT_MAP = str.maketrans({**{chr(0x06F0 + i): str(i) for i in range(10)}, **{chr(0x0660 + i): str(i) for i in range(10)}})
_SEARCH_EXTRA = str.maketrans(
    {
        "أ": "ا",  # أ -> ا
        "إ": "ا",  # إ -> ا
        "آ": "ا",  # آ -> ا
        "ٔ": None,  # hamza above
        "ً": None,
        "ٌ": None,
        "ٍ": None,
        "َ": None,
        "ُ": None,
        "ِ": None,
        "ّ": None,
        "ْ": None,
    }
)
_CONTROL = re.compile(r"[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]")
_WS = re.compile(r"[ \t  -​  　]+")


def to_ascii_digits(value: str) -> str:
    return value.translate(_DIGIT_MAP)


def normalize_text(value: str, *, multiline: bool = False) -> str:
    """Canonical storage form for user-entered Persian text."""
    if not value:
        return ""
    value = unicodedata.normalize("NFC", value)
    value = value.translate(_LETTER_MAP)
    # Strip control chars and bidi override characters that could spoof displayed text.
    value = _CONTROL.sub("", value)
    if multiline:
        value = value.replace("\r\n", "\n").replace("\r", "\n")
        lines = [_WS.sub(" ", line).strip() for line in value.split("\n")]
        value = "\n".join(lines)
        value = re.sub(r"\n{3,}", "\n\n", value)
        return value.strip()
    value = value.replace("\n", " ").replace("\r", " ")
    return _WS.sub(" ", value).strip()


def search_key(value: str) -> str:
    """Normalized key for matching: letter variants unified, ZWNJ removed, digits ASCII."""
    value = unicodedata.normalize("NFKC", value or "")
    value = value.translate(_LETTER_MAP).translate(_SEARCH_EXTRA)
    value = to_ascii_digits(value).lower()
    value = value.replace(ZWNJ, "")
    value = _CONTROL.sub("", value)
    return _WS.sub(" ", value).strip()


def search_tokens(query: str, *, max_tokens: int = 6) -> list[str]:
    key = search_key(query)
    tokens = [t for t in re.split(r"[\s,،]+", key) if t]
    return tokens[:max_tokens]


_PHONE_RE = re.compile(r"^09\d{9}$")


def normalize_mobile(value: str) -> str | None:
    """Return 09XXXXXXXXX or None. Accepts Persian/Arabic digits, +98, 0098, 98, spaces, dashes."""
    if not value:
        return None
    digits = re.sub(r"[\s\-()]", "", to_ascii_digits(value))
    if digits.startswith("+98"):
        digits = "0" + digits[3:]
    elif digits.startswith("0098"):
        digits = "0" + digits[4:]
    elif digits.startswith("98") and len(digits) == 12:
        digits = "0" + digits[2:]
    elif digits.startswith("9") and len(digits) == 10:
        digits = "0" + digits
    return digits if _PHONE_RE.match(digits) else None


def normalize_postal_code(value: str) -> str | None:
    if not value:
        return None
    digits = re.sub(r"[\s\-]", "", to_ascii_digits(value))
    if not re.fullmatch(r"\d{10}", digits):
        return None
    if len(set(digits)) == 1:
        return None
    return digits


def normalize_email(value: str) -> str:
    return (value or "").strip().lower()


_USERNAME_RE = re.compile(r"^[a-z0-9](?:[a-z0-9._]{1,30})[a-z0-9]$")


def normalize_username(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").strip().lower()


def is_valid_username(value: str) -> bool:
    return bool(_USERNAME_RE.match(value)) and ".." not in value


def normalize_coupon_code(value: str) -> str:
    return to_ascii_digits(unicodedata.normalize("NFKC", value or "")).strip().upper()
