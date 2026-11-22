"""TicketNest Telegram bot: webhook (production) or long polling (scripts/bot_polling.py, local).

Who can do what
* Anyone: /start (opens the Mini App, lets the bot send them order updates), /help, /myid.
* Admins - ONLY Telegram user IDs listed in TELEGRAM_ADMIN_ID: /dashboard /orders /listings
  /pending /stock /revenue and every inline button. The check uses the `from.id` that Telegram
  itself puts on the update, and runs on every command and every button press. Being in the admin
  group is not enough. A button pressed by anyone else does nothing.
* Payment confirmation never happens from a chat message typed by a person: only from the PayWay
  matcher (genuine PayWay bot messages) or an admin pressing "Confirm" for a specific ABA Trx ID.
"""

import hmac
import logging
from datetime import timedelta

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (Concert, ListingStatus, Order, OrderStatus, Payment, TelegramUser, TicketListing, User,
                        WithdrawalRequest, WithdrawalStatus)
from app.services import listings as lst, orders as svc, payway, wallet
from app.services import notify, telegram as tg
from app.services.settings_store import get_setting
from app.utils import fmt_local, fmt_usd2, utcnow

log = logging.getLogger("ticketnest.bot")
router = APIRouter(prefix="/api/telegram", tags=["Telegram"], include_in_schema=False)
e = tg.e
PAID = (OrderStatus.paid, OrderStatus.preparing, OrderStatus.awaiting_delivery, OrderStatus.delivered,
        OrderStatus.completed)


@router.post("/webhook/{secret}")
async def webhook(secret: str, request: Request, db: Session = Depends(get_db),
                  x_telegram_bot_api_secret_token: str | None = Header(None)):
    expected = tg.webhook_secret()
    if not (hmac.compare_digest(secret, expected) and hmac.compare_digest(x_telegram_bot_api_secret_token or "", expected)):
        return {"ok": True}  # silently ignore anything that isn't Telegram calling our webhook
    try:
        update = await request.json()
    except Exception:  # noqa: BLE001
        return {"ok": True}
    handle_update(db, update)
    return {"ok": True}


def handle_update(db: Session, update: dict) -> None:
    try:
        if "callback_query" in update:
            _button(db, update["callback_query"])
        elif "message" in update or "channel_post" in update:
            msg = update.get("message") or update.get("channel_post")
            chat = msg.get("chat") or {}
            if str(chat.get("id")) == settings.TELEGRAM_PAYMENT_GROUP_ID.strip():
                payway.handle(db, msg)            # PayWay channel posts (a channel's posts DO reach bots)
            if (msg.get("text") or "").startswith("/"):
                _command(db, msg)
        elif "my_chat_member" in update:
            m = update["my_chat_member"]
            if (m.get("chat") or {}).get("type") == "private":
                blocked = (m.get("new_chat_member") or {}).get("status") == "kicked"
                _remember(db, m.get("from") or {}, can_message=not blocked)
                db.commit()
    except Exception:  # noqa: BLE001 - always answer 200 so Telegram doesn't retry forever
        log.exception("Telegram update failed")
        db.rollback()


def _reply(chat_id, text: str, buttons=None) -> None:
    tg.send_now(chat_id, text, buttons)


def _remember(db: Session, frm: dict, *, can_message: bool) -> None:
    if not frm.get("id") or frm.get("is_bot"):
        return
    row = db.query(TelegramUser).filter_by(telegram_id=int(frm["id"])).first()
    if not row:
        row = TelegramUser(telegram_id=int(frm["id"]))
        db.add(row)
    row.username = (frm.get("username") or "")[:64]
    row.first_name = (frm.get("first_name") or "")[:120]
    row.can_message = can_message
    linked = db.query(User).filter_by(telegram_id=int(frm["id"])).first()
    if linked:
        row.user_id = linked.id


def _actor(db: Session, tid: int) -> tuple[User | None, str]:
    u = db.query(User).filter(User.telegram_id == tid).first()
    return (u if u and u.is_staff else None), f"telegram:{tid}"


def _app_button() -> list[list[dict]] | None:
    base = settings.SITE_URL.rstrip("/")
    if base.startswith("https://"):
        return [[{"text": "🎫 Open TicketNest", "web_app": {"url": f"{base}/tg"}}]]
    return None


# ---------------------------------------------------------------- commands
def _command(db: Session, msg: dict) -> None:
    chat = msg.get("chat") or {}
    frm = msg.get("from") or {}
    text = (msg.get("text") or "").strip()
    cmd = text.split()[0].split("@")[0].lower()
    cid = chat.get("id")
    private = chat.get("type") == "private"

    if cmd == "/groupid" and not private:
        here = str(cid) == settings.TELEGRAM_PAYMENT_GROUP_ID.strip()
        _reply(cid, f"This {e(chat.get('type'))} ID is <code>{e(cid)}</code>."
               + ("\nThis is the payment group." if here else ""))
        return
    if cmd == "/myid":
        _reply(cid, f"Your Telegram user ID is <code>{e(frm.get('id'))}</code>.")
        return
    if cmd == "/start" and private:
        _remember(db, frm, can_message=True)
        db.commit()
        site = get_setting(db, "site")["name"]
        extra = "\n\n🛠 You are a TicketNest admin. Try /dashboard or /help." if tg.is_admin(frm.get("id")) else ""
        _reply(cid, f"👋 Welcome to <b>{e(site)}</b> — buy and sell K-pop concert tickets safely.\n\n"
                    "Tap the button to open the marketplace. I'll message you here about your orders "
                    "and listings." + extra, _app_button())
        return
    if cmd == "/help":
        base = "Commands: /start opens TicketNest · /myid shows your Telegram ID."
        if tg.is_admin(frm.get("id")):
            base += ("\n\n<b>Admin</b>\n/dashboard – today at a glance\n/orders – latest orders\n"
                     "/listings – listings awaiting approval\n/pending – everything waiting for you\n"
                     "/stock – tickets on sale\n/revenue – revenue summary\n/groupid – (in a group) its ID")
        _reply(cid, base)
        return

    if cmd not in ("/dashboard", "/orders", "/listings", "/pending", "/stock", "/revenue"):
        return
    if not tg.is_admin(frm.get("id")):
        _reply(cid, "⛔ This command is for TicketNest admins only.")
        log.warning("Non-admin %s tried %s", frm.get("id"), cmd)
        return
    {"/dashboard": _dashboard, "/orders": _orders, "/listings": _listings, "/pending": _pending,
     "/stock": _stock, "/revenue": _revenue}[cmd](db, cid)


def _sum_paid(db: Session, since=None) -> tuple[int, int, int]:
    q = db.query(func.coalesce(func.sum(Order.total_cents), 0),
                 func.coalesce(func.sum(Order.markup_cents + Order.commission_cents), 0), func.count(Order.id)) \
        .filter(Order.status.in_(PAID))
    if since:
        q = q.filter(Order.paid_at >= since)
    a, b, c = q.one()
    return int(a), int(b), int(c)


def _dashboard(db: Session, cid) -> None:
    day = _sum_paid(db, utcnow() - timedelta(days=1))
    to_deliver = db.query(Order).filter(Order.status.in_([OrderStatus.paid, OrderStatus.preparing,
                                                          OrderStatus.awaiting_delivery])).count()
    _reply(cid, f"📊 <b>TicketNest · last 24 h</b>\nPaid orders: {day[2]}\nSales: {fmt_usd2(day[0])}\n"
                f"Platform revenue: {fmt_usd2(day[1])}\n\n"
                f"Awaiting payment: {db.query(Order).filter_by(status=OrderStatus.awaiting_payment).count()}\n"
                f"To deliver: <b>{to_deliver}</b>\n"
                f"Listings to review: <b>{db.query(TicketListing).filter_by(status=ListingStatus.pending).count()}</b>\n"
                f"Withdrawals to pay: <b>{db.query(WithdrawalRequest).filter_by(status=WithdrawalStatus.pending).count()}</b>")


def _orders(db: Session, cid) -> None:
    rows = db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    if not rows:
        _reply(cid, "No orders yet.")
        return
    for o in rows:
        it = o.items[0]
        _reply(cid, f"<b>{e(o.order_number)}</b> · {e(o.status.value.replace('_', ' '))}\n{e(it.concert_title)} · "
                    f"{e(it.category_name)} × {it.quantity}\n{fmt_usd2(o.total_cents)} · {e(o.contact_name)} · "
                    f"{fmt_local(o.created_at)}", notify.order_buttons(o.id))


def _listings(db: Session, cid) -> None:
    rows = db.query(TicketListing).filter_by(status=ListingStatus.pending).order_by(TicketListing.id).limit(10).all()
    if not rows:
        _reply(cid, "✅ No listings are waiting for approval.")
        return
    for l in rows:
        _reply(cid, f"🎫 <b>Listing #{l.id}</b> · {e(l.seller.full_name if l.seller else 'TicketNest')}\n"
                    f"{e(l.concert.title)} · {e(l.category.name)}\n{l.quantity} × {fmt_usd2(l.price_cents)} "
                    f"(face value {fmt_usd2(l.original_price_cents)})\nSeat: {e(l.seat_info or '-')} · "
                    f"{len(l.files)} proof file(s) — open the admin page to view them.",
               notify.listing_buttons(l.id))


def _pending(db: Session, cid) -> None:
    _listings(db, cid)
    for w in db.query(WithdrawalRequest).filter_by(status=WithdrawalStatus.pending).limit(10).all():
        _reply(cid, f"💸 <b>Withdrawal #{w.id}</b> · {fmt_usd2(w.amount_cents)}\n{e(w.user.full_name)} → {e(w.method)} "
                    f"{e(w.account_name)} <code>{e(w.account_number)}</code>",
               [[{"text": "✅ Mark as paid", "callback_data": f"wd:paid:{w.id}"}]])
    for o in db.query(Order).filter(Order.status.in_([OrderStatus.paid, OrderStatus.preparing,
                                                      OrderStatus.awaiting_delivery])).limit(10).all():
        _reply(cid, f"📦 <b>To deliver: {e(o.order_number)}</b>\n{e(o.items[0].concert_title)} × {o.items[0].quantity}\n"
                    f"Buyer: {e(o.contact_name)} · @{e(o.contact_telegram)}",
               notify.order_buttons(o.id) + [[{"text": "📦 Mark delivered", "callback_data": f"ord:deliver:{o.id}"}]])


def _stock(db: Session, cid) -> None:
    L = TicketListing
    rows = (db.query(Concert.title, func.sum(L.quantity - L.quantity_reserved - L.quantity_sold), func.count(L.id))
            .join(L, L.concert_id == Concert.id).filter(L.status == ListingStatus.available, Concert.starts_at >= utcnow())
            .group_by(Concert.title).order_by(Concert.title).all())
    if not rows:
        _reply(cid, "No tickets are on sale right now.")
        return
    _reply(cid, "🎟 <b>On sale</b>\n" + "\n".join(f"• {e(t)}: {int(n or 0)} ticket(s) in {c} listing(s)" for t, n, c in rows))


def _revenue(db: Session, cid) -> None:
    lines = []
    for label, days in (("24 h", 1), ("7 days", 7), ("30 days", 30), ("All time", None)):
        total, platform, n = _sum_paid(db, utcnow() - timedelta(days=days) if days else None)
        lines.append(f"<b>{label}</b>: {n} orders · sales {fmt_usd2(total)} · revenue {fmt_usd2(platform)}")
    _reply(cid, "💰 <b>Revenue</b> (paid orders; revenue = buyer fee + seller commission)\n" + "\n".join(lines))


# ---------------------------------------------------------------- buttons
def _button(db: Session, cq: dict) -> None:
    frm = cq.get("from") or {}
    msg = cq.get("message") or {}
    chat_id = (msg.get("chat") or {}).get("id")
    answer = lambda text, alert=False: tg.call("answerCallbackQuery", callback_query_id=cq["id"], text=text[:190],  # noqa: E731
                                               show_alert=alert)
    if not tg.is_admin(frm.get("id")):
        answer("Only TicketNest admins can use these buttons.", True)
        log.warning("Non-admin %s pressed %s", frm.get("id"), cq.get("data"))
        return
    actor, label = _actor(db, int(frm["id"]))
    who = actor.full_name if actor else (frm.get("first_name") or label)
    parts = (cq.get("data") or "").split(":")

    def done(text: str) -> None:
        if chat_id and msg.get("message_id"):
            tg.call("editMessageReplyMarkup", chat_id=chat_id, message_id=msg["message_id"],
                    reply_markup={"inline_keyboard": []})
        _reply(chat_id, text)

    try:
        kind, action, ident = parts[0], parts[1], int(parts[2])
    except (IndexError, ValueError):
        answer("Unknown action")
        return
    from fastapi import HTTPException
    try:
        if kind == "lst":
            l = db.get(TicketListing, ident)
            if not l:
                return answer("Listing not found", True)
            if action == "ok":
                lst.approve(db, l, actor, label=f"{who} ({label})")
                db.commit()
                answer("Approved ✅")
                done(f"✅ Listing #{l.id} approved by {e(who)} and now on sale.")
            elif action == "no":
                lst.reject(db, l, "Ticket proof could not be verified", actor, label=f"{who} ({label})")
                db.commit()
                answer("Rejected")
                done(f"❌ Listing #{l.id} rejected by {e(who)}. Change the reason in the admin page if needed.")
            elif action == "seller":
                s = l.seller
                answer("Seller details below")
                _reply(chat_id, f"👤 <b>Seller of #{l.id}</b>\n{e(s.full_name if s else 'TicketNest')}\n"
                                f"Email: {e(s.email if s else '-')}\nTelegram: @{e(l.contact_telegram)}\n"
                                f"Phone: {e(l.contact_phone or '-')}\nPayout: {e(l.payout_method)} · "
                                f"{e(l.payout_account_name)} · <code>{e(l.payout_account_number)}</code>")
        elif kind == "ord":
            o = db.get(Order, ident)
            if not o:
                return answer("Order not found", True)
            it = o.items[0]
            if action == "view":
                answer(o.status.value)
                _reply(chat_id, f"🧾 <b>{e(o.order_number)}</b> · {e(o.status.value.replace('_', ' '))}\n"
                                f"{e(it.concert_title)}\n{e(it.category_name)} × {it.quantity}"
                                f"{' · ' + e(it.seat_info) if it.seat_info else ''}\n"
                                f"Seller price {fmt_usd2(it.unit_price_cents)} · buyer paid {fmt_usd2(o.total_cents)}\n"
                                f"Invoice: {e(o.invoice.invoice_number if o.invoice else '-')}\nCreated {fmt_local(o.created_at)}")
            elif action == "cust":
                answer("Customer details below")
                _reply(chat_id, f"👤 <b>{e(o.contact_name)}</b>\nTelegram: @{e(o.contact_telegram)}\n"
                                f"Email: {e(o.contact_email or '-')}\nPhone: {e(o.contact_phone or '-')}",
                       [[{"text": "💬 Message buyer", "url": f"https://t.me/{o.contact_telegram}"}]] if o.contact_telegram else None)
            elif action == "pay":
                p = o.payments[-1] if o.payments else None
                answer("Payment details below")
                _reply(chat_id, f"💳 <b>{e(o.order_number)}</b>\nStatus: {e(p.status.value if p else '-')}\n"
                                f"Amount: {e(fmt_usd2(p.amount) if p and p.currency == 'USD' else (str(p.amount) + ' KHR') if p else '-')}\n"
                                f"Reference: {e(p.reference if p and p.reference else '-')}\n"
                                f"Verified: {fmt_local(p.verified_at) if p and p.verified_at else '-'} "
                                f"({e(p.verification_source if p else '')})")
            elif action == "deliver":
                answer("Confirm below")
                _reply(chat_id, f"Did you send the ticket for <b>{e(o.order_number)}</b> to @{e(o.contact_telegram)}?",
                       [[{"text": "✅ Yes, mark delivered", "callback_data": f"ord:deliverok:{o.id}"}]])
            elif action == "deliverok":
                svc.deliver(db, o, actor, method="telegram", reference=f"Marked delivered on Telegram by {who}",
                            label=f"{who} ({label})")
                db.commit()
                answer("Delivered ✅")
                done(f"📦 {e(o.order_number)} marked <b>delivered</b> by {e(who)}. Seller earnings released.")
        elif kind == "wd":
            w = db.get(WithdrawalRequest, ident)
            if not w:
                return answer("Withdrawal not found", True)
            if action == "paid":
                answer("Confirm below")
                _reply(chat_id, f"Did you send <b>{fmt_usd2(w.amount_cents)}</b> to {e(w.method)} "
                                f"<code>{e(w.account_number)}</code> ({e(w.account_name)})?",
                       [[{"text": "✅ Yes, I paid it", "callback_data": f"wd:paidok:{w.id}"}]])
            elif action == "paidok":
                wallet.settle_withdrawal(db, w, paid=True, actor=actor, label=f"{who} ({label})",
                                         note=f"Paid, confirmed on Telegram by {who}")
                notify.withdrawal_completed(db, w, who)
                db.commit()
                answer("Marked paid ✅")
                done(f"💸 Withdrawal #{w.id} marked <b>paid</b> by {e(who)}.")
        elif kind == "pay" and action == "ok":
            trx = parts[3] if len(parts) > 3 else ""
            p = db.get(Payment, ident)
            if not p:
                return answer("Payment not found", True)
            payway.resolve_manually(db, p, trx, actor, f"{who} ({label})")
            db.commit()
            svc.after_commit_paid(db)
            answer("Payment confirmed ✅")
            done(f"✅ ABA Trx {e(trx)} assigned to <b>{e(p.order.order_number)}</b> by {e(who)}. Order is PAID.")
        else:
            answer("Unknown action")
    except svc.AlreadyUsed:
        db.rollback()
        answer("That transaction was already used.", True)
    except HTTPException as ex:
        db.rollback()
        answer(str(ex.detail), True)
