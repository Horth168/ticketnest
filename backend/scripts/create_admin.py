"""Create (or promote) an admin account.

    cd backend
    .venv\\Scripts\\activate
    python scripts/create_admin.py you@example.com "Your Name"
It asks for the password without showing it.
"""
import getpass
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app import models  # noqa: E402,F401
from app.models import Role, User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    email = sys.argv[1].strip().lower()
    name = sys.argv[2] if len(sys.argv) > 2 else "TicketNest Admin"
    with SessionLocal() as db:
        user = db.query(User).filter_by(email=email).first()
        if user:
            user.role = Role.admin
            print(f"{email} is now an admin.")
        else:
            pw = getpass.getpass("Password (min 8 characters, letters and numbers): ")
            if len(pw) < 8:
                print("Password too short")
                sys.exit(1)
            db.add(User(email=email, full_name=name, role=Role.admin, email_verified=True,
                        password_hash=hash_password(pw)))
            print(f"Admin {email} created.")
        db.commit()


if __name__ == "__main__":
    main()
