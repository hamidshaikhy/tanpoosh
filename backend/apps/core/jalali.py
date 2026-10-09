from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import jdatetime

TEHRAN = ZoneInfo("Asia/Tehran")
_FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa_digits(value: object) -> str:
    return str(value).translate(_FA_DIGITS)


def format_jalali(value: datetime | None, *, with_time: bool = True) -> str:
    if value is None:
        return ""
    local = value.astimezone(TEHRAN)
    jd = jdatetime.datetime.fromgregorian(datetime=local.replace(tzinfo=None))
    text = f"{jd.year}/{jd.month:02d}/{jd.day:02d}"
    if with_time:
        text += f" ساعت {local.hour:02d}:{local.minute:02d}"
    return fa_digits(text)


def format_toman(amount: int) -> str:
    return fa_digits(f"{int(amount):,}").replace(",", "٬") + " تومان"


def jalali_date_compact(value: datetime) -> str:
    local = value.astimezone(TEHRAN)
    jd = jdatetime.date.fromgregorian(date=local.date())
    return f"{jd.year % 100:02d}{jd.month:02d}{jd.day:02d}"
