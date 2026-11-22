"""Request bodies. Pydantic validates every field before any code runs."""
from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.utils import clean_text, clean_tg_username, to_cents


def _password(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("Password must contain letters and numbers")
    return v


def _phone(v: str | None) -> str:
    v = re.sub(r"[\s\-().]", "", v or "")
    if v and not re.fullmatch(r"\+?\d{8,15}", v):
        raise ValueError("Enter a valid phone number")
    return v


def _money(v) -> int:
    cents = to_cents(v)
    if cents <= 0:
        raise ValueError("Enter an amount greater than zero")
    if cents > 10_000_000:
        raise ValueError("Amount is too large")
    return cents


class Clean(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------- auth
class RegisterIn(Clean):
    email: EmailStr
    password: str = Field(max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = ""
    remember: bool = True
    _p = field_validator("password")(classmethod(lambda cls, v: _password(v)))
    _ph = field_validator("phone")(classmethod(lambda cls, v: _phone(v)))
    _n = field_validator("full_name")(classmethod(lambda cls, v: clean_text(v, 120)))


class LoginIn(Clean):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    remember: bool = True


class RefreshIn(BaseModel):
    refresh_token: str = Field(max_length=2000)


class ForgotIn(Clean):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(max_length=128)
    _p = field_validator("password")(classmethod(lambda cls, v: _password(v)))


class GoogleIn(BaseModel):
    credential: str | None = Field(None, max_length=5000)
    access_token: str | None = Field(None, max_length=5000)
    remember: bool = True


class TelegramWidgetIn(BaseModel):
    id: int
    first_name: str = ""
    last_name: str | None = None
    username: str | None = None
    photo_url: str | None = None
    auth_date: int
    hash: str = Field(max_length=128)
    remember: bool = True


class TelegramAppIn(BaseModel):
    init_data: str = Field(min_length=10, max_length=8000)


# ---------------------------------------------------------------- account
class ProfileIn(Clean):
    full_name: str | None = Field(None, min_length=2, max_length=120)
    phone: str | None = None
    email: EmailStr | None = None
    telegram_username: str | None = None
    _ph = field_validator("phone")(classmethod(lambda cls, v: _phone(v) if v is not None else v))
    _tg = field_validator("telegram_username")(classmethod(lambda cls, v: clean_tg_username(v) if v is not None else v))
    _n = field_validator("full_name")(classmethod(lambda cls, v: clean_text(v, 120) if v else v))


class PasswordIn(BaseModel):
    current_password: str = Field("", max_length=128)
    new_password: str = Field(max_length=128)
    _p = field_validator("new_password")(classmethod(lambda cls, v: _password(v)))


class WithdrawalIn(Clean):
    amount: str | float
    method: str = Field(min_length=2, max_length=40)
    account_name: str = Field(min_length=2, max_length=120)
    account_number: str = Field(min_length=4, max_length=64)
    _a = field_validator("amount")(classmethod(lambda cls, v: _money(v)))
    _t = field_validator("method", "account_name", "account_number")(classmethod(lambda cls, v: clean_text(v, 120)))


# ---------------------------------------------------------------- checkout
class CheckoutIn(Clean):
    listing_id: int
    quantity: int = Field(ge=1, le=10)
    contact_name: str = Field(min_length=2, max_length=120)
    contact_email: EmailStr | None = None
    contact_phone: str = ""
    contact_telegram: str = Field(min_length=1, max_length=64)
    idempotency_key: str = Field(min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    channel: Literal["web", "miniapp"] = "web"
    accept_terms: bool
    _ph = field_validator("contact_phone")(classmethod(lambda cls, v: _phone(v)))
    _tg = field_validator("contact_telegram")(classmethod(lambda cls, v: clean_tg_username(v)))
    _n = field_validator("contact_name")(classmethod(lambda cls, v: clean_text(v, 120)))

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, v):
        if not v:
            raise ValueError("Please accept the terms and refund policy")
        return v


# ---------------------------------------------------------------- admin catalogue
class ArtistIn(Clean):
    name: str = Field(min_length=1, max_length=120)
    genre: str = Field("K-pop", max_length=60)
    agency: str = Field("", max_length=120)
    bio: str = Field("", max_length=4000)
    image_url: str = Field("", max_length=500)
    is_popular: bool = False
    is_active: bool = True


class CategoryIn(Clean):
    id: int | None = None
    name: str = Field(min_length=1, max_length=80)
    description: str = Field("", max_length=300)
    face_value: str | float | None = None
    sort_order: int = 0
    is_active: bool = True


class ConcertIn(Clean):
    artist_id: int
    title: str = Field(min_length=2, max_length=200)
    venue: str = Field(min_length=2, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    country: str = Field(min_length=2, max_length=100)
    starts_at: datetime
    doors_open: str = Field("", max_length=40)
    description: str = Field("", max_length=6000)
    poster_url: str = Field("", max_length=500)
    delivery_info: str = Field("", max_length=2000)
    status: Literal["scheduled", "postponed", "cancelled", "completed"] = "scheduled"
    is_featured: bool = False
    is_published: bool = True
    categories: list[CategoryIn] = []


class ListingEditIn(Clean):
    price: str | float | None = None
    original_price: str | float | None = None
    quantity: int | None = Field(None, ge=1, le=200)
    seat_info: str | None = Field(None, max_length=200)
    notes: str | None = Field(None, max_length=2000)
    ticket_type: Literal["e_ticket", "mobile_transfer", "paper", "other"] | None = None
