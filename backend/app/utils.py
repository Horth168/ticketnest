"""Small helpers: money in integer cents, time, slugs, text cleaning."""
from __future__ import annotations

import re
import secrets
import unicodedata
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from app.config import settings

LOCAL_TZ = ZoneInfo(settings.TIMEZONE)


# ---------------------------------------------------------------- money
# Every amount is stored as an integer number of cents (USD) or riel (KHR). Never floats.
def to_cents(value) -> int:
    """'100', '100.5', 100, Decimal('100.50') -> 10050. Raises ValueError for anything else."""
    try:
        d = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, AttributeError) as e:
        raise ValueError("Invalid amount") from e
    if d.is_nan() or d.is_infinite():
        raise ValueError("Invalid amount")
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def percent_of(cents: int, bps: int) -> int:
    """`bps` basis points (1500 = 15%) of `cents`, rounded half-up to a whole cent (integer maths)."""
    return (cents * bps + 5000) // 10000


def fmt_usd(cents: int) -> str:
    return f"${cents / 100:,.2f}" if cents % 100 else f"${cents // 100:,}"


def fmt_usd2(cents: int) -> str:
    sign = "-" if cents < 0 else ""
    c = abs(int(cents))
    return f"{sign}${c // 100:,}.{c % 100:02d}"


def usd_to_khr(cents: int, rate: int) -> int:
    """Riel amount, rounded to 100 riel like Cambodian prices."""
    return ((cents * rate + 5000) // 10000) * 100


# ---------------------------------------------------------------- time
def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def as_aware(dt: datetime | None) -> datetime | None:
    """SQLite returns naive datetimes; treat them as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso(dt: datetime | None) -> str | None:
    return as_aware(dt).isoformat() if dt else None


def local(dt: datetime | None) -> datetime | None:
    return as_aware(dt).astimezone(LOCAL_TZ) if dt else None


def fmt_local(dt: datetime | None, pattern: str = "%d %b %Y, %H:%M") -> str:
    return local(dt).strftime(pattern) if dt else ""


# ---------------------------------------------------------------- text
def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^\w\s-]", "", value.lower())
    return re.sub(r"[-\s_]+", "-", value).strip("-") or secrets.token_hex(3)


def clean_text(value: str | None, max_len: int = 2000) -> str:
    """Strip control characters and HTML angle brackets from free text."""
    if not value:
        return ""
    value = "".join(ch for ch in value if ch == "\n" or unicodedata.category(ch)[0] != "C")
    return value.replace("<", "").replace(">", "").strip()[:max_len]


def clean_tg_username(value: str | None) -> str:
    v = (value or "").strip().lstrip("@")
    if v.lower().startswith(("https://t.me/", "http://t.me/", "t.me/")):
        v = v.split("t.me/", 1)[1].split("/")[0]
    if v and not re.fullmatch(r"[A-Za-z0-9_]{4,32}", v):
        raise ValueError("Enter a valid Telegram username, e.g. @ticketnest")
    return v
