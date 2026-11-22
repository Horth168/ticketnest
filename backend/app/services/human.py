"""Bot protection (same design as IceQ Sole).

1. Cloudflare Turnstile (free, usually invisible to real people). The website shows the widget on
   sign-in, register, forgot-password, checkout, new listings and reviews and sends the one-time token in
   the X-Human-Token header; those endpoints verify it with Cloudflare first. Off until both
   TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are set, so local development and tests need no keys.
   If Cloudflare itself can't be reached the request is let through (rate limits still apply): a
   Cloudflare outage should not stop real customers from buying.

2. Sign-in lockout: after 8 wrong passwords for the same email from the same network within 15 minutes,
   that pair is locked for 15 minutes (stops password guessing even from a "human" browser).
"""
from __future__ import annotations

import logging
import threading
import time

import httpx
from fastapi import HTTPException, Request

from app.config import settings
from app.limiter import client_ip

log = logging.getLogger("ticketnest.human")

HEADER = "X-Human-Token"
VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
FAILED = "Please complete the security check and try again"


def enabled() -> bool:
    return bool(settings.TURNSTILE_SECRET_KEY and settings.TURNSTILE_SITE_KEY)


def require_human(request: Request) -> None:
    """FastAPI dependency: 403 unless the request carries a valid Turnstile token."""
    if not enabled():
        return
    token = request.headers.get(HEADER, "")
    if not token or len(token) > 2048:
        raise HTTPException(403, FAILED)
    try:
        r = httpx.post(VERIFY_URL, timeout=10, data={
            "secret": settings.TURNSTILE_SECRET_KEY, "response": token, "remoteip": client_ip(request)})
        result = r.json()
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Turnstile unreachable, letting request through: %s", e)
        return
    if not result.get("success"):
        log.info("Turnstile rejected %s %s: %s", request.method, request.url.path, result.get("error-codes"))
        raise HTTPException(403, FAILED)


# ---------------------------------------------------------------- sign-in lockout
MAX_FAILS = 8
WINDOW = 15 * 60
LOCK = 15 * 60
_fails: dict[str, list[float]] = {}
_locked: dict[str, float] = {}
_lock = threading.Lock()


def _key(email: str, request: Request) -> str:
    return f"{email.strip().lower()}|{client_ip(request)}"


def check_login_allowed(email: str, request: Request) -> None:
    k, now = _key(email, request), time.time()
    with _lock:
        until = _locked.get(k, 0)
        if until > now:
            mins = max(1, round((until - now) / 60))
            raise HTTPException(429, f"Too many wrong passwords. Try again in {mins} minute(s), or reset your password.")


def login_failed(email: str, request: Request) -> None:
    k, now = _key(email, request), time.time()
    with _lock:
        fails = [t for t in _fails.get(k, []) if now - t < WINDOW] + [now]
        _fails[k] = fails
        if len(fails) >= MAX_FAILS:
            _locked[k] = now + LOCK
            _fails.pop(k, None)
            log.warning("Sign-in locked for 15 min after %d failures (%s)", MAX_FAILS, k.split("|")[1])
        if len(_fails) > 5000:   # keep memory bounded
            for old in list(_fails)[:2500]:
                _fails.pop(old, None)


def login_succeeded(email: str, request: Request) -> None:
    with _lock:
        _fails.pop(_key(email, request), None)
