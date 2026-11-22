"""Sell tickets: sellers submit listings (with proof files) that wait for admin approval."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import (Concert, ConcertStatus, ListingStatus, Order, OrderItem, OrderStatus, TicketCategory,
                        TicketImage, TicketListing, TicketType, User)
from app.schemas import ListingEditIn
from app.security import get_current_user
from app.serializers import listing_owner
from app.services import audit, notify, storage, wallet
from app.services.pricing import quote_for
from app.utils import as_aware, clean_text, clean_tg_username, to_cents, utcnow

from app.services.human import require_human

router = APIRouter(prefix="/api/sell", tags=["Sell tickets"])
MAX_FILES = 5
PAID_STATES = (OrderStatus.paid, OrderStatus.preparing, OrderStatus.awaiting_delivery, OrderStatus.delivered,
               OrderStatus.completed)


def _price(v: str, label: str) -> int:
    try:
        cents = to_cents(v)
    except ValueError as e:
        raise HTTPException(422, f"Enter a valid {label}") from e
    if not 100 <= cents <= 5_000_000:
        raise HTTPException(422, f"{label.capitalize()} must be between $1 and $50,000")
    return cents


@router.get("/preview")
def preview(price: str, db: Session = Depends(get_db)):
    """What the buyer pays and what the seller receives for a listing price (live as they type)."""
    q = quote_for(db, _price(price, "listing price"), 1)
    return {"listing_price_cents": q.unit_price_cents, "buyer_pays_cents": q.unit_total_cents,
            "commission_cents": q.unit_commission_cents, "you_receive_cents": q.seller_payout_cents,
            "commission_bps": q.commission_bps, "markup_bps": q.markup_bps}


@router.post("/listings", status_code=201)
@limiter.limit("20/hour")
async def create_listing(request: Request,
                         concert_id: int = Form(...), category_id: int = Form(...),
                         original_price: str = Form(...), price: str = Form(...), quantity: int = Form(...),
                         seat_info: str = Form(""), ticket_type: str = Form("e_ticket"), notes: str = Form(""),
                         contact_name: str = Form(...), contact_phone: str = Form(""), contact_telegram: str = Form(...),
                         payout_method: str = Form(...), payout_account_name: str = Form(...),
                         payout_account_number: str = Form(...), confirm_owner: bool = Form(...),
                         files: list[UploadFile] = File(...),
                         receipts: list[UploadFile] = File(...),
                         payout_qr: UploadFile | None = File(None),
                         user: User = Depends(get_current_user), db: Session = Depends(get_db),
                         _h: None = Depends(require_human)):
    if not confirm_owner:
        raise HTTPException(422, "Please confirm the tickets are yours and genuine")
    concert = db.get(Concert, concert_id)
    if not concert or not concert.is_published or concert.status == ConcertStatus.cancelled \
            or as_aware(concert.starts_at) < utcnow():
        raise HTTPException(400, "Choose an upcoming concert")
    cat = db.get(TicketCategory, category_id)
    if not cat or cat.concert_id != concert.id or not cat.is_active:
        raise HTTPException(400, "Choose a ticket category for this concert")
    if not 1 <= quantity <= 20:
        raise HTTPException(422, "Quantity must be between 1 and 20")
    if ticket_type not in {t.value for t in TicketType}:
        raise HTTPException(422, "Choose a ticket type")
    try:
        tg_name = clean_tg_username(contact_telegram)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    if not tg_name:
        raise HTTPException(422, "Your Telegram username is needed so we can reach you")
    if not files or len(files) > MAX_FILES:
        raise HTTPException(422, f"Upload 1 to {MAX_FILES} ticket proof files (photos or PDF)")
    if not receipts or len(receipts) > MAX_FILES:
        raise HTTPException(422, "Upload the purchase receipt that shows what you paid for the ticket")
    for label, v in (("your name", contact_name), ("payout method", payout_method),
                     ("account name", payout_account_name), ("account number", payout_account_number)):
        if len(v.strip()) < 2:
            raise HTTPException(422, f"Enter {label}")

    stored = []
    for role, group in (("proof", files), ("receipt", receipts)):
        for f in group:
            data, kind = await storage.read_upload(f, allow_pdf=True)
            stored.append((role, storage.save_private(data, kind, "proofs"), kind, (f.filename or role)[:200], len(data)))
    qr_key = ""
    if payout_qr is not None and payout_qr.filename:
        data, kind = await storage.read_upload(payout_qr, allow_pdf=False)
        qr_key = storage.save_private(data, kind, "payout-qr")

    _check_price_cap(db, _price(price, "listing price"), _price(original_price, "original price"))
    listing = TicketListing(
        seller_id=user.id, concert_id=concert.id, category_id=cat.id,
        original_price_cents=_price(original_price, "original price"), price_cents=_price(price, "listing price"),
        quantity=quantity, seat_info=clean_text(seat_info, 200), ticket_type=TicketType(ticket_type),
        notes=clean_text(notes, 2000), status=ListingStatus.pending, contact_name=clean_text(contact_name, 120),
        contact_phone=clean_text(contact_phone, 32), contact_telegram=tg_name,
        payout_method=clean_text(payout_method, 40), payout_account_name=clean_text(payout_account_name, 120),
        payout_account_number=clean_text(payout_account_number, 64), payout_qr_key=qr_key or user.payout_qr_key)
    listing.files = [TicketImage(kind=r, storage_key=k, content_type=t, original_name=n, size_bytes=z) for r, k, t, n, z in stored]
    db.add(listing)
    if not user.telegram_username:
        user.telegram_username = tg_name
    # remember payout details on the profile for next time
    user.payout_method = listing.payout_method
    user.payout_account_name = listing.payout_account_name
    user.payout_account_number = listing.payout_account_number
    if qr_key:
        user.payout_qr_key = qr_key
    db.flush()
    audit.log(db, "listing.create", "listing", listing.id, actor=user,
              data={"price_cents": listing.price_cents, "qty": quantity})
    notify.new_listing(db, listing)
    db.commit()
    from app.services import email as mail
    mail.send_listing_submitted(db, listing)
    return listing_owner(db, listing)


def _own(db: Session, user: User, listing_id: int) -> TicketListing:
    l = db.get(TicketListing, listing_id)
    if not l or l.seller_id != user.id:
        raise HTTPException(404, "Listing not found")
    return l


@router.get("/listings")
def my_listings(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(TicketListing).filter_by(seller_id=user.id).order_by(TicketListing.created_at.desc()).all()
    return [listing_owner(db, l) for l in rows]


@router.get("/dashboard")
def seller_dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(TicketListing).filter_by(seller_id=user.id).all()
    sold = (db.query(func.coalesce(func.sum(OrderItem.quantity), 0),
                     func.coalesce(func.sum(OrderItem.unit_price_cents * OrderItem.quantity), 0))
            .join(Order).filter(OrderItem.seller_id == user.id, Order.status.in_(PAID_STATES)).one())
    net = (db.query(func.coalesce(func.sum(Order.seller_payout_cents), 0)).join(OrderItem)
           .filter(OrderItem.seller_id == user.id, Order.status.in_(PAID_STATES)).scalar())
    w = wallet.get_wallet(db, user.id)
    from app.models import WithdrawalRequest, WithdrawalStatus
    wd = db.query(WithdrawalRequest).filter_by(user_id=user.id)
    db.commit()
    return {"total_listings": len(rows),
            "available_tickets": sum(l.available for l in rows if l.status == ListingStatus.available),
            "pending_listings": sum(1 for l in rows if l.status == ListingStatus.pending),
            "sold_tickets": int(sold[0]), "gross_sales_cents": int(sold[1]),
            "commission_cents": int(sold[1]) - int(net), "net_earnings_cents": int(net),
            "wallet": {"pending_cents": w.pending_cents, "available_cents": w.available_cents,
                       "held_cents": w.held_cents, "withdrawn_cents": w.withdrawn_cents},
            "pending_withdrawals": wd.filter_by(status=WithdrawalStatus.pending).count(),
            "completed_withdrawals": wd.filter_by(status=WithdrawalStatus.paid).count()}


def _check_price_cap(db: Session, price_cents: int, face_cents: int) -> None:
    """Optional fair-price rule (Admin -> Settings -> Buyer protection)."""
    from app.services.settings_store import get_setting
    from app.utils import fmt_usd2
    cap = int(get_setting(db, "protection").get("price_cap_pct") or 0)
    if cap and price_cents > face_cents * cap // 100:
        raise HTTPException(422, f"TicketNest keeps resale prices fair: your price can be at most {cap}% of the "
                                 f"face value ({fmt_usd2(face_cents * cap // 100)} per ticket).")


@router.patch("/listings/{listing_id}")
def edit_listing(listing_id: int, body: ListingEditIn, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Pending/rejected listings can be changed freely (and go back to review). A live listing can only
    change price or quantity while nobody is checking out, and goes back to review too."""
    l = _own(db, user, listing_id)
    if l.status not in (ListingStatus.pending, ListingStatus.rejected, ListingStatus.available) or l.quantity_reserved:
        raise HTTPException(400, "This listing can't be edited right now")
    if body.price is not None:
        l.price_cents = _price(str(body.price), "listing price")
    if body.original_price is not None:
        l.original_price_cents = _price(str(body.original_price), "original price")
    _check_price_cap(db, l.price_cents, l.original_price_cents)
    if body.quantity is not None:
        if body.quantity < l.quantity_sold:
            raise HTTPException(400, f"{l.quantity_sold} ticket(s) are already sold")
        l.quantity = body.quantity
    if body.seat_info is not None:
        l.seat_info = clean_text(body.seat_info, 200)
    if body.notes is not None:
        l.notes = clean_text(body.notes, 2000)
    if body.ticket_type:
        l.ticket_type = TicketType(body.ticket_type)
    if l.quantity_sold and l.quantity_sold == l.quantity:
        l.status = ListingStatus.sold
    else:
        l.status = ListingStatus.pending  # every change is reviewed again before it is public
    l.rejection_reason = ""
    audit.log(db, "listing.edit", "listing", l.id, actor=user, data=body.model_dump(exclude_none=True, mode="json"))
    db.flush()
    if l.status == ListingStatus.pending:
        notify.new_listing(db, l)
    db.commit()
    return listing_owner(db, l)


@router.post("/listings/{listing_id}/cancel")
def cancel_listing(listing_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    l = _own(db, user, listing_id)
    if l.status not in (ListingStatus.pending, ListingStatus.rejected, ListingStatus.available, ListingStatus.approved) \
            or l.quantity_reserved:
        raise HTTPException(400, "This listing can't be cancelled now (a buyer may be paying for it)")
    l.status = ListingStatus.cancelled
    audit.log(db, "listing.cancel", "listing", l.id, actor=user)
    db.commit()
    return listing_owner(db, l)


@router.get("/listings/{listing_id}/files/{file_id}")
def my_proof(listing_id: int, file_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    l = _own(db, user, listing_id)
    f = next((f for f in l.files if f.id == file_id), None)
    if not f:
        raise HTTPException(404, "File not found")
    return Response(storage.read_private(f.storage_key), media_type=f.content_type,
                    headers={"Cache-Control": "private, no-store", "Content-Disposition": "inline"})
