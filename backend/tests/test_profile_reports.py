from datetime import timedelta

from conftest import TG_SENT, checkout, create_listing, payway_msg, png_bytes

from app.database import SessionLocal
from app.models import PlatformSetting
from app.services import email as mail, payway, reports
from app.utils import utcnow


def test_listing_needs_receipt_and_keeps_payout_qr(client, setup):
    c = setup["concert"]
    base = {"concert_id": c["id"], "category_id": c["categories"][0]["id"], "original_price": "90", "price": "100",
            "quantity": 1, "contact_name": "Sok", "contact_telegram": "sok_seller", "payout_method": "ABA",
            "payout_account_name": "SOK", "payout_account_number": "0001112", "confirm_owner": "true"}
    r = client.post("/api/sell/listings", headers=setup["seller"], data=base,
                    files=[("files", ("t.png", png_bytes(), "image/png"))])
    assert r.status_code == 422   # purchase receipt is required
    l = create_listing(client, setup)
    assert {f["kind"] for f in l["files"]} == {"proof", "receipt"} and l["has_payout_qr"]
    sub = next(e for e in mail.SYNC_FOR_TESTS if e["kind"] == "listing_submitted")
    assert "when a buyer purchases your ticket" in sub["text"]
    me = client.get("/api/account/me", headers=setup["seller"]).json()
    assert me["payout"]["has_qr"] and me["payout"]["account_number"] == "000111222"
    assert client.get(f"/api/admin/listings/{l['id']}/payout-qr", headers=setup["admin"]).status_code == 200
    assert client.get(f"/api/admin/listings/{l['id']}/payout-qr", headers=setup["buyer"]).status_code == 403


def test_avatar_locale_and_profile(client, setup):
    r = client.post("/api/account/avatar", headers=setup["buyer"], files={"file": ("me.png", png_bytes(), "image/png")})
    assert r.status_code == 200 and r.json()["avatar_url"].endswith(".jpg")
    r = client.patch("/api/account/me", headers=setup["buyer"], json={"locale": "km", "full_name": "Dara K"})
    assert r.json()["locale"] == "km" and r.json()["full_name"] == "Dara K"
    assert client.patch("/api/account/me", headers=setup["buyer"], json={"locale": "fr"}).status_code == 422


def test_seller_told_ticket_sold_and_daily_report(client, setup):
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    checkout(client, setup["buyer"], l["id"])
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "60001")) == "matched"
    sold = next(e for e in mail.SYNC_FOR_TESTS if e["kind"] == "ticket_sold")
    assert "$85.00" in sold["text"]
    with SessionLocal() as s:
        text = reports.daily_text(s)
        assert "Tickets sold: <b>1</b>" in text and "$115.00" in text
        series = reports.series(s, 7)
        assert len(series) == 7 and series[-1]["tickets"] == 1
        # sent once per day only
        s.add(PlatformSetting(key="telegram", value={"daily_report_hour": 0}))
        s.commit()
        assert reports.maybe_send_daily(s) is True
        assert reports.maybe_send_daily(s) is False
    assert any(m["kind"] == "daily_report" for m in TG_SENT)
    ov = client.get("/api/admin/overview", headers=setup["admin"]).json()
    assert len(ov["series"]) == 30 and ov["top_concerts"][0]["tickets"] == 1
