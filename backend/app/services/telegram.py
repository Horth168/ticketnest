"""Telegram Bot API plumbing for the TicketNest bot (outbox pattern from IceQ Sole).

Messages are queued on the database session and sent only AFTER the transaction commits, from a
background thread: a checkout that fails never produces an alert, and requests never wait on
Telegram. Every message is written to telegram_notifications for troubleshooting.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import logging
import threading
import time

import httpx
from sqlalchemy import event
from sqlalchemy.orm import Session

from app.config import settings

log = logging.getLogger("ticketnest.telegram")
API = "https://api.telegram.org/bot{token}/{method}"
OUTBOX = "tg_outbox"
SYNC_FOR_TESTS: list | None = None   # tests set this to a list to capture messages instead of sending


def enabled() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


def is_admin(telegram_user_id) -> bool:
    try:
        return int(telegram_user_id) in settings.admin_telegram_ids
    except (TypeError, ValueError):
        return False


def admin_targets() -> list[str]:
    if settings.TELEGRAM_ADMIN_GROUP_ID.strip():
        return [settings.TELEGRAM_ADMIN_GROUP_ID.strip()]
    return [str(i) for i in sorted(settings.admin_telegram_ids)]


def webhook_secret() -> str:
    return hmac.new(settings.SECRET_KEY.encode(), b"telegram-webhook", hashlib.sha256).hexdigest()[:48]


def webhook_url() -> str:
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/api/telegram/webhook/{webhook_secret()}"


def e(v) -> str:
    return html.escape(str(v if v is not None else ""))


# ---------------------------------------------------------------- low-level API
def call(method: str, **payload) -> dict | None:
    if not enabled():
        return None
    try:
        r = httpx.post(API.format(token=settings.TELEGRAM_BOT_TOKEN, method=method), json=payload, timeout=20)
        data = r.json()
        if not data.get("ok"):
            log.warning("Telegram %s failed: %s", method, data.get("description"))
        return data
    except Exception as ex:  # noqa: BLE001 - alerts must never break the marketplace
        log.warning("Telegram %s error: %s", method, ex.__class__.__name__)
        return None


COMMANDS = [
    {"command": "start", "description": "Open TicketNest"},
    {"command": "help", "description": "What this bot can do"},
    {"command": "dashboard", "description": "Admin: today at a glance"},
    {"command": "orders", "description": "Admin: latest orders"},
    {"command": "pending", "description": "Admin: listings and withdrawals waiting"},
    {"command": "listings", "description": "Admin: listings awaiting approval"},
    {"command": "stock", "description": "Admin: tickets on sale"},
    {"command": "revenue", "description": "Admin: revenue summary"},
    {"command": "report", "description": "Admin: today's report"},
]


def register_webhook() -> None:
    if not enabled() or not settings.API_PUBLIC_URL.startswith("https://"):
        return
    for attempt, wait in enumerate((0, 5, 15, 30, 60, 120)):
        time.sleep(wait)
        res = call("setWebhook", url=webhook_url(), secret_token=webhook_secret(),
                   allowed_updates=["message", "channel_post", "callback_query", "my_chat_member"],
                   drop_pending_updates=False)
        if res and res.get("ok"):
            log.info("Telegram webhook registered (attempt %d)", attempt + 1)
            call("setMyCommands", commands=COMMANDS)
            return
    log.warning("Telegram webhook could not be registered; it will be retried on the next restart")


def register_webhook_async() -> None:
    threading.Thread(target=register_webhook, daemon=True).start()


# ---------------------------------------------------------------- outbox
def queue(db: Session, chat_id, text: str, *, kind: str, buttons: list[list[dict]] | None = None) -> None:
    if not chat_id:
        return
    db.info.setdefault(OUTBOX, []).append({"chat": str(chat_id), "text": text, "kind": kind, "buttons": buttons})


def queue_admin(db: Session, text: str, *, kind: str, buttons: list[list[dict]] | None = None) -> None:
    from app.services.settings_store import get_setting
    if not get_setting(db, "telegram").get("admin_alerts", True):
        return
    for target in admin_targets():
        queue(db, target, text, kind=kind, buttons=buttons)


def send_now(chat_id, text: str, buttons: list[list[dict]] | None = None) -> dict | None:
    markup = {"reply_markup": {"inline_keyboard": buttons}} if buttons else {}
    return call("sendMessage", chat_id=chat_id, text=text[:4096], parse_mode="HTML",
                disable_web_page_preview=True, **markup)


def _deliver(items: list[dict]) -> None:
    from app.database import SessionLocal
    from app.models import TelegramNotification
    rows = []
    for item in items:
        status, error = "skipped", "bot not configured"
        if enabled():
            res = send_now(item["chat"], item["text"], item["buttons"])
            status = "sent" if res and res.get("ok") else "failed"
            error = "" if status == "sent" else str((res or {}).get("description", "no response"))[:300]
        rows.append(TelegramNotification(chat_id=item["chat"], kind=item["kind"], text=item["text"][:4000],
                                         status=status, error=error))
    try:
        with SessionLocal() as db:
            db.add_all(rows)
            db.commit()
    except Exception:  # noqa: BLE001
        log.exception("Could not log Telegram notifications")


@event.listens_for(Session, "after_commit")
def _after_commit(session: Session) -> None:
    items = session.info.pop(OUTBOX, None)
    if not items:
        return
    if SYNC_FOR_TESTS is not None:
        SYNC_FOR_TESTS.extend(items)
        return
    threading.Thread(target=_deliver, args=(items,), daemon=True).start()


@event.listens_for(Session, "after_rollback")
def _after_rollback(session: Session) -> None:
    session.info.pop(OUTBOX, None)
