# TicketNest — setup, configuration and deployment guide

This guide assumes no prior experience. Do the sections in order the first time. Everything marked
**secret** goes only into `backend/.env` on your computer or into Render's *Environment* page — never into
GitHub, Telegram chats or screenshots.

1. [What you need](#1-what-you-need)
2. [Run TicketNest on your computer](#2-run-ticketnest-on-your-computer)
3. [Database](#3-database)
4. [Admin account and dashboard](#4-admin-account-and-dashboard)
5. [Telegram bot (BotFather) and Mini App](#5-telegram-bot-botfather-and-mini-app)
6. [Telegram admin group and admin IDs](#6-telegram-admin-group-and-admin-ids)
7. [ABA PayWay payment confirmation](#7-aba-payway-payment-confirmation)
8. [Official TicketNest Telegram account (delivery + support)](#8-official-ticketnest-telegram-account)
9. [Google sign-in](#9-google-sign-in)
10. [Email](#10-email)
11. [Testing payments safely](#11-testing-payments-safely)
12. [Deploy to the internet](#12-deploy-to-the-internet)
13. [Running the business day to day](#13-running-the-business-day-to-day)
14. [Security checklist and honest limits](#14-security-checklist-and-honest-limits)

---

## 1. What you need

| Item | Needed for | Cost |
|---|---|---|
| Python 3.13 and Node.js 20+ | running locally | free |
| GitHub account (repo `Horth168/ticketnest`) | deployment | free |
| Telegram bot from @BotFather | alerts, admin commands, Telegram login, Mini App | free |
| Telegram **user** account for the PayWay listener (can be your own) | automatic payment confirmation | free |
| ABA merchant account with **PayWay Telegram notifications** | KHQR payments | ABA's terms |
| Postgres database (Neon recommended) | production data | free tier |
| Cloudflare R2 (two buckets) | posters + private ticket proofs in production | free tier |
| Brevo account (or Gmail App Password) | emails + invoices | free tier |
| Google Cloud OAuth client ID | "Continue with Google" | free |
| Render account | hosting | Starter plan recommended for the API |
| Optional: Bakong Open API token | strongest payment check | apply at api-bakong.nbc.gov.kh |

## 2. Run TicketNest on your computer

Open **PowerShell** in the project folder.

```powershell
cd backend
py -3.13 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Open `backend\.env` in Notepad and set `SECRET_KEY` to a long random value. Generate one with:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Create the tables, load the starting artist list, and make yourself an admin:

```powershell
alembic upgrade head
python scripts/seed.py
python scripts/create_admin.py you@example.com "Your Name"
uvicorn app.main:app --reload
```

The API runs at http://localhost:8000 (interactive docs: http://localhost:8000/api/docs).
In a **second** PowerShell window:

```powershell
cd web
npm install
npm run dev
```

Open http://localhost:5173. The admin dashboard is http://localhost:5173/admin.

Run the automated tests any time:

```powershell
cd backend
.venv\Scripts\activate
pytest
```

> `seed.py` only adds artist **names**. TicketNest never invents concerts, prices or availability — you add real
> concerts in the admin dashboard.

## 3. Database

- **Locally** nothing to do: an SQLite file is created in `backend\data\`.
- **Production** uses PostgreSQL. With Neon (free):
  1. Sign up at neon.tech → *Create project* → region **Singapore**.
  2. Copy the connection string (`postgresql://…?sslmode=require`).
  3. Put it in `DATABASE_URL` (secret).
- Tables are created and upgraded by `alembic upgrade head` (Render runs it on every deploy).
- After changing `app/models.py`, create a migration: `alembic revision --autogenerate -m "what changed"`.
- Back up regularly from the Neon dashboard (branches / point-in-time restore).

## 4. Admin account and dashboard

- Locally: `python scripts/create_admin.py you@example.com "Your Name"`.
- On Render (no shell on the free plan): set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD`, deploy once, sign
  in, then **delete both variables**.
- Roles: **admin** (everything, including fees, refunds, withdrawals, settings) and **staff** (listings, concerts,
  orders, delivery). Change roles in **Admin → Users**.

First things to do in the dashboard:

1. **Settings → Payments**: paste your ABA merchant KHQR code (section 7) and click *Check code*.
2. **Settings → Telegram**: support username and delivery username (section 8).
3. **Settings → Fees**: 15 % / 15 % by default.
4. **Artists**: add photos (only ones you have rights to) and any missing artists.
5. **Concerts**: add real concerts with their official date, venue and ticket categories.

## 5. Telegram bot (BotFather) and Mini App

1. In Telegram open **@BotFather** → `/newbot` → name it (e.g. *TicketNest*) → choose a username ending in `bot`.
2. Copy the token into `TELEGRAM_BOT_TOKEN` (**secret**).
3. **Login widget domain**: `/setdomain` → choose your bot → enter your website domain
   (e.g. `ticketnest-web.onrender.com`). Without this, "Log in with Telegram" on the website won't appear.
4. **Mini App**: `/newapp` → choose your bot → title, description, a 640×360 image → **Web App URL** =
   `https://YOUR-WEBSITE/tg` → short name e.g. `app`. BotFather gives you a link like
   `https://t.me/TicketNestBot/app` → put it in `TELEGRAM_MINI_APP_URL` and in **Admin → Settings → Telegram**.
5. Optional: `/setmenubutton` → choose the bot → URL `https://YOUR-WEBSITE/tg` so the menu button opens the app.

The API registers the webhook and the command list by itself when `API_PUBLIC_URL` is an **https** address.
For local testing (no https) run the bot with polling instead:

```powershell
cd backend
.venv\Scripts\activate
python scripts/bot_polling.py
```

How sign-in stays safe: the Mini App sends Telegram's signed `initData`; the API checks its HMAC signature with
your bot token and its age (max 24 h) before trusting anything in it. The website's Telegram button uses
Telegram's official Login Widget, verified the same way.

## 6. Telegram admin group and admin IDs

1. Create a private Telegram group, e.g. **TicketNest Admin**. Add your bot to it.
2. In the group send `/groupid` — the bot replies with the ID (e.g. `-1001234567890`) →
   `TELEGRAM_ADMIN_GROUP_ID`.
3. Each admin sends `/myid` to the bot privately → put the numbers, comma separated, in `TELEGRAM_ADMIN_ID`
   (e.g. `123456789,987654321`).
4. Redeploy / restart, then **Admin → Settings → Telegram → Send test alert**.

Only the user IDs in `TELEGRAM_ADMIN_ID` can use `/dashboard /orders /listings /pending /stock /revenue` or press
**Approve / Reject / Mark delivered / Mark as paid / Confirm** buttons. Being a member of the group is not enough.

Alerts you will receive: new customer, new listing (with Approve/Reject), listing approved/rejected, new purchase,
payment verified (in the NEW ORDER format), failed and expired payments, unmatched payments, withdrawal requested
/ completed, low stock and sold out.

## 7. ABA PayWay payment confirmation

This is the same mechanism IceQ Sole uses in production.

**How it works**

1. In **Admin → Settings → Payments** you paste your **ABA merchant KHQR code** (the text inside the KHQR you print
   for customers). Tip: click *Read from QR image* and choose a photo/screenshot of your QR — Chrome and Edge can read it.
   *Check code* shows the account name the money goes to: make sure it is yours.
2. For every order TicketNest builds a fresh KHQR from that code with the **exact amount**, the **order number**
   (as the bill number) and an expiry. ABA's own routing fields are kept, so ABA treats it as your merchant QR.
3. When the buyer pays, ABA's **@PayWayByABA_bot** posts "$115.00 paid by … Trx. ID: …" into the Telegram group you
   linked to your ABA merchant account.
4. The **listener** — a normal Telegram *user* account in that group, because Telegram never shows one bot's
   messages to another bot in a group — passes each message to the matcher, which confirms the order only if
   everything matches (see the README's "Payment verification" rules).

**Set it up**

1. Create a private group, e.g. **TicketNest Payments**. Link it to your ABA merchant account's PayWay Telegram
   notifications in the ABA app (the same way you did for IceQ Sole), so @PayWayByABA_bot posts there.
2. Add your TicketNest bot to the group and send `/groupid` → `TELEGRAM_PAYMENT_GROUP_ID`.
3. Add the listener account (your own Telegram account is fine) to the group.
4. Go to **my.telegram.org** → *API development tools* → create an app → note **api_id** and **api_hash**.
5. On your computer:
   ```powershell
   cd backend
   .venv\Scripts\activate
   python scripts/telegram_login.py
   ```
   Enter api_id, api_hash, the payment group ID, your phone number and the code Telegram sends. It checks the account
   can see PayWay's messages and writes `backend\.env.listener` with three values.
6. Put them in `TG_LISTENER_API_ID`, `TG_LISTENER_API_HASH`, `TG_LISTENER_SESSION` (all **secret** — the session works
   like a password). Delete `.env.listener` afterwards.
7. Restart. **Admin → Overview → Integrations** should show *PayWay listener: connected*.

> **Using the same ABA account as IceQ Sole?** PayWay would post both shops' payments. Each system only confirms
> its own orders, but TicketNest would log IceQ's payments as "unmatched" (and vice versa). Use a separate ABA
> merchant account / QR for TicketNest if you can.

**Optional — Bakong Open API (strongest check).** If you obtain a token from api-bakong.nbc.gov.kh, set
`BAKONG_API_TOKEN`. While a buyer waits, the API asks Bakong whether that exact QR was paid; this is an authoritative
server-to-server answer and works even if the listener is offline.

**When a payment can't be matched** (two buyers waiting for the same amount, the listener was offline, a wrong
amount): nothing is confirmed. You get a Telegram alert, and **Admin → Payments** lists it under *Needs attention*.
Check your ABA app, then press the order's button in Telegram or *Assign to order* in the dashboard. Each ABA
transaction ID can only ever be used once.

## 8. Official TicketNest Telegram account

Ticket delivery is manual: after a payment is verified, you message the buyer and send the ticket.

- Your test account **@iceq_168** can be used at first. Nothing is hard-coded: set it in
  **Admin → Settings → Telegram → Delivery Telegram username** (and *Support username*).
- When you create the official TicketNest account, change those two fields — every button on the website, Mini App,
  emails and bot updates follows immediately.
- Delivery routine: **Admin → Orders → To deliver** → *Message buyer* → send the ticket → *Mark delivered* (method,
  notes, optional file). The buyer's order page shows *Delivered*, they get an email, and the seller's earnings move
  to *available*. You can also tap **Mark delivered** on the Telegram alert.

## 9. Google sign-in

1. console.cloud.google.com → create a project → *APIs & Services* → *OAuth consent screen* (External; app name
   TicketNest; your support email) → publish.
2. *Credentials* → *Create credentials* → *OAuth client ID* → **Web application**.
3. *Authorized JavaScript origins*: `http://localhost:5173` and `https://YOUR-WEBSITE`.
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID` (it is public; there is no client secret to store).

The API verifies every Google token with Google and checks it was issued to your client ID. A Google sign-in with
the same verified email as an existing account signs in to that account instead of creating a duplicate.

## 10. Email

Brevo (recommended; works on Render, which blocks SMTP ports on free plans):

1. brevo.com → sign up → *Senders, domains* → add and verify your sender address.
2. *SMTP & API* → *API keys* → create → `BREVO_API_KEY` (**secret**), and `EMAIL_FROM` = the verified sender.

Or Gmail: turn on 2-step verification, create an **App Password**, then set `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASSWORD` (**secret**).

Emails sent: welcome, password reset (single-use link, 60 minutes), order placed (awaiting payment), payment
confirmed **with the PDF invoice attached**, ticket delivered, cancelled / refunded. Without a provider, development
prints emails in the API log. Every email is recorded and visible on the admin order page.

## 11. Testing payments safely

- Locally, `pytest` runs the whole workflow with simulated PayWay messages (no real money).
- In production, do one real test: add a concert, list a ticket at **$1** from a second account, approve it, buy it,
  pay the QR from your banking app, and watch the order turn **Paid** by itself (the PayWay message should appear in
  your payment group at the same time). Then refund yourself from your bank app and record it with **Record refund**.
- Check **Admin → Payments** after the test: the notification should show **matched**.
- Never confirm an order from a screenshot. If the order didn't update, look at *Needs attention*.

## 12. Deploy to the internet

TicketNest deploys to Render with the included `render.yaml`.

1. Push the code to GitHub (`Horth168/ticketnest`).
2. Render → **New → Blueprint** → pick the repository. It creates **ticketnest-api** and **ticketnest-web**.
3. Fill in the environment variables Render asks for:
   - API: `DATABASE_URL`, `SITE_URL` and `CORS_ORIGINS` (= website URL), `API_PUBLIC_URL` (= API URL), the Telegram,
     listener, email, Google and R2 values. `SECRET_KEY` is generated for you.
   - Website: `VITE_API_URL` = the API URL.
4. Cloudflare R2: create two buckets — `ticketnest-public` (enable public access / r2.dev URL → `R2_PUBLIC_URL`) and
   `ticketnest-private` (**no** public access). Create an API token with read/write on both.
5. Deploy. Visit `https://API/api/health` → `{"status":"ok"}`.
6. Update BotFather's `/setdomain` and Mini App URL, and Google's authorized origin, to the real website URL.
7. The API **must stay awake** for the bot webhook and the PayWay listener: use the Starter plan (or an always-on
   host). Keep **one** worker (already set in `render.yaml`): the listener and the expiry job run inside it.
8. Custom domain (optional): add it to the web service in Render, then update `SITE_URL`, `CORS_ORIGINS`,
   `VITE_API_URL` and BotFather/Google settings.

## 13. Running the business day to day

| Task | Where |
|---|---|
| Approve / reject seller listings (view private proof) | Admin → Listings, or the buttons on the Telegram alert |
| Add your own tickets | Admin → Listings → *Add tickets manually* |
| Deliver paid orders | Admin → Orders → *To deliver* |
| Resolve unmatched payments | Admin → Payments → *Needs attention* |
| Pay sellers | Admin → Withdrawals (pay from your bank app, then *Mark paid*) |
| Refund | Admin → Orders → order → *Record refund* (after sending the money back) |
| Change fees / support username / QR | Admin → Settings |
| Accounting export | Admin → Reports → *Export orders (CSV)* |
| Who did what | Admin → Audit log |
| Quick numbers on the phone | `/dashboard`, `/revenue`, `/pending` in the bot |

## 14. Security checklist and honest limits

Implemented: bcrypt password hashing; short JWT access tokens with rotating refresh tokens (re-use signs out every
device); server-side role checks on every admin endpoint; Telegram identity verified by signature; admin Telegram
actions limited to `TELEGRAM_ADMIN_ID`; rate limits on sign-in, registration, reset, checkout, listing and withdrawal;
uploads checked by content (JPG/PNG/WEBP/PDF only), re-encoded to strip metadata, size-limited, proofs stored
privately; atomic stock updates + database constraints so a ticket can't be sold twice; idempotent checkout;
unique payment references; every financial action in the audit log and wallet ledger; no secrets in the code or in
any API response.

Honest limits:

- Payment confirmation relies on ABA's PayWay Telegram messages (no official webhook for small merchants). The rules
  above keep it safe, but if the listener account is signed out, payments wait for you in *Needs attention* (or are
  confirmed by the Bakong API if you configured it).
- Ticket delivery is manual. Nothing claims automatic delivery.
- Review of proofs reduces fraud but cannot guarantee a ticket will be accepted at the venue — the authenticity and
  refund policies say exactly that.
- Card payments are not included.
