"""PDF invoice (ReportLab). Only ever generated for an order whose payment is VERIFIED.

The PDF is rebuilt from the stored order + invoice rows each time it is downloaded, so it always
shows exactly what was recorded (no stale copies to keep in sync).
"""
from __future__ import annotations

import io

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

from app.config import settings
from app.models import Order, PaymentStatus
from app.utils import fmt_local, fmt_usd2, usd_to_khr

INK = colors.HexColor("#0E0E12")
SOFT = colors.HexColor("#33333B")
MUTED = colors.HexColor("#6B6B76")
LINE = colors.HexColor("#E4E3EA")
PANEL = colors.HexColor("#F6F5FA")
ACCENT = colors.HexColor("#5B3DF5")
ACCENT_SOFT = colors.HexColor("#EFEBFF")
GOOD = colors.HexColor("#0F9D58")
GOOD_SOFT = colors.HexColor("#E3F5EC")
BAD = colors.HexColor("#C2410C")
BAD_SOFT = colors.HexColor("#FDEDE4")

STATUS_LABEL = {"paid": "Paid", "preparing": "Paid · preparing ticket", "awaiting_delivery": "Paid · awaiting delivery",
                "delivered": "Paid · delivered", "completed": "Paid · completed", "refunded": "Refunded",
                "cancelled": "Cancelled"}


def verified_payment(order: Order):
    for p in reversed(order.payments):
        if p.status in (PaymentStatus.verified, PaymentStatus.refunded) and p.verified_at:
            return p
    return None


def _fit(c, text: str, width: float, font: str, size: float) -> str:
    text = str(text or "")
    if c.stringWidth(text, font, size) <= width:
        return text
    while text and c.stringWidth(text + "…", font, size) > width:
        text = text[:-1]
    return text + "…"


def _mark(c, x, y, s, tile=colors.white, ink=INK):
    """TicketNest logo mark: rounded tile, a T and the accent dot (64-unit grid)."""
    u = s / 64
    c.setFillColor(tile)
    c.roundRect(x, y, s, s, 16 * u, fill=1, stroke=0)
    c.setFillColor(ink)
    # T (the grid's y axis points down; convert)
    def P(px, py):
        return x + px * u, y + s - py * u
    p = c.beginPath()
    for i, (px, py) in enumerate([(18, 22), (46, 22), (46, 28), (35, 28), (35, 46), (29, 46), (29, 28), (18, 28)]):
        (p.moveTo if i == 0 else p.lineTo)(*P(px, py))
    p.close()
    c.drawPath(p, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    cx, cy = P(46, 44)
    c.circle(cx, cy, 5 * u, fill=1, stroke=0)


def _label(c, x, y, text):
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(MUTED)
    c.drawString(x, y, text.upper())


def build(order: Order, site_name: str = "TicketNest", support: str = "") -> bytes:
    pay = verified_payment(order)
    if order.invoice is None or pay is None:
        raise ValueError("Invoices exist only for verified payments")
    inv, it = order.invoice, order.items[0]
    refunded = order.status.value == "refunded"
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{inv.invoice_number} - {site_name}")
    c.setAuthor(site_name)
    c.setSubject(f"Invoice for order {order.order_number}")
    W, H = A4
    L, R = 18 * mm, W - 18 * mm
    CW = R - L

    # ---------------------------------------------------------------- header band
    band = 46 * mm
    c.setFillColor(INK)
    c.rect(0, H - band, W, band, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.rect(0, H - band, W, 1.6 * mm, fill=1, stroke=0)
    _mark(c, L, H - 30 * mm, 13 * mm)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(L + 17 * mm, H - 22.5 * mm, "Ticket")
    tw = c.stringWidth("Ticket", "Helvetica-Bold", 19)
    c.setFillColor(colors.HexColor("#A897FF"))
    c.drawString(L + 17 * mm + tw, H - 22.5 * mm, "Nest")
    c.setFillColor(colors.HexColor("#B8B6C4"))
    c.setFont("Helvetica", 8.5)
    c.drawString(L + 17 * mm, H - 28 * mm, "K-pop concert ticket resale marketplace · Cambodia")
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 24)
    c.drawRightString(R, H - 21 * mm, "INVOICE")
    c.setFont("Helvetica", 9.5)
    c.setFillColor(colors.HexColor("#D9D7E3"))
    c.drawRightString(R, H - 27.5 * mm, inv.invoice_number)
    # status pill
    label = "REFUNDED" if refunded else "PAID"
    pill_bg, pill_fg = (BAD_SOFT, BAD) if refunded else (GOOD_SOFT, GOOD)
    c.setFont("Helvetica-Bold", 8)
    pw = c.stringWidth(label, "Helvetica-Bold", 8) + 7 * mm
    c.setFillColor(pill_bg)
    c.roundRect(R - pw, H - 38 * mm, pw, 6.5 * mm, 3.25 * mm, fill=1, stroke=0)
    c.setFillColor(pill_fg)
    c.drawCentredString(R - pw / 2, H - 35.8 * mm, label)

    # ---------------------------------------------------------------- three info columns
    y = H - band - 13 * mm
    col = CW / 3
    blocks = [
        ("Billed to", [(order.contact_name, True), (order.contact_email or "-", False),
                       (order.contact_phone or "", False),
                       (f"Telegram @{order.contact_telegram}" if order.contact_telegram else "", False)]),
        ("Invoice details", [(f"Invoice  {inv.invoice_number}", False), (f"Order  {order.order_number}", False),
                             (f"Issued  {fmt_local(inv.issued_at, '%d %b %Y')}", False),
                             (f"Status  {STATUS_LABEL.get(order.status.value, order.status.value.title())}", False)]),
        ("Payment", [("KHQR · Bakong / ABA", True), (f"Ref  {pay.reference or '-'}", False),
                     (f"Paid  {fmt_local(pay.verified_at, '%d %b %Y, %H:%M')}", False),
                     (f"Amount  {fmt_usd2(order.total_cents)} USD", False)]),
    ]
    for i, (title, lines) in enumerate(blocks):
        x = L + i * col
        _label(c, x, y, title)
        ly = y - 6 * mm
        for text, strong in lines:
            if not text:
                continue
            c.setFont("Helvetica-Bold" if strong else "Helvetica", 10 if strong else 8.8)
            c.setFillColor(INK if strong else SOFT)
            c.drawString(x, ly, _fit(c, text, col - 6 * mm, "Helvetica-Bold" if strong else "Helvetica", 10 if strong else 8.8))
            ly -= 5 * mm

    # ---------------------------------------------------------------- event card
    y -= 34 * mm
    card_h = 24 * mm
    c.setFillColor(PANEL)
    c.roundRect(L, y - card_h, CW, card_h, 3 * mm, fill=1, stroke=0)
    c.setFillColor(ACCENT)
    c.roundRect(L, y - card_h, 1.6 * mm, card_h, 0.8 * mm, fill=1, stroke=0)
    _label(c, L + 7 * mm, y - 6.5 * mm, "Event")
    c.setFont("Helvetica-Bold", 13)
    c.setFillColor(INK)
    c.drawString(L + 7 * mm, y - 13 * mm, _fit(c, it.concert_title, CW - 14 * mm, "Helvetica-Bold", 13))
    c.setFont("Helvetica", 9)
    c.setFillColor(SOFT)
    seat = f" · Seat {it.seat_info}" if it.seat_info else ""
    c.drawString(L + 7 * mm, y - 18.5 * mm, _fit(c, f"{it.artist_name} · {it.category_name}{seat} · "
                 f"{fmt_local(it.concert_starts_at, '%a %d %b %Y, %H:%M')} · {it.venue}", CW - 14 * mm, "Helvetica", 9))

    # ---------------------------------------------------------------- line items
    y -= card_h + 11 * mm
    cols = [L + 4 * mm, R - 72 * mm, R - 40 * mm, R - 4 * mm]   # description, qty (right), unit (right), amount (right)
    c.setFillColor(INK)
    c.roundRect(L, y - 3 * mm, CW, 9 * mm, 2 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(cols[0], y, "DESCRIPTION")
    c.drawRightString(cols[1], y, "QTY")
    c.drawRightString(cols[2], y, "UNIT PRICE")
    c.drawRightString(cols[3], y, "AMOUNT")
    rows = [(f"Resale ticket — {it.category_name}", "Seller listing price", it.quantity, it.unit_price_cents, order.subtotal_cents),
            (f"Marketplace fee ({order.markup_bps / 100:g}%)", "TicketNest service fee", it.quantity, it.unit_markup_cents, order.markup_cents)]
    y -= 12 * mm
    for i, (title, sub, qty, unit, amount) in enumerate(rows):
        if i % 2 == 1:
            c.setFillColor(PANEL)
            c.rect(L, y - 6.5 * mm, CW, 13 * mm, fill=1, stroke=0)
        c.setFillColor(INK)
        c.setFont("Helvetica-Bold", 9.5)
        c.drawString(cols[0], y + 1 * mm, title)
        c.setFont("Helvetica", 8)
        c.setFillColor(MUTED)
        c.drawString(cols[0], y - 3.5 * mm, sub)
        c.setFont("Helvetica", 9.5)
        c.setFillColor(INK)
        c.drawRightString(cols[1], y, str(qty))
        c.drawRightString(cols[2], y, fmt_usd2(unit))
        c.setFont("Helvetica-Bold", 9.5)
        c.drawRightString(cols[3], y, fmt_usd2(amount))
        y -= 13 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(L, y + 6 * mm, R, y + 6 * mm)

    # ---------------------------------------------------------------- totals
    tx = R - 78 * mm
    y -= 4 * mm
    totals_top = y

    def total_row(lbl, val):
        nonlocal y
        c.setFont("Helvetica", 9.5)
        c.setFillColor(SOFT)
        c.drawString(tx + 4 * mm, y, lbl)
        c.setFillColor(INK)
        c.drawRightString(R - 4 * mm, y, val)
        y -= 6.5 * mm

    total_row("Original listing price", fmt_usd2(order.subtotal_cents))
    total_row(f"Marketplace fee ({order.markup_bps / 100:g}%)", fmt_usd2(order.markup_cents))
    y -= 4 * mm
    c.setFillColor(ACCENT)
    c.roundRect(tx, y - 4.5 * mm, R - tx, 12 * mm, 2.5 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(tx + 4 * mm, y, "Total paid" if not refunded else "Total paid (refunded)")
    c.setFont("Helvetica-Bold", 13)
    c.drawRightString(R - 4 * mm, y - 0.3 * mm, f"{fmt_usd2(order.total_cents)}")
    y -= 10 * mm
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    khr = pay.amount if pay.currency == "KHR" else usd_to_khr(order.total_cents, order.khr_rate)
    c.drawRightString(R - 4 * mm, y, f"≈ KHR {khr:,} at {order.khr_rate:,} riel per USD" if pay.currency != "KHR"
                      else f"Paid in riel: KHR {khr:,}")

    # thank-you block (left, next to totals)
    ty = totals_top
    _label(c, L, ty, "Thank you")
    c.setFont("Helvetica", 8.8)
    c.setFillColor(SOFT)
    for line in ["Thank you for buying with TicketNest.",
                 "Your ticket is delivered by our team on Telegram",
                 "after payment is verified."]:
        ty -= 5 * mm
        c.drawString(L, ty, line)

    # ---------------------------------------------------------------- notes
    y -= 16 * mm
    c.setStrokeColor(LINE)
    c.line(L, y, R, y)
    y -= 7 * mm
    _label(c, L, y, "Notes")
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    notes = [f"{site_name} is an independent ticket resale marketplace and is not affiliated with the artist, agency,",
             "promoter or official ticket seller. The marketplace fee is charged for the resale service.",
             "Refunds follow the TicketNest refund policy. Keep this invoice as proof of purchase."]
    for n in notes:
        y -= 4.6 * mm
        c.drawString(L, y, n)

    # ---------------------------------------------------------------- footer
    c.setFillColor(PANEL)
    c.rect(0, 0, W, 15 * mm, fill=1, stroke=0)
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    site = settings.SITE_URL.replace("https://", "").replace("http://", "").rstrip("/")
    left = f"{site_name} · {site}" + (f" · Telegram @{support}" if support else "")
    c.drawString(L, 6 * mm, left)
    c.drawRightString(R, 6 * mm, f"{inv.invoice_number} · Page 1 of 1")
    c.showPage()
    c.save()
    return buf.getvalue()
