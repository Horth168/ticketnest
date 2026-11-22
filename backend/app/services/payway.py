"""Automatic KHQR confirmation from ABA PayWay's Telegram notifications (IceQ Sole's matcher, adapted).

HOW IT WORKS AND ITS LIMITS - please read
-----------------------------------------
ABA does not give small merchants a payment webhook. What ABA does: for every payment into your
ABA merchant account, its official bot @PayWayByABA_bot posts a message in a Telegram chat you link
in the ABA app, e.g.

    $115.00 paid by SOK DARA (*291) on Nov 15, 03:28 AM via ABA PAY at TICKETNEST.
    Trx. ID: 179468810879402, APV: 929857.

TicketNest's listener (services/tg_listener.py, a Telegram user account in that group) passes each
message here. This is NOT a signed bank callback, so the matcher only trusts a message when ALL of
these hold, and otherwise asks a human:

  1. It came from the configured payment group (TELEGRAM_PAYMENT_GROUP_ID) ...
  2. ... and its sender is the PayWay bot itself (Telegram marks bots; nobody can post as another
     bot), so a person typing "$115.00 paid by ..." in the group achieves nothing.
  3. The ABA transaction ID has never been seen before (payment_notifications.trx_id is UNIQUE, and
     payments.reference is UNIQUE): one bank transaction confirms at most one order.
  4. The amount AND currency equal exactly ONE pending KHQR payment whose QR was live (created ..
     expiry + grace) when the money arrived. If ABA's text contains our order number (the QR bill
     number), only that order is considered.
  5. Two or more possible orders -> nothing is confirmed; the admin gets one button per order.
     No possible order -> logged as "unmatched" and the admin is told. A message naming one of our
     orders with a different amount -> "wrong_amount", never confirmed.

Stronger check, when available: with BAKONG_API_TOKEN set, each QR's md5 is also checked with the
National Bank's Bakong Open API (check_bakong), which is an authoritative server-to-server answer.

Screenshots are never accepted as proof, and the browser can never mark an order paid.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, OrderStatus, Payment, PaymentNotification, PaymentStatus
from app.services import notify, orders as svc
from app.services import telegram as tg
from app.utils import as_aware, fmt_usd2, to_cents, utcnow

log = logging.getLogger("ticketnest.payway")

PATTERN = re.compile(
    r"(?P<cur>\$|USD|៛|KHR)\s?(?P<amount>\d[\d,]*(?:\.\d{1,2})?)\s+paid\s+by\s+(?P<payer>.+?)"
    r"(?:\s+\((?P<account>[^)]*)\))?\s+on\s+(?P<when>.+?)\s+via\s+(?P<via>.+?)\s+at\s+(?P<merchant>.+?)\.?\s*"
    r"Trx\.?\s*ID:?\s*(?P<trx>\d+)(?:\s*,\s*APV:?\s*(?P<apv>\d+))?",
    re.IGNORECASE | re.DOTALL,
)
ORDER_NO = re.compile(r"\bTN-\d{4}-\d{4,}\b")


@dataclass
class Notice:
    currency: str
    amount: int        # cents for USD, riel for KHR
    payer: str
    account: str
    trx: str
    apv: str
    text: str


def parse(text: str) -> Notice | None:
    m = PATTERN.search(text or "")
    if not m:
        return None
    cur = "KHR" if m["cur"].upper() in ("៛", "KHR") else "USD"
    try:
        amount = to_cents(m["amount"]) if cur == "USD" else int(m["amount"].replace(",", "").split(".")[0])
    except ValueError:
        return None
    return Notice(cur, amount, " ".join(m["payer"].split()), (m["account"] or "").strip(), m["trx"], m["apv"] or "",
                  text)


def enabled() -> bool:
    return bool(settings.TELEGRAM_PAYMENT_GROUP_ID.strip())


def from_payway(msg: dict) -> bool:
    chat = msg.get("chat") or {}
    if str(chat.get("id")) != settings.TELEGRAM_PAYMENT_GROUP_ID.strip():
        return False
    if chat.get("type") == "channel":
        return True  # channel posts can only be made by the channel's admins
    sender = msg.get("from") or {}
    return bool(sender.get("is_bot")) and \
        (sender.get("username") or "").lower() == settings.PAYWAY_BOT_USERNAME.lstrip("@").lower()


def _money(n: Notice) -> str:
    return fmt_usd2(n.amount) if n.currency == "USD" else f"៛{n.amount:,}"


def candidates(db: Session, notice: Notice, received_at: datetime) -> list[tuple[Order, Payment]]:
    g = svc.grace(db)
    numbers = set(ORDER_NO.findall(notice.text or ""))
    rows = (db.query(Order, Payment).join(Payment, Payment.order_id == Order.id)
            .filter(Payment.method == "khqr", Payment.currency == notice.currency, Payment.amount == notice.amount,
                    Payment.status.in_([PaymentStatus.pending, PaymentStatus.expired]),
                    Order.status.in_([OrderStatus.awaiting_payment, OrderStatus.cancelled]))
            .all())
    if numbers:
        rows = [(o, p) for o, p in rows if o.order_number in numbers]
    out = []
    for order, pay in rows:
        if order.status == OrderStatus.cancelled and not order.cancel_reason.startswith("Payment time expired"):
            continue  # cancelled on purpose: never revive it automatically
        start = as_aware(pay.created_at) - timedelta(minutes=1)
        end = (as_aware(pay.expires_at) if pay.expires_at else start + timedelta(minutes=30)) + g
        if start <= received_at <= end:
            out.append((order, pay))
    return out


def _log(db: Session, notice: Notice, msg: dict, received_at: datetime, outcome: str, payment_id=None,
         detail: str = "") -> PaymentNotification:
    row = PaymentNotification(source="payway", trx_id=notice.trx, chat_id=str((msg.get("chat") or {}).get("id", "")),
                              amount=notice.amount, currency=notice.currency, payer=notice.payer[:200],
                              payer_account=notice.account[:64], apv=notice.apv[:32], raw_text=notice.text[:4000],
                              received_at=received_at, outcome=outcome, payment_id=payment_id, detail=detail[:500])
    db.add(row)
    db.flush()
    return row


def handle(db: Session, msg: dict) -> str:
    """Process one Telegram message. Returns the outcome (for logs and tests)."""
    if not enabled() or not from_payway(msg):
        return "ignored"
    notice = parse(msg.get("text") or msg.get("caption") or "")
    if notice is None:
        return "not_a_payment"
    if db.query(PaymentNotification.id).filter_by(trx_id=notice.trx).first() or \
            db.query(Payment.id).filter(Payment.reference == f"ABA {notice.trx}").first():
        return "duplicate"
    received_at = datetime.fromtimestamp(msg.get("date") or utcnow().timestamp(), tz=timezone.utc)
    who = tg.e(notice.payer) + (f" ({tg.e(notice.account)})" if notice.account else "")
    found = candidates(db, notice, received_at)

    try:
        if len(found) == 1:
            order, pay = found[0]
            _log(db, notice, msg, received_at, "matched", pay.id, f"Matched {order.order_number}")
            svc.mark_paid(db, order, pay, source="payway", reference=f"ABA {notice.trx}", label="payway-listener",
                          gateway={"source": "payway_telegram", "payer": notice.payer, "account": notice.account,
                                   "amount": notice.amount, "currency": notice.currency, "trx": notice.trx,
                                   "apv": notice.apv, "received_at": received_at.isoformat()},
                          note=f"Paid {_money(notice)} by {notice.payer} · ABA Trx {notice.trx}")
            db.commit()
            svc.after_commit_paid(db)
            return "matched"

        named = set(ORDER_NO.findall(notice.text or ""))
        if not found and named:
            _log(db, notice, msg, received_at, "wrong_amount", detail=f"Mentions {', '.join(sorted(named))}")
            notify.payment_unmatched(db, f"⚠️ <b>Payment amount does not match</b>\n{_money(notice)} from {who} "
                                         f"mentions {tg.e(', '.join(sorted(named)))}, but that order expects a different "
                                         f"amount. Nothing was confirmed. ABA Trx {tg.e(notice.trx)}\n"
                                         "Check it in the admin Payments page.")
            db.commit()
            return "wrong_amount"

        if len(found) > 1:
            _log(db, notice, msg, received_at, "ambiguous",
                 detail="Candidates: " + ", ".join(o.order_number for o, _ in found))
            lines = "\n".join(f"• {tg.e(o.order_number)} · {tg.e(o.contact_name)}" for o, _ in found)
            notify.payment_unmatched(
                db, f"⚠️ <b>{_money(notice)} received from {who}</b>, but {len(found)} orders wait for that exact "
                    f"amount, so I didn't guess.\n{lines}\nABA Trx {tg.e(notice.trx)}\nPress the right order:",
                buttons=[[{"text": f"Confirm {o.order_number}", "callback_data": f"pay:ok:{p.id}:{notice.trx}"}]
                         for o, p in found])
            db.commit()
            return "ambiguous"

        _log(db, notice, msg, received_at, "unmatched")
        notify.payment_unmatched(db, f"ℹ️ <b>{_money(notice)} received from {who}</b>, but no pending TicketNest "
                                     f"order matches it (ABA Trx {tg.e(notice.trx)}). If it belongs to an order, "
                                     "confirm it from the admin Payments page.")
        db.commit()
        return "unmatched"
    except svc.AlreadyUsed:
        db.rollback()
        return "duplicate"
    except IntegrityError:
        db.rollback()   # the same Trx ID arrived twice at the same moment: the UNIQUE trx_id stopped it
        return "duplicate"
    except Exception as ex:  # an order changed state between matching and confirming
        db.rollback()
        log.warning("PayWay match for Trx %s could not be applied: %s", notice.trx, ex)
        try:
            _log(db, notice, msg, received_at, "late", detail=str(getattr(ex, "detail", ex))[:400])
            notify.payment_unmatched(db, f"⚠️ <b>{_money(notice)} from {who}</b> (ABA Trx {tg.e(notice.trx)}) matched "
                                         f"an order that can't take it any more: {tg.e(getattr(ex, 'detail', ex))}. "
                                         "Refund or resolve it manually.")
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
        return "late"


def resolve_manually(db: Session, payment: Payment, trx: str, actor, label: str) -> None:
    """Admin picked the order for an ambiguous/unmatched ABA transaction (Telegram button or admin page)."""
    trx = re.sub(r"\D", "", trx or "")
    if not trx:
        from fastapi import HTTPException
        raise HTTPException(400, "Enter the ABA transaction ID (numbers only)")
    order = payment.order
    note_row = db.query(PaymentNotification).filter_by(trx_id=trx).first()
    if note_row and note_row.payment_id and note_row.outcome in ("matched", "resolved_manual"):
        raise svc.AlreadyUsed(trx)
    if note_row and (note_row.amount != payment.amount or note_row.currency != payment.currency):
        from fastapi import HTTPException
        raise HTTPException(400, "That transaction's amount is different from this order's QR amount")
    svc.mark_paid(db, order, payment, source="admin", reference=f"ABA {trx}", actor=actor, label=label,
                  note=f"Confirmed manually by {label} · ABA Trx {trx}")
    if note_row:
        note_row.outcome = "resolved_manual"
        note_row.payment_id = payment.id
        note_row.detail = f"Assigned to {order.order_number} by {label}"


def check_bakong(db: Session, order: Order, pay: Payment) -> bool:
    """Ask the Bakong Open API if this QR (md5) was paid. True when it confirmed the order."""
    from app.services import khqr
    if not settings.BAKONG_API_TOKEN or not pay.khqr_md5 or pay.status not in (PaymentStatus.pending,):
        return False
    res = khqr.check_payment(pay.khqr_md5)
    if not res["paid"]:
        return False
    data = res["data"] or {}
    ref = data.get("externalRef") or data.get("hash") or pay.khqr_md5
    try:
        svc.mark_paid(db, order, pay, source="bakong", reference=f"BAKONG {ref}"[:80], label="bakong-api",
                      gateway={"source": "bakong", "data": data})
        db.commit()
        svc.after_commit_paid(db)
        return True
    except (svc.AlreadyUsed, IntegrityError):
        db.rollback()
        return False
