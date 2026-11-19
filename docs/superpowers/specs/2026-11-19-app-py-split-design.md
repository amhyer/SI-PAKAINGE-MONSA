# Spec Desain — Pemecahan `server/app.py` (Fase 4A)

| | |
|---|---|
| **Tanggal** | 2026-11-19 |
| **Klasifikasi** | Architectural (jalur penuh: desain → spec → rencana implementasi) |
| **Pendekatan** | **Modul flat di `server/`** (Pendekatan 1 — disetujui pengguna) |
| **Sifat perubahan** | **Bebas refactor** — isi boleh dirapikan selama perilaku HTTP identik |
| **Status** | Desain disetujui pengguna; spec menunggu review sebelum `writing-plans` |
| **Baseline git** | `f6d08c2` — "Baseline Fase 1-3" (commit sebelum kode disentuh) |

---

## 1. Latar & Tujuan

`server/app.py` (2.549 baris) menampung seluruh lapisan server: konfigurasi,
kriptografi, rate-limit, notifikasi, perhitungan SLA/IKM, ~40 handler HTTP,
routing, dan entry point. File sebesar ini menyulitkan pembacaan, review, dan
perubahan yang aman.

**Tujuan:** memecah `app.py` menjadi modul-modul flat di `server/` dengan
**permukaan eksternal identik**, sehingga dokumentasi, skrip, dan seluruh test
yang ada tetap berfungsi tanpa perubahan.

**Ukuran target:** `app.py` ≤ ±450 baris; setiap modul baru ≤ ±600 baris.

## 2. Non-Tujuan

- Tidak mengubah perilaku API HTTP apa pun (route, status, header, bentuk JSON).
- Tidak memindah/mengubah `db.py`, `chatbot.py`, atau kode frontend.
- Tidak mengubah cara server dijalankan (`python3 server/app.py`) atau di-deploy.
- Tidak memindah kode ke sub-paket (`server/monsa/`) — tetap flat.

## 3. Invariant (wajib terpenuhi di setiap langkah)

1. **Entry point beku:** `python3 server/app.py` tetap berfungsi; `README.md`,
   `docs/Panduan-*.md`, dan `scripts/dev_local.py` tidak diubah.
2. **`import app` tetap kompatibel:** semua nama yang dulu ada di level modul
   `app` tetap tersedia sebagai atribut modul `app` (lihat §7).
3. **Urutan side-effect terjaga:** saat `app` diimpor, `_load_dotenv()` (baris
   64 lama) harus dieksekusi **sebelum** `SECRET_KEY = _resolve_secret_key()`
   (baris 182 lama) — `.env` dibaca dulu, baru validasi kunci (K1).
4. **State global tunggal:** `_NOTIF_QUEUE`, `_NOTIF_WORKER`, `LOGIN_ATTEMPTS`,
   `RATE_LIMIT_LOCK`, `TICKET_LOCK` hidup di **tepat satu** modul; modul lain
   hanya mengimpor objek yang sama (identitas objek dipertahankan — mutasi
   in-place terlihat bersama).
5. **Path aset:** `BASE_DIR`/`WEB_BUNDLE_DIR` dihitung dari `__file__` → semua
   modul baru tetap **flat di `server/`** agar hasil `dirname(dirname(...))`
   identik (proyek induk).
6. **Grafik impor tanpa siklus** (lihat §5); tidak ada modul baru yang mengimpor
   `app`.
7. **Redaksi log (K4):** `SikolaHandler._redact` tetap classmethod yang dapat
   dipanggil sebagai `app_mod.SikolaHandler._redact`.
8. **DB asli tidak tersentuh** oleh pengujian apa pun (prinsip Fase 3).

## 4. Peta Modul Target

Sumber = rentang baris di `app.py` lama (referensi saat ekstraksi).

| Modul baru | Sumber lama | Isi |
|---|---|---|
| `config.py` | 29–64, 144–289 | `_load_dotenv` + **pemanggilan level modul**, `_is_production_mode`, `_resolve_secret_key`, `SECRET_KEY`, `BASE_DIR`, `WEB_BUNDLE_DIR`, `APP_VERSION*`, `APP_RELEASE_DATE`, `build_app_info` |
| `ratelimit.py` | 291–294, 301–350 | `RATE_LIMIT_LOCK`, `LOGIN_ATTEMPTS`, `RATE_LIMIT_*`, `_prune_rate_limits_locked`, `is_login_rate_limited`, `record_failed_login`, `clear_failed_login`, `check_and_record_ip_rate_limit` |
| `security.py` | 353–447 | `create_token`, `verify_token`, `sanitize_user`, `sanitize_school`, `is_safe_https_webhook`, `is_valid_image_data`, `is_valid_audio_data` |
| `complaints_lib.py` | 290, 449–506 | `TICKET_LOCK`, `get_or_create_guest_user_id`, `mask_anonymous_complaint`, `next_ticket_code`, `route_category`, `normalize_wa_number` |
| `notify.py` | 70–71, 74–142, 508–676 | `_NOTIF_QUEUE`, `_NOTIF_WORKER`, `_post_webhook`, `_send_smtp_email`, `_update_notif_status`, `_notif_worker_loop`, `_enqueue_notif`, `dispatch_notifications`, `dispatch_reporter_notification` (bebas digabung/dirapikan) |
| `sla.py` | 678–764 | `parse_iso_dt`, `_fmt_hours_id`, `compute_complaint_sla`, `enrich_complaint_sla` (fungsi murni, stdlib saja) |
| `metrics.py` | 765–984 | `IKM_ELEMENT_LABELS`, `get_ikm_grade`, `compute_ikm_summary`, `compute_evaluation_summary`, `compute_public_recap`, `build_monev_markdown` |
| `handler_base.py` | 986–1157 | `PayloadTooLargeError`, `SikolaHandlerBase`: `_redact`, `log_message`, header keamanan/CSP/CORS, `send_json`, `send_text_download`, `_trusted_proxies`, `get_client_ip`, `read_json_body`, `get_tenant`, `get_current_user` |
| `handler_admin.py` | 1489–1715, 2267–2326 | `handle_update_school_profile`, `handle_create_tenant`, `handle_register`, `handle_login`, `handle_change_password`, `handle_demo_switch`, `handle_get_users`, `handle_verify_user`, `handle_admin_reset_password` |
| `handler_complaints.py` | 1716–2054 | `handle_get_complaints`, `handle_create_complaint`, `handle_create_guest_complaint`, `handle_guest_track`, `handle_guest_rate`, `handle_update_complaint` (penjaga IDOR & isolasi-tenant tetap di sini) |
| `handler_reports.py` | 1314–1488, 2055–2266 | `handle_bootstrap`, `handle_get_notifications`, `handle_mark_notifications_read`, `handle_export_monev`, `handle_get/create_evaluation`, `handle_get/create_ikm`, `handle_get/create/update_ikm_rtl` |
| `handler_public.py` | 2327–2523 | `handle_get_public_fkp`, `handle_submit_fkp_feedback`, `handle_create_fkp_poll`, `handle_upsert_transparency`, `handle_chat`, `serve_static` |
| `app.py` (sisa) | 1–26, 1158–1313, 2525–2549 | `sys.path.insert`, impor + **blok re-export (§7)**, `do_OPTIONS`/`do_HEAD`/`do_GET`/`do_POST`/`do_PUT`/`do_PATCH`, rakitan `SikolaHandler`, `MonsaThreadingHTTPServer`, `main()`, guard `__main__` |

**Aturan penempatan:** semua metode `do_*` (verb HTTP) tinggal di `app.py` —
lapisan transport terpusat; mixin hanya berisi `handle_*` + `serve_static`.

## 5. Grafik Impor (DAG tanpa siklus)

```
config.py  ratelimit.py  sla.py  complaints_lib.py  security.py   ← stdlib/db saja
     ▲           ▲          ▲            ▲              ▲
     │           └──────────┼────────────┼──────────────┘
     │                      │            │
   notify.py ───────────────┘      metrics.py (→ sla, db)
     ▲                                    ▲
     ├──────────── handler_base.py ───────┤   (→ config, ratelimit, security, db)
     │               ▲                    │
     ├─ handler_admin.py                   │
     ├─ handler_complaints.py  (→ complaints_lib, notify, sla, ratelimit)
     ├─ handler_reports.py     (→ metrics, sla, notify, config)
     └─ handler_public.py      (→ metrics, chatbot, config)
                    ▲
                 app.py   (rakitan + routing + re-export + main)
```

**Aturan keras:** modul leaf (`config`, `ratelimit`, `sla`, `security`,
`complaints_lib`, `metrics`, `notify`) tidak boleh mengimpor `handler_*` atau
`app`.

## 6. Perakitan `SikolaHandler`

```python
# app.py
from handler_public import HandlerPublic
from handler_reports import HandlerReports
from handler_complaints import HandlerComplaints
from handler_admin import HandlerAdmin
from handler_base import SikolaHandlerBase, PayloadTooLargeError

class SikolaHandler(HandlerPublic, HandlerReports, HandlerComplaints,
                    HandlerAdmin, SikolaHandlerBase, BaseHTTPRequestHandler):
    server_version = "SiPakaingeMonsaServer/2.2.3"
    _SENSITIVE_QS_RE = re.compile(r"(?i)\b(pin|token|secret|password|api_key)=[^&\s\"']*")

    # do_OPTIONS, do_HEAD, do_GET, do_POST, do_PUT, do_PATCH  (~130 baris)
```

- MRO aman: setiap mixin berdiri sendiri (tanpa induk) dengan namespace
  `handle_*` unik → tanpa konflik diamond.
- Mixin memanggil `self.send_json(...)` dll. dari `SikolaHandlerBase` —
  diselesaikan saat runtime, bukan saat definisi.
- `_redact` diwarisi dari `SikolaHandlerBase` → `app_mod.SikolaHandler._redact`
  tetap berfungsi (test K4).

## 7. Permukaan Kompatibilitas (kontrak re-export)

`app.py` mengimpor-ulang **semua** nama berikut sehingga `from app import X`
tidak pernah patah. Kontrak ini dikunci test baru `server/tests/test_module_surface.py`
(ditulis **sebelum** ekstraksi).

**Fungsi (38):** `_load_dotenv`, `_post_webhook`, `_send_smtp_email`,
`_update_notif_status`, `_notif_worker_loop`, `_enqueue_notif`,
`_is_production_mode`, `_resolve_secret_key`, `build_app_info`,
`_prune_rate_limits_locked`, `is_login_rate_limited`, `record_failed_login`,
`clear_failed_login`, `check_and_record_ip_rate_limit`, `create_token`,
`verify_token`, `sanitize_user`, `sanitize_school`, `is_safe_https_webhook`,
`is_valid_image_data`, `is_valid_audio_data`, `get_or_create_guest_user_id`,
`mask_anonymous_complaint`, `next_ticket_code`, `route_category`,
`normalize_wa_number`, `dispatch_notifications`,
`dispatch_reporter_notification`, `parse_iso_dt`, `_fmt_hours_id`,
`compute_complaint_sla`, `enrich_complaint_sla`, `get_ikm_grade`,
`compute_ikm_summary`, `compute_evaluation_summary`, `compute_public_recap`,
`build_monev_markdown`, `main`.

**Kelas (4):** `PayloadTooLargeError`, `SikolaHandler`, `MonsaThreadingHTTPServer`,
`SikolaHandlerBase` (baru; ditambahkan untuk kelengkapan).

**Global (15):** `SECRET_KEY`, `BASE_DIR`, `WEB_BUNDLE_DIR`, `APP_VERSION`,
`APP_VERSION_CODE`, `MIN_SUPPORTED_VERSION_CODE`, `APP_RELEASE_DATE`,
`TICKET_LOCK`, `RATE_LIMIT_LOCK`, `LOGIN_ATTEMPTS`, `RATE_LIMIT_MAX_ATTEMPTS`,
`RATE_LIMIT_WINDOW_SEC`, `_NOTIF_QUEUE`, `_NOTIF_WORKER`, `IKM_ELEMENT_LABELS`.

**Test kontrak** (`test_module_surface.py`):
1. `hasattr(app, nama)` untuk seluruh daftar di atas.
2. Setiap modul baru dapat diimpor sendiri (`importlib.import_module`).
3. Tidak ada modul baru yang mengimpor `app` (cek statis pada sumber).

## 8. Kebebasan Refactor

**Diizinkan** (sesuai keputusan pengguna "bebas refactor"), selama hasil API
identik dan semua test hijau:
- menggabungkan/memangkas duplikasi antar handler,
- menata ulang struktur internal fungsi, penamaan variabel lokal,
- memperbaiki komentar yang sudah usang.

**Dilarang:**
- mengubah route, status code, header, atau bentuk respons JSON,
- mengubah semantik keamanan (K1–K6, IDOR, isolasi tenant, redaksi K4),
- menyentuh `db.py`, `chatbot.py`, frontend, atau DB asli.

**Disiplin:** setiap langkah wajib **berakhir hijau** (pytest + `py_compile`);
commit granular per langkah agar mudah dibatalkan. Ekstraksi dipisah dari
cleanup: bila refactor besar dilakukan, lakukan sebagai commit terpisah setelah
langkah ekstraksi hijau.

## 9. Urutan Eksekusi

| # | Langkah | Gerbang verifikasi |
|---|---|---|
| 0 | (Selesai) `git init` + commit baseline `f6d08c2` | working tree bersih |
| 1 | Tulis `server/tests/test_module_surface.py` terhadap `app.py` lama | pytest hijau (kontrak terkunci) |
| 2 | Ekstrak leaf: `config` → `ratelimit` → `security` → `complaints_lib` → `sla` → `notify` → `metrics` | setelah tiap modul: `py_compile` + pytest |
| 3 | Ekstrak `handler_base` + 4 mixin; rakit `SikolaHandler`; `app.py` tinggal routing/re-export/main | pytest + `py_compile` |
| 4 | Regresi penuh Fase 1–3 terhadap server hidup (`python server/app.py` + `.env`) | **16/16** |
| 5 | (Opsional) cleanup/refactor terpisah bila ada duplikasi tersisa | pytest + regresi cepat |
| 6 | Verifikasi DB asli utuh + bersih-bersih artefak uji | sha/data identik |

## 10. Kriteria Penerimaan

- [ ] `python -m pytest server/tests` → **semua lulus** (54 lama + ≥1 file baru).
- [ ] `py_compile` lulus untuk seluruh `server/*.py` + `server/tests/*.py`.
- [ ] Regresi hidup **16/16** (loader `.env`, bind, HSTS/CSP, CORS, K1–K4,
      login + paginasi `total`, 4 endpoint inti).
- [ ] `app.py` ≤ ±450 baris; tiap modul baru ≤ ±600 baris.
- [ ] README/docs/skrip **tidak ada perubahan diff**.
- [ ] DB asli: `integrity: ok`, data identik (6 user / 8 tiket / 1 tenant /
      5 notif / 2 chat), tanpa `.env`/log uji tersisa, 0 proses python.
- [ ] Seluruh perubahan ter-commit (commit per langkah, pesan jelas).

## 11. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Impor siklus saat ekstraksi | server gagal start | DAG §5 + aturan leaf ≠ handler/app; pytest tiap langkah |
| Urutan side-effect (`.env` → `SECRET_KEY`) patah | K1 salah sasaran / port salah | `config.py` menjalankan dotenv→secret berurutan di level modul; `app.py` mengimpor `config` pertama; test surface + regresi |
| State global terduplikasi (lock/dict beda instance) | race condition / rate-limit bocor | satu pemilik modul (§3.4); test K3 & notifikasi async |
| Refactor "bebas" mengubah perilaku diam-diam | regresi keamanan/fungsi | gerbang hijau tiap langkah, 54 tes + 16 regresi, commit granular |
| `serve_static` salah path `web_bundle` | aset 404 | invariant §3.5 (modul flat di `server/`) |
| Lupa re-export satu nama | `ImportError` bagi pemakai lama | daftar §7 + test kontrak yang mengunci semuanya |

## 12. Keputusan yang Sudah Diambil

1. Pendekatan **modul flat** (bukan paket `monsa/`, bukan minimalis).
2. Sifat perubahan: **bebas refactor** dengan gerbang hijau per langkah.
3. **Git diinisialisasi sekarang** + baseline Fase 1–3 di-commit (`f6d08c2`);
   `uploads/` ditambahkan ke `.gitignore` (data pribadi, konsisten dengan DB).
4. Urutan Fase 4: **app.py (spec ini) → B modal → C IKM → split frontend**.
