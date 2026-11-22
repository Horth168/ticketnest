"""The saved KHQR image: drawn like the official KHQR card (red header with the KHQR logo, merchant
name, amount, dashed line, QR with the KHQR mark in the middle) so it looks the same as the card on the
checkout page and as bank-app KHQRs. The QR uses high error correction, so the centre mark never stops
banking apps from scanning it."""
from __future__ import annotations

import io
import os
from functools import lru_cache
from pathlib import Path

import qrcode
from PIL import Image, ImageDraw, ImageFont
from qrcode.constants import ERROR_CORRECT_H

from app.services import khqr

RED = (226, 26, 44)
ASSETS = Path(__file__).resolve().parent.parent / "assets" / "khqr"
W, H, PAD = 600, 900, 50


@lru_cache(maxsize=8)
def _font(bold: bool, size: int):
    import reportlab
    base = Path(os.path.dirname(reportlab.__file__)) / "fonts"
    try:
        return ImageFont.truetype(str(base / ("VeraBd.ttf" if bold else "Vera.ttf")), size)
    except OSError:
        return ImageFont.load_default()


def merchant_name(payload: str) -> str:
    try:
        return dict(khqr.parse_tlv(payload)).get("59", "") or "TicketNest"
    except ValueError:
        return "TicketNest"


def amount_text(amount, currency: str) -> str:
    if currency == "KHR":
        return f"{int(amount):,}"
    return f"{int(amount) / 100:,.2f}"


def render(payload: str, amount, currency: str = "USD", name: str | None = None) -> bytes:
    name = name or merchant_name(payload)
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(card)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=36, fill=(255, 255, 255, 255))

    # red header with the folded corner on the right
    head = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(head)
    hd.rounded_rectangle((0, 0, W - 1, 140), radius=36, fill=RED + (255,))
    hd.rectangle((0, 60, W - 1, 108), fill=RED + (255,))
    hd.polygon([(W - 64, 108), (W - 1, 108), (W - 1, 150)], fill=RED + (255,))
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rectangle((0, 0, W, 108), fill=255)
    ImageDraw.Draw(mask).polygon([(W - 64, 108), (W, 108), (W, 150)], fill=255)
    card.paste(head, (0, 0), mask)
    logo = Image.open(ASSETS / "khqr-logo-white.png").convert("RGBA")
    lh = 40
    logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
    card.paste(logo, ((W - logo.width) // 2, (108 - lh) // 2), logo)

    # merchant + amount
    d = ImageDraw.Draw(card)
    d.text((PAD, 150), name[:30], font=_font(False, 26), fill=(40, 40, 40))
    amt = amount_text(amount, currency)
    big = _font(True, 50)
    d.text((PAD, 196), amt, font=big, fill=(0, 0, 0))
    d.text((PAD + d.textlength(amt, font=big) + 12, 218), currency, font=_font(False, 24), fill=(90, 90, 90))

    # dashed divider
    for x in range(0, W, 18):
        d.line([(x, 290), (x + 9, 290)], fill=(190, 190, 190), width=2)

    # QR with the KHQR mark in the middle
    q = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=12, border=0)
    q.add_data(payload)
    q.make(fit=True)
    qr = q.make_image(fill_color="black", back_color="white").convert("RGBA").resize((W - 2 * PAD, W - 2 * PAD), Image.NEAREST)
    card.paste(qr, (PAD, 330))
    mark = Image.open(ASSETS / "khqr-mark.png").convert("RGBA").resize((104, 104), Image.LANCZOS)
    card.paste(mark, (W // 2 - 52, 330 + (W - 2 * PAD) // 2 - 52), mark)

    out = Image.new("RGB", (W + 40, H + 40), (244, 243, 247))
    out.paste(card, (20, 20), card)
    buf = io.BytesIO()
    out.save(buf, "PNG", optimize=True)
    return buf.getvalue()
