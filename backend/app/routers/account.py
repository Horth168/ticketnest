"""The signed-in user's own profile, connections, wallet and withdrawals."""

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import Order, User, UserAuthProvider, WalletTransaction, WithdrawalRequest
from app.schemas import GoogleIn, PasswordIn, ProfileIn, TelegramAppIn, TelegramWidgetIn, WithdrawalIn
from app.security import get_current_user, hash_password, verify_password
from app.serializers import order_out, user_out, withdrawal_out
from app.services import audit, notify, social, storage, wallet
from app.utils import clean_text, iso

router = APIRouter(prefix="/api/account", tags=["Account"])


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.full_name:
        user.full_name = body.full_name
    if body.phone is not None:
        user.phone = body.phone
    if body.telegram_username is not None:
        user.telegram_username = body.telegram_username
    if body.locale:
        user.locale = body.locale
    for k in ("payout_method", "payout_account_name", "payout_account_number"):
        v = getattr(body, k)
        if v is not None:
            setattr(user, k, clean_text(v, 120))
    if body.email is not None and body.email.lower() != (user.email or ""):
        email = body.email.lower()
        if db.query(User.id).filter(func.lower(User.email) == email, User.id != user.id).first():
            raise HTTPException(409, "Another account already uses this email")
        user.email = email
        user.email_verified = False
        audit.log(db, "user.email_change", "user", user.id, actor=user)
    db.commit()
    return user_out(user)


@router.post("/avatar")
@limiter.limit("20/hour")
async def upload_avatar(request: Request, file: UploadFile = File(...), user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    data, kind = await storage.read_upload(file, allow_pdf=False)
    user.avatar_url = storage.save_public(_square(data), "image/jpeg", "avatars")
    db.commit()
    return user_out(user)


@router.delete("/avatar")
def remove_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar_url = ""
    db.commit()
    return user_out(user)


def _square(data: bytes, size: int = 400) -> bytes:
    """Centre-crop to a square JPEG so every avatar looks the same."""
    import io
    from PIL import Image, ImageOps
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    img = ImageOps.fit(img, (size, size), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


@router.post("/payout-qr")
@limiter.limit("20/hour")
async def upload_payout_qr(request: Request, file: UploadFile = File(...), user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    """The seller's own bank KHQR image, so the owner can scan it to pay withdrawals. Private."""
    data, kind = await storage.read_upload(file, allow_pdf=False)
    user.payout_qr_key = storage.save_private(data, kind, "payout-qr")
    audit.log(db, "user.payout_qr", "user", user.id, actor=user)
    db.commit()
    return user_out(user)


@router.get("/payout-qr")
def my_payout_qr(user: User = Depends(get_current_user)):
    if not user.payout_qr_key:
        raise HTTPException(404, "No payout QR uploaded")
    data = storage.read_private(user.payout_qr_key)
    return Response(data, media_type=storage.sniff(data) or "image/png",
                    headers={"Cache-Control": "private, no-store"})


@router.post("/password")
@limiter.limit("10/hour")
def change_password(request: Request, body: PasswordIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if user.has_password and not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Your current password is incorrect")
    if not user.email:
        raise HTTPException(400, "Add an email address to your profile first")
    user.password_hash = hash_password(body.new_password)
    audit.log(db, "user.password_change", "user", user.id, actor=user)
    db.commit()
    return {"ok": True}


@router.post("/link/google")
def link_google(body: GoogleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    info = social.verify_google_access_token(body.access_token) if body.access_token else social.verify_google(body.credential or "")
    if not info.get("email_verified"):
        raise HTTPException(400, "Your Google email is not verified")
    social.link_provider(db, user, "google", str(info["sub"]), info.get("email") or "")
    if not user.email:
        email = (info.get("email") or "").lower()
        if email and not db.query(User.id).filter(func.lower(User.email) == email).first():
            user.email, user.email_verified = email, True
    audit.log(db, "user.link_google", "user", user.id, actor=user)
    db.commit()
    return user_out(user)


@router.post("/link/telegram")
def link_telegram(body: TelegramWidgetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tg = social.verify_telegram_widget(body.model_dump(exclude={"remember"}, exclude_none=True))
    social.link_telegram(db, user, tg)
    audit.log(db, "user.link_telegram", "user", user.id, actor=user)
    db.commit()
    return user_out(user)


@router.post("/link/telegram-app")
def link_telegram_app(body: TelegramAppIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tg = social.verify_telegram_webapp(body.init_data)
    social.link_telegram(db, user, tg)
    db.commit()
    return user_out(user)


@router.delete("/link/{provider}")
def unlink(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.query(UserAuthProvider).filter_by(user_id=user.id, provider=provider).first()
    if not row:
        raise HTTPException(404, "Not linked")
    others = len([p for p in user.providers if p.provider != provider])
    if not user.has_password and others == 0:
        raise HTTPException(400, "Set a password first, or you would have no way to sign in")
    db.delete(row)
    if provider == "telegram":
        user.telegram_id = None
    audit.log(db, f"user.unlink_{provider}", "user", user.id, actor=user)
    db.commit()
    db.refresh(user)
    return user_out(user)


@router.get("/invoices")
def invoices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (db.query(Order).filter(Order.buyer_id == user.id, Order.invoice != None)  # noqa: E711
            .order_by(Order.created_at.desc()).all())
    return [{"invoice_number": o.invoice.invoice_number, "order_number": o.order_number,
             "issued_at": iso(o.invoice.issued_at), "total_cents": o.invoice.total_cents,
             "concert_title": o.items[0].concert_title, "status": o.status.value} for o in rows]


# ---------------------------------------------------------------- wallet
@router.get("/wallet")
def my_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    w = wallet.get_wallet(db, user.id)
    db.commit()
    txs = (db.query(WalletTransaction).filter_by(wallet_id=w.id).order_by(WalletTransaction.id.desc()).limit(100).all())
    return {"pending_cents": w.pending_cents, "available_cents": w.available_cents, "held_cents": w.held_cents,
            "withdrawn_cents": w.withdrawn_cents, "min_withdrawal_cents": wallet.MIN_WITHDRAWAL,
            "transactions": [{"id": t.id, "type": t.type.value, "amount_cents": t.amount_cents, "note": t.note,
                              "available_after": t.available_after, "pending_after": t.pending_after,
                              "created_at": iso(t.created_at)} for t in txs]}


@router.get("/withdrawals")
def my_withdrawals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(WithdrawalRequest).filter_by(user_id=user.id).order_by(WithdrawalRequest.id.desc()).all()
    return [withdrawal_out(w) for w in rows]


@router.post("/withdrawals", status_code=201)
@limiter.limit("10/hour")
def request_withdrawal(request: Request, body: WithdrawalIn, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    req = wallet.request_withdrawal(db, user, body.amount, body.method, body.account_name, body.account_number)
    db.flush()
    db.refresh(req)
    notify.withdrawal_requested(db, req)
    db.commit()
    return withdrawal_out(req)


@router.get("/orders")
def orders_alias(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Order).filter_by(buyer_id=user.id).order_by(Order.created_at.desc()).limit(100).all()
    return [order_out(o) for o in rows]
