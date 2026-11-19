#!/usr/bin/env python3
"""
Skrip Reset Database Bersih untuk Peluncuran Produksi SI-PAKAINGE MONSA.
- Membuat backup aman terlebih dahulu sebelum mengubah database.
- Menghapus seluruh data contoh (aduan uji coba, notifikasi, evaluasi, IKM, RTL, chat log, akun demo).
- Mempertahankan identitas resmi sekolah (MONSA-01) dan basis pengetahuan SOP (knowledge_base).
- Meminta/menyetel kata sandi baru (min. 8 karakter) untuk akun Kepala Sekolah/Admin & Tim TPPK/Piket.
"""

import argparse
import getpass
import pathlib
import sqlite3
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
sys.path.insert(0, str(ROOT / "scripts"))

from db import hash_pw, now_iso  # noqa: E402
from backup_db import backup_sqlite  # noqa: E402

DEFAULT_DB = ROOT / "server" / "sikola_monsa.db"


def prompt_strong_pw(label: str) -> str:
    while True:
        pw1 = getpass.getpass(f"Masukkan kata sandi baru {label} (min. 8 karakter): ").strip()
        if len(pw1) < 8:
            print("  Kata sandi minimal 8 karakter.")
            continue
        pw2 = getpass.getpass(f"Ulangi kata sandi baru {label}: ").strip()
        if pw1 != pw2:
            print("  Konfirmasi kata sandi tidak cocok.")
            continue
        return pw1


def reset_for_production(
    db_path: pathlib.Path,
    admin_email: str,
    admin_pw: str,
    tppk_contact: str,
    tppk_pw: str,
    dry_run: bool = False,
    remove_extra_tenants: bool = False,
):
    if not db_path.exists():
        raise FileNotFoundError(f"Database tidak ditemukan: {db_path}")

    if not dry_run:
        backup_file = backup_sqlite(db_path, db_path.parent / "backups")
        print(f"1. Backup pra-reset tersimpan di: {backup_file}")
    else:
        print("1. [DRY-RUN] Tidak membuat perubahan pada database.")

    conn = sqlite3.connect(str(db_path), timeout=20.0)
    conn.row_factory = sqlite3.Row
    try:
        tenant = conn.execute("SELECT * FROM school_tenants WHERE is_primary_owner = 1 ORDER BY id ASC LIMIT 1").fetchone()
        if not tenant:
            raise RuntimeError("Tenant utama MONSA-01 tidak ditemukan di school_tenants.")
        tid = tenant["id"]
        extra_tenants = conn.execute("SELECT COUNT(*) FROM school_tenants WHERE id != ?", (tid,)).fetchone()[0]

        counts_before = {
            "users": conn.execute("SELECT COUNT(*) FROM users WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "complaints": conn.execute("SELECT COUNT(*) FROM complaints WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "notification_logs": conn.execute("SELECT COUNT(*) FROM notification_logs WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "service_evaluations": conn.execute("SELECT COUNT(*) FROM service_evaluations WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "ikm_surveys": conn.execute("SELECT COUNT(*) FROM ikm_surveys WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "ikm_action_plans": conn.execute("SELECT COUNT(*) FROM ikm_action_plans WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "chat_logs": conn.execute("SELECT COUNT(*) FROM chat_logs WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "knowledge_base": conn.execute("SELECT COUNT(*) FROM knowledge_base WHERE tenant_id = ?", (tid,)).fetchone()[0],
            "extra_tenants": extra_tenants,
        }
        print("2. Ringkasan isi sebelum reset:", counts_before)

        if dry_run:
            print("3. [DRY-RUN] Akan menghapus data contoh & membuat akun resmi Admin + TPPK/Piket dengan PBKDF2 hash.")
            if extra_tenants:
                print(f"   Catatan: Terdapat {extra_tenants} tenant non-utama; gunakan --remove-extra-tenants untuk menghapusnya.")
            return

        cur = conn.cursor()
        for table in ("notification_logs", "complaints", "service_evaluations", "ikm_surveys", "ikm_action_plans", "chat_logs", "fkp_responses"):
            cur.execute(f"DELETE FROM {table} WHERE tenant_id = ?", (tid,))
        cur.execute("DELETE FROM users WHERE tenant_id = ?", (tid,))

        if remove_extra_tenants and extra_tenants > 0:
            for table in (
                "notification_logs", "complaints", "service_evaluations", "ikm_surveys",
                "ikm_action_plans", "chat_logs", "fkp_responses", "fkp_polls",
                "public_transparency_items", "knowledge_base", "users",
            ):
                cur.execute(f"DELETE FROM {table} WHERE tenant_id != ?", (tid,))
            cur.execute("DELETE FROM school_tenants WHERE id != ?", (tid,))

        ts = now_iso()
        cur.execute(
            """
            INSERT INTO users (
                tenant_id, full_name, phone_or_email, password_hash, role,
                student_name, student_class, bio_note, verification_status, created_at
            ) VALUES (?, ?, ?, ?, 'admin_sekolah', '', '', ?, 'verified', ?)
            """,
            (
                tid,
                "Andi Windayani, S.Pd., M.Pd. (Kepsek/Admin)",
                admin_email,
                hash_pw(admin_pw),
                "Kepala UPTD SPF SDN Unggulan Mongisidi 1 (NIP 198112072007012013)",
                ts,
            ),
        )
        cur.execute(
            """
            INSERT INTO users (
                tenant_id, full_name, phone_or_email, password_hash, role,
                student_name, student_class, bio_note, verification_status, created_at
            ) VALUES (?, ?, ?, ?, 'tppk_piket', '', '', ?, 'verified', ?)
            """,
            (
                tid,
                "Tim TPPK & Piket Sekolah",
                tppk_contact,
                hash_pw(tppk_pw),
                "Tim Pengelola Layanan, Pengaduan & TPPK (SK 421.2/047)",
                ts,
            ),
        )
        conn.commit()
        print("3. Reset produksi selesai! Database bersih, siap diluncurkan.")
        print(f"   - Akun Admin: {admin_email}")
        print(f"   - Akun TPPK/Piket: {tppk_contact}")
        print(f"   - Identitas sekolah ({tenant['tenant_code']}) & {counts_before['knowledge_base']} SOP Chatbot tetap dipertahankan.")
    finally:
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reset database SI-PAKAINGE MONSA untuk peluncuran produksi")
    parser.add_argument("--db", type=pathlib.Path, default=DEFAULT_DB)
    parser.add_argument("--admin-email", default="admin@monsa.sch.id")
    parser.add_argument("--admin-password", default="")
    parser.add_argument("--tppk-contact", default="081355982195")
    parser.add_argument("--tppk-password", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--remove-extra-tenants", action="store_true", help="Hapus juga tenant uji coba non-utama selain MONSA-01")
    args = parser.parse_args()

    if args.dry_run:
        reset_for_production(
            args.db, args.admin_email, "dry-run-placeholder", args.tppk_contact, "dry-run-placeholder",
            dry_run=True, remove_extra_tenants=args.remove_extra_tenants,
        )
    else:
        apw = args.admin_password.strip() or prompt_strong_pw("Kepala Sekolah / Admin")
        tpw = args.tppk_password.strip() or prompt_strong_pw("Tim TPPK & Piket Sekolah")
        if len(apw) < 8 or len(tpw) < 8:
            print("Error: Kata sandi produksi wajib minimal 8 karakter.")
            sys.exit(1)
        reset_for_production(
            args.db, args.admin_email, apw, args.tppk_contact, tpw,
            dry_run=False, remove_extra_tenants=args.remove_extra_tenants,
        )
