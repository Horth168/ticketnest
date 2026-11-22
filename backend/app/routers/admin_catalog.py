"""Admin: artists, concerts, ticket categories, images."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Artist, Concert, ConcertStatus, TicketCategory, TicketListing, User
from app.schemas import ArtistIn, ConcertIn
from app.security import require_admin, require_staff
from app.serializers import artist_out, concert_card
from app.services import audit, storage
from app.utils import iso, slugify, to_cents

router = APIRouter(prefix="/api/admin", tags=["Admin · catalogue"])


def _unique_slug(db: Session, model, base: str, current_id: int | None = None) -> str:
    slug, n = base, 2
    while (row := db.query(model).filter_by(slug=slug).first()) and row.id != current_id:
        slug = f"{base}-{n}"
        n += 1
    return slug


# ---------------------------------------------------------------- artists
@router.get("/artists")
def list_artists(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    counts = dict(db.query(Concert.artist_id, func.count(Concert.id)).group_by(Concert.artist_id).all())
    return [artist_out(a, upcoming=counts.get(a.id, 0)) for a in db.query(Artist).order_by(Artist.name).all()]


@router.post("/artists", status_code=201)
def create_artist(body: ArtistIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    if db.query(Artist).filter(func.lower(Artist.name) == body.name.lower()).first():
        raise HTTPException(409, "This artist already exists")
    a = Artist(**body.model_dump(), slug=_unique_slug(db, Artist, slugify(body.name)))
    db.add(a)
    db.flush()
    audit.log(db, "artist.create", "artist", a.id, actor=user, data={"name": a.name})
    db.commit()
    return artist_out(a)


@router.put("/artists/{artist_id}")
def update_artist(artist_id: int, body: ArtistIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    a = db.get(Artist, artist_id)
    if not a:
        raise HTTPException(404, "Artist not found")
    clash = db.query(Artist).filter(func.lower(Artist.name) == body.name.lower(), Artist.id != a.id).first()
    if clash:
        raise HTTPException(409, "Another artist has this name")
    for k, v in body.model_dump().items():
        setattr(a, k, v)
    a.slug = _unique_slug(db, Artist, slugify(body.name), a.id)
    audit.log(db, "artist.update", "artist", a.id, actor=user)
    db.commit()
    return artist_out(a)


@router.delete("/artists/{artist_id}")
def delete_artist(artist_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    a = db.get(Artist, artist_id)
    if not a:
        raise HTTPException(404, "Artist not found")
    if db.query(Concert.id).filter_by(artist_id=a.id).first():
        a.is_active = False  # keep history: concerts and orders point at it
        msg = "Artist has concerts, so it was hidden instead of deleted"
    else:
        db.delete(a)
        msg = "Artist deleted"
    audit.log(db, "artist.delete", "artist", artist_id, actor=user)
    db.commit()
    return {"ok": True, "message": msg}


# ---------------------------------------------------------------- uploads (public images)
@router.post("/uploads/image")
async def upload_image(folder: str = "posters", file: UploadFile = File(...), _: User = Depends(require_staff)):
    if folder not in ("posters", "artists", "brand"):
        raise HTTPException(400, "Unknown folder")
    data, kind = await storage.read_upload(file, allow_pdf=False)
    return {"url": storage.save_public(data, kind, folder)}


# ---------------------------------------------------------------- concerts
def concert_admin(db: Session, c: Concert) -> dict:
    listed = dict(db.query(TicketListing.status, func.count(TicketListing.id))
                  .filter(TicketListing.concert_id == c.id).group_by(TicketListing.status).all())
    return {**concert_card(c), "artist_id": c.artist_id, "description": c.description, "doors_open": c.doors_open,
            "delivery_info": c.delivery_info, "created_at": iso(c.created_at),
            "listing_counts": {k.value if hasattr(k, "value") else k: v for k, v in listed.items()},
            "categories": [{"id": x.id, "name": x.name, "description": x.description,
                            "face_value_cents": x.face_value_cents, "sort_order": x.sort_order,
                            "is_active": x.is_active} for x in c.categories]}


@router.get("/concerts")
def list_concerts(db: Session = Depends(get_db), _: User = Depends(require_staff), q: str = ""):
    query = db.query(Concert).join(Artist).options(joinedload(Concert.artist))
    if q:
        query = query.filter(Concert.title.ilike(f"%{q[:80]}%") | Artist.name.ilike(f"%{q[:80]}%"))
    return [concert_admin(db, c) for c in query.order_by(Concert.starts_at.desc()).all()]


@router.get("/concerts/{concert_id}")
def get_concert(concert_id: int, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    c = db.get(Concert, concert_id)
    if not c:
        raise HTTPException(404, "Concert not found")
    return concert_admin(db, c)


def _apply_categories(db: Session, c: Concert, cats) -> None:
    seen = set()
    by_id = {x.id: x for x in c.categories}
    for i, ci in enumerate(cats):
        key = ci.name.lower()
        if key in seen:
            raise HTTPException(422, f"Category '{ci.name}' is listed twice")
        seen.add(key)
        face = to_cents(ci.face_value) if ci.face_value not in (None, "") else None
        row = by_id.pop(ci.id, None) if ci.id else None
        if row is None:
            row = TicketCategory(concert=c)
            c.categories.append(row)
        row.name, row.description, row.face_value_cents = ci.name, ci.description, face
        row.sort_order, row.is_active = ci.sort_order or i, ci.is_active
    for leftover in by_id.values():   # removed from the form
        if db.query(TicketListing.id).filter_by(category_id=leftover.id).first():
            leftover.is_active = False   # listings use it: hide, don't delete
        else:
            c.categories.remove(leftover)


@router.post("/concerts", status_code=201)
def create_concert(body: ConcertIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    artist = db.get(Artist, body.artist_id)
    if not artist:
        raise HTTPException(400, "Choose an artist")
    data = body.model_dump(exclude={"categories"})
    data["status"] = ConcertStatus(data["status"])
    c = Concert(**data, slug=_unique_slug(db, Concert, slugify(f"{artist.name} {body.title} {body.city}")))
    db.add(c)
    _apply_categories(db, c, body.categories)
    db.flush()
    audit.log(db, "concert.create", "concert", c.id, actor=user, data={"title": c.title})
    db.commit()
    return concert_admin(db, c)


@router.put("/concerts/{concert_id}")
def update_concert(concert_id: int, body: ConcertIn, db: Session = Depends(get_db), user: User = Depends(require_staff)):
    c = db.get(Concert, concert_id)
    if not c:
        raise HTTPException(404, "Concert not found")
    if not db.get(Artist, body.artist_id):
        raise HTTPException(400, "Choose an artist")
    for k, v in body.model_dump(exclude={"categories"}).items():
        setattr(c, k, ConcertStatus(v) if k == "status" else v)
    _apply_categories(db, c, body.categories)
    audit.log(db, "concert.update", "concert", c.id, actor=user)
    db.commit()
    db.refresh(c)
    return concert_admin(db, c)


@router.delete("/concerts/{concert_id}")
def delete_concert(concert_id: int, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    c = db.get(Concert, concert_id)
    if not c:
        raise HTTPException(404, "Concert not found")
    if db.query(TicketListing.id).filter_by(concert_id=c.id).first():
        c.is_published = False
        msg = "This concert has listings, so it was unpublished instead of deleted"
    else:
        db.delete(c)
        msg = "Concert deleted"
    audit.log(db, "concert.delete", "concert", concert_id, actor=user)
    db.commit()
    return {"ok": True, "message": msg}
