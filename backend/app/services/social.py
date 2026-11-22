"""Sign in with Google and Telegram (verification code reused from IceQ Sole).

* Google: the ID token (or popup access token) is verified with Google before the email is trusted;
  its audience must be our GOOGLE_CLIENT_ID.
* Telegram Login Widget (website): HMAC-SHA256 with sha256(bot token) as key
  (https://core.telegram.org/widgets/login#checking-authorization).
* Telegram Mini App: HMAC with the "WebAppData" key over initData
  (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

Both Telegram flows use TELEGRAM_BOT_TOKEN - the TicketNest bot is also the Mini App's bot.
Nothing the browser says about who the user is is trusted until one of these checks passes.

Accounts are never duplicated: an identity already linked signs in to its account; a verified
Google email that matches an existing account is linked to it; a signed-in user can link Google or
Telegram from their profile.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from urllib.parse import parse_qsl

import httpx
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Role, TelegramUser, User, UserAuthProvider
from app.utils import clean_text

log = logging.getLogger("ticketnest.social")

MAX_AGE = 24 * 3600
FAILED = "Sign-in could not be verified, please try again"


def google_enabled() -> bool:
    return bool(settings.GOOGLE_CLIENT_ID)


def telegram_enabled() -> bool:
    return bool(settings.TELEGRAM_BOT_TOKEN)


_bot_username: str | None = None
_retry_at = 0.0


def telegram_bot_username() -> str:
    global _bot_username, _retry_at
    if not telegram_enabled() or settings.ENVIRONMENT == "test":
        return ""
    if _bot_username is None and time.time() >= _retry_at:
        try:
            r = httpx.get(f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getMe", timeout=8)
            name = r.json().get("result", {}).get("username", "") if r.status_code == 200 else ""
        except (httpx.HTTPError, ValueError):
            name = ""
        if name:
            _bot_username = name
        else:
            _retry_at = time.time() + 300
    return _bot_username or ""


# ------------------------------------------------------------------ verification
GOOGLE_TOKENINFO = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo"


def verify_google_access_token(access_token: str) -> dict:
    if not google_enabled():
        raise HTTPException(404, "Google sign-in is not available")
    try:
        ti = httpx.get(GOOGLE_TOKENINFO, params={"access_token": access_token}, timeout=10)
        tok = ti.json() if ti.status_code == 200 else {}
        if settings.GOOGLE_CLIENT_ID not in (tok.get("aud"), tok.get("azp")) or int(tok.get("expires_in", 0)) <= 0:
            raise HTTPException(401, FAILED)
        ui = httpx.get(GOOGLE_USERINFO, headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        info = ui.json() if ui.status_code == 200 else {}
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(401, FAILED) from e
    if not info.get("sub") or info.get("sub") != tok.get("sub", info.get("sub")):
        raise HTTPException(401, FAILED)
    return {"sub": info["sub"], "email": info.get("email"), "email_verified": bool(info.get("email_verified")),
            "name": info.get("name")}


def verify_google(credential: str) -> dict:
    if not google_enabled():
        raise HTTPException(404, "Google sign-in is not available")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token
    try:
        info = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
                                            clock_skew_in_seconds=10)
    except Exception as e:  # noqa: BLE001 - bad signature, wrong audience, expired, network
        log.info("Google token rejected: %s", e.__class__.__name__)
        raise HTTPException(401, FAILED) from e
    if info.get("iss") not in ("accounts.google.com", "https://accounts.google.com") or not info.get("sub"):
        raise HTTPException(401, FAILED)
    return info


def _check_hash(fields: dict[str, str], received: str, secret: bytes) -> None:
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not received or not hmac.compare_digest(expected, received):
        raise HTTPException(401, FAILED)


def _check_age(auth_date) -> None:
    try:
        age = time.time() - int(auth_date)
    except (TypeError, ValueError) as e:
        raise HTTPException(401, FAILED) from e
    if age > MAX_AGE or age < -300:
        raise HTTPException(401, FAILED)


def verify_telegram_widget(data: dict) -> dict:
    if not telegram_enabled():
        raise HTTPException(404, "Telegram sign-in is not available")
    fields = {k: str(v) for k, v in data.items() if k != "hash" and v is not None}
    _check_hash(fields, str(data.get("hash", "")), hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest())
    _check_age(fields.get("auth_date"))
    return {"id": int(fields["id"]), "first_name": fields.get("first_name", ""),
            "last_name": fields.get("last_name", ""), "username": fields.get("username", "")}


def verify_telegram_webapp(init_data: str) -> dict:
    if not telegram_enabled():
        raise HTTPException(404, "Telegram sign-in is not available")
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received = fields.pop("hash", "")
    secret = hmac.new(b"WebAppData", settings.TELEGRAM_BOT_TOKEN.encode(), hashlib.sha256).digest()
    _check_hash(fields, received, secret)
    _check_age(fields.get("auth_date"))
    try:
        user = json.loads(fields.get("user", ""))
        user["id"] = int(user["id"])
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(401, FAILED) from e
    return user


# ------------------------------------------------------------------ accounts
def _usable(user: User) -> User:
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled")
    return user


def _provider(db: Session, provider: str, uid: str) -> UserAuthProvider | None:
    return db.query(UserAuthProvider).filter_by(provider=provider, provider_uid=uid).first()


def link_provider(db: Session, user: User, provider: str, uid: str, display: str) -> None:
    existing = _provider(db, provider, uid)
    if existing and existing.user_id != user.id:
        raise HTTPException(409, f"This {provider.title()} account is already linked to another TicketNest account")
    mine = db.query(UserAuthProvider).filter_by(user_id=user.id, provider=provider).first()
    if mine and mine.provider_uid != uid:
        raise HTTPException(409, f"Your account is already linked to a different {provider.title()} account")
    if not mine:
        db.add(UserAuthProvider(user_id=user.id, provider=provider, provider_uid=uid, display=display[:255]))


def user_from_google(db: Session, info: dict) -> tuple[User, bool]:
    """(user, created)."""
    sub = str(info["sub"])
    linked = _provider(db, "google", sub)
    if linked:
        return _usable(linked.user), False
    email = (info.get("email") or "").lower()
    if not email or not info.get("email_verified"):
        raise HTTPException(401, FAILED)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    created = user is None
    if user:
        _usable(user)
        if not user.email_verified:
            # Nobody had proved they own this address until now (Google just did). Protect against an
            # account someone pre-registered with another person's email: drop its password and sessions.
            from app.models import RefreshToken
            user.password_hash = ""
            user.token_version += 1
            db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
        user.email_verified = True
    else:
        user = User(email=email, full_name=clean_text(info.get("name") or email.split("@")[0], 120),
                    role=Role.customer, email_verified=True)
        db.add(user)
        db.flush()
    link_provider(db, user, "google", sub, email)
    db.flush()
    return user, created


def record_telegram_user(db: Session, tg: dict, user: User | None, *, can_message: bool | None = None) -> None:
    row = db.query(TelegramUser).filter_by(telegram_id=int(tg["id"])).first()
    if not row:
        row = TelegramUser(telegram_id=int(tg["id"]))
        db.add(row)
    row.username = (tg.get("username") or "")[:64]
    row.first_name = (tg.get("first_name") or "")[:120]
    if user:
        row.user_id = user.id
    if can_message is not None:
        row.can_message = can_message


def user_from_telegram(db: Session, tg: dict, *, allows_write: bool = False) -> tuple[User, bool]:
    tid = int(tg["id"])
    user = db.query(User).filter(User.telegram_id == tid).first()
    created = False
    if user:
        _usable(user)
    else:
        name = " ".join(x for x in (tg.get("first_name"), tg.get("last_name")) if x).strip() or tg.get("username") or ""
        user = User(email=None, full_name=clean_text(name or "TicketNest fan", 120), role=Role.customer, telegram_id=tid)
        db.add(user)
        db.flush()
        created = True
        link_provider(db, user, "telegram", str(tid), "@" + tg["username"] if tg.get("username") else str(tid))
    if tg.get("username"):
        user.telegram_username = tg["username"][:64]
    record_telegram_user(db, tg, user, can_message=True if allows_write else None)
    db.flush()
    return user, created


def link_telegram(db: Session, user: User, tg: dict) -> None:
    tid = int(tg["id"])
    other = db.query(User).filter(User.telegram_id == tid, User.id != user.id).first()
    if other:
        raise HTTPException(409, "This Telegram account is already linked to another TicketNest account")
    link_provider(db, user, "telegram", str(tid), "@" + tg["username"] if tg.get("username") else str(tid))
    user.telegram_id = tid
    user.telegram_username = (tg.get("username") or "")[:64]
    record_telegram_user(db, tg, user)
