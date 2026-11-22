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

from app.models import Order, PaymentStatus
from app.utils import fmt_local, fmt_usd2

INK = colors.HexColor("#0E0E12")
MUTED = colors.HexColor("#6B6B76")
LINE = colors.HexColor("#E2E1E6")
ACCENT = colors.HexColor("#5B3DF5")

STATUS_LABEL = {"paid": "Paid", "preparing": "Preparing ticket", "awaiting_delivery": "Awaiting delivery",
                "delivered": "Delivered", "completed": "Completed", "refunded": "Refunded", "cancelled": "Cancelled"}


def verified_payment(order: Order):
    for p in reversed(order.payments):
        if p.status in (PaymentStatus.verified, PaymentStatus.refunded) and p.verified_at:
            return p
    return None


def build(order: Order, site_name: str = "TicketNest") -> bytes:
    pay = verified_payment(order)
    if order.invoice is None or pay is None:
        raise ValueError("Invoices exist only for verified payments")
    inv = order.invoice
    it = order.items[0]
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"{inv.invoice_number} - {site_name}")
    c.setAuthor(site_name)
    W, H = A4
    x0, x1 = 20 * mm, W - 20 * mm

    # --- header: logo mark + wordmark
    y = H - 26 * mm
    c.setFillColor(INK)
    c.roundRect(x0, y - 3 * mm, 11 * mm, 11 * mm, 2.5 * mm, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(x0 + 5.5 * mm, y + 0.6 * mm, "T")
    c.setFillColor(ACCENT)
    c.circle(x0 + 9 * mm, y + 6 * mm, 1.1 * mm, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 17)
    name_w = c.stringWidth("Ticket", "Helvetica-Bold", 17)
    c.drawString(x0 + 14 * mm, y, "Ticket")
    c.setFillColor(ACCENT)
    c.drawString(x0 + 14 * mm + name_w, y, "Nest")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 22)
    c.drawRightString(x1, y, "INVOICE")
    c.setFont("Helvetica", 9.5)
    c.setFillColor(MUTED)
    c.drawRightString(x1, y - 6 * mm, inv.invoice_number)

    # --- facts grid
    y -= 20 * mm
    facts = [("Invoice number", inv.invoice_number), ("Order number", order.order_number),
             ("Invoice issue date", fmt_local(inv.issued_at, "%d %b %Y")),
             ("Payment date", fmt_local(pay.verified_at, "%d %b %Y, %H:%M")),
             ("Payment method", "KHQR (Bakong / ABA)"), ("Payment reference", pay.reference or "-"),
             ("Order status", STATUS_LABEL.get(order.status.value, order.status.value.title())),
             ("Billed to", order.contact_name), ("Customer email", order.contact_email or "-")]
    col_w = (x1 - x0) / 3
    for i, (k, v) in enumerate(facts):
        cx = x0 + (i % 3) * col_w
        cy = y - (i // 3) * 13 * mm
        c.setFont("Helvetica", 7.5)
        c.setFillColor(MUTED)
        c.drawString(cx, cy, k.upper())
        c.setFont("Helvetica-Bold", 9.5)
        c.setFillColor(INK)
        c.drawString(cx, cy - 4.8 * mm, _fit(c, str(v), col_w - 4 * mm, "Helvetica-Bold", 9.5))

    # --- item table
    y -= 3 * 13 * mm + 6 * mm
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(x0, y, x1, y)
    y -= 6 * mm
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    c.drawString(x0, y, "DESCRIPTION")
    c.drawRightString(x1 - 55 * mm, y, "QTY")
    c.drawRightString(x1 - 27 * mm, y, "UNIT PRICE")
    c.drawRightString(x1, y, "AMOUNT")
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 10.5)
    c.setFillColor(INK)
    c.drawString(x0, y, _fit(c, it.concert_title, 95 * mm, "Helvetica-Bold", 10.5))
    c.setFont("Helvetica", 9.5)
    c.drawRightString(x1 - 55 * mm, y, str(it.quantity))
    c.drawRightString(x1 - 27 * mm, y, fmt_usd2(it.unit_price_cents))
    c.drawRightString(x1, y, fmt_usd2(order.subtotal_cents))
    c.setFont("Helvetica", 8.5)
    c.setFillColor(MUTED)
    details = [f"{it.artist_name} · {it.category_name}" + (f" · {it.seat_info}" if it.seat_info else ""),
               f"{fmt_local(it.concert_starts_at, '%a %d %b %Y, %H:%M')} · {it.venue}"]
    for line in details:
        y -= 4.8 * mm
        c.drawString(x0, y, _fit(c, line, 110 * mm, "Helvetica", 8.5))
    y -= 7 * mm
    c.line(x0, y, x1, y)

    # --- totals
    def total_row(label, value, bold=False):
        nonlocal y
        y -= 7 * mm
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 9.5)
        c.setFillColor(INK if bold else MUTED)
        c.drawString(x1 - 80 * mm, y, label)
        c.setFillColor(INK)
        c.drawRightString(x1, y, value)

    pct = f"{order.markup_bps / 100:g}%"
    total_row("Original listing price", fmt_usd2(order.subtotal_cents))
    total_row(f"Marketplace fee ({pct})", fmt_usd2(order.markup_cents))
    y -= 3 * mm
    c.line(x1 - 80 * mm, y, x1, y)
    label = "Total paid" if order.status.value != "refunded" else "Total paid (refunded)"
    total_row(label, f"{fmt_usd2(order.total_cents)} USD", bold=True)
    if pay.currency == "KHR":
        total_row("Paid in riel", f"{pay.amount:,} KHR")

    # --- footer
    c.setFont("Helvetica", 7.5)
    c.setFillColor(MUTED)
    notes = [f"{site_name} is an independent ticket resale marketplace and is not affiliated with the artist, promoter",
             "or official ticket seller. Tickets are delivered manually through Telegram after payment is verified.",
             "The marketplace fee is charged for the resale service. Refunds follow the TicketNest refund policy."]
    fy = 26 * mm
    for n in notes:
        c.drawString(x0, fy, n)
        fy -= 4 * mm
    c.showPage()
    c.save()
    return buf.getvalue()


def _fit(c, text: str, width: float, font: str, size: float) -> str:
    if c.stringWidth(text, font, size) <= width:
        return text
    while text and c.stringWidth(text + "…", font, size) > width:
        text = text[:-1]
    return text + "…"
