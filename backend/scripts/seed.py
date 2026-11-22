"""Seed the starting artist list (names only). Safe to run again; it never deletes anything.

No concerts, listings or prices are created: concerts are real events, so the owner adds them in
the admin dashboard with their real dates and venues.

    python scripts/seed.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402,F401
from app.models import Artist  # noqa: E402
from app.utils import slugify  # noqa: E402

ARTISTS = [
    ("BLACKPINK", "YG Entertainment", True), ("BTS", "BIGHIT MUSIC", True), ("TWICE", "JYP Entertainment", True),
    ("Stray Kids", "JYP Entertainment", True), ("SEVENTEEN", "PLEDIS Entertainment", True),
    ("aespa", "SM Entertainment", True), ("NewJeans", "ADOR", False), ("IVE", "Starship Entertainment", False),
    ("ENHYPEN", "BELIFT LAB", False), ("EXO", "SM Entertainment", False), ("BIGBANG", "YG Entertainment", False),
    ("ITZY", "JYP Entertainment", False), ("LE SSERAFIM", "SOURCE MUSIC", False), ("NCT", "SM Entertainment", False),
]


def main() -> None:
    with SessionLocal() as db:
        added = 0
        for name, agency, popular in ARTISTS:
            if not db.query(Artist).filter_by(name=name).first():
                db.add(Artist(name=name, slug=slugify(name), agency=agency, is_popular=popular))
                added += 1
        db.commit()
    print(f"Artists added: {added} (existing ones were left as they are).")


if __name__ == "__main__":
    main()
