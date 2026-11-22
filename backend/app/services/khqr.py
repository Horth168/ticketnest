"""Bakong KHQR (reused from IceQ Sole): the national QR standard used by ABA and every Bakong member bank.

TicketNest builds every order's QR from the owner's own ABA merchant KHQR (`build_from_template`):
all of the bank's routing fields are kept (including ABA's PayWay tag, which is what makes ABA post
the payment notification), and only the amount, currency, bill number (our order number) and expiry
change. `check_payment()` optionally asks the Bakong Open API about a QR's md5 (needs BAKONG_API_TOKEN).
"""
from __future__ import annotations

import hashlib
import logging
import time
from decimal import Decimal

import httpx

from app.config import settings

log = logging.getLogger("ticketnest.khqr")

CURRENCY_CODES = {"USD": "840", "KHR": "116"}


def _tlv(tag: str, value: str) -> str:
    if not value:
        return ""
    return f"{tag}{len(value):02d}{value}"


def crc16_ccitt(data: str) -> str:
    crc = 0xFFFF
    for byte in data.encode("utf-8"):
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def _ascii(value: str, max_len: int) -> str:
    return "".join(ch for ch in value if 32 <= ord(ch) < 127)[:max_len]


def build_khqr(*, account_id: str, merchant_name: str, merchant_city: str, amount: Decimal,
               currency: str = "USD", bill_number: str = "", store_label: str = "",
               expiry_minutes: int = 30, account_information: str = "", acquiring_bank: str = "") -> str:
    """Dynamic KHQR. Banks such as ABA give personal accounts a shared Bakong ID
    (e.g. abaakhppxxx@abaa) plus the account number, which goes in `account_information`."""
    if currency not in CURRENCY_CODES:
        raise ValueError("KHQR supports USD or KHR")
    amount_str = f"{amount:.2f}" if currency == "USD" else str(int(amount))
    now_ms = int(time.time() * 1000)
    parts = [
        _tlv("00", "01"),
        _tlv("01", "12"),  # dynamic QR (amount included)
        _tlv("29", _tlv("00", account_id)
              + (_tlv("01", _ascii(account_information, 32)) if account_information else "")
              + (_tlv("02", _ascii(acquiring_bank, 32)) if acquiring_bank else "")),
        _tlv("52", "5999"),
        _tlv("53", CURRENCY_CODES[currency]),
        _tlv("54", amount_str),
        _tlv("58", "KH"),
        _tlv("59", _ascii(merchant_name, 25)),
        _tlv("60", _ascii(merchant_city, 15)),
        _tlv("62", _tlv("01", _ascii(bill_number, 25)) + _tlv("03", _ascii(store_label, 25))),
        _tlv("99", _tlv("00", str(now_ms)) + _tlv("01", str(now_ms + expiry_minutes * 60_000))),
    ]
    payload = "".join(parts) + "6304"
    return payload + crc16_ccitt(payload)


def md5(payload: str) -> str:
    return hashlib.md5(payload.encode("utf-8")).hexdigest()


def check_payment(payload_md5: str) -> dict:
    """Ask the official Bakong Open API whether the QR with this md5 was paid.
    Returns {"paid": bool, "data": dict|None, "error": str|None}. Optional: needs BAKONG_API_TOKEN."""
    if not settings.BAKONG_API_TOKEN:
        return {"paid": False, "data": None, "error": "Bakong API is not configured"}
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.post(f"{settings.BAKONG_API_URL.rstrip('/')}/v1/check_transaction_by_md5",
                               json={"md5": payload_md5},
                               headers={"Authorization": f"Bearer {settings.BAKONG_API_TOKEN}"})
        body = resp.json() if resp.content else {}
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Bakong check failed: %s", e.__class__.__name__)
        return {"paid": False, "data": None, "error": "Payment network unavailable"}
    if resp.status_code == 200 and body.get("responseCode") == 0 and body.get("data"):
        return {"paid": True, "data": body.get("data"), "error": None}
    return {"paid": False, "data": None, "error": None if resp.status_code == 200 else f"HTTP {resp.status_code}"}


# ---------------------------------------------------------------- bank-QR template
# Banks such as ABA add their own fields (e.g. ABA's tag 40 with both account numbers) and reject a
# QR without them. So the store can start from the merchant's own printed bank KHQR: every field is
# kept exactly, and only the amount, currency, bill number and expiry are set per order.
_PER_ORDER = {"00", "01", "53", "54", "62", "63", "99"}


def parse_tlv(s: str) -> list[tuple[str, str]]:
    out, i = [], 0
    while i < len(s):
        if i + 4 > len(s) or not s[i:i + 4].isdigit():
            raise ValueError("Not a valid KHQR code")
        tag, n = s[i:i + 2], int(s[i + 2:i + 4])
        if i + 4 + n > len(s):
            raise ValueError("Not a valid KHQR code")
        out.append((tag, s[i + 4:i + 4 + n]))
        i += 4 + n
    return out


def describe_template(template: str) -> dict:
    """Validate a bank KHQR and return what it pays into (shown to the admin before saving)."""
    t = (template or "").strip()
    if not t.startswith("000201") or len(t) < 30 or crc16_ccitt(t[:-4]) != t[-4:].upper():
        raise ValueError("This is not a valid KHQR code (checksum mismatch)")
    fields = dict(parse_tlv(t))
    if fields.get("58") != "KH" or not ({"29", "30"} & set(fields)):
        raise ValueError("This QR is not a Cambodian KHQR payment code")
    acct = dict(parse_tlv(fields.get("29") or fields.get("30")))
    return {"name": fields.get("59", ""), "city": fields.get("60", ""), "bakong_id": acct.get("00", ""),
            "account": acct.get("01", ""), "bank": acct.get("02", "")}


def build_from_template(template: str, *, amount: Decimal, currency: str = "USD", bill_number: str = "",
                        store_label: str = "", expiry_minutes: int = 30) -> str:
    describe_template(template)
    if currency not in CURRENCY_CODES:
        raise ValueError("KHQR supports USD or KHR")
    amount_str = f"{amount:.2f}" if currency == "USD" else str(int(amount))
    now_ms = int(time.time() * 1000)
    top = dict(parse_tlv(template.strip()))
    fields = {tag: val for tag, val in top.items() if tag not in _PER_ORDER}
    # Additional data (62): keep whatever the bank put there - an ABA merchant QR carries its PayWay
    # routing in sub-tag 68 ("PAYWAY@ABA" + merchant references), which is what makes ABA notify PayWay.
    # Only the bill number (01) and store label (03) are ours.
    extra = {k: v for k, v in parse_tlv(top["62"])} if top.get("62") else {}
    extra["01"] = _ascii(bill_number, 25)
    if store_label:
        extra["03"] = _ascii(store_label, 25)
    fields.update({
        "00": "01",
        "01": "12",  # dynamic: one amount, one order
        "53": CURRENCY_CODES[currency],
        "54": amount_str,
        "62": "".join(_tlv(k, extra[k]) for k in sorted(extra) if extra[k]),
        "99": _tlv("00", str(now_ms)) + _tlv("01", str(now_ms + expiry_minutes * 60_000)),
    })
    payload = "".join(_tlv(tag, fields[tag]) for tag in sorted(fields)) + "6304"
    return payload + crc16_ccitt(payload)
