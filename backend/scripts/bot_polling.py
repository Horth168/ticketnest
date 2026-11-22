"""Run the TicketNest bot with long polling - for LOCAL testing only (no https webhook needed).

    cd backend
    .venv\\Scripts\\activate
    python scripts/bot_polling.py

It removes the webhook while it runs. In production the API registers the webhook itself
(API_PUBLIC_URL must be https), so don't run this there.
"""
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.routers.telegram import handle_update  # noqa: E402
from app.services import telegram as tg  # noqa: E402


def main() -> None:
    if not settings.TELEGRAM_BOT_TOKEN:
        print("Set TELEGRAM_BOT_TOKEN in backend/.env first.")
        sys.exit(1)
    tg.call("deleteWebhook", drop_pending_updates=False)
    tg.call("setMyCommands", commands=tg.COMMANDS)
    print("Polling Telegram... press Ctrl+C to stop.")
    offset = 0
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getUpdates"
    while True:
        try:
            r = httpx.get(url, params={"timeout": 50, "offset": offset,
                                       "allowed_updates": '["message","channel_post","callback_query","my_chat_member"]'},
                          timeout=60)
            for upd in r.json().get("result", []):
                offset = upd["update_id"] + 1
                with SessionLocal() as db:
                    handle_update(db, upd)
        except KeyboardInterrupt:
            break
        except Exception as e:  # noqa: BLE001
            print("poll error:", e.__class__.__name__)
            time.sleep(5)


if __name__ == "__main__":
    main()
