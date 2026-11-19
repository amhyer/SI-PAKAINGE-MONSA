"""Konfigurasi & rahasia server (Fase 4A) — diekstrak dari app.py.

PERINGATAN URUTAN (invariant spec §3.3): fungsi dan pemanggilan di bawah
berjalan berurutan saat modul dimuat — _load_dotenv() HARUS sebelum
SECRET_KEY = _resolve_secret_key(). Jangan memindahkan urutan ini.
"""
import os
import re
import secrets
import sys


def _load_dotenv(path: str = None) -> int:
    """Muat file .env secara manual (stdlib only) ke os.environ.

    - Nilai dari lingkungan yang SUDAH di-set tidak pernah ditimpa
      (kompatibel dengan EnvironmentFile= systemd & export shell).
    - Format sederhana: KEY=VALUE, komentar '#', kutip '"' atau "'" opsional.
    """
    if path is None:
        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        path = os.path.join(root, ".env")
    try:
        # utf-8-sig: toleran terhadap BOM UTF-8 yang ditambahkan Notepad
        # Windows / PowerShell saat menyimpan file .env (tanpa BOM tetap terbaca).
        with open(path, "r", encoding="utf-8-sig") as fh:
            lines = fh.readlines()
    except OSError:
        return 0
    loaded = 0
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", key):
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key not in os.environ:
            os.environ[key] = val
            loaded += 1
    return loaded


_load_dotenv()  # side-effect saat import: baca .env SEBELUM validasi kunci


def _is_production_mode() -> bool:
    env = os.environ.get("MONSA_ENV", "").strip().lower()
    return os.environ.get("MONSA_DISABLE_DEMO", "") == "1" or env in ("production", "prod")


def _resolve_secret_key() -> bytes:
    """K1: tidak ada kunci default di source code.

    Produksi tanpa kunci -> server menolak start (fail-fast).
    Pengembangan tanpa kunci -> kunci acak sementara + peringatan mencolok.
    """
    raw = os.environ.get("MONSA_SECRET_KEY", "").strip()
    if not raw:
        if _is_production_mode():
            sys.stderr.write(
                "[FATAL] MONSA_SECRET_KEY belum diatur tetapi server berjalan dalam mode produksi.\n"
                "        Token autentikasi tidak dapat dibuat tanpa kunci rahasia.\n"
                '        Buat kunci dengan: python3 -c "import secrets; print(secrets.token_hex(32))"\n'
                "        lalu setel MONSA_SECRET_KEY di file .env produksi.\n"
            )
            sys.stderr.flush()
            sys.exit(1)
        sys.stderr.write(
            "[PERINGATAN] MONSA_SECRET_KEY tidak diatur. Memakai kunci acak SEMENTARA:\n"
            "            seluruh sesi login akan kedaluwarsa saat server berhenti.\n"
            "            Setel MONSA_SECRET_KEY agar sesi bertahan antar-restart.\n"
        )
        sys.stderr.flush()
        return secrets.token_hex(32).encode("utf-8")
    if _is_production_mode() and len(raw) < 32:
        sys.stderr.write(
            "[FATAL] MONSA_SECRET_KEY terlalu pendek untuk mode produksi (minimal 32 karakter).\n"
        )
        sys.stderr.flush()
        sys.exit(1)
    return raw.encode("utf-8")


SECRET_KEY = _resolve_secret_key()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_BUNDLE_DIR = os.path.join(BASE_DIR, "web_bundle")
APP_VERSION = "2.2.3"
APP_VERSION_CODE = 223
MIN_SUPPORTED_VERSION_CODE = 200
APP_RELEASE_DATE = "2026-11-17"


def build_app_info() -> dict:
    return {
        "app_name": "SI-PAKAINGE MONSA",
        "subtitle": "Sistem Pengaduan & Aspirasi Sekolah Akuntabel, Inklusif, dan Gerak Cepat",
        "version": APP_VERSION,
        "version_code": APP_VERSION_CODE,
        "min_supported_code": MIN_SUPPORTED_VERSION_CODE,
        "release_date": APP_RELEASE_DATE,
        "owner": "UPTD SPF SD Negeri Unggulan Mongisidi 1",
        "npsn": "40313912",
        "android_package": "id.makassar.monsalapor",
        "min_android": "Android 6.0 (API 23)",
        "target_android": "Android 15 (API 35)",
        "apk_download_url": os.environ.get("MONSA_APK_URL", "").strip(),
        "web_url": os.environ.get("MONSA_WEB_URL", "").strip(),
        "specs": [
            {"label": "Platform", "value": "Web PWA + HTML Portabel + Capacitor Android APK/AAB"},
            {"label": "Database & Konkurensi", "value": "SQLite WAL Mode + Indeks Komposit + ThreadingHTTPServer + Atomic Ticket Lock"},
            {"label": "Keamanan Akun", "value": "PBKDF2-HMAC-SHA256 (100.000 iterasi), Token HMAC-SHA256 + token_version, & Rate Limiter IP"},
            {"label": "Privasi & Perlindungan Data", "value": "Mode Anonim Pelapor (UU PDP) + Validasi Ketat Foto JPG/PNG/WebP & Pesan Suara"},
            {"label": "Kepatuhan Regulasi", "value": "PEKPPP 6 Aspek + FKP Digital + PPID Sekolah, PermenPAN-RB 14/2017 (IKM 9 Unsur), Permendikbudristek 46/2023 (TPPK), Perwali Makassar 68/2021"},
            {"label": "Aksesibilitas & Inklusi", "value": "Prioritas Disabilitas LAKSA+, Mode Anak & Tombol Darurat TPPK, Kontras Tinggi, Huruf Besar Aa+, Bahasa Makassar-Indonesia, Dikte/TTS/Voice Note, & Offline Auto-Sync"},
        ],
        "changelog": [
            {
                "version": "2.2.3",
                "code": 223,
                "date": "2026-11-17",
                "notes": [
                    "Perbaikan skema field ekspor CSV Monev fallback agar identik dengan server (pelapor UU PDP, badge SLA, & uraian pengaduan).",
                    "Penguatan konkurensi & SQLite: 9 indeks komposit, koneksi aman try/finally, race-free guest user creation, & eksekusi webhook/SMTP setelah transaksi DB ditutup.",
                    "Penambahan rate limiter pada /api/auth/register, /api/chat, dan /api/auth/demo-switch, header keamanan HTTP mandiri, serta seeding otomatis SOP/PPID/FKP untuk tenant baru.",
                    "Penyelarasan penuh localFallback.js (batas audio 750 KB, md_cell, token_version, crypto PIN), aksesibilitas pinch-zoom viewport, pilihan Galeri/Kamera, & badge SLA lacak tamu.",
                ],
            },
            {
                "version": "2.2.2",
                "code": 222,
                "date": "2026-11-17",
                "notes": [
                    "Pencabutan token sesi otomatis (token_version) saat ganti kata sandi, reset sandi admin, atau penangguhan akun, serta validasi tenant_id pada token.",
                    "Penguatan rate limiter anti-spoofing X-Forwarded-For (hanya dipercaya dari proxy lokal) & pembersihan memori otomatis, plus respons 413 Payload Too Large.",
                    "Pelindung antrean laporan offline (hanya menghapus item yang sukses terkirim), kompresi adaptif foto <=900 KB, dan panel Lacak QR/PIN tetap tampil saat sedang login.",
                    "Paginasi multi-halaman PDF Berita Acara RTL SKM, kelengkapan daftar tiket pada ekspor CSV offline, serta validasi URL server APK.",
                ],
            },
            {
                "version": "2.2.1",
                "code": 221,
                "date": "2026-11-17",
                "notes": [
                    "Penguatan keamanan & integritas: rate limit IP pada endpoint tamu & FKP, sanitasi CSV anti-formula injection, serta pencegahan silent fallback jaringan.",
                    "Penambahan izin mikrofon & kamera pada AndroidManifest.xml untuk Voice Note & Dikte di APK Android.",
                    "Perbaikan kontras tombol aktif Mode Kontras Tinggi, pembaruan cache Service Worker PWA, multi-halaman otomatis PDF FKP, dan UI Edit PPID / Topik FKP Admin.",
                ],
            },
            {
                "version": "2.2.0",
                "code": 220,
                "date": "2026-11-17",
                "notes": [
                    "Tag Kebutuhan Khusus Disabilitas (Penglihatan, Pendengaran, Mobilitas, Lansia) & Antrean Prioritas Inklusi.",
                    "Mode Kontras Tinggi (High-Contrast) untuk low vision serta Toggle Bahasa Ramah Makassar–Indonesia (Sipakainge).",
                    "Mode Anak & Tombol Lapor Darurat TPPK 1-Ketuk dengan pilihan perasaan/dampak serta lokasi cepat.",
                    "Kartu Lacak Cepat QR Code + Tautan 1-Klik (?tiket=...&pin=...) untuk pelapor tamu.",
                    "Lampiran Pesan Suara (Voice Note) langsung di formulir aduan bagi pelapor yang kesulitan mengetik.",
                    "Papan Transparansi Publik (PPID Sekolah) & Forum Konsultasi Publik (FKP) Digital + Draft Berita Acara FKP PDF.",
                ],
            },
            {
                "version": "2.1.0",
                "code": 210,
                "date": "2026-11-17",
                "notes": [
                    "Penguatan produksi: SQLite WAL mode, PBKDF2-HMAC-SHA256 100k iterasi, login rate limiter 429, serta validasi ketat foto JPG/PNG/WebP.",
                    "Fitur Ubah Kata Sandi pengguna & Reset Sandi Admin di tab Akun.",
                    "Mekanisme Cek Pembaruan Otomatis (APK & PWA) serta jendela Spesifikasi Aplikasi & Riwayat Rilis.",
                    "Pengaturan Koneksi Server Pusat Sekolah untuk perangkat APK Android dan ikon/splash screen resmi MONSA.",
                ],
            },
            {
                "version": "2.0.0",
                "code": 200,
                "date": "2026-11-16",
                "notes": [
                    "Peluncuran 3 fitur PEKPPP: Penghitung SLA <=24 Jam, Survei IKM 9 Unsur + Poster Grade A/B/C/D PDF, dan Etalase Standar Pelayanan & Maklumat Rp 0.",
                    "Tab khusus staf Hasil & Nilai, Ekspor PDF Kop Surat A4, dan Notifikasi 2-arah terintegrasi WA/Email.",
                ],
            },
            {
                "version": "1.0.0",
                "code": 100,
                "date": "2026-11-14",
                "notes": [
                    "Rilis awal SI-PAKAINGE MONSA untuk UPTD SPF SD Negeri Unggulan Mongisidi 1 dengan Chatbot Pengetahuan & Pelaporan Anonim.",
                ],
            },
        ],
    }
