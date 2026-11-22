"""All prices are worked out here, on the server, in integer cents.

Seller lists a ticket at $100.00 (10000 cents), commission 15 %, buyer markup 15 %:
  buyer pays   10000 + 1500 = 11500   ($115.00)
  seller gets  10000 - 1500 =  8500   ($85.00)
  platform     1500 + 1500  =  3000   ($30.00)
Percentages come from the admin settings in basis points (1500 = 15.00 %). Each fee is calculated
per ticket (rounded half-up to a cent) and then multiplied by the quantity, so the per-ticket price
on the page, the order and the invoice always agree.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from sqlalchemy.orm import Session

from app.services.settings_store import fees
from app.utils import percent_of

MAX_BPS = 5000  # fees above 50 % are refused in settings


@dataclass(frozen=True)
class Quote:
    quantity: int
    unit_price_cents: int      # seller listing price
    unit_markup_cents: int
    unit_total_cents: int      # buyer price per ticket
    unit_commission_cents: int
    subtotal_cents: int
    markup_cents: int
    total_cents: int
    commission_cents: int
    seller_payout_cents: int
    markup_bps: int
    commission_bps: int

    def as_dict(self) -> dict:
        return asdict(self)


def quote(price_cents: int, quantity: int, *, commission_bps: int, markup_bps: int) -> Quote:
    if price_cents <= 0 or quantity <= 0:
        raise ValueError("Price and quantity must be positive")
    unit_markup = percent_of(price_cents, markup_bps)
    unit_commission = percent_of(price_cents, commission_bps)
    return Quote(
        quantity=quantity,
        unit_price_cents=price_cents,
        unit_markup_cents=unit_markup,
        unit_total_cents=price_cents + unit_markup,
        unit_commission_cents=unit_commission,
        subtotal_cents=price_cents * quantity,
        markup_cents=unit_markup * quantity,
        total_cents=(price_cents + unit_markup) * quantity,
        commission_cents=unit_commission * quantity,
        seller_payout_cents=(price_cents - unit_commission) * quantity,
        markup_bps=markup_bps,
        commission_bps=commission_bps,
    )


def quote_for(db: Session, price_cents: int, quantity: int) -> Quote:
    commission_bps, markup_bps = fees(db)
    return quote(price_cents, quantity, commission_bps=commission_bps, markup_bps=markup_bps)


def buyer_unit_price(db: Session, price_cents: int) -> int:
    _, markup_bps = fees(db)
    return price_cents + percent_of(price_cents, markup_bps)


def seller_net(db: Session, price_cents: int) -> int:
    commission_bps, _ = fees(db)
    return price_cents - percent_of(price_cents, commission_bps)
