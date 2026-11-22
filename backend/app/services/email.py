"""Transactional email (sender reused from IceQ Sole): Brevo's HTTPS API first, SMTP as fallback.

Render's free plan blocks SMTP ports, so on Render BREVO_API_KEY is what delivers mail. Without
either provider, development prints the email to the log; production only logs that it was skipped
(never the reset link). Emails are sent from a background thread with a plain-data snapshot, so a
slow mail server never delays checkout or payment confirmation.
"""
from __future__ import annotations

import base64
import logging
import smtplib
import ssl
import threading
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

import httpx

from app.config import settings

log = logging.getLogger("ticketnest.email")
SYNC_FOR_TESTS: list | None = None   # tests capture emails here


def brevo_configured() -> bool:
    return bool(settings.BREVO_API_KEY and settings.EMAIL_FROM)


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def provider() -> str:
    return "brevo" if brevo_configured() else "smtp" if smtp_configured() else "none"


def _send_brevo(to, subject, text, html, attachments) -> bool:
    body = {"sender": {"name": settings.EMAIL_FROM_NAME, "email": settings.EMAIL_FROM}, "to": [{"email": to}],
            "subject": subject, "textContent": text}
    if html:
        body["htmlContent"] = html
    if attachments:
        body["attachment"] = [{"name": n, "content": base64.b64encode(d).decode()} for n, d, _ in attachments]
    try:
        r = httpx.post("https://api.brevo.com/v3/smtp/email", json=body, timeout=30,
                       headers={"api-key": settings.BREVO_API_KEY, "accept": "application/json"})
    except httpx.HTTPError as e:
        log.error("Email via Brevo failed: %s", e.__class__.__name__)
        return False
    if r.status_code >= 300:
        log.error("Email via Brevo rejected (%s): %s", r.status_code, r.text[:300])
        return False
    return True


def _send_smtp(to, subject, text, html, attachments) -> bool:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((settings.EMAIL_FROM_NAME, settings.EMAIL_FROM or settings.SMTP_USER))
    msg["To"] = to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    for name, data, mime in attachments or []:
        main, sub = mime.split("/", 1)
        msg.add_attachment(data, maintype=main, subtype=sub, filename=name)
    try:
        ctx = ssl.create_default_context()
        if settings.SMTP_PORT == 465:
            with smtplib.SMTP_SSL(settings.SMTP_HOST, 465, context=ctx, timeout=30) as s:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        else:
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=30) as s:
                s.starttls(context=ctx)
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        return True
    except (smtplib.SMTPException, OSError) as e:
        log.error("Email via SMTP failed: %s", e.__class__.__name__)
        return False


def send_email(to: str, subject: str, text: str, html: str | None = None, *, attachments=None, kind: str = "",
               order_id: int | None = None) -> bool:
    if SYNC_FOR_TESTS is not None:
        SYNC_FOR_TESTS.append({"to": to, "subject": subject, "text": text, "kind": kind,
                               "attachments": [n for n, _, _ in attachments or []]})
        return True
    if provider() == "none":
        ok, status = False, "skipped"
        if settings.is_production:
            log.warning("Email not configured - %s email to %s was not sent", kind, to)
        else:
            log.info("DEV EMAIL to %s | %s\n%s", to, subject, text)
    else:
        ok = (brevo_configured() and _send_brevo(to, subject, text, html, attachments)) or \
             (smtp_configured() and _send_smtp(to, subject, text, html, attachments))
        status = "sent" if ok else "failed"
    try:
        from app.database import SessionLocal
        from app.models import EmailLog
        with SessionLocal() as db:
            db.add(EmailLog(to=to, kind=kind, subject=subject[:300], status=status, order_id=order_id))
            db.commit()
    except Exception:  # noqa: BLE001
        log.exception("Could not log email")
    return ok


def send_later(*args, **kwargs) -> None:
    if SYNC_FOR_TESTS is not None:
        send_email(*args, **kwargs)
        return
    threading.Thread(target=send_email, args=args, kwargs=kwargs, daemon=True).start()


# ---------------------------------------------------------------- layout
INK, MUTED, LINE, ACCENT = "#0E0E12", "#6B6B76", "#E7E6EA", "#5B3DF5"


def layout(title: str, intro: str, body_html: str = "", button: tuple[str, str] | None = None,
           footer: str = "") -> str:
    site = settings.SITE_URL.rstrip("/")
    btn = (f'<p style="margin:28px 0 8px"><a href="{escape(button[1])}" style="display:inline-block;background:{INK};'
           f'color:#fff;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:600">{escape(button[0])}</a></p>'
           if button else "")
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F3F7;padding:24px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:{INK}">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid {LINE}">
<tr><td style="padding:22px 28px;border-bottom:1px solid {LINE}"><span style="font-size:19px;font-weight:800;letter-spacing:-.3px">Ticket<span style="color:{ACCENT}">Nest</span></span></td></tr>
<tr><td style="padding:28px">
<h1 style="font-size:21px;margin:0 0 10px;letter-spacing:-.3px">{escape(title)}</h1>
<p style="font-size:15px;line-height:1.6;color:#33333B;margin:0">{intro}</p>
{body_html}{btn}
</td></tr>
<tr><td style="padding:16px 28px;background:#FAFAFC;color:{MUTED};font-size:12px;line-height:1.6;border-top:1px solid {LINE}">
{footer or 'TicketNest is an independent resale marketplace and is not affiliated with artists, promoters or official ticket sellers.'}<br>
<a href="{site}" style="color:{MUTED}">{site.replace('https://', '')}</a></td></tr>
</table></body></html>"""


def _rows(pairs: list[tuple[str, str]], total_last: bool = False) -> str:
    out = ""
    for i, (k, v) in enumerate(pairs):
        strong = total_last and i == len(pairs) - 1
        st = f"font-weight:800;font-size:16px;border-top:1px solid {LINE};padding-top:10px" if strong else ""
        out += (f'<tr><td style="padding:5px 0;color:{MUTED if not strong else INK};{st}">{escape(k)}</td>'
                f'<td style="padding:5px 0;text-align:right;{st}">{escape(v)}</td></tr>')
    return f'<table role="presentation" width="100%" style="margin-top:20px;font-size:14px;border-collapse:collapse">{out}</table>'


# ---------------------------------------------------------------- account emails
def send_welcome(to: str, name: str) -> None:
    site = settings.SITE_URL.rstrip("/")
    intro = (f"Hi {escape(name)}, welcome to TicketNest. You can now buy resale K-pop concert tickets and list your "
             "own spare tickets for sale. Every listing is reviewed by our team before it goes live.")
    send_later(to, "Welcome to TicketNest", f"Hi {name},\n\nWelcome to TicketNest.\n{site}\n",
               layout("Welcome to TicketNest", intro, button=("Explore concerts", f"{site}/concerts")), kind="welcome")


def send_password_reset(to: str, name: str, link: str) -> None:
    minutes = settings.PASSWORD_RESET_EXPIRE_MINUTES
    intro = (f"Hi {escape(name or 'there')}, we received a request to reset your TicketNest password. "
             f"This link works once and expires in {minutes} minutes.")
    text = f"Hi {name},\n\nReset your TicketNest password (valid {minutes} minutes, one use):\n{link}\n\n" \
           "If you didn't ask for this, ignore this email - your password stays the same."
    send_later(to, "Reset your TicketNest password", text,
               layout("Reset your password", intro, button=("Choose a new password", link),
                      footer="If you didn't ask for this, you can ignore this email - your password stays the same."),
               kind="password_reset")


# ---------------------------------------------------------------- order emails (snapshot dicts)
def order_snapshot(order) -> dict:
    from app.services.orders import order_url
    from app.utils import fmt_local, fmt_usd2
    it = order.items[0]
    pay = order.payments[-1] if order.payments else None
    return {"to": order.contact_email, "name": order.contact_name, "num": order.order_number, "id": order.id,
            "concert": it.concert_title, "artist": it.artist_name, "category": it.category_name,
            "date": fmt_local(it.concert_starts_at, "%a %d %b %Y, %H:%M"), "venue": it.venue, "qty": it.quantity,
            "unit": fmt_usd2(it.unit_price_cents), "subtotal": fmt_usd2(order.subtotal_cents),
            "markup": fmt_usd2(order.markup_cents), "total": fmt_usd2(order.total_cents),
            "ref": pay.reference if pay and pay.reference else "", "link": order_url(order),
            "reason": order.cancel_reason, "invoice": order.invoice.invoice_number if order.invoice else ""}


def _order_table(s: dict) -> str:
    return _rows([("Concert", s["concert"]), ("Date", s["date"]), ("Venue", s["venue"]),
                  ("Category", f"{s['category']} × {s['qty']}"), ("Ticket price", f"{s['unit']} each"),
                  ("Subtotal", s["subtotal"]), ("Marketplace fee", s["markup"]), ("Total", s["total"])],
                 total_last=True)


def send_order_placed(order) -> None:
    s = order_snapshot(order)
    if not s["to"]:
        return
    intro = (f"Hi {escape(s['name'])}, we've reserved your tickets for order <b>{s['num']}</b>. Complete the KHQR "
             "payment before the timer runs out to confirm them. No invoice is issued until the payment is verified.")
    send_later(s["to"], f"Order {s['num']} - complete your payment",
               f"Order {s['num']} is waiting for payment.\nTotal: {s['total']}\nPay here: {s['link']}",
               layout("Your tickets are on hold", intro, _order_table(s), ("Pay with KHQR", s["link"])),
               kind="order_placed", order_id=s["id"])


def send_payment_confirmed(order, pdf: bytes | None) -> None:
    """Payment confirmation + the PDF invoice attached (this is the invoice email)."""
    s = order_snapshot(order)
    if not s["to"]:
        return
    intro = (f"Hi {escape(s['name'])}, your payment for order <b>{s['num']}</b> has been verified. "
             "<b>Our team will contact you through Telegram to deliver your ticket.</b> "
             f"Your invoice {escape(s['invoice'])} is attached.")
    text = (f"Payment confirmed for {s['num']} ({s['total']}).\nPayment reference: {s['ref']}\n"
            f"Invoice: {s['invoice']} (attached)\n\nOur team will contact you through Telegram to deliver your ticket.\n{s['link']}")
    att = [(f"{s['invoice']}.pdf", pdf, "application/pdf")] if pdf else None
    send_later(s["to"], f"Payment confirmed · {s['num']} · Invoice {s['invoice']}", text,
               layout("Payment confirmed", intro, _order_table(s) + _rows([("Payment reference", s["ref"] or "-")]),
                      ("View your order", s["link"])),
               attachments=att, kind="payment_confirmed", order_id=s["id"])


def send_invoice(order, pdf: bytes) -> None:
    s = order_snapshot(order)
    if not s["to"]:
        return
    send_later(s["to"], f"Invoice {s['invoice']} · TicketNest", f"Your invoice {s['invoice']} for {s['num']} is attached.",
               layout(f"Invoice {s['invoice']}", f"Hi {escape(s['name'])}, your invoice for order <b>{s['num']}</b> is attached.",
                      button=("View your order", s["link"])),
               attachments=[(f"{s['invoice']}.pdf", pdf, "application/pdf")], kind="invoice", order_id=s["id"])


def send_delivered(order) -> None:
    s = order_snapshot(order)
    if not s["to"]:
        return
    intro = (f"Hi {escape(s['name'])}, the ticket(s) for order <b>{s['num']}</b> have been sent to you through "
             "Telegram. Please check your Telegram messages and keep the ticket safe. Enjoy the show!")
    send_later(s["to"], f"Your ticket has been delivered · {s['num']}", f"Your ticket for {s['num']} was delivered via Telegram.",
               layout("Ticket delivered", intro, _order_table(s), ("View your order", s["link"])),
               kind="delivered", order_id=s["id"])


def send_cancelled(order, refunded: bool) -> None:
    s = order_snapshot(order)
    if not s["to"]:
        return
    title = "Your order was refunded" if refunded else "Your order was cancelled"
    intro = (f"Hi {escape(s['name'])}, order <b>{s['num']}</b> has been {'refunded' if refunded else 'cancelled'}."
             + (f" Reason: {escape(s['reason'])}" if s["reason"] else "")
             + (" The refund is sent manually to the account you paid from; contact support if you have questions."
                if refunded else ""))
    send_later(s["to"], f"{title} · {s['num']}", f"{title}: {s['num']}. {s['reason']}",
               layout(title, intro, _order_table(s), ("View your order", s["link"])),
               kind="refunded" if refunded else "cancelled", order_id=s["id"])


# ---------------------------------------------------------------- seller emails
PAYOUT_NOTE = ("You are paid when a buyer purchases your ticket and receives it, not when you submit the "
               "listing. Your earnings then move to your TicketNest wallet and you can request a withdrawal.")


def send_listing_submitted(db, listing) -> None:
    """Seller's receipt for a submitted listing, with the payout rule spelled out."""
    from app.services.pricing import quote_for
    from app.utils import fmt_local, fmt_usd2
    seller = listing.seller
    if not seller or not seller.email:
        return
    q = quote_for(db, listing.price_cents, listing.quantity)
    rows = _rows([("Listing", f"#{listing.id}"), ("Concert", listing.concert.title),
                  ("Date", fmt_local(listing.concert.starts_at, "%a %d %b %Y, %H:%M")),
                  ("Category", f"{listing.category.name} × {listing.quantity}"), ("Seat", listing.seat_info or "-"),
                  ("Original price (per ticket)", fmt_usd2(listing.original_price_cents)),
                  ("Your listing price (per ticket)", fmt_usd2(listing.price_cents)),
                  (f"TicketNest commission ({q.commission_bps / 100:g}%)", "−" + fmt_usd2(q.commission_cents)),
                  ("You receive if all sell", fmt_usd2(q.seller_payout_cents))], total_last=True)
    note = (f'<p style="margin:18px 0 0;padding:12px 14px;background:#F4F1FF;border-radius:10px;font-size:13px;'
            f'line-height:1.6;color:#33333B"><b>When do I get paid?</b> {escape(PAYOUT_NOTE)}</p>')
    intro = (f"Hi {escape(seller.full_name)}, we received your listing. Our team will check your ticket proof and "
             "purchase receipt, usually within 24 hours. You'll get a message when it is approved.")
    text = (f"Listing #{listing.id} received: {listing.concert.title}, {listing.category.name} x{listing.quantity} at "
            f"{fmt_usd2(listing.price_cents)} each. You receive {fmt_usd2(q.seller_payout_cents)} if all sell.\n\n{PAYOUT_NOTE}")
    send_later(seller.email, f"Listing #{listing.id} received · TicketNest", text,
               layout("Listing received", intro, rows + note,
                      ("View my listings", f"{settings.SITE_URL.rstrip('/')}/account/listings")),
               kind="listing_submitted")


def send_ticket_sold(order) -> None:
    """Tell each seller their ticket sold; earnings are pending until the buyer receives it."""
    from app.utils import fmt_usd2, percent_of
    for it in order.items:
        seller = it.listing.seller if it.listing else None
        if not seller or not seller.email:
            continue
        net = (it.unit_price_cents - percent_of(it.unit_price_cents, order.commission_bps)) * it.quantity
        rows = _rows([("Order", order.order_number), ("Concert", it.concert_title),
                      ("Category", f"{it.category_name} × {it.quantity}"),
                      ("Your price", f"{fmt_usd2(it.unit_price_cents)} each"),
                      ("Your earnings", fmt_usd2(net))], total_last=True)
        intro = (f"Hi {escape(seller.full_name)}, good news — your ticket for <b>{escape(it.concert_title)}</b> was sold. "
                 "Please keep the ticket ready: our team will contact you on Telegram to transfer it to the buyer. "
                 f"Your {fmt_usd2(net)} is pending and becomes available in your wallet once the buyer receives the ticket.")
        send_later(seller.email, f"Your ticket sold · {order.order_number}",
                   f"Your ticket for {it.concert_title} sold. Earnings {fmt_usd2(net)} become available after delivery.",
                   layout("Your ticket sold", intro, rows,
                          ("Open my wallet", f"{settings.SITE_URL.rstrip('/')}/account/wallet")),
                   kind="ticket_sold", order_id=order.id)


def send_concert_alert(to: str, name: str, listing, price_text: str) -> None:
    """'Notify me': a new ticket for a concert the fan follows is on sale."""
    from app.utils import fmt_local
    c = listing.concert
    url = f"{settings.SITE_URL.rstrip('/')}/concerts/{c.slug}"
    rows = _rows([("Concert", c.title), ("Date", fmt_local(c.starts_at, "%a %d %b %Y, %H:%M")),
                  ("Venue", f"{c.venue}, {c.city}"), ("Category", listing.category.name),
                  ("Tickets", str(listing.available)), ("Price (per ticket)", price_text)])
    intro = (f"Hi {escape(name)}, new tickets for <b>{escape(c.title)}</b> just went on sale on TicketNest. "
             "Tickets sell fast, so check them out soon.")
    text = f"New tickets for {c.title}: {listing.category.name}, {price_text} each.\n{url}"
    send_later(to, f"🎫 Tickets on sale: {c.title}", text,
               layout("New tickets on sale", intro, rows, ("See tickets", url),
                      footer="You get this because you tapped “Notify me” for this concert. Turn it off on the concert page."),
               kind="concert_alert")
