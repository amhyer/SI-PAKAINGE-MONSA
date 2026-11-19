"""Handler identitas & administrasi: auth, user, profil sekolah, tenant (Fase 4A)."""
import os
import secrets

from db import (
    hash_pw, needs_rehash, now_iso, open_conn, seed_tenant_defaults, verify_pw,
)
from ratelimit import (
    check_and_record_ip_rate_limit, clear_failed_login, is_login_rate_limited,
    record_failed_login,
)
from security import (
    create_token, is_safe_https_webhook, sanitize_school, sanitize_user,
)


class HandlerAdmin:
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

