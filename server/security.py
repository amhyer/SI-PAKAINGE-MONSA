"""Kriptografi token, sanitasi output, dan validasi anti-SSRF/media (Fase 4A)."""
import base64
import hashlib
import hmac
import json
import time
from urllib.parse import urlparse

from config import SECRET_KEY
from db import open_conn


def create_token(user_id: int, role: str, tenant_id: int, token_version: int = 1) -> str:
    payload = json.dumps(
        {"uid": user_id, "role": role, "tid": tenant_id, "tv": int(token_version or 1), "exp": int(time.time()) + 7 * 86400},
        separators=(",", ":"),
    ).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    sig = hmac.new(SECRET_KEY, b64.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{b64}.{sig}"


def verify_token(token: str):
    if not token or "." not in token:
        return None
    try:
        b64, sig = token.split(".", 1)
        expected = hmac.new(SECRET_KEY, b64.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(b64.encode("ascii")).decode("utf-8"))
        if data.get("exp") and int(data["exp"]) < int(time.time()):
            return None
        with open_conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (data["uid"],)).fetchone()
        if not row or row["verification_status"] == "rejected" or row["role"] == "guest_reporter":
            return None
        if data.get("tid") is not None and int(data["tid"]) != int(row["tenant_id"]):
            return None
        row_tv = int(row["token_version"] if "token_version" in row.keys() and row["token_version"] is not None else 1)
        if int(data.get("tv", 1)) != row_tv:
            return None
        return sanitize_user(row)
    except Exception:
        return None


def sanitize_user(row) -> dict:
    d = dict(row)
    d.pop("password_hash", None)
    d.pop("token_version", None)
    return d


def sanitize_school(row, include_secrets: bool = False) -> dict:
    d = dict(row)
    if not include_secrets:
        d["webhook_url"] = ""
    return d


def is_safe_https_webhook(url: str) -> bool:
    if not url:
        return True
    try:
        u = urlparse(url.strip())
        if u.scheme.lower() != "https" or not u.hostname:
            return False
        host = u.hostname.lower().strip("[]")
        blocked_exact = ("localhost", "localhost.localdomain", "::1", "0:0:0:0:0:0:0:1", "metadata.google.internal")
        blocked_prefixes = ("127.", "0.", "169.254.", "10.", "192.168.", "fc", "fd", "fe80:")
        blocked_172 = tuple(f"172.{n}." for n in range(16, 32))
        if (
            host in blocked_exact
            or host.endswith(".local")
            or host.endswith(".internal")
            or any(host.startswith(p) for p in blocked_prefixes + blocked_172)
        ):
            return False
        return True
    except Exception:
        return False


def is_valid_image_data(photo_data: str) -> bool:
    if not photo_data:
        return True
    return (
        photo_data.startswith("data:image/jpeg;")
        or photo_data.startswith("data:image/png;")
        or photo_data.startswith("data:image/webp;")
    ) and len(photo_data) <= 950000


def is_valid_audio_data(audio_data: str) -> bool:
    if not audio_data:
        return True
    allowed_prefixes = (
        "data:audio/webm;",
        "data:audio/ogg;",
        "data:audio/mp4;",
        "data:audio/mpeg;",
        "data:audio/wav;",
        "data:audio/aac;",
    )
    return audio_data.startswith(allowed_prefixes) and ";base64," in audio_data[:80] and len(audio_data) <= 750000
