"""Notify-me alerts, reviews, share previews, seat map data, seller sales badge, demo content, backups
and error alerts."""
import gzip
import json

from conftest import TG_SENT, checkout, create_listing, make_user

from app.database import SessionLocal
from app.models import Concert, PlatformSetting, Review, TicketListing
from app.services import alerts, backup, demo, email as mail


def test_notify_me_alerts_on_approval(client, setup):
    slug = setup["concert"]["slug"]
    assert client.post(f"/api/concerts/{slug}/alert", headers=setup["buyer"]).json()["subscribed"]
    assert client.get(f"/api/concerts/{slug}/alert", headers=setup["buyer"]).json() == {"subscribed": True, "followers": 1}
    assert client.post(f"/api/concerts/{slug}/alert").status_code == 401
    l = create_listing(client, setup)
    mail.SYNC_FOR_TESTS.clear()
    assert client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"]).status_code == 200
    alert_mails = [m for m in mail.SYNC_FOR_TESTS if m["kind"] == "concert_alert"]
    assert len(alert_mails) == 1 and alert_mails[0]["to"] == "buyer@example.com"
    # a second listing right away does not spam the same fan
    l2 = create_listing(client, setup, category=1)
    client.post(f"/api/admin/listings/{l2['id']}/approve", headers=setup["admin"])
    assert len([m for m in mail.SYNC_FOR_TESTS if m["kind"] == "concert_alert"]) == 1
    assert client.delete(f"/api/concerts/{slug}/alert", headers=setup["buyer"]).json() == {"subscribed": False}


def test_reviews_need_approval_and_samples_stay_private(client, setup):
    r = client.post("/api/reviews", headers=setup["buyer"], json={"rating": 5, "text": "Great and safe, got my ticket fast!"})
    assert r.status_code == 201 and r.json()["status"] == "pending"
    assert any(m["kind"] == "review_new" for m in TG_SENT)
    assert client.get("/api/reviews").json()["reviews"] == []
    assert client.post(f"/api/admin/reviews/{r.json()['id']}/approve", headers=setup["buyer"]).status_code == 403
    assert client.post(f"/api/admin/reviews/{r.json()['id']}/approve", headers=setup["admin"]).status_code == 200
    pub = client.get("/api/reviews").json()
    assert pub["count"] == 1 and pub["average"] == 5 and pub["reviews"][0]["name"] == "Dara B."
    assert "email" not in pub["reviews"][0]
    # editing sends it back for approval (one review per customer)
    client.post("/api/reviews", headers=setup["buyer"], json={"rating": 4, "text": "Still great, a bit slow reply."})
    assert client.get("/api/reviews").json()["count"] == 0
    assert client.post("/api/reviews", headers=setup["buyer"], json={"rating": 6, "text": "too many stars here"}).status_code == 422
    # samples: staff preview only, never approvable, never public
    with SessionLocal() as s:
        demo.seed_once(s)
        sid = s.query(Review).filter_by(is_sample=True).first().id
    assert all(not x["is_sample"] for x in client.get("/api/reviews?preview=1", headers=setup["buyer"]).json()["reviews"])
    staff = client.get("/api/reviews?preview=1", headers=setup["admin"]).json()
    assert staff["preview"] and any(x["is_sample"] for x in staff["reviews"])
    assert client.post(f"/api/admin/reviews/{sid}/approve", headers=setup["admin"]).status_code == 409


def test_demo_concert_is_staff_only_and_not_for_sale(client, setup):
    with SessionLocal() as s:
        assert demo.seed_once(s) and not demo.seed_once(s)   # only once
        c = s.query(Concert).filter_by(slug=demo.SLUG).one()
        listing_id = s.query(TicketListing.id).filter_by(concert_id=c.id).first()[0]
    assert client.get(f"/api/concerts/{demo.SLUG}").status_code == 404
    assert client.get(f"/api/concerts/{demo.SLUG}", headers=setup["buyer"]).status_code == 404
    d = client.get(f"/api/concerts/{demo.SLUG}", headers=setup["admin"]).json()
    assert d["is_demo"] and d["preview"] and d["seat_layout"] == "stadium"
    assert d["categories"][0]["zones"] == ["FA-L", "FA-R"] and len(d["listings"]) >= 10
    assert all(x["slug"] != demo.SLUG for x in client.get("/api/concerts").json()["items"])
    assert client.get(f"/api/listings/{listing_id}/quote").status_code == 404
    assert checkout(client, setup["admin"], listing_id).status_code in (400, 404, 409)
    assert client.get(f"/s/c/{demo.SLUG}").status_code == 404


def test_seat_map_saved_per_category_and_share_page(client, setup):
    c = setup["concert"]
    body = {"artist_id": setup["artist"]["id"], "title": c["title"], "venue": c["venue"], "city": c["city"],
            "country": c["country"], "starts_at": c["starts_at"], "seat_layout": "arena",
            "categories": [{"id": c["categories"][0]["id"], "name": "VIP", "map_zones": "FA-L, FA-R"},
                           {"id": c["categories"][1]["id"], "name": "CAT 1", "map_zones": "L1,L2"}]}
    r = client.put(f"/api/admin/concerts/{c['id']}", headers=setup["admin"], json=body)
    assert r.status_code == 200 and r.json()["seat_layout"] == "arena"
    d = client.get(f"/api/concerts/{c['slug']}").json()
    assert d["categories"][0]["zones"] == ["FA-L", "FA-R"] and d["preview"] is False
    assert client.put(f"/api/admin/concerts/{c['id']}", headers=setup["admin"], json={**body, "seat_layout": "moon"}).status_code == 422
    page = client.get(f"/s/c/{c['slug']}")
    assert page.status_code == 200 and 'property="og:title"' in page.text and "https://ticketnest.test/concerts/" in page.text


def test_seller_sales_badge(client, setup):
    from app.services import orders as order_svc
    l = create_listing(client, setup, qty=3)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    with SessionLocal() as s:
        from app.models import Order, OrderStatus
        row = s.query(Order).filter_by(order_number=o["order_number"]).one()
        row.status = OrderStatus.delivered
        s.commit()
    d = client.get(f"/api/concerts/{setup['concert']['slug']}").json()
    assert d["listings"][0]["seller_sales"] == 1
    assert order_svc is not None


def test_backup_roundtrip_and_admin_only(client, setup):
    assert client.get("/api/admin/backups", headers=setup["buyer"]).status_code == 403
    r = client.post("/api/admin/backups", headers=setup["admin"])
    assert r.status_code == 200, r.text
    name = r.json()["name"]
    files = client.get("/api/admin/backups", headers=setup["admin"]).json()["files"]
    assert files[0]["name"] == name
    raw = client.get(f"/api/admin/backups/{name}", headers=setup["admin"])
    doc = json.loads(gzip.decompress(raw.content))
    assert doc["format"] == "ticketnest-backup/1" and len(doc["tables"]["users"]) == 4
    assert "refresh_tokens" not in doc["tables"]
    assert client.get("/api/admin/backups/..%2Fsecret", headers=setup["admin"]).status_code in (400, 404)
    with SessionLocal() as s:   # already backed up today -> the daily job waits for tomorrow
        assert backup.maybe_run_daily(s) is False
        assert s.get(PlatformSetting, backup.STATE_KEY).value["name"] == name


def test_error_alerts_are_rate_limited(monkeypatch):
    sent = []
    monkeypatch.setattr(alerts, "_send", lambda text: sent.append(text))
    monkeypatch.setattr(alerts.threading, "Thread", lambda target, args, daemon: type("T", (), {"start": lambda self: target(*args)})())
    alerts._seen.clear(); alerts._sent.clear()
    assert alerts.client_error("TypeError: x is undefined", "/concerts/a")
    assert not alerts.client_error("TypeError: x is undefined", "/concerts/b")   # same error within 30 min
    try:
        raise ValueError("boom")
    except ValueError as e:
        alerts.api_error("GET", "/api/x", e)
    assert len(sent) == 2 and "API ERROR" in sent[1] and "ValueError: boom" in sent[1]


def test_client_error_endpoint(client):
    assert client.post("/api/client-errors", json={"message": "Oops", "page": "/"}).status_code == 204
    assert client.post("/api/client-errors", json={"message": "x" * 600}).status_code == 422
    assert make_user  # fixture import kept for parity


def test_demo_becomes_unpublished_draft_without_fake_tickets(client, setup):
    with SessionLocal() as s:
        demo.seed_once(s)
        assert demo.to_draft_once(s) and not demo.to_draft_once(s)   # only once
        c = s.query(Concert).filter_by(slug=demo.DRAFT_SLUG).one()
        assert not c.is_demo and not c.is_published and c.poster_url == "" and "DEMO" not in c.title
        assert s.query(TicketListing).filter_by(concert_id=c.id).count() == 0
        assert len(c.categories) == 6 and c.seat_layout == "stadium"
    assert client.get(f"/api/concerts/{demo.DRAFT_SLUG}").status_code == 404          # customers: hidden
    d = client.get(f"/api/concerts/{demo.DRAFT_SLUG}", headers=setup["admin"]).json()  # staff: preview
    assert d["preview"] and not d["is_demo"] and d["listings"] == []
    # publishing is the admin's choice once the real details are in
    a = client.get("/api/admin/concerts", headers=setup["admin"]).json()
    draft = next(x for x in a if x["slug"] == demo.DRAFT_SLUG)
    body = {k: draft[k] for k in ("artist_id", "title", "venue", "city", "country", "starts_at", "seat_layout")}
    body.update(is_published=True, categories=[{"id": x["id"], "name": x["name"], "map_zones": x["map_zones"]} for x in draft["categories"]])
    assert client.put(f"/api/admin/concerts/{draft['id']}", headers=setup["admin"], json=body).json()["is_published"]
    assert client.get(f"/api/concerts/{demo.DRAFT_SLUG}").status_code == 200


def test_khqr_card_image_scans_and_shows_merchant(client, setup):
    import pytest
    cv2 = pytest.importorskip("cv2")   # QR decoder, dev machines only
    import numpy as np
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    k = o["khqr"]
    assert k["merchant_name"] == "TICKETNEST"
    r = client.get(k["image_url"])
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    img = cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
    assert img.shape[0] > img.shape[1]                     # tall card, not a bare square QR
    assert cv2.QRCodeDetector().detectAndDecode(img)[0] == k["payload"]


def test_turnstile_and_login_lockout(client, setup, monkeypatch):
    from app.config import settings
    from app.services import human
    # lockout: 8 wrong passwords -> locked, even with the right one
    for _ in range(8):
        assert client.post("/api/auth/login", json={"email": "buyer2@example.com", "password": "wrong-pass"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": "buyer2@example.com", "password": "secret123"})
    assert r.status_code == 429 and "Try again" in r.json()["detail"]
    human._locked.clear()
    assert client.post("/api/auth/login", json={"email": "buyer2@example.com", "password": "secret123"}).status_code == 200
    # Turnstile on: no token -> 403; Cloudflare says ok -> allowed; site key published
    monkeypatch.setattr(settings, "TURNSTILE_SITE_KEY", "site-key")
    monkeypatch.setattr(settings, "TURNSTILE_SECRET_KEY", "secret")
    assert client.get("/api/settings/public").json()["auth"]["turnstile_site_key"] == "site-key"
    assert client.post("/api/auth/login", json={"email": "buyer@example.com", "password": "secret123"}).status_code == 403
    calls = []
    class R:
        def __init__(self, ok): self.ok = ok
        def json(self): return {"success": self.ok}
    monkeypatch.setattr(human.httpx, "post", lambda url, timeout, data: calls.append(data) or R(data["response"] == "good"))
    assert client.post("/api/auth/login", json={"email": "buyer@example.com", "password": "secret123"},
                       headers={"X-Human-Token": "bad"}).status_code == 403
    assert client.post("/api/auth/login", json={"email": "buyer@example.com", "password": "secret123"},
                       headers={"X-Human-Token": "good"}).status_code == 200
    assert calls[-1]["secret"] == "secret"


def test_public_pages_cached_and_cleared_on_changes(client, setup, monkeypatch):
    from app import cache
    monkeypatch.setattr(cache, "_force", True)
    cache.clear()
    calls = []
    import app.routers.catalog as cat
    real = cat._home
    monkeypatch.setattr(cat, "_home", lambda db: calls.append(1) or real(db))
    client.get("/api/home"); client.get("/api/home"); client.get("/api/home")
    assert len(calls) == 1                                  # built once, then served from memory
    l = create_listing(client, setup)                       # any change clears the cache
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    assert client.get("/api/home").json()["recent_listings"][0]["id"] == l["id"] and len(calls) == 2
    cache.clear()
