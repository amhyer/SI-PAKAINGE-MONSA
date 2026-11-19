# Pemecahan `server/app.py` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memecah `server/app.py` (2.549 baris) menjadi 12 modul flat di `server/` dengan permukaan eksternal identik (entry point, `import app`, API HTTP, side-effect order).

**Architecture:** Modul leaf (`config`, `ratelimit`, `security`, `complaints_lib`, `sla`, `notify`, `metrics`) diekstrak lebih dulu, lalu `SikolaHandler` dipecah menjadi `SikolaHandlerBase` + 4 mixin per domain; `app.py` tersisa sebagai rakitan kelas + routing `do_*` + blok re-export + `main()`. Grafik impor satu arah (leaf → handler → app), tanpa siklus.

**Tech Stack:** Python 3.14 (stdlib only untuk runtime), pytest 9 (test), pyflakes (gerbang statis), git (commit per langkah).

**Spec:** `docs/superpowers/specs/2026-11-19-app-py-split-design.md` — plan ini berargumen dari spec; eksekutor membaca keduanya.

## Global Constraints

- Entry point beku: `python3 server/app.py`; `README.md`, `docs/Panduan-*.md`, `scripts/dev_local.py` **tidak diubah**.
- Urutan side-effect: `_load_dotenv()` dieksekusi **sebelum** `SECRET_KEY = _resolve_secret_key()` saat modul dimuat.
- State global tunggal (objek identik, mutasi in-place): `_NOTIF_QUEUE`, `_NOTIF_WORKER`, `LOGIN_ATTEMPTS`, `RATE_LIMIT_LOCK`, `TICKET_LOCK`.
- `BASE_DIR`/`WEB_BUNDLE_DIR` dihitung dari `__file__` → semua modul baru **flat di `server/`**.
- DAG: modul leaf tidak boleh mengimpor `handler_*` atau `app`; tidak ada modul baru yang mengimpor `app`.
- `SikolaHandler._redact` tetap classmethod (dipanggil sebagai `app_mod.SikolaHandler._redact`).
- Kontrak re-export: 57 nama di `app.py.__all__` (38 fungsi + 4 kelas + 15 global — daftar lengkap di Task 14).
- Target ukuran: `app.py` ≤ ±450 baris (gerbang tes: ≤500), tiap modul ≤ ±600 (gerbang tes: ≤650).
- **Bebas refactor isi**, tetapi DILARANG mengubah route/status/header/JSON, semantik keamanan (K1–K6, IDOR, isolasi tenant, redaksi K4), serta menyentuh `db.py`, `chatbot.py`, frontend, dan DB asli.
- Gerbang hijau setelah **setiap** langkah ekstraksi: `python -m pyflakes server` exit 0 **dan** `python -m pytest server/tests -q` lulus **dan** `py_compile` OK.
- Commit granular per langkah; pesan commit jelas (bahasa Indonesia).

## Review Focus

Lima kondisi yang paling mungkin menggigit, dan test yang menguncinya:

1. **Nama tak-terdefinisi di handler yang tanpa test** (mis. `handle_export_monev`, `handle_chat`, `handle_create_ikm_rtl`) → NameError → 500 senyap. *Mengunci:* gerbang `pyflakes server` exit 0 di **setiap** task ekstraksi (pyflakes menandai `undefined name` di seluruh berkas, termasuk yang tak pernah dipanggil test).
2. **Metode `handle_*` lupa dirakit** (dipindah ke mixin tapi kelas tak mewarisi) → route tertentu 500. *Mengunci:* `test_routing_lengkap` (Task 1) — regex `self.handle_*`/`self.serve_static` atas `app.py` → wajib `hasattr` di `SikolaHandler`; diperkuat `test_struktur_modul` (Task 14) yang melarang `def handle_*` tersisa di `app.py`.
3. **Duplikasi nama `handle_*` antar mixin** (shadowing diam-diam via MRO). *Mengunci:* `test_tidak_ada_handle_duplikat` (Task 1) — `glob("handler_*.py")`, tiap nama `def handle_*`/`serve_static` wajib muncul di tepat satu berkas.
4. **Urutan side-effect `.env` → `SECRET_KEY` patah** → K1/port salah sasaran. *Mengunci:* `test_load_dotenv_*` + seluruh `test_produksi_*`/`test_dev_*` (Task 2 menjalankannya), ditambah `test_permukaan` yang menuntut `SECRET_KEY` tetap ada di `app`.
5. **State global terduplikasi** (lock/dict beda instance) → rate-limit bocor atau notif tak terkirim. *Mengunci:* `test_brute_force_login_diblokir_429` + `test_demo_switch_*` (Task 3), `test_notifikasi_async_end_to_end` (Task 7) — dijalankan pada task yang memindah state tersebut.

---

## File Structure

**Dibuat (14 berkas):**

| Berkas | Tanggung jawab |
|---|---|
| `server/config.py` | dotenv, mode produksi, secret (K1), konstanta versi/path, `build_app_info` |
| `server/ratelimit.py` | lock + dict percobaan login, 5 fungsi rate-limit |
| `server/security.py` | token HMAC, sanitize, anti-SSRF, validator gambar/audio |
| `server/complaints_lib.py` | `TICKET_LOCK`, kode tiket, guest helper, masking anonim, kategori |
| `server/notify.py` | antrean + worker notifikasi, webhook/SMTP, `dispatch_*` |
| `server/sla.py` | perhitungan SLA murni (parse, hitung, enrich) |
| `server/metrics.py` | IKM, evaluasi, rekap publik, markdown monev |
| `server/handler_base.py` | `PayloadTooLargeError` + `SikolaHandlerBase` (header, JSON, IP, tenant, user) |
| `server/handler_admin.py` | `HandlerAdmin`: auth, user management, profil sekolah, tenant |
| `server/handler_complaints.py` | `HandlerComplaints`: CRUD pengaduan + tamu (IDOR/tenant guard) |
| `server/handler_reports.py` | `HandlerReports`: bootstrap, notifikasi, evaluasi/IKM, export monev |
| `server/handler_public.py` | `HandlerPublic`: FKP publik, transparansi, chatbot, static |
| `server/tests/test_module_surface.py` | kontrak 57 nama + routing lengkap + anti-duplikat (Task 1) |
| `server/tests/test_struktur_modul.py` | keberadaan 12 modul, tanpa impor-`app`, `app` tanpa `def handle_*`, ukuran (Task 14) |

**Diubah:** `server/app.py` (menyusut dari 2.549 → ±350), `requirements.txt` (+`pyflakes`).
**Dibuat (Task 15):** `scripts/regresi_smoke.py` (regresi 16 butir, alat ulang-pakai).
**Tidak disentuh:** `db.py`, `chatbot.py`, frontend, README/docs/skrip deploy, DB asli.

---

## Task 1: Fondasi Proteksi (pyflakes + test kontrak + sweep GET)

**Files:**
- Create: `server/tests/test_module_surface.py`
- Modify: `requirements.txt`

**Interfaces:**
- Consumes: —
- Produces: kontrak 57 nama `app`, daftar route `handle_*` yang harus ada di kelas; gerbang `python -m pyflakes server`.

- [ ] **Step 1: Pasang pyflakes & catat di requirements.txt**

```powershell
python -m pip install pyflakes --quiet --disable-pip-version-check
python -m pyflakes server   # WAJIB exit 0 sebelum mulai (baseline bersih)
```

Tambahkan baris berikut ke `requirements.txt` (di bawah baris pytest, komentar `# tool dev — tidak dipakai runtime`):

```
pyflakes>=3.2
```

- [ ] **Step 2: Tulis `server/tests/test_module_surface.py`**

```python
"""Kontrak permukaan modul app (Fase 4A) — ditulis SEBELUM app.py dipecah.

Mengunci: (1) 57 nama wajib tetap ada sebagai atribut modul `app`,
(2) setiap handler yang direferensikan routing wajib ada di kelas,
(3) tidak ada handle_* yang terdefinisi di lebih dari satu modul mixin.
"""
import re
from pathlib import Path

import app

SERVER_DIR = Path(__file__).resolve().parents[1]

# Spec §7: 38 fungsi + 4 kelas + 15 global.
KONTRAK = [
    # --- fungsi (38) ---
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
    # --- kelas (4) ---
    "PayloadTooLargeError", "SikolaHandler", "MonsaThreadingHTTPServer",
    "SikolaHandlerBase",
    # --- global (15) ---
    "SECRET_KEY", "BASE_DIR", "WEB_BUNDLE_DIR", "APP_VERSION",
    "APP_VERSION_CODE", "MIN_SUPPORTED_VERSION_CODE", "APP_RELEASE_DATE",
    "TICKET_LOCK", "RATE_LIMIT_LOCK", "LOGIN_ATTEMPTS",
    "RATE_LIMIT_MAX_ATTEMPTS", "RATE_LIMIT_WINDOW_SEC", "_NOTIF_QUEUE",
    "_NOTIF_WORKER", "IKM_ELEMENT_LABELS",
]


def test_permukaan_nama_tidak_berubah():
    hilang = [n for n in KONTRAK if not hasattr(app, n)]
    assert not hilang, f"nama hilang dari modul app: {hilang}"


def test_routing_lengkap_semua_handler_ada_di_kelas():
    src = (SERVER_DIR / "app.py").read_text(encoding="utf-8")
    dipakai = sorted(set(re.findall(r"self\.(handle_\w+|serve_static)", src)))
    assert dipakai, "regex tidak menemukan handler — pola routing berubah?"
    for nama in dipakai:
        assert hasattr(app.SikolaHandler, nama), (
            f"{nama} direferensikan routing tapi tidak ada di SikolaHandler"
        )


def test_tidak_ada_handle_duplikat_antar_modul_handler():
    files = sorted(SERVER_DIR.glob("handler_*.py"))
    if not files:
        return  # pra-ekstraksi: belum ada mixin
    definisi = {}
    for f in files:
        teks = f.read_text(encoding="utf-8")
        for nama in re.findall(r"^\s+def (handle_\w+|serve_static)\(", teks, re.M):
            definisi.setdefault(nama, []).append(f.name)
    dup = {k: v for k, v in definisi.items() if len(v) > 1}
    assert not dup, f"handle_* terdefinisi di banyak modul (shadowing): {dup}"
```

- [ ] **Step 3: Jalankan — harus LULUS langsung (mengunci kondisi lama)**

```powershell
python -m pytest server/tests -q
```

Expected: **72 passed** (54 lama + 3 kontrak + 15 sweep — sweep ada di Step 4; bila Step 4 belum dijalankan: 57 passed).

- [ ] **Step 4: Tulis `server/tests/test_endpoint_sweep.py` (sweep GET read-only)**

```python
"""Sweep GET seluruh route utama (read-only) — jaring pengaman ekstraksi handler.

Setiap handler GET wajib mengembalikan 200 pada data seed. Test ini yang
menangkap route yang rusak tapi tidak disentuh test lain (monev, ikm/rtl, dll).
"""
import pytest


@pytest.fixture(scope="module")
def admin_token(live_server):
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    return data["token"]


GET_PUBLIK = [
    "/api/health", "/api/app-info", "/api/public-recap",
    "/api/public/fkp", "/",
]
GET_AUTH = [
    "/api/bootstrap", "/api/complaints", "/api/evaluations", "/api/ikm",
    "/api/ikm/rtl", "/api/notifications", "/api/reports/monev",
    "/api/tenants", "/api/auth/me", "/api/admin/users",
]


@pytest.mark.parametrize("path", GET_PUBLIK)
def test_get_publik_200(live_server, path):
    status, _, _ = live_server.request("GET", path)
    assert status == 200, f"{path} -> {status}, seharusnya 200"


@pytest.mark.parametrize("path", GET_AUTH)
def test_get_admin_200(live_server, admin_token, path):
    status, _, _ = live_server.request("GET", path, token=admin_token)
    assert status == 200, f"{path} -> {status}, seharusnya 200"
```

- [ ] **Step 5: Jalankan lagi — semua lulus**

```powershell
python -m pytest server/tests -q
python -m pyflakes server
```

Expected: **72 passed**, pyflakes exit 0.
Bila ada GET yang bukan 200 pada baseline: selidiki dulu — kemungkinan route itu butuh query/tenant khusus; sesuaikan daftar sweep (jangan menulis ekspektasi keliru), dan catat temuannya.

- [ ] **Step 6: Commit**

```powershell
git add requirements.txt server/tests/test_module_surface.py server/tests/test_endpoint_sweep.py
git commit -m "test: kontrak permukaan modul app + sweep endpoint (fondasi Fase 4A)"
```

---

## Task 2: Ekstrak `config.py`

**Files:**
- Create: `server/config.py`
- Modify: `server/app.py` (hapus fungsi/konstanta yang pindah; tambah impor)

**Interfaces:**
- Consumes: —
- Produces: `config` module-level execution: `_load_dotenv()` → `SECRET_KEY`; nama yang diekspor ke `app`: `_load_dotenv`, `_is_production_mode`, `_resolve_secret_key`, `SECRET_KEY`, `BASE_DIR`, `WEB_BUNDLE_DIR`, `APP_VERSION`, `APP_VERSION_CODE`, `MIN_SUPPORTED_VERSION_CODE`, `APP_RELEASE_DATE`, `build_app_info`.

- [ ] **Step 1: Buat `server/config.py`**

```python
"""Konfigurasi & rahasia server (Fase 4A) — diekstrak dari app.py.

PERINGATAN URUTAN (invariant spec §3.3): fungsi dan pemanggilan di bawah
berjalan berurutan saat modul dimuat — _load_dotenv() HARUS sebelum
SECRET_KEY = _resolve_secret_key(). Jangan memindahkan urutan ini.
"""
import os
import secrets
import sys


def _load_dotenv(path: str = None) -> int:
    # ... POTONG apa adanya dari app.py (baris 29-62 pada baseline f6d08c2) ...


_load_dotenv()  # side-effect saat import: baca .env SEBELUM validasi kunci


def _is_production_mode() -> bool:
    # ... potong dari app.py baris 144-146 ...


def _resolve_secret_key() -> bytes:
    # ... potong dari app.py baris 149-179 (termasuk fail-fast K1) ...


SECRET_KEY = _resolve_secret_key()
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB_BUNDLE_DIR = os.path.join(BASE_DIR, "web_bundle")
APP_VERSION = "2.2.3"
APP_VERSION_CODE = 223
MIN_SUPPORTED_VERSION_CODE = 200
APP_RELEASE_DATE = "2026-11-17"


def build_app_info() -> dict:
    # ... potong dari app.py baris 191-289 ...
```

Cara memotong: `git show f6d08c2:server/app.py | Select-String -Pattern "def _load_dotenv"` untuk lokasi baseline, atau `grep -n "def _load_dotenv" server/app.py` untuk posisi saat ini. **Pindahkan isi fungsi apa adanya** (boleh rapikan komentar, dilarang mengubah logika).

- [ ] **Step 2: Hubungkan `app.py`**

Hapus dari `app.py`: definisi `_load_dotenv`, pemanggilan `_load_dotenv()`, `_is_production_mode`, `_resolve_secret_key`, `SECRET_KEY`, `BASE_DIR`, `WEB_BUNDLE_DIR`, `APP_VERSION*`, `APP_RELEASE_DATE`, `build_app_info`. Tambahkan blok impor ini **tepat setelah** `sys.path.insert(...)` (urutan ini menjaga `.env` terbaca saat `app` diimpor):

```python
from config import (
    APP_RELEASE_DATE, APP_VERSION, APP_VERSION_CODE, BASE_DIR,
    MIN_SUPPORTED_VERSION_CODE, SECRET_KEY, WEB_BUNDLE_DIR,
    _is_production_mode, _load_dotenv, _resolve_secret_key, build_app_info,
)
```

- [ ] **Step 3: Gerbang statis**

```powershell
python -m pyflakes server
```

Expected: exit 0. Bila `undefined name X` → tambahkan impor `X` ke `config.py`. Bila `imported but unused` di `app.py` → nama itu hanya re-export: biarkan dulu (Task 14 membereskan dengan `__all__`) **kecuali** bukan bagian kontrak 57 nama — hapus. Ulangi hingga exit 0.

- [ ] **Step 4: Gerbang dinamis**

```powershell
python -m pytest server/tests -q
python -m py_compile server/app.py server/config.py
```

Expected: **72 passed**, py_compile OK. Khusus untuk task ini, test yang mengunci invariant: `test_load_dotenv_*`, `test_load_dotenv_toleran_bom`, `test_produksi_*`, `test_dev_*`, `test_permukaan_nama_tidak_berubah` — semuanya ada dalam 72.

- [ ] **Step 5: Commit**

```powershell
git add server/config.py server/app.py
git commit -m "refactor: ekstrak config.py (dotenv, secret K1, konstanta, app-info)"
```

---

## Task 3: Ekstrak `ratelimit.py`

**Files:**
- Create: `server/ratelimit.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: —
- Produces: `RATE_LIMIT_LOCK`, `LOGIN_ATTEMPTS`, `RATE_LIMIT_MAX_ATTEMPTS`, `RATE_LIMIT_WINDOW_SEC`, `_prune_rate_limits_locked`, `is_login_rate_limited`, `record_failed_login`, `clear_failed_login`, `check_and_record_ip_rate_limit` (dipakai `handler_admin`, `handler_complaints`, dan re-export `app`).

- [ ] **Step 1: Buat `server/ratelimit.py`**

```python
"""Rate-limit percobaan login & pendaftaran (Fase 4A) — diekstrak dari app.py.

SATU instance lock+dict untuk seluruh proses (invariant spec §3.4):
modul lain hanya mengimpor, jangan pernah membuat lock/dict baru.
"""
import threading
import time


RATE_LIMIT_LOCK = threading.Lock()
LOGIN_ATTEMPTS = {}  # key -> [timestamps]
RATE_LIMIT_MAX_ATTEMPTS = 10
RATE_LIMIT_WINDOW_SEC = 300


def _prune_rate_limits_locked(now: float):
    # ... potong dari app.py (baseline 301-309) ...

def is_login_rate_limited(key: str) -> bool:
    # ... potong (baseline 312-321) ...

def record_failed_login(key: str):
    # ... potong (baseline 324-331) ...

def clear_failed_login(key: str):
    # ... potong (baseline 333-335) ...

def check_and_record_ip_rate_limit(bucket: str, ip: str, max_hits: int, window_sec: int = 300) -> bool:
    # ... potong (baseline 338-350) ...
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus blok lock/dict + 5 fungsi; tambahkan:

```python
from ratelimit import (
    LOGIN_ATTEMPTS, RATE_LIMIT_LOCK, RATE_LIMIT_MAX_ATTEMPTS,
    RATE_LIMIT_WINDOW_SEC, _prune_rate_limits_locked,
    check_and_record_ip_rate_limit, clear_failed_login, is_login_rate_limited,
    record_failed_login,
)
```

- [ ] **Step 3: Gerbang statis** — `python -m pyflakes server` → exit 0 (recovery seperti Task 2).

- [ ] **Step 4: Gerbang dinamis** — `python -m pytest server/tests -q` + `py_compile` → **72 passed**. Pengunci perilaku task ini: `test_brute_force_login_diblokir_429` (K3), `test_demo_switch_*`, `test_register` (isolasi tenant) — semua harus lulus (bukti satu-instance state bekerja lintas modul).

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak ratelimit.py (state global K3 satu instance)"`

---

## Task 4: Ekstrak `security.py`

**Files:**
- Create: `server/security.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `config.SECRET_KEY`
- Produces: `create_token(user_id, role, tenant_id, token_version=1) -> str`, `verify_token(token) -> dict|None`, `sanitize_user(row) -> dict`, `sanitize_school(row, include_secrets=False) -> dict`, `is_safe_https_webhook(url) -> bool`, `is_valid_image_data(d) -> bool`, `is_valid_audio_data(d) -> bool`.

- [ ] **Step 1: Buat `server/security.py`**

```python
"""Kriptografi token, sanitasi output, dan validasi anti-SSRF/media (Fase 4A)."""
import base64
import hashlib
import hmac
import json
import time

from config import SECRET_KEY
from db import open_conn


def create_token(user_id: int, role: str, tenant_id: int, token_version: int = 1) -> str:
    # ... potong dari app.py (baseline 353-359) ...

def verify_token(token: str):
    # ... potong (baseline 363-385) — membaca role DARI DB ...

def sanitize_user(row) -> dict:
    # ... potong (baseline 388-393) ...

def sanitize_school(row, include_secrets: bool = False) -> dict:
    # ... potong (baseline 395-400) ...

def is_safe_https_webhook(url: str) -> bool:
    # ... potong (baseline 402-423) ...

def is_valid_image_data(photo_data: str) -> bool:
    # ... potong (baseline 425-433) ...

def is_valid_audio_data(audio_data: str) -> bool:
    # ... potong (baseline 435-447) ...
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus ketujuh fungsi; tambahkan:

```python
from security import (
    create_token, is_safe_https_webhook, is_valid_audio_data,
    is_valid_image_data, sanitize_school, sanitize_user, verify_token,
)
```

- [ ] **Step 3: Gerbang statis** — `python -m pyflakes server` → exit 0.

- [ ] **Step 4: Gerbang dinamis** — `python -m pytest server/tests -q` + `py_compile` → **72 passed**. Pengunci: `test_token_*` (6 tes), `test_token_key_lama_ditolak` (K1 live), `test_permukaan_nama_tidak_berubah`.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak security.py (token HMAC, sanitize, anti-SSRF)"`

---

## Task 5: Ekstrak `complaints_lib.py`

**Files:**
- Create: `server/complaints_lib.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `db.hash_pw`, `db.now_iso`
- Produces: `TICKET_LOCK`, `get_or_create_guest_user_id(conn, school) -> int`, `mask_anonymous_complaint(d, viewer_user_id=None) -> dict`, `next_ticket_code(conn, prefix) -> str`, `route_category(category, needs_priority=False) -> str`, `normalize_wa_number(raw) -> str`.

- [ ] **Step 1: Buat `server/complaints_lib.py`**

```python
"""Domain pengaduan: kode tiket, akun tamu, masking anonim, kategori (Fase 4A).

TICKET_LOCK = SATU lock untuk seluruh proses (invariant spec §3.4).
"""
import secrets
import threading

from db import hash_pw, now_iso


TICKET_LOCK = threading.Lock()


def get_or_create_guest_user_id(conn, school: dict) -> int:
    # ... potong dari app.py (baseline 449-467) ...

def mask_anonymous_complaint(d: dict, viewer_user_id=None) -> dict:
    # ... potong (baseline 469-476) ...

def next_ticket_code(conn, prefix: str) -> str:
    # ... potong (baseline 478-485) ...

def route_category(category: str, needs_priority: bool = False) -> str:
    # ... potong (baseline 487-499) ...

def normalize_wa_number(raw: str) -> str:
    # ... potong (baseline 501-506) ...
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus `TICKET_LOCK` + kelima fungsi; tambahkan:

```python
from complaints_lib import (
    TICKET_LOCK, get_or_create_guest_user_id, mask_anonymous_complaint,
    next_ticket_code, normalize_wa_number, route_category,
)
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: `test_get_publik_200`/`test_get_admin_200` (masking & kategori dipakai daftar), `test_isolasi_antar_tenant` (guest/tenant path).

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak complaints_lib.py (kode tiket, guest, masking)"`

---

## Task 6: Ekstrak `sla.py`

**Files:**
- Create: `server/sla.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: —
- Produces: `parse_iso_dt(raw) -> datetime|None`, `_fmt_hours_id(hours_float) -> str`, `compute_complaint_sla(item, sla_hours=24) -> dict`, `enrich_complaint_sla(d, sla_hours=24) -> dict` (mutasi `d["sla_info"]` lalu mengembalikan `d`).

- [ ] **Step 1: Buat `server/sla.py`**

```python
"""Perhitungan SLA <= 24 jam (Fase 4A) — fungsi murni, stdlib saja."""
from datetime import datetime


def parse_iso_dt(raw):
    # ... potong dari app.py (baseline 678-686) ...

def _fmt_hours_id(hours_float: float) -> str:
    # ... potong (baseline 688-695) ...

def compute_complaint_sla(item: dict, sla_hours: int = 24) -> dict:
    # ... potong (baseline 697-758) ...

def enrich_complaint_sla(d: dict, sla_hours: int = 24) -> dict:
    # ... potong (baseline 760-764) ...
```

Bila pyflakes menandai `timedelta` (dipakai di dalam tubuh fungsi), tambahkan: `from datetime import datetime, timedelta`.

- [ ] **Step 2: Hubungkan `app.py`** — hapus keempat fungsi; tambahkan:

```python
from sla import _fmt_hours_id, compute_complaint_sla, enrich_complaint_sla, parse_iso_dt
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: `test_get_admin_200` (`/api/complaints` memakai `enrich_complaint_sla`), `test_endpoint_sweep` seluruhnya.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak sla.py (hitungan SLA murni)"`

---

## Task 7: Ekstrak `notify.py`

**Files:**
- Create: `server/notify.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `security.is_safe_https_webhook` (bila dipakai dispatch), `db.open_conn`/`db.now_iso` (status log)
- Produces: `_NOTIF_QUEUE`, `_NOTIF_WORKER`, `_post_webhook(url, payload) -> bool`, `_send_smtp_email(...) -> bool`, `_update_notif_status(log_id, status)`, `_notif_worker_loop()`, `_enqueue_notif(job, fallback=None)`, `dispatch_notifications(school, item) -> dict`, `dispatch_reporter_notification(school, item, reporter_contact="") -> dict`.

- [ ] **Step 1: Buat `server/notify.py`**

```python
"""Notifikasi 2-arah (webhook/SMTP) + worker asinkron (Fase 4A).

_NOTIF_QUEUE/_NOTIF_WORKER = SATU instance untuk seluruh proses
(invariant spec §3.4); worker dinyalakan malas oleh _enqueue_notif.
"""
import json
import os
import queue
import smtplib
import threading
import time
import urllib.request
from email.mime.text import MIMEText

from db import now_iso, open_conn


_NOTIF_QUEUE = queue.Queue(maxsize=200)
_NOTIF_WORKER = None


def _post_webhook(webhook_url: str, payload: dict) -> bool:
    # ... potong dari app.py (baseline 74-86) ...

def _send_smtp_email(to_addr: str, subject: str, body_text: str, from_addr: str = "") -> bool:
    # ... potong (baseline 88-106) ...

def _update_notif_status(log_id: int, status: str):
    # ... potong (baseline 108-115) ...

def _notif_worker_loop():
    # ... potong (baseline 117-126) ...

def _enqueue_notif(job, fallback=None):
    # ... potong (baseline 128-142) ...

def dispatch_notifications(school: dict, item: dict) -> dict:
    # ... potong (baseline 508-583) ...

def dispatch_reporter_notification(school: dict, item: dict, reporter_contact: str = "") -> dict:
    # ... potong (baseline 585-676) ...
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus ketujuh definisi + dua global; tambahkan:

```python
from notify import (
    _NOTIF_QUEUE, _NOTIF_WORKER, _enqueue_notif, _notif_worker_loop,
    _post_webhook, _send_smtp_email, _update_notif_status,
    dispatch_notifications, dispatch_reporter_notification,
)
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0. `imported but unused` untuk `_NOTIF_WORKER`/`_post_webhook`/dst. di `app.py` = re-export kontrak → biarkan (Task 14 membereskannya via `__all__`).

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. **Pengunci kritis task ini:** `test_notifikasi_async_end_to_end` (respons cepat → worker `terkirim_webhook` → payload diterima receiver) dan `test_tanpa_webhook_status_tetap_tercatat` — gagal = worker/antrean rusak, jangan lanjut.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak notify.py (worker asinkron, webhook, SMTP)"`

---

## Task 8: Ekstrak `metrics.py`

**Files:**
- Create: `server/metrics.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `sla.compute_complaint_sla`
- Produces: `IKM_ELEMENT_LABELS`, `get_ikm_grade(score, count) -> tuple`, `compute_ikm_summary(conn, tid) -> dict`, `compute_evaluation_summary(conn, tid) -> dict`, `compute_public_recap(conn, tid) -> dict`, `build_monev_markdown(school, recap, complaints) -> str`.

- [ ] **Step 1: Buat `server/metrics.py`**

```python
"""Agregasi IKM 9 unsur, evaluasi, rekap publik, dan markdown monev (Fase 4A)."""
from collections import Counter

from sla import compute_complaint_sla


IKM_ELEMENT_LABELS = [
    # ... potong dari app.py (baseline 765-776) ...
]


def get_ikm_grade(score: float, count: int) -> tuple:
    # ... potong (baseline 778-788) ...

def compute_ikm_summary(conn, tid: int) -> dict:
    # ... potong (baseline 790-831) ...

def compute_evaluation_summary(conn, tid: int) -> dict:
    # ... potong (baseline 833-847) ...

def compute_public_recap(conn, tid: int) -> dict:
    # ... potong (baseline 849-916) ...

def build_monev_markdown(school: dict, recap: dict, complaints: list) -> str:
    # ... potong (baseline 918-984, termasuk fungsi lokal md_cell) ...
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus keenam definisi; tambahkan:

```python
from metrics import (
    IKM_ELEMENT_LABELS, build_monev_markdown, compute_evaluation_summary,
    compute_ikm_grade, compute_public_recap, get_ikm_grade,
)
```

(Catatan: `compute_ikm_summary` ikut masuk daftar — lihat Step 3.)

Perbaiki impor bila berbeda: daftar pasti = `IKM_ELEMENT_LABELS, build_monev_markdown, compute_evaluation_summary, compute_ikm_summary, compute_public_recap, get_ikm_grade`.

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0; `imported but unused` = re-export kontrak → biarkan.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: `test_get_admin_200` untuk `/api/evaluations`, `/api/ikm`, `/api/ikm/rtl`, `/api/reports/monev` (semua memanggil metrics) + `test_get_publik_200` `/api/public-recap`.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak metrics.py (IKM, evaluasi, rekap, monev)"`

---

## Task 9: Ekstrak `handler_base.py` (SikolaHandlerBase)

**Files:**
- Create: `server/handler_base.py`
- Modify: `server/app.py` (kelas `SikolaHandler` mewarisi `SikolaHandlerBase`)

**Interfaces:**
- Consumes: `security.verify_token`, `db.open_conn`
- Produces: `PayloadTooLargeError(ValueError)`; `SikolaHandlerBase(BaseHTTPRequestHandler)` dengan: `_redact` (classmethod), `log_message`, `send_security_headers`, `send_csp_header`, `send_cors_headers`, `send_json`, `send_text_download`, `_trusted_proxies`, `get_client_ip`, `read_json_body`, `get_tenant`, `get_current_user`.

- [ ] **Step 1: Buat `server/handler_base.py`**

```python
"""Fondasi handler HTTP: header keamanan, JSON, IP klien, tenant, user (Fase 4A).

_REDact memakai cls._SENSITIVE_QS_RE yang tetap didefinisikan di kelas
akhir (app.py) — resolusi lewat MRO pada runtime (spec §6).
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from db import open_conn
from security import verify_token


class PayloadTooLargeError(ValueError):
    pass


class SikolaHandlerBase(BaseHTTPRequestHandler):
    # ... PINDAHKAN utuh dari kelas SikolaHandler di app.py (baseline 993-1157):
    #   _redact (classmethod), log_message, send_security_headers,
    #   send_csp_header, send_cors_headers, send_json, send_text_download,
    #   _trusted_proxies, get_client_ip, read_json_body, get_tenant,
    #   get_current_user
    # JANGAN pindahkan: server_version, _SENSITIVE_QS_RE (tetap di app.py),
    # do_* (tetap di app.py).
```

- [ ] **Step 2: Hubungkan `app.py`**

Hapus kedua kelas `PayloadTooLargeError` lama dan kedua belas metode yang pindah dari badan `SikolaHandler`. Ubah deklarasi kelas + tambah impor:

```python
from handler_base import PayloadTooLargeError, SikolaHandlerBase

class SikolaHandler(SikolaHandlerBase, BaseHTTPRequestHandler):
    server_version = "SiPakaingeMonsaServer/2.2.3"
    _SENSITIVE_QS_RE = re.compile(r"(?i)\b(pin|token|secret|password|api_key)=[^&\s\"']*")
    # ... sisa: do_OPTIONS, do_HEAD, do_GET, do_POST, do_PUT, do_PATCH + handle_* yang belum dipindah ...
```

(`PayloadTooLargeError` tetap dipakai `do_POST/do_PUT/do_PATCH` → impor dipakai, bukan sekadar re-export.)

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci kritis: `test_csp_ketat_di_html`, `test_hsts_dikirim_di_html`, `test_cors_*` (4 tes), `test_pin_tamu_tidak_bocor_ke_log` (K4 `_redact`!), `test_header_dasar_keamanan_selalu_ada`, `test_routing_lengkap_semua_handler_ada_di_kelas`.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak handler_base.py (header, JSON, IP, tenant, user)"`

---

## Task 10: Ekstrak `handler_admin.py`

**Files:**
- Create: `server/handler_admin.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `security.create_token`; `ratelimit.is_login_rate_limited/record_failed_login/clear_failed_login/check_and_record_ip_rate_limit`; `db.hash_pw/verify_pw/needs_rehash/now_iso/open_conn/seed_tenant_defaults`; `secrets`
- Produces: `class HandlerAdmin` (murni, tanpa induk) berisi: `handle_update_school_profile(self, body, qs)`, `handle_create_tenant(self, body)`, `handle_register(self, body, qs)`, `handle_login(self, body, qs)`, `handle_change_password(self, body)`, `handle_demo_switch(self, body)`, `handle_get_users(self, qs)`, `handle_verify_user(self, uid, body)`, `handle_admin_reset_password(self, uid, body)`.

- [ ] **Step 1: Buat `server/handler_admin.py`**

```python
"""Handler identitas & administrasi: auth, user, profil sekolah, tenant (Fase 4A)."""
import secrets

from db import (
    hash_pw, needs_rehash, now_iso, open_conn, seed_tenant_defaults, verify_pw,
)
from ratelimit import (
    check_and_record_ip_rate_limit, clear_failed_login, is_login_rate_limited,
    record_failed_login,
)
from security import create_token


class HandlerAdmin:
    # ... PINDAHKAN utuh 9 metode handle_* dari SikolaHandler (app.py):
    #   handle_update_school_profile (baseline 1489), handle_create_tenant (1547),
    #   handle_register (1594), handle_login (1635), handle_change_password (1659),
    #   handle_demo_switch (1680), handle_get_users (2267),
    #   handle_verify_user (2284), handle_admin_reset_password (2307)
    # Indentasi tetap 4 spasi (badan kelas). self.* dibiarkan — method lain
    # diselesaikan lewat MRO kelas akhir.
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus kesembilan metode; ubah deklarasi:

```python
from handler_admin import HandlerAdmin

class SikolaHandler(HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0 (`undefined name` di `handler_admin.py` = impor kurang → tambahkan).

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: seluruh `test_demo_switch_*` (5), `test_brute_force_*`, `test_isolasi_antar_tenant` (create tenant + register), `test_get_admin_200` `/api/admin/users`, `test_permukaan_nama_tidak_berubah`.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak handler_admin.py (auth, user, profil, tenant)"`

---

## Task 11: Ekstrak `handler_complaints.py`

**Files:**
- Create: `server/handler_complaints.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `complaints_lib.*` (Task 5), `sla.enrich_complaint_sla` (Task 6), `notify.dispatch_*` (Task 7), `security.is_valid_image_data/is_valid_audio_data` (Task 4), `ratelimit.is_login_rate_limited/record_failed_login` (Task 3), `db.hash_pw/verify_pw/now_iso/open_conn`, `secrets`
- Produces: `class HandlerComplaints` berisi: `handle_get_complaints(self, qs)`, `handle_create_complaint(self, body, qs)`, `handle_create_guest_complaint(self, body, qs)`, `handle_guest_track(self, body, qs)`, `handle_guest_rate(self, body, qs)`, `handle_update_complaint(self, cid, body)`.

- [ ] **Step 1: Buat `server/handler_complaints.py`**

```python
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
from ratelimit import is_login_rate_limited, record_failed_login
from security import is_valid_audio_data, is_valid_image_data
from sla import enrich_complaint_sla


class HandlerComplaints:
    # ... PINDAHKAN utuh 6 metode dari SikolaHandler (app.py):
    #   handle_get_complaints (baseline 1716), handle_create_complaint (1769),
    #   handle_create_guest_complaint (1846), handle_guest_track (1927),
    #   handle_guest_rate (1951), handle_update_complaint (1987)
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus enam metode; ubah deklarasi:

```python
from handler_complaints import HandlerComplaints

class SikolaHandler(HandlerComplaints, HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. **Pengunci kritis:** `test_isolasi_antar_tenant`, `test_idor_*` (2), `test_limit_*` paginasi (8), `test_notifikasi_async_end_to_end`, `test_pin_tamu_tidak_bocor_ke_log`, `test_brute_force_login_diblokir_429` (guest-track pakai rate-limit PIN).

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak handler_complaints.py (IDOR & isolasi-tenant tetap)"`

---

## Task 12: Ekstrak `handler_reports.py`

**Files:**
- Create: `server/handler_reports.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `metrics.*` (Task 8), `sla.compute_complaint_sla` (Task 6), `db.open_conn/now_iso`, `csv`, `io`, `datetime/timedelta`
- Produces: `class HandlerReports` berisi 11 metode: `handle_bootstrap(self, qs)`, `handle_get_notifications(self, qs)`, `handle_mark_notifications_read(self, body, qs)`, `handle_export_monev(self, qs)`, `handle_get_evaluations(self, qs)`, `handle_create_evaluation(self, body, qs)`, `handle_get_ikm(self, qs)`, `handle_create_ikm(self, body, qs)`, `handle_get_ikm_rtl(self, qs)`, `handle_create_ikm_rtl(self, body, qs)`, `handle_update_ikm_rtl(self, rid, body)`.

- [ ] **Step 1: Buat `server/handler_reports.py`**

```python
"""Handler laporan: bootstrap, notifikasi, evaluasi/IKM, ekspor monev (Fase 4A)."""
import csv
import io
from datetime import datetime, timedelta

from db import now_iso, open_conn
from metrics import (
    build_monev_markdown, compute_evaluation_summary, compute_ikm_summary,
    compute_public_recap,
)
from sla import compute_complaint_sla


class HandlerReports:
    # ... PINDAHKAN utuh 11 metode dari SikolaHandler (app.py):
    #   handle_bootstrap (1314), handle_get_notifications (1352),
    #   handle_mark_notifications_read (1381), handle_export_monev (1422),
    #   handle_get_evaluations (2055), handle_create_evaluation (2079),
    #   handle_get_ikm (2126), handle_create_ikm (2150),
    #   handle_get_ikm_rtl (2191), handle_create_ikm_rtl (2207),
    #   handle_update_ikm_rtl (2243)
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus sebelas metode; ubah deklarasi:

```python
from handler_reports import HandlerReports

class SikolaHandler(HandlerReports, HandlerComplaints, HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: `test_get_admin_200` (`/api/bootstrap`, `/api/notifications`, `/api/reports/monev`, `/api/evaluations`, `/api/ikm`, `/api/ikm/rtl`), `test_notifikasi_async_end_to_end` (bootstrap/notifications path).

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak handler_reports.py (bootstrap, notif, IKM, monev)"`

---

## Task 13: Ekstrak `handler_public.py`

**Files:**
- Create: `server/handler_public.py`
- Modify: `server/app.py`

**Interfaces:**
- Consumes: `chatbot.generate_chat_reply`, `metrics.compute_public_recap`, `config.WEB_BUNDLE_DIR`, `db.open_conn`, `os`, `mimetypes`
- Produces: `class HandlerPublic` berisi: `handle_get_public_fkp(self, qs)`, `handle_submit_fkp_feedback(self, body, qs)`, `handle_create_fkp_poll(self, body, qs)`, `handle_upsert_transparency(self, item_id, body, qs)`, `handle_chat(self, body, qs)`, `serve_static(self, req_path)`.

- [ ] **Step 1: Buat `server/handler_public.py`**

```python
"""Handler publik: FKP, transparansi, chatbot, dan penyajian aset statis (Fase 4A)."""
import mimetypes
import os

from chatbot import generate_chat_reply
from config import WEB_BUNDLE_DIR
from db import open_conn
from metrics import compute_public_recap


class HandlerPublic:
    # ... PINDAHKAN utuh 6 metode dari SikolaHandler (app.py):
    #   handle_get_public_fkp (2327), handle_submit_fkp_feedback (2380),
    #   handle_create_fkp_poll (2423), handle_upsert_transparency (2446),
    #   handle_chat (2487), serve_static (2501-2523)
    # serve_static memakai send_security_headers/send_csp_header/send_cors_headers
    # dari SikolaHandlerBase — resolusi lewat MRO kelas akhir.
```

- [ ] **Step 2: Hubungkan `app.py`** — hapus enam metode; ubah deklarasi **sesuai urutan spec §6**:

```python
from handler_public import HandlerPublic

class SikolaHandler(HandlerPublic, HandlerReports, HandlerComplaints,
                    HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
```

- [ ] **Step 3: Gerbang statis** — pyflakes exit 0.

- [ ] **Step 4: Gerbang dinamis** — pytest + py_compile → **72 passed**. Pengunci: `test_get_publik_200` (`/api/public/fkp`, `/` static), `test_get_admin_200` seluruhnya.

- [ ] **Step 5: Commit** — `git commit -m "refactor: ekstrak handler_public.py (FKP, transparansi, chatbot, static)"`

---

## Task 14: Finalisasi `app.py` + test struktur

**Files:**
- Create: `server/tests/test_struktur_modul.py`
- Modify: `server/app.py` (blok `__all__`, bersih-bersih impor, rakitan final)

**Interfaces:**
- Consumes: seluruh modul Task 2–13
- Produces: `app.__all__` = kontrak 57 nama; `app.py` final ≤500 baris.

- [ ] **Step 1: Susun `app.py` final**

Struktur akhir (urutan impor proyek: `config` dulu — invariant side-effect):

```python
import mimetypes
import os
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db import init_db, now_iso, open_conn          # dipakai routing & main()
from config import (                                # SERTAKAN `config` PERTAMA
    APP_RELEASE_DATE, APP_VERSION, APP_VERSION_CODE, BASE_DIR,
    MIN_SUPPORTED_VERSION_CODE, SECRET_KEY, WEB_BUNDLE_DIR,
    _is_production_mode, _load_dotenv, _resolve_secret_key, build_app_info,
)
from ratelimit import (LOGIN_ATTEMPTS, RATE_LIMIT_LOCK,
                       RATE_LIMIT_MAX_ATTEMPTS, RATE_LIMIT_WINDOW_SEC,
                       _prune_rate_limits_locked, check_and_record_ip_rate_limit,
                       clear_failed_login, is_login_rate_limited,
                       record_failed_login)
from security import (create_token, is_safe_https_webhook, is_valid_audio_data,
                      is_valid_image_data, sanitize_school, sanitize_user,
                      verify_token)
from complaints_lib import (TICKET_LOCK, get_or_create_guest_user_id,
                            mask_anonymous_complaint, next_ticket_code,
                            normalize_wa_number, route_category)
from notify import (_NOTIF_QUEUE, _NOTIF_WORKER, _enqueue_notif,
                    _notif_worker_loop, _post_webhook, _send_smtp_email,
                    _update_notif_status, dispatch_notifications,
                    dispatch_reporter_notification)
from sla import (_fmt_hours_id, compute_complaint_sla, enrich_complaint_sla,
                 parse_iso_dt)
from metrics import (IKM_ELEMENT_LABELS, build_monev_markdown,
                     compute_evaluation_summary, compute_ikm_summary,
                     compute_public_recap, get_ikm_grade)
from handler_base import PayloadTooLargeError, SikolaHandlerBase
from handler_admin import HandlerAdmin
from handler_complaints import HandlerComplaints
from handler_reports import HandlerReports
from handler_public import HandlerPublic

__all__ = [
    #38 fungsi
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


class SikolaHandler(HandlerPublic, HandlerReports, HandlerComplaints,
                    HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
    server_version = "SiPakaingeMonsaServer/2.2.3"
    _SENSITIVE_QS_RE = re.compile(r"(?i)\b(pin|token|secret|password|api_key)=[^&\s\"']*")

    # do_OPTIONS, do_HEAD, do_GET, do_POST, do_PUT, do_PATCH  (routing asli)
    # + logika inline do_GET: /api/health, /api/public-recap, /api/tenants,
    #   /api/auth/me  (memakai now_iso, open_conn, compute_public_recap,
    #   sanitize_school, build_app_info, APP_VERSION, APP_VERSION_CODE)


class MonsaThreadingHTTPServer(ThreadingHTTPServer):
    # ... potong (baseline 2525-2528) ...

def main():
    # ... potong (baseline 2531-2545) ...

if __name__ == "__main__":
    main()
```

Bersih-bersih: pastikan tak ada impor yang tersisa tanpa pemakaian (`pyflakes` akan menandainya kecuali masuk `__all__`).

- [ ] **Step 2: Tulis `server/tests/test_struktur_modul.py`**

```python
"""Struktur modul Fase 4A — dibuat SETELAH seluruh ekstraksi selesai."""
import importlib
import re
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]

MODUL = [
    "config", "ratelimit", "security", "complaints_lib", "sla", "notify",
    "metrics", "handler_base", "handler_admin", "handler_complaints",
    "handler_reports", "handler_public",
]


def test_semua_modul_ada_dan_bisa_diimpor():
    for m in MODUL:
        assert (SERVER_DIR / f"{m}.py").exists(), f"{m}.py belum dibuat"
        importlib.import_module(m)


def test_tidak_ada_modul_yang_mengimpor_app():
    for m in MODUL:
        src = (SERVER_DIR / f"{m}.py").read_text(encoding="utf-8")
        assert not re.search(r"^\s*(import app\b|from app import)", src, re.M), (
            f"{m}.py mengimpor app — melanggar DAG (siklus)"
        )


def test_app_tidak_lagi_mendefinisikan_handle():
    src = (SERVER_DIR / "app.py").read_text(encoding="utf-8")
    sisa = re.findall(r"^\s+def (handle_\w+|serve_static)\(", src, re.M)
    assert not sisa, f"masih ada handler di app.py (harusnya di mixin): {sisa}"


def test_besar_file_dalam_target():
    # Target spek: app ≤450, modul ≤600 — gerbang kasar +10% toleransi eksekusi.
    app_lines = len((SERVER_DIR / "app.py").read_text(encoding="utf-8").splitlines())
    assert app_lines <= 500, f"app.py {app_lines} baris (target ≤500)"
    for m in MODUL:
        n = len((SERVER_DIR / f"{m}.py").read_text(encoding="utf-8").splitlines())
        assert n <= 650, f"{m}.py {n} baris (target ≤650)"
```

- [ ] **Step 3: Gerbang penuh**

```powershell
python -m pyflakes server
python -m pytest server/tests -q
python -m py_compile server/app.py server/*.py
```

Expected: pyflakes exit 0; **76 passed** (72 + 4 struktur); py_compile OK.

- [ ] **Step 4: Ukuran aktual (dicatat untuk laporan)**

```powershell
Get-ChildItem server\*.py | ForEach-Object { "{0,-28} {1,5} baris" -f $_.Name, (Get-Content $_.FullName).Count }
```

Expected: `app.py` ±350–450; tiap modul < 600.

- [ ] **Step 5: Commit**

```powershell
git add server/app.py server/tests/test_struktur_modul.py
git commit -m "refactor: finalisasi app.py (rakitan mixin, __all__ 57 nama, test struktur)"
```

---

## Task 15: Regresi Penuh + Verifikasi DB Asli

**Files:**
- Create: `scripts/regresi_smoke.py`
- Modify: — (hanya menjalankan; `.env` sementara dibuat & dihapus)

**Interfaces:**
- Consumes: server hasil Task 14
- Produces: bukti 16/16 regresi + kondisi DB asli utuh.

- [ ] **Step 1: Tulis `scripts/regresi_smoke.py`**

```python
"""Regresi Fase 1-3 terhadap server berjalan (baca-saja, DB asli).

Jalankan DENGAN server hidup di 8127 (lihat Step 2). Exit 0 bila 16/16 lulus.
"""
import base64
import hashlib
import hmac
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8127"
results = []


def call(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["X-Monsa-Token"] = token
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except Exception:
                parsed = raw
            return r.status, parsed, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = raw
        return e.code, parsed, dict(e.headers)
    except Exception as e:
        return 0, {"error": str(e)}, {}


def check(label, got, exp):
    ok = got in exp
    results.append(ok)
    print("  %-46s -> %-42s %s" % (label, str(got), "LULUS" if ok else "GAGAL <<<"))


# 1) loader .env ber-BOM -> server harus hidup di 8127
c, _, _ = call("/api/health")
check("1. loader .env BOM (server di 8127)", c, [200])

# 2) bind 127.0.0.1
ip = ""
try:
    out = subprocess.run(
        ["powershell", "-Command",
         "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*'}).IPAddress"],
        capture_output=True, text=True, timeout=15,
    ).stdout.split()
    ips = [i.strip() for i in out if i.strip().startswith(("192.", "10.", "172."))]
    ip = ips[0] if ips else ""
except Exception:
    pass
if ip:
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect((ip, 8127))
        opened = True
    except Exception:
        opened = False
    finally:
        s.close()
    check("2. bind localhost (konek via %s)" % ip,
          "terbuka" if opened else "ditolak", ["ditolak"])
else:
    print("  2. bind -> tidak ada IP non-loopback")
    results.append(True)

# 3) HSTS + CSP di HTML
c, _, hdr = call("/")
check("3a. HSTS di HTML", hdr.get("Strict-Transport-Security", ""),
      ["max-age=31536000; includeSubDomains"])
check("3b. CSP frame-ancestors none",
      "ADA" if "frame-ancestors 'none'" in hdr.get("Content-Security-Policy", "") else "HILANG",
      ["ADA"])

# 4) CORS ketat
c, _, hdr = call("/api/health", headers={"Origin": "https://evil.example"})
check("4. CORS origin asing tanpa ACAO",
      "ADA" if "Access-Control-Allow-Origin" in hdr else "bersih", ["bersih"])

# 5) K1 token key lama
payload = json.dumps(
    {"uid": 1, "role": "admin_sekolah", "tid": 1, "tv": 1, "exp": int(time.time()) + 9999},
    separators=(",", ":"),
).encode()
b64 = base64.urlsafe_b64encode(payload).decode()
sig = hmac.new(b"monsa-makassar-single-owner-multitenant-2026",
               b64.encode(), hashlib.sha256).hexdigest()
c, _, _ = call("/api/admin/users", headers={"X-Monsa-Token": f"{b64}.{sig}"})
check("5. K1: token key lama ditolak", c, [401, 403])

# 6) K2 demo-switch tanpa token
c, _, _ = call("/api/auth/demo-switch", "POST", {"user_id": 1})
check("6. K2: demo-switch tanpa token", c, [401, 403])

# 7) K3 brute-force (ident khusus)
codes = {}
for i in range(12):
    c, _, _ = call("/api/auth/login", "POST",
                   {"phone_or_email": "regresi-bruteforce2@uji.id", "password": f"salah{i}"})
    codes[c] = codes.get(c, 0) + 1
check("7. K3: brute-force -> 429", codes.get(429, 0) > 0, [True])

# 8) K4 redaksi log
call("/api/complaints/guest-track?ticket_code=ADU-MONSA-0001&pin=654321", "POST", {})
time.sleep(0.4)
with open("regresi.log", encoding="utf-8", errors="replace") as fh:
    log = fh.read()
check("8a. K4: PIN mentah tidak di log", "pin=654321" in log, [False])
check("8b. K4: redaksi pin=*** muncul", "pin=***" in log, [True])

# 9) login admin + paginasi
c, lg, _ = call("/api/auth/login", "POST",
                {"phone_or_email": "admin@monsa.sch.id", "password": "demo123"})
check("9a. login admin", c, [200])
tok = lg.get("token", "")
c, d, _ = call("/api/complaints?page=1&limit=3", token=tok)
check("9b. limit=3 + total=8 + has_more",
      (len(d.get("items", [])), d.get("total"), d.get("has_more")), [(3, 8, True)])

# 10) endpoint inti
for p in ("/api/bootstrap", "/api/app-info", "/api/public/fkp", "/api/evaluations"):
    c, _, _ = call(p, token=tok)
    check("10. %s" % p, c, [200])

print()
print("  RINGKASAN REGRESI: %d/%d lulus" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
```

- [ ] **Step 2: Nyalakan server dari `.env` ber-BOM (bukti loader end-to-end)**

```powershell
Set-Location "E:\Project\SI-PAKAINGE MONSA v2.2.3"
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Set-Content -Path .env -Value "PORT=8127" -Encoding utf8    # sengaja ber-BOM
$proc = Start-Process -FilePath "C:\Python314\python.exe" -ArgumentList "server\app.py" `
    -PassThru -WindowStyle Hidden -RedirectStandardOutput regresi.log -RedirectStandardError regresi.err
Start-Sleep -Seconds 7
try { $r = Invoke-WebRequest -Uri "http://127.0.0.1:8127/api/health" -UseBasicParsing -TimeoutSec 4; "HEALTH=$($r.StatusCode)" }
catch { "GAGAL START"; Get-Content regresi.err, regresi.log -ErrorAction SilentlyContinue | Select-Object -First 15; exit 1 }
```

- [ ] **Step 3: Jalankan regresi — wajib 16/16**

```powershell
python scripts/regresi_smoke.py
"EXIT=$LASTEXITCODE"
```

Expected: `RINGKASAN REGRESI: 16/16 lulus`, EXIT=0.

- [ ] **Step 4: Matikan server + bersih-bersih**

```powershell
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
Remove-Item .env, regresi.log, regresi.err -Force -ErrorAction SilentlyContinue
"python: $((Get-Process python -ErrorAction SilentlyContinue).Count) | .env: $(Test-Path .env)"
```

Expected: `python: 0 | .env: False`.

- [ ] **Step 5: Verifikasi DB asli utuh**

```powershell
$py = @'
import sqlite3, hashlib
DB = r"server\sikola_monsa.db"
c = sqlite3.connect(DB)
print("integrity :", c.execute("PRAGMA integrity_check").fetchone()[0])
for t, col in (("users","id"),("complaints","id"),("school_tenants","id"),
               ("notification_logs","id"),("chat_logs","id")):
    print(f"{t:15s}:", c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
print("tiket      :", [r[0] for r in c.execute("SELECT ticket_code FROM complaints ORDER BY id")])
print("rating #3  :", c.execute("SELECT parent_rating FROM complaints WHERE id=3").fetchone()[0])
c.close()
print("sha        :", hashlib.sha256(open(DB,"rb").read()).hexdigest()[:16])
'@
$py | python -
```

Expected: `integrity: ok`; **6 / 8 / 1 / 5 / 2**; tiket `ADU-MONSA-0001…0008`; `rating #3 = 5`; sha stabil (nilai apa pun asal tidak berubah saat dihitung dua kali berturut-turut — perbedaan antar-sesi hanya header WAL).

- [ ] **Step 6: Gerbang akhir penuh**

```powershell
python -m pyflakes server
python -m pytest server/tests -q
```

Expected: exit 0, **76 passed**. (Frontend tak tersentuh — `npm test`/`npm run lint` opsional untuk konfirmasi.)

- [ ] **Step 7: Commit akhir**

```powershell
git add scripts/regresi_smoke.py
git commit -m "test: skrip regresi hidup 16 butir (alat ulang-pakai Fase 1-4)"
git log --oneline    # pastikan seluruh langkah ter-commit, working tree bersih
```

---

## Self-Review Catatan

- **Spec coverage:** §3 invariant → Global Constraints + Task 2 (side-effect), Task 3/7 (state tunggal), Task 9 (`_redact`); §4 peta modul → Task 2–13 satu-per-satu; §5 DAG → Task 14 `test_tidak_ada_modul_yang_mengimpor_app`; §6 rakitan → Task 9–13 (urutan kelas persis spec) + Task 14; §7 kontrak 57 nama → Task 1 (`KONTRAK`) + Task 14 (`__all__`); §8 batasan → Global Constraints; §9 urutan → Task 1–15; §10 kriteria → gerbang tiap task + Task 15; §11 risiko → Review Focus.
- **Konsistensi tipe:** nama fungsi/metode/parameter disalin dari daftar baseline (`grep ^def`/`^    def`); urutan mixin akhir = spec §6.
- **Review Focus:** kelima baris punya test di task pemiliknya (lihat blok Review Focus).
