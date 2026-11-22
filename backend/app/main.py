"""TicketNest API - one backend for the website, the Telegram bot and the Telegram Mini App."""
import logging
import threading
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import SessionLocal, engine
from app.limiter import limiter
from app.routers import account, admin_catalog, admin_ops, auth, catalog, fans, orders, selling, telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
for _noisy in ("httpx", "httpcore"):  # their INFO lines contain the bot token in Telegram URLs
    logging.getLogger(_noisy).setLevel(logging.WARNING)
log = logging.getLogger("ticketnest")

app = FastAPI(title="TicketNest API", version="1.0.0",
              description="K-pop ticket resale marketplace: website, Telegram bot and Mini App backend.",
              docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
app.state.limiter = limiter
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                   allow_headers=["Authorization", "Content-Type", "X-Human-Token"], expose_headers=["Content-Disposition"],
                   max_age=600)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    size = request.headers.get("content-length")
    if size and size.isdigit() and int(size) > settings.MAX_REQUEST_MB * 1024 * 1024:
        return JSONResponse({"detail": "Request is too large"}, status_code=413)
    response = await call_next(request)
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and response.status_code < 400:
        from app import cache   # anything changed (admin edit, approval, order, listing): drop cached public pages
        cache.clear()
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if not request.url.path.startswith("/media/"):
        response.headers["X-Frame-Options"] = "DENY"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/") and request.method == "GET" and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limited(request: Request, exc: RateLimitExceeded):
    return JSONResponse({"detail": "Too many requests, please slow down and try again shortly."}, status_code=429)


@app.exception_handler(StarletteHTTPException)
async def http_error(request: Request, exc: StarletteHTTPException):
    return JSONResponse({"detail": exc.detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    errors = [{"field": ".".join(str(x) for x in e.get("loc", [])[1:]) or "body",
               "message": e.get("msg", "Invalid value").replace("Value error, ", "")} for e in exc.errors()]
    return JSONResponse({"detail": errors[0]["message"] if errors else "Invalid input", "errors": errors},
                        status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    from app.services import alerts
    alerts.api_error(request.method, request.url.path, exc)
    return JSONResponse({"detail": "Something went wrong on our side. Please try again."}, status_code=500)


for r in (auth, account, catalog, selling, orders, admin_catalog, admin_ops, telegram, fans):
    app.include_router(r.router)


# ---------------------------------------------------------------- background work
def _expiry_loop() -> None:
    """Every minute: release tickets held by unpaid orders whose QR (plus grace) expired, send the
    daily Telegram report and take the daily database backup. Failures alert the admin group."""
    from app.services import alerts, backup, orders as svc, reports
    jobs = (("release expired checkouts", lambda db: svc.expire_due(db)),
            ("daily report", reports.maybe_send_daily),
            ("daily backup", backup.maybe_run_daily))
    while True:
        time.sleep(60)
        for name, job in jobs:
            try:
                with SessionLocal() as db:
                    n = job(db)
                    if name.startswith("release") and n:
                        log.info("Released %d expired checkout(s)", n)
            except Exception as e:  # noqa: BLE001
                log.exception("Background job failed: %s", name)
                alerts.job_error(name, e)


def _initial_admin() -> None:
    if not (settings.INITIAL_ADMIN_EMAIL and settings.INITIAL_ADMIN_PASSWORD):
        return
    from app.models import Role, User
    from app.security import hash_password
    with SessionLocal() as db:
        if db.query(User).filter_by(role=Role.admin).first():
            return
        email = settings.INITIAL_ADMIN_EMAIL.lower().strip()
        user = db.query(User).filter_by(email=email).first()
        if user:
            user.role = Role.admin
        else:
            db.add(User(email=email, full_name="TicketNest Admin", role=Role.admin, email_verified=True,
                        password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD)))
        db.commit()
        log.info("Initial admin account ready: %s (remove INITIAL_ADMIN_* now)", email)


@app.on_event("startup")
def _startup() -> None:
    if settings.ENVIRONMENT == "test":
        return
    _initial_admin()
    try:
        from app.services import demo
        with SessionLocal() as db:
            demo.seed_once(db)
            demo.to_draft_once(db)
    except Exception:  # noqa: BLE001  (demo content must never stop the API starting)
        log.exception("Demo content could not be created")
    threading.Thread(target=_expiry_loop, name="expiry", daemon=True).start()
    from app.services import telegram as tg, tg_listener
    tg.register_webhook_async()   # no-op unless TELEGRAM_BOT_TOKEN is set and API_PUBLIC_URL is https
    tg_listener.start()           # no-op unless the PayWay listener account is configured


@app.get("/api/health", tags=["System"])
def health():
    return {"status": "ok", "service": "TicketNest API"}


@app.get("/api/health/db", tags=["System"])
def health_db():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}


if settings.STORAGE_PROVIDER == "local":
    _public = Path(settings.LOCAL_STORAGE_DIR) / "public"
    _public.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=_public), name="media")   # public area ONLY; private files never mounted
