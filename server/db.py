from contextlib import contextmanager
import hashlib
import hmac
import os
import secrets
import sqlite3
from datetime import datetime, timedelta

DB_PATH = os.environ.get("MONSA_DB_PATH", "").strip() or os.path.join(os.path.dirname(os.path.abspath(__file__)), "sikola_monsa.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=20.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 10000")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def open_conn():
    conn = get_conn()
    try:
        yield conn
    finally:
        conn.close()


def hash_pw(raw: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), salt.encode("ascii"), 100_000).hex()
    return f"pbkdf2_sha256${salt}${dk}"


def verify_pw(raw: str, stored_hash: str) -> bool:
    if not stored_hash:
        return False
    if stored_hash.startswith("pbkdf2_sha256$"):
        parts = stored_hash.split("$", 2)
        if len(parts) != 3:
            return False
        _, salt, expected = parts
        dk = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), salt.encode("ascii"), 100_000).hex()
        return hmac.compare_digest(dk, expected)
    legacy = hashlib.sha256(f"monsa-mks-salt::{raw}".encode("utf-8")).hexdigest()
    return hmac.compare_digest(legacy, stored_hash)


def needs_rehash(stored_hash: str) -> bool:
    return not (stored_hash or "").startswith("pbkdf2_sha256$")


def now_iso(offset_hours: int = 0) -> str:
    dt = datetime.now() + timedelta(hours=offset_hours)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def ensure_column(cur, table: str, column: str, definition: str):
    cols = [r[1] for r in cur.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in cols:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def init_db():
    conn = get_conn()
    cur = conn.cursor()

    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS school_tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_code TEXT UNIQUE NOT NULL,
            npsn TEXT NOT NULL,
            name TEXT NOT NULL,
            short_name TEXT NOT NULL,
            level TEXT NOT NULL,
            district TEXT NOT NULL,
            address TEXT NOT NULL,
            principal_name TEXT NOT NULL,
            principal_photo TEXT DEFAULT '',
            welcome_title TEXT NOT NULL DEFAULT 'Sambutan Kepala Sekolah',
            welcome_message TEXT NOT NULL DEFAULT 'Assalamu''alaikum Warahmatullahi Wabarakatuh. Selamat datang di SI-PAKAINGE MONSA. Kami berkomitmen menghadirkan layanan konsultasi dan pengaduan yang transparan, bebas pungli, serta ramah bagi penyandang disabilitas dan seluruh kelompok rentan.',
            tppk_lead TEXT NOT NULL,
            hotline TEXT NOT NULL,
            email TEXT NOT NULL,
            notify_whatsapp TEXT NOT NULL DEFAULT '6281355982195',
            notify_email TEXT NOT NULL DEFAULT 'sdnungmongisidi1@gmail.com',
            webhook_url TEXT DEFAULT '',
            sla_hours INTEGER NOT NULL DEFAULT 24,
            is_inclusive INTEGER NOT NULL DEFAULT 1,
            is_zona_integritas INTEGER NOT NULL DEFAULT 1,
            is_primary_owner INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            full_name TEXT NOT NULL,
            phone_or_email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL,
            student_name TEXT DEFAULT '',
            student_class TEXT DEFAULT '',
            bio_note TEXT DEFAULT '',
            verification_status TEXT NOT NULL DEFAULT 'verified',
            token_version INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            UNIQUE(tenant_id, phone_or_email),
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id)
        );

        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            ticket_code TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            is_anonymous INTEGER NOT NULL DEFAULT 1,
            reporter_display_name TEXT NOT NULL,
            student_info TEXT DEFAULT '',
            category TEXT NOT NULL,
            urgency TEXT NOT NULL DEFAULT 'Penting',
            location_detail TEXT DEFAULT '',
            description TEXT NOT NULL,
            photo_data TEXT DEFAULT '',
            routed_to TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Diterima',
            staff_note TEXT DEFAULT '',
            parent_rating INTEGER DEFAULT 0,
            parent_feedback TEXT DEFAULT '',
            is_offline_synced INTEGER NOT NULL DEFAULT 0,
            vulnerable_group TEXT DEFAULT '',
            needs_priority_assistance INTEGER NOT NULL DEFAULT 0,
            first_responded_at TEXT DEFAULT '',
            resolved_at TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS notification_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            complaint_id INTEGER NOT NULL,
            ticket_code TEXT NOT NULL,
            target_user_id INTEGER,
            direction TEXT NOT NULL DEFAULT 'to_school',
            channel TEXT NOT NULL,
            recipient TEXT NOT NULL,
            status TEXT NOT NULL,
            summary TEXT NOT NULL,
            staff_note_snapshot TEXT DEFAULT '',
            wa_link TEXT DEFAULT '',
            mailto_link TEXT DEFAULT '',
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id),
            FOREIGN KEY (complaint_id) REFERENCES complaints(id)
        );

        CREATE TABLE IF NOT EXISTS knowledge_base (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            topic TEXT NOT NULL,
            keywords TEXT NOT NULL,
            summary TEXT NOT NULL,
            details TEXT NOT NULL,
            action_tab TEXT DEFAULT 'lapor',
            action_label TEXT DEFAULT '',
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id)
        );

        CREATE TABLE IF NOT EXISTS chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            user_id INTEGER,
            user_role TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS service_evaluations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            user_id INTEGER,
            respondent_name TEXT NOT NULL,
            respondent_role TEXT NOT NULL,
            is_anonymous INTEGER NOT NULL DEFAULT 0,
            ticket_code TEXT DEFAULT '',
            app_rating INTEGER NOT NULL,
            school_response_rating INTEGER NOT NULL,
            response_speed TEXT NOT NULL DEFAULT 'Cepat (≤24 Jam)',
            followup_clarity TEXT NOT NULL DEFAULT 'Sangat Jelas & Tuntas',
            comment TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS ikm_surveys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            user_id INTEGER,
            respondent_name TEXT NOT NULL,
            respondent_role TEXT NOT NULL,
            is_anonymous INTEGER NOT NULL DEFAULT 0,
            u1 INTEGER NOT NULL,
            u2 INTEGER NOT NULL,
            u3 INTEGER NOT NULL,
            u4 INTEGER NOT NULL,
            u5 INTEGER NOT NULL,
            u6 INTEGER NOT NULL,
            u7 INTEGER NOT NULL,
            u8 INTEGER NOT NULL,
            u9 INTEGER NOT NULL,
            suggestion TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS ikm_action_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            unsur_code TEXT NOT NULL,
            unsur_label TEXT NOT NULL,
            current_avg REAL NOT NULL DEFAULT 0,
            action_plan TEXT NOT NULL,
            pic_name TEXT NOT NULL DEFAULT '',
            target_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Direncanakan',
            evidence_note TEXT DEFAULT '',
            created_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id)
        );

        CREATE TABLE IF NOT EXISTS public_transparency_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            summary TEXT NOT NULL,
            metric_value TEXT DEFAULT '',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id)
        );

        CREATE TABLE IF NOT EXISTS fkp_polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            topic_title TEXT NOT NULL,
            topic_desc TEXT NOT NULL,
            options_json TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id)
        );

        CREATE TABLE IF NOT EXISTS fkp_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            poll_id INTEGER NOT NULL,
            selected_option TEXT NOT NULL,
            respondent_role TEXT NOT NULL DEFAULT 'Masyarakat Umum',
            respondent_name TEXT NOT NULL DEFAULT 'Warga Sekolah',
            suggestion TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            FOREIGN KEY (tenant_id) REFERENCES school_tenants(id),
            FOREIGN KEY (poll_id) REFERENCES fkp_polls(id)
        );
        """
    )

    ensure_column(cur, "users", "token_version", "INTEGER NOT NULL DEFAULT 1")
    ensure_column(cur, "school_tenants", "notify_whatsapp", "TEXT NOT NULL DEFAULT '6281355982195'")
    ensure_column(cur, "school_tenants", "notify_email", "TEXT NOT NULL DEFAULT 'sdnungmongisidi1@gmail.com'")
    ensure_column(cur, "school_tenants", "webhook_url", "TEXT DEFAULT ''")
    ensure_column(cur, "school_tenants", "principal_photo", "TEXT DEFAULT ''")
    ensure_column(cur, "school_tenants", "welcome_title", "TEXT NOT NULL DEFAULT 'Sambutan Kepala Sekolah'")
    ensure_column(cur, "school_tenants", "welcome_message", "TEXT NOT NULL DEFAULT 'Assalamu''alaikum Warahmatullahi Wabarakatuh. Selamat datang di SI-PAKAINGE MONSA. Kami berkomitmen menghadirkan layanan konsultasi dan pengaduan yang transparan, bebas pungli, serta ramah bagi penyandang disabilitas dan seluruh kelompok rentan.'")
    ensure_column(cur, "complaints", "vulnerable_group", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "needs_priority_assistance", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(cur, "complaints", "disability_type", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "special_need_note", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "child_mode", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(cur, "complaints", "impact_tags", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "audio_evidence", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "photo_data", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "resolution_photo", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "is_guest", "INTEGER NOT NULL DEFAULT 0")
    ensure_column(cur, "complaints", "guest_pin_hash", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "first_responded_at", "TEXT DEFAULT ''")
    ensure_column(cur, "complaints", "resolved_at", "TEXT DEFAULT ''")
    cur.execute(
        "UPDATE complaints SET first_responded_at = updated_at WHERE (first_responded_at IS NULL OR first_responded_at = '') AND status != 'Diterima'"
    )
    cur.execute(
        "UPDATE complaints SET resolved_at = updated_at WHERE (resolved_at IS NULL OR resolved_at = '') AND status = 'Selesai'"
    )
    ensure_column(cur, "notification_logs", "target_user_id", "INTEGER")
    ensure_column(cur, "notification_logs", "direction", "TEXT NOT NULL DEFAULT 'to_school'")
    ensure_column(cur, "notification_logs", "staff_note_snapshot", "TEXT DEFAULT ''")
    ensure_column(cur, "notification_logs", "mailto_link", "TEXT DEFAULT ''")
    ensure_column(cur, "notification_logs", "is_read", "INTEGER NOT NULL DEFAULT 0")

    cur.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_complaints_tenant_id ON complaints (tenant_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_complaints_tenant_user ON complaints (tenant_id, user_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_complaints_ticket_code ON complaints (ticket_code);
        CREATE INDEX IF NOT EXISTS idx_notif_tenant_dir ON notification_logs (tenant_id, direction, target_user_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_eval_tenant_id ON service_evaluations (tenant_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_ikm_tenant_id ON ikm_surveys (tenant_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_ikm_rtl_tenant_id ON ikm_action_plans (tenant_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_chat_tenant_id ON chat_logs (tenant_id, id DESC);
        CREATE INDEX IF NOT EXISTS idx_fkp_resp_tenant_poll ON fkp_responses (tenant_id, poll_id, id DESC);
        """
    )

    try:
        if cur.execute("SELECT COUNT(*) FROM school_tenants").fetchone()[0] == 0:
            seed_data(conn)
        else:
            cur.execute(
                """
                UPDATE school_tenants
                SET name = ?, short_name = ?, principal_name = ?, email = ?, hotline = ?,
                    notify_whatsapp = COALESCE(NULLIF(notify_whatsapp, ''), '6281355982195'),
                    notify_email = COALESCE(NULLIF(notify_email, ''), 'sdnungmongisidi1@gmail.com'),
                    tppk_lead = ?, updated_at = ?
                WHERE tenant_code = 'MONSA-01'
                """,
                (
                    "UPTD SPF SD Negeri Unggulan Mongisidi 1",
                    "SDN Unggulan Mongisidi 1",
                    "Andi Windayani, S.Pd., M.Pd.",
                    "sdnungmongisidi1@gmail.com",
                    "(0411) 8918116 / WA 081355982195 · 081241591152",
                    "Tim Pengelola Layanan, Pengaduan & TPPK",
                    now_iso(),
                ),
            )
            t_row = cur.execute("SELECT id FROM school_tenants WHERE is_primary_owner = 1 ORDER BY id ASC LIMIT 1").fetchone()
            if t_row:
                seed_transparency_and_fkp(cur, t_row[0], now_iso())

        conn.commit()
    finally:
        conn.close()


def seed_transparency_and_fkp(cur, t_id: int, ts: str):
    if cur.execute("SELECT COUNT(*) FROM public_transparency_items WHERE tenant_id = ?", (t_id,)).fetchone()[0] == 0:
        ppid_items = [
            (
                t_id,
                "Maklumat & Biaya Layanan",
                "Layanan Pengaduan, PTSP, & Legalisir Gratis (Rp 0)",
                "Seluruh layanan konsultasi, pengaduan, surat keterangan siswa, & pendampingan inklusi bebas pungutan liar sesuai Zona Integritas.",
                "Rp 0 (Gratis)",
                ts,
            ),
            (
                t_id,
                "Daya Tampung & SPMB",
                "Transparansi Kuota Kelas I & Jalur Inklusi",
                "Penerimaan peserta didik mengikuti Juknis Dinas Pendidikan Kota Makassar (Zonasi, Afirmasi/Disabilitas, Perpindahan Tugas) tanpa biaya pendaftaran.",
                "Sesuai Juknis Disdik",
                ts,
            ),
            (
                t_id,
                "Program & Anggaran Sekolah (BOS)",
                "Papan Informasi Penggunaan Dana BOS & Sarpras",
                "Laporan realisasi BOS Reguler untuk pembelajaran, pemeliharaan toilet/ram disabilitas, & penguatan TPPK dipublikasikan berkala di papan sekolah.",
                "Terbuka Triwulanan",
                ts,
            ),
            (
                t_id,
                "Waktu Layanan PTSP & Piket",
                "Jam Operasional Loket Tatap Muka & Respon Digital",
                "Loket PTSP buka Senin–Sabtu (07.15–14.00 WITA). Pengaduan aplikasi SI-PAKAINGE MONSA aktif 24 jam dengan target SLA <= 24 jam kerja.",
                "SLA <= 24 Jam",
                ts,
            ),
        ]
        for p in ppid_items:
            cur.execute(
                "INSERT INTO public_transparency_items (tenant_id, category, title, summary, metric_value, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                p,
            )

    if cur.execute("SELECT COUNT(*) FROM fkp_polls WHERE tenant_id = ?", (t_id,)).fetchone()[0] == 0:
        import json as _json
        polls = [
            (
                t_id,
                "Forum Konsultasi Publik (FKP): Peningkatan Layanan PTSP & Aduan 2026",
                "Warga sekolah, orang tua, alumni, & masyarakat sekitar dipersilakan memilih prioritas perbaikan layanan sekolah:",
                _json.dumps([
                    "Percepat Respon Aduan Darurat <= 12 Jam",
                    "Tambah Kursi & Jalur Ramah Disabilitas/Lansia",
                    "Publikasi Rincian Kegiatan & BOS Setiap Triwulan",
                    "Loket Konsultasi Pagi & Siang Tanpa Antre",
                ]),
                1,
                ts,
            ),
        ]
        for pl in polls:
            cur.execute(
                "INSERT INTO fkp_polls (tenant_id, topic_title, topic_desc, options_json, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                pl,
            )


def seed_data(conn):
    cur = conn.cursor()
    ts = now_iso()

    cur.execute(
        """
        INSERT INTO school_tenants (
            tenant_code, npsn, name, short_name, level, district, address,
            principal_name, tppk_lead, hotline, email, notify_whatsapp, notify_email, webhook_url,
            sla_hours, is_inclusive, is_zona_integritas, is_primary_owner, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 24, 1, 1, 1, ?)
        """,
        (
            "MONSA-01",
            "40313912",
            "UPTD SPF SD Negeri Unggulan Mongisidi 1",
            "SDN Unggulan Mongisidi 1",
            "SD (Terakreditasi A · Adiwiyata · Sekolah Inklusi)",
            "Kec. Makassar (Kel. Maricaya Baru), Kota Makassar",
            "Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142",
            "Andi Windayani, S.Pd., M.Pd.",
            "Tim Pengelola Layanan, Pengaduan & TPPK",
            "(0411) 8918116 / WA 081355982195 · 081241591152",
            "sdnungmongisidi1@gmail.com",
            "6281355982195",
            "sdnungmongisidi1@gmail.com",
            ts,
        ),
    )
    t_id = cur.lastrowid

    demo_users = [
        (t_id, "Ibu Kartini (Orang Tua Kelas IV)", "081241001101", hash_pw("demo123"), "orang_tua", "Andi Rafif", "Kelas IV-A", "Orang tua murid UPTD SPF SDN Unggulan Mongisidi 1", "verified"),
        (t_id, "Andi Rafif (Siswa Kelas IV)", "081344002202", hash_pw("demo123"), "siswa", "Andi Rafif", "Kelas IV-A", "Siswa kelas IV-A", "verified"),
        (t_id, "Tim TPPK & Piket Sekolah", "081144003303", hash_pw("demo123"), "tppk_piket", "", "", "Tim Pengelola Layanan, Pengaduan & TPPK (SK 421.2/047)", "verified"),
        (t_id, "Andi Windayani, S.Pd., M.Pd. (Kepsek/Admin)", "admin@monsa.sch.id", hash_pw("demo123"), "admin_sekolah", "", "", "Kepala UPTD SPF SDN Unggulan Mongisidi 1 (NIP 198112072007012013)", "verified"),
        (t_id, "Pak Baso (Calon Staf TU)", "085299007707", hash_pw("demo123"), "tppk_piket", "", "", "Pendaftar mandiri staf pengaduan menunggu persetujuan Kepala Sekolah", "pending"),
    ]
    for u in demo_users:
        cur.execute(
            """
            INSERT INTO users (
                tenant_id, full_name, phone_or_email, password_hash, role, student_name,
                student_class, bio_note, verification_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (*u, ts),
        )

    complaints_seed = [
        (
            t_id, "ADU-MONSA-0001", 1, 1, "Pelapor Anonim (Dilindungi UU PDP)", "Kelas IV (Disamarkan)",
            "Pungutan / Seragam Sekolah", "Darurat Anak", "Lingkungan Kelas / Grup Paguyuban",
            "Ada permintaan iuran pengadaan seragam tambahan di luar seragam putih-merah gratis Pemkot Makassar. Mohon klarifikasi resmi dari sekolah.",
            "", "Kepala Sekolah & Tim Zona Integritas", "Ditangani TPPK/Kepsek",
            "Kepala Sekolah menegaskan komitmen Zona Integritas: tidak ada pungutan wajib seragam batik/atribut di luar ketentuan resmi Pemkot Makassar.",
            0, "", 0, "", 0, now_iso(-24), now_iso(-4),
        ),
        (
            t_id, "ADU-MONSA-0002", 2, 1, "Pelapor Anonim (Dilindungi UU PDP)", "Kelas IV-A (Disamarkan)",
            "Perundungan / Bullying (TPPK)", "Darurat Anak", "Selasar Kelas IV & Jam Istirahat",
            "Siswa inklusi sering diejek saat jam istirahat sehingga enggan turun ke kantin bersama teman-teman.",
            "", "Tim Layanan Prioritas Rentan & TPPK Sekolah", "Diverifikasi Piket/TPPK",
            "Tim TPPK & Guru Pendamping Inklusi telah menindaklanjuti secara ramah anak bersama wali kelas dan memberikan pendampingan aman.",
            0, "", 0, "Penyandang Disabilitas / Siswa Inklusi", 1, now_iso(-10), now_iso(-2),
        ),
        (
            t_id, "ADU-MONSA-0003", 1, 0, "Ibu Kartini (Orang Tua Kelas IV)", "Andi Rafif • Kelas IV-A",
            "Fasilitas Kelas / Toilet / Kantin", "Penting", "Toilet Siswa Lantai 1 & Kipas Kelas IV-A",
            "Kunci pintu toilet siswa bagian barat rusak dan satu kipas angin kelas IV-A berbunyi keras.",
            "", "Sarpras & Tata Usaha Sekolah", "Selesai",
            "Petugas Sarpras SDN Unggulan Mongisidi 1 telah mengganti kunci pintu toilet dan menservis kipas angin kelas IV-A.",
            5, "Terima kasih respon cepatnya, sangat membantu kenyamanan anak-anak belajar.", 0, "", 0, now_iso(-40), now_iso(-12),
        ),
    ]
    for c in complaints_seed:
        cur.execute(
            """
            INSERT INTO complaints (
                tenant_id, ticket_code, user_id, is_anonymous, reporter_display_name, student_info,
                category, urgency, location_detail, description, photo_data, routed_to,
                status, staff_note, parent_rating, parent_feedback, is_offline_synced,
                vulnerable_group, needs_priority_assistance, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            c,
        )

    seed_tenant_defaults(cur, t_id, ts)


def seed_knowledge_base(cur, t_id: int):
    if cur.execute("SELECT COUNT(*) FROM knowledge_base WHERE tenant_id = ?", (t_id,)).fetchone()[0] > 0:
        return
    kb_seed = [
        (
            t_id,
            "Layanan Pengaduan Zona Integritas Sekolah",
            "lapor aduan zona integritas zi mongisidi monsa cara melapor alur respon sla",
            "Sekolah berkomitmen pada Zona Integritas (ZI) bebas pungli. Setiap aduan mendapat kode tiket dan ditangani maksimal 24 jam kerja.",
            "Alur: 1) Orang tua/siswa isi formulir di tab Lapor (bisa Anonim, Prioritas Rentan, & lampirkan foto), 2) Diverifikasi Piket/TPPK, 3) Ditangani TPPK/Kepala Sekolah, 4) Selesai & orang tua memberi rating kepuasan.",
            "lapor",
            "Buat Pengaduan Sekarang",
        ),
        (
            t_id,
            "Pelayanan Ramah Kelompok Rentan (Perwali Makassar No. 68/2021)",
            "rentan disabilitas inklusi lansia hamil menyusui kursi roda jalan landai prioritas kode etik",
            "Sesuai Perwali Kode Etik Makassar No. 68/2021, penyandang disabilitas, siswa inklusi, lansia, ibu hamil/menyusui, dan anak mendapat layanan prioritas & pendampingan.",
            "Tersedia fasilitas ramah kelompok rentan, ruang tunggu prioritas, serta tombol Prioritas Kelompok Rentan di formulir pengaduan.",
            "lapor",
            "Lapor Prioritas Kelompok Rentan",
        ),
        (
            t_id,
            "Standar PEKPPP, Inovasi SIMPEL & SP4N-LAPOR!",
            "pekppp epkppp simpel span lapor lapor.go.id monev fkp publikasi",
            "SI-PAKAINGE MONSA mendukung penuh penilaian PEKPPP Aspek 04 (SIPP), Aspek 05 (Konsultasi & Pengaduan), dan Aspek 06 (Inovasi Pelayanan SIMPEL) serta terhubung dengan kanal SP4N-LAPOR! (lapor.go.id).",
            "Admin/Tim Pengelola dapat melihat Publikasi Rekap Pengaduan di Beranda dan mengunduh Laporan Monev & FKP otomatis di tab Pantau/Akun.",
            "beranda",
            "Lihat Rekap & SP4N-LAPOR!",
        ),
        (
            t_id,
            "Perlindungan Pelapor Anonim (UU PDP No. 27/2022)",
            "anonim rahasia aman privasi takut identitas bocor uu pdp perlindungan",
            "Mode 'Kirim Secara Anonim' menyembunyikan nama orang tua, nomor HP, dan nama anak dari tampilan petugas maupun jawaban chatbot.",
            "Petugas sekolah hanya menerima substansi keluhan, kategori, foto bukti, dan lokasi agar bisa langsung melakukan perbaikan tanpa risiko intimidasi.",
            "lapor",
            "Kirim Aduan Anonim",
        ),
        (
            t_id,
            "Arsitektur Multi-Sekolah (Untuk Ekspansi Sekolah di Makassar)",
            "banyak sekolah makassar multi tenant ekspansi qr kode sekolah lain white label",
            "Database aplikasi sudah memakai isolasi tenant (tenant_id) sehingga siap dipakai sekolah lain di Makassar secara terpisah.",
            "Tersedia 2 jalur ekspansi tanpa mengubah kode inti: (1) Mode Multi-Tenant via Kode/QR Sekolah dengan data terpisah per sekolah, atau (2) White-Label Build (1 Sekolah 1 APK).",
            "akun",
            "Lihat Arsitektur Multi-Sekolah",
        ),
    ]
    for k in kb_seed:
        cur.execute(
            "INSERT INTO knowledge_base (tenant_id, topic, keywords, summary, details, action_tab, action_label) VALUES (?, ?, ?, ?, ?, ?, ?)",
            k,
        )


def seed_tenant_defaults(cur, t_id: int, ts: str):
    seed_knowledge_base(cur, t_id)
    seed_transparency_and_fkp(cur, t_id, ts)
