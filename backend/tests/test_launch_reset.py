"""Launch cleanup: keeps staff, artists and one concert; removes all test orders, money records and customers."""
from datetime import timedelta

from conftest import make_user

from app.database import SessionLocal
from app.models import (AuditLog, Concert, Order, Payment, Review, Role, TicketCategory, TicketListing, User,
                        WalletTransaction)
from app.utils import utcnow
from test_fans import _paid_order


def test_launch_reset_preview_backup_and_delete(client, setup):
    make_user("staff@example.com", Role.staff, "Helper")
    _paid_order(client, setup)
    admin = setup["admin"]
    keep = client.post("/api/admin/concerts", headers=admin, json={
        "artist_id": setup["artist"]["id"], "title": "Bigbang cosmo jakarta", "venue": "JIS", "city": "Jakarta",
        "country": "Indonesia", "starts_at": (utcnow() + timedelta(days=60)).isoformat(),
        "categories": [{"name": "VIP"}]}).json()
    with SessionLocal() as s:
        s.add(Review(name="Test", rating=5, text="Great service, fast delivery", status="approved"))
        s.commit()
        assert s.query(WalletTransaction).count() > 0

    # customers and staff below admin can't see or run it
    assert client.get(f"/api/admin/launch-reset?keep_concert_id={keep['id']}", headers=setup["buyer"]).status_code == 403
    p = client.get(f"/api/admin/launch-reset?keep_concert_id={keep['id']}", headers=admin)
    assert p.status_code == 200, p.text
    p = p.json()
    rows = {r["label"]: r["count"] for r in p["delete"]}
    assert rows["Orders"] == 1 and rows["Payments"] >= 1 and rows["Concerts"] == 1 and rows["Customer accounts"] == 3
    assert [c["title"] for c in p["concerts_removed"]] == ["World Tour Test Show"]
    assert {a["role"] for a in p["kept_accounts"]} == {"admin", "staff"}

    bad = client.post("/api/admin/launch-reset", headers=admin, json={"keep_concert_id": keep["id"], "confirm": "yes"})
    assert bad.status_code == 422
    with SessionLocal() as s:
        assert s.query(Order).count() == 1        # nothing deleted without the typed confirmation

    r = client.post("/api/admin/launch-reset", headers=admin,
                    json={"keep_concert_id": keep["id"], "confirm": "delete test data"})
    assert r.status_code == 200, r.text
    assert r.json()["backup"].startswith("ticketnest-")
    with SessionLocal() as s:
        assert [c.title for c in s.query(Concert)] == ["Bigbang cosmo jakarta"]
        assert s.query(TicketCategory).count() == 1
        for m in (Order, Payment, TicketListing, WalletTransaction, Review):
            assert s.query(m).count() == 0, m
        assert sorted(u.role.value for u in s.query(User)) == ["admin", "staff"]
        assert s.query(AuditLog).filter_by(action="launch.reset").count() == 1
    # the admin is still signed in and the public site shows only the kept concert
    assert client.get("/api/admin/overview", headers=admin).status_code == 200
    items = client.get("/api/concerts").json()["items"]
    assert [c["id"] for c in items] == [keep["id"]]
