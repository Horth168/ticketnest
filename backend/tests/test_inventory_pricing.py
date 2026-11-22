import threading
from datetime import timedelta

from conftest import checkout, create_listing, payway_msg

from app.database import SessionLocal
from app.models import Order, TicketListing, User
from app.services import orders as svc, payway
from app.services.pricing import quote
from app.utils import percent_of, to_cents, utcnow


def test_pricing_examples_and_rounding():
    q = quote(10000, 1, commission_bps=1500, markup_bps=1500)
    assert (q.total_cents, q.seller_payout_cents, q.markup_cents + q.commission_cents) == (11500, 8500, 3000)
    q = quote(3333, 3, commission_bps=1500, markup_bps=1250)
    assert q.unit_markup_cents == 417 and q.unit_commission_cents == 500   # half-up per ticket
    assert q.total_cents == (3333 + 417) * 3
    assert to_cents("100.005") == 10001 and to_cents("1,250.50") == 125050
    assert percent_of(1, 5000) == 1


def test_fees_are_configurable(client, setup):
    r = client.put("/api/admin/settings/fees", headers=setup["admin"],
                   json={"seller_commission_bps": 1000, "buyer_markup_bps": 2000})
    assert r.status_code == 200
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    q = client.get(f"/api/listings/{l['id']}/quote").json()
    assert q["total_cents"] == 12000
    assert client.put("/api/admin/settings/fees", headers=setup["admin"],
                      json={"buyer_markup_bps": 9000}).status_code == 422
    assert client.put("/api/admin/settings/fees", headers=setup["seller"],
                      json={"buyer_markup_bps": 0}).status_code == 403


def test_cannot_oversell_and_idempotent_checkout(client, setup):
    l = create_listing(client, setup, qty=1)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    a = checkout(client, setup["buyer"], l["id"], key="same-key-123")
    again = checkout(client, setup["buyer"], l["id"], key="same-key-123")   # double tap
    assert a.json()["order_number"] == again.json()["order_number"]
    b = checkout(client, setup["buyer2"], l["id"], key="other-key-12")
    assert b.status_code == 409
    pub = client.get(f"/api/concerts/{setup['concert']['slug']}").json()
    assert pub["listings"][0]["status"] == "reserved" and pub["listings"][0]["available"] == 0


def test_simultaneous_checkouts_sell_each_ticket_once(client, setup):
    """20 buyers hit the last 3 tickets at once (threads, real database): exactly 3 succeed."""
    from conftest import login, make_user
    l = create_listing(client, setup, qty=3)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    heads = []
    for i in range(20):
        make_user(f"rush{i}@example.com")
        heads.append(login(client, f"rush{i}@example.com"))
    results = []

    def go(i):
        results.append(checkout(client, heads[i], l["id"], key=f"rush-key-{i:04d}").status_code)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(20)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert results.count(201) == 3
    assert set(results) <= {201, 409, 500} and results.count(500) == 0
    with SessionLocal() as s:
        x = s.get(TicketListing, l["id"])
        assert x.quantity_reserved == 3 and x.available == 0


def test_expired_checkout_releases_tickets_and_late_payment_within_grace(client, setup):
    l = create_listing(client, setup, qty=1)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    # QR expired 5 minutes ago (inside the 10 minute grace): not released yet, payment still accepted
    with SessionLocal() as s:
        order = s.query(Order).filter_by(order_number=o["order_number"]).one()
        order.expires_at = utcnow() - timedelta(minutes=5)
        order.payments[0].expires_at = order.expires_at
        order.payments[0].created_at = utcnow() - timedelta(minutes=20)
        s.commit()
        assert svc.expire_due(s) == 0
        assert payway.handle(s, payway_msg("115.00", "31337")) == "matched"
    assert client.get(f"/api/orders/{o['order_number']}", headers=setup["buyer"]).json()["status"] == "paid"


def test_expiry_after_grace(client, setup):
    l = create_listing(client, setup, qty=1)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    with SessionLocal() as s:
        order = s.query(Order).filter_by(order_number=o["order_number"]).one()
        order.expires_at = utcnow() - timedelta(minutes=30)
        order.payments[0].expires_at = order.expires_at
        order.payments[0].created_at = utcnow() - timedelta(minutes=45)
        s.commit()
        assert svc.expire_due(s) == 1
        assert s.get(TicketListing, l["id"]).available == 1
    got = client.get(f"/api/orders/{o['order_number']}", headers=setup["buyer"]).json()
    assert got["status"] == "cancelled" and got["payments"][0]["status"] == "expired"
    # money arriving much later matches nothing automatically
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "99001")) == "unmatched"


def test_seller_cannot_buy_own_or_edit_others(client, setup):
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    assert checkout(client, setup["seller"], l["id"]).status_code == 400
    assert client.patch(f"/api/sell/listings/{l['id']}", headers=setup["buyer"], json={"price": 1}).status_code == 404
    # proofs are private
    fid = l["files"][0]["id"]
    assert client.get(f"/api/sell/listings/{l['id']}/files/{fid}", headers=setup["buyer"]).status_code == 404
    assert client.get(f"/api/admin/listings/{l['id']}/files/{fid}", headers=setup["buyer"]).status_code == 403
    assert client.get(f"/api/admin/listings/{l['id']}/files/{fid}", headers=setup["admin"]).status_code == 200


def test_upload_rejects_non_images(client, setup):
    c = setup["concert"]
    r = client.post("/api/sell/listings", headers=setup["seller"], data={
        "concert_id": c["id"], "category_id": c["categories"][0]["id"], "original_price": "90", "price": "100",
        "quantity": 1, "contact_name": "Sok", "contact_telegram": "sok_seller", "payout_method": "ABA",
        "payout_account_name": "SOK", "payout_account_number": "0001112", "confirm_owner": "true"},
        files=[("files", ("evil.png", b"<script>alert(1)</script>", "image/png"))])
    assert r.status_code == 415


def test_user_cannot_touch_other_orders(client, setup):
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    assert client.get(f"/api/orders/{o['order_number']}", headers=setup["buyer2"]).status_code == 404
    assert client.post(f"/api/orders/{o['order_number']}/cancel", headers=setup["buyer2"]).status_code == 404
    assert client.get(f"/api/orders/{o['order_number']}/qr.png?t=wrong").status_code == 404
    assert client.get("/api/admin/overview", headers=setup["buyer"]).status_code == 403
    with SessionLocal() as s:
        assert s.query(User).count() == 4
