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
from datetime import timedelta

from app.utils import as_aware, iso, usd_to_khr, utcnow

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
    if order.issue_status == "open":
        order.issue_status, order.issue_resolved_at = "resolved", utcnow()
        order.issue_resolution = f"Refunded: {reason}"[:300]
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
            file: tuple[str, str, str] | None = None, label: str = "", notify_buyer: bool = True) -> TicketDelivery:
    """Admin sent the ticket by hand (Telegram) and records it. The seller's earnings are scheduled for
    release after the concert (buyer protection), or released now if the concert is already over."""
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
    schedule_payout(db, order, admin, label=label)
    audit.log(db, "order.deliver", "order", order.id, actor=admin, label=label, data={"method": d.method})
    if notify_buyer:
        notify.customer_order_update(db, order, "delivered")
        from app.services import email as mail
        mail.send_delivered(order)
    db.flush()
    return d


# ---------------------------------------------------------------- buyer protection
REPORT_REASONS = {
    "not_received": "Ticket not received",
    "invalid": "Ticket didn't work / entry refused",
    "wrong": "Wrong seat, category or quantity",
    "other": "Other problem",
}
OPEN_FOR_REPORT = (S.paid, S.preparing, S.awaiting_delivery, S.delivered, S.completed)


def event_start(order: Order):
    starts = [as_aware(it.concert_starts_at) for it in order.items if it.concert_starts_at]
    return min(starts) if starts else None


def payout_due_at(db: Session, order: Order):
    cfg = get_setting(db, "protection")
    start = event_start(order)
    if not cfg.get("hold_until_after_event", True) or not start:
        return utcnow()
    return start + timedelta(hours=int(cfg.get("payout_hold_hours", 48)))


def report_deadline(db: Session, order: Order):
    start = event_start(order)
    if not start:
        return None
    return start + timedelta(hours=int(get_setting(db, "protection").get("report_window_hours", 48)))


def schedule_payout(db: Session, order: Order, actor: User | None = None, label: str = "") -> None:
    """Called when the ticket is delivered: release now if the hold is already over, else at the due time."""
    due = payout_due_at(db, order)
    order.payout_release_at = due
    if due <= utcnow() and order.issue_status != "open":
        release_payout(db, order, actor, label=label)


def release_payout(db: Session, order: Order, actor: User | None = None, label: str = "", early: bool = False) -> None:
    if order.payout_released_at:
        return
    if order.issue_status == "open":
        raise HTTPException(409, "The buyer reported a problem with this order. Resolve it first.")
    if order.status not in (S.delivered, S.completed):
        raise HTTPException(400, "Only delivered orders can be paid out")
    wallet.release(db, order, actor, note=f"{order.order_number} released" + (" early by admin" if early else " after the event"))
    order.payout_released_at = utcnow()
    if order.status == S.delivered:
        order.status, order.completed_at = S.completed, utcnow()
    event(order, "payout_released", "Seller earnings released" + (" early by admin" if early else ""), actor)
    audit.log(db, "order.payout_release", "order", order.id, actor=actor, label=label, data={"early": early})
    notify.seller_payout_released(db, order)


def release_due(db: Session) -> int:
    """Background job: release every delivered order whose hold is over and has no open problem report."""
    rows = (db.query(Order).filter(Order.status.in_([S.delivered, S.completed]), Order.payout_released_at.is_(None),
                                   Order.payout_release_at.isnot(None), Order.payout_release_at <= utcnow(),
                                   Order.issue_status != "open").limit(100).all())
    for o in rows:
        try:
            release_payout(db, o, None, label="system")
        except HTTPException as e:
            log.warning("Payout for %s not released: %s", o.order_number, e.detail)
    if rows:
        db.commit()
    return len(rows)


EVIDENCE_REQUIRED = ("invalid", "wrong")   # entry refused / wrong ticket: a photo from the venue is required


def report_problem(db: Session, order: Order, user: User, reason: str, details: str,
                   evidence: list[str] | None = None) -> None:
    """Buyer protection, with rules that stop false claims after the show:
    - problems must be reported at the concert (within the report window after the start), not days later;
    - "entry refused" / "wrong ticket" need a photo taken at the venue;
    - a buyer who confirmed they received the ticket can't later claim it never arrived."""
    if order.status not in OPEN_FOR_REPORT:
        raise HTTPException(400, "This order can't be reported")
    if order.issue_status == "open":
        raise HTTPException(409, "You already reported a problem. Our team is looking into it.")
    deadline = report_deadline(db, order)
    if deadline and utcnow() > deadline:
        raise HTTPException(400, "The time to report a problem for this concert has passed. Problems with entry must be "
                                 "reported at the venue, during the show. Please contact support.")
    if reason == "not_received" and order.buyer_confirmed_at:
        raise HTTPException(400, "You confirmed you received this ticket. If it didn't work, choose "
                                 "\"Ticket didn't work / entry refused\" and add a photo.")
    if reason in EVIDENCE_REQUIRED and not evidence:
        raise HTTPException(422, "Please add at least one photo from the venue (e.g. the gate screen or the ticket "
                                 "error), so we can check it with the seller.")
    order.issue_status, order.issue_reason = "open", reason
    order.issue_details, order.issue_opened_at = details[:2000], utcnow()
    order.issue_evidence = list(evidence or [])[:3]
    order.issue_resolved_at, order.issue_resolution = None, ""
    event(order, "issue_opened", REPORT_REASONS.get(reason, reason) + (f" · {len(order.issue_evidence)} photo(s)" if order.issue_evidence else ""), user)
    audit.log(db, "order.issue_open", "order", order.id, actor=user, data={"reason": reason})
    notify.order_issue(db, order)


def resolve_problem(db: Session, order: Order, admin: User, note: str) -> None:
    """Admin checked the report and the seller is not at fault: the payout goes ahead on schedule.
    (To refund instead, use the refund action, which also closes the report.)"""
    if order.issue_status != "open":
        raise HTTPException(400, "There is no open report on this order")
    order.issue_status, order.issue_resolved_at = "resolved", utcnow()
    order.issue_resolution = (note or "Checked by TicketNest: no problem found")[:300]
    event(order, "issue_resolved", order.issue_resolution, admin)
    audit.log(db, "order.issue_resolve", "order", order.id, actor=admin, data={"note": note})
    notify.customer_order_update(db, order, "issue_resolved")
    if order.payout_release_at and as_aware(order.payout_release_at) <= utcnow() and order.status in (S.delivered, S.completed):
        release_payout(db, order, admin)


def buyer_history(db: Session, buyer_id: int, exclude_order_id: int | None = None) -> dict:
    """How this buyer behaved before: helps spot people who report problems to get refunds."""
    from sqlalchemy import func
    q = db.query(Order).filter(Order.buyer_id == buyer_id)
    if exclude_order_id:
        q = q.filter(Order.id != exclude_order_id)
    paid = q.filter(Order.status.in_([S.paid, S.preparing, S.awaiting_delivery, S.delivered, S.completed, S.refunded])).count()
    reports = q.filter(Order.issue_status != "").count()
    refunds = q.filter(Order.status == S.refunded).count()
    first = db.query(func.min(Order.created_at)).filter(Order.buyer_id == buyer_id).scalar()
    return {"orders": paid, "reports": reports, "refunds": refunds, "first_order_at": iso(first) if first else None}


def buyer_confirm(db: Session, order: Order, user: User) -> None:
    """The buyer tapped "I received my ticket"."""
    if order.buyer_confirmed_at:
        return
    if order.status in (S.paid, S.preparing, S.awaiting_delivery):
        deliver(db, order, None, method="buyer_confirmed", label=f"buyer:{user.id}", notify_buyer=False)
    elif order.status not in (S.delivered, S.completed):
        raise HTTPException(400, "This order can't be confirmed")
    order.buyer_confirmed_at = utcnow()
    event(order, "buyer_confirmed", "Buyer confirmed they received the ticket", user)
    audit.log(db, "order.buyer_confirm", "order", order.id, actor=user)
    notify.buyer_confirmed(db, order)


def reservation_seconds_left(order: Order) -> int:
    if order.status != S.awaiting_payment or not order.expires_at:
        return 0
    return max(0, int((as_aware(order.expires_at) - utcnow()).total_seconds()))


__all__ = ["create_order", "mark_paid", "AlreadyUsed", "expire_due", "refund", "deliver", "set_status",
           "release_due", "release_payout", "report_problem", "resolve_problem", "buyer_confirm",
           "cancel_by_buyer", "cancel_by_admin", "ReservationStatus"]
