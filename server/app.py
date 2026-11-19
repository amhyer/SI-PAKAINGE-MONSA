import csv
import io
import json
import mimetypes
import os
import re
import secrets
import sys
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import hash_pw, init_db, now_iso, open_conn, verify_pw
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
from complaints_lib import (
    TICKET_LOCK, get_or_create_guest_user_id, mask_anonymous_complaint,
    next_ticket_code, normalize_wa_number, route_category,
)
from sla import _fmt_hours_id, compute_complaint_sla, enrich_complaint_sla, parse_iso_dt
from notify import (
    _NOTIF_QUEUE, _NOTIF_WORKER, _enqueue_notif, _notif_worker_loop,
    _post_webhook, _send_smtp_email, _update_notif_status,
    dispatch_notifications, dispatch_reporter_notification,
)
from metrics import (
    IKM_ELEMENT_LABELS, build_monev_markdown, compute_evaluation_summary,
    compute_ikm_summary, compute_public_recap, get_ikm_grade,
)
from handler_base import PayloadTooLargeError, SikolaHandlerBase
from handler_admin import HandlerAdmin

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


# --- Notifikasi async (Fase 2) --- (dipindah ke server/notify.py)


class SikolaHandler(HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
    server_version = "SiPakaingeMonsaServer/2.2.3"

    # K4: nilai rahasia tidak boleh pernah masuk ke log/jurnal.
    _SENSITIVE_QS_RE = re.compile(r"(?i)\b(pin|token|secret|password|api_key)=[^&\s\"']*")

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
