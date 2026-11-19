# Panduan Teknis, Build APK Android & Rilis Play Store — SI-PAKAINGE MONSA

## 1. Identitas Aplikasi Android
- **Nama Aplikasi:** `SI-PAKAINGE MONSA`
- **Package ID / Application ID:** `id.makassar.monsalapor`
- **Pemilik Tunggal:** UPTD SPF SD Negeri Unggulan Mongisidi 1 (NPSN `40313912`, Kota Makassar)
- **Target Android SDK:** `minSdkVersion 23` (Android 6.0+) · `compileSdkVersion 35` · `targetSdkVersion 35`
- **Ikon & Splash Screen:** Sudah memakai logo resmi `SI-PAKAINGE MONSA` di `res/mipmap-*` dan `res/drawable*/splash.png`.

---

## 2. Arsitektur Produksi untuk Banyak Pengguna Sekolah
Agar ratusan warga sekolah (Orang Tua, Siswa, Guru Piket/TPPK, Kepala Sekolah) dapat melapor dari HP Android masing-masing ke satu pusat data yang sama:

1. **Jalankan Server Pusat (`server/app.py` + `sikola_monsa.db`) di Server Online HTTPS:**
   - Pasang folder `server/` pada VPS/Cloud/Server Sekolah dengan reverse proxy **HTTPS** (mis. Nginx + Let's Encrypt) pada domain resmi, contoh: `https://lapor.sdnungmongisidi1.sch.id`.
   - Set environment variable produksi sebelum menjalankan server:
     ```bash
     export MONSA_SECRET_KEY="ganti-dengan-kunci-rahasia-panjang-acak"
     export MONSA_DISABLE_DEMO=1   # opsional: nonaktifkan tombol akun demo saat produksi penuh
     python3 server/app.py
     ```
2. **Build Aset Web yang Sudah Mengarah ke Server Pusat (Opsional / Direkomendasikan):**
   ```bash
   cd frontend
   npm install
   VITE_API_BASE_URL=https://lapor.sdnungmongisidi1.sch.id npx vite build
   npx cap sync android
   ```
   *(Pengguna atau Admin juga dapat memasukkan/menguji alamat server kapan saja lewat menu **Akun → Koneksi Server Pusat Sekolah**).*

---

## 3. Cara Build File `.apk` (Distribusi WA/Website Sekolah) & `.aab` (Google Play Store)

### Langkah di Komputer dengan Android Studio (JDK 21+ & Android SDK 35)
1. Salin folder `/home/user/sikola-makassar/frontend/android` (atau seluruh proyek) ke komputer Anda.
2. Buka folder `frontend/android` menggunakan **Android Studio**.
3. Tunggu proses *Gradle Sync* selesai.
4. **Untuk membuat `.apk` siap pasang di HP Android:**
   - Menu **Build → Build Bundle(s) / APK(s) → Build APK(s)** (atau jalankan `./gradlew assembleDebug`).
   - Hasil APK berada di: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
   - Untuk APK *release* resmi (dibagikan luas via website/WA): pilih **Build → Generate Signed Bundle / APK → APK**, buat/pilih *keystore* `.jks`, lalu pilih varian `release`.
5. **Untuk rilis ke Google Play Store (`.aab`):**
   - Pilih **Build → Generate Signed Bundle / APK → Android App Bundle**, tandatangani dengan *keystore* resmi sekolah, lalu unggah file `.aab` ke Google Play Console (`id.makassar.monsalapor`).
