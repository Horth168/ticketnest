"""Fan features: 'Notify me' alerts, reviews (approved by admins), share links with rich previews,
website error reports, plus the admin side of reviews and database backups."""
from html import escape
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models import (Concert, ConcertAlert, Order, OrderItem, OrderStatus, Review, ReviewStatus, Role,
                        TicketListing, User)
from app.schemas import Clean
from app.security import get_current_user, get_optional_user, require_admin, require_staff
from app.services import alerts, audit, backup
from app.services import telegram as tg
from app.utils import iso, utcnow

from app.services.human import require_human

router = APIRouter(tags=["Fans"])
DONE = (OrderStatus.delivered, OrderStatus.completed)


def _concert(db: Session, slug: str) -> Concert:
    c = db.query(Concert).filter_by(slug=slug).first()
    if not c or not c.is_published:
        raise HTTPException(404, "Concert not found")
    return c


# ---------------------------------------------------------------- notify me
@router.get("/api/concerts/{slug}/alert")
def alert_status(slug: str, db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user)):
    c = db.query(Concert).filter_by(slug=slug).first()
    if not c:
        raise HTTPException(404, "Concert not found")
    on = bool(user and db.query(ConcertAlert.id).filter_by(user_id=user.id, concert_id=c.id).first())
    return {"subscribed": on, "followers": db.query(func.count(ConcertAlert.id)).filter_by(concert_id=c.id).scalar()}


@router.post("/api/concerts/{slug}/alert")
@limiter.limit("30/minute")
def alert_on(request: Request, slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = _concert(db, slug)
    if not db.query(ConcertAlert.id).filter_by(user_id=user.id, concert_id=c.id).first():
        db.add(ConcertAlert(user_id=user.id, concert_id=c.id))
        db.commit()
    linked = bool(user.telegram_id)
    return {"subscribed": True, "telegram": linked, "email": bool(user.email)}


@router.delete("/api/concerts/{slug}/alert")
def alert_off(slug: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    c = db.query(Concert).filter_by(slug=slug).first()
    if c:
        db.query(ConcertAlert).filter_by(user_id=user.id, concert_id=c.id).delete()
        db.commit()
    return {"subscribed": False}


# ---------------------------------------------------------------- reviews
class ReviewIn(Clean):
    rating: int = Field(ge=1, le=5)
    text: str = Field(min_length=10, max_length=600)


def review_out(r: Review, *, admin: bool = False) -> dict:
    d = {"id": r.id, "name": r.name, "rating": r.rating, "text": r.text, "role": r.role,
         "avatar_url": r.user.avatar_url if r.user else "", "is_sample": r.is_sample, "created_at": iso(r.created_at)}
    if admin:
        d.update(status=r.status.value, user_id=r.user_id,
                 email=r.user.email if r.user else None, reviewed_at=iso(r.reviewed_at))
    return d


def _role(db: Session, user: User) -> str:
    bought = (db.query(Order.id).filter(Order.buyer_id == user.id, Order.status.in_(DONE)).first())
    sold = (db.query(OrderItem.id).join(Order, Order.id == OrderItem.order_id)
            .join(TicketListing, TicketListing.id == OrderItem.listing_id)
            .filter(TicketListing.seller_id == user.id, Order.status.in_(DONE)).first())
    return "buyer" if bought else "seller" if sold else ""


@router.get("/api/reviews")
def public_reviews(db: Session = Depends(get_db), user: Optional[User] = Depends(get_optional_user), preview: int = 0):
    """Approved reviews for the homepage slider. Staff with ?preview=1 also see sample content."""
    staff = bool(user and user.role in (Role.staff, Role.admin))
    if not (preview and staff):
        from app.cache import cached
        return cached("reviews", 30, lambda: _public_reviews(db, None, 0))
    return _public_reviews(db, user, preview)


def _public_reviews(db: Session, user, preview: int):
    q = db.query(Review).filter(Review.status == ReviewStatus.approved, Review.is_sample.is_(False))
    rows = q.order_by(Review.created_at.desc()).limit(30).all()
    staff = bool(user and user.role in (Role.staff, Role.admin))
    samples = []
    if preview and staff:
        samples = db.query(Review).filter(Review.is_sample.is_(True)).order_by(Review.id).all()
    avg = db.query(func.avg(Review.rating), func.count(Review.id)).filter(
        Review.status == ReviewStatus.approved, Review.is_sample.is_(False)).first()
    return {"reviews": [review_out(r) for r in rows + samples],
            "average": round(float(avg[0]), 1) if avg[0] else None, "count": int(avg[1] or 0),
            "preview": bool(samples)}


@router.get("/api/reviews/mine")
def my_review(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.query(Review).filter_by(user_id=user.id, is_sample=False).order_by(Review.id.desc()).first()
    return {"review": review_out(r, admin=True) if r else None, "role": _role(db, user)}


@router.post("/api/reviews", status_code=201)
@limiter.limit("5/hour")
def write_review(request: Request, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(get_current_user),
                 _h: None = Depends(require_human)):
    """One review per customer; writing again replaces it and sends it back for approval."""
    r = db.query(Review).filter_by(user_id=user.id, is_sample=False).first()
    if r is None:
        r = Review(user_id=user.id)
        db.add(r)
    r.name = (user.full_name.split(" ")[0] + (f" {user.full_name.split(' ')[1][0]}." if " " in user.full_name else ""))[:80]
    r.rating, r.text, r.role = body.rating, body.text, _role(db, user)
    r.status, r.reviewed_at, r.reviewed_by_id = ReviewStatus.pending, None, None
    db.flush()
    base = settings.SITE_URL.rstrip("/")
    link = f'\n<a href="{tg.e(base)}/admin/reviews">Review it in admin</a>' if base.startswith("https://") else ""
    tg.queue_admin(db, f"⭐ <b>TICKETNEST — NEW REVIEW</b>\n{'★' * r.rating}{'☆' * (5 - r.rating)} by {tg.e(r.name)}"
                       f"{' (' + r.role + ')' if r.role else ''}\n“{tg.e(r.text[:300])}”\nStatus: Pending approval{link}",
                   kind="review_new")
    db.commit()
    return review_out(r, admin=True)


@router.get("/api/admin/reviews")
def admin_reviews(db: Session = Depends(get_db), _: User = Depends(require_staff), status: str = ""):
    q = db.query(Review)
    if status == "sample":
        q = q.filter(Review.is_sample.is_(True))
    elif status in ("pending", "approved", "rejected"):
        q = q.filter(Review.status == ReviewStatus(status), Review.is_sample.is_(False))
    rows = q.order_by(Review.is_sample, Review.created_at.desc()).limit(300).all()
    counts = {k.value if hasattr(k, "value") else k: v for k, v in db.query(Review.status, func.count(Review.id))
              .filter(Review.is_sample.is_(False)).group_by(Review.status).all()}
    counts["sample"] = db.query(func.count(Review.id)).filter(Review.is_sample.is_(True)).scalar()
    return {"reviews": [review_out(r, admin=True) for r in rows], "counts": counts}


@router.post("/api/admin/reviews/{review_id}/{action}")
def moderate_review(review_id: int, action: Literal["approve", "reject"], db: Session = Depends(get_db),
                    user: User = Depends(require_staff)):
    r = db.get(Review, review_id)
    if not r:
        raise HTTPException(404, "Review not found")
    if r.is_sample:
        raise HTTPException(409, "Sample reviews are preview content written by TicketNest and can't be published "
                                 "as customer reviews. Delete them once real reviews arrive.")
    r.status = ReviewStatus.approved if action == "approve" else ReviewStatus.rejected
    r.reviewed_at, r.reviewed_by_id = utcnow(), user.id
    audit.log(db, f"review.{action}", "review", r.id, actor=user)
    db.commit()
    return review_out(r, admin=True)


@router.delete("/api/admin/reviews/{review_id}")
def delete_review(review_id: int, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    r = db.get(Review, review_id)
    if r:
        audit.log(db, "review.delete", "review", r.id, actor=user)
        db.delete(r)
        db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- share links with rich previews
def _abs(url: str) -> str:
    if not url:
        return f"{settings.SITE_URL.rstrip('/')}/og-image.png"
    return url if url.startswith("http") else f"{settings.SITE_URL.rstrip('/')}/{url.lstrip('/')}"


@router.get("/s/c/{slug}", response_class=HTMLResponse, include_in_schema=False)
def share_concert(slug: str, db: Session = Depends(get_db)):
    """Telegram / Facebook / Messenger read these tags for the link card; people are sent straight on
    to the concert page."""
    from app.routers.catalog import stats_for
    from app.utils import fmt_local, fmt_usd2
    c = db.query(Concert).filter_by(slug=slug).first()
    if not c or not c.is_published or c.is_demo:
        raise HTTPException(404, "Concert not found")
    st = stats_for(db, [c.id]).get(c.id, {})
    target = f"{settings.SITE_URL.rstrip('/')}/concerts/{c.slug}"
    when = fmt_local(c.starts_at, "%a %d %b %Y")
    price = f" · from {fmt_usd2(st['from_price'])}" if st.get("from_price") else ""
    avail = f"{st['available']} verified tickets on sale" if st.get("available") else "Tap “Notify me” to hear when tickets appear"
    title = f"{c.title}{price}"
    desc = f"{when} · {c.venue}, {c.city}. {avail} on TicketNest: checked by our team, paid with KHQR."
    t, d, img, u = escape(title), escape(desc), escape(_abs(c.poster_url)), escape(target)
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>{t} · TicketNest</title>
<meta name="description" content="{d}">
<meta property="og:type" content="website"><meta property="og:site_name" content="TicketNest">
<meta property="og:title" content="{t}"><meta property="og:description" content="{d}">
<meta property="og:image" content="{img}"><meta property="og:url" content="{u}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}"><meta name="twitter:image" content="{img}">
<link rel="canonical" href="{u}"><meta http-equiv="refresh" content="0;url={u}">
</head><body style="font-family:system-ui;background:#0A0910;color:#fff;padding:40px;text-align:center">
<p>Opening <a style="color:#C4B5FF" href="{u}">{t}</a>…</p><script>location.replace({target!r})</script></body></html>"""
    return HTMLResponse(html, headers={"Cache-Control": "public, max-age=600"})


# ---------------------------------------------------------------- website errors -> Telegram
class ClientErrorIn(Clean):
    message: str = Field(max_length=500)
    page: str = Field("", max_length=300)
    source: str = Field("", max_length=300)


@router.post("/api/client-errors", status_code=204)
@limiter.limit("10/minute")
def client_error(request: Request, body: ClientErrorIn):
    alerts.client_error(body.message, body.page, body.source)
    return Response(status_code=204)


# ---------------------------------------------------------------- backups (admins only)
@router.get("/api/admin/backups")
def list_backups(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from app.models import PlatformSetting
    last = db.get(PlatformSetting, backup.STATE_KEY)
    return {"last": last.value if last else None, "keep_days": backup.KEEP_DAYS, "hour": backup.BACKUP_HOUR,
            "files": [{"name": o["key"].split("/")[-1], "size": o["size"], "created_at": iso(o["modified"])}
                      for o in backup.list_backups()]}


@router.post("/api/admin/backups")
@limiter.limit("6/hour")
def backup_now(request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    try:
        info = backup.run(db)
    except Exception as e:  # noqa: BLE001
        alerts.job_error("backup (manual)", e)
        raise HTTPException(502, "Backup failed. Check the storage settings.") from e
    audit.log(db, "backup.create", "backup", info["name"], actor=user)
    db.commit()
    return info


@router.get("/api/admin/backups/{name}")
def download_backup(name: str, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    try:
        data = backup.read(name)
    except ValueError as e:
        raise HTTPException(400, "Invalid backup name") from e
    audit.log(db, "backup.download", "backup", name, actor=user)
    db.commit()
    return Response(data, media_type="application/gzip",
                    headers={"Content-Disposition": f'attachment; filename="{name}"', "Cache-Control": "no-store"})
