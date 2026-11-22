"""Ticket stock. Same rule as IceQ Sole: every change is ONE conditional UPDATE, so the database
itself refuses to sell a ticket twice - even when two people press Pay at the same moment, on the
website and in the Mini App (both use this code and this database).

  available = quantity - quantity_reserved - quantity_sold

* reserve():  checkout holds tickets (reserved += n) only if n are still available
* commit():   payment verified, the hold becomes a sale (reserved -= n, sold += n)
* release():  QR expired / order cancelled, tickets go back on sale (reserved -= n)
A CHECK constraint (reserved + sold <= quantity) is the last line of defence.
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import (PUBLIC_LISTING, InventoryReservation, ListingStatus, ReservationStatus, TicketListing)
from app.utils import utcnow

L = TicketListing


def refresh_status(db: Session, listing: TicketListing) -> None:
    """available <-> reserved <-> sold, for listings that are on sale. Alerts when stock runs low / out."""
    db.refresh(listing)
    if listing.status not in (ListingStatus.available, ListingStatus.reserved, ListingStatus.sold):
        return
    before = listing.status
    if listing.available > 0:
        listing.status = ListingStatus.available
    elif listing.quantity_reserved > 0:
        listing.status = ListingStatus.reserved
    else:
        listing.status = ListingStatus.sold
    if listing.status == ListingStatus.sold and before != ListingStatus.sold:
        from app.services import notify
        notify.sold_out(db, listing)


def reserve(db: Session, listing: TicketListing, qty: int) -> None:
    res = db.execute(
        update(L).where(L.id == listing.id, L.status.in_(PUBLIC_LISTING),
                        (L.quantity - L.quantity_reserved - L.quantity_sold) >= qty)
        .values(quantity_reserved=L.quantity_reserved + qty)
        .execution_options(synchronize_session=False))
    if res.rowcount != 1:
        db.refresh(listing)
        left = listing.available if listing.status in PUBLIC_LISTING else 0
        raise HTTPException(409, "These tickets were just taken by another buyer." if left == 0
                            else f"Only {left} ticket(s) left in this listing.")
    refresh_status(db, listing)
    from app.services import notify
    notify.low_stock(db, listing)


def commit(db: Session, r: InventoryReservation) -> None:
    if r.status != ReservationStatus.active:
        if r.status == ReservationStatus.committed:
            return
        # the hold was released (e.g. expired just before a late payment): take the tickets again if still free
        res = db.execute(update(L).where(L.id == r.listing_id,
                                         (L.quantity - L.quantity_reserved - L.quantity_sold) >= r.quantity)
                         .values(quantity_sold=L.quantity_sold + r.quantity)
                         .execution_options(synchronize_session=False))
        if res.rowcount != 1:
            raise HTTPException(409, "The tickets for this order are no longer available")
    else:
        res = db.execute(update(L).where(L.id == r.listing_id, L.quantity_reserved >= r.quantity)
                         .values(quantity_reserved=L.quantity_reserved - r.quantity,
                                 quantity_sold=L.quantity_sold + r.quantity)
                         .execution_options(synchronize_session=False))
        if res.rowcount != 1:
            raise HTTPException(409, "Reservation is out of sync; please contact support")
    r.status = ReservationStatus.committed
    r.resolved_at = utcnow()
    refresh_status(db, db.get(L, r.listing_id))


def release(db: Session, r: InventoryReservation) -> None:
    if r.status != ReservationStatus.active:
        return
    db.execute(update(L).where(L.id == r.listing_id, L.quantity_reserved >= r.quantity)
               .values(quantity_reserved=L.quantity_reserved - r.quantity)
               .execution_options(synchronize_session=False))
    r.status = ReservationStatus.released
    r.resolved_at = utcnow()
    refresh_status(db, db.get(L, r.listing_id))


def restock_sold(db: Session, listing_id: int, qty: int) -> None:
    """Refund with restock: sold tickets go back on sale."""
    db.execute(update(L).where(L.id == listing_id, L.quantity_sold >= qty)
               .values(quantity_sold=L.quantity_sold - qty).execution_options(synchronize_session=False))
    listing = db.get(L, listing_id)
    db.refresh(listing)
    if listing.status == ListingStatus.sold:
        listing.status = ListingStatus.available
    refresh_status(db, listing)
