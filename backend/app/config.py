"""Application settings, loaded from environment variables / backend/.env.

Every secret comes from the environment. Nothing sensitive is hard-coded, and nothing in this
file is ever sent to a browser. Business settings that the owner changes day to day (fees,
support Telegram username, KHQR merchant code ...) live in the database instead
(services/settings_store.py) and are edited from the admin dashboard.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- Core ---
    APP_NAME: str = "TicketNest API"
    ENVIRONMENT: str = "development"  # development | production | test
    SECRET_KEY: str = Field(..., min_length=32)
    DATABASE_URL: str = ""

    # --- Auth ---
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REMEMBER_ME_DAYS: int = 30
    PASSWORD_RESET_EXPIRE_MINUTES: int = 60

    # --- Web ---
    CORS_ORIGINS: str = "http://localhost:5173"
    SITE_URL: str = "http://localhost:5173"          # public website (also serves /tg Mini App and /admin)
    API_PUBLIC_URL: str = "http://localhost:8000"
    RATE_LIMIT_ENABLED: bool = True
    MAX_REQUEST_MB: int = 12

    # --- Files ---
    STORAGE_PROVIDER: str = "local"   # local | r2
    LOCAL_STORAGE_DIR: str = str(BASE_DIR / "storage")
    MAX_UPLOAD_MB: int = 8
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY_ID: str = ""
    R2_SECRET_ACCESS_KEY: str = ""
    R2_PUBLIC_BUCKET: str = ""        # posters, artist photos (public)
    R2_PUBLIC_URL: str = ""
    R2_PRIVATE_BUCKET: str = ""       # ticket proofs, delivery files, invoices (never public)

    # --- Telegram: one TicketNest bot for alerts, admin commands, customer updates, login + Mini App ---
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_ADMIN_GROUP_ID: str = ""     # group/chat that receives business alerts
    TELEGRAM_ADMIN_ID: str = ""           # comma separated Telegram user IDs allowed to run admin actions
    TELEGRAM_SUPPORT_USERNAME: str = ""   # default only; the live value is edited in admin settings
    TELEGRAM_MINI_APP_URL: str = ""       # e.g. https://t.me/TicketNestBot/app (for "Open app" buttons)

    # --- ABA PayWay payment confirmation (same approach as IceQ Sole) ---
    TELEGRAM_PAYMENT_GROUP_ID: str = ""   # group where @PayWayByABA_bot posts payments
    PAYWAY_BOT_USERNAME: str = "PayWayByABA_bot"
    # Listener = a Telegram USER account in the payment group (bots never see other bots' messages)
    TG_LISTENER_API_ID: str = ""
    TG_LISTENER_API_HASH: str = ""
    TG_LISTENER_SESSION: str = ""
    # Optional: Bakong Open API token -> each QR's md5 can be checked with the national switch
    BAKONG_API_TOKEN: str = ""
    BAKONG_API_URL: str = "https://api-bakong.nbc.gov.kh"

    # --- Email (Brevo over HTTPS first, SMTP fallback) ---
    BREVO_API_KEY: str = ""
    EMAIL_FROM: str = ""
    EMAIL_FROM_NAME: str = "TicketNest"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # --- Google sign-in (client ID is public) ---
    GOOGLE_CLIENT_ID: str = ""

    # --- First admin on hosts without a shell ---
    INITIAL_ADMIN_EMAIL: str = ""
    INITIAL_ADMIN_PASSWORD: str = ""

    TIMEZONE: str = "Asia/Phnom_Penh"

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def _db(cls, v):
        return v or f"sqlite:///{(BASE_DIR / 'data' / 'ticketnest_dev.db').as_posix()}"

    @field_validator("STORAGE_PROVIDER")
    @classmethod
    def _provider(cls, v: str) -> str:
        v = v.lower().strip()
        if v not in {"local", "r2"}:
            raise ValueError("STORAGE_PROVIDER must be local or r2")
        return v

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def admin_telegram_ids(self) -> set[int]:
        out = set()
        for part in self.TELEGRAM_ADMIN_ID.replace(";", ",").split(","):
            part = part.strip()
            if part.isdigit():
                out.add(int(part))
        return out


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
