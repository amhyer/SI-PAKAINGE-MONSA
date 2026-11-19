export const ROLES = [
  { id: 'orang_tua', label: 'Orang Tua / Wali Murid', desc: 'Melaporkan kendala anak & memantau penyelesaian' },
  { id: 'siswa', label: 'Siswa SD (Didampingi Wali)', desc: 'Aduan ramah anak untuk keamanan & kenyamanan kelas' },
  { id: 'tppk_piket', label: 'Guru Piket / Tim Pengelola & TPPK', desc: 'Verifikasi laporan piket, prioritas rentan & anti-perundungan' },
  { id: 'admin_sekolah', label: 'Kepala Sekolah / Admin', desc: 'Kelola aduan, laporan Monev PEKPPP & arsitektur multi-sekolah' },
];

export const COMPLAINT_CATEGORIES = [
  { id: 'Perundungan / Bullying (TPPK)', desc: 'Kekerasan fisik/verbal, pengucilan, atau keamanan anak' },
  { id: 'Pungutan / Seragam Sekolah', desc: 'Indikasi pungli atau keluhan seragam putih-merah gratis' },
  { id: 'Fasilitas Kelas / Toilet / Kantin', desc: 'Meja-kursi rusak, kebersihan toilet, atau fasilitas UKS/disabilitas' },
  { id: 'Layanan Guru / Kelas Inklusi / TU', desc: 'Pendampingan inklusi, KBM, surat pindah, rapor, atau PPDB' },
  { id: 'Bantuan Seragam / PIP / Beasiswa', desc: 'Verifikasi penerima bantuan seragam gratis & PIP' },
  { id: 'Saran & Aspirasi Sekolah', desc: 'Usulan positif untuk kemajuan UPTD SPF SDN Unggulan Mongisidi 1' },
];

export const VULNERABLE_GROUPS = [
  { id: 'Umum (Bukan Kelompok Rentan)', desc: 'Pelayanan standar sekolah' },
  { id: 'Penyandang Disabilitas / Siswa Inklusi', desc: 'Prioritas pendampingan inklusi & aksesibilitas' },
  { id: 'Lansia (Kakek/Nenek Wali Murid)', desc: 'Prioritas loket & ruang tunggu prioritas' },
  { id: 'Ibu Hamil / Ibu Menyusui', desc: 'Prioritas layanan cepat tanpa antre' },
  { id: 'Anak-Anak Membutuhkan Pendampingan Khusus', desc: 'Perlindungan anak & pendampingan Guru Piket/TPPK' },
];

export const RENTAN_ETHICS_7 = [
  '1. Bersikap ramah, sopan, dan menggunakan bahasa yang mudah dipahami.',
  '2. Tidak melakukan diskriminasi atas dasar disabilitas, usia, gender, maupun status ekonomi.',
  '3. Mengutamakan prioritas layanan bagi penyandang disabilitas, lansia, ibu hamil/menyusui, dan anak.',
  '4. Memberikan pendampingan menuju ruang konsultasi dan mengizinkan pendamping keluarga.',
  '5. Responsif mendengarkan keluhan dan menindaklanjuti secara profesional.',
  '6. Menjaga keamanan, kenyamanan, dan aksesibilitas area pelayanan.',
  '7. Menghormati alat bantu disabilitas (kursi roda, tongkat, alat bantu dengar) tanpa memindahkannya tanpa izin.',
];

export const RENTAN_FACILITIES = [
  'Jalan Landai (Ram)',
  'Parkir Khusus Disabilitas',
  'Ruang Tunggu & Loket Prioritas',
  'Toilet Khusus Disabilitas',
  'Tempat Bermain Anak',
  'Guru Pendamping Sekolah Inklusi',
];

export const SP4N_LAPOR_URL = 'https://www.lapor.go.id';

export const URGENCIES = [
  { id: 'Biasa', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'Penting', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  { id: 'Darurat Anak', color: 'bg-rose-50 text-rose-700 border-rose-200' },
];

export const STATUS_STEPS = [
  'Diterima',
  'Diverifikasi Piket/TPPK',
  'Ditangani TPPK/Kepsek',
  'Selesai',
];

export const STATUS_STYLE = {
  'Diterima': 'bg-slate-100 text-slate-700 border-slate-200',
  'Diverifikasi Piket/TPPK': 'bg-sky-50 text-sky-700 border-sky-200',
  'Ditangani TPPK/Kepsek': 'bg-amber-50 text-amber-800 border-amber-200',
  'Selesai': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export const DISABILITY_TYPES = [
  { id: 'low_vision', label: 'Penglihatan / Low Vision', guidance: 'Sediakan font besar/pembaca suara & hindari lampiran gambar tanpa teks.' },
  { id: 'tunarungu', label: 'Pendengaran / Tuli (Tunarungu)', guidance: 'WAJIB membalas dengan teks jelas / WhatsApp tertulis (jangan hanya menelepon).' },
  { id: 'mobilitas', label: 'Hambatan Mobilitas / Kursi Roda', guidance: 'Arahkan ke Jalan Landai (Ram), Parkir Khusus & Loket Prioritas lantai dasar.' },
  { id: 'lansia_khusus', label: 'Lansia / Kesulitan Membaca-Mengetik', guidance: 'Prioritas pendampingan lisan / tatap muka ramah di ruang konsultasi.' },
  { id: 'lainnya', label: 'Kebutuhan Khusus / Inklusi Lainnya', guidance: 'Libatkan Guru Pendamping Inklusi & Tim TPPK Sekolah.' },
];

export const CHILD_MODE_ISSUES = [
  { id: 'Diejek / Dirundung Teman', emoji: '😢', category: 'Perundungan / Bullying (TPPK)', urgency: 'Darurat Anak' },
  { id: 'Dipukul / Kekerasan Fisik', emoji: '🚨', category: 'Perundungan / Bullying (TPPK)', urgency: 'Darurat Anak' },
  { id: 'Takut / Merasa Terancam', emoji: '😰', category: 'Perundungan / Bullying (TPPK)', urgency: 'Darurat Anak' },
  { id: 'Toilet / Kelas Rusak / Kotor', emoji: '🏫', category: 'Fasilitas Kelas / Toilet / Kantin', urgency: 'Penting' },
  { id: 'Diminta Uang / Pungutan', emoji: '💰', category: 'Pungutan / Seragam Sekolah', urgency: 'Darurat Anak' },
  { id: 'Minta Bantuan Guru Piket / BK', emoji: '🤝', category: 'Layanan Guru / Kelas Inklusi / TU', urgency: 'Penting' },
];

export const CHILD_IMPACTS = [
  { id: 'takut', label: 'Merasa Takut', emoji: '😨' },
  { id: 'cemas', label: 'Sedih / Cemas', emoji: '😟' },
  { id: 'luka', label: 'Ada Luka / Sakit', emoji: '🩹' },
  { id: 'menarik_diri', label: 'Malas / Takut ke Sekolah', emoji: '🏠' },
];

export const CHILD_LOCATIONS = [
  'Dalam Kelas',
  'Kantin Sekolah',
  'Toilet Siswa',
  'Halaman / Gerbang',
  'Selasar / Tangga',
  'Grup Chat / HP',
];

export const FKP_ROLES = [
  'Orang Tua / Wali Murid',
  'Masyarakat Sekitar Sekolah',
  'Alumni',
  'Komite Sekolah',
  'Guru / Tenaga Kependidikan',
  'Siswa (Didampingi)',
];

export const CLIENT_APP_INFO = {
  app_name: 'SI-PAKAINGE MONSA',
  subtitle: 'Sistem Pengaduan & Aspirasi Sekolah Akuntabel, Inklusif, dan Gerak Cepat',
  version: '2.2.3',
  version_code: 223,
  min_supported_code: 200,
  release_date: '2026-11-17',
  owner: 'UPTD SPF SD Negeri Unggulan Mongisidi 1',
  npsn: '40313912',
  android_package: 'id.makassar.monsalapor',
  min_android: 'Android 6.0 (API 23)',
  target_android: 'Android 15 (API 35)',
  apk_download_url: '',
  web_url: '',
  specs: [
    { label: 'Platform', value: 'Web PWA + HTML Portabel + Capacitor Android APK/AAB' },
    { label: 'Database & Konkurensi', value: 'SQLite WAL Mode + Indeks Komposit + ThreadingHTTPServer + Atomic Ticket Lock' },
    { label: 'Keamanan Akun', value: 'PBKDF2-HMAC-SHA256 (100.000 iterasi), Token HMAC-SHA256 + token_version, & Rate Limiter IP' },
    { label: 'Privasi & Perlindungan Data', value: 'Mode Anonim Pelapor (UU PDP) + Validasi Ketat Foto JPG/PNG/WebP & Pesan Suara + Proteksi Ukuran Payload 2.5 MB' },
    { label: 'Kepatuhan Regulasi', value: 'PEKPPP 6 Aspek + FKP Digital + PPID Sekolah, PermenPAN-RB 14/2017 (IKM 9 Unsur), Permendikbudristek 46/2023 (TPPK), Perwali Makassar 68/2021' },
    { label: 'Aksesibilitas & Inklusi', value: 'Prioritas Disabilitas LAKSA+, Mode Anak & Tombol Darurat TPPK, Kontras Tinggi, Huruf Besar Aa+, Bahasa Makassar-Indonesia, Dikte/TTS/Voice Note, & Offline Auto-Sync' },
  ],
  changelog: [
    {
      version: '2.2.3',
      code: 223,
      date: '2026-11-17',
      notes: [
        'Perbaikan skema field ekspor CSV Monev fallback agar identik dengan server (pelapor UU PDP, badge SLA, & uraian pengaduan).',
        'Penguatan konkurensi & SQLite: 9 indeks komposit, koneksi aman try/finally, race-free guest user creation, & eksekusi webhook/SMTP setelah transaksi DB ditutup.',
        'Penambahan rate limiter pada /api/auth/register, /api/chat, dan /api/auth/demo-switch, header keamanan HTTP mandiri, serta seeding otomatis SOP/PPID/FKP untuk tenant baru.',
        'Penyelarasan penuh localFallback.js (batas audio 750 KB, md_cell, token_version, crypto PIN), aksesibilitas pinch-zoom viewport, pilihan Galeri/Kamera, & badge SLA lacak tamu.',
      ],
    },
    {
      version: '2.2.2',
      code: 222,
      date: '2026-11-17',
      notes: [
        'Keamanan sesi & API: pencabutan token otomatis (token_version) saat ubah/reset kata sandi atau penolakan akun, validasi tenant_id token, pembatasan X-Forwarded-For loopback-only, pembersihan memori rate limiter, dan batas payload JSON 2.5 MB (413).',
        'Pendaftaran tenant baru kini memakai kata sandi admin acak (tanpa kredensial default), dan akun tamu sistem (guest_reporter) diblokir dari login/demo switch/aksi admin.',
        'Sinkronisasi offline parsial tidak lagi menghapus item yang gagal sementara, dan QR/PIN Lacak Cepat tetap tampil meski pengguna sedang login.',
        'Kompresi foto adaptif <=880 KB, paginasi multi-halaman PDF RTL SKM, validasi URL server https/http, sanitasi tabel Markdown Monev, serta ekspor CSV detail aduan penuh pada fallback offline.',
      ],
    },
    {
      version: '2.2.1',
      code: 221,
      date: '2026-11-17',
      notes: [
        'Penguatan keamanan & integritas: rate limit IP pada endpoint tamu & FKP, sanitasi CSV anti-formula injection, serta pencegahan silent fallback jaringan.',
        'Penambahan izin mikrofon & kamera pada AndroidManifest.xml untuk Voice Note & Dikte di APK Android.',
        'Perbaikan kontras tombol aktif Mode Kontras Tinggi, pembaruan cache Service Worker PWA, multi-halaman otomatis PDF FKP, dan UI Edit PPID / Topik FKP Admin.',
      ],
    },
    {
      version: '2.2.0',
      code: 220,
      date: '2026-11-17',
      notes: [
        'Tag Kebutuhan Khusus Disabilitas (Penglihatan, Pendengaran, Mobilitas, Lansia) & Antrean Prioritas Inklusi.',
        'Mode Kontras Tinggi (High-Contrast) untuk low vision serta Toggle Bahasa Ramah Makassar–Indonesia (Sipakainge).',
        'Mode Anak & Tombol Lapor Darurat TPPK 1-Ketuk dengan pilihan perasaan/dampak serta lokasi cepat.',
        'Kartu Lacak Cepat QR Code + Tautan 1-Klik (?tiket=...&pin=...) untuk pelapor tamu.',
        'Lampiran Pesan Suara (Voice Note) langsung di formulir aduan bagi pelapor yang kesulitan mengetik.',
        'Papan Transparansi Publik (PPID Sekolah) & Forum Konsultasi Publik (FKP) Digital + Draft Berita Acara FKP PDF.',
      ],
    },
    {
      version: '2.1.0',
      code: 210,
      date: '2026-11-17',
      notes: [
        'Penguatan produksi: SQLite WAL mode, PBKDF2-HMAC-SHA256 100k iterasi, login rate limiter 429, serta validasi ketat foto JPG/PNG/WebP.',
        'Fitur Ubah Kata Sandi pengguna & Reset Sandi Admin di tab Akun.',
        'Mekanisme Cek Pembaruan Otomatis (APK & PWA) serta jendela Spesifikasi Aplikasi & Riwayat Rilis.',
        'Pengaturan Koneksi Server Pusat Sekolah untuk perangkat APK Android dan ikon/splash screen resmi MONSA.',
      ],
    },
    {
      version: '2.0.0',
      code: 200,
      date: '2026-11-16',
      notes: [
        'Peluncuran 3 fitur PEKPPP: Penghitung SLA <=24 Jam, Survei IKM 9 Unsur + Poster Grade A/B/C/D PDF, dan Etalase Standar Pelayanan & Maklumat Rp 0.',
        'Tab khusus staf Hasil & Nilai, Ekspor PDF Kop Surat A4, dan Notifikasi 2-arah terintegrasi WA/Email.',
      ],
    },
    {
      version: '1.0.0',
      code: 100,
      date: '2026-11-14',
      notes: [
        'Rilis awal SI-PAKAINGE MONSA untuk UPTD SPF SD Negeri Unggulan Mongisidi 1 dengan Chatbot Pengetahuan & Pelaporan Anonim.',
      ],
    },
  ],
};

