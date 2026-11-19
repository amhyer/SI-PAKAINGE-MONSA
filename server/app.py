import csv
import io
import json
import mimetypes
import os
import queue
import re
import secrets
import smtplib
import sys
import threading
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import hash_pw, init_db, needs_rehash, now_iso, open_conn, seed_tenant_defaults, verify_pw
from chatbot import generate_chat_reply
from config import (
    APP_RELEASE_DATE, APP_VERSION, APP_VERSION_CODE, BASE_DIR,
    MIN_SUPPORTED_VERSION_CODE, SECRET_KEY, WEB_BUNDLE_DIR,
    _is_production_mode, _load_dotenv, _resolve_secret_key, build_app_info,
)
from ratelimit import (
    LOGIN_ATTEMPTS, RATE_LIMIT_LOCK, RATE_LIMIT_MAX_ATTEMPTS,
    RATE_LIMIT_WINDOW_SEC, _prune_rate_limits_locked,
    check_and_record_ip_rate_limit, clear_failed_login, is_login_rate_limited,
    record_failed_login,
)
from security import (
    create_token, is_safe_https_webhook, is_valid_audio_data,
    is_valid_image_data, sanitize_school, sanitize_user, verify_token,
)

# Kontrak permukaan publik modul ini (spec §7, dikunci test_module_surface):
# 38 fungsi + 4 kelas + 15 global. Nama yang hanya di-re-export tetap
# dinyatakan terpakai di sini.
__all__ = [
    # 38 fungsi
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
    # 4 kelas
    "PayloadTooLargeError", "SikolaHandler", "MonsaThreadingHTTPServer",
    "SikolaHandlerBase",
    # 15 global
    "SECRET_KEY", "BASE_DIR", "WEB_BUNDLE_DIR", "APP_VERSION",
    "APP_VERSION_CODE", "MIN_SUPPORTED_VERSION_CODE", "APP_RELEASE_DATE",
    "TICKET_LOCK", "RATE_LIMIT_LOCK", "LOGIN_ATTEMPTS",
    "RATE_LIMIT_MAX_ATTEMPTS", "RATE_LIMIT_WINDOW_SEC", "_NOTIF_QUEUE",
    "_NOTIF_WORKER", "IKM_ELEMENT_LABELS",
]


# --- Notifikasi async (Fase 2) -------------------------------------------
# Pengiriman webhook (timeout 4 dtk) & SMTP (timeout 5 dtk) dipindah ke worker
# daemon agar thread request tidak menahan respons pengguna.
_NOTIF_QUEUE = queue.Queue(maxsize=200)
_NOTIF_WORKER = None


def _post_webhook(webhook_url: str, payload: dict) -> bool:
    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4):
            return True
    except Exception:
        return False


def _send_smtp_email(to_addr: str, subject: str, body_text: str, from_addr: str = "") -> bool:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if not smtp_host or not to_addr:
        return False
    try:
        msg = MIMEText(body_text, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = from_addr or os.environ.get("SMTP_FROM", to_addr)
        msg["To"] = to_addr
        with smtplib.SMTP(smtp_host, int(os.environ.get("SMTP_PORT", "587")), timeout=5) as srv:
            if os.environ.get("SMTP_TLS", "1") == "1":
                srv.starttls()
            if os.environ.get("SMTP_USER"):
                srv.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
            srv.send_message(msg)
        return True
    except Exception:
        return False


def _update_notif_status(log_id: int, status: str):
    try:
        with open_conn() as conn:
            conn.execute("UPDATE notification_logs SET status = ? WHERE id = ?", (status, log_id))
            conn.commit()
    except Exception:
        pass


def _notif_worker_loop():
    while True:
        job = _NOTIF_QUEUE.get()
        try:
            job()
        except Exception:
            pass
        finally:
            _NOTIF_QUEUE.task_done()


def _enqueue_notif(job, fallback=None):
    """Antrekan pengiriman ke worker. Bila antrean penuh, jalankan sinkron
    (fallback) agar notifikasi tidak hilang diam-diam."""
    global _NOTIF_WORKER
    if _NOTIF_WORKER is None or not _NOTIF_WORKER.is_alive():
        _NOTIF_WORKER = threading.Thread(target=_notif_worker_loop, daemon=True, name="monsa-notif")
        _NOTIF_WORKER.start()
    try:
        _NOTIF_QUEUE.put_nowait(job)
    except queue.Full:
        try:
            (fallback or job)()
        except Exception:
            pass


TICKET_LOCK = threading.Lock()


class PayloadTooLargeError(ValueError):
    pass


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


def dispatch_notifications(school: dict, item: dict) -> dict:
    wa_num = normalize_wa_number(school.get("notify_whatsapp") or "6281355982195")
    email_to = (school.get("notify_email") or school.get("email") or "sdnungmongisidi1@gmail.com").strip()
    urgent_tag = "[DARURAT TPPK] " if item.get("urgency") == "Darurat Anak" else ""
    priority_tag = "[PRIORITAS INKLUSI] " if item.get("needs_priority_assistance") else ""
    dis_note = f" | Kebutuhan Khusus: {item['disability_type']}" if item.get("disability_type") else ""
    dis_bracket = f" [{item['disability_type']}]" if item.get("disability_type") else ""
    summary = (
        f"{urgent_tag}{priority_tag}[{item['ticket_code']}] Aduan baru ({item['urgency']}) - {item['category']}{dis_note} | "
        f"Unit: {item['routed_to']} | Lokasi: {item.get('location_detail') or '-'}"
    )
    wa_msg = (
        f"*NOTIFIKASI SI-PAKAINGE MONSA - {school['short_name']}*\n"
        f"Kode Tiket: *{item['ticket_code']}*\n"
        f"Kategori: {item['category']}\n"
        f"Urgensi: *{item['urgency']}*{(' (PRIORITAS INKLUSI / RENTAN)' if item.get('needs_priority_assistance') else '')}{dis_bracket}\n"
        f"Unit Tujuan: {item['routed_to']}\n"
        f"Lokasi: {item.get('location_detail') or '-'}\n"
        f"Pelapor: {item['reporter_display_name']}\n"
        f"Ringkasan: {(item['description'] or '')[:180]}"
    )
    wa_link = f"https://wa.me/{wa_num}?text={urllib.parse.quote(wa_msg)}"
    subj = f"[{item['ticket_code']}] Aduan Baru SI-PAKAINGE MONSA"
    mailto_link = f"mailto:{urllib.parse.quote(email_to)}?subject={urllib.parse.quote(subj)}&body={urllib.parse.quote(wa_msg.replace('*', ''))}"

    # 1) Webhook & SMTP dikirim ASYNC oleh worker (Fase 2): thread request tidak
    #    lagi menahan timeout jaringan (4 dtk webhook + 5 dtk SMTP).
    webhook_url = (school.get("webhook_url") or os.environ.get("MONSA_WEBHOOK_URL") or "").strip()
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    do_webhook = bool(webhook_url)
    do_smtp = bool(smtp_host and email_to)
    webhook_status = "antre_async" if do_webhook else "siap_kirim_manual"
    email_status = "antre_async" if do_smtp else "siap_mailto"

    ts = now_iso()
    with open_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO notification_logs (
                tenant_id, complaint_id, ticket_code, target_user_id, direction,
                channel, recipient, status, summary, staff_note_snapshot, wa_link, mailto_link, is_read, created_at
            )
            VALUES (?, ?, ?, NULL, 'to_school', 'whatsapp_&_inapp', ?, ?, ?, '', ?, ?, 0, ?)
            """,
            (school["id"], item["id"], item["ticket_code"], f"WA {wa_num} | {email_to}", f"{webhook_status} / {email_status}", summary, wa_link, mailto_link, ts),
        )
        log_id = cur.lastrowid
        conn.commit()

    if do_webhook or do_smtp:
        def _job():
            wh = "siap_kirim_manual"
            if do_webhook:
                wh = "terkirim_webhook" if _post_webhook(
                    webhook_url,
                    {"ticket_code": item["ticket_code"], "phone": wa_num, "email": email_to, "message": wa_msg},
                ) else "gagal_webhook_fallback_manual"
            em = "siap_mailto"
            if do_smtp:
                em = "terkirim_smtp" if _send_smtp_email(
                    email_to,
                    f"[{item['ticket_code']}] Aduan Baru - {school['short_name']}",
                    wa_msg.replace("*", ""),
                    os.environ.get("SMTP_FROM", email_to),
                ) else "gagal_smtp_fallback_mailto"
            _update_notif_status(log_id, f"{wh} / {em}")
        _enqueue_notif(_job, fallback=_job)
    return {
        "wa_link": wa_link,
        "mailto_link": mailto_link,
        "recipient_wa": wa_num,
        "recipient_email": email_to,
        "status": f"{webhook_status} / {email_status}",
    }


def dispatch_reporter_notification(school: dict, item: dict, reporter_contact: str = "") -> dict:
    is_anon = bool(item.get("is_anonymous"))
    is_guest = bool(item.get("is_guest"))
    contact = reporter_contact or ""

    wa_link = ""
    mailto_link = ""
    recipient_label = "Lacak Tiket Publik (Mode Tamu)" if is_guest else "Kotak Masuk Aplikasi (Anonim UU PDP)"
    channel = "guest_track_pin" if is_guest else "inapp_anonim"

    status_text = item.get("status") or "Diproses"
    note_text = (item.get("staff_note") or "").strip() or "Tim sekolah telah memperbarui progres penanganan aduan Anda."
    summary = f"[{item['ticket_code']}] Tindak Lanjut: {status_text}"
    msg_body = (
        f"*PEMBERITAHUAN TINDAK LANJUT SI-PAKAINGE MONSA - {school['short_name']}*\n"
        f"Kode Tiket: *{item['ticket_code']}*\n"
        f"Kategori: {item['category']}\n"
        f"Status Terbaru: *{status_text}*\n"
        f"Tanggapan Sekolah: {note_text}\n\n"
        f"Silakan buka tab Pantau pada aplikasi SI-PAKAINGE MONSA untuk melihat detail"
        f"{' dan memberi penilaian bintang (1-5).' if status_text == 'Selesai' else '.'}"
    )

    ext_status = "tercatat_untuk_lacak_tamu" if is_guest else "terkirim_kotak_masuk_aplikasi"
    pending = None  # (jenis, ...) -> dikirim async oleh worker setelah log tercatat
    if not is_anon and not is_guest and contact and not contact.endswith(".local"):
        recipient_label = contact
        if "@" in contact:
            channel = "inapp_&_email"
            subj = f"[{item['ticket_code']}] Update Status: {status_text} - SI-PAKAINGE MONSA"
            mailto_link = f"mailto:{urllib.parse.quote(contact)}?subject={urllib.parse.quote(subj)}&body={urllib.parse.quote(msg_body.replace('*', ''))}"
            if os.environ.get("SMTP_HOST", "").strip():
                ext_status = "antre_async"
                pending = ("smtp", subj)
            else:
                ext_status = "terkirim_inapp_siap_mailto"
        else:
            digits = "".join(ch for ch in contact if ch.isdigit())
            if len(digits) >= 8:
                wa_num = normalize_wa_number(contact)
                channel = "inapp_&_whatsapp"
                wa_link = f"https://wa.me/{wa_num}?text={urllib.parse.quote(msg_body)}"
                webhook_url = (school.get("webhook_url") or os.environ.get("MONSA_WEBHOOK_URL") or "").strip()
                if webhook_url:
                    ext_status = "antre_async"
                    pending = ("webhook", webhook_url, wa_num)
                else:
                    ext_status = "terkirim_inapp_siap_wa"

    ts = now_iso()
    with open_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO notification_logs (
                tenant_id, complaint_id, ticket_code, target_user_id, direction,
                channel, recipient, status, summary, staff_note_snapshot, wa_link, mailto_link, is_read, created_at
            )
            VALUES (?, ?, ?, ?, 'to_reporter', ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (school["id"], item["id"], item["ticket_code"], item["user_id"], channel, recipient_label, ext_status, summary, note_text, wa_link, mailto_link, ts),
        )
        log_id = cur.lastrowid
        conn.commit()

    if pending:
        def _job():
            if pending[0] == "smtp":
                ok = _send_smtp_email(
                    contact,
                    pending[1],
                    msg_body.replace("*", ""),
                    os.environ.get("SMTP_FROM", school.get("email") or "sdnungmongisidi1@gmail.com"),
                )
                st = "terkirim_inapp_&_smtp" if ok else "terkirim_inapp_siap_mailto"
            else:
                ok = _post_webhook(
                    pending[1],
                    {"ticket_code": item["ticket_code"], "phone": pending[2], "message": msg_body, "direction": "to_reporter"},
                )
                st = "terkirim_inapp_&_webhook_wa" if ok else "terkirim_inapp_siap_wa"
            _update_notif_status(log_id, st)
        _enqueue_notif(_job, fallback=_job)
    return {
        "is_anonymous_protected": is_anon,
        "recipient": recipient_label,
        "wa_link": wa_link,
        "mailto_link": mailto_link,
        "status": ext_status,
        "summary": summary,
    }


def parse_iso_dt(raw: str):
    txt = (raw or "").strip().replace("T", " ")[:19]
    if not txt:
        return None
    try:
        return datetime.strptime(txt, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _fmt_hours_id(hours_float: float) -> str:
    total_mins = max(0, round(abs(float(hours_float or 0.0)) * 60))
    hrs, mins = divmod(total_mins, 60)
    if hrs >= 24:
        days, rem_h = divmod(hrs, 24)
        return f"{days}h {rem_h}j {mins}m"
    return f"{hrs}j {mins}m"


def compute_complaint_sla(item: dict, sla_hours: int = 24) -> dict:
    sla_h = max(1, int(sla_hours or 24))
    created_dt = parse_iso_dt(item.get("created_at"))
    if not created_dt:
        return {
            "sla_hours": sla_h,
            "sla_state": "aman",
            "is_overdue": False,
            "is_warning": False,
            "elapsed_hours": 0.0,
            "remaining_hours": float(sla_h),
            "overdue_hours": 0.0,
            "unresponded": item.get("status") == "Diterima",
            "badge_text": f"Target SLA <= {sla_h} jam",
        }
    now_dt = datetime.now()
    if item.get("status") == "Selesai":
        end_dt = parse_iso_dt(item.get("resolved_at")) or parse_iso_dt(item.get("updated_at")) or now_dt
        elapsed_h = max(0.0, (end_dt - created_dt).total_seconds() / 3600.0)
        on_time = elapsed_h <= sla_h
        overdue_h = max(0.0, elapsed_h - sla_h)
        badge_text = (
            f"Tuntas {_fmt_hours_id(elapsed_h)} (Memenuhi SLA <={sla_h}j)"
            if on_time
            else f"Tuntas {_fmt_hours_id(elapsed_h)} (Lewat SLA +{_fmt_hours_id(overdue_h)})"
        )
        return {
            "sla_hours": sla_h,
            "sla_state": "selesai_tepat_waktu" if on_time else "selesai_lewat_sla",
            "is_overdue": not on_time,
            "is_warning": False,
            "elapsed_hours": round(elapsed_h, 2),
            "remaining_hours": 0.0,
            "overdue_hours": round(overdue_h, 2),
            "unresponded": False,
            "badge_text": badge_text,
        }
    elapsed_h = max(0.0, (now_dt - created_dt).total_seconds() / 3600.0)
    remaining_h = sla_h - elapsed_h
    warn_threshold = min(6.0, sla_h * 0.25)
    is_overdue = remaining_h <= 0.0
    is_warning = (not is_overdue) and remaining_h <= warn_threshold
    overdue_h = max(0.0, -remaining_h)
    sla_state = "terlambat" if is_overdue else ("kritis" if is_warning else "aman")
    if is_overdue:
        badge_text = f"ALARM TERLAMBAT +{_fmt_hours_id(overdue_h)} (SLA {sla_h}j)"
    elif is_warning:
        badge_text = f"SEGERA! Sisa {_fmt_hours_id(remaining_h)} sebelum batas SLA {sla_h}j"
    else:
        badge_text = f"Sisa {_fmt_hours_id(remaining_h)} (SLA <={sla_h}j)"
    return {
        "sla_hours": sla_h,
        "sla_state": sla_state,
        "is_overdue": is_overdue,
        "is_warning": is_warning,
        "elapsed_hours": round(elapsed_h, 2),
        "remaining_hours": round(max(0.0, remaining_h), 2),
        "overdue_hours": round(overdue_h, 2),
        "unresponded": item.get("status") == "Diterima",
        "badge_text": badge_text,
    }


def enrich_complaint_sla(d: dict, sla_hours: int = 24) -> dict:
    d["sla_info"] = compute_complaint_sla(d, sla_hours)
    return d


IKM_ELEMENT_LABELS = [
    ("u1", "U1 - Persyaratan Pelayanan"),
    ("u2", "U2 - Sistem, Mekanisme & Prosedur"),
    ("u3", "U3 - Waktu Penyelesaian"),
    ("u4", "U4 - Biaya / Tarif (Rp 0 / Gratis)"),
    ("u5", "U5 - Produk Spesifikasi Pelayanan"),
    ("u6", "U6 - Kompetensi Pelaksana"),
    ("u7", "U7 - Perilaku Pelaksana"),
    ("u8", "U8 - Penanganan Pengaduan, Saran & Masukan"),
    ("u9", "U9 - Sarana & Prasarana"),
]


def get_ikm_grade(score: float, count: int) -> tuple:
    if count <= 0:
        return ("-", "Belum Ada Data Responden")
    if score >= 88.31:
        return ("A", "Sangat Baik")
    if score >= 76.61:
        return ("B", "Baik")
    if score >= 65.00:
        return ("C", "Kurang Baik")
    return ("D", "Tidak Baik")


def compute_ikm_summary(conn, tid: int) -> dict:
    rows = [dict(r) for r in conn.execute("SELECT * FROM ikm_surveys WHERE tenant_id = ? ORDER BY id DESC", (tid,)).fetchall()]
    cnt = len(rows)
    elements = []
    if cnt == 0:
        for key, label in IKM_ELEMENT_LABELS:
            elements.append({"key": key, "label": label, "nrr": 0.0, "nrr_tertimbang": 0.0, "konversi": 0.0})
        return {
            "respondent_count": 0,
            "ikm_score": 0.0,
            "grade": "-",
            "predicate": "Belum Ada Data Responden",
            "elements": elements,
            "lowest_element": None,
            "highest_element": None,
        }

    total_weighted = 0.0
    for key, label in IKM_ELEMENT_LABELS:
        avg_u = sum(int(r[key]) for r in rows) / cnt
        weighted = avg_u / 9.0
        total_weighted += weighted
        elements.append({
            "key": key,
            "label": label,
            "nrr": round(avg_u, 3),
            "nrr_tertimbang": round(weighted, 4),
            "konversi": round(avg_u * 25.0, 2),
        })
    ikm_score = round(total_weighted * 25.0, 2)
    grade, predicate = get_ikm_grade(ikm_score, cnt)
    sorted_els = sorted(elements, key=lambda x: x["nrr"])
    return {
        "respondent_count": cnt,
        "ikm_score": ikm_score,
        "grade": grade,
        "predicate": predicate,
        "elements": elements,
        "lowest_element": sorted_els[0],
        "highest_element": sorted_els[-1],
    }


def compute_evaluation_summary(conn, tid: int) -> dict:
    evals = [dict(r) for r in conn.execute("SELECT * FROM service_evaluations WHERE tenant_id = ? ORDER BY id DESC", (tid,)).fetchall()]
    cnt = len(evals)
    avg_app = round(sum(e["app_rating"] for e in evals) / cnt, 2) if cnt else 0.0
    avg_school = round(sum(e["school_response_rating"] for e in evals) / cnt, 2) if cnt else 0.0
    speed_counts = dict(Counter(e["response_speed"] for e in evals))
    clarity_counts = dict(Counter(e["followup_clarity"] for e in evals))
    return {
        "eval_count": cnt,
        "avg_app_rating": avg_app,
        "avg_school_rating": avg_school,
        "speed_breakdown": speed_counts,
        "clarity_breakdown": clarity_counts,
    }


def compute_public_recap(conn, tid: int) -> dict:
    school_row = conn.execute("SELECT sla_hours FROM school_tenants WHERE id = ?", (tid,)).fetchone()
    sla_hours = int(school_row["sla_hours"]) if school_row and school_row["sla_hours"] else 24
    rows = [dict(r) for r in conn.execute("SELECT * FROM complaints WHERE tenant_id = ? ORDER BY created_at DESC", (tid,)).fetchall()]
    total = len(rows)
    done = sum(1 for r in rows if r["status"] == "Selesai")
    processing = total - done
    rentan_count = sum(
        1
        for r in rows
        if r.get("needs_priority_assistance")
        or (r.get("vulnerable_group") and r["vulnerable_group"] not in ("", "Umum (Bukan Kelompok Rentan)"))
    )
    rated = [r["parent_rating"] for r in rows if r.get("parent_rating", 0) > 0]
    avg_rating = round(sum(rated) / len(rated), 2) if rated else 0.0
    completion_pct = round((done / total) * 100, 1) if total else 100.0
    eval_summary = compute_evaluation_summary(conn, tid)
    ikm_summary = compute_ikm_summary(conn, tid)

    sla_list = [compute_complaint_sla(r, sla_hours) for r in rows]
    sla_overdue_count = sum(1 for s, r in zip(sla_list, rows) if r["status"] != "Selesai" and s["is_overdue"])
    sla_warning_count = sum(1 for s, r in zip(sla_list, rows) if r["status"] != "Selesai" and s["is_warning"])
    sla_unresponded_count = sum(1 for r in rows if r["status"] == "Diterima")
    resolved_sla = [s for s, r in zip(sla_list, rows) if r["status"] == "Selesai"]
    resolved_on_time = sum(1 for s in resolved_sla if s["sla_state"] == "selesai_tepat_waktu")
    sla_on_time_pct = round((resolved_on_time / len(resolved_sla)) * 100, 1) if resolved_sla else 100.0
    avg_resolution_hours = round(sum(s["elapsed_hours"] for s in resolved_sla) / len(resolved_sla), 1) if resolved_sla else 0.0

    cat_counts = Counter(r["category"] for r in rows)
    by_category = [
        {
            "category": cat,
            "total": cnt,
            "done": sum(1 for r in rows if r["category"] == cat and r["status"] == "Selesai"),
            "processing": sum(1 for r in rows if r["category"] == cat and r["status"] != "Selesai"),
        }
        for cat, cnt in cat_counts.most_common()
    ]

    month_counts = Counter((r["created_at"] or "")[:7] for r in rows if r.get("created_at"))
    by_month = [{"month": m, "count": month_counts[m]} for m in sorted(month_counts.keys())]

    return {
        "total": total,
        "processing": processing,
        "done": done,
        "completion_pct": completion_pct,
        "rentan_count": rentan_count,
        "rated_count": len(rated),
        "avg_rating": avg_rating,
        "eval_count": eval_summary["eval_count"],
        "avg_app_rating": eval_summary["avg_app_rating"],
        "avg_school_rating": eval_summary["avg_school_rating"],
        "ikm_count": ikm_summary["respondent_count"],
        "ikm_score": ikm_summary["ikm_score"],
        "ikm_grade": ikm_summary["grade"],
        "ikm_predicate": ikm_summary["predicate"],
        "sla_hours": sla_hours,
        "sla_overdue_count": sla_overdue_count,
        "sla_warning_count": sla_warning_count,
        "sla_unresponded_count": sla_unresponded_count,
        "sla_on_time_pct": sla_on_time_pct,
        "avg_resolution_hours": avg_resolution_hours,
        "by_category": by_category,
        "by_month": by_month,
        "updated_at": now_iso(),
    }


def build_monev_markdown(school: dict, recap: dict, complaints: list) -> str:
    lines = [
        "# LAPORAN MONITORING, EVALUASI PENGADUAN & FKP_UPP",
        f"## {school['name']}",
        f"- **NPSN:** {school['npsn']}",
        f"- **Alamat:** {school['address']}",
        f"- **Kepala Sekolah:** {school['principal_name']} (NIP. 198112072007012013)",
        f"- **Email / Kontak:** {school['email']} · {school['hotline']}",
        f"- **Tanggal Cetak Otomatis:** {now_iso()}",
        "",
        "---",
        "",
        "## 1. RINGKASAN KINERJA PENGADUAN (PEKPPP ASPEK 05 & INOVASI SIMPEL 06)",
        "| Indikator | Nilai |",
        "|:---|---:|",
        f"| Total Pengaduan Masuk | {recap['total']} |",
        f"| Pengaduan Selesai | {recap['done']} |",
        f"| Pengaduan Dalam Proses | {recap['processing']} |",
        f"| Persentase Ketuntasan | {recap['completion_pct']}% |",
        f"| Kepatuhan SLA Penanganan (<= {recap.get('sla_hours', 24)} Jam) | {recap.get('sla_on_time_pct', 100)}% (Rata-rata tuntas {recap.get('avg_resolution_hours', 0)} jam) |",
        f"| Aduan Terbuka Melewati SLA / Mendekati Batas | {recap.get('sla_overdue_count', 0)} melewati SLA / {recap.get('sla_warning_count', 0)} kritis |",
        f"| Layanan Prioritas Kelompok Rentan / Inklusi | {recap['rentan_count']} |",
        f"| Rata-Rata Kepuasan Tiket Pengaduan | {recap['avg_rating']} / 5.0 ({recap['rated_count']} responden) |",
        f"| Rata-Rata Penilaian Aplikasi SI-PAKAINGE | {recap.get('avg_app_rating', 0)} / 5.0 ({recap.get('eval_count', 0)} responden) |",
        f"| Rata-Rata Penilaian Respon & Tindak Lanjut Sekolah | {recap.get('avg_school_rating', 0)} / 5.0 ({recap.get('eval_count', 0)} responden) |",
        f"| Indeks Kepuasan Masyarakat (IKM 9 Unsur PermenPAN-RB 14/2017) | {recap.get('ikm_score', 0)} / 100 (Mutu {recap.get('ikm_grade', '-')} - {recap.get('ikm_predicate', '-')}, {recap.get('ikm_count', 0)} responden) |",
        "",
        "## 2. REKAPITULASI PER KATEGORI PENGADUAN",
        "| No | Kategori | Masuk | Selesai | Diproses |",
        "|:--:|:---|---:|---:|---:|",
    ]
    def md_cell(v) -> str:
        return str(v or "-").replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip() or "-"

    for idx, c in enumerate(recap["by_category"], 1):
        lines.append(f"| {idx} | {md_cell(c['category'])} | {c['total']} | {c['done']} | {c['processing']} |")

    lines.extend([
        "",
        "## 3. DAFTAR TINDAK LANJUT PENGADUAN (IDENTITAS PELAPOR ANONIM DILINDUNGI UU PDP)",
        "| Kode Tiket | Tanggal | Kategori | Prioritas Rentan | Unit Penangan | Status | Catatan Tindak Lanjut |",
        "|:---|:---|:---|:---|:---|:---|:---|",
    ])
    for r in complaints:
        vg = r.get("vulnerable_group") or ("Prioritas" if r.get("needs_priority_assistance") else "Umum")
        lines.append(
            f"| {md_cell(r['ticket_code'])} | {(r['created_at'] or '')[:10]} | {md_cell(r['category'])} | {md_cell(vg)} | {md_cell(r['routed_to'])} | {md_cell(r['status'])} | {md_cell(r.get('staff_note') or '-')} |"
        )

    lines.extend([
        "",
        "## 4. KANAL PENGADUAN RESMI TERINTEGRASI",
        "1. **Aplikasi Digital Sekolah:** SI-PAKAINGE MONSA (Modul Inovasi SIMPEL)",
        "2. **SP4N-LAPOR! Nasional:** https://www.lapor.go.id",
        f"3. **WhatsApp & Telepon Sekolah:** {school['hotline']}",
        f"4. **Email Resmi Sekolah:** {school['email']}",
        "5. **Sarana Fisik Sekolah:** Kotak Saran & Ruang Konsultasi Prioritas Ramah Kelompok Rentan",
        "",
        "---",
        f"Makassar, {now_iso()[:10]}",
        f"**Kepala {school['name']}**,",
        "",
        f"**{school['principal_name']}**",
        "NIP. 198112072007012013",
    ])
    return "\n".join(lines)


class SikolaHandler(BaseHTTPRequestHandler):
    server_version = "SiPakaingeMonsaServer/2.2.3"

    # K4: nilai rahasia tidak boleh pernah masuk ke log/jurnal.
    _SENSITIVE_QS_RE = re.compile(r"(?i)\b(pin|token|secret|password|api_key)=[^&\s\"']*")

    @classmethod
    def _redact(cls, text: str) -> str:
        return cls._SENSITIVE_QS_RE.sub(lambda m: f"{m.group(1)}=***", text)

    def log_message(self, format, *args):
        # Hanya baris permintaan yang dicatat; query string dirahasiakan agar
        # PIN tiket tamu (fitur tautan 1-klik) tidak bocor ke journalctl/stdout.
        msg = self._redact(format % args)
        sys.stdout.write(f"[MONSA-LAPOR] {self.address_string()} - {msg}\n")
        sys.stdout.flush()

    def send_security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "microphone=(self), camera=(self)")
        # HSTS: browser hanya menyimpan bila diakses via HTTPS (mis. lewat nginx),
        # diabaikan secara aman bila backend diakses langsung tanpa TLS.
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    # CSP hanya untuk halaman HTML (bukan respons API JSON): bundle Vite memakai
    # aset same-origin, foto/audio base64 (data:), dan unduh blob — tanpa font
    # atau skrip eksternal, sehingga kebijakan bisa ketat.
    CSP_POLICY = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; media-src 'self' data: blob:; "
        "connect-src 'self'; font-src 'self'; worker-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    )

    def send_csp_header(self):
        self.send_header("Content-Security-Policy", self.CSP_POLICY)

    # Selalu diizinkan: APK Capacitor & halaman lokal saat pengembangan.
    ALWAYS_ALLOWED_ORIGINS = {"capacitor://localhost", "https://localhost", "http://localhost"}

    def send_cors_headers(self):
        """CORS default KETAT (K6): tanpa izin lintas-origin kecuali di-whitelist.

        Tanpa MONSA_CORS_ORIGINS, server tidak mengirim Access-Control-Allow-Origin
        sama sekali sehingga hanya same-origin yang dapat membaca respons API.
        """
        allowed_raw = os.environ.get("MONSA_CORS_ORIGINS", "").strip()
        req_origin = (self.headers.get("Origin") or "").strip().rstrip("/")
        if not req_origin:
            # Permintaan non-browser / same-origin tidak membutuhkan header CORS.
            return

        allow_list = set()
        allow_any = False
        for item in allowed_raw.split(","):
            item = item.strip().rstrip("/")
            if item == "*":
                allow_any = True
            elif item:
                allow_list.add(item)
        allow_list.update(self.ALWAYS_ALLOWED_ORIGINS)

        if allow_any:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif req_origin in allow_list:
            self.send_header("Access-Control-Allow-Origin", req_origin)
            self.send_header("Vary", "Origin")
        else:
            # Origin tak dikenal: sengaja tidak mengklaim izin lintas-origin.
            return

        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-Code, X-Monsa-Token")

    def send_json(self, status: int, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_security_headers()
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_text_download(self, status: int, text: str, ctype: str, filename: str):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # Proxy yang diizinkan menyetel header IP asal. Loopback = nginx pada host yang sama.
    TRUSTED_PROXIES_DEFAULT = ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _trusted_proxies(self) -> set:
        proxies = set(self.TRUSTED_PROXIES_DEFAULT)
        extra = os.environ.get("MONSA_TRUSTED_PROXIES", "").strip()
        if extra:
            proxies.update(p.strip() for p in extra.split(",") if p.strip())
        return proxies

    def get_client_ip(self) -> str:
        """K3: header IP asal hanya dipercaya bila datang dari proxy tepercaya.

        - X-Real-IP diprioritaskan karena nginx menimpanya dengan $remote_addr
          sehingga tidak dapat dipalsukan klien.
        - X-Forwarded-For diambil dari EKOR, bukan awal: proxy meng-append IP klien
          asli ke belakang rantai, jadi entri PERTAMA justru bisa dibuat penyerang
          (ini sumber bypass rate-limit sebelumnya).
        - Akses langsung (bukan lewat proxy) -> semua header diabaikan.
        """
        peer = self.client_address[0] if self.client_address else "unknown"
        if peer not in self._trusted_proxies():
            return peer

        real_ip = (self.headers.get("X-Real-IP") or "").strip()
        if real_ip:
            return real_ip

        xff = (self.headers.get("X-Forwarded-For") or "").strip()
        if xff:
            last = xff.split(",")[-1].strip()
            if last:
                return last
        return peer

    def read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ValueError("Header Content-Length tidak valid.")
        if length <= 0:
            return {}
        if length > 2_500_000:
            raise PayloadTooLargeError("Payload terlalu besar (maksimal 2.5 MB).")
        raw = self.rfile.read(length).decode("utf-8")
        if not raw:
            return {}
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Body JSON harus berupa objek ({...}).")
        return data

    def get_tenant(self, conn, qs=None):
        code = (self.headers.get("X-Tenant-Code") or "").strip()
        if not code and qs:
            code = (qs.get("tenant", [""])[0]).strip()
        if code:
            row = conn.execute("SELECT * FROM school_tenants WHERE tenant_code = ?", (code,)).fetchone()
            if row:
                return dict(row)
        row = conn.execute("SELECT * FROM school_tenants WHERE is_primary_owner = 1 ORDER BY id ASC LIMIT 1").fetchone()
        return dict(row)

    def get_current_user(self):
        monsa_tok = (self.headers.get("X-Monsa-Token") or "").strip()
        if monsa_tok:
            u = verify_token(monsa_tok)
            if u:
                return u
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return verify_token(auth[7:].strip())
        return None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_HEAD(self):
        req_path = urlparse(self.path).path
        clean_path = req_path.split("?", 1)[0].lstrip("/") or "index.html"
        web_root = os.path.abspath(WEB_BUNDLE_DIR)
        full_path = os.path.abspath(os.path.join(web_root, clean_path))
        if os.path.commonpath([web_root, full_path]) != web_root or not os.path.exists(full_path) or os.path.isdir(full_path):
            full_path = os.path.join(web_root, "index.html")
        ctype, _ = mimetypes.guess_type(full_path)
        self.send_response(200)
        self.send_header("Content-Type", ctype or "text/html; charset=utf-8")
        if os.path.basename(full_path) in {"sw.js", "index.html"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_security_headers()
        if (ctype or "text/html").startswith("text/html"):
            self.send_csp_header()
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path == "/api/health":
            return self.send_json(200, {"status": "ok", "owner": "UPTD SPF SD Negeri Unggulan Mongisidi 1", "version": APP_VERSION, "version_code": APP_VERSION_CODE, "time": now_iso()})
        if path == "/api/app-info":
            return self.send_json(200, build_app_info())
        if path == "/api/bootstrap":
            return self.handle_bootstrap(qs)
        if path == "/api/public-recap":
            with open_conn() as conn:
                school = self.get_tenant(conn, qs)
                recap = compute_public_recap(conn, school["id"])
            return self.send_json(200, {"school": sanitize_school(school, False), "recap": recap})
        if path == "/api/public/fkp":
            return self.handle_get_public_fkp(qs)
        if path == "/api/notifications":
            return self.handle_get_notifications(qs)
        if path == "/api/reports/monev":
            return self.handle_export_monev(qs)
        if path == "/api/tenants":
            user = self.get_current_user()
            if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
                return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
            with open_conn() as conn:
                rows = [sanitize_school(r, False) for r in conn.execute("SELECT * FROM school_tenants ORDER BY id ASC").fetchall()]
            return self.send_json(200, {"items": rows})
        if path == "/api/auth/me":
            user = self.get_current_user()
            if not user:
                return self.send_json(401, {"error": "Belum login."})
            return self.send_json(200, {"user": user})
        if path == "/api/complaints":
            return self.handle_get_complaints(qs)
        if path == "/api/evaluations":
            return self.handle_get_evaluations(qs)
        if path == "/api/ikm":
            return self.handle_get_ikm(qs)
        if path == "/api/ikm/rtl":
            return self.handle_get_ikm_rtl(qs)
        if path == "/api/admin/users":
            return self.handle_get_users(qs)
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Endpoint tidak ditemukan."})
        return self.serve_static(path)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        try:
            body = self.read_json_body()
        except PayloadTooLargeError as e:
            return self.send_json(413, {"error": str(e)})
        except Exception:
            return self.send_json(400, {"error": "JSON tidak valid."})

        if path == "/api/auth/register":
            return self.handle_register(body, qs)
        if path == "/api/auth/login":
            return self.handle_login(body, qs)
        if path == "/api/auth/change-password":
            return self.handle_change_password(body)
        if path == "/api/auth/demo-switch":
            return self.handle_demo_switch(body)
        if path.startswith("/api/admin/users/") and path.endswith("/reset-password"):
            return self.handle_admin_reset_password(path.strip("/").split("/")[3], body)
        if path == "/api/complaints":
            return self.handle_create_complaint(body, qs)
        if path == "/api/complaints/guest":
            return self.handle_create_guest_complaint(body, qs)
        if path == "/api/complaints/guest-track":
            return self.handle_guest_track(body, qs)
        if path == "/api/complaints/guest-rate":
            return self.handle_guest_rate(body, qs)
        if path == "/api/evaluations":
            return self.handle_create_evaluation(body, qs)
        if path == "/api/ikm":
            return self.handle_create_ikm(body, qs)
        if path == "/api/ikm/rtl":
            return self.handle_create_ikm_rtl(body, qs)
        if path == "/api/public/fkp/feedback":
            return self.handle_submit_fkp_feedback(body, qs)
        if path == "/api/public/fkp/polls":
            return self.handle_create_fkp_poll(body, qs)
        if path == "/api/public/transparency":
            return self.handle_upsert_transparency(None, body, qs)
        if path == "/api/tenants":
            return self.handle_create_tenant(body)
        if path == "/api/notifications/read":
            return self.handle_mark_notifications_read(body, qs)
        if path == "/api/school-profile":
            return self.handle_update_school_profile(body, qs)
        if path == "/api/chat":
            return self.handle_chat(body, qs)
        return self.send_json(404, {"error": "Endpoint POST tidak ditemukan."})

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        try:
            body = self.read_json_body()
        except PayloadTooLargeError as e:
            return self.send_json(413, {"error": str(e)})
        except Exception:
            return self.send_json(400, {"error": "JSON tidak valid."})

        if path == "/api/school-profile":
            return self.handle_update_school_profile(body, qs)
        return self.send_json(404, {"error": "Endpoint PUT tidak ditemukan."})

    def do_PATCH(self):
        path = urlparse(self.path).path
        try:
            body = self.read_json_body()
        except PayloadTooLargeError as e:
            return self.send_json(413, {"error": str(e)})
        except Exception:
            return self.send_json(400, {"error": "JSON tidak valid."})

        if path.startswith("/api/complaints/"):
            return self.handle_update_complaint(path.split("/")[-1], body)
        if path.startswith("/api/ikm/rtl/"):
            return self.handle_update_ikm_rtl(path.split("/")[-1], body)
        if path.startswith("/api/public/transparency/"):
            return self.handle_upsert_transparency(path.split("/")[-1], body, parse_qs(urlparse(self.path).query))
        if path.startswith("/api/admin/users/") and path.endswith("/verify"):
            return self.handle_verify_user(path.strip("/").split("/")[3], body)
        return self.send_json(404, {"error": "Endpoint PATCH tidak ditemukan."})

    def handle_bootstrap(self, qs):
        user = self.get_current_user()
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            is_tenant_admin = bool(
                user and user["tenant_id"] == tid and user["role"] == "admin_sekolah" and user["verification_status"] == "verified"
            )
            demo_disabled = os.environ.get("MONSA_DISABLE_DEMO", "") == "1"
            if demo_disabled:
                demo_accounts = []
            else:
                demo_accounts = [
                    sanitize_user(r)
                    for r in conn.execute(
                        "SELECT * FROM users WHERE tenant_id = ? AND role != 'guest_reporter' ORDER BY id ASC LIMIT 4",
                        (tid,),
                    ).fetchall()
                ]
            kb = [dict(r) for r in conn.execute("SELECT * FROM knowledge_base WHERE tenant_id = ? ORDER BY id ASC", (tid,)).fetchall()]
            recap = compute_public_recap(conn, tid)
            tenants_count = conn.execute("SELECT COUNT(*) FROM school_tenants").fetchone()[0]
        return self.send_json(
            200,
            {
                "school": sanitize_school(school, is_tenant_admin),
                "demo_accounts": demo_accounts,
                "knowledge_base": kb,
                "stats": {
                    "total": recap["total"],
                    "processing": recap["processing"],
                    "done": recap["done"],
                    "tenants_count": tenants_count,
                },
                "public_recap": recap,
            },
        )

    def handle_get_notifications(self, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk untuk melihat notifikasi."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            if user["tenant_id"] != school["id"]:
                return self.send_json(403, {"error": "Akses ditolak: akun Anda terdaftar di tenant sekolah lain."})
            is_staff = user["role"] in ("tppk_piket", "admin_sekolah") and user["verification_status"] == "verified"
            if is_staff:
                rows = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT * FROM notification_logs WHERE tenant_id = ? AND direction = 'to_school' ORDER BY id DESC LIMIT 20",
                        (school["id"],),
                    ).fetchall()
                ]
                unread_count = len([r for r in rows if not r.get("is_read")])
            else:
                rows = [
                    dict(r)
                    for r in conn.execute(
                        "SELECT * FROM notification_logs WHERE tenant_id = ? AND direction = 'to_reporter' AND target_user_id = ? ORDER BY id DESC LIMIT 20",
                        (school["id"], user["id"]),
                    ).fetchall()
                ]
                unread_count = sum(1 for r in rows if not r.get("is_read"))
        return self.send_json(200, {"items": rows, "unread_count": unread_count, "scope": "staff" if is_staff else "reporter"})

    def handle_mark_notifications_read(self, body, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk."})
        nid = body.get("id")
        nid_int = None
        if nid:
            try:
                nid_int = int(nid)
            except ValueError:
                return self.send_json(400, {"error": "ID notifikasi tidak valid."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            if user["tenant_id"] != school["id"]:
                return self.send_json(403, {"error": "Akses ditolak: lintas tenant tidak diizinkan."})
            is_staff = user["role"] in ("tppk_piket", "admin_sekolah") and user["verification_status"] == "verified"
            if nid_int is not None:
                if is_staff:
                    conn.execute(
                        "UPDATE notification_logs SET is_read = 1 WHERE id = ? AND tenant_id = ? AND (direction = 'to_school' OR target_user_id = ?)",
                        (nid_int, school["id"], user["id"]),
                    )
                else:
                    conn.execute(
                        "UPDATE notification_logs SET is_read = 1 WHERE id = ? AND tenant_id = ? AND target_user_id = ?",
                        (nid_int, school["id"], user["id"]),
                    )
            else:
                if is_staff:
                    conn.execute(
                        "UPDATE notification_logs SET is_read = 1 WHERE tenant_id = ? AND (direction = 'to_school' OR (direction = 'to_reporter' AND target_user_id = ?))",
                        (school["id"], user["id"]),
                    )
                else:
                    conn.execute(
                        "UPDATE notification_logs SET is_read = 1 WHERE tenant_id = ? AND target_user_id = ? AND direction = 'to_reporter'",
                        (school["id"], user["id"]),
                    )
            conn.commit()
        return self.send_json(200, {"ok": True})

    def handle_export_monev(self, qs):
        user = self.get_current_user()
        if not user or user["role"] not in ("tppk_piket", "admin_sekolah") or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Tim Pengelola / Kepala Sekolah terverifikasi untuk mengekspor Laporan Monev & FKP."})
        fmt = (qs.get("format", ["json"])[0] or "json").lower()
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: Anda tidak berwenang mengekspor data sekolah lain."})
            recap = compute_public_recap(conn, tid)
            rows = [dict(r) for r in conn.execute("SELECT * FROM complaints WHERE tenant_id = ? ORDER BY id DESC", (tid,)).fetchall()]
        for r in rows:
            mask_anonymous_complaint(r, viewer_user_id=None)

        safe_school = sanitize_school(school, False)
        md_text = build_monev_markdown(safe_school, recap, rows)
        if fmt == "md":
            return self.send_text_download(200, md_text, "text/markdown", "05B_LAPORAN_MONEV_FKP_MONSA_2026.md")
        if fmt == "csv":
            def safe_csv_cell(val):
                s = "" if val is None else str(val)
                if s and s[0] in ("=", "+", "-", "@", "\t", "\r"):
                    # Keep negative numeric values intact, neutralize formula expressions
                    is_neg_num = s.startswith("-") and s[1:].replace(".", "", 1).isdigit()
                    if not is_neg_num:
                        s = "'" + s
                return s

            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(["Kode Tiket", "Tanggal", "Kategori", "Urgensi", "Kelompok Rentan", "Prioritas Pendampingan", "Ada Foto Bukti", "Unit Penangan", "Status", "Status SLA", "Durasi (Jam)", "Rating", "Catatan Tindak Lanjut"])
            for r in rows:
                sla = compute_complaint_sla(r, school.get("sla_hours", 24))
                w.writerow([safe_csv_cell(x) for x in [
                    r["ticket_code"], (r["created_at"] or "")[:10], r["category"], r["urgency"],
                    r.get("vulnerable_group") or "Umum",
                    "Ya" if r.get("needs_priority_assistance") else "Tidak",
                    "Ya" if r.get("photo_data") else "Tidak",
                    r["routed_to"], r["status"], sla["sla_state"], sla["elapsed_hours"], r.get("parent_rating") or "", r.get("staff_note") or "",
                ]])
            return self.send_text_download(200, buf.getvalue(), "text/csv", "05B_REKAP_PENGADUAN_MONSA_2026.csv")

        compact_rows = []
        for r in rows:
            sla = compute_complaint_sla(r, school.get("sla_hours", 24))
            compact_rows.append({
                "ticket_code": r["ticket_code"],
                "created_at": (r["created_at"] or "")[:10],
                "is_anonymous": bool(r.get("is_anonymous")),
                "reporter_display_name": r.get("reporter_display_name") or "-",
                "category": r["category"],
                "urgency": r["urgency"],
                "vulnerable_group": r.get("vulnerable_group") or "Umum",
                "needs_priority_assistance": bool(r.get("needs_priority_assistance")),
                "has_photo": bool(r.get("photo_data")),
                "routed_to": r["routed_to"],
                "status": r["status"],
                "sla_state": sla["sla_state"],
                "sla_badge": sla["badge_text"],
                "elapsed_hours": sla["elapsed_hours"],
                "parent_rating": r.get("parent_rating") or "",
                "description": (r.get("description") or "")[:500],
                "staff_note": r.get("staff_note") or "",
            })
        return self.send_json(200, {"school": safe_school, "recap": recap, "markdown": md_text, "complaints": compact_rows})

    def handle_update_school_profile(self, body, qs):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Hanya Kepala Sekolah / Admin Sekolah terverifikasi yang dapat mengubah profil sekolah."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            if user["tenant_id"] != school["id"]:
                return self.send_json(403, {"error": "Akses ditolak: Anda tidak berwenang mengubah profil sekolah lain."})
            wh = (body.get("webhook_url") if "webhook_url" in body else (school.get("webhook_url") or "")).strip()
            if not is_safe_https_webhook(wh):
                return self.send_json(400, {"error": "URL Webhook harus menggunakan https:// dan bukan alamat jaringan internal."})
            p_photo = (body.get("principal_photo") if "principal_photo" in body else (school.get("principal_photo") or "")).strip()
            if p_photo and (
                not (p_photo.startswith("data:image/jpeg;") or p_photo.startswith("data:image/png;") or p_photo.startswith("data:image/webp;"))
                or len(p_photo) > 950000
            ):
                return self.send_json(400, {"error": "Foto Kepala Sekolah harus berformat JPG/PNG/WebP dengan ukuran maksimal 900 KB."})
            w_title = (body.get("welcome_title") if "welcome_title" in body else (school.get("welcome_title") or "Sambutan Kepala Sekolah")).strip()
            w_msg = (body.get("welcome_message") if "welcome_message" in body else (school.get("welcome_message") or "")).strip()
            try:
                sla = max(1, min(720, int(body.get("sla_hours") or school["sla_hours"])))
            except ValueError:
                sla = school["sla_hours"]
            conn.execute(
                """
                UPDATE school_tenants
                SET name = ?, short_name = ?, level = ?, npsn = ?, district = ?, address = ?,
                    principal_name = ?, principal_photo = ?, welcome_title = ?, welcome_message = ?,
                    tppk_lead = ?, hotline = ?, email = ?,
                    notify_whatsapp = ?, notify_email = ?, webhook_url = ?, sla_hours = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    (body.get("name") or school["name"]).strip(),
                    (body.get("short_name") or body.get("name") or school["short_name"]).strip(),
                    (body.get("level") or school["level"]).strip(),
                    (body.get("npsn") or school["npsn"]).strip(),
                    (body.get("district") or school["district"]).strip(),
                    (body.get("address") or school["address"]).strip(),
                    (body.get("principal_name") or school["principal_name"]).strip(),
                    p_photo,
                    w_title or "Sambutan Kepala Sekolah",
                    w_msg,
                    (body.get("tppk_lead") or school["tppk_lead"]).strip(),
                    (body.get("hotline") or school["hotline"]).strip(),
                    (body.get("email") or school["email"]).strip(),
                    (body.get("notify_whatsapp") or school.get("notify_whatsapp") or "6281355982195").strip(),
                    (body.get("notify_email") or school.get("notify_email") or school["email"]).strip(),
                    wh,
                    sla,
                    now_iso(),
                    school["id"],
                ),
            )
            conn.commit()
            updated = dict(conn.execute("SELECT * FROM school_tenants WHERE id = ?", (school["id"],)).fetchone())
        return self.send_json(200, {"school": sanitize_school(updated, True)})

    def handle_create_tenant(self, body):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Hanya Admin Sekolah terverifikasi yang dapat membuat profil tenant sekolah baru."})
        code = (body.get("tenant_code") or "").strip().upper()
        name = (body.get("name") or "").strip()
        npsn = (body.get("npsn") or "").strip()
        if not code or not name or not npsn:
            return self.send_json(400, {"error": "Kode Tenant, Nama Sekolah, dan NPSN wajib diisi."})
        admin_pw = (body.get("admin_password") or "").strip()
        if admin_pw and len(admin_pw) < 8:
            return self.send_json(400, {"error": "Kata sandi admin tenant baru minimal 8 karakter."})
        if not admin_pw:
            admin_pw = secrets.token_urlsafe(10)
        with open_conn() as conn:
            if conn.execute("SELECT 1 FROM school_tenants WHERE tenant_code = ?", (code,)).fetchone():
                return self.send_json(409, {"error": f"Kode tenant {code} sudah terdaftar."})
            ts = now_iso()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO school_tenants (
                    tenant_code, npsn, name, short_name, level, district, address,
                    principal_name, tppk_lead, hotline, email, sla_hours,
                    is_inclusive, is_zona_integritas, is_primary_owner, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 24, 0, 1, 0, ?)
                """,
                (
                    code, npsn, name, name, body.get("level") or "SD", body.get("district") or "Kota Makassar",
                    body.get("address") or "Kota Makassar", body.get("principal_name") or "Kepala Sekolah",
                    body.get("tppk_lead") or "Ketua Tim TPPK", body.get("hotline") or "-",
                    body.get("email") or "-", ts,
                ),
            )
            new_tid = cur.lastrowid
            cur.execute(
                """
                INSERT INTO users (tenant_id, full_name, phone_or_email, password_hash, role, bio_note, verification_status, token_version, created_at)
                VALUES (?, ?, ?, ?, 'admin_sekolah', 'Admin Sekolah Baru', 'verified', 1, ?)
                """,
                (new_tid, f"Admin {name}", f"admin@{code.lower()}.sch.id", hash_pw(admin_pw), ts),
            )
            seed_tenant_defaults(cur, new_tid, ts)
            conn.commit()
            row = dict(conn.execute("SELECT * FROM school_tenants WHERE id = ?", (new_tid,)).fetchone())
        return self.send_json(201, {"tenant": row, "initial_admin_email": f"admin@{code.lower()}.sch.id", "initial_admin_password": admin_pw})

    def handle_register(self, body, qs):
        client_ip = self.get_client_ip()
        if not check_and_record_ip_rate_limit("register", client_ip, 10, 600):
            return self.send_json(429, {"error": "Terlalu banyak pendaftaran akun dari perangkat ini. Silakan tunggu beberapa menit."})
        full_name = (body.get("full_name") or "").strip()[:120]
        phone_or_email = (body.get("phone_or_email") or "").strip()[:120]
        password = (body.get("password") or "").strip()
        role = (body.get("role") or "orang_tua").strip()
        student_name = (body.get("student_name") or "").strip()[:120]
        student_class = (body.get("student_class") or "").strip()[:60]
        bio_note = (body.get("bio_note") or "").strip()[:300]

        if not full_name or not phone_or_email:
            return self.send_json(400, {"error": "Nama lengkap dan No. HP/Email wajib diisi."})
        if len(password) < 6:
            return self.send_json(400, {"error": "Kata sandi wajib diisi minimal 6 karakter."})
        if role not in {"orang_tua", "siswa", "tppk_piket", "admin_sekolah"}:
            return self.send_json(400, {"error": "Peran tidak valid."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if conn.execute("SELECT 1 FROM users WHERE tenant_id = ? AND phone_or_email = ?", (tid, phone_or_email)).fetchone():
                return self.send_json(409, {"error": "No. HP atau Email sudah terdaftar di sekolah ini."})

            v_status = "verified" if role in ("orang_tua", "siswa") else "pending"
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO users (
                    tenant_id, full_name, phone_or_email, password_hash, role, student_name,
                    student_class, bio_note, verification_status, token_version, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (tid, full_name, phone_or_email, hash_pw(password), role, student_name, student_class, bio_note, v_status, now_iso()),
            )
            uid = cur.lastrowid
            conn.commit()
            user = sanitize_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone())
        return self.send_json(201, {"token": create_token(uid, role, tid, 1), "user": user})

    def handle_login(self, body, qs):
        ident = (body.get("phone_or_email") or "").strip()
        pw = (body.get("password") or "").strip()
        client_ip = self.get_client_ip()
        rl_key = f"{client_ip}::{ident.lower()}"
        if is_login_rate_limited(rl_key):
            return self.send_json(429, {"error": "Terlalu banyak percobaan masuk gagal. Silakan coba lagi dalam 5 menit."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            row = conn.execute("SELECT * FROM users WHERE tenant_id = ? AND phone_or_email = ?", (school["id"], ident)).fetchone()
            if not row or row["role"] == "guest_reporter" or not verify_pw(pw, row["password_hash"]):
                record_failed_login(rl_key)
                return self.send_json(401, {"error": "No. HP/Email atau kata sandi salah."})
            if row["verification_status"] == "rejected":
                return self.send_json(403, {"error": "Akun ini dinonaktifkan oleh Kepala Sekolah / Admin."})
            if needs_rehash(row["password_hash"]):
                conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_pw(pw), row["id"]))
                conn.commit()
            clear_failed_login(rl_key)
            tv = int(row["token_version"] if "token_version" in row.keys() and row["token_version"] is not None else 1)
            u = sanitize_user(row)
        return self.send_json(200, {"token": create_token(u["id"], u["role"], u["tenant_id"], tv), "user": u})

    def handle_change_password(self, body):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk terlebih dahulu."})
        old_pw = (body.get("old_password") or "").strip()
        new_pw = (body.get("new_password") or "").strip()
        if not old_pw or len(new_pw) < 6:
            return self.send_json(400, {"error": "Kata sandi lama wajib diisi dan kata sandi baru minimal 6 karakter."})
        with open_conn() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            if not row or not verify_pw(old_pw, row["password_hash"]):
                return self.send_json(400, {"error": "Kata sandi lama tidak sesuai."})
            new_tv = int(row["token_version"] if "token_version" in row.keys() and row["token_version"] is not None else 1) + 1
            conn.execute("UPDATE users SET password_hash = ?, token_version = ? WHERE id = ?", (hash_pw(new_pw), new_tv, user["id"]))
            conn.commit()
        return self.send_json(200, {
            "ok": True,
            "token": create_token(user["id"], user["role"], user["tenant_id"], new_tv),
            "message": "Kata sandi berhasil diperbarui.",
        })

    def handle_demo_switch(self, body):
        if os.environ.get("MONSA_DISABLE_DEMO", "") == "1":
            return self.send_json(403, {"error": "Mode demo dinonaktifkan pada server produksi."})
        # K2: tanpa guard ini endpoint menghasilkan token admin tanpa autentikasi,
        # yaitu bypass total otorisasi. Pemanggil di frontend sudah mengirim token.
        caller = self.get_current_user()
        if not caller or caller["role"] != "admin_sekolah" or caller["verification_status"] != "verified":
            return self.send_json(
                403,
                {"error": "Hanya Kepala Sekolah / Admin terverifikasi yang dapat memakai pergantian cepat akun demo."},
            )
        client_ip = self.get_client_ip()
        if not check_and_record_ip_rate_limit("demo_switch", client_ip, 30, 300):
            return self.send_json(429, {"error": "Terlalu banyak pergantian akun demo dalam waktu singkat."})
        try:
            uid = int(body.get("user_id") or 0)
        except ValueError:
            return self.send_json(400, {"error": "ID akun tidak valid."})
        with open_conn() as conn:
            primary = conn.execute("SELECT id, tenant_code FROM school_tenants WHERE is_primary_owner = 1 ORDER BY id ASC LIMIT 1").fetchone()
            demo_ids = {
                r[0]
                for r in conn.execute(
                    "SELECT id FROM users WHERE tenant_id = ? AND role != 'guest_reporter' ORDER BY id ASC LIMIT 4",
                    (primary["id"],),
                ).fetchall()
            }
            if uid not in demo_ids:
                return self.send_json(403, {"error": "Switch cepat hanya diizinkan untuk 4 akun demo bawaan."})
            row = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            return self.send_json(404, {"error": "Akun tidak ditemukan."})
        tv = int(row["token_version"] if "token_version" in row.keys() and row["token_version"] is not None else 1)
        u = sanitize_user(row)
        return self.send_json(200, {"token": create_token(u["id"], u["role"], u["tenant_id"], tv), "user": u, "tenant_code": primary["tenant_code"]})

    def handle_get_complaints(self, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk untuk melihat pengaduan."})

        def _int_param(name, default):
            try:
                return int((qs.get(name) or [default])[0])
            except (TypeError, ValueError):
                return default

        page = max(1, _int_param("page", 1))
        limit_req = _int_param("limit", 100)
        fetch_all = (qs.get("all") or [""])[0] == "1"
        limit = None if fetch_all else min(max(1, limit_req), 200)
        offset = 0 if limit is None else (page - 1) * limit

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: akun Anda terdaftar di tenant sekolah lain."})
            is_staff = user["role"] in ("tppk_piket", "admin_sekolah") and user["verification_status"] == "verified"
            if is_staff:
                where, args = "tenant_id = ?", (tid,)
                order = """
                    ORDER BY
                        CASE WHEN urgency = 'Darurat Anak' AND status != 'Selesai' THEN 1 ELSE 0 END DESC,
                        needs_priority_assistance DESC,
                        id DESC
                """
            else:
                where, args = "tenant_id = ? AND user_id = ?", (tid, user["id"])
                order = "ORDER BY id DESC"
            total = conn.execute(f"SELECT COUNT(*) FROM complaints WHERE {where}", args).fetchone()[0]
            sql = f"SELECT * FROM complaints WHERE {where} {order}"
            sql_args = list(args)
            if limit is not None:
                sql += " LIMIT ? OFFSET ?"
                sql_args.extend([limit, offset])
            rows = conn.execute(sql, sql_args).fetchall()
        items = [enrich_complaint_sla(mask_anonymous_complaint(dict(r), user["id"]), school.get("sla_hours", 24)) for r in rows]
        return self.send_json(
            200,
            {
                "items": items,
                "total": total,
                "page": page,
                "limit": limit if limit is not None else total,
                "has_more": (offset + len(items)) < total,
            },
        )

    def handle_create_complaint(self, body, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk sebelum mengirim pengaduan."})
        category = (body.get("category") or "").strip()[:100]
        urgency = (body.get("urgency") or "Penting").strip()[:40]
        location_detail = (body.get("location_detail") or "").strip()[:200]
        description = (body.get("description") or "").strip()[:4000]
        photo_data = (body.get("photo_data") or "").strip()
        audio_evidence = (body.get("audio_evidence") or "").strip()
        is_anonymous = 1 if body.get("is_anonymous", True) else 0
        student_info = (body.get("student_info") or "").strip()[:120]
        is_offline_synced = 1 if body.get("is_offline_synced") else 0
        vulnerable_group = (body.get("vulnerable_group") or "").strip()[:120]
        disability_type = (body.get("disability_type") or "").strip()[:60]
        special_need_note = (body.get("special_need_note") or "").strip()[:300]
        child_mode = 1 if body.get("child_mode") else 0
        raw_impacts = body.get("impact_tags") or ""
        if isinstance(raw_impacts, list):
            impact_tags = ", ".join(str(x).strip() for x in raw_impacts if str(x).strip())[:200]
        else:
            impact_tags = str(raw_impacts).strip()[:200]
        needs_priority = 1 if (
            body.get("needs_priority_assistance")
            or disability_type
            or (vulnerable_group and vulnerable_group != "Umum (Bukan Kelompok Rentan)")
        ) else 0

        if not description and audio_evidence:
            description = "[Lampiran Pesan Suara Pelapor]"
        if not category or not description:
            return self.send_json(400, {"error": "Kategori dan uraian keluhan (atau pesan suara) wajib diisi."})
        if not is_valid_image_data(photo_data):
            return self.send_json(400, {"error": "Format foto harus JPG/PNG/WebP dengan ukuran terkompresi maksimal 900 KB."})
        if not is_valid_audio_data(audio_evidence):
            return self.send_json(400, {"error": "Format pesan suara tidak valid atau melebihi batas 700 KB."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: Anda hanya dapat melapor ke sekolah tempat akun terdaftar."})
            prefix = school["tenant_code"].split("-")[0]

            display_name = "Pelapor Anonim (Dilindungi UU PDP)" if is_anonymous else user["full_name"]
            if is_anonymous and not student_info:
                student_info = "Disamarkan (Anonim)"
            routed_to = route_category(category, bool(needs_priority))

            with TICKET_LOCK:
                code = next_ticket_code(conn, prefix)
                ts = now_iso()
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO complaints (
                        tenant_id, ticket_code, user_id, is_anonymous, reporter_display_name, student_info,
                        category, urgency, location_detail, description, photo_data, audio_evidence, routed_to,
                        status, staff_note, parent_rating, parent_feedback, is_offline_synced,
                        vulnerable_group, needs_priority_assistance, disability_type, special_need_note,
                        child_mode, impact_tags, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Diterima', '', 0, '', ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        tid, code, user["id"], is_anonymous, display_name, student_info,
                        category, urgency, location_detail, description, photo_data, audio_evidence, routed_to,
                        is_offline_synced, vulnerable_group, needs_priority, disability_type, special_need_note,
                        child_mode, impact_tags, ts, ts,
                    ),
                )
                cid = cur.lastrowid
                conn.commit()
            row = enrich_complaint_sla(dict(conn.execute("SELECT * FROM complaints WHERE id = ?", (cid,)).fetchone()), school.get("sla_hours", 24))
            row.pop("guest_pin_hash", None)
        notif = dispatch_notifications(school, row)
        return self.send_json(201, {"item": row, "notification": notif})

    def handle_create_guest_complaint(self, body, qs):
        client_ip = self.get_client_ip()
        if not check_and_record_ip_rate_limit("guest_create", client_ip, 15, 300):
            return self.send_json(429, {"error": "Terlalu banyak kiriman Lapor Cepat dari perangkat ini. Silakan tunggu beberapa menit."})
        category = (body.get("category") or "").strip()[:100]
        urgency = (body.get("urgency") or "Penting").strip()[:40]
        location_detail = (body.get("location_detail") or "").strip()[:200]
        description = (body.get("description") or "").strip()[:4000]
        photo_data = (body.get("photo_data") or "").strip()
        audio_evidence = (body.get("audio_evidence") or "").strip()
        is_anonymous = 1 if body.get("is_anonymous", True) else 0
        reporter_name = (body.get("reporter_name") or "").strip()[:100]
        student_info = (body.get("student_info") or "").strip()[:120]
        vulnerable_group = (body.get("vulnerable_group") or "").strip()[:120]
        disability_type = (body.get("disability_type") or "").strip()[:60]
        special_need_note = (body.get("special_need_note") or "").strip()[:300]
        child_mode = 1 if body.get("child_mode") else 0
        raw_impacts = body.get("impact_tags") or ""
        if isinstance(raw_impacts, list):
            impact_tags = ", ".join(str(x).strip() for x in raw_impacts if str(x).strip())[:200]
        else:
            impact_tags = str(raw_impacts).strip()[:200]
        needs_priority = 1 if (
            body.get("needs_priority_assistance")
            or disability_type
            or (vulnerable_group and vulnerable_group != "Umum (Bukan Kelompok Rentan)")
        ) else 0

        if not description and audio_evidence:
            description = "[Lampiran Pesan Suara Pelapor]"
        if not category or not description:
            return self.send_json(400, {"error": "Kategori dan uraian keluhan (atau pesan suara) wajib diisi."})
        if not is_valid_image_data(photo_data):
            return self.send_json(400, {"error": "Format foto harus JPG/PNG/WebP dengan ukuran terkompresi maksimal 900 KB."})
        if not is_valid_audio_data(audio_evidence):
            return self.send_json(400, {"error": "Format pesan suara tidak valid atau melebihi batas 700 KB."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            prefix = school["tenant_code"].split("-")[0]

            if is_anonymous or not reporter_name:
                display_name = "Pelapor Cepat Anonim (Dilindungi UU PDP)" if is_anonymous else "Warga Sekolah (Lapor Cepat)"
            else:
                display_name = reporter_name
            if is_anonymous and not student_info:
                student_info = "Disamarkan (Anonim)"
            routed_to = route_category(category, bool(needs_priority))
            guest_pin = f"{secrets.randbelow(900000) + 100000}"
            pin_hash = hash_pw(guest_pin)

            with TICKET_LOCK:
                guest_uid = get_or_create_guest_user_id(conn, school)
                code = next_ticket_code(conn, prefix)
                ts = now_iso()
                cur = conn.cursor()
                cur.execute(
                    """
                    INSERT INTO complaints (
                        tenant_id, ticket_code, user_id, is_anonymous, reporter_display_name, student_info,
                        category, urgency, location_detail, description, photo_data, audio_evidence, routed_to,
                        status, staff_note, parent_rating, parent_feedback, is_offline_synced,
                        vulnerable_group, needs_priority_assistance, disability_type, special_need_note,
                        child_mode, impact_tags, is_guest, guest_pin_hash, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Diterima', '', 0, '', 0, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
                    """,
                    (
                        tid, code, guest_uid, is_anonymous, display_name, student_info,
                        category, urgency, location_detail, description, photo_data, audio_evidence, routed_to,
                        vulnerable_group, needs_priority, disability_type, special_need_note,
                        child_mode, impact_tags, pin_hash, ts, ts,
                    ),
                )
                cid = cur.lastrowid
                conn.commit()
            row = enrich_complaint_sla(dict(conn.execute("SELECT * FROM complaints WHERE id = ?", (cid,)).fetchone()), school.get("sla_hours", 24))
            row.pop("guest_pin_hash", None)
        notif = dispatch_notifications(school, row)
        return self.send_json(201, {"item": row, "notification": notif, "guest_ticket_code": code, "guest_pin": guest_pin})

    def handle_guest_track(self, body, qs):
        ticket_code = (body.get("ticket_code") or "").strip().upper()
        pin = (body.get("pin") or "").strip()
        if not ticket_code or not pin:
            return self.send_json(400, {"error": "Kode tiket dan PIN 6-digit wajib diisi."})
        client_ip = self.get_client_ip()
        rl_key = f"guest::{client_ip}::{ticket_code}"
        if is_login_rate_limited(rl_key):
            return self.send_json(429, {"error": "Terlalu banyak percobaan PIN salah. Silakan coba lagi dalam 5 menit."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            row = conn.execute(
                "SELECT * FROM complaints WHERE tenant_id = ? AND UPPER(ticket_code) = ? AND is_guest = 1",
                (school["id"], ticket_code),
            ).fetchone()
        if not row or not verify_pw(pin, row["guest_pin_hash"]):
            record_failed_login(rl_key)
            return self.send_json(401, {"error": "Kode tiket atau PIN 6-digit tidak cocok."})
        clear_failed_login(rl_key)
        d = enrich_complaint_sla(dict(row), school.get("sla_hours", 24))
        d.pop("guest_pin_hash", None)
        return self.send_json(200, {"item": d})

    def handle_guest_rate(self, body, qs):
        ticket_code = (body.get("ticket_code") or "").strip().upper()
        pin = (body.get("pin") or "").strip()
        if not ticket_code or not pin:
            return self.send_json(400, {"error": "Kode tiket dan PIN 6-digit wajib diisi."})
        client_ip = self.get_client_ip()
        rl_key = f"guest::{client_ip}::{ticket_code}"
        if is_login_rate_limited(rl_key):
            return self.send_json(429, {"error": "Terlalu banyak percobaan PIN salah. Silakan coba lagi dalam 5 menit."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            row = conn.execute(
                "SELECT * FROM complaints WHERE tenant_id = ? AND UPPER(ticket_code) = ? AND is_guest = 1",
                (school["id"], ticket_code),
            ).fetchone()
            if not row or not verify_pw(pin, row["guest_pin_hash"]):
                record_failed_login(rl_key)
                return self.send_json(401, {"error": "Kode tiket atau PIN 6-digit tidak cocok."})
            clear_failed_login(rl_key)
            if row["status"] != "Selesai":
                return self.send_json(400, {"error": "Penilaian bintang hanya dapat dikirim setelah aduan berstatus Selesai."})
            try:
                rating_raw = int(body.get("parent_rating"))
            except (TypeError, ValueError):
                return self.send_json(400, {"error": "Nilai rating harus berupa angka 1 sampai 5."})
            rating = max(1, min(5, rating_raw))
            feedback = (body.get("parent_feedback") or "").strip()[:1000]
            conn.execute(
                "UPDATE complaints SET parent_rating = ?, parent_feedback = ?, updated_at = ? WHERE id = ?",
                (rating, feedback, now_iso(), row["id"]),
            )
            conn.commit()
            d = enrich_complaint_sla(dict(conn.execute("SELECT * FROM complaints WHERE id = ?", (row["id"],)).fetchone()), school.get("sla_hours", 24))
            d.pop("guest_pin_hash", None)
        return self.send_json(200, {"item": d})

    def handle_update_complaint(self, cid, body):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Unauthorized"})
        try:
            cid_int = int(cid)
        except ValueError:
            return self.send_json(400, {"error": "ID pengaduan tidak valid."})

        with open_conn() as conn:
            existing = conn.execute("SELECT * FROM complaints WHERE id = ?", (cid_int,)).fetchone()
            if not existing:
                return self.send_json(404, {"error": "Pengaduan tidak ditemukan."})
            if existing["tenant_id"] != user["tenant_id"]:
                return self.send_json(403, {"error": "Akses ditolak: lintas tenant tidak diizinkan."})

            if "parent_rating" in body and existing["user_id"] == user["id"]:
                if existing["status"] != "Selesai":
                    return self.send_json(400, {"error": "Penilaian bintang hanya dapat dikirim setelah aduan berstatus Selesai."})
                try:
                    rating_raw = int(body.get("parent_rating"))
                except (TypeError, ValueError):
                    return self.send_json(400, {"error": "Nilai rating harus berupa angka 1 sampai 5."})
                rating = max(1, min(5, rating_raw))
                feedback = (body.get("parent_feedback") or "").strip()[:1000]
                conn.execute(
                    "UPDATE complaints SET parent_rating = ?, parent_feedback = ?, updated_at = ? WHERE id = ?",
                    (rating, feedback, now_iso(), cid_int),
                )
                conn.commit()
                row = dict(conn.execute("SELECT * FROM complaints WHERE id = ?", (cid_int,)).fetchone())
                school_row = dict(conn.execute("SELECT sla_hours FROM school_tenants WHERE id = ?", (row["tenant_id"],)).fetchone())
                enrich_complaint_sla(row, school_row.get("sla_hours", 24))
                return self.send_json(200, {"item": row})

            if user["role"] not in ("tppk_piket", "admin_sekolah") or user["verification_status"] != "verified":
                return self.send_json(403, {"error": "Hanya Tim TPPK/Piket atau Kepala Sekolah terverifikasi yang dapat memproses aduan."})

            status = (body.get("status") or existing["status"]).strip()
            staff_note = (body.get("staff_note") or "").strip()[:2000]
            if status not in {"Diterima", "Diverifikasi Piket/TPPK", "Ditangani TPPK/Kepsek", "Selesai"}:
                return self.send_json(400, {"error": "Status tidak valid."})

            if "resolution_photo" in body:
                res_photo = (body.get("resolution_photo") or "").strip()
                if not is_valid_image_data(res_photo):
                    return self.send_json(400, {"error": "Format foto bukti penanganan harus JPG/PNG/WebP maksimal 900 KB."})
            else:
                res_photo = existing["resolution_photo"] or ""

            ts_now = now_iso()
            first_resp = existing["first_responded_at"] or (ts_now if (status != "Diterima" or staff_note) else "")
            resolved_at = existing["resolved_at"] or (ts_now if status == "Selesai" else "")
            conn.execute(
                "UPDATE complaints SET status = ?, staff_note = ?, resolution_photo = ?, first_responded_at = ?, resolved_at = ?, updated_at = ? WHERE id = ?",
                (status, staff_note, res_photo, first_resp, resolved_at, ts_now, cid_int),
            )
            conn.commit()
            d = dict(conn.execute("SELECT * FROM complaints WHERE id = ?", (cid_int,)).fetchone())
            school_row = dict(conn.execute("SELECT * FROM school_tenants WHERE id = ?", (d["tenant_id"],)).fetchone())
            rep_row = conn.execute("SELECT phone_or_email FROM users WHERE id = ?", (d["user_id"],)).fetchone()
            reporter_contact = (rep_row["phone_or_email"] if rep_row else "") or ""

        reporter_notif = dispatch_reporter_notification(school_row, d, reporter_contact)
        mask_anonymous_complaint(d, user["id"])
        enrich_complaint_sla(d, school_row.get("sla_hours", 24))
        return self.send_json(200, {"item": d, "reporter_notification": reporter_notif})

    def handle_get_evaluations(self, qs):
        user = self.get_current_user()
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            summary = compute_evaluation_summary(conn, tid)
            items = []
            if user and user["tenant_id"] == tid:
                is_staff = user["role"] in ("tppk_piket", "admin_sekolah") and user["verification_status"] == "verified"
                if is_staff:
                    rows = conn.execute("SELECT * FROM service_evaluations WHERE tenant_id = ? ORDER BY id DESC LIMIT 50", (tid,)).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM service_evaluations WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 30",
                        (tid, user["id"]),
                    ).fetchall()
                for r in rows:
                    d = dict(r)
                    if d.get("is_anonymous") and d.get("user_id") != user["id"]:
                        d["respondent_name"] = "Responden Anonim (Dilindungi UU PDP)"
                        d["user_id"] = None
                    items.append(d)
        return self.send_json(200, {"items": items, "summary": summary})

    def handle_create_evaluation(self, body, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk terlebih dahulu sebelum mengirim penilaian."})
        try:
            app_rating = int(body.get("app_rating"))
            school_rating = int(body.get("school_response_rating"))
        except (TypeError, ValueError):
            return self.send_json(400, {"error": "Rating aplikasi dan rating respon sekolah harus berupa angka 1–5."})
        if not (1 <= app_rating <= 5 and 1 <= school_rating <= 5):
            return self.send_json(400, {"error": "Nilai rating harus di antara 1 sampai 5 bintang."})

        response_speed = (body.get("response_speed") or "Cepat (≤24 Jam)").strip()
        followup_clarity = (body.get("followup_clarity") or "Sangat Jelas & Tuntas").strip()
        ticket_code = (body.get("ticket_code") or "").strip()[:40]
        comment = (body.get("comment") or "").strip()[:1000]
        is_anon = 1 if body.get("is_anonymous") else 0

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: Anda hanya dapat menilai sekolah tempat akun terdaftar."})

            display_name = "Responden Anonim (Dilindungi UU PDP)" if is_anon else user["full_name"]
            ts = now_iso()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO service_evaluations (
                    tenant_id, user_id, respondent_name, respondent_role, is_anonymous,
                    ticket_code, app_rating, school_response_rating, response_speed,
                    followup_clarity, comment, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tid, user["id"], display_name, user["role"], is_anon,
                    ticket_code, app_rating, school_rating, response_speed,
                    followup_clarity, comment, ts,
                ),
            )
            eid = cur.lastrowid
            conn.commit()
            item = dict(conn.execute("SELECT * FROM service_evaluations WHERE id = ?", (eid,)).fetchone())
            summary = compute_evaluation_summary(conn, tid)
        return self.send_json(201, {"item": item, "summary": summary})

    def handle_get_ikm(self, qs):
        user = self.get_current_user()
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            summary = compute_ikm_summary(conn, tid)
            items = []
            if user and user["tenant_id"] == tid:
                is_staff = user["role"] in ("tppk_piket", "admin_sekolah") and user["verification_status"] == "verified"
                if is_staff:
                    rows = conn.execute("SELECT * FROM ikm_surveys WHERE tenant_id = ? ORDER BY id DESC LIMIT 100", (tid,)).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM ikm_surveys WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 30",
                        (tid, user["id"]),
                    ).fetchall()
                for r in rows:
                    d = dict(r)
                    if d.get("is_anonymous") and d.get("user_id") != user["id"]:
                        d["respondent_name"] = "Responden Anonim (Dilindungi UU PDP)"
                        d["user_id"] = None
                    items.append(d)
        return self.send_json(200, {"items": items, "summary": summary})

    def handle_create_ikm(self, body, qs):
        user = self.get_current_user()
        if not user:
            return self.send_json(401, {"error": "Silakan masuk terlebih dahulu sebelum mengisi Survei IKM 9 Unsur."})
        scores = []
        for k in ("u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"):
            try:
                val = int(body.get(k))
            except (TypeError, ValueError):
                return self.send_json(400, {"error": f"Nilai unsur {k.upper()} harus berupa angka 1 sampai 4."})
            if val < 1 or val > 4:
                return self.send_json(400, {"error": f"Nilai unsur {k.upper()} harus di antara 1 sampai 4."})
            scores.append(val)

        suggestion = (body.get("suggestion") or "").strip()[:1000]
        is_anon = 1 if body.get("is_anonymous") else 0

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: Anda hanya dapat mengisi IKM untuk sekolah tempat akun terdaftar."})

            display_name = "Responden Anonim (Dilindungi UU PDP)" if is_anon else user["full_name"]
            ts = now_iso()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO ikm_surveys (
                    tenant_id, user_id, respondent_name, respondent_role, is_anonymous,
                    u1, u2, u3, u4, u5, u6, u7, u8, u9, suggestion, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (tid, user["id"], display_name, user["role"], is_anon, *scores, suggestion, ts),
            )
            iid = cur.lastrowid
            conn.commit()
            item = dict(conn.execute("SELECT * FROM ikm_surveys WHERE id = ?", (iid,)).fetchone())
            summary = compute_ikm_summary(conn, tid)
        return self.send_json(201, {"item": item, "summary": summary})

    def handle_get_ikm_rtl(self, qs):
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            summary = compute_ikm_summary(conn, tid)
            weakest = sorted(summary.get("elements") or [], key=lambda x: x["nrr"])[:2] if summary.get("respondent_count", 0) > 0 else []
            rows = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM ikm_action_plans WHERE tenant_id = ? ORDER BY id DESC LIMIT 50",
                    (tid,),
                ).fetchall()
            ]
        suggested_target = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        return self.send_json(200, {"items": rows, "weakest_elements": weakest, "suggested_target_date": suggested_target})

    def handle_create_ikm_rtl(self, body, qs):
        user = self.get_current_user()
        if not user or user["role"] not in ("tppk_piket", "admin_sekolah") or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Guru Piket / Tim TPPK / Kepala Sekolah terverifikasi."})
        unsur_code = (body.get("unsur_code") or "").strip()[:16]
        unsur_label = (body.get("unsur_label") or "").strip()[:120]
        action_plan = (body.get("action_plan") or "").strip()[:1000]
        pic_name = (body.get("pic_name") or user["full_name"]).strip()[:120]
        target_date = (body.get("target_date") or (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")).strip()[:20]
        try:
            current_avg = float(body.get("current_avg") or 0)
        except (TypeError, ValueError):
            current_avg = 0.0
        if not unsur_code or not unsur_label or not action_plan:
            return self.send_json(400, {"error": "Unsur IKM dan uraian rencana tindak lanjut wajib diisi."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: lintas tenant tidak diizinkan."})
            ts = now_iso()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO ikm_action_plans (
                    tenant_id, unsur_code, unsur_label, current_avg, action_plan,
                    pic_name, target_date, status, evidence_note, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Direncanakan', '', ?, ?, ?)
                """,
                (tid, unsur_code, unsur_label, current_avg, action_plan, pic_name, target_date, user["id"], ts, ts),
            )
            rid = cur.lastrowid
            conn.commit()
            row = dict(conn.execute("SELECT * FROM ikm_action_plans WHERE id = ?", (rid,)).fetchone())
        return self.send_json(201, {"item": row})

    def handle_update_ikm_rtl(self, rid, body):
        user = self.get_current_user()
        if not user or user["role"] not in ("tppk_piket", "admin_sekolah") or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Guru Piket / Tim TPPK / Kepala Sekolah terverifikasi."})
        try:
            rid_int = int(rid)
        except ValueError:
            return self.send_json(400, {"error": "ID RTL tidak valid."})
        status = (body.get("status") or "").strip()
        if status not in {"Direncanakan", "Dikerjakan", "Selesai"}:
            return self.send_json(400, {"error": "Status RTL tidak valid."})
        evidence_note = (body.get("evidence_note") or "").strip()[:1000]
        with open_conn() as conn:
            existing = conn.execute("SELECT * FROM ikm_action_plans WHERE id = ?", (rid_int,)).fetchone()
            if not existing or existing["tenant_id"] != user["tenant_id"]:
                return self.send_json(404, {"error": "RTL IKM tidak ditemukan."})
            conn.execute(
                "UPDATE ikm_action_plans SET status = ?, evidence_note = ?, updated_at = ? WHERE id = ?",
                (status, evidence_note, now_iso(), rid_int),
            )
            conn.commit()
            row = dict(conn.execute("SELECT * FROM ikm_action_plans WHERE id = ?", (rid_int,)).fetchone())
        return self.send_json(200, {"item": row})

    def handle_get_users(self, qs):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            if user["tenant_id"] != school["id"]:
                return self.send_json(403, {"error": "Akses ditolak: lintas tenant tidak diizinkan."})
            users = [
                sanitize_user(r)
                for r in conn.execute(
                    "SELECT * FROM users WHERE tenant_id = ? AND role != 'guest_reporter' ORDER BY id DESC",
                    (school["id"],),
                ).fetchall()
            ]
        return self.send_json(200, {"items": users})

    def handle_verify_user(self, uid, body):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
        try:
            uid_int = int(uid)
        except ValueError:
            return self.send_json(400, {"error": "ID pengguna tidak valid."})
        status = (body.get("verification_status") or "verified").strip()
        if status not in {"verified", "pending", "rejected"}:
            return self.send_json(400, {"error": "Status verifikasi tidak valid."})
        with open_conn() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (uid_int,)).fetchone()
            if not target or target["tenant_id"] != user["tenant_id"] or target["role"] == "guest_reporter":
                return self.send_json(403, {"error": "Pengguna tidak ditemukan pada tenant sekolah Anda."})
            if status in {"pending", "rejected"}:
                conn.execute("UPDATE users SET verification_status = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?", (status, uid_int))
            else:
                conn.execute("UPDATE users SET verification_status = ? WHERE id = ?", (status, uid_int))
            conn.commit()
            row = sanitize_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid_int,)).fetchone())
        return self.send_json(200, {"user": row})

    def handle_admin_reset_password(self, uid, body):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
        try:
            uid_int = int(uid)
        except ValueError:
            return self.send_json(400, {"error": "ID pengguna tidak valid."})
        new_pw = (body.get("new_password") or "").strip()
        if len(new_pw) < 6:
            return self.send_json(400, {"error": "Kata sandi sementara minimal 6 karakter."})
        with open_conn() as conn:
            target = conn.execute("SELECT * FROM users WHERE id = ?", (uid_int,)).fetchone()
            if not target or target["tenant_id"] != user["tenant_id"] or target["role"] == "guest_reporter":
                return self.send_json(403, {"error": "Pengguna tidak ditemukan pada tenant sekolah Anda."})
            conn.execute("UPDATE users SET password_hash = ?, token_version = COALESCE(token_version, 1) + 1 WHERE id = ?", (hash_pw(new_pw), uid_int))
            conn.commit()
            row = sanitize_user(conn.execute("SELECT * FROM users WHERE id = ?", (uid_int,)).fetchone())
        return self.send_json(200, {"ok": True, "user": row, "message": f"Kata sandi {row['full_name']} berhasil direset."})

    def handle_get_public_fkp(self, qs):
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            transparency_items = [
                dict(r)
                for r in conn.execute(
                    "SELECT * FROM public_transparency_items WHERE tenant_id = ? ORDER BY id ASC",
                    (tid,),
                ).fetchall()
            ]
            poll_rows = conn.execute(
                "SELECT * FROM fkp_polls WHERE tenant_id = ? AND is_active = 1 ORDER BY id DESC",
                (tid,),
            ).fetchall()
            polls = []
            for pr in poll_rows:
                options = json.loads(pr["options_json"] or "[]")
                resp_rows = conn.execute(
                    "SELECT selected_option FROM fkp_responses WHERE tenant_id = ? AND poll_id = ?",
                    (tid, pr["id"]),
                ).fetchall()
                counts = {opt: 0 for opt in options}
                for rr in resp_rows:
                    opt = rr["selected_option"]
                    counts[opt] = counts.get(opt, 0) + 1
                polls.append({
                    "id": pr["id"],
                    "topic_title": pr["topic_title"],
                    "topic_desc": pr["topic_desc"],
                    "options": options,
                    "counts": counts,
                    "total_votes": len(resp_rows),
                    "created_at": pr["created_at"],
                })
            recent_feedback = [
                dict(r)
                for r in conn.execute(
                    """
                    SELECT id, poll_id, selected_option, respondent_role, respondent_name, suggestion, created_at
                    FROM fkp_responses
                    WHERE tenant_id = ?
                    ORDER BY id DESC LIMIT 25
                    """,
                    (tid,),
                ).fetchall()
            ]
        return self.send_json(200, {
            "transparency_items": transparency_items,
            "polls": polls,
            "recent_feedback": recent_feedback,
        })

    def handle_submit_fkp_feedback(self, body, qs):
        client_ip = self.get_client_ip()
        if not check_and_record_ip_rate_limit("fkp_vote", client_ip, 20, 300):
            return self.send_json(429, {"error": "Terlalu banyak kiriman FKP dalam waktu singkat. Silakan coba lagi beberapa menit lagi."})
        selected_option = (body.get("selected_option") or "").strip()[:200]
        suggestion = (body.get("suggestion") or "").strip()[:600]
        respondent_role = (body.get("respondent_role") or "Masyarakat Umum").strip()[:60]
        respondent_name = (body.get("respondent_name") or "Warga / Masyarakat Umum").strip()[:80]
        try:
            poll_id = int(body.get("poll_id") or 0)
        except (TypeError, ValueError):
            poll_id = 0
        if not poll_id or not selected_option:
            return self.send_json(400, {"error": "Silakan pilih salah satu opsi usulan FKP terlebih dahulu."})

        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            poll = conn.execute(
                "SELECT * FROM fkp_polls WHERE id = ? AND tenant_id = ? AND is_active = 1",
                (poll_id, tid),
            ).fetchone()
            if not poll:
                return self.send_json(404, {"error": "Topik FKP tidak ditemukan atau sudah ditutup."})
            options = json.loads(poll["options_json"] or "[]")
            if selected_option not in options:
                return self.send_json(400, {"error": "Opsi FKP tidak sesuai daftar topik."})

            ts = now_iso()
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO fkp_responses (
                    tenant_id, poll_id, selected_option, respondent_role, respondent_name, suggestion, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (tid, poll_id, selected_option, respondent_role, respondent_name, suggestion, ts),
            )
            rid = cur.lastrowid
            conn.commit()
            row = dict(conn.execute("SELECT * FROM fkp_responses WHERE id = ?", (rid,)).fetchone())
        return self.send_json(201, {"item": row})

    def handle_create_fkp_poll(self, body, qs):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
        topic_title = (body.get("topic_title") or "").strip()[:160]
        topic_desc = (body.get("topic_desc") or "").strip()[:400]
        options = [str(o).strip()[:120] for o in (body.get("options") or []) if str(o).strip()]
        if not topic_title or len(options) < 2:
            return self.send_json(400, {"error": "Judul topik FKP dan minimal 2 opsi pilihan wajib diisi."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak: lintas tenant tidak diizinkan."})
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO fkp_polls (tenant_id, topic_title, topic_desc, options_json, is_active, created_at) VALUES (?, ?, ?, ?, 1, ?)",
                (tid, topic_title, topic_desc or "Pilih prioritas usulan masyarakat:", json.dumps(options), now_iso()),
            )
            pid = cur.lastrowid
            conn.commit()
        return self.send_json(201, {"id": pid, "topic_title": topic_title})

    def handle_upsert_transparency(self, item_id, body, qs):
        user = self.get_current_user()
        if not user or user["role"] != "admin_sekolah" or user["verification_status"] != "verified":
            return self.send_json(403, {"error": "Khusus Kepala Sekolah / Admin terverifikasi."})
        category = (body.get("category") or "Informasi Publik Sekolah").strip()[:80]
        title = (body.get("title") or "").strip()[:160]
        summary = (body.get("summary") or "").strip()[:600]
        metric_value = (body.get("metric_value") or "").strip()[:80]
        if not title or not summary:
            return self.send_json(400, {"error": "Judul dan ringkasan informasi publik wajib diisi."})
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
            tid = school["id"]
            if user["tenant_id"] != tid:
                return self.send_json(403, {"error": "Akses ditolak."})
            ts = now_iso()
            if item_id:
                try:
                    iid = int(item_id)
                except ValueError:
                    return self.send_json(400, {"error": "ID informasi publik tidak valid."})
                existing = conn.execute("SELECT * FROM public_transparency_items WHERE id = ? AND tenant_id = ?", (iid, tid)).fetchone()
                if not existing:
                    return self.send_json(404, {"error": "Item transparansi tidak ditemukan."})
                conn.execute(
                    "UPDATE public_transparency_items SET category = ?, title = ?, summary = ?, metric_value = ?, updated_at = ? WHERE id = ?",
                    (category, title, summary, metric_value, ts, iid),
                )
                conn.commit()
                row = dict(conn.execute("SELECT * FROM public_transparency_items WHERE id = ?", (iid,)).fetchone())
                return self.send_json(200, {"item": row})
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO public_transparency_items (tenant_id, category, title, summary, metric_value, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (tid, category, title, summary, metric_value, ts),
            )
            nid = cur.lastrowid
            conn.commit()
            row = dict(conn.execute("SELECT * FROM public_transparency_items WHERE id = ?", (nid,)).fetchone())
        return self.send_json(201, {"item": row})

    def handle_chat(self, body, qs):
        client_ip = self.get_client_ip()
        if not check_and_record_ip_rate_limit("chat", client_ip, 40, 300):
            return self.send_json(429, {"error": "Terlalu banyak pertanyaan ke asisten dalam waktu singkat. Mohon tunggu sebentar."})
        question = (body.get("question") or "").strip()[:800]
        auth_user = self.get_current_user()
        with open_conn() as conn:
            school = self.get_tenant(conn, qs)
        if auth_user and auth_user["tenant_id"] == school["id"]:
            chat_user = auth_user
        else:
            chat_user = {"id": None, "full_name": "Orang Tua/Wali", "role": "orang_tua", "verification_status": "verified"}
        return self.send_json(200, generate_chat_reply(question, chat_user, school["id"]))

    def serve_static(self, req_path):
        clean_path = req_path.split("?", 1)[0].lstrip("/") or "index.html"
        web_root = os.path.abspath(WEB_BUNDLE_DIR)
        full_path = os.path.abspath(os.path.join(web_root, clean_path))
        if os.path.commonpath([web_root, full_path]) != web_root:
            return self.send_json(403, {"error": "Forbidden"})
        if not os.path.exists(full_path) or os.path.isdir(full_path):
            full_path = os.path.join(web_root, "index.html")
        ctype, _ = mimetypes.guess_type(full_path)
        with open(full_path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        if os.path.basename(full_path) in {"sw.js", "index.html"}:
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_security_headers()
        if ctype and ctype.startswith("text/html"):
            self.send_csp_header()
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(data)


# Alias kontrak (Fase 4A): akan diganti `from handler_base import
# SikolaHandlerBase` pada Task 9 — nama ini dikunci test_module_surface.
SikolaHandlerBase = SikolaHandler


class MonsaThreadingHTTPServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True
    allow_reuse_address = True


def main():
    # Validasi MONSA_SECRET_KEY (K1) sudah dilakukan saat modul dimuat oleh
    # _resolve_secret_key(): mode produksi tanpa kunci yang valid akan exit(1)
    # sebelum server sempat menerima koneksi.
    init_db()
    print(f"[MODE] produksi={_is_production_mode()} | demo_disable={os.environ.get('MONSA_DISABLE_DEMO', '') == '1'}")
    sys.stdout.flush()
    port = int(os.environ.get("PORT", "8000"))
    bind = (os.environ.get("MONSA_BIND", "") or "127.0.0.1").strip() or "127.0.0.1"
    server = MonsaThreadingHTTPServer((bind, port), SikolaHandler)
    print(f"SI-PAKAINGE MONSA Sekolah Server listening on http://{bind}:{port}")
    if bind == "127.0.0.1":
        print("[BIND] Hanya localhost — akses dari luar mesin lewat nginx. Set MONSA_BIND=0.0.0.0 bila perlu.")
    sys.stdout.flush()
    server.serve_forever()


if __name__ == "__main__":
    main()
