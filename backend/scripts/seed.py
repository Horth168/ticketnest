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
    ("The Weeknd", "XO / Republic Records", True),
]
GENRE = {"The Weeknd": "R&B / Pop"}
# Wordmark logos from Wikimedia Commons (public domain / CC0), served by the website from /artists/.
# Logos are trademarks of their owners; used only to identify the artist.
LOGOS = {}  # filled below from web/public/artists if the files exist
_dir = pathlib.Path(__file__).resolve().parent.parent.parent / "web" / "public" / "artists"
if _dir.is_dir():
    for f in _dir.iterdir():
        LOGOS[f.stem] = f"/artists/{f.name}"



def main() -> None:
    with SessionLocal() as db:
        added = logos = 0
        for name, agency, popular in ARTISTS:
            a = db.query(Artist).filter_by(name=name).first()
            if not a:
                a = Artist(name=name, slug=slugify(name), agency=agency, is_popular=popular,
                           genre=GENRE.get(name, "K-pop"))
                db.add(a)
                added += 1
            logo = LOGOS.get(a.slug, "")
            if logo and not a.image_url:   # never overwrite a photo the owner uploaded
                a.image_url = logo
                logos += 1
        db.commit()
    print(f"Artists added: {added}, logos attached: {logos} (existing data is never overwritten).")


if __name__ == "__main__":
    main()
