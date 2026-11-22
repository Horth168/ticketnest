# TicketNest

A small, professional **K-pop concert ticket resale marketplace** for Cambodia, run by one owner.
One backend and one database serve three interfaces:

| Interface | Where | What it does |
|---|---|---|
| **Website** | `/` | Browse concerts, buy with KHQR, sell tickets, account, wallet, invoices |
| **Admin dashboard** | `/admin` | Approve listings, manage concerts, deliver orders, reconcile payments, pay sellers, settings |
| **Telegram Mini App** | `/tg` (opened from the bot) | The same marketplace inside Telegram, signed in automatically |
| **Telegram bot** | webhook `/api/telegram/...` | Admin alerts + commands + buttons, customer order updates, Mini App launcher |

Built by reusing IceQ Sole's working architecture: FastAPI + SQLAlchemy + Alembic, React + Vite + Tailwind,
the KHQR builder, the ABA PayWay notification matcher and Telethon listener, Google / Telegram sign-in, and the
Brevo/SMTP email sender.

## How money works

| | Example |
|---|---|
| Seller lists at | $100.00 |
| Buyer pays (+15 % markup) | **$115.00** |
| Seller receives (−15 % commission) | **$85.00** |
| TicketNest gross | **$30.00** |

Both percentages are editable in **Admin → Settings → Fees**. All amounts are integer cents; every price is
calculated on the server.

## Order flow

```
listing submitted ─► admin approves ─► buyer checks out (tickets held) ─► KHQR shown
      ▲                                                                       │ buyer pays in bank app
      │                                     ABA PayWay bot posts in payment group
      │                                     listener ─► matcher: exact amount, one order, new Trx ID
      │                                                                       ▼
seller withdraws ◄─ wallet: available ◄─ admin marks DELIVERED ◄─ PAID + invoice + email + admin alert
```

## Payment verification — read this

ABA does not offer small merchants a payment webhook. TicketNest (like IceQ Sole) confirms payments from the
messages ABA's official **@PayWayByABA_bot** posts in your private Telegram group. That is not a signed bank
callback, so the matcher is strict:

- only messages from the PayWay bot itself in the configured group are read (a person typing a fake message does nothing);
- each ABA transaction ID can confirm **one** payment, ever (database UNIQUE constraints);
- the amount and currency must match **exactly one** open order whose QR was live; otherwise nothing is confirmed
  and the admin gets buttons / a reconciliation entry;
- screenshots are never accepted, and the browser can never mark an order paid.

Optional stronger check: with a **Bakong Open API token**, each QR is also verified server-to-server with the
National Bank's API. See [docs/SETUP.md](docs/SETUP.md#7-aba-payway-payment-confirmation).

## Run locally

```powershell
# API (terminal 1)
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env          # then set SECRET_KEY
alembic upgrade head
python scripts/seed.py          # starting artist list (no concerts are invented)
python scripts/create_admin.py you@example.com "Your Name"
uvicorn app.main:app --reload   # http://localhost:8000/api/docs

# Website, admin and Mini App (terminal 2)
cd web
npm install
npm run dev                     # http://localhost:5173  ·  /admin  ·  /tg

# Tests
cd backend && pytest            # 20 tests incl. the full buy-sell-deliver-withdraw workflow
```

Full beginner guide (database, Google, BotFather, groups, PayWay, email, deployment, admin):
**[docs/SETUP.md](docs/SETUP.md)**.

## Project layout

```
backend/   FastAPI app
  app/routers     HTTP endpoints (auth, catalogue, sell, orders, account, admin, telegram)
  app/services    business rules: pricing, inventory, orders, payway, wallet, email, invoice_pdf, notify ...
  migrations/     Alembic (database versions)
  scripts/        create_admin, seed, telegram_login (PayWay listener), bot_polling (local bot)
  tests/          pytest
web/       React app: website, /admin and /tg Mini App
docs/      SETUP.md
render.yaml  Render deployment blueprint
```
