import json
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import init_db, now_iso, open_conn
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
from handler_complaints import HandlerComplaints
from handler_reports import HandlerReports

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


class SikolaHandler(HandlerReports, HandlerComplaints, HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
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
