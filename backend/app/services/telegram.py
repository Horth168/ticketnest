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
        return [resolve_chat(settings.TELEGRAM_ADMIN_GROUP_ID.strip())]
    return [str(i) for i in sorted(settings.admin_telegram_ids)]


# ---------------------------------------------------------------- groups that Telegram moved
# When a group changes some settings, Telegram upgrades it to a "supergroup" with a NEW chat id and
# refuses messages to the old one ("group chat was upgraded to a supergroup chat", with the new id in
# parameters.migrate_to_chat_id). We remember old -> new in the database and resend, so alerts keep
# working without anyone touching the server settings.
MOVED_KEY = "telegram_moved_chats"
_moved: dict[str, str] | None = None
_moved_lock = threading.Lock()


def _load_moved() -> dict[str, str]:
    global _moved
    if _moved is None:
        try:
            from app.database import SessionLocal
            from app.models import PlatformSetting
            with SessionLocal() as db:
                row = db.get(PlatformSetting, MOVED_KEY)
                _moved = dict(row.value) if row and isinstance(row.value, dict) else {}
        except Exception:  # noqa: BLE001 (no database yet, e.g. during startup)
            return {}
    return _moved


def resolve_chat(chat_id) -> str:
    cid = str(chat_id)
    moved = _load_moved()
    for _ in range(3):           # follow a chain of moves, at most a few steps
        if cid not in moved:
            break
        cid = moved[cid]
    return cid


def remember_moved(old, new) -> None:
    global _moved
    old, new = str(old), str(new)
    with _moved_lock:
        moved = dict(_load_moved())
        moved[old] = new
        _moved = moved
    try:
        from app.database import SessionLocal
        from app.models import PlatformSetting
        with SessionLocal() as db:
            row = db.get(PlatformSetting, MOVED_KEY)
            if row:
                row.value = moved
            else:
                db.add(PlatformSetting(key=MOVED_KEY, value=moved))
            db.commit()
    except Exception:  # noqa: BLE001
        log.exception("Could not save the moved Telegram chat id")
    log.warning("Telegram group %s became supergroup %s. Messages now go to the new id; you can also set "
                "TELEGRAM_ADMIN_GROUP_ID=%s on the server.", old, new, new)


def webhook_secret() -> str:
    return hmac.new(settings.SECRET_KEY.encode(), b"telegram-webhook", hashlib.sha256).hexdigest()[:48]


def webhook_url() -> str:
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/api/telegram/webhook/{webhook_secret()}"


def e(v) -> str:
    return html.escape(str(v if v is not None else ""))


# ---------------------------------------------------------------- low-level API
def call(method: str, files: dict | None = None, **payload) -> dict | None:
    if not enabled():
        return None
    try:
        retried = payload.pop("_retried", False)
        url = API.format(token=settings.TELEGRAM_BOT_TOKEN, method=method)
        if "chat_id" in payload:
            payload["chat_id"] = resolve_chat(payload["chat_id"])
        if files:   # multipart upload (photos / documents); other fields are sent as form data
            import json as _json
            form = {k: (_json.dumps(v) if isinstance(v, (dict, list)) else str(v)) for k, v in payload.items()}
            r = httpx.post(url, data=form, files=files, timeout=60)
        else:
            r = httpx.post(url, json=payload, timeout=20)
        data = r.json()
        moved_to = (data.get("parameters") or {}).get("migrate_to_chat_id")
        if not data.get("ok") and moved_to and "chat_id" in payload and not retried:
            remember_moved(payload["chat_id"], moved_to)
            return call(method, files, **{**payload, "chat_id": str(moved_to), "_retried": True})
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


def send_file(chat_id, data: bytes, filename: str, content_type: str, caption: str = "") -> dict | None:
    """Send a private file (ticket proof, receipt, payout QR) straight to an admin chat.
    Images go as photos (shown inline, long-press to save); PDFs as documents."""
    if content_type.startswith("image/"):
        return call("sendPhoto", files={"photo": (filename, data, content_type)}, chat_id=chat_id,
                    caption=caption[:1024], parse_mode="HTML")
    return call("sendDocument", files={"document": (filename, data, content_type)}, chat_id=chat_id,
                caption=caption[:1024], parse_mode="HTML")
