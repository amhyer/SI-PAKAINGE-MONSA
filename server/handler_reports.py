"""Handler laporan: bootstrap, notifikasi, evaluasi/IKM, ekspor monev (Fase 4A)."""
import csv
import io
import os
from datetime import datetime, timedelta

from complaints_lib import mask_anonymous_complaint
from db import now_iso, open_conn
from metrics import (
    build_monev_markdown, compute_evaluation_summary, compute_ikm_summary,
    compute_public_recap,
)
from security import sanitize_school, sanitize_user
from sla import compute_complaint_sla


class HandlerReports:
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

