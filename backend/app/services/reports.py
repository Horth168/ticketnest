"""Daily summary for the admin Telegram group, plus the chart data used by the admin overview."""
from __future__ import annotations

import logging
from datetime import datetime, time, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (ListingStatus, Order, OrderItem, OrderStatus, PlatformSetting, TicketListing, User,
                        WithdrawalRequest, WithdrawalStatus)
from app.services import telegram as tg
from app.services.settings_store import get_setting
from app.utils import LOCAL_TZ, fmt_usd2, local, utcnow

log = logging.getLogger("ticketnest.reports")
PAID = (OrderStatus.paid, OrderStatus.preparing, OrderStatus.awaiting_delivery, OrderStatus.delivered,
        OrderStatus.completed)
REPORT_KEY = "daily_report_last"


def day_bounds(day) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=LOCAL_TZ)
    return start, start + timedelta(days=1)


def series(db: Session, days: int = 30) -> list[dict]:
    """Per local day: tickets sold, revenue, platform revenue, orders (zeros included, oldest first)."""
    today = local(utcnow()).date()
    first = today - timedelta(days=days - 1)
    start, _ = day_bounds(first)
    rows = (db.query(Order.paid_at, Order.total_cents, Order.markup_cents + Order.commission_cents,
                     func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(OrderItem, OrderItem.order_id == Order.id)
            .filter(Order.status.in_(PAID), Order.paid_at >= start)
            .group_by(Order.id).all())
    buckets = {first + timedelta(days=i): {"tickets": 0, "revenue_cents": 0, "platform_cents": 0, "orders": 0}
               for i in range(days)}
    for paid_at, total, platform, qty in rows:
        d = local(paid_at).date()
        if d in buckets:
            b = buckets[d]
            b["tickets"] += int(qty)
            b["revenue_cents"] += int(total)
            b["platform_cents"] += int(platform)
            b["orders"] += 1
    return [{"date": d.isoformat(), **v} for d, v in sorted(buckets.items())]


def top_concerts(db: Session, limit: int = 5) -> list[dict]:
    rows = (db.query(OrderItem.concert_title, func.sum(OrderItem.quantity), func.sum(Order.total_cents))
            .join(Order, Order.id == OrderItem.order_id).filter(Order.status.in_(PAID))
            .group_by(OrderItem.concert_title).order_by(func.sum(OrderItem.quantity).desc()).limit(limit).all())
    return [{"title": t, "tickets": int(q or 0), "revenue_cents": int(r or 0)} for t, q, r in rows]


def listing_status_counts(db: Session) -> dict:
    return {(k.value if hasattr(k, "value") else k): v for k, v in
            db.query(TicketListing.status, func.count(TicketListing.id)).group_by(TicketListing.status).all()}


def daily_text(db: Session, day=None) -> str:
    day = day or local(utcnow()).date()
    start, end = day_bounds(day)
    paid = db.query(Order).filter(Order.status.in_(PAID), Order.paid_at >= start, Order.paid_at < end)
    orders = paid.count()
    sales = int(paid.with_entities(func.coalesce(func.sum(Order.total_cents), 0)).scalar())
    platform = int(paid.with_entities(func.coalesce(func.sum(Order.markup_cents + Order.commission_cents), 0)).scalar())
    tickets = int(db.query(func.coalesce(func.sum(OrderItem.quantity), 0)).join(Order)
                  .filter(Order.status.in_(PAID), Order.paid_at >= start, Order.paid_at < end).scalar())
    new_users = db.query(User).filter(User.created_at >= start, User.created_at < end).count()
    new_listings = db.query(TicketListing).filter(TicketListing.created_at >= start, TicketListing.created_at < end).count()
    pending_listings = db.query(TicketListing).filter_by(status=ListingStatus.pending).count()
    to_deliver = db.query(Order).filter(Order.status.in_([OrderStatus.paid, OrderStatus.preparing,
                                                          OrderStatus.awaiting_delivery])).count()
    withdrawals = db.query(WithdrawalRequest).filter_by(status=WithdrawalStatus.pending).count()
    on_sale = int(db.query(func.coalesce(func.sum(TicketListing.quantity - TicketListing.quantity_reserved
                                                  - TicketListing.quantity_sold), 0))
                  .filter(TicketListing.status == ListingStatus.available).scalar())
    top = top_concerts(db, 3)
    lines = [f"📊 <b>TicketNest daily report · {day.strftime('%a %d %b %Y')}</b>", "",
             f"🎟 Tickets sold: <b>{tickets}</b> ({orders} orders)",
             f"💵 Sales: <b>{fmt_usd2(sales)}</b>", f"🏦 TicketNest revenue: <b>{fmt_usd2(platform)}</b>", "",
             f"👤 New customers: {new_users}", f"🆕 New listings: {new_listings}", f"🎫 Tickets on sale now: {on_sale}", "",
             f"⏳ Listings to review: <b>{pending_listings}</b>", f"📦 Orders to deliver: <b>{to_deliver}</b>",
             f"💸 Withdrawals to pay: <b>{withdrawals}</b>"]
    if top:
        lines += ["", "🔥 Best sellers (all time):"] + [f"• {tg.e(t['title'])}: {t['tickets']} tickets" for t in top]
    return "\n".join(lines)


def maybe_send_daily(db: Session) -> bool:
    """Called every few minutes; sends once per day after the configured hour (Phnom Penh time)."""
    cfg = get_setting(db, "telegram")
    if not cfg.get("daily_report", True) or not tg.enabled() or not tg.admin_targets():
        return False
    now = local(utcnow())
    if now.hour < int(cfg.get("daily_report_hour", 21)):
        return False
    today = now.date().isoformat()
    row = db.get(PlatformSetting, REPORT_KEY)
    if row and (row.value or {}).get("date") == today:
        return False
    text = daily_text(db, now.date())
    if row:
        row.value = {"date": today}
    else:
        db.add(PlatformSetting(key=REPORT_KEY, value={"date": today}))
    tg.queue_admin(db, text, kind="daily_report")
    db.commit()
    log.info("Daily report sent for %s", today)
    return True
