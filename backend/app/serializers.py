"""Turn rows into JSON. Public serializers never include seller payout details, contact data or proofs."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (PUBLIC_LISTING, Artist, Concert, Order, Payment, TicketListing, User, WithdrawalRequest)
from app.services import orders as order_svc
from app.services.pricing import buyer_unit_price, seller_net
from app.utils import iso


def user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "full_name": u.full_name, "phone": u.phone, "role": u.role.value,
            "telegram_id": u.telegram_id, "telegram_username": u.telegram_username, "has_password": u.has_password,
            "providers": sorted(p.provider for p in u.providers), "email_verified": u.email_verified,
            "avatar_url": u.avatar_url, "locale": u.locale,
            "payout": {"method": u.payout_method, "account_name": u.payout_account_name,
                       "account_number": u.payout_account_number, "has_qr": bool(u.payout_qr_key)},
            "created_at": iso(u.created_at)}


def artist_out(a: Artist, *, upcoming: int | None = None) -> dict:
    d = {"id": a.id, "name": a.name, "slug": a.slug, "genre": a.genre, "agency": a.agency, "bio": a.bio,
         "image_url": a.image_url, "is_popular": a.is_popular, "is_active": a.is_active}
    if upcoming is not None:
        d["upcoming_concerts"] = upcoming
    return d


def concert_card(c: Concert, stats: dict | None = None) -> dict:
    s = stats or {}
    return {"id": c.id, "slug": c.slug, "title": c.title, "venue": c.venue, "city": c.city, "country": c.country,
            "starts_at": iso(c.starts_at), "poster_url": c.poster_url, "status": c.status.value,
            "is_featured": c.is_featured, "is_published": c.is_published,
            "artist": {"id": c.artist.id, "name": c.artist.name, "slug": c.artist.slug, "image_url": c.artist.image_url},
            "tickets_available": s.get("available", 0), "from_price_cents": s.get("from_price"),
            "listing_count": s.get("listings", 0)}


def listing_public(db: Session, l: TicketListing) -> dict:
    return {"id": l.id, "category_id": l.category_id, "category": l.category.name,
            "price_cents": l.price_cents, "buyer_price_cents": buyer_unit_price(db, l.price_cents),
            "original_price_cents": l.original_price_cents, "available": l.available if l.status in PUBLIC_LISTING else 0,
            "seat_info": l.seat_info, "ticket_type": l.ticket_type.value, "notes": l.notes,
            "status": l.status.value, "seller_label": "Verified seller" if l.seller_id else "TicketNest",
            "listed_at": iso(l.created_at)}


def listing_owner(db: Session, l: TicketListing) -> dict:
    d = listing_public(db, l)
    d.update({"concert": concert_card(l.concert), "quantity": l.quantity, "quantity_sold": l.quantity_sold,
              "quantity_reserved": l.quantity_reserved, "rejection_reason": l.rejection_reason,
              "net_per_ticket_cents": seller_net(db, l.price_cents),
              "contact_name": l.contact_name, "contact_phone": l.contact_phone, "contact_telegram": l.contact_telegram,
              "payout_method": l.payout_method, "payout_account_name": l.payout_account_name,
              "payout_account_number": l.payout_account_number,
              "files": [{"id": f.id, "kind": f.kind, "name": f.original_name, "type": f.content_type, "size": f.size_bytes}
                        for f in l.files], "has_payout_qr": bool(l.payout_qr_key),
              "can_edit": l.status.value in ("pending", "rejected", "available") and l.quantity_reserved == 0,
              "can_cancel": l.status.value in ("pending", "rejected", "available", "approved")
                            and l.quantity_reserved == 0, "updated_at": iso(l.updated_at)})
    return d


def listing_admin(db: Session, l: TicketListing) -> dict:
    d = listing_owner(db, l)
    d["seller"] = ({"id": l.seller.id, "name": l.seller.full_name, "email": l.seller.email,
                    "telegram_username": l.seller.telegram_username, "phone": l.seller.phone} if l.seller else None)
    d["reviewed_at"] = iso(l.reviewed_at)
    return d


def payment_out(p: Payment, *, admin: bool = False) -> dict:
    d = {"id": p.id, "method": p.method, "amount": p.amount, "currency": p.currency, "status": p.status.value,
         "reference": p.reference, "expires_at": iso(p.expires_at), "verified_at": iso(p.verified_at),
         "verification_source": p.verification_source, "created_at": iso(p.created_at)}
    if admin:
        d.update(note=p.note, gateway=p.gateway_response, bill_number=p.bill_number, md5=p.khqr_md5)
    return d


def order_out(order: Order, *, admin: bool = False, with_qr: bool = False) -> dict:
    it = order.items[0]
    pay = order_svc.active_payment(order)
    d = {
        "id": order.id, "order_number": order.order_number, "status": order.status.value, "channel": order.channel,
        "created_at": iso(order.created_at), "paid_at": iso(order.paid_at), "delivered_at": iso(order.delivered_at),
        "completed_at": iso(order.completed_at), "cancelled_at": iso(order.cancelled_at),
        "cancel_reason": order.cancel_reason, "expires_at": iso(order.expires_at),
        "seconds_left": order_svc.reservation_seconds_left(order),
        "contact": {"name": order.contact_name, "email": order.contact_email, "phone": order.contact_phone,
                    "telegram": order.contact_telegram},
        "item": {"listing_id": it.listing_id, "concert_title": it.concert_title, "artist_name": it.artist_name,
                 "category_name": it.category_name, "concert_starts_at": iso(it.concert_starts_at), "venue": it.venue,
                 "seat_info": it.seat_info, "quantity": it.quantity, "unit_price_cents": it.unit_price_cents,
                 "unit_markup_cents": it.unit_markup_cents, "unit_total_cents": it.unit_total_cents},
        "subtotal_cents": order.subtotal_cents, "markup_cents": order.markup_cents, "total_cents": order.total_cents,
        "markup_bps": order.markup_bps, "currency": order.currency, "khr_rate": order.khr_rate,
        "invoice_number": order.invoice.invoice_number if order.invoice else None,
        "payments": [payment_out(p, admin=admin) for p in order.payments],
        "delivery": ({"method": order.delivery.method, "delivered_at": iso(order.delivery.delivered_at),
                      "has_file": bool(order.delivery.file_key),
                      **({"reference": order.delivery.reference,
                          "admin": order.delivery.admin.full_name if order.delivery.admin else ""} if admin else {})}
                     if order.delivery else None),
        "events": [{"status": ev.status, "note": ev.note if admin or not ev.status.startswith("admin") else "",
                    "at": iso(ev.created_at)} for ev in order.events],
    }
    if with_qr and pay and order.status.value == "awaiting_payment":
        d["khqr"] = {"payload": pay.khqr_payload, "amount": pay.amount, "currency": pay.currency,
                     "expires_at": iso(pay.expires_at),
                     "image_url": f"/api/orders/{order.order_number}/qr.png?t={order_svc.access_token(order.order_number)}"}
    if admin:
        d.update(buyer={"id": order.buyer.id, "name": order.buyer.full_name, "email": order.buyer.email,
                        "telegram_username": order.buyer.telegram_username, "telegram_id": order.buyer.telegram_id,
                        "phone": order.buyer.phone},
                 commission_cents=order.commission_cents, seller_payout_cents=order.seller_payout_cents,
                 commission_bps=order.commission_bps, admin_note=order.admin_note,
                 seller_id=it.seller_id, listing_id=it.listing_id,
                 platform_revenue_cents=order.markup_cents + order.commission_cents)
    return d


def withdrawal_out(w: WithdrawalRequest, *, admin: bool = False) -> dict:
    d = {"id": w.id, "amount_cents": w.amount_cents, "method": w.method, "account_name": w.account_name,
         "account_number": w.account_number, "status": w.status.value, "admin_note": w.admin_note,
         "payout_reference": w.payout_reference, "created_at": iso(w.created_at), "processed_at": iso(w.processed_at)}
    if admin:
        d["seller"] = {"id": w.user.id, "name": w.user.full_name, "email": w.user.email,
                       "telegram_username": w.user.telegram_username, "has_payout_qr": bool(w.user.payout_qr_key),
                       "avatar_url": w.user.avatar_url}
    return d
