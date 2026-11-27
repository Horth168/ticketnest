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
  app/bodylimit.py           request size limit that counts the bytes really received (12 MB)
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
  tests/                     pytest (54 tests, incl. the full buy → pay → deliver → withdraw flow and security fixes)
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
- Uploads: type sniffed from the bytes, images re-encoded at max 2000 px (strips hidden content and EXIF).
  Limits: **5 MB per file, 12 MB per request**, counted on the bytes actually received, so chunked uploads
  can't get around it. Photos are shrunk in the browser before upload (`web/src/lib/files.js`) to save data
  and storage. Ticket proofs, receipts, payout QRs and backups live in a **private** bucket; only admins / the
  owner can open them.
- Accounts: when someone proves an email for the first time (Google sign-in or a reset link) on an account whose
  email was never verified, everything the earlier owner set up is removed: password, sessions, Telegram /
  Google links and payout details. This stops someone planting another person's email and keeping a way in.
- Admin CSV export: cells starting with `= + - @` get a `'` in front, so Excel / Sheets never run them as formulas.
- Error alerts: anonymous website-error reports have their own budget (4 per hour), so they can't use up the
  12 per hour kept for server and background-job alerts.
- Telegram: webhook secret, Mini App `initData` signature checked on the server, admin buttons only work for
  configured admin IDs. Secrets live only in Render environment variables, never in the code or admin pages.
- Every important admin action is written to the audit log; daily backups; errors alert the admin group.

**Turnstile status (checked 27 Nov 2026): ON and working.** The site key is published, the sign-in form shows
"Verify you are human", and the API refuses requests without a valid token (HTTP 403).

**Security audit:** a source-code audit was run on 27 Nov 2026 with the Cloudflare `security-audit` skill
(report kept outside the repo in `C:\Users\HORTH\security-audit-skill\ticketnest\run-1\REPORT.md`). It found no
confirmed vulnerabilities. The items it raised were fixed, or confirmed safe for this setup: the payment chat is a
**group**, and the ABA merchant account is **separate** from IceQ Sole. To audit again, open Claude Code in this
folder and say *"security audit this codebase"*.

**Turn on Turnstile again (if the keys ever change, 5 minutes):** Cloudflare dashboard → Turnstile → Add widget → name `TicketNest`, add
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

## After launch: running and fixing the site

### Launch checklist (one time)

1. Admin → **Backups** → **Launch cleanup**: keep *BIGBANG Cosmo Jakarta*, type `DELETE TEST DATA`, delete.
   A full backup is saved first. Order numbers start again at `TN-YYYY-0001`.
2. Render → `ticketnest-api` → Environment: **delete** `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`.
3. Admin → Settings → **Buyer protection**: payout hold 48 h, report window 6 h (or your choice).
4. Admin → Settings → **Payments**: KHQR template set, QR expiry 15 min.
5. Place one small real test order end to end (pay $0.50 to $1 to your own merchant account), then cancel or refund it.
6. Google Search Console: submit `https://ticketnest-web.onrender.com/sitemap.xml`.

### Where to look first

| Place | What it tells you |
|---|---|
| Telegram **admin group** | 🚨 error alerts (API errors, failed background jobs, website errors), new orders, payments, reports |
| Admin → **Payments** | every PayWay message received and whether it matched an order; listener status |
| Admin → **Orders** → an order | full timeline, payment reference, delivery proof, seller and buyer history |
| Admin → **Audit log** | who did what and when (approvals, refunds, settings changes, launch cleanup) |
| Admin → **Backups** | last daily backup (03:00 Phnom Penh time); download a copy at any time |
| Render → `ticketnest-api` → **Logs** | full error details (search for `Traceback` or `ERROR`) |
| Render → the service → **Events** | whether the last deploy succeeded |
| https://ticketnest-api.onrender.com/api/health/db | `{"ok": true}` means the API and database are up |

### Common problems and fixes

| Problem | Likely cause | What to do |
|---|---|---|
| Website shows "Network error" | API restarting (a deploy takes about 2 min) or a server error | Wait 2 minutes and retry. If it keeps happening, the 🚨 alert in the admin group names the file and line; Render Logs show the details. |
| Customer paid but order still "awaiting payment" | PayWay message not received, or a different amount | Admin → Payments: find the message. If it is there but unmatched, press **Assign to order**. If it is missing, check the listener status on that page. You can also open the order and use **Confirm payment manually (ABA Trx ID)** with the Trx ID from the customer's receipt. |
| No alerts in the admin group | Group upgraded to a supergroup (new ID) or bot removed from the group | The app follows supergroup moves automatically. If alerts still stop, send `/groupid` in the group, update `TELEGRAM_ADMIN_GROUP_ID` on Render, then Admin → Settings → **Send test alert**. |
| PayWay listener "disconnected" | Telegram session for the listener account expired or was logged out | Run `python scripts/telegram_login.py` on your computer, copy the new `TG_LISTENER_SESSION` to Render, save. |
| Emails not arriving | Brevo key or sender not verified, or daily quota used | Brevo dashboard → Transactional → Logs. Check `BREVO_API_KEY` and the sender email on Render. |
| "Please complete the security check" | Turnstile token missing or expired | The customer refreshes the page. If everyone gets it, check the Turnstile keys and hostnames in Cloudflare. |
| "Your upload is too large" | A file over 5 MB, or more than 12 MB sent at once | Ask the customer to send a screenshot instead of a big PDF, or fewer files at a time. Limits are `MAX_UPLOAD_MB` and `MAX_REQUEST_MB` (`backend/app/config.py`, can be overridden on Render). |
| Site slow after being idle | The web service went to sleep | The Cloudflare Worker pings every 5 minutes: Cloudflare → Workers → `ticketnest-keepalive` → Logs. |
| Seller asks why money is not available yet | Payout hold (48 h after the concert starts) or an open buyer report | The order page shows the payout release time and any report. An admin can release early after checking. |
| Buyer reports a problem after the concert | Report window closed (6 h after start) | By design, to protect sellers. Handle it in the support group with evidence; refunds only from Admin → order → Refund. |
| Need to undo a mistake (e.g. data deleted) | — | Admin → Backups → download the backup from before the mistake and restore it into a new database with `python scripts/restore_backup.py FILE` (see docs/SETUP.md). Get help before restoring over live data. |

### Making a fix safely

1. Change the code and run the tests: `cd backend` then `.venv\Scripts\python -m pytest -q`. All must pass.
2. For website changes, `cd web` then `npm run build` must finish without errors.
3. `git add` only the changed files (never `.env`, `API.txt` or other `.txt` files), then `git commit` and
   `git push origin main`.
4. Render does **not** deploy automatically here: Render → `ticketnest-api` and/or `ticketnest-web` →
   **Manual Deploy → Deploy latest commit**. Database migrations run by themselves when the API starts.
5. Watch the live site and the admin group for 🚨 alerts for a few minutes.
6. If a deploy breaks the site: Render → the service → **Events** → an earlier deploy → **Rollback**.

### Where settings and secrets live

- **Business settings** (fees, buyer protection, payments, Telegram usernames, site name): Admin → Settings.
  Changes apply at once, no deploy needed.
- **Secrets and IDs** (database URL, bot token, group IDs, listener session, Brevo, R2, Google, Turnstile):
  only in Render → `ticketnest-api` → Environment. The names are listed in `backend/.env.example`. Never put
  them in the code, on GitHub, or in admin settings.
- **Who can do what:** customers buy and sell; **staff** review listings, deliver and resolve reports; **admin**
  can also refund, confirm payments, settle withdrawals, change settings, export, back up and run launch cleanup.
  Telegram bot buttons only work for the Telegram IDs in `TELEGRAM_ADMIN_ID`.

### Known limits (not bugs)

- Changing a concert's date does not move the payout hold of orders already delivered. If a concert is
  postponed, check withdrawals from its sellers before marking them paid.
- Sign-in lockout and rate limits are kept in memory, so they reset when the API restarts.
- Launch cleanup removes database rows but leaves old private files in R2 (harmless; only admins could open them).

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
