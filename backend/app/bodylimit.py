"""Request body size limit that counts the bytes actually received.

Checking only the Content-Length header is not enough: a request sent in chunks has no Content-Length and
would otherwise be read into memory in full before any validation, which could run the single server process
out of memory. This middleware stops reading as soon as the limit is passed and answers 413.
"""
from fastapi import HTTPException

from app.config import settings
from starlette.types import ASGIApp, Message, Receive, Scope, Send

TOO_LARGE = "Your upload is too large. Please use smaller files (photos are best) and try again."


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        max_bytes = settings.MAX_REQUEST_MB * 1024 * 1024
        for name, value in scope.get("headers") or []:
            if name == b"content-length" and value.isdigit() and int(value) > max_bytes:
                await _reply_413(send)
                return
        received = 0
        started = False

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > max_bytes:
                    raise HTTPException(413, TOO_LARGE)
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, tracking_send)
        except HTTPException as e:
            if e.status_code != 413 or started:
                raise
            await _reply_413(send)


async def _reply_413(send: Send) -> None:
    import json
    body = json.dumps({"detail": TOO_LARGE}).encode()
    await send({"type": "http.response.start", "status": 413,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})
