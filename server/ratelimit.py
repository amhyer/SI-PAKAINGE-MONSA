"""Rate-limit percobaan login & pendaftaran (Fase 4A) — diekstrak dari app.py.

SATU instance lock+dict untuk seluruh proses (invariant spec §3.4):
modul lain hanya mengimpor, jangan pernah membuat lock/dict baru.
"""
import threading
import time


RATE_LIMIT_LOCK = threading.Lock()
LOGIN_ATTEMPTS = {}  # key -> [timestamps]
RATE_LIMIT_MAX_ATTEMPTS = 10
RATE_LIMIT_WINDOW_SEC = 300


def _prune_rate_limits_locked(now: float):
    if len(LOGIN_ATTEMPTS) < 256:
        return
    expired = [
        k for k, stamps in LOGIN_ATTEMPTS.items()
        if not stamps or (now - max(stamps)) >= RATE_LIMIT_WINDOW_SEC
    ]
    for k in expired:
        LOGIN_ATTEMPTS.pop(k, None)


def is_login_rate_limited(key: str) -> bool:
    now = time.time()
    with RATE_LIMIT_LOCK:
        _prune_rate_limits_locked(now)
        stamps = [t for t in LOGIN_ATTEMPTS.get(key, []) if now - t < RATE_LIMIT_WINDOW_SEC]
        if stamps:
            LOGIN_ATTEMPTS[key] = stamps
        else:
            LOGIN_ATTEMPTS.pop(key, None)
        return len(stamps) >= RATE_LIMIT_MAX_ATTEMPTS


def record_failed_login(key: str):
    now = time.time()
    with RATE_LIMIT_LOCK:
        _prune_rate_limits_locked(now)
        stamps = [t for t in LOGIN_ATTEMPTS.get(key, []) if now - t < RATE_LIMIT_WINDOW_SEC]
        stamps.append(now)
        LOGIN_ATTEMPTS[key] = stamps


def clear_failed_login(key: str):
    with RATE_LIMIT_LOCK:
        LOGIN_ATTEMPTS.pop(key, None)


def check_and_record_ip_rate_limit(bucket: str, ip: str, max_hits: int, window_sec: int = 300) -> bool:
    """Returns True if allowed, False if rate limit exceeded."""
    now = time.time()
    key = f"{bucket}::{ip}"
    with RATE_LIMIT_LOCK:
        _prune_rate_limits_locked(now)
        stamps = [t for t in LOGIN_ATTEMPTS.get(key, []) if now - t < window_sec]
        if len(stamps) >= max_hits:
            LOGIN_ATTEMPTS[key] = stamps
            return False
        stamps.append(now)
        LOGIN_ATTEMPTS[key] = stamps
        return True
