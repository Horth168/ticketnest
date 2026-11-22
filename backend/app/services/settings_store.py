"""Platform settings stored in the database, edited from the admin dashboard.

Secrets (bot tokens, API keys, passwords) are NEVER stored here: they stay in environment
variables. `public_settings()` is the only part sent to anonymous visitors.
"""
from __future__ import annotations

import copy

from sqlalchemy.orm import Session

from app.config import settings
from app.models import PlatformSetting

DEFAULTS: dict[str, dict] = {
    "site": {
        "name": "TicketNest",
        "tagline": "The trusted way to buy and sell K-pop concert tickets.",
        "logo_url": "",
        "contact_email": "",
    },
    "fees": {
        "seller_commission_bps": 1500,   # 15.00 % taken from the seller's listing price
        "buyer_markup_bps": 1500,        # 15.00 % added on top for the buyer
    },
    "telegram": {
        "support_username": "",          # shown on Support / Contact buttons
        "delivery_username": "",         # the account that sends tickets to buyers
        "mini_app_url": "",
        "admin_alerts": True,
        "customer_updates": True,
        "daily_report": True,            # daily summary to the admin group
        "daily_report_hour": 21,         # local hour (Phnom Penh) it is sent at
    },
    "payments": {
        "khqr_enabled": True,
        "khqr_template": "",             # your own ABA merchant KHQR code; per-order QRs are built from it
        "merchant_name": "TicketNest",
        "merchant_city": "Phnom Penh",
        "khqr_currency": "USD",          # USD | KHR
        "qr_expiry_minutes": 15,         # how long a QR and its ticket hold last
        "grace_minutes": 10,             # payments that land shortly after expiry still count
        "instructions": "Scan with ABA, ACLEDA, Wing or any Bakong-member banking app and pay the exact amount.",
    },
    "currency": {"primary": "USD", "khr_rate": 4100, "show_khr": True},
    "inventory": {"low_stock_threshold": 2},
    "protection": {
        "hold_until_after_event": True,  # seller earnings stay pending until after the concert
        "payout_hold_hours": 48,         # ... this many hours after the concert starts
        "report_window_hours": 48,       # buyers can report a problem until this long after the start
        "price_cap_pct": 0,              # 0 = off; e.g. 150 = a listing may cost at most 150% of face value
    },
}

PUBLIC_KEYS = ("site", "currency")


def get_setting(db: Session, key: str) -> dict:
    base = copy.deepcopy(DEFAULTS.get(key, {}))
    row = db.get(PlatformSetting, key)
    if row and isinstance(row.value, dict):
        base.update({k: v for k, v in row.value.items() if k in base})
    if key == "telegram":
        base["support_username"] = base["support_username"] or settings.TELEGRAM_SUPPORT_USERNAME.lstrip("@")
        base["delivery_username"] = base["delivery_username"] or base["support_username"]
        base["mini_app_url"] = base["mini_app_url"] or settings.TELEGRAM_MINI_APP_URL
    return base


def set_setting(db: Session, key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise KeyError(key)
    row = db.get(PlatformSetting, key)
    current = dict(row.value) if row and isinstance(row.value, dict) else {}
    current.update({k: v for k, v in value.items() if k in DEFAULTS[key]})
    if row:
        row.value = current
    else:
        db.add(PlatformSetting(key=key, value=current))
    db.flush()
    return get_setting(db, key)


def all_settings(db: Session) -> dict:
    return {k: get_setting(db, k) for k in DEFAULTS}


def fees(db: Session) -> tuple[int, int]:
    """(seller_commission_bps, buyer_markup_bps)."""
    f = get_setting(db, "fees")
    return int(f["seller_commission_bps"]), int(f["buyer_markup_bps"])


def public_settings(db: Session) -> dict:
    from app.services import social
    data = {k: get_setting(db, k) for k in PUBLIC_KEYS}
    tg = get_setting(db, "telegram")
    commission, markup = fees(db)
    pay = get_setting(db, "payments")
    data["telegram"] = {"support_username": tg["support_username"], "delivery_username": tg["delivery_username"],
                        "mini_app_url": tg["mini_app_url"], "login_bot_username": social.telegram_bot_username(),
                        # the bot's numeric id is public (it is the bot's user id), used by the sign-in popup
                        "login_bot_id": (settings.TELEGRAM_BOT_TOKEN.split(":", 1)[0]
                                         if settings.TELEGRAM_BOT_TOKEN.split(":", 1)[0].isdigit() else "")}
    data["fees"] = {"seller_commission_bps": commission, "buyer_markup_bps": markup}
    data["protection"] = get_setting(db, "protection")
    data["payments"] = {"khqr_enabled": bool(pay["khqr_enabled"] and pay["khqr_template"]),
                        "qr_expiry_minutes": pay["qr_expiry_minutes"]}
    from app.services import human
    data["auth"] = {"google_client_id": settings.GOOGLE_CLIENT_ID, "telegram": social.telegram_enabled(),
                    "turnstile_site_key": settings.TURNSTILE_SITE_KEY if human.enabled() else ""}
    return data
