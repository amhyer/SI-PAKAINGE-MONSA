# Panduan Deployment Server Produksi SI-PAKAINGE MONSA

Dokumen ini memandu operator/tim IT **UPTD SPF SD Negeri Unggulan Mongisidi 1** dalam menayangkan aplikasi secara online 24 jam di VPS Ubuntu/Debian dengan HTTPS, *systemd*, reset database bersih, dan backup otomatis harian.

---

## 1. Salin Proyek & Siapkan Variabel Produksi
```bash
sudo mkdir -p /opt/sikola-makassar
sudo cp -r . /opt/sikola-makassar/
cd /opt/sikola-makassar

# Salin dan isi variabel lingkungan wajib produksi
sudo cp .env.example .env
sudo nano .env
```
Pastikan pada `.env` Anda menyetel:
- `PORT=8000`
- `MONSA_SECRET_KEY=<string acak minimal 32 karakter>` (contoh buat kunci acak: `python3 -c "import secrets; print(secrets.token_hex(32))"`)
- `MONSA_DISABLE_DEMO=1` *(menonaktifkan tombol Switch Akun Demo di server publik)*
- `MONSA_APK_URL=https://lapor.sdnungmongisidi1.sch.id/downloads/SI-PAKAINGE-MONSA-v2.2.3.apk` *(opsional jika menyediakan unduhan APK langsung)*

---

## 2. Reset Database Bersih Sebelum Peluncuran Resmi
Sebelum server dibuka untuk warga sekolah, bersihkan data contoh dan pasang kata sandi baru Kepala Sekolah & Tim TPPK:
```bash
# Pratinjau dulu tanpa mengubah file (opsional)
python3 /opt/sikola-makassar/scripts/prepare_production_db.py --dry-run

# Jalankan reset produksi (otomatis backup dulu lalu meminta sandi baru interaktif)
python3 /opt/sikola-makassar/scripts/prepare_production_db.py
```
Lalu sesuaikan kepemilikan folder untuk user layanan `www-data`:
```bash
sudo chown -R www-data:www-data /opt/sikola-makassar/server
```

---

## 3. Pasang Layanan `systemd` (Auto-Start & Auto-Restart)
```bash
sudo cp /opt/sikola-makassar/deploy/monsa-lapor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now monsa-lapor
sudo systemctl status monsa-lapor
```

---

## 4. Pasang Nginx Reverse Proxy & SSL HTTPS (Certbot)
```bash
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp /opt/sikola-makassar/deploy/nginx-monsa.conf /etc/nginx/sites-available/monsa-lapor
sudo ln -sf /etc/nginx/sites-available/monsa-lapor /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Terbitkan sertifikat HTTPS gratis Let's Encrypt
sudo certbot --nginx -d lapor.sdnungmongisidi1.sch.id
```

---

## 5. Jadwalkan Backup Harian Otomatis SQLite
Tambahkan cron job pada root / `www-data` untuk mencadangkan database setiap pukul 02.00 WITA (menyimpan 30 arsip terbaru di `/opt/sikola-makassar/server/backups/`):
```bash
sudo crontab -u www-data -e
```
Tambahkan baris:
```cron
0 2 * * * /usr/bin/python3 /opt/sikola-makassar/scripts/backup_db.py
```
Uji manual satu kali untuk memastikan berhasil:
```bash
sudo -u www-data python3 /opt/sikola-makassar/scripts/backup_db.py
```
