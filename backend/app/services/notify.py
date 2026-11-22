"""Business notifications: admin alerts to the Telegram admin group, and order updates to customers
who opened the TicketNest bot (Telegram only lets a bot message people who pressed Start).

These are only messages. Pressing a button in Telegram goes back through routers/telegram.py, which
checks the presser's Telegram ID against TELEGRAM_ADMIN_ID before anything changes.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, TelegramUser, TicketListing, User, WithdrawalRequest
from app.services import telegram as tg
from app.services.settings_store import get_setting
from app.utils import fmt_local, fmt_usd2, utcnow

e = tg.e


def _site(db: Session) -> str:
    return get_setting(db, "site")["name"].upper()


def _admin_link(path: str) -> str:
    base = settings.SITE_URL.rstrip("/")
    return f'\n<a href="{e(base)}/admin{path}">Open in admin</a>' if base.startswith("https://") else ""


def _listing_line(listing: TicketListing) -> str:
    return (f"Concert: {e(listing.concert.title)}\nCategory: {e(listing.category.name)}\n"
            f"Quantity: {listing.quantity}\nListing Price: {fmt_usd2(listing.price_cents)} each")


# ---------------------------------------------------------------- admin alerts
def new_registration(db: Session, user: User, method: str) -> None:
    who = user.email or (f"@{user.telegram_username}" if user.telegram_username else f"Telegram {user.telegram_id}")
    tg.queue_admin(db, f"👤 <b>{_site(db)} — NEW CUSTOMER</b>\nName: {e(user.full_name)}\nAccount: {e(who)}\n"
                       f"Signed up with: {e(method)}", kind="registration")


def listing_buttons(listing_id: int) -> list[list[dict]]:
    return [[{"text": "✅ Approve", "callback_data": f"lst:ok:{listing_id}"},
             {"text": "❌ Reject", "callback_data": f"lst:no:{listing_id}"}],
            [{"text": "📎 Proof & receipt", "callback_data": f"lst:files:{listing_id}"},
             {"text": "👤 Seller & payout QR", "callback_data": f"lst:seller:{listing_id}"}]]


def new_listing(db: Session, listing: TicketListing) -> None:
    seller = listing.seller.full_name if listing.seller else "TicketNest"
    text = (f"🎫 <b>{_site(db)} — NEW LISTING</b>\nListing: #{listing.id}\nSeller: {e(seller)}\n{_listing_line(listing)}\n"
            f"Original price: {fmt_usd2(listing.original_price_cents)}\nSeat: {e(listing.seat_info or '-')}\n"
            f"Proof files: {len(listing.files)}\nStatus: <b>Pending Approval</b>" + _admin_link(f"/listings/{listing.id}"))
    tg.queue_admin(db, text, kind="listing_new", buttons=listing_buttons(listing.id))


def listing_reviewed(db: Session, listing: TicketListing, approved: bool, by: str) -> None:
    head = "✅ LISTING APPROVED" if approved else "❌ LISTING REJECTED"
    reason = f"\nReason: {e(listing.rejection_reason)}" if not approved and listing.rejection_reason else ""
    tg.queue_admin(db, f"<b>{_site(db)} — {head}</b>\nListing: #{listing.id}\n{_listing_line(listing)}\nBy: {e(by)}{reason}",
                   kind="listing_reviewed")
    if listing.seller:
        msg = (f"✅ Your listing #{listing.id} for <b>{e(listing.concert.title)}</b> ({e(listing.category.name)}) "
               "is approved and now on sale." if approved else
               f"Your listing #{listing.id} for <b>{e(listing.concert.title)}</b> was not approved.{reason}")
        to_user(db, listing.seller, msg, kind="listing_reviewed")


def order_buttons(order_id: int) -> list[list[dict]]:
    return [[{"text": "🧾 View order", "callback_data": f"ord:view:{order_id}"},
             {"text": "👤 Customer", "callback_data": f"ord:cust:{order_id}"},
             {"text": "💳 Payment", "callback_data": f"ord:pay:{order_id}"}]]


def _order_block(db: Session, order: Order) -> str:
    it = order.items[0]
    return (f"Order: <b>{e(order.order_number)}</b>\nConcert: {e(it.concert_title)}\nTicket Category: {e(it.category_name)}\n"
            f"Quantity: {it.quantity}\nSeller Listing Price: {fmt_usd2(it.unit_price_cents)}"
            f"{' each' if it.quantity > 1 else ''}\nBuyer Payment: {fmt_usd2(order.total_cents)}")


def new_purchase(db: Session, order: Order) -> None:
    tg.queue_admin(db, f"🛒 <b>{_site(db)} — NEW PURCHASE</b>\n{_order_block(db, order)}\nPayment Status: AWAITING KHQR\n"
                       f"Customer: {e(order.contact_name)}\nChannel: {e(order.channel)}\n"
                       f"Order Time: {fmt_local(order.created_at or utcnow())}", kind="order_new")


def payment_verified(db: Session, order: Order, source: str) -> None:
    pay = order.payments[-1] if order.payments else None
    tg.queue_admin(db, f"✅ <b>{_site(db)} — NEW ORDER</b>\n{_order_block(db, order)}\nPayment Status: <b>VERIFIED</b> "
                       f"({e(source)})\nPayment Ref: {e(pay.reference if pay else '')}\n"
                       f"Customer: {e(order.contact_name)}\nTelegram: {e('@' + order.contact_telegram if order.contact_telegram else '-')}\n"
                       f"Order Time: {fmt_local(order.created_at)}\n\nNext: contact the buyer on Telegram and send the ticket."
                   + _admin_link(f"/orders/{order.id}"), kind="payment_verified", buttons=order_buttons(order.id)
                   + [[{"text": "📦 Mark delivered", "callback_data": f"ord:deliver:{order.id}"}]])


def payment_failed(db: Session, order: Order, reason: str) -> None:
    tg.queue_admin(db, f"⚠️ <b>{_site(db)} — PAYMENT FAILED</b>\nOrder: {e(order.order_number)}\n{e(reason)}",
                   kind="payment_failed", buttons=order_buttons(order.id))


def payment_expired(db: Session, order: Order) -> None:
    tg.queue_admin(db, f"⌛ <b>{_site(db)} — PAYMENT EXPIRED</b>\nOrder: {e(order.order_number)} · {fmt_usd2(order.total_cents)}\n"
                       f"Customer: {e(order.contact_name)}\nTickets went back on sale.", kind="payment_expired")


def payment_unmatched(db: Session, text: str, buttons: list[list[dict]] | None = None) -> None:
    tg.queue_admin(db, text, kind="payment_unmatched", buttons=buttons)


def withdrawal_requested(db: Session, w: WithdrawalRequest) -> None:
    tg.queue_admin(db, f"💸 <b>{_site(db)} — WITHDRAWAL REQUEST</b>\nRequest: #{w.id}\nSeller: {e(w.user.full_name)}\n"
                       f"Amount: <b>{fmt_usd2(w.amount_cents)}</b>\nTo: {e(w.method)} · {e(w.account_name)} · "
                       f"<code>{e(w.account_number)}</code>\nPay it from your bank app, then mark it paid."
                   + _admin_link("/withdrawals"), kind="withdrawal_new",
                   buttons=[[{"text": "💳 Payout QR", "callback_data": f"wd:qr:{w.id}"},
                             {"text": "✅ Mark as paid", "callback_data": f"wd:paid:{w.id}"}]])


def withdrawal_completed(db: Session, w: WithdrawalRequest, by: str) -> None:
    tg.queue_admin(db, f"✅ <b>{_site(db)} — WITHDRAWAL COMPLETED</b>\nRequest: #{w.id} · {fmt_usd2(w.amount_cents)}\n"
                       f"Seller: {e(w.user.full_name)}\nBy: {e(by)}", kind="withdrawal_done")
    to_user(db, w.user, f"💸 Your withdrawal #{w.id} of <b>{fmt_usd2(w.amount_cents)}</b> has been paid to "
                        f"{e(w.method)} {e(w.account_number)}.", kind="withdrawal_done")


def low_stock(db: Session, listing: TicketListing) -> None:
    threshold = int(get_setting(db, "inventory")["low_stock_threshold"])
    if 0 < listing.available <= threshold:
        key = f"low:{listing.id}:{listing.available}"
        if key in db.info.setdefault("tn_alerted", set()):
            return
        db.info["tn_alerted"].add(key)
        tg.queue_admin(db, f"📉 <b>{_site(db)} — LOW STOCK</b>\n{e(listing.concert.title)} · {e(listing.category.name)}\n"
                           f"Listing #{listing.id}: {listing.available} ticket(s) left", kind="low_stock")


def sold_out(db: Session, listing: TicketListing) -> None:
    tg.queue_admin(db, f"🔥 <b>{_site(db)} — SOLD OUT</b>\n{e(listing.concert.title)} · {e(listing.category.name)}\n"
                       f"Listing #{listing.id} has no tickets left.", kind="sold_out")
    if listing.seller:
        to_user(db, listing.seller, f"🔥 All tickets in your listing #{listing.id} ({e(listing.concert.title)}) are sold.",
                kind="sold_out")


# ---------------------------------------------------------------- customer messages
def to_user(db: Session, user: User | None, text: str, *, kind: str, buttons=None) -> None:
    """DM a customer through the bot, only if they linked Telegram and pressed Start."""
    if not user or not user.telegram_id or not get_setting(db, "telegram").get("customer_updates", True):
        return
    row = db.query(TelegramUser).filter_by(telegram_id=user.telegram_id).first()
    if row and row.can_message:
        tg.queue(db, user.telegram_id, text, kind=f"customer_{kind}", buttons=buttons)


def _support_button(db: Session) -> list[list[dict]] | None:
    name = get_setting(db, "telegram")["delivery_username"]
    return [[{"text": "💬 Message TicketNest", "url": f"https://t.me/{name}"}]] if name else None


def customer_order_update(db: Session, order: Order, kind: str) -> None:
    it = order.items[0]
    texts = {
        "paid": (f"✅ <b>Payment confirmed</b> · {e(order.order_number)}\n{e(it.concert_title)} · {e(it.category_name)} × {it.quantity}\n\n"
                 "Our team will contact you through Telegram to deliver your ticket."),
        "delivered": f"🎫 <b>Ticket delivered</b> · {e(order.order_number)}\nEnjoy the show! Your order history has the details.",
        "cancelled": f"Your order {e(order.order_number)} was cancelled. {e(order.cancel_reason)}",
        "refunded": f"💸 Your order {e(order.order_number)} was refunded. {e(order.cancel_reason)}",
        "expired": f"⌛ The payment time for {e(order.order_number)} ran out, so the tickets were released. You can check out again.",
        "issue_resolved": (f"✅ We checked your report on {e(order.order_number)}: {e(order.issue_resolution)}\n"
                           "Message us if you still need help."),
    }
    if kind in texts:
        to_user(db, order.buyer, texts[kind], kind=f"order_{kind}", buttons=_support_button(db) if kind == "paid" else None)


# ---------------------------------------------------------------- "notify me"
ALERT_GAP_HOURS = 6   # at most one alert per fan per concert in this window


def concert_alerts(db: Session, listing: TicketListing) -> int:
    """A listing just went on sale: tell everyone who tapped 'Notify me' for the concert
    (Telegram DM if they linked the bot, plus email). Returns how many fans were notified."""
    from datetime import timedelta

    from app.models import ConcertAlert
    from app.services import email as mail
    from app.services.pricing import buyer_unit_price
    from app.utils import as_aware
    c = listing.concert
    if not c.is_published or c.is_demo or listing.available <= 0:
        return 0
    now = utcnow()
    price = fmt_usd2(buyer_unit_price(db, listing.price_cents))
    url = f"{settings.SITE_URL.rstrip('/')}/concerts/{c.slug}"
    n = 0
    for a in db.query(ConcertAlert).filter_by(concert_id=c.id).all():
        if a.last_notified_at and as_aware(a.last_notified_at) > now - timedelta(hours=ALERT_GAP_HOURS):
            continue
        if listing.seller_id and a.user_id == listing.seller_id:
            continue
        u = a.user
        if not u or not u.is_active:
            continue
        btn = [[{"text": "🎫 See tickets", "url": url}]] if url.startswith("https://") else None
        to_user(db, u, f"🔔 <b>Tickets on sale</b>\n{e(c.title)}\n{e(listing.category.name)} · {price} each · "
                       f"{listing.available} left", kind="concert_alert", buttons=btn)
        if u.email:
            mail.send_concert_alert(u.email, u.full_name, listing, price)
        a.last_notified_at = now
        n += 1
    return n


# ---------------------------------------------------------------- buyer protection
def order_issue(db: Session, order: Order) -> None:
    from app.services.orders import REPORT_REASONS
    it = order.items[0]
    tg.queue_admin(db, f"🚩 <b>{_site(db)} — BUYER REPORTED A PROBLEM</b>\nOrder: <b>{e(order.order_number)}</b>\n"
                       f"{e(it.concert_title)} · {e(it.category_name)} × {it.quantity}\n"
                       f"Reason: <b>{e(REPORT_REASONS.get(order.issue_reason, order.issue_reason))}</b>\n"
                       f"“{e(order.issue_details[:600])}”\nBuyer: {e(order.contact_name)} · "
                       f"{e('@' + order.contact_telegram if order.contact_telegram else '-')}\n\n"
                       "The seller's payout is frozen until you dismiss the report or refund the buyer."
                   + _admin_link(f"/orders/{order.id}"), kind="order_issue", buttons=order_buttons(order.id))


def buyer_confirmed(db: Session, order: Order) -> None:
    tg.queue_admin(db, f"👍 <b>{_site(db)} — BUYER CONFIRMED RECEIPT</b>\nOrder: {e(order.order_number)} · "
                       f"{e(order.items[0].concert_title)}", kind="buyer_confirmed")


def seller_payout_released(db: Session, order: Order) -> None:
    from app.models import User
    from app.services.wallet import _sellers
    for seller_id, amount in _sellers(order).items():
        to_user(db, db.get(User, seller_id), f"💰 Your earnings of <b>{fmt_usd2(amount)}</b> for {e(order.order_number)} "
                                              "are now available. You can request a withdrawal from your wallet.",
                kind="payout_released")
