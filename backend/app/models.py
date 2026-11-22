"""Database tables. Money columns are integers in minor units (US cents), never floats.

The website, the Telegram bot and the Mini App all read and write these same tables.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (JSON, BigInteger, Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _enum(e):
    return Enum(e, native_enum=False, length=32, validate_strings=True,
                values_callable=lambda x: [m.value for m in x])


class TS:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now(), nullable=False)


# ===================================================================== users & auth
class Role(str, enum.Enum):
    customer = "customer"
    staff = "staff"        # can run day-to-day admin (listings, orders, delivery)
    admin = "admin"        # everything, including fees, settings, withdrawals


class User(TS, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True)  # Telegram-only accounts: none yet
    password_hash: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    role: Mapped[Role] = mapped_column(_enum(Role), default=Role.customer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, index=True)
    telegram_username: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    providers: Mapped[list[UserAuthProvider]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wallet: Mapped[SellerWallet | None] = relationship(back_populates="user", uselist=False)

    @property
    def is_staff(self) -> bool:
        return self.role in (Role.staff, Role.admin)

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)


class UserAuthProvider(TS, Base):
    """One row per way the user can sign in (password is on users). Unique per provider account,
    so one Google or Telegram identity can never belong to two TicketNest accounts."""
    __tablename__ = "user_auth_providers"
    __table_args__ = (UniqueConstraint("provider", "provider_uid", name="uq_provider_uid"),
                      UniqueConstraint("user_id", "provider", name="uq_user_provider"))
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # google | telegram
    provider_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    display: Mapped[str] = mapped_column(String(255), default="", nullable=False)  # email / @username
    user: Mapped[User] = relationship(back_populates="providers")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)  # sha256, never the raw token
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ===================================================================== catalogue
class Artist(TS, Base):
    __tablename__ = "artists"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(140), unique=True, index=True, nullable=False)
    genre: Mapped[str] = mapped_column(String(60), default="K-pop", nullable=False)
    agency: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    bio: Mapped[str] = mapped_column(Text, default="", nullable=False)
    image_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    concerts: Mapped[list[Concert]] = relationship(back_populates="artist")


class ConcertStatus(str, enum.Enum):
    scheduled = "scheduled"
    postponed = "postponed"
    cancelled = "cancelled"
    completed = "completed"


class Concert(TS, Base):
    __tablename__ = "concerts"
    __table_args__ = (Index("ix_concert_published_date", "is_published", "starts_at"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artists.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True, nullable=False)
    venue: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    country: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    doors_open: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    poster_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    delivery_info: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[ConcertStatus] = mapped_column(_enum(ConcertStatus), default=ConcertStatus.scheduled, nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    artist: Mapped[Artist] = relationship(back_populates="concerts")
    categories: Mapped[list[TicketCategory]] = relationship(back_populates="concert", cascade="all, delete-orphan",
                                                            order_by="TicketCategory.sort_order")


class TicketCategory(TS, Base):
    __tablename__ = "ticket_categories"
    __table_args__ = (UniqueConstraint("concert_id", "name", name="uq_category_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    concert_id: Mapped[int] = mapped_column(ForeignKey("concerts.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(80), nullable=False)          # VIP, CAT 1, Standing ...
    description: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    face_value_cents: Mapped[int | None] = mapped_column(Integer)          # official price, if known
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    concert: Mapped[Concert] = relationship(back_populates="categories")


# ===================================================================== listings
class ListingStatus(str, enum.Enum):
    pending = "pending"        # Pending Approval
    approved = "approved"      # approved, momentarily before going live (kept for the audit trail)
    rejected = "rejected"
    available = "available"    # public, has tickets to sell
    reserved = "reserved"      # every remaining ticket is held by an unpaid checkout
    sold = "sold"
    cancelled = "cancelled"    # by the seller
    disabled = "disabled"      # hidden by an admin


PUBLIC_LISTING = (ListingStatus.available, ListingStatus.reserved)


class TicketType(str, enum.Enum):
    e_ticket = "e_ticket"            # PDF / QR e-ticket
    mobile_transfer = "mobile_transfer"  # transferred inside the official ticketing app
    paper = "paper"
    other = "other"


class TicketListing(TS, Base):
    __tablename__ = "ticket_listings"
    __table_args__ = (
        CheckConstraint("quantity >= 0 AND quantity_reserved >= 0 AND quantity_sold >= 0", name="ck_listing_qty_pos"),
        CheckConstraint("quantity_reserved + quantity_sold <= quantity", name="ck_listing_no_oversell"),
        CheckConstraint("price_cents > 0", name="ck_listing_price_pos"),
        Index("ix_listing_public", "concert_id", "status"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)  # None = TicketNest's own stock
    concert_id: Mapped[int] = mapped_column(ForeignKey("concerts.id"), index=True, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("ticket_categories.id"), index=True, nullable=False)
    original_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)  # face value the seller paid
    price_cents: Mapped[int] = mapped_column(Integer, nullable=False)           # seller listing price, per ticket
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_reserved: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    quantity_sold: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    seat_info: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    ticket_type: Mapped[TicketType] = mapped_column(_enum(TicketType), default=TicketType.e_ticket, nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[ListingStatus] = mapped_column(_enum(ListingStatus), default=ListingStatus.pending, index=True,
                                                 nullable=False)
    rejection_reason: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    # seller contact + payout (only shown to the seller and admins)
    contact_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_telegram: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    payout_method: Mapped[str] = mapped_column(String(40), default="", nullable=False)   # ABA, ACLEDA, Wing ...
    payout_account_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    payout_account_number: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    seller: Mapped[User | None] = relationship(foreign_keys=[seller_id])
    concert: Mapped[Concert] = relationship()
    category: Mapped[TicketCategory] = relationship()
    files: Mapped[list[TicketImage]] = relationship(back_populates="listing", cascade="all, delete-orphan")

    @property
    def available(self) -> int:
        return max(0, self.quantity - self.quantity_reserved - self.quantity_sold)


class TicketImage(Base):
    """Ticket proof uploaded by the seller (image or PDF). PRIVATE: only the seller and admins can open it."""
    __tablename__ = "ticket_images"
    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("ticket_listings.id", ondelete="CASCADE"), index=True,
                                            nullable=False)
    storage_key: Mapped[str] = mapped_column(String(300), nullable=False)
    content_type: Mapped[str] = mapped_column(String(60), nullable=False)
    original_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    listing: Mapped[TicketListing] = relationship(back_populates="files")


# ===================================================================== orders & payments
class OrderStatus(str, enum.Enum):
    awaiting_payment = "awaiting_payment"
    paid = "paid"
    preparing = "preparing"            # Preparing Ticket
    awaiting_delivery = "awaiting_delivery"
    delivered = "delivered"
    completed = "completed"
    cancelled = "cancelled"            # includes unpaid orders whose QR expired
    refunded = "refunded"


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    verified = "verified"
    failed = "failed"
    expired = "expired"
    refunded = "refunded"


class Order(TS, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("buyer_id", "idempotency_key", name="uq_order_idempotency"),
                      Index("ix_order_status_created", "status", "created_at"))
    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)  # TN-2026-0001
    buyer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus), default=OrderStatus.awaiting_payment,
                                                index=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(16), default="web", nullable=False)  # web | miniapp
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    # contact details given at checkout (used for delivery through Telegram)
    contact_name: Mapped[str] = mapped_column(String(120), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_telegram: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    # money snapshot (cents). subtotal = seller prices; markup = buyer fee; total = what the buyer pays
    subtotal_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    markup_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_cents: Mapped[int] = mapped_column(Integer, nullable=False)     # taken from the seller
    seller_payout_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    markup_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    commission_bps: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    khr_rate: Mapped[int] = mapped_column(Integer, default=4100, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)  # unpaid hold ends
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    admin_note: Mapped[str] = mapped_column(Text, default="", nullable=False)

    buyer: Mapped[User] = relationship()
    items: Mapped[list[OrderItem]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list[Payment]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                   order_by="Payment.id")
    reservations: Mapped[list[InventoryReservation]] = relationship(back_populates="order",
                                                                    cascade="all, delete-orphan")
    invoice: Mapped[Invoice | None] = relationship(back_populates="order", uselist=False)
    delivery: Mapped[TicketDelivery | None] = relationship(back_populates="order", uselist=False)
    events: Mapped[list[OrderEvent]] = relationship(back_populates="order", cascade="all, delete-orphan",
                                                    order_by="OrderEvent.id")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    listing_id: Mapped[int] = mapped_column(ForeignKey("ticket_listings.id"), index=True, nullable=False)
    seller_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    concert_title: Mapped[str] = mapped_column(String(200), nullable=False)
    artist_name: Mapped[str] = mapped_column(String(120), nullable=False)
    category_name: Mapped[str] = mapped_column(String(80), nullable=False)
    concert_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    venue: Mapped[str] = mapped_column(String(300), nullable=False)
    seat_info: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price_cents: Mapped[int] = mapped_column(Integer, nullable=False)    # seller listing price
    unit_markup_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_total_cents: Mapped[int] = mapped_column(Integer, nullable=False)    # what the buyer pays per ticket
    order: Mapped[Order] = relationship(back_populates="items")
    listing: Mapped[TicketListing] = relationship()


class OrderEvent(Base):
    __tablename__ = "order_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    order: Mapped[Order] = relationship(back_populates="events")


class ReservationStatus(str, enum.Enum):
    active = "active"
    committed = "committed"   # payment verified: tickets are sold
    released = "released"     # expired or cancelled: tickets back on sale


class InventoryReservation(Base):
    __tablename__ = "inventory_reservations"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    listing_id: Mapped[int] = mapped_column(ForeignKey("ticket_listings.id"), index=True, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(_enum(ReservationStatus), default=ReservationStatus.active,
                                                      index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    order: Mapped[Order] = relationship(back_populates="reservations")


class Payment(TS, Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True, nullable=False)
    method: Mapped[str] = mapped_column(String(20), default="khqr", nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)   # minor units of `currency` (cents / riel)
    currency: Mapped[str] = mapped_column(String(3), default="USD", nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus), default=PaymentStatus.pending, index=True,
                                                  nullable=False)
    bill_number: Mapped[str] = mapped_column(String(32), nullable=False)   # put inside the QR (tag 62.01)
    khqr_payload: Mapped[str] = mapped_column(Text, default="", nullable=False)
    khqr_md5: Mapped[str] = mapped_column(String(32), default="", index=True, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # "ABA <trx id>" once verified. UNIQUE: one bank transaction can never pay two orders.
    reference: Mapped[str | None] = mapped_column(String(80), unique=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_source: Mapped[str] = mapped_column(String(30), default="", nullable=False)  # payway|bakong|admin
    verified_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    gateway_response: Mapped[dict | None] = mapped_column(JSON)
    note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    order: Mapped[Order] = relationship(back_populates="payments")


class PaymentNotification(Base):
    """Every PayWay message the listener saw, and what the matcher decided. This is the reconciliation log."""
    __tablename__ = "payment_notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), default="payway", nullable=False)
    trx_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)   # one row per bank transaction
    chat_id: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    payer: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    payer_account: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    apv: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    outcome: Mapped[str] = mapped_column(String(30), index=True, nullable=False)
    # matched | ambiguous | unmatched | wrong_amount | late | resolved_manual
    payment_id: Mapped[int | None] = mapped_column(ForeignKey("payments.id"))
    detail: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Invoice(Base):
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False)
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)   # INV-2026-0001
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    total_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    order: Mapped[Order] = relationship(back_populates="invoice")


class TicketDelivery(TS, Base):
    __tablename__ = "ticket_deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), unique=True, nullable=False)
    method: Mapped[str] = mapped_column(String(40), default="telegram", nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reference: Mapped[str] = mapped_column(Text, default="", nullable=False)   # notes / reference
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    file_key: Mapped[str] = mapped_column(String(300), default="", nullable=False)   # optional confirmation file
    file_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    file_type: Mapped[str] = mapped_column(String(60), default="", nullable=False)
    order: Mapped[Order] = relationship(back_populates="delivery")
    admin: Mapped[User | None] = relationship()


# ===================================================================== wallets
class SellerWallet(TS, Base):
    __tablename__ = "seller_wallets"
    __table_args__ = (CheckConstraint("available_cents >= 0 AND pending_cents >= 0 AND held_cents >= 0",
                                      name="ck_wallet_non_negative"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False)
    pending_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)     # sold, not yet delivered
    available_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)   # can be withdrawn
    held_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)        # in a withdrawal request
    withdrawn_cents: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    user: Mapped[User] = relationship(back_populates="wallet")


class WalletTxType(str, enum.Enum):
    sale_pending = "sale_pending"        # order paid: net earnings pending delivery
    sale_released = "sale_released"      # order delivered: pending -> available
    sale_reversed = "sale_reversed"      # order refunded before release
    withdrawal_hold = "withdrawal_hold"
    withdrawal_paid = "withdrawal_paid"
    withdrawal_returned = "withdrawal_returned"
    adjustment = "adjustment"


class WalletTransaction(Base):
    __tablename__ = "wallet_transactions"
    __table_args__ = (UniqueConstraint("wallet_id", "type", "order_id", name="uq_wallet_tx_order"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    wallet_id: Mapped[int] = mapped_column(ForeignKey("seller_wallets.id"), index=True, nullable=False)
    type: Mapped[WalletTxType] = mapped_column(_enum(WalletTxType), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    withdrawal_id: Mapped[int | None] = mapped_column(ForeignKey("withdrawal_requests.id"))
    available_after: Mapped[int] = mapped_column(Integer, nullable=False)
    pending_after: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WithdrawalStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    rejected = "rejected"
    cancelled = "cancelled"


class WithdrawalRequest(TS, Base):
    __tablename__ = "withdrawal_requests"
    __table_args__ = (CheckConstraint("amount_cents > 0", name="ck_withdrawal_pos"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    method: Mapped[str] = mapped_column(String(40), nullable=False)
    account_name: Mapped[str] = mapped_column(String(120), nullable=False)
    account_number: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[WithdrawalStatus] = mapped_column(_enum(WithdrawalStatus), default=WithdrawalStatus.pending,
                                                     index=True, nullable=False)
    admin_note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    payout_reference: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    processed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user: Mapped[User] = relationship(foreign_keys=[user_id])


# ===================================================================== telegram, settings, audit
class TelegramUser(TS, Base):
    """Everyone who opened the TicketNest bot or Mini App. can_message = they pressed Start, so the bot may DM them."""
    __tablename__ = "telegram_users"
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    username: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    first_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    can_message: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class TelegramNotification(Base):
    """Outgoing Telegram message log (alerts and customer updates) for troubleshooting."""
    __tablename__ = "telegram_notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    chat_id: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)  # queued | sent | failed
    error: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)


class PlatformSetting(Base):
    __tablename__ = "platform_settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    actor_label: Mapped[str] = mapped_column(String(120), default="", nullable=False)  # "telegram:12345", "system"
    action: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    entity: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    data: Mapped[dict | None] = mapped_column(JSON)
    ip: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    actor: Mapped[User | None] = relationship()


class Counter(Base):
    """Per-year sequence numbers for TN-2026-0001 / INV-2026-0001 (row-locked while incremented)."""
    __tablename__ = "counters"
    name: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class EmailLog(Base):
    __tablename__ = "email_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    to: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # sent | failed | skipped
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
