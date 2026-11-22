"""Tiny in-memory cache for PUBLIC read-only answers (home page, concert lists, concert pages, public
settings, reviews). The free Render server has a tenth of a CPU, so building the same page for every
visitor is what limits traffic; serving it from memory for a few seconds lets one server handle many
times more visitors. Never used for anything personal or for money: checkout always re-checks live stock.

Off in tests so tests see their own changes immediately.
"""
from __future__ import annotations

import threading
import time
from typing import Any, Callable

from app.config import settings

_store: dict[str, tuple[float, Any]] = {}
_lock = threading.Lock()
MAX_KEYS = 500


def cached(key: str, ttl: float, build: Callable[[], Any]) -> Any:
    if settings.ENVIRONMENT == "test" and not _force:
        return build()
    now = time.monotonic()
    with _lock:
        hit = _store.get(key)
        if hit and hit[0] > now:
            return hit[1]
    value = build()
    with _lock:
        if len(_store) >= MAX_KEYS:
            for k in sorted(_store, key=lambda k: _store[k][0])[: MAX_KEYS // 2]:
                _store.pop(k, None)
        _store[key] = (now + ttl, value)
    return value


def clear() -> None:
    with _lock:
        _store.clear()


_force = False   # tests flip this to exercise the cache itself
