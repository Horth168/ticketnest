"""Demo content created once on startup, so the owner can try the seat map, ticket picking and the
reviews slider on the live site.

Safety rules (TicketNest never shows invented events or reviews to customers):
- the demo concert is UNPUBLISHED and flagged is_demo: only staff can open it, it never appears in
  lists, search, share links or alerts, and checkout refuses it (unpublished concerts can't be bought);
- sample reviews are flagged is_sample: shown only to staff in preview mode and can't be approved.
Delete them any time from the admin (Concerts / Reviews); they are not re-created after that.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (Artist, Concert, ConcertStatus, ListingStatus, PlatformSetting, Review, ReviewStatus,
                        TicketCategory, TicketListing, TicketType)

log = logging.getLogger("ticketnest.demo")
FLAG = "demo_seeded_v1"
SLUG = "demo-bts-world-tour-kuala-lumpur"

# category, description, face value (USD), stadium zones, demo listings: (seat, price USD, qty)
CATEGORIES = [
    ("VIP Standing", "Floor pen right in front of the stage, early entry", 350, "FA-L,FA-R",
     [("Pen A1 · standing", 420, 2), ("Pen A2 · standing", 445, 1)]),
    ("CAT 1 Standing", "Floor pen behind VIP", 250, "FB-L,FB-R",
     [("Pen B1 · standing", 290, 2), ("Pen B2 · standing", 275, 4)]),
    ("CAT 2", "Lower tier, side view close to the stage", 190, "L1,L2,L3,L10,L11,L12",
     [("Section L2 · Row 8 · Seats 14-15", 230, 2), ("Section L11 · Row 15 · Seat 3", 215, 1)]),
    ("CAT 3", "Lower tier, facing the stage", 150, "L4,L5,L6,L7,L8,L9",
     [("Section L6 · Row 20 · Seats 7-8", 175, 2), ("Section L8 · Row 11 · Seat 22", 170, 1)]),
    ("CAT 4", "Upper tier, side", 110, "U1,U2,U3,U4,U11,U12,U13,U14",
     [("Section U3 · Row 5 · Seats 1-3", 128, 3)]),
    ("CAT 5", "Upper tier, facing the stage", 80, "U5,U6,U7,U8,U9,U10",
     [("Section U7 · Row 12 · Seat 30", 95, 1), ("Section U9 · Row 3 · Seats 10-11", 92, 2)]),
]

SAMPLE_REVIEWS = [
    ("Sample · Dara", 5, "The seller's ticket was checked before I paid and the team sent it to me on Telegram the same day. So easy!", "buyer"),
    ("Sample · Sreyneang", 5, "Paid with KHQR in a few seconds. Loved that I could see exactly where my seat was on the map.", "buyer"),
    ("Sample · Visal", 4, "I couldn't go to the concert, listed my ticket and got paid to my ABA after the buyer received it.", "seller"),
    ("Sample · Malis", 5, "Finally a safe place to buy K-pop tickets in Cambodia without worrying about scams.", "buyer"),
    ("Sample · Rithy", 5, "Clear prices, fast replies from the team and my ticket worked at the gate. Will buy again.", "buyer"),
    ("Sample · Chanthy", 4, "Selling was simple: upload proof, wait for approval, done. The wallet shows everything.", "seller"),
]


def seed_once(db: Session) -> bool:
    if db.get(PlatformSetting, FLAG):
        return False
    artist = db.query(Artist).filter(Artist.slug == "bts").first() or db.query(Artist).filter(Artist.name == "BTS").first()
    if artist is None:
        artist = Artist(name="BTS", slug="bts", agency="BIGHIT MUSIC", image_url="/artists/bts.png", is_popular=True)
        db.add(artist)
        db.flush()
    if not db.query(Concert.id).filter_by(slug=SLUG).first():
        c = Concert(artist=artist, slug=SLUG, title="BTS World Tour · Kuala Lumpur (DEMO)",
                    venue="Bukit Jalil National Stadium", city="Kuala Lumpur", country="Malaysia",
                    starts_at=datetime(2027, 1, 23, 12, 0, tzinfo=timezone.utc),   # 20:00 in Kuala Lumpur
                    doors_open="17:00", poster_url="/demo/bts-kl-demo.jpg", seat_layout="stadium",
                    status=ConcertStatus.scheduled, is_published=False, is_demo=True, is_featured=False,
                    description=("DEMO ONLY — this concert is sample content for trying the seat map and ticket "
                                 "picking. It is hidden from customers and can't be bought.\n\n"
                                 "Tap a colour on the map or a category to see where the seats are."))
        db.add(c)
        db.flush()
        for i, (name, desc, face, zones, listings) in enumerate(CATEGORIES):
            cat = TicketCategory(concert=c, name=name, description=desc, face_value_cents=face * 100,
                                 sort_order=i, map_zones=zones)
            db.add(cat)
            db.flush()
            for seat, price, qty in listings:
                db.add(TicketListing(seller_id=None, concert_id=c.id, category_id=cat.id,
                                     original_price_cents=face * 100, price_cents=price * 100, quantity=qty,
                                     seat_info=seat, ticket_type=TicketType.e_ticket, status=ListingStatus.available,
                                     notes="Demo listing, not for sale."))
    if not db.query(Review.id).filter(Review.is_sample.is_(True)).first():
        for name, rating, text, role in SAMPLE_REVIEWS:
            db.add(Review(name=name, rating=rating, text=text, role=role, status=ReviewStatus.pending, is_sample=True))
    db.add(PlatformSetting(key=FLAG, value={"done": True}))
    db.commit()
    log.info("Demo concert and sample reviews created (staff-only)")
    return True
