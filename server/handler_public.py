"""Handler publik: FKP, transparansi, chatbot, dan penyajian aset statis (Fase 4A)."""
import json
import mimetypes
import os

from chatbot import generate_chat_reply
from config import WEB_BUNDLE_DIR
from db import now_iso, open_conn
from ratelimit import check_and_record_ip_rate_limit


class HandlerPublic:
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


