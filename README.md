# TicketNest

A **K-pop concert ticket resale marketplace** for Cambodia, run by one owner. Fans buy verified tickets from
other fans, pay with **KHQR**, and get their ticket through **Telegram**. One backend and one database serve
the website, the admin dashboard, the Telegram bot and the Telegram Mini App.

## Live

| What | Link |
|---|---|
| Website | https://ticketnest-web.onrender.com |
| Admin dashboard | https://ticketnest-web.onrender.com/admin (staff accounts only) |
| Telegram Mini App | https://t.me/TicketNestbot/app |
| Telegram bot | [@TicketNestbot](https://t.me/TicketNestbot) |
| API + interactive docs | https://ticketnest-api.onrender.com/api/docs |
| Health check | https://ticketnest-api.onrender.com/api/health |

**Testing on the live site:** create a customer account (or sign in with Google / Telegram), browse a concert,
open the seat map, tap **Notify me**, and go through checkout to see the KHQR card. Real KHQR payments are
real money: only pay small test amounts to your own merchant account. The admin side needs a staff account.

## How it works

```
 SELLER                       ADMIN                        BUYER
 ──────                       ─────                        ─────
 list ticket + proof  ─────►  review proof & receipt
 + purchase receipt           approve / reject  ──────►   listing goes on sale
                              (website or Telegram)        "Notify me" fans get Telegram + email
                                                           │
                                                           ▼ checkout (tickets held, no overselling)
                                                           KHQR card shown, pays in any bank app
                                                           │
            ABA PayWay bot posts "$X paid … Trx ID" in the private payment group
                                                           │
            listener ─► matcher: exact amount + currency, exactly one open order, Trx ID never used
                                                           │
                              ◄──── order PAID + invoice PDF + email + Telegram alert with buttons
                              send ticket on Telegram,
                              mark DELIVERED  ──────────►  ticket in "My tickets"
 wallet: pending ─► available ◄─ seller earnings released
 request withdrawal ───────►  pay from bank app (payout QR shown in Telegram), mark paid
```

**Money:** seller lists at $100 → buyer pays $115 (15 % markup) → seller receives $85 (15 % commission) →
TicketNest keeps $30. Both rates are editable in Admin → Settings → Fees. All money is stored as integer cents
and every price is calculated on the server.

**Payments are only ever confirmed from the bank's own message** (never a screenshot, never the browser):
only messages from ABA's official `@PayWayByABA_bot` in the configured group are read, each transaction ID
can confirm one payment ever (database UNIQUE constraint), and the amount must match exactly one open order.
Anything else waits for the admin with buttons. Optional: Bakong Open API server-to-server check.

## What it's built with

| Part | Technology | Hosted on (free tier) |
|---|---|---|
| Website, admin, Mini App | **React 18**, Vite 5, Tailwind CSS 3, React Router 6, lucide icons | **Render static site** (`ticketnest-web`) |
| API | **Python 3.13, FastAPI**, SQLAlchemy 2, Alembic, Pydantic 2, gunicorn + uvicorn | **Render web service** (`ticketnest-api`, Singapore) |
| Database | **PostgreSQL** (SQLite locally) | **Neon** |
| Files (proofs, receipts, posters, backups) | S3-compatible storage, private + public buckets | **Cloudflare R2** |
| Payments | **KHQR** (EMVCo, CRC-16) per order + **ABA PayWay** listener (Telethon) + optional Bakong API | ABA / NBC |
| Telegram | Bot API (webhook), Mini App (signed `initData`), Telegram Login | Telegram |
| Email | Brevo API (or SMTP) | Brevo |
| Sign-in | Email + password (bcrypt, JWT + rotating refresh tokens), Google, Telegram | — |
| PDFs / images | ReportLab invoices, Pillow (image cleaning, KHQR card, posters) | — |
| Keep-awake | Cloudflare Worker cron every 5 min + GitHub Action every 10 min | Cloudflare / GitHub |
| Bot protection | Cloudflare Turnstile (when keys are set), rate limits, sign-in lockout | Cloudflare |

## Project structure

```
backend/                     FastAPI app (Python)
  app/main.py                app setup, security headers, error alerts, background jobs, startup
  app/models.py              database tables (SQLAlchemy)
  app/schemas.py             request validation (Pydantic)
  app/serializers.py         JSON output (public vs owner vs admin views)
  app/security.py            passwords, JWT, current user, staff/admin guards
  app/cache.py               in-memory cache for public pages (cleared on every change)
  app/routers/               HTTP endpoints
    auth.py                  register, login, Google, Telegram, Mini App sign-in, password reset
    catalog.py               home, artists, concerts, concert page + seat map, price quotes
    selling.py               create / edit listings, seller dashboard
    orders.py                checkout, order status, KHQR image, invoice PDF
    account.py               profile, avatar, payout QR, wallet, withdrawals, invoices
    fans.py                  notify-me alerts, reviews, share-link previews, website error reports, backups
    admin_catalog.py         artists, concerts, categories, image uploads
    admin_ops.py             listings review, orders, payments, withdrawals, users, settings, reports
    telegram.py              bot webhook: commands and inline buttons for admins
  app/services/              business rules
    pricing.py inventory.py orders.py listings.py wallet.py     money, stock, order and wallet rules
    khqr.py khqr_card.py     KHQR code builder/parser + official-style KHQR card image
    payway.py tg_listener.py ABA PayWay message matcher + Telethon listener (payment confirmation)
    telegram.py notify.py    Telegram outbox (sent after DB commit) + all alert / customer messages
    email.py invoice_pdf.py  Brevo/SMTP emails, PDF invoices
    storage.py backup.py     R2 / local files, daily database backup
    alerts.py human.py       error alerts to Telegram, Turnstile + sign-in lockout
    reports.py social.py settings_store.py audit.py demo.py
  migrations/                Alembic database versions
  scripts/                   seed.py, create_admin.py, telegram_login.py (PayWay listener login),
                             bot_polling.py (local bot), restore_backup.py
  tests/                     pytest (36 tests, incl. the full buy → pay → deliver → withdraw flow)
web/                         React app (one build serves all three front ends)
  src/pages/                 website pages: Home, Explore, Concert, Checkout, Sell, Tickets, Auth, Info
  src/pages/account/         profile, listings, wallet, invoices
  src/pages/admin/           admin dashboard (+ adminLang.js: English / Khmer switch)
  src/tg/                    Telegram Mini App shell (/tg): Telegram theme, safe areas, back/main buttons
  src/components/            Layout (header, tab bar), SeatMap, KhqrCard, Reviews, ProfileCard, HumanCheck, …
  src/i18n/                  English, Khmer, Chinese
  public/                    icons, manifest.json (installable app), KHQR logos, og-image
ops/keepalive/               Cloudflare Worker that pings the API every 5 minutes
.github/workflows/           keep-api-awake.yml (backup ping every 10 minutes)
brand/                       all logos: previous, current, admin, payments
docs/SETUP.md                step-by-step setup guide (database, bot, groups, PayWay, email, deploy)
render.yaml                  Render blueprint
```

## Capacity on the free tier (measured)

Measured on the live API from Cambodia, after the public-page cache (Nov 2026):

| Test | Result |
|---|---|
| Home page data, one request | ~150 ms (about 100 ms of it is network) |
| Home page data, 200 requests, 25 at the same time | **~71 requests/second**, median 313 ms, slowest 0.5 s, 0 errors |
| Same test before caching | 7 requests/second, median 3.4 s |

What that means in practice (estimates):

- A visitor clicking around makes roughly 5–10 API requests per minute, so **about 400–700 people actively
  browsing at the same moment**, and a few thousand visitors per hour, before pages slow down.
- Checkouts and payments are not cached (they always check live stock); dozens per minute are fine.
- Limits that apply: Render free web service = 512 MB RAM, 0.1 CPU, 750 hours/month (enough for one service
  24/7); free bandwidth is shared across the workspace. Neon free has a monthly compute and storage allowance:
  check *Neon → Usage* once a month. Each visitor's network is rate-limited (300 requests/minute, stricter on
  sign-in and checkout) so one bot can't take the site down.
- To grow: Render Starter ($7/month) gives a full CPU slice and no restarts; that alone multiplies capacity.

## Security

- Passwords hashed with bcrypt; short-lived JWT access tokens + rotating refresh tokens; "sign out everywhere"
  on password reset.
- **Cloudflare Turnstile** (free bot check) on sign-in, register, forgot password, checkout, new listings and
  reviews. Turns on when `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set on the API (see below).
- Sign-in lockout: 8 wrong passwords for an email from one network → locked for 15 minutes.
- Rate limits per IP on every endpoint (stricter on auth, checkout, listings, reviews, error reports).
- Content-Security-Policy on the website (only TicketNest, Telegram, Google and Cloudflare scripts can run),
  HSTS, nosniff, no framing, strict CORS (the API only accepts the real website).
- Uploads: type sniffed from the bytes, images re-encoded (strips hidden content and EXIF), size limits;
  ticket proofs, receipts, payout QRs and backups live in a **private** bucket, only admins / the owner can open them.
- Telegram: webhook secret, Mini App `initData` signature checked on the server, admin buttons only work for
  configured admin IDs. Secrets live only in Render environment variables, never in the code or admin pages.
- Every important admin action is written to the audit log; daily backups; errors alert the admin group.

**Turn on Turnstile (5 minutes):** Cloudflare dashboard → Turnstile → Add widget → name `TicketNest`, add
hostnames `ticketnest-web.onrender.com` (and your own domain later), mode *Managed* → copy the **site key** and
**secret key** → Render → `ticketnest-api` → Environment → add `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`
→ save (it redeploys). The website starts showing the check automatically.

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
cd backend && pytest
```

## Deploying

Push to `main` on GitHub, then deploy both Render services (`ticketnest-api`, `ticketnest-web`). The API runs
`alembic upgrade head` on every start, so database changes apply automatically. Environment variable names are
listed in `backend/.env.example`; the values are only in Render.

Full beginner guide (database, Google, BotFather, groups, PayWay, email, deployment, admin):
**[docs/SETUP.md](docs/SETUP.md)**.

## Reusing parts in another project

These modules are self-contained and are the ones most worth copying into a new project (same approach as
IceQ Sole, which TicketNest was built from):

| Feature | Files |
|---|---|
| ABA PayWay payment listener + exact-amount matcher | `backend/app/services/payway.py`, `tg_listener.py`, `scripts/telegram_login.py` |
| Per-order KHQR + official KHQR card | `backend/app/services/khqr.py`, `khqr_card.py`, `web/src/components/KhqrCard.jsx` |
| Keep a free Render API awake | `ops/keepalive/` (Cloudflare Worker), `.github/workflows/keep-api-awake.yml` |
| Telegram bot (alerts after commit, admin buttons, customer DMs) | `backend/app/services/telegram.py`, `notify.py`, `backend/app/routers/telegram.py` |
| Telegram Mini App shell | `web/src/tg/`, `backend/app/routers/auth.py` (`/telegram-app`) |
| Bot protection | `backend/app/services/human.py`, `web/src/components/HumanCheck.jsx` |
| Daily backups + restore | `backend/app/services/backup.py`, `scripts/restore_backup.py` |
| Error alerts to Telegram | `backend/app/services/alerts.py`, `web/src/lib/errors.js` |
