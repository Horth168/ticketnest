"""Public catalogue: artists, concerts, live ticket availability. Only approved, on-sale listings
are ever returned; pending / rejected listings never leave the admin and seller views."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import (PUBLIC_LISTING, Artist, Concert, ConcertStatus, Order, OrderItem, OrderStatus, Role,
                        TicketCategory, TicketListing, User)
from app.security import get_optional_user
from app.serializers import artist_out, concert_card, listing_public
from app.services.pricing import buyer_unit_price, quote_for
from app.services.settings_store import get_setting, public_settings
from app.cache import cached
from app.utils import as_aware, utcnow

router = APIRouter(prefix="/api", tags=["Catalogue"])
L = TicketListing
AVAILABLE = (L.quantity - L.quantity_reserved - L.quantity_sold)


def _live_concerts(db: Session):
    return (db.query(Concert).join(Artist).options(joinedload(Concert.artist))
            .filter(Concert.is_published.is_(True), Artist.is_active.is_(True),
                    Concert.status.in_([ConcertStatus.scheduled, ConcertStatus.postponed]),
                    Concert.starts_at >= utcnow()))


def stats_for(db: Session, concert_ids: list[int]) -> dict[int, dict]:
    if not concert_ids:
        return {}
    rows = (db.query(L.concert_id, func.sum(AVAILABLE), func.min(L.price_cents), func.count(L.id))
            .filter(L.concert_id.in_(concert_ids), L.status == "available", AVAILABLE > 0)
            .group_by(L.concert_id).all())
    out = {}
    for cid, avail, min_price, n in rows:
        out[cid] = {"available": int(avail or 0), "from_price": buyer_unit_price(db, int(min_price)) if min_price else None,
                    "listings": int(n)}
    return out


def _cards(db: Session, concerts: list[Concert]) -> list[dict]:
    st = stats_for(db, [c.id for c in concerts])
    return [concert_card(c, st.get(c.id)) for c in concerts]


@router.get("/settings/public")
def settings_public(db: Session = Depends(get_db)):
    return cached("settings", 30, lambda: _settings_public(db))


def _settings_public(db: Session = Depends(get_db)):
    return public_settings(db)


@router.get("/home")
def home(db: Session = Depends(get_db)):
    return cached("home", 15, lambda: _home(db))


def _home(db: Session = Depends(get_db)):
    upcoming = _live_concerts(db).order_by(Concert.starts_at).limit(12).all()
    featured = _live_concerts(db).filter(Concert.is_featured.is_(True)).order_by(Concert.starts_at).limit(6).all()
    artists = (db.query(Artist).filter(Artist.is_active.is_(True))
               .order_by(Artist.is_popular.desc(), Artist.name).limit(14).all())
    recent = (db.query(L).join(Concert).options(joinedload(L.concert).joinedload(Concert.artist), joinedload(L.category))
              .filter(L.status == "available", AVAILABLE > 0, Concert.is_published.is_(True),
                      Concert.starts_at >= utcnow())
              .order_by(L.created_at.desc()).limit(8).all())
    categories = (db.query(TicketCategory.name, func.count(L.id)).join(L, L.category_id == TicketCategory.id)
                  .filter(L.status == "available", AVAILABLE > 0).group_by(TicketCategory.name)
                  .order_by(func.count(L.id).desc()).limit(8).all())
    return {
        "featured": _cards(db, featured or upcoming[:3]),
        "upcoming": _cards(db, upcoming),
        "artists": [artist_out(a) for a in artists],
        "recent_listings": [{**listing_public(db, l), "concert": concert_card(l.concert)} for l in recent],
        "categories": [{"name": n, "listings": c} for n, c in categories],
    }


@router.get("/artists")
def artists(db: Session = Depends(get_db), q: str = ""):
    return cached(f"artists|{q[:60].lower()}", 60, lambda: _artists(db, q))


def _artists(db: Session = Depends(get_db), q: str = ""):
    query = db.query(Artist).filter(Artist.is_active.is_(True))
    if q:
        query = query.filter(Artist.name.ilike(f"%{q[:60]}%"))
    rows = query.order_by(Artist.is_popular.desc(), Artist.name).all()
    counts = dict(_live_concerts(db).with_entities(Concert.artist_id, func.count(Concert.id))
                  .group_by(Concert.artist_id).all())
    return [artist_out(a, upcoming=counts.get(a.id, 0)) for a in rows]


@router.get("/artists/{slug}")
def artist_detail(slug: str, db: Session = Depends(get_db)):
    return cached(f"artist|{slug[:140]}", 30, lambda: _artist_detail(slug, db))


def _artist_detail(slug: str, db: Session = Depends(get_db)):
    a = db.query(Artist).filter_by(slug=slug, is_active=True).first()
    if not a:
        raise HTTPException(404, "Artist not found")
    concerts = _live_concerts(db).filter(Concert.artist_id == a.id).order_by(Concert.starts_at).all()
    return {**artist_out(a), "concerts": _cards(db, concerts)}


@router.get("/concerts")
def concerts(request: Request, db: Session = Depends(get_db), q: str = "", artist: str = "", country: str = "", city: str = "",
             venue: str = "", date_from: datetime | None = None, date_to: datetime | None = None,
             category: str = "", available: bool = False, sort: str = "date",
             page: int = Query(1, ge=1, le=200), size: int = Query(24, ge=1, le=60)):
    return cached("concerts|" + str(request.url.query)[:400], 15, lambda: _concerts(db=db, q=q, artist=artist, country=country, city=city, venue=venue, date_from=date_from, date_to=date_to, category=category, available=available, sort=sort, page=page, size=size))


def _concerts(db: Session = Depends(get_db), q: str = "", artist: str = "", country: str = "", city: str = "",
             venue: str = "", date_from: datetime | None = None, date_to: datetime | None = None,
             category: str = "", available: bool = False, sort: str = "date",
             page: int = Query(1, ge=1, le=200), size: int = Query(24, ge=1, le=60)):
    query = _live_concerts(db)
    if q:
        like = f"%{q[:80]}%"
        query = query.filter(or_(Concert.title.ilike(like), Artist.name.ilike(like), Concert.venue.ilike(like),
                                 Concert.city.ilike(like)))
    if artist:
        query = query.filter(Artist.slug == artist)
    if country:
        query = query.filter(Concert.country == country)
    if city:
        query = query.filter(Concert.city == city)
    if venue:
        query = query.filter(Concert.venue.ilike(f"%{venue[:80]}%"))
    if date_from:
        query = query.filter(Concert.starts_at >= date_from)
    if date_to:
        query = query.filter(Concert.starts_at <= date_to)
    if category or available:
        sub = db.query(L.concert_id).filter(L.status == "available", AVAILABLE > 0)
        if category:
            sub = sub.join(TicketCategory, TicketCategory.id == L.category_id).filter(TicketCategory.name.ilike(category[:80]))
        query = query.filter(Concert.id.in_(sub))
    total = query.count()
    order = Concert.title if sort == "name" else Concert.starts_at
    rows = query.order_by(order).offset((page - 1) * size).limit(size).all()
    return {"items": _cards(db, rows), "total": total, "page": page, "size": size}


@router.get("/concerts/filters")
def concert_filters(db: Session = Depends(get_db)):
    return cached("filters", 60, lambda: _concert_filters(db))


def _concert_filters(db: Session = Depends(get_db)):
    live = _live_concerts(db)
    countries = sorted({c for (c,) in live.with_entities(Concert.country).distinct()})
    cities = sorted({(co, ci) for co, ci in live.with_entities(Concert.country, Concert.city).distinct()})
    venues = sorted({v for (v,) in live.with_entities(Concert.venue).distinct()})
    cats = sorted({n for (n,) in db.query(TicketCategory.name).join(Concert)
                   .filter(Concert.is_published.is_(True), Concert.starts_at >= utcnow()).distinct()})
    artists = [{"slug": a.slug, "name": a.name} for a in
               db.query(Artist).filter(Artist.is_active.is_(True)).order_by(Artist.name).all()]
    return {"countries": countries, "cities": [{"country": co, "city": ci} for co, ci in cities], "venues": venues,
            "categories": cats, "artists": artists}


def seller_sales(db: Session, seller_ids) -> dict[int, int]:
    """Tickets each seller has successfully delivered (shown as a trust badge on their listings)."""
    ids = [i for i in set(seller_ids) if i]
    if not ids:
        return {}
    rows = (db.query(TicketListing.seller_id, func.coalesce(func.sum(OrderItem.quantity), 0))
            .join(OrderItem, OrderItem.listing_id == TicketListing.id).join(Order, Order.id == OrderItem.order_id)
            .filter(TicketListing.seller_id.in_(ids), Order.status.in_([OrderStatus.delivered, OrderStatus.completed]))
            .group_by(TicketListing.seller_id).all())
    return {sid: int(n) for sid, n in rows}


@router.get("/concerts/{slug}")
def concert_detail(slug: str, db: Session = Depends(get_db), user: User | None = Depends(get_optional_user)):
    if user and user.role in (Role.staff, Role.admin):
        return _concert_detail(slug, db, user)
    return cached(f"concert|{slug[:220]}", 10, lambda: _concert_detail(slug, db, None))


def _concert_detail(slug: str, db: Session, user: User | None):
    c = (db.query(Concert).options(joinedload(Concert.artist), joinedload(Concert.categories))
         .filter(Concert.slug == slug).first())
    staff = bool(user and user.role in (Role.staff, Role.admin))
    if not c or not (c.is_published or staff):      # staff may preview unpublished and demo concerts
        raise HTTPException(404, "Concert not found")
    listings = (db.query(L).options(joinedload(L.category))
                .filter(L.concert_id == c.id, L.status.in_(PUBLIC_LISTING)).order_by(L.price_cents).all())
    per_cat = {}
    for l in listings:
        s = per_cat.setdefault(l.category_id, {"available": 0, "from": None})
        s["available"] += l.available
        if l.available and (s["from"] is None or l.price_cents < s["from"]):
            s["from"] = l.price_cents
    on_sale = c.status in (ConcertStatus.scheduled, ConcertStatus.postponed) and as_aware(c.starts_at) >= utcnow()
    cats = [{"id": cat.id, "name": cat.name, "description": cat.description, "face_value_cents": cat.face_value_cents,
             "zones": [z for z in cat.map_zones.split(",") if z],
             "available": per_cat.get(cat.id, {}).get("available", 0) if on_sale else 0,
             "from_price_cents": buyer_unit_price(db, per_cat[cat.id]["from"]) if per_cat.get(cat.id, {}).get("from") else None}
            for cat in c.categories if cat.is_active]
    total = sum(x["available"] for x in cats)
    st = stats_for(db, [c.id])
    sales = seller_sales(db, [l.seller_id for l in listings])
    return {**concert_card(c, st.get(c.id)), "description": c.description, "doors_open": c.doors_open,
            "delivery_info": c.delivery_info,
            "artist": artist_out(c.artist), "categories": cats, "on_sale": on_sale,
            "sold_out": on_sale and total == 0, "seat_layout": c.seat_layout, "is_demo": c.is_demo,
            "preview": not c.is_published or c.is_demo,
            "listings": [{**listing_public(db, l), "seller_sales": sales.get(l.seller_id, 0)}
                         for l in listings if l.available > 0 or l.status.value == "reserved"]
                        if on_sale else []}


@router.get("/listings/{listing_id}/quote")
def listing_quote(listing_id: int, quantity: int = Query(1, ge=1, le=10), db: Session = Depends(get_db)):
    l = db.get(L, listing_id)
    if not l or l.status not in PUBLIC_LISTING or not l.concert.is_published:
        raise HTTPException(404, "This listing is no longer on sale")
    q = quote_for(db, l.price_cents, quantity)
    return {"listing": {**listing_public(db, l), "concert": concert_card(l.concert)},
            "quantity": quantity, "available": l.available,
            "unit_price_cents": q.unit_price_cents, "unit_markup_cents": q.unit_markup_cents,
            "unit_total_cents": q.unit_total_cents, "subtotal_cents": q.subtotal_cents,
            "markup_cents": q.markup_cents, "total_cents": q.total_cents, "markup_bps": q.markup_bps,
            "khr_rate": int(get_setting(db, "currency")["khr_rate"])}
