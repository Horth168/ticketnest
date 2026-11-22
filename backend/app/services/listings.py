"""Listing review actions, shared by the admin dashboard and the Telegram bot buttons."""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import ListingStatus, TicketListing, User
from app.services import audit, inventory, notify
from app.utils import utcnow

S = ListingStatus


def approve(db: Session, listing: TicketListing, actor: User | None, label: str = "") -> None:
    if listing.status not in (S.pending, S.rejected, S.disabled):
        raise HTTPException(409, f"Listing #{listing.id} is {listing.status.value}, not waiting for approval")
    listing.status = S.approved
    listing.reviewed_by_id = actor.id if actor else None
    listing.reviewed_at = utcnow()
    listing.rejection_reason = ""
    audit.log(db, "listing.approve", "listing", listing.id, actor=actor, label=label)
    db.flush()
    listing.status = S.available            # approved listings go on sale straight away
    db.flush()
    inventory.refresh_status(db, listing)   # -> sold if every ticket was already sold before an edit
    notify.listing_reviewed(db, listing, True, actor.full_name if actor else label)


def reject(db: Session, listing: TicketListing, reason: str, actor: User | None, label: str = "") -> None:
    if listing.status not in (S.pending, S.approved, S.available, S.disabled):
        raise HTTPException(409, f"Listing #{listing.id} is {listing.status.value}")
    if listing.quantity_reserved:
        raise HTTPException(409, "A buyer is paying for these tickets right now; try again in a few minutes")
    listing.status = S.rejected
    listing.rejection_reason = (reason or "Ticket proof could not be verified")[:500]
    listing.reviewed_by_id = actor.id if actor else None
    listing.reviewed_at = utcnow()
    audit.log(db, "listing.reject", "listing", listing.id, actor=actor, label=label, data={"reason": reason})
    notify.listing_reviewed(db, listing, False, actor.full_name if actor else label)


def disable(db: Session, listing: TicketListing, actor: User) -> None:
    if listing.quantity_reserved:
        raise HTTPException(409, "A buyer is paying for these tickets right now; try again in a few minutes")
    if listing.status in (S.sold, S.cancelled):
        raise HTTPException(409, f"Listing is already {listing.status.value}")
    listing.status = S.disabled
    audit.log(db, "listing.disable", "listing", listing.id, actor=actor)


def enable(db: Session, listing: TicketListing, actor: User) -> None:
    if listing.status != S.disabled:
        raise HTTPException(409, "Listing is not disabled")
    listing.status = S.available
    db.flush()
    inventory.refresh_status(db, listing)
    audit.log(db, "listing.enable", "listing", listing.id, actor=actor)
