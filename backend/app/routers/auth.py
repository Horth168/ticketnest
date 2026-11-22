"""Sign-up, sign-in (email, Google, Telegram widget, Telegram Mini App), refresh, password reset."""
import hashlib
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.limiter import client_ip, limiter
from app.models import PasswordResetToken, RefreshToken, Role, User
from app.schemas import (ForgotIn, GoogleIn, LoginIn, RefreshIn, RegisterIn, ResetIn, TelegramAppIn,
                         TelegramWidgetIn)
from app.security import hash_password, issue_tokens, revoke_refresh_token, rotate_refresh_token, verify_password
from app.serializers import user_out
from app.services import audit, email as mail, notify, social
from app.utils import as_aware, utcnow

router = APIRouter(prefix="/api/auth", tags=["Auth"])
_DUMMY_HASH = hash_password("dummy-password-123")
FORGOT_MESSAGE = "If an account exists for that email, we've sent a link to reset your password."


def _session(db: Session, user: User, remember: bool = True) -> dict:
    tokens = issue_tokens(db, user, remember=remember)
    return {**tokens, "user": user_out(user)}


@router.post("/register", status_code=201)
@limiter.limit("10/hour")
def register(request: Request, body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(409, "An account with this email already exists. Sign in instead.")
    user = User(email=email, password_hash=hash_password(body.password), full_name=body.full_name, phone=body.phone,
                role=Role.customer)
    db.add(user)
    db.flush()
    audit.log(db, "user.register", "user", user.id, actor=user, ip=client_ip(request))
    notify.new_registration(db, user, "email")
    out = _session(db, user, body.remember)
    mail.send_welcome(email, user.full_name)
    return out


@router.post("/login")
@limiter.limit("10/minute")
def login(request: Request, body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(func.lower(User.email) == body.email.lower()).first()
    ok = verify_password(body.password, user.password_hash if user and user.password_hash else _DUMMY_HASH)
    if not user or not ok:
        if user and not user.password_hash:
            raise HTTPException(401, "This account signs in with Google or Telegram. Use that button, or reset "
                                     "your password to add one.")
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been disabled")
    return _session(db, user, body.remember)


@router.post("/refresh")
@limiter.limit("30/minute")
def refresh(request: Request, body: RefreshIn, db: Session = Depends(get_db)):
    return rotate_refresh_token(db, body.refresh_token)


@router.post("/logout", status_code=204)
def logout(body: RefreshIn, db: Session = Depends(get_db)):
    revoke_refresh_token(db, body.refresh_token)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/forgot-password")
@limiter.limit("5/hour")
def forgot_password(request: Request, body: ForgotIn, db: Session = Depends(get_db)):
    """Always the same answer, so the form can't be used to discover who has an account."""
    user = db.query(User).filter(func.lower(User.email) == body.email.lower(), User.is_active.is_(True)).first()
    if user:
        token = secrets.token_urlsafe(32)
        db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id,
                                            PasswordResetToken.used_at.is_(None)).update({"used_at": utcnow()})
        db.add(PasswordResetToken(user_id=user.id, token_hash=_hash(token),
                                  expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRE_MINUTES)))
        db.commit()
        mail.send_password_reset(user.email, user.full_name, f"{settings.SITE_URL.rstrip('/')}/reset-password?token={token}")
    return {"ok": True, "message": FORGOT_MESSAGE}


@router.post("/reset-password")
@limiter.limit("10/hour")
def reset_password(request: Request, body: ResetIn, db: Session = Depends(get_db)):
    row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == _hash(body.token)).first()
    if not row or row.used_at is not None or as_aware(row.expires_at) < utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, "This reset link is invalid or has expired. Request a new one.")
    user.password_hash = hash_password(body.password)
    user.email_verified = True   # they proved they can read this inbox
    user.token_version += 1      # sign out every device
    row.used_at = utcnow()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    audit.log(db, "user.password_reset", "user", user.id, actor=user, ip=client_ip(request))
    db.commit()
    return {"ok": True, "message": "Your password has been reset. You can sign in now."}


# ---------------------------------------------------------------- social sign-in
@router.post("/google")
@limiter.limit("20/minute")
def google_login(request: Request, body: GoogleIn, db: Session = Depends(get_db)):
    if body.access_token:
        info = social.verify_google_access_token(body.access_token)
    elif body.credential:
        info = social.verify_google(body.credential)
    else:
        raise HTTPException(422, "Missing Google sign-in data")
    user, created = social.user_from_google(db, info)
    if created:
        notify.new_registration(db, user, "Google")
        mail.send_welcome(user.email, user.full_name)
    return _session(db, user, body.remember)


@router.post("/telegram")
@limiter.limit("20/minute")
def telegram_login(request: Request, body: TelegramWidgetIn, db: Session = Depends(get_db)):
    data = body.model_dump(exclude={"remember"}, exclude_none=True)
    tg = social.verify_telegram_widget(data)
    user, created = social.user_from_telegram(db, tg)
    if created:
        notify.new_registration(db, user, "Telegram")
    return _session(db, user, body.remember)


@router.post("/telegram-app")
@limiter.limit("30/minute")
def telegram_app_login(request: Request, body: TelegramAppIn, db: Session = Depends(get_db)):
    """Mini App: the signed initData from Telegram is the only thing trusted."""
    tg = social.verify_telegram_webapp(body.init_data)
    user, created = social.user_from_telegram(db, tg, allows_write=bool(tg.get("allows_write_to_pm")))
    if created:
        notify.new_registration(db, user, "Telegram Mini App")
    return _session(db, user, True)
