"""Daily database backup: every table as gzipped JSON in the PRIVATE storage bucket (Cloudflare R2 in
production), so a lost or damaged database can be rebuilt with scripts/restore_backup.py.

No extra service or secret is needed: it uses the same private bucket as ticket proofs. Short-lived
login tokens are skipped. Files are never sent to Telegram (they contain personal data); admins
download them from Admin -> Settings -> Backups.
"""
from __future__ import annotations

import gzip
import json
import logging
from datetime import datetime, timedelta

from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.database import Base
from app.models import PlatformSetting
from app.services import storage
from app.utils import iso, local, utcnow

log = logging.getLogger("ticketnest.backup")
PREFIX = "backups"
KEEP_DAYS = 30
SKIP = {"refresh_tokens", "password_reset_tokens"}
STATE_KEY = "backup_last"
BACKUP_HOUR = 3   # Phnom Penh time, when traffic is lowest


def _json_default(v):
    if hasattr(v, "isoformat"):
        return v.isoformat()
    if hasattr(v, "value"):
        return v.value
    if isinstance(v, (bytes, bytearray)):
        return v.hex()
    return str(v)


def dump(db: Session) -> tuple[bytes, dict]:
    tables, counts = {}, {}
    for t in Base.metadata.sorted_tables:          # parents before children, so a restore can insert in order
        if t.name in SKIP:
            continue
        rows = [dict(r._mapping) for r in db.execute(select(t)).all()]
        tables[t.name] = rows
        counts[t.name] = len(rows)
    rev = db.execute(text("SELECT version_num FROM alembic_version")).scalar() if _has_alembic(db) else ""
    doc = {"format": "ticketnest-backup/1", "created_at": iso(utcnow()), "alembic_revision": rev or "",
           "counts": counts, "tables": tables}
    return gzip.compress(json.dumps(doc, default=_json_default, ensure_ascii=False).encode(), 6), counts


def _has_alembic(db: Session) -> bool:
    return inspect(db.get_bind()).has_table("alembic_version")


def run(db: Session) -> dict:
    data, counts = dump(db)
    name = f"ticketnest-{local(utcnow()).strftime('%Y-%m-%d-%H%M')}.json.gz"
    storage.put_private_at(f"{PREFIX}/{name}", data, "application/gzip")
    _prune()
    info = {"name": name, "size": len(data), "rows": sum(counts.values()), "at": iso(utcnow())}
    row = db.get(PlatformSetting, STATE_KEY)
    if row:
        row.value = info
    else:
        db.add(PlatformSetting(key=STATE_KEY, value=info))
    db.commit()
    log.info("Backup saved: %s (%d bytes, %d rows)", name, len(data), info["rows"])
    return info


def _prune() -> None:
    cutoff = utcnow() - timedelta(days=KEEP_DAYS)
    for o in list_backups()[KEEP_DAYS:]:
        if o["modified"] < cutoff:
            storage.delete_private(o["key"])


def list_backups() -> list[dict]:
    return [o for o in storage.list_private(PREFIX + "/") if o["key"].endswith(".json.gz")]


def read(name: str) -> bytes:
    if "/" in name or "\\" in name or not name.startswith("ticketnest-") or not name.endswith(".json.gz"):
        raise ValueError("bad backup name")
    return storage.read_private(f"{PREFIX}/{name}")


def maybe_run_daily(db: Session) -> bool:
    """Called every minute by the background loop: one backup per local day, after BACKUP_HOUR."""
    now = local(utcnow())
    row = db.get(PlatformSetting, STATE_KEY)
    last = (row.value or {}).get("at") if row else None
    if last and local(datetime.fromisoformat(last)).date() == now.date():
        return False
    if now.hour < BACKUP_HOUR and last:
        return False
    run(db)
    return True
