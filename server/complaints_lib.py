"""Domain pengaduan: kode tiket, akun tamu, masking anonim, kategori (Fase 4A).

TICKET_LOCK = SATU lock untuk seluruh proses (invariant spec §3.4).
"""
import secrets
import threading

from db import hash_pw, now_iso


TICKET_LOCK = threading.Lock()


def get_or_create_guest_user_id(conn, school: dict) -> int:
    ident = f"guest@{school['tenant_code'].lower()}.local"
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR IGNORE INTO users (
            tenant_id, full_name, phone_or_email, password_hash, role,
            bio_note, verification_status, token_version, created_at
        ) VALUES (?, 'Pelapor Cepat Tanpa Akun', ?, ?, 'guest_reporter', 'Akun sistem pelapor cepat tamu', 'verified', 1, ?)
        """,
        (school["id"], ident, hash_pw(secrets.token_hex(24)), now_iso()),
    )
    conn.commit()
    row = conn.execute(
        "SELECT id FROM users WHERE tenant_id = ? AND phone_or_email = ?",
        (school["id"], ident),
    ).fetchone()
    return int(row["id"])


def mask_anonymous_complaint(d: dict, viewer_user_id=None) -> dict:
    d.pop("guest_pin_hash", None)
    if d.get("is_anonymous") and d.get("user_id") != viewer_user_id:
        d["reporter_display_name"] = "Pelapor Anonim (Dilindungi UU PDP)"
        d["student_info"] = "Disamarkan (Anonim)"
        d["user_id"] = None
    return d


def next_ticket_code(conn, prefix: str) -> str:
    cnt = conn.execute("SELECT COUNT(*) FROM complaints").fetchone()[0] + 1
    while True:
        code = f"ADU-{prefix}-{cnt:04d}"
        if not conn.execute("SELECT 1 FROM complaints WHERE ticket_code = ?", (code,)).fetchone():
            return code
        cnt += 1


def route_category(category: str, needs_priority: bool = False) -> str:
    if needs_priority:
        return "Tim Layanan Prioritas Rentan & TPPK Sekolah"
    if "Perundungan" in category or "Bullying" in category or "Inklusi" in category:
        return "Guru Pendamping & Tim TPPK Sekolah"
    if "Pungutan" in category or "Seragam" in category:
        return "Kepala Sekolah & Tim Zona Integritas"
    if "Fasilitas" in category:
        return "Sarpras & Tata Usaha Sekolah"
    if "Bantuan" in category or "PIP" in category:
        return "Operator Sekolah / Dapodik"
    return "Tim Pengelola Layanan & Pengaduan Sekolah"


def normalize_wa_number(raw: str) -> str:
    digits = "".join(ch for ch in (raw or "") if ch.isdigit())
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    return digits or "6281355982195"
