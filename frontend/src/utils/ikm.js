// Official SKM / IKM 9 Unsur Pelayanan (PermenPAN-RB No. 14 Tahun 2017)

export const IKM_ELEMENTS = [
  { key: 'u1', code: 'U1', label: 'Persyaratan Pelayanan', desc: 'Kemudahan & kejelasan syarat mengurus pengaduan/konsultasi' },
  { key: 'u2', code: 'U2', label: 'Sistem, Mekanisme & Prosedur', desc: 'Kejelasan alur layanan digital maupun loket sekolah' },
  { key: 'u3', code: 'U3', label: 'Waktu Penyelesaian', desc: 'Kecepatan respon & penyelesaian aduan (Target <= 24 jam)' },
  { key: 'u4', code: 'U4', label: 'Biaya / Tarif Pelayanan', desc: 'Kesesuaian layanan 100% GRATIS (Rp 0, Bebas Pungli)' },
  { key: 'u5', code: 'U5', label: 'Produk Spesifikasi Pelayanan', desc: 'Kesesuaian hasil tindak lanjut & bukti penyelesaian tiket' },
  { key: 'u6', code: 'U6', label: 'Kompetensi Pelaksana', desc: 'Kemampuan Guru Piket, TPPK, Operator & Kepala Sekolah' },
  { key: 'u7', code: 'U7', label: 'Perilaku Pelaksana', desc: 'Kesopanan, keramahan 3S (Sipakatau, Sipakalebbi, Sipakainge)' },
  { key: 'u8', code: 'U8', label: 'Penanganan Pengaduan, Saran & Masukan', desc: 'Ketersediaan kanal pengaduan & respon kotak masuk / WA' },
  { key: 'u9', code: 'U9', label: 'Sarana & Prasarana', desc: 'Kemudahan aplikasi SI-PAKAINGE & fasilitas ramah rentan/disabilitas' },
];

export const IKM_SCALE_OPTIONS = [
  { value: 4, short: '4 · Sangat Baik', color: 'bg-emerald-700 text-white border-emerald-700' },
  { value: 3, short: '3 · Baik', color: 'bg-cyan-700 text-white border-cyan-700' },
  { value: 2, short: '2 · Kurang Baik', color: 'bg-amber-600 text-white border-amber-600' },
  { value: 1, short: '1 · Tidak Baik', color: 'bg-rose-700 text-white border-rose-700' },
];

// Aturan baku IKM: hitung dari nilai mentah, bulatkan satu kali di akhir.
// Semua tampilan skor memakai 2 desimal agar konsisten dengan poster & PDF.
export function formatIkmScore(score) {
  const value = Number(score);
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

export function getIkmGradeInfo(score, count) {
  if (!count) {
    return {
      grade: '-',
      predicate: 'Belum Ada Data Responden',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      rgb: [0.4, 0.45, 0.52],
    };
  }
  const s = Number(score || 0);
  if (s >= 88.31) {
    return {
      grade: 'A',
      predicate: 'Sangat Baik',
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      rgb: [0.03, 0.46, 0.28],
    };
  }
  if (s >= 76.61) {
    return {
      grade: 'B',
      predicate: 'Baik',
      badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-300',
      rgb: [0.05, 0.42, 0.56],
    };
  }
  if (s >= 65.0) {
    return {
      grade: 'C',
      predicate: 'Kurang Baik',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
      rgb: [0.75, 0.42, 0.04],
    };
  }
  return {
    grade: 'D',
    predicate: 'Tidak Baik',
    badgeClass: 'bg-rose-100 text-rose-900 border-rose-300',
    rgb: [0.72, 0.12, 0.18],
  };
}

export function computeIkmSummaryLocal(rows = []) {
  const cnt = rows.length;
  if (!cnt) {
    return {
      respondent_count: 0,
      ikm_score: 0,
      grade: '-',
      predicate: 'Belum Ada Data Responden',
      elements: IKM_ELEMENTS.map((el) => ({
        key: el.key,
        label: `${el.code} - ${el.label}`,
        nrr: 0,
        nrr_tertimbang: 0,
        konversi: 0,
      })),
      lowest_element: null,
      highest_element: null,
    };
  }

  let totalWeighted = 0;
  const elements = IKM_ELEMENTS.map((el) => {
    const avg = rows.reduce((acc, r) => acc + Number(r[el.key] || 0), 0) / cnt;
    const weighted = avg / 9;
    totalWeighted += weighted;
    return {
      key: el.key,
      label: `${el.code} - ${el.label}`,
      nrr: Number(avg.toFixed(3)),
      nrr_tertimbang: Number(weighted.toFixed(4)),
      konversi: Number((avg * 25).toFixed(2)),
    };
  });

  const ikmScore = Number((totalWeighted * 25).toFixed(2));
  const { grade, predicate } = getIkmGradeInfo(ikmScore, cnt);
  const sorted = [...elements].sort((a, b) => a.nrr - b.nrr);

  return {
    respondent_count: cnt,
    ikm_score: ikmScore,
    grade,
    predicate,
    elements,
    lowest_element: sorted[0],
    highest_element: sorted[sorted.length - 1],
  };
}

export function simulateIkmFromNrr(nrrMap) {
  let totalWeighted = 0;
  const elements = IKM_ELEMENTS.map((el) => {
    const val = Math.max(1, Math.min(4, Number(nrrMap?.[el.key] || 4)));
    const weighted = val / 9;
    totalWeighted += weighted;
    return {
      key: el.key,
      label: `${el.code} - ${el.label}`,
      nrr: Number(val.toFixed(3)),
      nrr_tertimbang: Number(weighted.toFixed(4)),
      konversi: Number((val * 25).toFixed(2)),
    };
  });
  // Sama seperti computeIkmSummaryLocal: jumlahkan bobot mentah, bulatkan sekali.
  const ikmScore = Number((totalWeighted * 25).toFixed(2));
  const { grade, predicate } = getIkmGradeInfo(ikmScore, 1);
  return {
    respondent_count: 1,
    ikm_score: ikmScore,
    grade,
    predicate,
    elements,
  };
}
