export const UI_LABELS = {
  id: {
    langName: 'ID',
    greetingBanner: 'Layanan Pengaduan & Aspirasi Sekolah Akuntabel, Inklusif, dan Gerak Cepat',
    navHome: 'Beranda',
    navReport: 'Lapor',
    navStaffResults: 'Hasil & Nilai',
    navTrack: 'Pantau',
    navStaffManage: 'Kelola',
    navAccount: 'Akun',
    ctaReport: 'Kirim Pengaduan',
    ctaRentan: 'Prioritas Disabilitas / Rentan',
    ctaTrack: 'Pantau Status Tiket',
    ctaChat: 'Tanya Asisten Sekolah',
    formHeading: 'Sampaikan Aduan atau Aspirasi Secara Aman',
    formSubmit: 'Kirim Pengaduan ke Sekolah',
    formUrgentBtn: 'Tombol Darurat Anak / TPPK (1-Ketuk)',
    trackGuestHeading: 'Lacak Lapor Cepat (Kode Tiket + PIN 6-Digit)',
  },
  mks: {
    langName: 'MKS',
    greetingBanner: "Tabe' — Layanan Sipakainge: Saling Mengingatkan dengan Hormat & Cepat",
    navHome: 'Beranda',
    navReport: 'Kirimki',
    navStaffResults: 'Hasil & Nilai',
    navTrack: 'Cekki',
    navStaffManage: 'Kelola',
    navAccount: 'Akun',
    ctaReport: 'Kirimki Laporanta',
    ctaRentan: 'Prioritas Disabilitas / Orang Tua',
    ctaTrack: 'Cekmi Balasanna',
    ctaChat: "Tabe', Tanya Asisten",
    formHeading: "Tabe', Ceritakanki Keluhanta dengan Aman",
    formSubmit: 'Kirimmi Laporanta Sekarang',
    formUrgentBtn: 'Tombol Darurat Anak / TPPK (1-Ketuk)',
    trackGuestHeading: 'Cekmi Laporanta (Kode Tiket + PIN 6-Angka)',
  },
};

export function tLabel(lang, key) {
  return (UI_LABELS[lang] || UI_LABELS.id)[key] || UI_LABELS.id[key] || key;
}
