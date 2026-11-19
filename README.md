# SI-PAKAINGE MONSA — Sistem Pengaduan & Aspirasi Sekolah

Pemilik tunggal resmi: **UPTD SPF SD Negeri Unggulan Mongisidi 1** (NPSN `40313912`, Kota Makassar), dengan arsitektur database terisolasi (`tenant_id`) yang siap direplikasi untuk sekolah lain di Kota Makassar.

---

## Arsitektur & Peta Berkas

- `server/db.py` — Skema SQLite (`WAL`, `busy_timeout=10000`, `foreign_keys=ON`), hashing sandi `PBKDF2-HMAC-SHA256` (100.000 iterasi), dan data awal sekolah.
- `server/app.py` — Server Python `ThreadingHTTPServer` (`request_queue_size=128`), REST API `/api/*`, token HMAC-SHA256 (`X-Monsa-Token`), RBAC, anti-SSRF, login rate-limiter, dan `/api/app-info`.
- `server/chatbot.py` — Chatbot pengetahuan sekolah + pembacaan rekap SQLite sesuai peran.
- `frontend/` — Aplikasi React 19 + Vite 8 + Tailwind CSS 4 + Capacitor 8 (`id.makassar.monsalapor`).
- `frontend/src/localFallback.js` — Mesin paritas API lokal untuk mode offline & file portabel.
- `web_bundle/` — Hasil build produksi frontend yang disajikan oleh `server/app.py`.
- `SIKOLA-Plus-Interactive.html` — Versi 1-file portabel siap buka tanpa server.
- `scripts/dev_local.py` — Menjalankan backend (`:8000`) + Vite HMR (`:5173`) bersamaan.
- `scripts/build_all.py` — Uji sintaks Python, Vite build, `cap sync android`, regenerasi HTML portabel, dan audit tombol/paritas.

---

## Cara Menjalankan di Lokal

### 1. Mode Produksi Lokal (Cukup Python 3)
```bash
python3 server/app.py
```
Buka **`http://127.0.0.1:8000`** di browser.

### 2. Mode Pengembangan Mendalam (Live Reload / HMR)
Prasyarat: **Python 3.10+** dan **Node.js 20+**.
```bash
python3 scripts/dev_local.py
```
- Frontend Vite HMR aktif di **`http://localhost:5173`** (otomatis mem-proxy `/api` ke `127.0.0.1:8000`).
- Atau jalankan manual di 2 terminal terpisah:
  - Terminal 1: `python3 server/app.py`
  - Terminal 2: `cd frontend && npm install && npm run dev`

### 3. Build Ulang Semua Target & Audit Otomatis
Setelah selesai mengubah kode di `frontend/src/` atau `server/`:
```bash
python3 scripts/build_all.py
```
Perintah ini otomatis melakukan:
1. `py_compile` pada `server/*.py`
2. `npm run build` (`web_bundle/`)
3. `npx cap sync android` (`frontend/android/`)
4. Pembentukan ulang `SIKOLA-Plus-Interactive.html`
5. Audit seluruh `<button>` JSX dan paritas `localFallback.js`

### 4. Build APK / AAB Android
Lihat panduan lengkap di `docs/Panduan-Teknis-dan-Build-APK.md`, atau langsung buka Android Studio:
```bash
cd frontend
npx cap open android
```

---

## Akun Uji Coba Bawaan (Sandi: `demo123`)
- **Orang Tua:** `081241001101`
- **Siswa:** `081344002202`
- **Guru Piket / TPPK:** `081144003303`
- **Kepala Sekolah / Admin:** `admin@monsa.sch.id`
