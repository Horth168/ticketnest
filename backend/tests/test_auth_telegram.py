import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlencode

from conftest import BOT_CALLS, make_user

from app.services import email as mail

TOKEN = "123456:TEST-TOKEN"


def init_data(user: dict, token=TOKEN, age=0) -> str:
    fields = {"auth_date": str(int(time.time()) - age), "query_id": "AAE", "user": json.dumps(user)}
    check = "\n".join(f"{k}={fields[k]}" for k in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


def test_miniapp_login_validates_init_data(client):
    good = init_data({"id": 4242, "first_name": "Mina", "username": "mina_k"})
    r = client.post("/api/auth/telegram-app", json={"init_data": good})
    assert r.status_code == 200
    u = r.json()["user"]
    assert u["telegram_id"] == 4242 and u["providers"] == ["telegram"]
    # same Telegram user again -> same account, never a duplicate
    assert client.post("/api/auth/telegram-app", json={"init_data": good}).json()["user"]["id"] == u["id"]
    # forged: signed with another bot's token, tampered, or too old
    assert client.post("/api/auth/telegram-app", json={"init_data": init_data({"id": 1}, token="999:other")}).status_code == 401
    assert client.post("/api/auth/telegram-app", json={"init_data": good.replace("4242", "4243")}).status_code == 401
    assert client.post("/api/auth/telegram-app", json={"init_data": init_data({"id": 5}, age=3 * 86400)}).status_code == 401


def test_password_reset_flow(client):
    make_user("reset@example.com")
    r = client.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
    same = client.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})
    assert r.json() == same.json()   # no account enumeration
    sent = [e for e in mail.SYNC_FOR_TESTS if e["kind"] == "password_reset"]
    assert len(sent) == 1
    token = re.search(r"token=([\w-]+)", sent[0]["text"]).group(1)
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "newpass123"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": token, "password": "again1234"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "newpass123"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "reset@example.com", "password": "secret123"}).status_code == 401


def test_refresh_token_rotation_and_reuse(client):
    make_user("r@example.com")
    r = client.post("/api/auth/login", json={"email": "r@example.com", "password": "secret123"}).json()
    n = client.post("/api/auth/refresh", json={"refresh_token": r["refresh_token"]})
    assert n.status_code == 200
    # re-using the old one revokes everything
    assert client.post("/api/auth/refresh", json={"refresh_token": r["refresh_token"]}).status_code == 401
    assert client.post("/api/auth/refresh", json={"refresh_token": n.json()["refresh_token"]}).status_code == 401


def test_admin_commands_need_admin_id(client):
    from app.database import SessionLocal
    from app.routers.telegram import handle_update
    with SessionLocal() as s:
        handle_update(s, {"message": {"chat": {"id": 55, "type": "private"}, "from": {"id": 55}, "text": "/revenue"}})
        handle_update(s, {"message": {"chat": {"id": 777, "type": "private"}, "from": {"id": 777}, "text": "/revenue"}})
    texts = [kw.get("text", "") for m, kw in BOT_CALLS if m == "sendMessage"]
    assert "admins only" in texts[0]
    assert "Revenue" in texts[1]


def test_start_lets_bot_message_customer(client):
    from app.database import SessionLocal
    from app.models import TelegramUser
    from app.routers.telegram import handle_update
    with SessionLocal() as s:
        handle_update(s, {"message": {"chat": {"id": 88, "type": "private"}, "from": {"id": 88, "username": "fan88"},
                                      "text": "/start"}})
        assert s.query(TelegramUser).filter_by(telegram_id=88).one().can_message is True
