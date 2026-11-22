"""The complete business workflow from the brief, end to end through the real API:

register -> list ticket -> admin approves -> buyer checks out -> KHQR -> PayWay notification ->
PAID -> invoice + email -> admin alert -> delivered -> seller wallet -> withdrawal.
"""
from datetime import timedelta

from conftest import TG_SENT, checkout, create_listing, login, payway_msg

from app.database import SessionLocal
from app.models import Order, PaymentNotification, SellerWallet, TicketListing, User
from app.services import email as mail, payway
from app.utils import utcnow


def test_complete_workflow(client, setup):
    # customer registers and logs in
    r = client.post("/api/auth/register", json={"email": "new@example.org", "password": "kpop2026x", "full_name": "New Fan"})
    assert r.status_code == 201
    assert any(m["kind"] == "registration" for m in TG_SENT)
    assert any(e["kind"] == "welcome" for e in mail.SYNC_FOR_TESTS)
    login(client, "new@example.org", "kpop2026x")

    # seller lists a ticket -> pending, invisible to the public, admin alerted with buttons
    listing = create_listing(client, setup, price="100", qty=2)
    assert listing["status"] == "pending"
    alert = next(m for m in TG_SENT if m["kind"] == "listing_new")
    assert "NEW LISTING" in alert["text"] and "Pending Approval" in alert["text"]
    assert alert["buttons"][0][0]["callback_data"] == f"lst:ok:{listing['id']}"
    slug = setup["concert"]["slug"]
    pub = client.get(f"/api/concerts/{slug}").json()
    assert pub["listings"] == [] and pub["sold_out"] is True

    # admin approves -> public, with the 15 % buyer markup
    r = client.post(f"/api/admin/listings/{listing['id']}/approve", headers=setup["admin"])
    assert r.json()["status"] == "available"
    pub = client.get(f"/api/concerts/{slug}").json()
    assert pub["listings"][0]["price_cents"] == 10000
    assert pub["listings"][0]["buyer_price_cents"] == 11500
    q = client.get(f"/api/listings/{listing['id']}/quote?quantity=1").json()
    assert (q["subtotal_cents"], q["markup_cents"], q["total_cents"]) == (10000, 1500, 11500)

    # buyer checks out -> tickets reserved, KHQR with the exact amount and our order number
    r = checkout(client, setup["buyer"], listing["id"], qty=1)
    assert r.status_code == 201, r.text
    order = r.json()
    assert order["status"] == "awaiting_payment" and order["order_number"].startswith("TN-")
    assert order["khqr"]["amount"] == 11500 and order["khqr"]["currency"] == "USD"
    assert "115.00" in order["khqr"]["payload"] and order["order_number"] in order["khqr"]["payload"]
    assert order["invoice_number"] is None   # never before verified payment
    assert client.get(order["khqr"]["image_url"]).headers["content-type"] == "image/png"
    with SessionLocal() as s:
        l = s.get(TicketListing, listing["id"])
        assert (l.quantity_reserved, l.available) == (1, 1)

    # a stranger posting a fake PayWay message changes nothing
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "900001", from_bot=False)) == "ignored"
        assert payway.handle(s, payway_msg("115.00", "900002", username="FakePayWayBot")) == "ignored"
    assert client.get(f"/api/orders/{order['order_number']}", headers=setup["buyer"]).json()["status"] == "awaiting_payment"

    # the genuine PayWay notification confirms it
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "179468810879402")) == "matched"
    paid = client.get(f"/api/orders/{order['order_number']}", headers=setup["buyer"]).json()
    assert paid["status"] == "paid"
    assert paid["invoice_number"].startswith("INV-")
    assert paid["payments"][0]["reference"] == "ABA 179468810879402"
    assert paid["payments"][0]["status"] == "verified"
    with SessionLocal() as s:
        l = s.get(TicketListing, listing["id"])
        assert (l.quantity_reserved, l.quantity_sold, l.available) == (0, 1, 1)
        w = s.query(SellerWallet).join(User).filter(User.email == "seller@example.com").one()
        assert (w.pending_cents, w.available_cents) == (8500, 0)   # $100 - 15 %

    # email with the PDF invoice, admin alert in the brief's format
    conf = next(e for e in mail.SYNC_FOR_TESTS if e["kind"] == "payment_confirmed")
    assert conf["to"] == "dara@example.com" and conf["attachments"] == [f"{paid['invoice_number']}.pdf"]
    assert "contact you through Telegram" in conf["text"]
    alert = next(m for m in TG_SENT if m["kind"] == "payment_verified")
    for part in ("NEW ORDER", order["order_number"], "World Tour Test Show", "VIP", "Quantity: 1",
                 "Seller Listing Price: $100.00", "Buyer Payment: $115.00", "VERIFIED"):
        assert part in alert["text"], part

    # the same transaction again is ignored; it can never pay a second order
    r2 = checkout(client, setup["buyer2"], listing["id"], qty=1, key="key-second-1")
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "179468810879402")) == "duplicate"
    assert client.get(f"/api/orders/{r2.json()['order_number']}", headers=setup["buyer2"]).json()["status"] == "awaiting_payment"

    # invoice PDF
    pdf = client.get(f"/api/orders/{order['order_number']}/invoice.pdf", headers=setup["buyer"])
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

    # admin delivers through Telegram and records it -> seller earnings available
    r = client.post(f"/api/admin/orders/{order['id']}/deliver", headers=setup["admin"],
                    data={"method": "telegram", "reference": "Sent PDF ticket to @dara_buyer"})
    assert r.status_code == 200 and r.json()["status"] == "delivered"
    assert any(e["kind"] == "delivered" for e in mail.SYNC_FOR_TESTS)
    mine = client.get(f"/api/orders/{order['order_number']}", headers=setup["buyer"]).json()
    assert mine["status"] == "delivered" and mine["delivery"]["method"] == "telegram"
    # buyer protection: the earnings stay pending until after the concert
    wallet = client.get("/api/account/wallet", headers=setup["seller"]).json()
    assert (wallet["pending_cents"], wallet["available_cents"]) == (8500, 0)
    with SessionLocal() as s:
        from app.models import Order as O
        from app.services import orders as osvc
        row = s.query(O).filter_by(order_number=order["order_number"]).one()
        assert row.payout_release_at is not None and row.payout_released_at is None
        assert osvc.release_due(s) == 0                       # concert hasn't happened yet
        row.payout_release_at = utcnow() - timedelta(minutes=1)   # ... 48 h after the concert
        s.commit()
        assert osvc.release_due(s) == 1
    wallet = client.get("/api/account/wallet", headers=setup["seller"]).json()
    assert (wallet["pending_cents"], wallet["available_cents"]) == (0, 8500)
    assert client.get(f"/api/orders/{order['order_number']}", headers=setup["buyer"]).json()["status"] == "completed"

    # seller dashboard numbers
    dash = client.get("/api/sell/dashboard", headers=setup["seller"]).json()
    assert dash["sold_tickets"] == 1 and dash["gross_sales_cents"] == 10000
    assert dash["commission_cents"] == 1500 and dash["net_earnings_cents"] == 8500

    # withdrawal: can't take more than available; admin pays it
    assert client.post("/api/account/withdrawals", headers=setup["seller"], json={
        "amount": "90", "method": "ABA", "account_name": "SOK", "account_number": "000111222"}).status_code == 400
    r = client.post("/api/account/withdrawals", headers=setup["seller"], json={
        "amount": "85", "method": "ABA", "account_name": "SOK SELLER", "account_number": "000111222"})
    assert r.status_code == 201, r.text
    assert any(m["kind"] == "withdrawal_new" for m in TG_SENT)
    r = client.post(f"/api/admin/withdrawals/{r.json()['id']}/settle", headers=setup["admin"],
                    json={"paid": True, "reference": "ABA transfer 123"})
    assert r.json()["status"] == "paid"
    wallet = client.get("/api/account/wallet", headers=setup["seller"]).json()
    assert (wallet["available_cents"], wallet["held_cents"], wallet["withdrawn_cents"]) == (0, 0, 8500)


def test_pending_and_rejected_listings_never_public(client, setup):
    l1 = create_listing(client, setup)
    l2 = create_listing(client, setup, category=1)
    client.post(f"/api/admin/listings/{l2['id']}/reject", headers=setup["admin"], json={"reason": "Blurry proof"})
    pub = client.get(f"/api/concerts/{setup['concert']['slug']}").json()
    assert pub["listings"] == []
    assert checkout(client, setup["buyer"], l1["id"]).status_code == 404
    mine = client.get("/api/sell/listings", headers=setup["seller"]).json()
    assert {x["status"] for x in mine} == {"pending", "rejected"}
    assert next(x for x in mine if x["id"] == l2["id"])["rejection_reason"] == "Blurry proof"


def test_wrong_amount_and_unmatched_are_never_confirmed(client, setup):
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("114.00", "5551")) == "unmatched"
        assert payway.handle(s, payway_msg("100.00", "5552", extra=f" Remark {o['order_number']}")) == "wrong_amount"
        outcomes = {n.trx_id: n.outcome for n in s.query(PaymentNotification).all()}
    assert outcomes == {"5551": "unmatched", "5552": "wrong_amount"}
    assert client.get(f"/api/orders/{o['order_number']}", headers=setup["buyer"]).json()["status"] == "awaiting_payment"


def test_two_orders_same_amount_asks_admin(client, setup):
    l = create_listing(client, setup, qty=2)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o1 = checkout(client, setup["buyer"], l["id"], key="key-aaaaaaa1").json()
    o2 = checkout(client, setup["buyer2"], l["id"], key="key-bbbbbbb2").json()
    with SessionLocal() as s:
        assert payway.handle(s, payway_msg("115.00", "777001")) == "ambiguous"
    msg = next(m for m in TG_SENT if m["kind"] == "payment_unmatched")
    datas = [b[0]["callback_data"] for b in msg["buttons"]]
    assert len(datas) == 2
    for o in (o1, o2):
        assert client.get(f"/api/orders/{o['order_number']}", headers=setup["admin"]).json()["status"] == "awaiting_payment"

    # a NON-admin pressing the button does nothing
    from app.routers.telegram import handle_update
    with SessionLocal() as s:
        handle_update(s, {"callback_query": {"id": "1", "from": {"id": 12345}, "data": datas[0],
                                             "message": {"message_id": 5, "chat": {"id": -1009990001}}}})
    assert client.get(f"/api/orders/{o1['order_number']}", headers=setup["admin"]).json()["status"] == "awaiting_payment"
    # the admin (TELEGRAM_ADMIN_ID=777) picks the right order
    with SessionLocal() as s:
        handle_update(s, {"callback_query": {"id": "2", "from": {"id": 777, "first_name": "Owner"}, "data": datas[0],
                                             "message": {"message_id": 5, "chat": {"id": -1009990001}}}})
    statuses = {client.get(f"/api/orders/{o['order_number']}", headers=setup["admin"]).json()["status"] for o in (o1,)}
    assert statuses == {"paid"}
    # the same Trx can't be used for the other order too
    with SessionLocal() as s:
        handle_update(s, {"callback_query": {"id": "3", "from": {"id": 777}, "data": datas[1],
                                             "message": {"message_id": 5, "chat": {"id": -1009990001}}}})
    with SessionLocal() as s:
        assert s.query(Order).filter_by(order_number=o2["order_number"]).one().status.value == "awaiting_payment"


def test_manual_confirmation_requires_unique_trx(client, setup):
    l = create_listing(client, setup, qty=2)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o1 = checkout(client, setup["buyer"], l["id"], key="key-m1-00001").json()
    o2 = checkout(client, setup["buyer2"], l["id"], key="key-m2-00002").json()
    assert client.post(f"/api/admin/orders/{o1['id']}/confirm-payment", headers=setup["admin"],
                       json={"trx_id": "123456789"}).json()["status"] == "paid"
    r = client.post(f"/api/admin/orders/{o2['id']}/confirm-payment", headers=setup["admin"], json={"trx_id": "123456789"})
    assert r.status_code == 409
    # buyers and staff can't confirm payments
    assert client.post(f"/api/admin/orders/{o2['id']}/confirm-payment", headers=setup["buyer"],
                       json={"trx_id": "999999"}).status_code == 403


def test_refund_reverses_seller_earnings(client, setup):
    l = create_listing(client, setup)
    client.post(f"/api/admin/listings/{l['id']}/approve", headers=setup["admin"])
    o = checkout(client, setup["buyer"], l["id"]).json()
    with SessionLocal() as s:
        payway.handle(s, payway_msg("115.00", "4242"))
    r = client.post(f"/api/admin/orders/{o['id']}/refund", headers=setup["admin"],
                    json={"reason": "Concert postponed", "restock": True})
    assert r.status_code == 200 and r.json()["status"] == "refunded"
    w = client.get("/api/account/wallet", headers=setup["seller"]).json()
    assert w["pending_cents"] == 0 and w["available_cents"] == 0
    with SessionLocal() as s:
        assert s.get(TicketListing, l["id"]).available == 2
