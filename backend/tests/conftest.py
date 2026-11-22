import io
import os
import sys
import tempfile
from datetime import timedelta
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="ticketnest-test-")
os.environ.update({
    "ENVIRONMENT": "test",
    "SECRET_KEY": "test-secret-key-that-is-long-enough-1234567890",
    "DATABASE_URL": f"sqlite:///{Path(_tmp, 'test.db').as_posix()}",
    "LOCAL_STORAGE_DIR": str(Path(_tmp, "storage")),
    "TELEGRAM_BOT_TOKEN": "123456:TEST-TOKEN",
    "TELEGRAM_ADMIN_GROUP_ID": "-1009990001",
    "TELEGRAM_ADMIN_ID": "777",
    "TELEGRAM_PAYMENT_GROUP_ID": "-1001112223",
    "SITE_URL": "https://ticketnest.test",
    "RATE_LIMIT_ENABLED": "false",
    "BREVO_API_KEY": "", "SMTP_HOST": "", "BAKONG_API_TOKEN": "", "GOOGLE_CLIENT_ID": "",
})
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Role, User  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.services import email as mail, khqr, telegram as tg  # noqa: E402
from app.utils import utcnow  # noqa: E402

TG_SENT: list = []
BOT_CALLS: list = []


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch):
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    TG_SENT.clear()
    BOT_CALLS.clear()
    tg.SYNC_FOR_TESTS = TG_SENT
    mail.SYNC_FOR_TESTS = []
    monkeypatch.setattr(tg, "call", lambda method, **kw: BOT_CALLS.append((method, kw)) or {"ok": True})
    yield
    tg.SYNC_FOR_TESTS = None


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def db():
    s = SessionLocal()
    yield s
    s.close()


def make_user(email, role=Role.customer, name="Test User", telegram_id=None) -> int:
    with SessionLocal() as s:
        u = User(email=email, full_name=name, role=role, password_hash=hash_password("secret123"),
                 telegram_id=telegram_id, email_verified=True)
        s.add(u)
        s.commit()
        return u.id


def login(client, email, password="secret123") -> dict:
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def png_bytes() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 30, 90)).save(buf, "PNG")
    return buf.getvalue()


def merchant_template() -> str:
    """A syntactically valid KHQR merchant code (fake account) to build per-order QRs from."""
    from decimal import Decimal
    return khqr.build_khqr(account_id="ticketnest@abaa", merchant_name="TICKETNEST", merchant_city="Phnom Penh",
                           amount=Decimal("1.00"), account_information="000123456", acquiring_bank="ABA Bank")


@pytest.fixture
def setup(client):
    """Admin, seller, buyer, one concert with categories, KHQR configured."""
    make_user("admin@example.com", Role.admin, "Owner")
    make_user("seller@example.com", name="Sok Seller")
    make_user("buyer@example.com", name="Dara Buyer")
    make_user("buyer2@example.com", name="Second Buyer")
    admin = login(client, "admin@example.com")
    r = client.put("/api/admin/settings/payments", json={"khqr_template": merchant_template()}, headers=admin)
    assert r.status_code == 200, r.text
    a = client.post("/api/admin/artists", json={"name": "BLACKPINK", "is_popular": True}, headers=admin).json()
    c = client.post("/api/admin/concerts", headers=admin, json={
        "artist_id": a["id"], "title": "World Tour Test Show", "venue": "Test Arena", "city": "Bangkok",
        "country": "Thailand", "starts_at": (utcnow() + timedelta(days=30)).isoformat(),
        "categories": [{"name": "VIP"}, {"name": "CAT 1"}]}).json()
    return {"admin": admin, "seller": login(client, "seller@example.com"), "buyer": login(client, "buyer@example.com"),
            "buyer2": login(client, "buyer2@example.com"), "concert": c, "artist": a}


def create_listing(client, setup, price="100", qty=2, category=0):
    c = setup["concert"]
    r = client.post("/api/sell/listings", headers=setup["seller"], data={
        "concert_id": c["id"], "category_id": c["categories"][category]["id"], "original_price": "90", "price": price,
        "quantity": qty, "seat_info": "Row A", "ticket_type": "e_ticket", "contact_name": "Sok Seller",
        "contact_telegram": "@sok_seller", "payout_method": "ABA", "payout_account_name": "SOK SELLER",
        "payout_account_number": "000111222", "confirm_owner": "true"},
        files=[("files", ("ticket.png", png_bytes(), "image/png")),
               ("receipts", ("receipt.png", png_bytes(), "image/png")),
               ("payout_qr", ("my-aba-qr.png", png_bytes(), "image/png"))])
    assert r.status_code == 201, r.text
    return r.json()


def checkout(client, headers, listing_id, qty=1, key="key-00000001", telegram="dara_buyer"):
    return client.post("/api/orders", headers=headers, json={
        "listing_id": listing_id, "quantity": qty, "contact_name": "Dara Buyer", "contact_email": "dara@example.com",
        "contact_telegram": telegram, "idempotency_key": key, "accept_terms": True})


def payway_msg(amount: str, trx: str, *, from_bot=True, username="PayWayByABA_bot", chat="-1001112223", extra=""):
    return {"date": int(utcnow().timestamp()), "chat": {"id": int(chat), "type": "supergroup"},
            "from": {"is_bot": from_bot, "username": username},
            "text": f"${amount} paid by SOK DARA (*291) on Nov 15, 03:28 AM via ABA PAY at TICKETNEST.{extra} "
                    f"Trx. ID: {trx}, APV: 929857."}
