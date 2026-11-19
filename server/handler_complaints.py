"""Handler pengaduan: CRUD, tamu (PIN), rating, penjaga IDOR & tenant (Fase 4A).

JANGAN ubah semantik penjagaan: cek tenant (403 lintas tenant), cek pemilik
untuk rating, dan rate-limit PIN tamu harus persis seperti aslinya.
"""
import secrets

from complaints_lib import (
    TICKET_LOCK, get_or_create_guest_user_id, mask_anonymous_complaint,
    next_ticket_code, route_category,
)
from db import hash_pw, now_iso, open_conn, verify_pw
from notify import dispatch_notifications, dispatch_reporter_notification
from ratelimit import (
    check_and_record_ip_rate_limit, clear_failed_login, is_login_rate_limited,
    record_failed_login,
)
from security import is_valid_audio_data, is_valid_image_data
from sla import enrich_complaint_sla


class HandlerComplaints:
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

