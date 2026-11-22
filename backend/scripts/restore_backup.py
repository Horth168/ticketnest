"""Restore a TicketNest backup (Admin -> Settings -> Backups -> download) into an EMPTY database.

    1. Point DATABASE_URL at the new, empty database (e.g. a fresh Neon branch).
    2. alembic upgrade head            # creates the tables
    3. python scripts/restore_backup.py ticketnest-2026-11-23-0300.json.gz

It refuses to run if the database already has orders or users, so it can't overwrite live data.
"""
import gzip
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import Boolean, Date, DateTime, func, select, text  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
import app.models  # noqa: E402,F401  (register every table)


def convert(col, v):
    if v is None:
        return None
    if isinstance(col.type, DateTime):
        return datetime.fromisoformat(v)
    if isinstance(col.type, Date):
        return datetime.fromisoformat(v).date()
    if isinstance(col.type, Boolean):
        return bool(v)
    return v


def main(path: str) -> None:
    doc = json.loads(gzip.decompress(Path(path).read_bytes()))
    if doc.get("format") != "ticketnest-backup/1":
        sys.exit("Not a TicketNest backup file")
    with SessionLocal() as db:
        for t in ("users", "orders"):
            if db.execute(select(func.count()).select_from(Base.metadata.tables[t])).scalar():
                sys.exit(f"Refusing: table '{t}' is not empty. Restore into an empty database.")
        for t in Base.metadata.sorted_tables:
            rows = doc["tables"].get(t.name) or []
            if not rows:
                continue
            cols = {c.name: c for c in t.columns}
            db.execute(t.insert(), [{k: convert(cols[k], v) for k, v in r.items() if k in cols} for r in rows])
            print(f"{t.name}: {len(rows)}")
        if engine.dialect.name == "postgresql":   # move id sequences past the restored rows
            for t in Base.metadata.sorted_tables:
                if "id" in t.columns and t.columns["id"].autoincrement is not False and t.columns["id"].type.python_type is int:
                    db.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), "
                                    f"COALESCE((SELECT MAX(id) FROM {t.name}), 0) + 1, false)"))
        db.commit()
    print(f"Restored backup from {doc['created_at']} (schema {doc.get('alembic_revision') or '?'})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
