"""point customer support and delivery contact at the public support group (t.me/ticketnestsupport)

Revision ID: b7e3f1a9c2d4
Revises: 8c01905fa757
Create Date: 2026-11-23

Data only: updates the saved Telegram settings so every "Support" / "Message us" button on the website,
the Mini App, order pages and bot messages opens the support group instead of the owner's own account.
Still editable afterwards in Admin -> Settings -> Telegram.
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b7e3f1a9c2d4"
down_revision: Union[str, None] = "8c01905fa757"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

GROUP = "ticketnestsupport"


def upgrade() -> None:
    conn = op.get_bind()
    t = sa.table("platform_settings", sa.column("key", sa.String), sa.column("value", sa.JSON))
    row = conn.execute(sa.select(t.c.value).where(t.c.key == "telegram")).first()
    if row is None:
        conn.execute(t.insert().values(key="telegram", value={"support_username": GROUP, "delivery_username": GROUP}))
        return
    value = row[0] if isinstance(row[0], dict) else json.loads(row[0] or "{}")
    value.update(support_username=GROUP, delivery_username=GROUP)
    conn.execute(t.update().where(t.c.key == "telegram").values(value=value))


def downgrade() -> None:
    pass
