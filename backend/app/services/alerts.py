"""Error alerts to the Telegram admin group, so problems are noticed before a customer complains.

Sources: unhandled API errors, failing background jobs, failed backups and website (browser) errors.
Rate-limited so a broken page can't flood the group: the same error is sent at most once every
30 minutes. Website errors come from anonymous visitors, so they get their own small budget
(4 per hour): they can never use up the 12 per hour kept for server and background-job alerts. Messages never include request bodies,
tokens or personal data, only where the error happened and its type/message.
"""
from __future__ import annotations

import hashlib
import logging
import threading
import time
import traceback

from app.config import settings
from app.services import telegram as tg

log = logging.getLogger("ticketnest.alerts")
_lock = threading.Lock()
_seen: dict[str, float] = {}
_sent: list[float] = []        # server / background-job alerts
_sent_web: list[float] = []    # website (browser) error reports, which anyone can send
SAME_ERROR_SECONDS = 30 * 60
MAX_PER_HOUR = 12
MAX_WEB_PER_HOUR = 4


def _allow(signature: str, web: bool = False) -> bool:
    now = time.time()
    bucket, cap = (_sent_web, MAX_WEB_PER_HOUR) if web else (_sent, MAX_PER_HOUR)
    with _lock:
        while bucket and now - bucket[0] > 3600:
            bucket.pop(0)
        if now - _seen.get(signature, 0) < SAME_ERROR_SECONDS or len(bucket) >= cap:
            return False
        _seen[signature] = now
        bucket.append(now)
        if len(_seen) > 500:
            for k in sorted(_seen, key=_seen.get)[:250]:
                _seen.pop(k, None)
        return True


def _send(text: str) -> None:
    if settings.ENVIRONMENT == "test" or not tg.enabled():
        return
    for target in tg.admin_targets():
        try:
            tg.send_now(target, text)
        except Exception:  # noqa: BLE001  (alerting must never raise)
            log.exception("Could not send error alert")


def send(title: str, where: str, detail: str, signature: str | None = None, web: bool = False) -> bool:
    sig = hashlib.sha1((signature or f"{title}|{where}|{detail[:120]}").encode()).hexdigest()
    if not _allow(sig, web):
        return False
    env = "" if settings.is_production else f" ({settings.ENVIRONMENT})"
    text = f"🚨 <b>TICKETNEST — {tg.e(title)}</b>{env}\nWhere: <code>{tg.e(where[:200])}</code>\n<code>{tg.e(detail[:900])}</code>"
    threading.Thread(target=_send, args=(text,), daemon=True).start()
    return True


def api_error(method: str, path: str, exc: BaseException) -> None:
    frames = traceback.extract_tb(exc.__traceback__)
    app_frames = [f for f in frames if "/app/" in f.filename.replace("\\", "/")] or frames
    at = f"{app_frames[-1].filename.replace(chr(92), '/').split('/app/')[-1]}:{app_frames[-1].lineno}" if app_frames else "?"
    send("API ERROR", f"{method} {path}", f"{type(exc).__name__}: {exc}\nat app/{at}",
         signature=f"api|{type(exc).__name__}|{at}")


def job_error(job: str, exc: BaseException) -> None:
    send("BACKGROUND JOB FAILED", job, f"{type(exc).__name__}: {exc}", signature=f"job|{job}|{type(exc).__name__}")


def client_error(message: str, page: str, source: str = "") -> bool:
    return send("WEBSITE ERROR", page, f"{message}\n{source}".strip(), signature=f"web|{message[:160]}", web=True)
