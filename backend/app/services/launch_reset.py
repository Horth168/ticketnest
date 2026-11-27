"""One-time "launch cleanup": remove everything created while testing, before the site goes public.

Keeps: admin and staff accounts (and their sign-in links), all artists, the ONE concert the admin chooses
(with its ticket categories), platform settings and the audit log.
Removes: every other concert, all listings and ticket files, orders, payments, bank notifications,
invoices, deliveries, seller wallets and wallet history, withdrawals, reviews, concert alerts, the email
and Telegram send logs, customer accounts, and the order/invoice number counters (so the first real
order is TN-YYYY-0001 again).

A full database backup is taken first (Admin -> Settings -> Backups), so it can be undone with
scripts/restore_backup.py.
"""
from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models import (AuditLog, Concert, ConcertAlert, Counter, EmailLog, InventoryReservation, Invoice, Order,
                        OrderEvent, OrderItem, PasswordResetToken, Payment, PaymentNotification, RefreshToken, Review,
                        Role, SellerWallet, TelegramNotification, TelegramUser, TicketCategory, TicketDelivery,
                        TicketImage, TicketListing, User, UserAuthProvider, WalletTransaction, WithdrawalRequest)

CONFIRM_WORD = "DELETE TEST DATA"
STAFF = (Role.admin, Role.staff)


def _plan(keep_concert_id: int):
    """(label, model, where-clause or None for every row) in a safe delete order (children first)."""
    customer = select(User.id).where(User.role.not_in(STAFF))
    return [
        ("Wallet history", WalletTransaction, None),
        ("Withdrawals", WithdrawalRequest, None),
        ("Seller wallets", SellerWallet, None),
        ("Bank payment notifications", PaymentNotification, None),
        ("Payments", Payment, None),
        ("Invoices", Invoice, None),
        ("Ticket deliveries", TicketDelivery, None),
        ("Reservations", InventoryReservation, None),
        ("Order history events", OrderEvent, None),
        ("Email log", EmailLog, None),
        ("Order items", OrderItem, None),
        ("Orders", Order, None),
        ("Ticket proof files", TicketImage, None),
        ("Listings", TicketListing, None),
        ("Reviews", Review, None),
        ("Concert alerts", ConcertAlert, None),
        ("Telegram send log", TelegramNotification, None),
        ("Ticket categories (other concerts)", TicketCategory, TicketCategory.concert_id != keep_concert_id),
        ("Concerts", Concert, Concert.id != keep_concert_id),
        ("Order / invoice number counters", Counter, None),
        ("Sign-in links (customers)", UserAuthProvider, UserAuthProvider.user_id.in_(customer)),
        ("Login sessions (customers)", RefreshToken, RefreshToken.user_id.in_(customer)),
        ("Password reset links (customers)", PasswordResetToken, PasswordResetToken.user_id.in_(customer)),
        ("Customer accounts", User, User.role.not_in(STAFF)),
    ]


def _count(db: Session, model, where) -> int:
    q = select(func.count()).select_from(model)
    return db.execute(q.where(where) if where is not None else q).scalar_one()


def preview(db: Session, keep_concert_id: int) -> dict:
    keep = db.get(Concert, keep_concert_id)
    if not keep:
        raise ValueError("That concert does not exist.")
    rows = [{"label": label, "count": _count(db, m, w)} for label, m, w in _plan(keep_concert_id)]
    other = db.execute(select(Concert.id, Concert.title).where(Concert.id != keep_concert_id).order_by(Concert.id)).all()
    return {
        "keep_concert": {"id": keep.id, "title": keep.title, "categories": _count(db, TicketCategory, TicketCategory.concert_id == keep.id)},
        "concerts_removed": [{"id": i, "title": t} for i, t in other],
        "kept_accounts": [{"id": u.id, "name": u.full_name, "role": u.role.value}
                          for u in db.scalars(select(User).where(User.role.in_(STAFF)).order_by(User.id))],
        "delete": rows,
        "total": sum(r["count"] for r in rows),
        "confirm_word": CONFIRM_WORD,
    }


def run(db: Session, keep_concert_id: int) -> dict:
    if not db.get(Concert, keep_concert_id):
        raise ValueError("That concert does not exist.")
    customers = select(User.id).where(User.role.not_in(STAFF))
    # Keep the audit log and bot subscribers, but unlink them from accounts that are about to go.
    db.execute(update(AuditLog).where(AuditLog.actor_id.in_(customers)).values(actor_id=None))
    db.execute(update(TelegramUser).where(TelegramUser.user_id.in_(customers)).values(user_id=None))
    done = []
    for label, model, where in _plan(keep_concert_id):
        stmt = delete(model).where(where) if where is not None else delete(model)
        done.append({"label": label, "count": db.execute(stmt.execution_options(synchronize_session=False)).rowcount or 0})
    db.commit()
    return {"deleted": done, "total": sum(d["count"] for d in done)}
