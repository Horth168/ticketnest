"""Audit log + sequential numbers."""
from __future__ import annotations

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import AuditLog, Counter, User
from app.utils import local, utcnow


def log(db: Session, action: str, entity: str, entity_id="", *, actor: User | None = None, label: str = "",
        data: dict | None = None, ip: str = "") -> None:
    db.add(AuditLog(actor_id=actor.id if actor else None,
                    actor_label=label or (f"user:{actor.id}" if actor else "system"),
                    action=action, entity=entity, entity_id=str(entity_id), data=data, ip=ip))


def next_number(db: Session, prefix: str) -> str:
    """TN-2026-0001, INV-2026-0001 ... The counter row is incremented with an atomic UPDATE, so two
    checkouts at the same moment can never get the same number (the UNIQUE columns are a second guard)."""
    year = local(utcnow()).year
    name = f"{prefix}-{year}"
    res = db.execute(update(Counter).where(Counter.name == name).values(value=Counter.value + 1)
                     .execution_options(synchronize_session=False))
    if res.rowcount == 0:
        db.add(Counter(name=name, value=1))
        db.flush()
        value = 1
    else:
        value = db.query(Counter.value).filter(Counter.name == name).scalar()
    return f"{prefix}-{year}-{value:04d}"
