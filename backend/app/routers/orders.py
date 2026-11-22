"""Buyer checkout and orders (website and Mini App use exactly these endpoints)."""

import io

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import Order, OrderStatus, User
from app.schemas import CheckoutIn
from app.security import get_current_user
from app.serializers import order_out
from app.services import email as mail, invoice_pdf, orders as svc, payway, storage
from app.services.settings_store import get_setting

from app.services.human import require_human

router = APIRouter(prefix="/api/orders", tags=["Orders"])


def _mine(db: Session, user: User, number: str) -> Order:
    order = db.query(Order).filter_by(order_number=number).first()
    if not order or (order.buyer_id != user.id and not user.is_staff):
        raise HTTPException(404, "Order not found")
    return order


@router.post("", status_code=201)
@limiter.limit("20/hour")
def checkout(request: Request, body: CheckoutIn, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             _h: None = Depends(require_human)):
    contact = {"name": body.contact_name, "email": body.contact_email or user.email or "",
               "phone": body.contact_phone or user.phone, "telegram": body.contact_telegram}
    order = svc.create_order(db, user, listing_id=body.listing_id, quantity=body.quantity, contact=contact,
                             channel=body.channel, idempotency_key=body.idempotency_key)
    if body.contact_telegram and not user.telegram_username:
        user.telegram_username = body.contact_telegram
    if body.contact_phone and not user.phone:
        user.phone = body.contact_phone
    db.commit()
    mail.send_order_placed(order)
    return order_out(order, with_qr=True)


@router.get("")
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Order).filter_by(buyer_id=user.id).order_by(Order.created_at.desc()).limit(100).all()
    return [order_out(o) for o in rows]


@router.get("/{number}")
def order_detail(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _mine(db, user, number)
    out = order_out(order, with_qr=True)
    tg = get_setting(db, "telegram")
    out["delivery_contact"] = tg["delivery_username"]
    return out


@router.get("/{number}/status")
@limiter.limit("60/minute")
def order_status(request: Request, number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Polled by the checkout page every few seconds. Reading only - except that, when the Bakong API is
    configured, it asks Bakong about this QR (a server-to-server check that can't be faked)."""
    order = _mine(db, user, number)
    if order.status == OrderStatus.awaiting_payment:
        pay = svc.active_payment(order)
        if pay and settings.BAKONG_API_TOKEN:
            payway.check_bakong(db, order, pay)
            db.refresh(order)
    return {"status": order.status.value, "seconds_left": svc.reservation_seconds_left(order),
            "paid_at": order.paid_at.isoformat() if order.paid_at else None}


@router.post("/{number}/cancel")
def cancel(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _mine(db, user, number)
    if order.buyer_id != user.id:
        raise HTTPException(403, "Only the buyer can cancel this order")
    svc.cancel_by_buyer(db, order, user)
    db.commit()
    return order_out(order)


@router.get("/{number}/qr.png")
def qr_png(number: str, t: str = "", db: Session = Depends(get_db)):
    """The KHQR as an image, so a buyer on a phone can save it and open it in their banking app.
    Protected by the order's unguessable link token instead of a login (images can't send headers)."""
    import hmac
    if not hmac.compare_digest(svc.access_token(number), t or ""):
        raise HTTPException(404, "Not found")
    order = db.query(Order).filter_by(order_number=number).first()
    pay = svc.active_payment(order) if order and order.status == OrderStatus.awaiting_payment else None
    if not pay:
        raise HTTPException(404, "This QR is no longer valid")
    from app.services import khqr_card
    png = khqr_card.render(pay.khqr_payload, pay.amount, pay.currency)
    return Response(png, media_type="image/png",
                    headers={"Cache-Control": "private, no-store",
                             "Content-Disposition": f'inline; filename="TicketNest-{number}-KHQR.png"'})


@router.get("/{number}/invoice.pdf")
def invoice(number: str, download: bool = False, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _mine(db, user, number)
    if not order.invoice:
        raise HTTPException(404, "The invoice is issued once your payment is verified")
    pdf = invoice_pdf.build(order, get_setting(db, "site")["name"])
    disp = "attachment" if download else "inline"
    return Response(pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'{disp}; filename="{order.invoice.invoice_number}.pdf"', "Cache-Control": "private, no-store"})


@router.get("/{number}/delivery-file")
def delivery_file(number: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = _mine(db, user, number)
    if not order.delivery or not order.delivery.file_key:
        raise HTTPException(404, "No file was attached to this delivery")
    d = order.delivery
    return Response(storage.read_private(d.file_key), media_type=d.file_type, headers={
        "Content-Disposition": f'attachment; filename="{d.file_name or "ticket"}"', "Cache-Control": "private, no-store"})
