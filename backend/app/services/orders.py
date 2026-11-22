"""Order lifecycle: checkout -> KHQR -> verified payment -> manual Telegram delivery -> completed.

  awaiting_payment --(verified payment)--> paid --> preparing --> awaiting_delivery --> delivered --> completed
         |                                   \\__________ refund (admin) ___________/        |
         +--(QR expired / cancelled)--> cancelled                                     refunded

Only `mark_paid()` can move an order out of awaiting_payment, and it is only called by:
  * the PayWay matcher (services/payway.py) for a genuine ABA notification,
  * the Bakong Open API md5 check (if configured),
  * an admin who records the bank transaction reference by hand.
The browser can never mark anything paid.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (PUBLIC_LISTING, ConcertStatus, InventoryReservation, Invoice, Order, OrderEvent, OrderItem,
                        OrderStatus, Payment, PaymentStatus, ReservationStatus, TicketDelivery, TicketListing, User)
from app.services import audit, inventory, khqr, notify, wallet
from app.services.pricing import quote_for
from app.services.settings_store import get_setting
from app.utils import as_aware, usd_to_khr, utcnow

log = logging.getLogger("ticketnest.orders")
S = OrderStatus
MAX_OPEN_ORDERS = 3          # unpaid checkouts one buyer may hold at once (stops ticket hoarding)
MAX_PER_ORDER = 10

NEXT: dict[OrderStatus, set[OrderStatus]] = {
    S.paid: {S.preparing, S.awaiting_delivery, S.delivered},
    S.preparing: {S.awaiting_delivery, S.delivered},
    S.awaiting_delivery: {S.delivered, S.preparing},
    S.delivered: {S.completed},
}
REFUNDABLE = {S.paid, S.preparing, S.awaiting_delivery, S.delivered, S.completed}


def access_token(order_number: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), f"order:{order_number}".encode(), hashlib.sha256).hexdigest()[:32]


def order_url(order: Order) -> str:
    return f"{settings.SITE_URL.rstrip('/')}/orders/{order.order_number}"


def event(order: Order, status: str, note: str = "", actor: User | None = None) -> None:
    order.events.append(OrderEvent(status=status, note=note[:500], actor_id=actor.id if actor else None))


def active_payment(order: Order) -> Payment | None:
    for p in reversed(order.payments):
        if p.status == PaymentStatus.pending:
            return p
    return None


# ---------------------------------------------------------------- checkout
def create_order(db: Session, buyer: User, *, listing_id: int, quantity: int, contact: dict, channel: str,
                 idempotency_key: str) -> Order:
    existing = db.query(Order).filter_by(buyer_id=buyer.id, idempotency_key=idempotency_key).first()
    if existing:
        return existing  # double tap / retry: same order, never a second reservation

    pay_cfg = get_setting(db, "payments")
    if not (pay_cfg["khqr_enabled"] and pay_cfg["khqr_template"]):
        raise HTTPException(503, "Online payment is not set up yet. Please contact support.")
    if not 1 <= quantity <= MAX_PER_ORDER:
        raise HTTPException(400, f"You can buy 1 to {MAX_PER_ORDER} tickets per order")

    open_orders = db.query(Order).filter(Order.buyer_id == buyer.id, Order.status == S.awaiting_payment).count()
    if open_orders >= MAX_OPEN_ORDERS:
        raise HTTPException(429, "You already have unpaid orders. Pay or cancel them before starting a new one.")

    listing = db.get(TicketListing, listing_id)
    if listing is None or listing.status not in PUBLIC_LISTING:
        raise HTTPException(404, "This listing is no longer on sale")
    if listing.seller_id == buyer.id:
        raise HTTPException(400, "You can't buy your own tickets")
    concert = listing.concert
    if concert.status in (ConcertStatus.cancelled, ConcertStatus.completed) or not concert.is_published \
            or as_aware(concert.starts_at) < utcnow():
        raise HTTPException(400, "Tickets for this concert can no longer be bought")

    inventory.reserve(db, listing, quantity)          # atomic: raises 409 if someone else got them first
    q = quote_for(db, listing.price_cents, quantity)
    minutes = int(pay_cfg["qr_expiry_minutes"])
    rate = int(get_setting(db, "currency")["khr_rate"])
    order = Order(order_number=audit.next_number(db, "TN"), buyer_id=buyer.id, channel=channel,
                  idempotency_key=idempotency_key, contact_name=contact["name"], contact_email=contact.get("email") or "",
                  contact_phone=contact.get("phone") or "", contact_telegram=contact.get("telegram") or "",
                  subtotal_cents=q.subtotal_cents, markup_cents=q.markup_cents, total_cents=q.total_cents,
                  commission_cents=q.commission_cents, seller_payout_cents=q.seller_payout_cents,
                  markup_bps=q.markup_bps, commission_bps=q.commission_bps, khr_rate=rate,
                  expires_at=utcnow() + timedelta(minutes=minutes))
    order.items.append(OrderItem(
        listing_id=listing.id, seller_id=listing.seller_id, concert_title=concert.title, artist_name=concert.artist.name,
        category_name=listing.category.name, concert_starts_at=concert.starts_at,
        venue=f"{concert.venue}, {concert.city}, {concert.country}", seat_info=listing.seat_info, quantity=quantity,
        unit_price_cents=q.unit_price_cents, unit_markup_cents=q.unit_markup_cents,
        unit_total_cents=q.unit_total_cents))
    order.reservations.append(InventoryReservation(listing_id=listing.id, quantity=quantity,
                                                   expires_at=order.expires_at))
    db.add(order)
    db.flush()
    _new_khqr(db, order, pay_cfg, minutes)
    event(order, "created", f"Checkout started ({channel})", buyer)
    audit.log(db, "order.create", "order", order.id, actor=buyer,
              data={"listing_id": listing.id, "qty": quantity, "total_cents": q.total_cents})
    notify.new_purchase(db, order)
    return order


def _new_khqr(db: Session, order: Order, pay_cfg: dict, minutes: int) -> Payment:
    cur = "KHR" if pay_cfg.get("khqr_currency") == "KHR" else "USD"
    amount = order.total_cents if cur == "USD" else usd_to_khr(order.total_cents, order.khr_rate)
    from decimal import Decimal
    qr_amount = Decimal(amount) / 100 if cur == "USD" else Decimal(amount)
    payload = khqr.build_from_template(pay_cfg["khqr_template"], amount=qr_amount, currency=cur,
                                       bill_number=order.order_number, expiry_minutes=minutes)
    p = Payment(method="khqr", amount=amount, currency=cur, bill_number=order.order_number, khqr_payload=payload,
                khqr_md5=khqr.md5(payload), expires_at=order.expires_at)
    order.payments.append(p)
    db.flush()
    return p


# ---------------------------------------------------------------- payment verified
class AlreadyUsed(Exception):
    """This bank transaction reference was already used for a payment."""


def mark_paid(db: Session, order: Order, payment: Payment, *, source: str, reference: str,
              actor: User | None = None, label: str = "", gateway: dict | None = None, note: str = "") -> None:
    """Verified money -> PAID. Idempotent and safe to call from the listener, Bakong check or admin.

    * `reference` (e.g. "ABA 179468810879402") is UNIQUE on payments: one bank transaction can
      confirm one payment only, ever.
    * The order row is moved with a conditional UPDATE (status must still be awaiting_payment,
      or cancelled by expiry for late money), so two confirmations can't both win.
    """
    db.refresh(order)
    if order.status not in (S.awaiting_payment, S.cancelled):
        raise HTTPException(409, f"Order {order.order_number} is already {order.status.value}")
    if order.status == S.cancelled and not order.cancel_reason.startswith("Payment time expired"):
        raise HTTPException(409, f"Order {order.order_number} was cancelled")
    if db.query(Payment.id).filter(Payment.reference == reference).first():
        raise AlreadyUsed(reference)

    was = order.status
    res = db.execute(update(Order).where(Order.id == order.id, Order.status == was)
                     .values(status=S.paid, paid_at=utcnow()).execution_options(synchronize_session=False))
    if res.rowcount != 1:
        raise HTTPException(409, "Order changed while confirming payment")
    db.refresh(order)

    payment.status = PaymentStatus.verified
    payment.reference = reference
    payment.verified_at = utcnow()
    payment.verification_source = source
    payment.verified_by_id = actor.id if actor else None
    payment.gateway_response = gateway
    payment.note = note[:500]
    try:
        db.flush()
    except IntegrityError as e:
        raise AlreadyUsed(reference) from e
    for other in order.payments:
        if other is not payment and other.status == PaymentStatus.pending:
            other.status = PaymentStatus.failed
            other.note = "Superseded by the verified payment"

    for r in order.reservations:
        inventory.commit(db, r)   # late payment on an expired hold: takes the tickets again only if still free
    order.expires_at = None
    order.cancel_reason = ""
    order.cancelled_at = None
    if not order.invoice:
        db.add(Invoice(order_id=order.id, invoice_number=audit.next_number(db, "INV"), total_cents=order.total_cents))
    wallet.credit_pending(db, order)
    event(order, "paid", note or f"Payment verified ({source}) · {reference}", actor)
    audit.log(db, "payment.verified", "order", order.id, actor=actor, label=label or source,
              data={"reference": reference, "amount": payment.amount, "currency": payment.currency})
    db.flush()
    db.refresh(order)
    notify.payment_verified(db, order, source)
    notify.customer_order_update(db, order, "paid")
    db.info.setdefault("after_paid", []).append(order.id)


def after_commit_paid(db: Session) -> None:
    """Call after db.commit() when mark_paid ran: emails the confirmation with the PDF invoice."""
    from app.services import email as mail
    from app.services.invoice_pdf import build
    for oid in db.info.pop("after_paid", []):
        order = db.get(Order, oid)
        if not order:
            continue
        try:
            pdf = build(order, get_setting(db, "site")["name"])
        except Exception:  # noqa: BLE001 - never lose the confirmation email because of the PDF
            log.exception("Invoice PDF failed for %s", order.order_number)
            pdf = None
        mail.send_payment_confirmed(order, pdf)
        mail.send_ticket_sold(order)


# ---------------------------------------------------------------- expiry / cancel / refund
def grace(db: Session) -> timedelta:
    return timedelta(minutes=int(get_setting(db, "payments")["grace_minutes"]))


def expire_due(db: Session) -> int:
    """Release tickets held by unpaid orders whose QR expired (after the grace period). Returns count."""
    cutoff = utcnow() - grace(db)
    due = db.query(Order).filter(Order.status == S.awaiting_payment, Order.expires_at.isnot(None),
                                 Order.expires_at < cutoff).limit(200).all()
    n = 0
    for order in due:
        pay = active_payment(order)
        if pay and pay.khqr_md5 and settings.BAKONG_API_TOKEN:
            from app.services import payway
            if payway.check_bakong(db, order, pay):
                continue
        _cancel_unpaid(db, order, "Payment time expired", payment_status=PaymentStatus.expired)
        notify.payment_expired(db, order)
        notify.customer_order_update(db, order, "expired")
        n += 1
    if n:
        db.commit()
    return n


def _cancel_unpaid(db: Session, order: Order, reason: str, *, payment_status: PaymentStatus,
                   actor: User | None = None) -> None:
    res = db.execute(update(Order).where(Order.id == order.id, Order.status == S.awaiting_payment)
                     .values(status=S.cancelled, cancelled_at=utcnow(), cancel_reason=reason[:300])
                     .execution_options(synchronize_session=False))
    if res.rowcount != 1:
        raise HTTPException(409, "This order is no longer awaiting payment")
    db.refresh(order)
    for p in order.payments:
        if p.status == PaymentStatus.pending:
            p.status = payment_status
    for r in order.reservations:
        inventory.release(db, r)
    event(order, "cancelled", reason, actor)


def cancel_by_buyer(db: Session, order: Order, buyer: User) -> None:
    if order.status != S.awaiting_payment:
        raise HTTPException(400, "Only unpaid orders can be cancelled here. Contact support for help.")
    _cancel_unpaid(db, order, "Cancelled by buyer", payment_status=PaymentStatus.failed, actor=buyer)
    audit.log(db, "order.cancel", "order", order.id, actor=buyer)


def cancel_by_admin(db: Session, order: Order, admin: User, reason: str) -> None:
    if order.status != S.awaiting_payment:
        raise HTTPException(400, "Paid orders are refunded, not cancelled")
    _cancel_unpaid(db, order, reason or "Cancelled by TicketNest", payment_status=PaymentStatus.failed, actor=admin)
    audit.log(db, "order.cancel", "order", order.id, actor=admin, data={"reason": reason})
    notify.payment_failed(db, order, f"Cancelled by {admin.full_name}: {reason}")
    notify.customer_order_update(db, order, "cancelled")
    from app.services import email as mail
    mail.send_cancelled(order, refunded=False)


def refund(db: Session, order: Order, admin: User, reason: str, restock: bool) -> None:
    """Manual refund: the owner sends the money back from the bank app, then records it here."""
    if order.status not in REFUNDABLE:
        raise HTTPException(400, f"A {order.status.value} order can't be refunded")
    wallet.reverse(db, order, admin)          # raises if the seller already withdrew the money
    if restock:
        for it in order.items:
            inventory.restock_sold(db, it.listing_id, it.quantity)
    for p in order.payments:
        if p.status == PaymentStatus.verified:
            p.status = PaymentStatus.refunded
    order.status = S.refunded
    order.cancel_reason = reason[:300]
    order.cancelled_at = utcnow()
    event(order, "refunded", reason + (" · tickets put back on sale" if restock else ""), admin)
    audit.log(db, "order.refund", "order", order.id, actor=admin, data={"reason": reason, "restock": restock})
    notify.customer_order_update(db, order, "refunded")
    from app.services import email as mail
    mail.send_cancelled(order, refunded=True)


# ---------------------------------------------------------------- delivery
def set_status(db: Session, order: Order, new: OrderStatus, admin: User | None, note: str = "", label: str = "") -> None:
    if new == order.status:
        return
    if new not in NEXT.get(order.status, set()):
        raise HTTPException(400, f"Can't move an order from {order.status.value} to {new.value}")
    if new == S.delivered:
        raise HTTPException(400, "Use the delivery form to mark an order delivered")
    order.status = new
    if new == S.completed:
        order.completed_at = utcnow()
    event(order, new.value, note, admin)
    audit.log(db, "order.status", "order", order.id, actor=admin, label=label, data={"status": new.value})


def deliver(db: Session, order: Order, admin: User | None, *, method: str = "telegram", reference: str = "",
            file: tuple[str, str, str] | None = None, label: str = "") -> TicketDelivery:
    """Admin sent the ticket by hand (Telegram) and records it. Releases the seller's earnings."""
    if order.status not in (S.paid, S.preparing, S.awaiting_delivery):
        raise HTTPException(400, f"A {order.status.value} order can't be marked delivered")
    d = order.delivery or TicketDelivery(order_id=order.id)
    d.method = method[:40] or "telegram"
    d.reference = reference[:2000]
    d.delivered_at = utcnow()
    d.admin_id = admin.id if admin else None
    if file:
        d.file_key, d.file_name, d.file_type = file
    db.add(d)
    order.status = S.delivered
    order.delivered_at = utcnow()
    who = admin.full_name if admin else label
    event(order, "delivered", f"Delivered via {d.method} by {who}" + (f" · {reference}" if reference else ""), admin)
    wallet.release(db, order, admin)
    audit.log(db, "order.deliver", "order", order.id, actor=admin, label=label, data={"method": d.method})
    notify.customer_order_update(db, order, "delivered")
    from app.services import email as mail
    mail.send_delivered(order)
    db.flush()
    return d


def reservation_seconds_left(order: Order) -> int:
    if order.status != S.awaiting_payment or not order.expires_at:
        return 0
    return max(0, int((as_aware(order.expires_at) - utcnow()).total_seconds()))


__all__ = ["create_order", "mark_paid", "AlreadyUsed", "expire_due", "refund", "deliver", "set_status",
           "cancel_by_buyer", "cancel_by_admin", "ReservationStatus"]
