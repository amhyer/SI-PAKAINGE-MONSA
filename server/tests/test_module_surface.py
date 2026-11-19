"""Kontrak permukaan modul app (Fase 4A) — ditulis SEBELUM app.py dipecah.

Mengunci: (1) 57 nama wajib tetap ada sebagai atribut modul `app`,
(2) setiap handler yang direferensikan routing wajib ada di kelas,
(3) tidak ada handle_* yang terdefinisi di lebih dari satu modul mixin.
"""
import re
from pathlib import Path

import app

SERVER_DIR = Path(__file__).resolve().parents[1]

# Spec §7: 38 fungsi + 4 kelas + 15 global.
KONTRAK = [
    # --- fungsi (38) ---
    "_load_dotenv", "_post_webhook", "_send_smtp_email", "_update_notif_status",
    "_notif_worker_loop", "_enqueue_notif", "_is_production_mode",
    "_resolve_secret_key", "build_app_info", "_prune_rate_limits_locked",
    "is_login_rate_limited", "record_failed_login", "clear_failed_login",
    "check_and_record_ip_rate_limit", "create_token", "verify_token",
    "sanitize_user", "sanitize_school", "is_safe_https_webhook",
    "is_valid_image_data", "is_valid_audio_data", "get_or_create_guest_user_id",
    "mask_anonymous_complaint", "next_ticket_code", "route_category",
    "normalize_wa_number", "dispatch_notifications",
    "dispatch_reporter_notification", "parse_iso_dt", "_fmt_hours_id",
    "compute_complaint_sla", "enrich_complaint_sla", "get_ikm_grade",
    "compute_ikm_summary", "compute_evaluation_summary", "compute_public_recap",
    "build_monev_markdown", "main",
    # --- kelas (4) ---
    "PayloadTooLargeError", "SikolaHandler", "MonsaThreadingHTTPServer",
    "SikolaHandlerBase",
    # --- global (15) ---
    "SECRET_KEY", "BASE_DIR", "WEB_BUNDLE_DIR", "APP_VERSION",
    "APP_VERSION_CODE", "MIN_SUPPORTED_VERSION_CODE", "APP_RELEASE_DATE",
    "TICKET_LOCK", "RATE_LIMIT_LOCK", "LOGIN_ATTEMPTS",
    "RATE_LIMIT_MAX_ATTEMPTS", "RATE_LIMIT_WINDOW_SEC", "_NOTIF_QUEUE",
    "_NOTIF_WORKER", "IKM_ELEMENT_LABELS",
]


def test_permukaan_nama_tidak_berubah():
    hilang = [n for n in KONTRAK if not hasattr(app, n)]
    assert not hilang, f"nama hilang dari modul app: {hilang}"


def test_routing_lengkap_semua_handler_ada_di_kelas():
    src = (SERVER_DIR / "app.py").read_text(encoding="utf-8")
    dipakai = sorted(set(re.findall(r"self\.(handle_\w+|serve_static)", src)))
    assert dipakai, "regex tidak menemukan handler — pola routing berubah?"
    for nama in dipakai:
        assert hasattr(app.SikolaHandler, nama), (
            f"{nama} direferensikan routing tapi tidak ada di SikolaHandler"
        )


def test_tidak_ada_handle_duplikat_antar_modul_handler():
    files = sorted(SERVER_DIR.glob("handler_*.py"))
    if not files:
        return  # pra-ekstraksi: belum ada mixin
    definisi = {}
    for f in files:
        teks = f.read_text(encoding="utf-8")
        for nama in re.findall(r"^\s+def (handle_\w+|serve_static)\(", teks, re.M):
            definisi.setdefault(nama, []).append(f.name)
    dup = {k: v for k, v in definisi.items() if len(v) > 1}
    assert not dup, f"handle_* terdefinisi di banyak modul (shadowing): {dup}"
