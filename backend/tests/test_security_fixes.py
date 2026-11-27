"""Fixes from the security audit: account hand-over, CSV export, alert budgets, upload size limits."""
import re

from conftest import make_user, png_bytes
from test_auth_telegram import init_data

from app.database import SessionLocal
from app.models import TelegramUser, User, UserAuthProvider
from app.routers.admin_ops import _cell
from app.services import alerts, email as mail, social


def _plant(client):
    """Attacker: sign in with their own Telegram, put the victim's email on that account, add payout details."""
    r = client.post("/api/auth/telegram-app", json={"init_data": init_data({"id": 111, "first_name": "Planter"})})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.patch("/api/account/me", headers=h, json={"email": "victim@example.com", "payout_method": "ABA",
                                                         "payout_account_name": "ATTACKER", "payout_account_number": "999999"})
    assert r.status_code == 200 and r.json()["email_verified"] is False
    return r.json()["id"]


def _assert_cleaned(uid):
    with SessionLocal() as s:
        u = s.get(User, uid)
        assert u.email_verified and u.telegram_id is None
        assert u.payout_account_number == "" and u.payout_account_name == ""
        assert [p.provider for p in s.query(UserAuthProvider).filter_by(user_id=uid)] in ([], ["google"])
        assert s.query(TelegramUser).filter_by(user_id=uid).count() == 0


def test_google_claim_removes_planted_telegram_link(client, monkeypatch):
    uid = _plant(client)
    monkeypatch.setattr(social, "verify_google", lambda cred: {"sub": "g-victim", "email": "victim@example.com", "email_verified": True, "name": "Victim"})
    r = client.post("/api/auth/google", json={"credential": "x" * 40})
    assert r.status_code == 200 and r.json()["user"]["id"] == uid
    assert r.json()["user"]["providers"] == ["google"]
    _assert_cleaned(uid)
    # the attacker's Telegram now opens a brand-new, separate account
    again = client.post("/api/auth/telegram-app", json={"init_data": init_data({"id": 111, "first_name": "Planter"})})
    assert again.status_code == 200 and again.json()["user"]["id"] != uid


def test_password_reset_claim_removes_planted_telegram_link(client):
    uid = _plant(client)
    mail.SYNC_FOR_TESTS.clear()
    client.post("/api/auth/forgot-password", json={"email": "victim@example.com"})
    token = re.search(r"token=([\w-]+)", [e for e in mail.SYNC_FOR_TESTS if e["kind"] == "password_reset"][0]["text"]).group(1)
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "victimpass1"}).status_code == 200
    _assert_cleaned(uid)
    again = client.post("/api/auth/telegram-app", json={"init_data": init_data({"id": 111, "first_name": "Planter"})})
    assert again.json()["user"]["id"] != uid


def test_verified_accounts_keep_their_links(client, monkeypatch):
    """A normal, already-verified user who later signs in with Google keeps Telegram and payout details."""
    make_user("fan@example.com", telegram_id=222)
    with SessionLocal() as s:
        u = s.query(User).filter_by(email="fan@example.com").one()
        u.email_verified = True; u.payout_account_number = "123"
        s.commit(); uid = u.id
    monkeypatch.setattr(social, "verify_google", lambda cred: {"sub": "g-fan", "email": "fan@example.com", "email_verified": True})
    assert client.post("/api/auth/google", json={"credential": "x" * 40}).json()["user"]["id"] == uid
    with SessionLocal() as s:
        u = s.get(User, uid)
        assert u.telegram_id == 222 and u.payout_account_number == "123"


def test_csv_cells_cannot_become_formulas():
    assert _cell('=HYPERLINK("http://x","y")') == '\'=HYPERLINK("http://x","y")'
    for bad in ("+1", "-2", "@SUM(A1)", "\tx", "\rx"):
        assert _cell(bad).startswith("'")
    assert _cell("Dara Buyer") == "Dara Buyer" and _cell(None) == ""


def test_website_errors_cannot_use_up_server_alerts(monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "_send", lambda text: sent.append(text))
    monkeypatch.setattr(alerts.threading, "Thread", lambda target, args, daemon: type("T", (), {"start": lambda self: target(*args)})())
    alerts._seen.clear(); alerts._sent.clear(); alerts._sent_web.clear()
    results = [alerts.client_error(f"fake error {i}", "/") for i in range(20)]
    assert sum(results) == alerts.MAX_WEB_PER_HOUR          # only 4 anonymous reports get through per hour
    alerts.job_error("release seller payouts", RuntimeError("db down"))
    assert "BACKGROUND JOB FAILED" in sent[-1]               # the real alert still goes out


def test_upload_size_limits(client, setup, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "MAX_REQUEST_MB", 1)
    big = b"x" * (1024 * 1024 + 10)
    # declared too large
    r = client.post("/api/client-errors", content=big, headers={"Content-Type": "application/json"})
    assert r.status_code == 413
    # chunked (no Content-Length): stopped while reading, not after
    def chunks():
        for _ in range(40):
            yield b"x" * 65536
    r = client.post("/api/client-errors", content=chunks(), headers={"Content-Type": "application/json"})
    assert r.status_code == 413 and "too large" in r.json()["detail"]
    # normal requests are unaffected
    assert client.post("/api/client-errors", json={"message": "ok", "page": "/"}).status_code == 204
    # a single file over the per-file limit is refused
    monkeypatch.setattr(settings, "MAX_REQUEST_MB", 12)
    pdf = b"%PDF-1.4\n" + b"0" * (settings.MAX_UPLOAD_MB * 1024 * 1024 + 10)
    r = client.post("/api/account/payout-qr", headers=setup["seller"], files={"file": ("qr.pdf", pdf, "application/pdf")})
    assert r.status_code in (400, 413)
    assert client.post("/api/account/payout-qr", headers=setup["seller"], files={"file": ("qr.png", png_bytes(), "image/png")}).status_code == 200


def test_manual_listing_face_value_optional(client, setup):
    c = setup["concert"]
    base = {"concert_id": c["id"], "category_id": c["categories"][0]["id"], "price": "500", "quantity": 1}
    r = client.post("/api/admin/listings", headers=setup["admin"], json={**base, "original_price": ""})
    assert r.status_code == 201, r.text
    assert r.json()["original_price_cents"] == 50000          # no face value given: falls back to the price
    r = client.post("/api/admin/listings", headers=setup["admin"], json={**base, "original_price": "250"})
    assert r.status_code == 201 and r.json()["original_price_cents"] == 25000
    assert client.post("/api/admin/listings", headers=setup["admin"], json={**base, "price": "abc"}).status_code == 422
