"""Admin: overview, listings, orders, payments (reconciliation), withdrawals, users, settings, reports."""

import csv
import io
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (AuditLog, Concert, EmailLog, ListingStatus, Order, OrderStatus, Payment, PaymentNotification,
                        PaymentStatus, Role, TelegramNotification, TicketCategory, TicketListing, TicketType, User,
                        WalletTransaction, WithdrawalRequest, WithdrawalStatus)
from app.schemas import ListingEditIn
from app.security import require_admin, require_staff
from app.serializers import listing_admin, order_out, user_out, withdrawal_out
from app.services import audit, email as mail, invoice_pdf, khqr, listings as lst, orders as svc, payway, storage, wallet
from app.services import reports, tg_listener
from app.services.pricing import MAX_BPS
from app.services.settings_store import all_settings, get_setting, set_setting
from app.utils import clean_text, iso, to_cents, utcnow

router = APIRouter(prefix="/api/admin", tags=["Admin"])
PAID = (OrderStatus.paid, OrderStatus.preparing, OrderStatus.awaiting_delivery, OrderStatus.delivered,
        OrderStatus.completed)


# ---------------------------------------------------------------- overview
@router.get("/overview")
def overview(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    paid = db.query(Order).filter(Order.status.in_(PAID))
    revenue = paid.with_entities(func.coalesce(func.sum(Order.total_cents), 0),
                                 func.coalesce(func.sum(Order.markup_cents + Order.commission_cents), 0),
                                 func.count(Order.id)).one()
    L = TicketListing
    avail = (db.query(func.coalesce(func.sum(L.quantity - L.quantity_reserved - L.quantity_sold), 0))
             .filter(L.status.in_([ListingStatus.available])).scalar())
    sold = db.query(func.coalesce(func.sum(L.quantity_sold), 0)).scalar()
    pays = dict(db.query(Payment.status, func.count(Payment.id)).group_by(Payment.status).all())
    since = utcnow() - timedelta(days=30)
    daily = (db.query(func.date(Order.paid_at), func.sum(Order.total_cents), func.count(Order.id))
             .filter(Order.status.in_(PAID), Order.paid_at >= since).group_by(func.date(Order.paid_at)).all())
    recent = db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    return {
        "revenue_cents": int(revenue[0]), "platform_revenue_cents": int(revenue[1]), "paid_orders": int(revenue[2]),
        "total_orders": db.query(Order).count(),
        "awaiting_payment": db.query(Order).filter_by(status=OrderStatus.awaiting_payment).count(),
        "to_deliver": db.query(Order).filter(Order.status.in_([OrderStatus.paid, OrderStatus.preparing,
                                                               OrderStatus.awaiting_delivery])).count(),
        "total_listings": db.query(L).count(), "available_tickets": int(avail), "sold_tickets": int(sold),
        "pending_listings": db.query(L).filter_by(status=ListingStatus.pending).count(),
        "pending_withdrawals": db.query(WithdrawalRequest).filter_by(status=WithdrawalStatus.pending).count(),
        "payments": {k.value if hasattr(k, "value") else k: v for k, v in pays.items()},
        "unmatched_payments": db.query(PaymentNotification)
                                .filter(PaymentNotification.outcome.in_(["unmatched", "ambiguous", "wrong_amount", "late"])).count(),
        "daily": [{"date": str(d), "revenue_cents": int(r or 0), "orders": int(n)} for d, r, n in daily],
        "series": reports.series(db, 30),
        "top_concerts": reports.top_concerts(db, 5),
        "listing_status": reports.listing_status_counts(db),
        "recent_orders": [order_out(o, admin=True) for o in recent],
        "integrations": integrations(),
    }


def integrations() -> dict:
    return {"telegram_bot": bool(settings.TELEGRAM_BOT_TOKEN), "admin_group": bool(settings.TELEGRAM_ADMIN_GROUP_ID),
            "admin_ids": len(settings.admin_telegram_ids), "payment_group": bool(settings.TELEGRAM_PAYMENT_GROUP_ID),
            "listener": tg_listener.STATUS.get("state", "off"), "listener_error": tg_listener.STATUS.get("error", ""),
            "bakong_api": bool(settings.BAKONG_API_TOKEN), "email": mail.provider(),
            "google": bool(settings.GOOGLE_CLIENT_ID), "storage": settings.STORAGE_PROVIDER}


# ---------------------------------------------------------------- listings
@router.get("/listings")
def list_listings(status: str = "", q: str = "", db: Session = Depends(get_db), _: User = Depends(require_staff)):
    query = db.query(TicketListing).join(Concert)
    if status:
        query = query.filter(TicketListing.status == status)
    if q:
        query = query.filter(Concert.title.ilike(f"%{q[:80]}%"))
    rows = query.order_by(TicketListing.created_at.desc()).limit(300).all()
    return [listing_admin(db, l) for l in rows]


def _listing(db: Session, listing_id: int) -> TicketListing:
    l = db.get(TicketListing, listing_id)
    if not l:
        raise HTTPException(404, "Listing not found")
    return l


@router.get("/listings/{listing_id}")
def get_listing(listing_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    out = listing_admin(db, l)
    out["orders"] = [order_out(o, admin=True) for o in
                     db.query(Order).join(Order.items).filter_by(listing_id=l.id).order_by(Order.id.desc()).all()]
    return out


@router.get("/listings/{listing_id}/files/{file_id}")
def listing_file(listing_id: int, file_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    f = next((f for f in l.files if f.id == file_id), None)
    if not f:
        raise HTTPException(404, "File not found")
    return Response(storage.read_private(f.storage_key), media_type=f.content_type,
                    headers={"Cache-Control": "private, no-store", "Content-Disposition": "inline"})


@router.get("/listings/{listing_id}/payout-qr")
def listing_payout_qr(listing_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    if not l.payout_qr_key:
        raise HTTPException(404, "The seller didn't upload a payout QR")
    data = storage.read_private(l.payout_qr_key)
    return Response(data, media_type=storage.sniff(data) or "image/png",
                    headers={"Cache-Control": "private, no-store"})


@router.get("/users/{user_id}/payout-qr")
def user_payout_qr(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    u = db.get(User, user_id)
    if not u or not u.payout_qr_key:
        raise HTTPException(404, "This seller has no payout QR")
    data = storage.read_private(u.payout_qr_key)
    return Response(data, media_type=storage.sniff(data) or "image/png",
                    headers={"Cache-Control": "private, no-store"})


class ReasonIn(BaseModel):
    reason: str = Field("", max_length=500)


@router.post("/listings/{listing_id}/approve")
def approve_listing(listing_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    lst.approve(db, l, user)
    db.commit()
    return listing_admin(db, l)


@router.post("/listings/{listing_id}/reject")
def reject_listing(listing_id: int, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    lst.reject(db, l, clean_text(body.reason, 500), user)
    db.commit()
    return listing_admin(db, l)


@router.post("/listings/{listing_id}/disable")
def disable_listing(listing_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    lst.disable(db, l, user)
    db.commit()
    return listing_admin(db, l)


@router.post("/listings/{listing_id}/enable")
def enable_listing(listing_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    l = _listing(db, listing_id)
    lst.enable(db, l, user)
    db.commit()
    return listing_admin(db, l)


@router.patch("/listings/{listing_id}")
def admin_edit_listing(listing_id: int, body: ListingEditIn, db: Session = Depends(get_db),
                       user: User = Depends(require_staff)):
    """Edit price / quantity. Quantity can't go below what is sold + held by checkouts."""
    l = _listing(db, listing_id)
    if body.price is not None:
        l.price_cents = to_cents(body.price)
        if l.price_cents <= 0:
            raise HTTPException(422, "Price must be positive")
    if body.original_price is not None:
        l.original_price_cents = to_cents(body.original_price)
    if body.quantity is not None:
        if body.quantity < l.quantity_sold + l.quantity_reserved:
            raise HTTPException(400, f"{l.quantity_sold} sold and {l.quantity_reserved} held: quantity can't be lower")
        l.quantity = body.quantity
    for k in ("seat_info", "notes"):
        if getattr(body, k) is not None:
            setattr(l, k, clean_text(getattr(body, k), 2000))
    if body.ticket_type:
        l.ticket_type = TicketType(body.ticket_type)
    db.flush()
    from app.services import inventory
    inventory.refresh_status(db, l)
    audit.log(db, "listing.admin_edit", "listing", l.id, actor=user, data=body.model_dump(exclude_none=True, mode="json"))
    db.commit()
    return listing_admin(db, l)


class ManualListingIn(BaseModel):
    concert_id: int
    category_id: int
    price: str | float
    original_price: str | float
    quantity: int = Field(ge=1, le=500)
    seat_info: str = Field("", max_length=200)
    notes: str = Field("", max_length=2000)
    ticket_type: str = "e_ticket"


@router.post("/listings", status_code=201)
def manual_listing(body: ManualListingIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    """TicketNest's own tickets, added by an admin (no seller, no commission, live immediately)."""
    cat = db.get(TicketCategory, body.category_id)
    if not cat or cat.concert_id != body.concert_id:
        raise HTTPException(400, "Choose a category of this concert")
    l = TicketListing(seller_id=None, concert_id=body.concert_id, category_id=cat.id, price_cents=to_cents(body.price),
                      original_price_cents=to_cents(body.original_price), quantity=body.quantity,
                      seat_info=clean_text(body.seat_info, 200), notes=clean_text(body.notes, 2000),
                      ticket_type=TicketType(body.ticket_type), status=ListingStatus.available,
                      contact_name="TicketNest", reviewed_by_id=user.id, reviewed_at=utcnow())
    if l.price_cents <= 0:
        raise HTTPException(422, "Price must be positive")
    db.add(l)
    db.flush()
    audit.log(db, "listing.manual_create", "listing", l.id, actor=user)
    db.commit()
    return listing_admin(db, l)


@router.post("/listings/{listing_id}/mark-sold")
def mark_sold_offline(listing_id: int, body: dict, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    """Tickets sold outside TicketNest (e.g. in person): take them off sale. No order or invoice is created."""
    l = _listing(db, listing_id)
    qty = int(body.get("quantity") or 0)
    if qty < 1 or qty > l.available:
        raise HTTPException(400, f"Enter 1 to {l.available}")
    from sqlalchemy import update
    L = TicketListing
    res = db.execute(update(L).where(L.id == l.id, (L.quantity - L.quantity_reserved - L.quantity_sold) >= qty)
                     .values(quantity_sold=L.quantity_sold + qty).execution_options(synchronize_session=False))
    if res.rowcount != 1:
        raise HTTPException(409, "Those tickets are no longer available")
    from app.services import inventory
    inventory.refresh_status(db, l)
    audit.log(db, "listing.mark_sold_offline", "listing", l.id, actor=user, data={"quantity": qty})
    db.commit()
    return listing_admin(db, l)


# ---------------------------------------------------------------- orders
@router.get("/orders")
def list_orders(status: str = "", q: str = "", seller: int | None = None, buyer: int | None = None,
                listing: int | None = None, issues: bool = False, db: Session = Depends(get_db),
                _: User = Depends(require_staff), page: int = Query(1, ge=1), size: int = Query(50, le=200)):
    """One search for everything: order number, buyer (name / Telegram / email), seller (name / Telegram /
    email), concert, or a listing number like "#12". ?seller= / ?buyer= / ?listing= show one person's or
    one listing's orders; ?issues=1 shows only orders with a problem report."""
    from app.models import OrderItem, TicketListing as TL, User as U
    query = db.query(Order)
    if status:
        query = query.filter(Order.status.in_(status.split(",")))
    if seller:
        query = query.filter(Order.id.in_(db.query(OrderItem.order_id).filter(OrderItem.seller_id == seller)))
    if buyer:
        query = query.filter(Order.buyer_id == buyer)
    if listing:
        query = query.filter(Order.id.in_(db.query(OrderItem.order_id).filter(OrderItem.listing_id == listing)))
    if issues:
        query = query.filter(Order.issue_status != "")
    if q:
        term = q.strip()[:80]
        like = f"%{term}%"
        by_item = (db.query(OrderItem.order_id).outerjoin(TL, TL.id == OrderItem.listing_id)
                   .outerjoin(U, U.id == OrderItem.seller_id)
                   .filter(OrderItem.concert_title.ilike(like) | U.full_name.ilike(like) | U.email.ilike(like)
                           | U.telegram_username.ilike(like) | TL.contact_telegram.ilike(like)))
        cond = (Order.order_number.ilike(like) | Order.contact_name.ilike(like) | Order.contact_telegram.ilike(like)
                | Order.contact_email.ilike(like) | Order.id.in_(by_item))
        if term.lstrip("#").isdigit():   # "#12" = listing 12
            cond = cond | Order.id.in_(db.query(OrderItem.order_id).filter(OrderItem.listing_id == int(term.lstrip("#"))))
        query = query.filter(cond)
    total = query.count()
    rows = query.order_by(Order.created_at.desc()).offset((page - 1) * size).limit(size).all()
    return {"items": [order_out(o, admin=True) for o in rows], "total": total}


def _order(db: Session, order_id: int) -> Order:
    o = db.get(Order, order_id)
    if not o:
        raise HTTPException(404, "Order not found")
    return o


@router.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    o = _order(db, order_id)
    out = order_out(o, admin=True)
    out["buyer_history"] = svc.buyer_history(db, o.buyer_id, exclude_order_id=o.id)
    out["emails"] = [{"kind": e.kind, "status": e.status, "to": e.to, "at": iso(e.created_at)}
                     for e in db.query(EmailLog).filter_by(order_id=o.id).order_by(EmailLog.id).all()]
    return out


class StatusIn(BaseModel):
    status: str
    note: str = Field("", max_length=500)


@router.post("/orders/{order_id}/status")
def order_status(order_id: int, body: StatusIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    try:
        new = OrderStatus(body.status)
    except ValueError as e:
        raise HTTPException(422, "Unknown status") from e
    svc.set_status(db, o, new, user, clean_text(body.note, 500))
    db.commit()
    return order_out(o, admin=True)


@router.post("/orders/{order_id}/deliver")
async def deliver_order(order_id: int, method: str = Form("telegram"), reference: str = Form(""),
                        file: UploadFile | None = File(None), db: Session = Depends(get_db),
                        user: User = Depends(require_staff)):
    o = _order(db, order_id)
    stored = None
    if file is not None and file.filename:
        data, kind = await storage.read_upload(file, allow_pdf=True)
        stored = (storage.save_private(data, kind, "deliveries"), file.filename[:200], kind)
    svc.deliver(db, o, user, method=clean_text(method, 40), reference=clean_text(reference, 2000), file=stored)
    db.commit()
    return order_out(o, admin=True)


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: int, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    svc.cancel_by_admin(db, o, user, clean_text(body.reason, 300))
    db.commit()
    return order_out(o, admin=True)


class RefundIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
    restock: bool = False


@router.post("/orders/{order_id}/refund")
def refund_order(order_id: int, body: RefundIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    o = _order(db, order_id)
    svc.refund(db, o, user, clean_text(body.reason, 300), body.restock)
    db.commit()
    return order_out(o, admin=True)


@router.get("/orders/{order_id}/evidence/{index}")
def order_evidence(order_id: int, index: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    o = _order(db, order_id)
    keys = o.issue_evidence or []
    if not 0 <= index < len(keys):
        raise HTTPException(404, "Photo not found")
    data = storage.read_private(keys[index])
    return Response(data, media_type=storage.sniff(data) or "image/jpeg", headers={"Cache-Control": "private, no-store"})


class ResolveIn(BaseModel):
    note: str = Field("", max_length=300)


@router.post("/orders/{order_id}/issue/resolve")
def resolve_issue(order_id: int, body: ResolveIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    """Buyer protection: the report was checked and the seller is not at fault (payout continues on schedule).
    To give the buyer their money back instead, use Record refund."""
    o = _order(db, order_id)
    svc.resolve_problem(db, o, user, clean_text(body.note, 300))
    db.commit()
    return order_out(o, admin=True)


@router.post("/orders/{order_id}/release-payout")
def release_payout_now(order_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """Pay the seller before the usual hold ends (e.g. trusted seller, buyer confirmed long ago)."""
    o = _order(db, order_id)
    svc.release_payout(db, o, user, early=True)
    db.commit()
    return order_out(o, admin=True)


class ManualPayIn(BaseModel):
    trx_id: str = Field(min_length=4, max_length=40)


@router.post("/orders/{order_id}/confirm-payment")
def confirm_payment(order_id: int, body: ManualPayIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    """For a payment the listener could not match (ambiguous / listener offline). The ABA Trx ID is
    required and can only ever be used once, so the same money can't confirm two orders."""
    o = _order(db, order_id)
    pay = svc.active_payment(o) or next((p for p in reversed(o.payments) if p.status == PaymentStatus.expired), None)
    if not pay:
        raise HTTPException(400, "This order has no open payment")
    try:
        payway.resolve_manually(db, pay, body.trx_id, user, user.full_name)
    except svc.AlreadyUsed as e:
        raise HTTPException(409, "This ABA transaction ID was already used for a payment") from e
    db.commit()
    svc.after_commit_paid(db)
    return order_out(o, admin=True)


@router.post("/orders/{order_id}/note")
def order_note(order_id: int, body: ReasonIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    o.admin_note = clean_text(body.reason, 2000)
    db.commit()
    return {"ok": True}


@router.get("/orders/{order_id}/invoice.pdf")
def admin_invoice(order_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    o = _order(db, order_id)
    if not o.invoice:
        raise HTTPException(404, "No invoice: payment not verified")
    return Response(invoice_pdf.build(o, get_setting(db, "site")["name"]), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{o.invoice.invoice_number}.pdf"'})


@router.post("/orders/{order_id}/resend-invoice")
def resend_invoice(order_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    o = _order(db, order_id)
    if not o.invoice:
        raise HTTPException(404, "No invoice: payment not verified")
    if not o.contact_email:
        raise HTTPException(400, "This order has no email address")
    mail.send_invoice(o, invoice_pdf.build(o, get_setting(db, "site")["name"]))
    audit.log(db, "invoice.resend", "order", o.id, actor=user)
    db.commit()
    return {"ok": True}


@router.get("/orders/{order_id}/delivery-file")
def admin_delivery_file(order_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    o = _order(db, order_id)
    if not o.delivery or not o.delivery.file_key:
        raise HTTPException(404, "No file")
    return Response(storage.read_private(o.delivery.file_key), media_type=o.delivery.file_type)


# ---------------------------------------------------------------- payments / reconciliation
@router.get("/payments")
def payments(outcome: str = "", db: Session = Depends(get_db), _: User = Depends(require_staff)):
    q = db.query(PaymentNotification)
    if outcome:
        q = q.filter(PaymentNotification.outcome.in_(outcome.split(",")))
    notes = q.order_by(PaymentNotification.id.desc()).limit(300).all()
    pays = db.query(Payment).order_by(Payment.id.desc()).limit(300).all()
    return {
        "notifications": [{"id": n.id, "trx_id": n.trx_id, "amount": n.amount, "currency": n.currency, "payer": n.payer,
                           "payer_account": n.payer_account, "outcome": n.outcome, "detail": n.detail,
                           "payment_id": n.payment_id, "received_at": iso(n.received_at), "raw_text": n.raw_text}
                          for n in notes],
        "payments": [{"id": p.id, "order_id": p.order_id, "order_number": p.order.order_number, "amount": p.amount,
                      "currency": p.currency, "status": p.status.value, "reference": p.reference,
                      "source": p.verification_source, "created_at": iso(p.created_at),
                      "verified_at": iso(p.verified_at), "expires_at": iso(p.expires_at)} for p in pays],
        "listener": tg_listener.STATUS,
    }


class AssignIn(BaseModel):
    order_id: int


@router.post("/payments/notifications/{note_id}/assign")
def assign_notification(note_id: int, body: AssignIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    n = db.get(PaymentNotification, note_id)
    if not n:
        raise HTTPException(404, "Not found")
    o = _order(db, body.order_id)
    pay = svc.active_payment(o) or next((p for p in reversed(o.payments) if p.status == PaymentStatus.expired), None)
    if not pay:
        raise HTTPException(400, "That order has no open payment")
    try:
        payway.resolve_manually(db, pay, n.trx_id, user, user.full_name)
    except svc.AlreadyUsed as e:
        raise HTTPException(409, "This transaction was already used") from e
    db.commit()
    svc.after_commit_paid(db)
    return {"ok": True}


# ---------------------------------------------------------------- withdrawals & wallets
@router.get("/withdrawals")
def withdrawals(status: str = "", db: Session = Depends(get_db), _: User = Depends(require_staff)):
    q = db.query(WithdrawalRequest)
    if status:
        q = q.filter(WithdrawalRequest.status == status)
    return [withdrawal_out(w, admin=True) for w in q.order_by(WithdrawalRequest.id.desc()).limit(300).all()]


class SettleIn(BaseModel):
    paid: bool
    note: str = Field("", max_length=500)
    reference: str = Field("", max_length=120)


@router.post("/withdrawals/{wid}/settle")
def settle(wid: int, body: SettleIn, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    w = db.get(WithdrawalRequest, wid)
    if not w:
        raise HTTPException(404, "Not found")
    wallet.settle_withdrawal(db, w, paid=body.paid, actor=user, note=clean_text(body.note, 500),
                             reference=clean_text(body.reference, 120))
    if body.paid:
        from app.services import notify
        notify.withdrawal_completed(db, w, user.full_name)
    db.commit()
    return withdrawal_out(w, admin=True)


@router.get("/wallet-transactions")
def wallet_txs(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.query(WalletTransaction).order_by(WalletTransaction.id.desc()).limit(500).all()
    from app.models import SellerWallet
    owners = {w.id: w.user for w in db.query(SellerWallet).all()}
    return [{"id": t.id, "seller": owners[t.wallet_id].full_name if t.wallet_id in owners else "", "type": t.type.value,
             "amount_cents": t.amount_cents, "available_after": t.available_after, "pending_after": t.pending_after,
             "note": t.note, "created_at": iso(t.created_at)} for t in rows]


# ---------------------------------------------------------------- users
@router.get("/users")
def users(q: str = "", db: Session = Depends(get_db), _: User = Depends(require_staff)):
    query = db.query(User)
    if q:
        like = f"%{q[:80]}%"
        query = query.filter(User.full_name.ilike(like) | User.email.ilike(like) | User.telegram_username.ilike(like))
    rows = query.order_by(User.id.desc()).limit(300).all()
    out = []
    for u in rows:
        d = user_out(u)
        d["is_active"] = u.is_active
        d["orders"] = db.query(Order).filter_by(buyer_id=u.id).count()
        d["listings"] = db.query(TicketListing).filter_by(seller_id=u.id).count()
        out.append(d)
    return out


class UserAdminIn(BaseModel):
    role: str | None = None
    is_active: bool | None = None


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: UserAdminIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id:
        raise HTTPException(400, "You can't change your own role or status")
    if body.role is not None:
        u.role = Role(body.role)
    if body.is_active is not None:
        u.is_active = body.is_active
        if not body.is_active:
            u.token_version += 1   # signs them out everywhere
    audit.log(db, "user.admin_update", "user", u.id, actor=admin, data=body.model_dump(exclude_none=True))
    db.commit()
    return user_out(u)


# ---------------------------------------------------------------- settings
@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    data = all_settings(db)
    data["integrations"] = integrations()   # booleans only - secrets never leave the server
    tpl = data["payments"].get("khqr_template")
    try:
        data["payments"]["khqr_account"] = khqr.describe_template(tpl) if tpl else None
    except ValueError:
        data["payments"]["khqr_account"] = None
    return data


@router.put("/settings/{key}")
def put_settings(key: str, body: dict, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    if key == "fees":
        for k in ("seller_commission_bps", "buyer_markup_bps"):
            if k in body:
                v = int(body[k])
                if not 0 <= v <= MAX_BPS:
                    raise HTTPException(422, "Fees must be between 0% and 50%")
                body[k] = v
    if key == "payments":
        if (body.get("khqr_template") or "").strip():
            try:
                khqr.describe_template(body["khqr_template"])
            except ValueError as e:
                raise HTTPException(422, str(e)) from e
            body["khqr_template"] = body["khqr_template"].strip()
        if body.get("khqr_currency") not in (None, "USD", "KHR"):
            raise HTTPException(422, "QR currency must be USD or KHR")
        for k, lo, hi in (("qr_expiry_minutes", 5, 120), ("grace_minutes", 0, 60)):
            if k in body and not lo <= int(body[k]) <= hi:
                raise HTTPException(422, f"{k} must be between {lo} and {hi}")
    if key == "telegram" and "daily_report_hour" in body and not 0 <= int(body["daily_report_hour"]) <= 23:
        raise HTTPException(422, "Report hour must be 0-23")
    if key == "telegram":
        from app.utils import clean_tg_username
        for k in ("support_username", "delivery_username"):
            if k in body:
                try:
                    body[k] = clean_tg_username(body[k])
                except ValueError as e:
                    raise HTTPException(422, str(e)) from e
    if key == "protection":
        for k, lo, hi in (("payout_hold_hours", 0, 720), ("report_window_hours", 0, 720), ("price_cap_pct", 0, 1000)):
            if k in body:
                body[k] = int(body[k])
                if not lo <= body[k] <= hi:
                    raise HTTPException(422, f"{k.replace('_', ' ')} must be between {lo} and {hi}")
        if body.get("price_cap_pct") and body["price_cap_pct"] < 100:
            raise HTTPException(422, "A price cap below 100% would stop sellers asking face value")
        if "hold_until_after_event" in body:
            body["hold_until_after_event"] = bool(body["hold_until_after_event"])
    if key == "currency" and "khr_rate" in body and not 1000 <= int(body["khr_rate"]) <= 10000:
        raise HTTPException(422, "Exchange rate looks wrong")
    try:
        value = set_setting(db, key, body)
    except KeyError as e:
        raise HTTPException(404, "Unknown settings group") from e
    audit.log(db, "settings.update", "settings", key, actor=user,
              data={k: v for k, v in body.items() if k != "khqr_template"})
    db.commit()
    return value


@router.post("/settings/khqr/preview")
def khqr_preview(body: dict, _: User = Depends(require_admin)):
    try:
        return khqr.describe_template(str(body.get("template", "")))
    except ValueError as e:
        raise HTTPException(422, str(e)) from e


@router.post("/reports/daily/send")
def send_daily_now(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.services import telegram as tg
    if not tg.enabled() or not tg.admin_targets():
        raise HTTPException(400, "Telegram admin group is not configured")
    ok = all(bool((tg.send_now(t, reports.daily_text(db)) or {}).get("ok")) for t in tg.admin_targets())
    return {"ok": ok}


@router.post("/settings/test-telegram")
def test_telegram(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    from app.services import telegram as tg
    if not tg.enabled() or not tg.admin_targets():
        raise HTTPException(400, "Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_GROUP_ID first")
    results = [bool((tg.send_now(t, "✅ TicketNest test alert: the bot can post here.") or {}).get("ok"))
               for t in tg.admin_targets()]
    return {"ok": all(results)}


# ---------------------------------------------------------------- reports
@router.get("/reports/orders.csv")
def export_orders(date_from: datetime | None = None, date_to: datetime | None = None, db: Session = Depends(get_db),
                  _: User = Depends(require_admin)):
    q = db.query(Order)
    if date_from:
        q = q.filter(Order.created_at >= date_from)
    if date_to:
        q = q.filter(Order.created_at <= date_to)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["order_number", "created_at", "status", "buyer", "concert", "category", "qty", "seller_price_usd",
                "markup_usd", "total_usd", "commission_usd", "seller_payout_usd", "platform_revenue_usd",
                "invoice", "payment_reference", "paid_at", "delivered_at"])
    for o in q.order_by(Order.id).all():
        it = o.items[0]
        pay = next((p for p in reversed(o.payments) if p.reference), None)
        cents = lambda c: f"{c / 100:.2f}"  # noqa: E731
        w.writerow([o.order_number, iso(o.created_at), o.status.value, o.contact_name, it.concert_title,
                    it.category_name, it.quantity, cents(o.subtotal_cents), cents(o.markup_cents), cents(o.total_cents),
                    cents(o.commission_cents), cents(o.seller_payout_cents), cents(o.markup_cents + o.commission_cents),
                    o.invoice.invoice_number if o.invoice else "", pay.reference if pay else "", iso(o.paid_at),
                    iso(o.delivered_at)])
    return Response(buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="ticketnest-orders.csv"'})


@router.get("/audit")
def audit_log(db: Session = Depends(get_db), _: User = Depends(require_admin), action: str = ""):
    q = db.query(AuditLog)
    if action:
        q = q.filter(AuditLog.action.ilike(f"{action[:40]}%"))
    return [{"id": a.id, "action": a.action, "entity": a.entity, "entity_id": a.entity_id, "data": a.data,
             "actor": a.actor.full_name if a.actor else a.actor_label, "at": iso(a.created_at)}
            for a in q.order_by(AuditLog.id.desc()).limit(300).all()]


@router.get("/telegram-log")
def telegram_log(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return [{"id": t.id, "chat_id": t.chat_id, "kind": t.kind, "status": t.status, "error": t.error, "text": t.text,
             "at": iso(t.created_at)} for t in db.query(TelegramNotification).order_by(TelegramNotification.id.desc()).limit(200)]
