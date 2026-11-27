"""File storage with two areas:

* public  - concert posters, artist photos, logo. Served at a public URL.
* private - ticket proofs, delivery files, invoices. NEVER public: streamed by the API only after
            checking that the caller is the owner or an admin.

Providers: `local` (backend/storage, development) and `r2` (Cloudflare R2, S3 compatible).
Uploads are checked by their real content (magic bytes), not by the name or the browser's type.
"""
from __future__ import annotations

import io
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from app.config import settings

IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
PDF_TYPE = {"application/pdf": ".pdf"}


def sniff(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    return None


async def read_upload(file: UploadFile, *, allow_pdf: bool) -> tuple[bytes, str]:
    data = await file.read(settings.MAX_UPLOAD_MB * 1024 * 1024 + 1)
    if len(data) > settings.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {settings.MAX_UPLOAD_MB} MB")
    if not data:
        raise HTTPException(400, "The file is empty")
    kind = sniff(data)
    allowed = {**IMAGE_TYPES, **(PDF_TYPE if allow_pdf else {})}
    if kind not in allowed:
        raise HTTPException(415, "Upload a JPG, PNG or WEBP image" + (" or a PDF" if allow_pdf else ""))
    if kind.startswith("image/"):
        data = _clean_image(data, kind)
    return data, kind


def _clean_image(data: bytes, kind: str) -> bytes:
    """Re-encode images: drops EXIF (GPS etc.) and anything hidden after the image data."""
    from PIL import Image, UnidentifiedImageError
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()
        img = Image.open(io.BytesIO(data))
        if img.width * img.height > 40_000_000:
            raise HTTPException(400, "Image is too large")
        img.thumbnail((2000, 2000))   # plenty to read a ticket or receipt, and keeps storage small
        out = io.BytesIO()
        fmt = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}[kind]
        if fmt == "JPEG" and img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.save(out, fmt, quality=85)
        return out.getvalue()
    except (UnidentifiedImageError, OSError, SyntaxError) as e:
        raise HTTPException(400, "This image could not be read") from e


def _key(folder: str, kind: str) -> str:
    ext = {**IMAGE_TYPES, **PDF_TYPE}[kind]
    return f"{folder}/{secrets.token_hex(16)}{ext}"


def _r2():
    import boto3
    return boto3.client("s3", endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
                        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
                        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY, region_name="auto")


def _local_path(area: str, key: str) -> Path:
    base = Path(settings.LOCAL_STORAGE_DIR) / area
    p = (base / key).resolve()
    if base.resolve() not in p.parents:
        raise HTTPException(400, "Invalid file path")
    return p


def save_public(data: bytes, kind: str, folder: str) -> str:
    """Returns the public URL."""
    key = _key(folder, kind)
    if settings.STORAGE_PROVIDER == "r2":
        _r2().put_object(Bucket=settings.R2_PUBLIC_BUCKET, Key=key, Body=data, ContentType=kind,
                         CacheControl="public, max-age=31536000, immutable")
        return f"{settings.R2_PUBLIC_URL.rstrip('/')}/{key}"
    p = _local_path("public", key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return f"{settings.API_PUBLIC_URL.rstrip('/')}/media/{key}"


def save_private(data: bytes, kind: str, folder: str) -> str:
    """Returns the storage key (not a URL)."""
    key = _key(folder, kind)
    if settings.STORAGE_PROVIDER == "r2":
        _r2().put_object(Bucket=settings.R2_PRIVATE_BUCKET, Key=key, Body=data, ContentType=kind)
        return key
    p = _local_path("private", key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)
    return key


def read_private(key: str) -> bytes:
    if settings.STORAGE_PROVIDER == "r2":
        obj = _r2().get_object(Bucket=settings.R2_PRIVATE_BUCKET, Key=key)
        return obj["Body"].read()
    p = _local_path("private", key)
    if not p.is_file():
        raise HTTPException(404, "File not found")
    return p.read_bytes()


# ---------------------------------------------------------------- fixed keys (database backups)
def put_private_at(key: str, data: bytes, content_type: str) -> None:
    if settings.STORAGE_PROVIDER == "r2":
        _r2().put_object(Bucket=settings.R2_PRIVATE_BUCKET, Key=key, Body=data, ContentType=content_type)
        return
    p = _local_path("private", key)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def list_private(prefix: str) -> list[dict]:
    """[{key, size, modified}] newest first."""
    out = []
    if settings.STORAGE_PROVIDER == "r2":
        pages = _r2().get_paginator("list_objects_v2").paginate(Bucket=settings.R2_PRIVATE_BUCKET, Prefix=prefix)
        for page in pages:
            for o in page.get("Contents", []):
                out.append({"key": o["Key"], "size": o["Size"], "modified": o["LastModified"]})
    else:
        from datetime import datetime, timezone
        base = _local_path("private", prefix.rstrip("/") + "/x").parent
        if base.is_dir():
            for f in base.iterdir():
                if f.is_file():
                    out.append({"key": f"{prefix.rstrip('/')}/{f.name}", "size": f.stat().st_size,
                                "modified": datetime.fromtimestamp(f.stat().st_mtime, timezone.utc)})
    return sorted(out, key=lambda o: o["modified"], reverse=True)


def delete_private(key: str) -> None:
    if settings.STORAGE_PROVIDER == "r2":
        _r2().delete_object(Bucket=settings.R2_PRIVATE_BUCKET, Key=key)
        return
    p = _local_path("private", key)
    if p.is_file():
        p.unlink()
