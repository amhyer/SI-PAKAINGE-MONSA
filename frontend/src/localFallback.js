import { computeComplaintSla, computeSlaSummary, localDateYmd } from './utils/sla.js';
import { computeIkmSummaryLocal, formatIkmScore } from './utils/ikm.js';
import { CLIENT_APP_INFO } from './constants.js';

function nowIso(offsetHours = 0) {
  const dt = new Date(Date.now() + offsetHours * 3600000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function getTenantCodeFromOptions(options = {}) {
  const hdrs = options.headers || {};
  return hdrs['X-Tenant-Code'] || 'MONSA-01';
}

const state = {
  tenants: [
    {
      id: 1,
      tenant_code: 'MONSA-01',
      npsn: '40313912',
      name: 'UPTD SPF SD Negeri Unggulan Mongisidi 1',
      short_name: 'SDN Unggulan Mongisidi 1',
      level: 'SD (Terakreditasi A · Adiwiyata · Sekolah Inklusi)',
      district: 'Kec. Makassar · Kel. Maricaya Baru',
      address: 'Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142',
      principal_name: 'Andi Windayani, S.Pd., M.Pd.',
      principal_photo: '',
      welcome_title: 'Sambutan Kepala Sekolah',
      welcome_message:
        "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di SI-PAKAINGE MONSA. Kami berkomitmen menghadirkan layanan konsultasi dan pengaduan yang transparan, bebas pungli, serta ramah bagi penyandang disabilitas dan seluruh kelompok rentan.",
      tppk_lead: 'Tim Pengelola Layanan, Pengaduan & TPPK',
      hotline: '(0411) 8918116 / WA 081355982195 · 081241591152',
      email: 'sdnungmongisidi1@gmail.com',
      notify_whatsapp: '6281355982195',
      notify_email: 'sdnungmongisidi1@gmail.com',
      webhook_url: '',
      sla_hours: 24,
      is_inclusive: 1,
      is_zona_integritas: 1,
      is_primary_owner: 1,
    },
  ],
  users: [
    {
      id: 1,
      tenant_id: 1,
      full_name: 'Ibu Kartini (Orang Tua Kelas IV)',
      phone_or_email: '081241001101',
      _password: 'demo123',
      role: 'orang_tua',
      student_name: 'Andi Rafif',
      student_class: 'Kelas IV-A',
      bio_note: 'Wali Murid UPTD SPF SDN Unggulan Mongisidi 1',
      verification_status: 'verified',
    },
    {
      id: 2,
      tenant_id: 1,
      full_name: 'Andi Rafif (Siswa Kelas IV)',
      phone_or_email: '081344002202',
      _password: 'demo123',
      role: 'siswa',
      student_name: 'Andi Rafif',
      student_class: 'Kelas IV-A',
      bio_note: 'Peserta Didik UPTD SPF SDN Unggulan Mongisidi 1',
      verification_status: 'verified',
    },
    {
      id: 3,
      tenant_id: 1,
      full_name: 'Tim TPPK & Piket Sekolah',
      phone_or_email: '081144003303',
      _password: 'demo123',
      role: 'tppk_piket',
      student_name: '',
      student_class: 'Tim Pengelola & TPPK',
      bio_note: 'Tim Pengelola Layanan, Pengaduan & Prioritas Kelompok Rentan',
      verification_status: 'verified',
    },
    {
      id: 4,
      tenant_id: 1,
      full_name: 'Andi Windayani, S.Pd., M.Pd. (Kepsek/Admin)',
      phone_or_email: 'admin@monsa.sch.id',
      _password: 'demo123',
      role: 'admin_sekolah',
      student_name: '',
      student_class: 'Kepala Sekolah & Admin Zona Integritas',
      bio_note: 'Penanggung Jawab Utama PEKPPP & Aplikasi SI-PAKAINGE MONSA',
      verification_status: 'verified',
    },
    {
      id: 5,
      tenant_id: 1,
      full_name: 'Pak Baso (Calon Staf TU)',
      phone_or_email: '085299007707',
      _password: 'demo123',
      role: 'tppk_piket',
      student_name: '',
      student_class: 'Menunggu Verifikasi Kepala Sekolah',
      bio_note: 'Pendaftar mandiri staf pengaduan menunggu persetujuan Kepala Sekolah',
      verification_status: 'pending',
    },
  ],
  complaints: [
    {
      id: 1,
      tenant_id: 1,
      ticket_code: 'ADU-MONSA-0001',
      user_id: 1,
      is_anonymous: 1,
      reporter_display_name: 'Pelapor Anonim (Dilindungi UU PDP)',
      student_info: 'Kelas IV (Disamarkan)',
      category: 'Pungutan / Seragam Sekolah',
      urgency: 'Darurat Anak',
      location_detail: 'Lingkungan Kelas / Grup Paguyuban',
      description: 'Ada permintaan iuran pengadaan seragam tambahan di luar seragam putih-merah gratis Pemkot Makassar. Mohon klarifikasi resmi dari sekolah.',
      photo_data: '',
      routed_to: 'Kepala Sekolah & Tim Zona Integritas',
      status: 'Ditangani TPPK/Kepsek',
      staff_note: 'Kepala Sekolah menegaskan komitmen Zona Integritas: tidak ada pungutan wajib seragam batik/atribut di luar ketentuan resmi Pemkot Makassar.',
      parent_rating: 0,
      parent_feedback: '',
      is_offline_synced: 0,
      vulnerable_group: '',
      needs_priority_assistance: 0,
      first_responded_at: nowIso(-4),
      resolved_at: '',
      created_at: nowIso(-26),
      updated_at: nowIso(-4),
    },
    {
      id: 2,
      tenant_id: 1,
      ticket_code: 'ADU-MONSA-0002',
      user_id: 2,
      is_anonymous: 1,
      reporter_display_name: 'Pelapor Anonim (Dilindungi UU PDP)',
      student_info: 'Kelas IV-A (Disamarkan)',
      category: 'Perundungan / Bullying (TPPK)',
      urgency: 'Darurat Anak',
      location_detail: 'Selasar Kelas IV & Jam Istirahat',
      description: 'Siswa inklusi sering diejek saat jam istirahat sehingga enggan turun ke kantin bersama teman-teman.',
      photo_data: '',
      routed_to: 'Tim Layanan Prioritas Rentan & TPPK Sekolah',
      status: 'Diverifikasi Piket/TPPK',
      staff_note: 'Tim TPPK & Guru Pendamping Inklusi menindaklanjuti secara ramah anak bersama wali kelas.',
      parent_rating: 0,
      parent_feedback: '',
      is_offline_synced: 0,
      vulnerable_group: 'Penyandang Disabilitas / Siswa Inklusi',
      needs_priority_assistance: 1,
      first_responded_at: nowIso(-2),
      resolved_at: '',
      created_at: nowIso(-19),
      updated_at: nowIso(-2),
    },
    {
      id: 3,
      tenant_id: 1,
      ticket_code: 'ADU-MONSA-0003',
      user_id: 1,
      is_anonymous: 0,
      reporter_display_name: 'Ibu Kartini (Orang Tua Kelas IV)',
      student_info: 'Andi Rafif • Kelas IV-A',
      category: 'Fasilitas Kelas / Toilet / Kantin',
      urgency: 'Penting',
      location_detail: 'Toilet Siswa Lantai 1 & Kipas Kelas IV-A',
      description: 'Kunci pintu toilet siswa bagian barat rusak dan satu kipas angin kelas IV-A berbunyi keras.',
      photo_data: '',
      routed_to: 'Sarpras & Tata Usaha Sekolah',
      status: 'Selesai',
      staff_note: 'Petugas Sarpras SDN Unggulan Mongisidi 1 telah mengganti kunci pintu toilet dan menservis kipas angin kelas IV-A.',
      parent_rating: 5,
      parent_feedback: 'Terima kasih respon cepatnya, sangat membantu kenyamanan anak-anak belajar.',
      is_offline_synced: 0,
      vulnerable_group: '',
      needs_priority_assistance: 0,
      first_responded_at: nowIso(-36),
      resolved_at: nowIso(-28),
      created_at: nowIso(-40),
      updated_at: nowIso(-28),
    },
  ],
  notifications: [],
  knowledge_base: [
    {
      id: 1,
      tenant_id: 1,
      category: 'PEKPPP & Inovasi SIMPEL',
      title: 'Kesesuaian Standar PEKPPP Aspek 04, 05, dan 06 (SIMPEL)',
      content: 'SI-PAKAINGE MONSA mendukung langsung PEKPPP UPTD SPF SDN Unggulan Mongisidi 1: Aspek 04 (SIPP), Aspek 05 (Konsultasi & Pengaduan pendamping SP4N-LAPOR!), dan Aspek 06 (Inovasi SIMPEL dengan survei kepuasan pengguna).',
    },
    {
      id: 2,
      tenant_id: 1,
      category: 'Ramah Kelompok Rentan',
      title: 'Perwali Kode Etik Makassar No. 68/2021 & Kode Etik Kelompok Rentan',
      content: 'Disabilitas, siswa inklusi, lansia, ibu hamil/menyusui, dan anak-anak mendapat layanan prioritas serta pendampingan khusus dengan fasilitas jalan landai, parkir disabilitas, ruang tunggu prioritas, dan toilet disabilitas.',
    },
    {
      id: 3,
      tenant_id: 1,
      category: 'Arsitektur Multi-Sekolah',
      title: 'Pengembangan ke Banyak Sekolah di Kota Makassar',
      content: 'Meski pemilik tunggalnya adalah UPTD SPF SDN Unggulan Mongisidi 1 (MONSA-01), database terisolasi per tenant_id sehingga siap direplikasi ke sekolah lain di Kota Makassar.',
    },
  ],
  evaluations: [],
  ikm_surveys: [],
  currentUser: null,
  nextUserId: 6,
  nextComplaintId: 4,
  nextTenantId: 2,
  nextNotifId: 1,
  nextEvalId: 1,
  nextIkmId: 1,
  ikm_action_plans: [],
  nextRtlId: 1,
  public_transparency_items: [
    {
      id: 1,
      tenant_id: 1,
      category: 'Maklumat & Biaya Layanan',
      title: 'Layanan Pengaduan, PTSP, & Legalisir Gratis (Rp 0)',
      summary: 'Seluruh layanan konsultasi, pengaduan, surat keterangan siswa, & pendampingan inklusi bebas pungutan liar sesuai Zona Integritas.',
      metric_value: 'Rp 0 (Gratis)',
      updated_at: nowIso(),
    },
    {
      id: 2,
      tenant_id: 1,
      category: 'Daya Tampung & SPMB',
      title: 'Transparansi Kuota Kelas I & Jalur Inklusi',
      summary: 'Penerimaan peserta didik mengikuti Juknis Dinas Pendidikan Kota Makassar tanpa biaya pendaftaran.',
      metric_value: 'Sesuai Juknis Disdik',
      updated_at: nowIso(),
    },
    {
      id: 3,
      tenant_id: 1,
      category: 'Program & Anggaran Sekolah (BOS)',
      title: 'Papan Informasi Penggunaan Dana BOS & Sarpras',
      summary: 'Laporan realisasi BOS Reguler untuk pembelajaran, pemeliharaan toilet/ram disabilitas, & penguatan TPPK dipublikasikan berkala.',
      metric_value: 'Terbuka Triwulanan',
      updated_at: nowIso(),
    },
    {
      id: 4,
      tenant_id: 1,
      category: 'Waktu Layanan PTSP & Piket',
      title: 'Jam Operasional Loket Tatap Muka & Respon Digital',
      summary: 'Loket PTSP buka Senin–Sabtu (07.15–14.00 WITA). Pengaduan aplikasi SI-PAKAINGE MONSA aktif 24 jam dengan target SLA <= 24 jam kerja.',
      metric_value: 'SLA <= 24 Jam',
      updated_at: nowIso(),
    },
  ],
  fkp_polls: [
    {
      id: 1,
      tenant_id: 1,
      topic_title: 'Forum Konsultasi Publik (FKP): Peningkatan Layanan PTSP & Aduan 2026',
      topic_desc: 'Warga sekolah, orang tua, alumni, & masyarakat sekitar dipersilakan memilih prioritas perbaikan layanan sekolah:',
      options: [
        'Percepat Respon Aduan Darurat <= 12 Jam',
        'Tambah Kursi & Jalur Ramah Disabilitas/Lansia',
        'Publikasi Rincian Kegiatan & BOS Setiap Triwulan',
        'Loket Konsultasi Pagi & Siang Tanpa Antre',
      ],
      is_active: 1,
      created_at: nowIso(),
    },
  ],
  fkp_responses: [],
  nextPpidId: 5,
  nextPollId: 2,
  nextFkpRespId: 1,
};

function getActiveTenant(options) {
  const code = getTenantCodeFromOptions(options);
  return state.tenants.find((t) => t.tenant_code === code) || state.tenants[0];
}

function routeCategory(category, needsPriority) {
  if (needsPriority) return 'Tim Layanan Prioritas Rentan & TPPK Sekolah';
  if (category.includes('Perundungan') || category.includes('Bullying') || category.includes('Inklusi')) {
    return 'Guru Pendamping & Tim TPPK Sekolah';
  }
  if (category.includes('Pungutan') || category.includes('Seragam')) {
    return 'Kepala Sekolah & Tim Zona Integritas';
  }
  if (category.includes('Fasilitas')) {
    return 'Sarpras & Tata Usaha Sekolah';
  }
  if (category.includes('Bantuan') || category.includes('PIP')) {
    return 'Operator Sekolah / Dapodik';
  }
  return 'Tim Pengelola Layanan & Pengaduan Sekolah';
}

function isValidAudioData(audio) {
  if (!audio) return true;
  if (audio.length > 750000) return false;
  if (!audio.slice(0, 80).includes(';base64,')) return false;
  return (
    audio.startsWith('data:audio/webm;') ||
    audio.startsWith('data:audio/mp4;') ||
    audio.startsWith('data:audio/ogg;') ||
    audio.startsWith('data:audio/mpeg;') ||
    audio.startsWith('data:audio/wav;') ||
    audio.startsWith('data:audio/aac;')
  );
}

function secureRandomDigits(len = 6) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const mod = 10 ** len;
    const min = 10 ** (len - 1);
    return String(min + (arr[0] % (mod - min)));
  }
  const min = 10 ** (len - 1);
  return String(Math.floor(min + Math.random() * (9 * min)));
}

function secureRandomPassword() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(9);
    crypto.getRandomValues(arr);
    return 'Monsa#' + Array.from(arr, (b) => (b % 36).toString(36)).join('');
  }
  return `Monsa#${Math.random().toString(36).slice(2, 10)}`;
}

function buildNotificationLinks(school, item) {
  const waNum = (school.notify_whatsapp || '6281355982195').replace(/\D/g, '').replace(/^0/, '62') || '6281355982195';
  const emailTo = school.notify_email || school.email || 'sdnungmongisidi1@gmail.com';
  const msg =
    `*NOTIFIKASI SI-PAKAINGE MONSA - ${school.short_name}*\n` +
    `Kode Tiket: *${item.ticket_code}*\n` +
    `Kategori: ${item.category}\n` +
    `Urgensi: *${item.urgency}*${item.needs_priority_assistance ? ' (PRIORITAS KELOMPOK RENTAN)' : ''}\n` +
    `Unit Tujuan: ${item.routed_to}\n` +
    `Lokasi: ${item.location_detail || '-'}\n` +
    `Pelapor: ${item.reporter_display_name}\n` +
    `Ringkasan: ${(item.description || '').slice(0, 180)}`;

  return {
    wa_link: `https://wa.me/${waNum}?text=${encodeURIComponent(msg)}`,
    mailto_link: `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(`[${item.ticket_code}] Aduan Baru SI-PAKAINGE MONSA`)}&body=${encodeURIComponent(msg.replace(/\*/g, ''))}`,
    recipient_wa: waNum,
    recipient_email: emailTo,
    status: 'siap_kirim_wa_&_inapp',
  };
}

function computeEvalSummary(tenantId) {
  const list = state.evaluations.filter((e) => e.tenant_id === tenantId);
  const cnt = list.length;
  const avgApp = cnt ? Number((list.reduce((a, b) => a + b.app_rating, 0) / cnt).toFixed(2)) : 0;
  const avgSchool = cnt ? Number((list.reduce((a, b) => a + b.school_response_rating, 0) / cnt).toFixed(2)) : 0;
  const speed_breakdown = {};
  const clarity_breakdown = {};
  for (const e of list) {
    speed_breakdown[e.response_speed] = (speed_breakdown[e.response_speed] || 0) + 1;
    clarity_breakdown[e.followup_clarity] = (clarity_breakdown[e.followup_clarity] || 0) + 1;
  }
  return { eval_count: cnt, avg_app_rating: avgApp, avg_school_rating: avgSchool, speed_breakdown, clarity_breakdown };
}

function computeRecap(tenantId) {
  const schoolObj = state.tenants.find((t) => t.id === tenantId) || state.tenants[0];
  const slaHours = Number(schoolObj?.sla_hours || 24);
  const list = state.complaints.filter((c) => c.tenant_id === tenantId);
  const total = list.length;
  const done = list.filter((c) => c.status === 'Selesai').length;
  const processing = total - done;
  const rentanCount = list.filter(
    (c) => c.needs_priority_assistance || (c.vulnerable_group && c.vulnerable_group !== 'Umum (Bukan Kelompok Rentan)')
  ).length;
  const rated = list.filter((c) => c.parent_rating > 0).map((c) => c.parent_rating);
  const avgRating = rated.length ? Number((rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(2)) : 0;
  const completionPct = total ? Number(((done / total) * 100).toFixed(1)) : 100;
  const ev = computeEvalSummary(tenantId);
  const ikm = computeIkmSummaryLocal(state.ikm_surveys.filter((x) => x.tenant_id === tenantId));
  const slaSummary = computeSlaSummary(list, slaHours);

  const catMap = {};
  for (const c of list) {
    if (!catMap[c.category]) catMap[c.category] = { category: c.category, total: 0, done: 0, processing: 0 };
    catMap[c.category].total += 1;
    if (c.status === 'Selesai') catMap[c.category].done += 1;
    else catMap[c.category].processing += 1;
  }

  return {
    total,
    processing,
    done,
    completion_pct: completionPct,
    rentan_count: rentanCount,
    rated_count: rated.length,
    avg_rating: avgRating,
    eval_count: ev.eval_count,
    avg_app_rating: ev.avg_app_rating,
    avg_school_rating: ev.avg_school_rating,
    ikm_count: ikm.respondent_count,
    ikm_score: ikm.ikm_score,
    ikm_grade: ikm.grade,
    ikm_predicate: ikm.predicate,
    ...slaSummary,
    by_category: Object.values(catMap),
    by_month: [{ month: nowIso().slice(0, 7), count: total }],
    updated_at: nowIso(),
  };
}

function buildMonevMarkdown(school, recap, list) {
  const lines = [
    '# LAPORAN MONITORING, EVALUASI PENGADUAN & FKP_UPP',
    `## ${school.name}`,
    `- **NPSN:** ${school.npsn}`,
    `- **Alamat:** ${school.address}`,
    `- **Kepala Sekolah:** ${school.principal_name} (NIP. 198112072007012013)`,
    `- **Email / Kontak:** ${school.email} · ${school.hotline}`,
    `- **Tanggal Cetak Otomatis:** ${nowIso()}`,
    '',
    '---',
    '',
    '## 1. RINGKASAN KINERJA PENGADUAN (PEKPPP ASPEK 05 & INOVASI SIMPEL 06)',
    '| Indikator | Nilai |',
    '|:---|---:|',
    `| Total Pengaduan Masuk | ${recap.total} |`,
    `| Pengaduan Selesai | ${recap.done} |`,
    `| Pengaduan Dalam Proses | ${recap.processing} |`,
    `| Persentase Ketuntasan | ${recap.completion_pct}% |`,
    `| Kepatuhan SLA Penanganan (<= ${recap.sla_hours || 24} Jam) | ${recap.sla_on_time_pct ?? 100}% (Rata-rata tuntas ${recap.avg_resolution_hours ?? 0} jam) |`,
    `| Aduan Terbuka Melewati SLA / Mendekati Batas | ${recap.sla_overdue_count || 0} melewati SLA / ${recap.sla_warning_count || 0} kritis |`,
    `| Layanan Prioritas Kelompok Rentan / Inklusi | ${recap.rentan_count} |`,
    `| Rata-Rata Kepuasan Tiket Pengaduan | ${recap.avg_rating} / 5.0 (${recap.rated_count} responden) |`,
    `| Rata-Rata Penilaian Aplikasi SI-PAKAINGE | ${recap.avg_app_rating || 0} / 5.0 (${recap.eval_count || 0} responden) |`,
    `| Rata-Rata Penilaian Respon & Tindak Lanjut Sekolah | ${recap.avg_school_rating || 0} / 5.0 (${recap.eval_count || 0} responden) |`,
    `| Indeks Kepuasan Masyarakat (IKM 9 Unsur PermenPAN-RB 14/2017) | ${formatIkmScore(recap.ikm_score)} / 100 (Mutu ${recap.ikm_grade || '-'} - ${recap.ikm_predicate || '-'}, ${recap.ikm_count || 0} responden) |`,
    '',
    '## 2. DAFTAR TINDAK LANJUT PENGADUAN',
    '| Kode Tiket | Tanggal | Kategori | Prioritas Rentan | Unit Penangan | Status | Catatan Tindak Lanjut |',
    '|:---|:---|:---|:---|:---|:---|:---|',
  ];
  const mdCell = (v) => String(v ?? '-').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|').trim() || '-';
  for (const r of list) {
    const vg = r.vulnerable_group || (r.needs_priority_assistance ? 'Prioritas' : 'Umum');
    lines.push(
      `| ${mdCell(r.ticket_code)} | ${(r.created_at || '').slice(0, 10)} | ${mdCell(r.category)} | ${mdCell(vg)} | ${mdCell(r.routed_to)} | ${mdCell(r.status)} | ${mdCell(r.staff_note || '-')} |`
    );
  }
  lines.push('', '---', `Makassar, ${nowIso().slice(0, 10)}`, `**Kepala ${school.name}**,`, '', `**${school.principal_name}**`, 'NIP. 198112072007012013');
  return lines.join('\n');
}

export function syncLocalUser(user) {
  state.currentUser = user ? { ...user } : null;
}

function resolveTokenUser(options = {}) {
  const hdrs = options.headers || {};
  const rawAuth = hdrs['X-Monsa-Token'] || hdrs['Authorization'] || '';
  const tok = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : rawAuth.trim();
  if (!tok) return;
  if (tok.startsWith('local-')) {
    const parts = tok.slice(6).split('-v');
    const uid = Number(parts[0]);
    const tv = parts[1] ? Number(parts[1]) : 1;
    const u = state.users.find((x) => x.id === uid);
    if (u && u.verification_status !== 'rejected' && u.role !== 'guest_reporter' && (u.token_version || 1) === tv) {
      state.currentUser = { ...u };
    }
    return;
  }
  if (tok.includes('.')) {
    try {
      const b64 = tok.split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(b64));
      if (payload?.uid) {
        const u = state.users.find((x) => x.id === Number(payload.uid));
        if (
          u &&
          u.verification_status !== 'rejected' &&
          u.role !== 'guest_reporter' &&
          (payload.tid === undefined || Number(payload.tid) === u.tenant_id) &&
          Number(payload.tv ?? 1) === (u.token_version || 1)
        ) {
          state.currentUser = { ...u };
        }
      }
    } catch {
      // ignore malformed token
    }
  }
}

export async function handleLocalApi(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  const cleanPath = path.split('?')[0];
  const tenant = getActiveTenant(options);
  if (!state.currentUser) resolveTokenUser(options);

  if (cleanPath === '/api/bootstrap' && method === 'GET') {
    const recap = computeRecap(tenant.id);
    const tUsers = state.users
      .filter((u) => u.tenant_id === tenant.id)
      .slice(0, 4)
      .map((u) => {
        const safe = { ...u };
        delete safe._password;
        return safe;
      });
    const tKb = state.knowledge_base.filter((k) => k.tenant_id === tenant.id);
    const isAdmin = state.currentUser?.tenant_id === tenant.id && state.currentUser?.role === 'admin_sekolah' && state.currentUser?.verification_status === 'verified';
    return {
      school: { ...tenant, webhook_url: isAdmin ? tenant.webhook_url : '' },
      demo_accounts: tUsers,
      knowledge_base: tKb,
      stats: {
        total: recap.total,
        processing: recap.processing,
        done: recap.done,
        tenants_count: state.tenants.length,
      },
      public_recap: recap,
    };
  }

  if (cleanPath === '/api/app-info' && method === 'GET') {
    return CLIENT_APP_INFO;
  }

  if (cleanPath === '/api/public-recap' && method === 'GET') {
    return { school: { ...tenant, webhook_url: '' }, recap: computeRecap(tenant.id) };
  }

  if (cleanPath === '/api/notifications' && method === 'GET') {
    if (!state.currentUser) throw new Error('Silakan masuk');
    const isStaff = ['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) && state.currentUser.verification_status === 'verified';
    if (isStaff) {
      const items = state.notifications.filter((n) => n.tenant_id === tenant.id && (n.direction || 'to_school') === 'to_school');
      return { items, unread_count: items.filter((n) => !n.is_read).length, scope: 'staff' };
    }
    const items = state.notifications.filter(
      (n) => n.tenant_id === tenant.id && n.direction === 'to_reporter' && n.target_user_id === state.currentUser.id
    );
    return { items, unread_count: items.filter((n) => !n.is_read).length, scope: 'reporter' };
  }

  if (cleanPath === '/api/notifications/read' && method === 'POST') {
    if (!state.currentUser) throw new Error('Silakan masuk');
    const isStaff = ['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) && state.currentUser.verification_status === 'verified';
    for (const n of state.notifications) {
      if (n.tenant_id !== tenant.id) continue;
      const matchTarget = isStaff
        ? ((n.direction || 'to_school') === 'to_school' || (n.direction === 'to_reporter' && n.target_user_id === state.currentUser.id))
        : (n.direction === 'to_reporter' && n.target_user_id === state.currentUser.id);
      if (matchTarget && (!body.id || Number(body.id) === n.id)) {
        n.is_read = 1;
      }
    }
    return { ok: true };
  }

  if (cleanPath === '/api/reports/monev' && method === 'GET') {
    if (!state.currentUser || !['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Tim Pengelola / Kepala Sekolah terverifikasi untuk mengekspor Laporan Monev & FKP.');
    }
    const recap = computeRecap(tenant.id);
    const tComplaints = state.complaints.filter((c) => c.tenant_id === tenant.id);
    const maskedComplaints = tComplaints.map((c) => {
      const m = c.is_anonymous
        ? { ...c, reporter_display_name: 'Pelapor Anonim (Dilindungi UU PDP)', student_info: 'Disamarkan (Anonim)', user_id: null }
        : { ...c };
      delete m._guest_pin;
      return { ...m, sla_info: computeComplaintSla(m, tenant.sla_hours) };
    });
    return {
      school: { ...tenant },
      recap,
      complaints: maskedComplaints,
      markdown: buildMonevMarkdown(tenant, recap, tComplaints),
    };
  }

  if (cleanPath === '/api/tenants' && method === 'GET') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    return { items: state.tenants.map((t) => ({ ...t, webhook_url: '' })) };
  }

  if (cleanPath === '/api/tenants' && method === 'POST') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Hanya Admin Sekolah terverifikasi yang dapat menambahkan tenant sekolah baru.');
    }
    const code = (body.tenant_code || '').trim().toUpperCase();
    const name = (body.name || '').trim();
    const npsn = (body.npsn || '').trim();
    if (!code || !name || !npsn) throw new Error('Kode Tenant, Nama Sekolah, dan NPSN wajib diisi.');
    if (state.tenants.some((t) => t.tenant_code === code)) throw new Error('Kode tenant sudah terdaftar.');
    const newT = {
      id: state.nextTenantId++,
      tenant_code: code,
      npsn,
      name,
      short_name: name,
      level: body.level || 'SD',
      district: body.district || 'Kota Makassar',
      address: body.address || 'Kota Makassar',
      principal_name: body.principal_name || 'Kepala Sekolah',
      tppk_lead: body.tppk_lead || 'Ketua Tim TPPK',
      hotline: body.hotline || '-',
      email: body.email || '-',
      notify_whatsapp: '6281355982195',
      notify_email: body.email || '-',
      webhook_url: '',
      sla_hours: 24,
      is_inclusive: 0,
      is_zona_integritas: 1,
      is_primary_owner: 0,
    };
    state.tenants.push(newT);
    const customPw = (body.admin_password || '').trim();
    const initialPw = customPw || secureRandomPassword();
    if (customPw && customPw.length < 8) throw new Error('Kata sandi admin tenant baru minimal 8 karakter.');
    const adminEmail = (body.admin_email || `admin@${code.toLowerCase()}.sch.id`).trim();
    state.users.push({
      id: state.nextUserId++,
      tenant_id: newT.id,
      full_name: `Admin ${name}`,
      phone_or_email: adminEmail,
      _password: initialPw,
      role: 'admin_sekolah',
      student_name: '',
      student_class: 'Manajemen Sekolah',
      bio_note: 'Admin Tenant Baru',
      verification_status: 'verified',
      token_version: 1,
    });
    state.public_transparency_items.push({
      id: state.nextPpidId++,
      tenant_id: newT.id,
      category: 'Maklumat & Biaya Layanan',
      title: 'Layanan Pengaduan & Konsultasi Gratis (Rp 0)',
      summary: `Seluruh layanan pengaduan dan pendampingan di ${name} bebas pungutan liar sesuai Zona Integritas.`,
      metric_value: 'Rp 0 (Gratis)',
      updated_at: nowIso(),
    });
    state.fkp_polls.push({
      id: state.nextPollId++,
      tenant_id: newT.id,
      topic_title: `Prioritas Peningkatan Layanan ${name}`,
      topic_desc: 'Pilih prioritas utama peningkatan layanan sekolah yang paling Anda harapkan:',
      options: ['Kecepatan Respon Aduan <= 24 Jam', 'Penguatan Program Anti-Perundungan (TPPK)', 'Keterbukaan Informasi & Sarpras Sekolah'],
      is_active: 1,
      created_at: nowIso(),
    });
    return { tenant: newT, initial_admin_email: adminEmail, initial_admin_password: initialPw };
  }

  if (cleanPath === '/api/school-profile' && (method === 'PUT' || method === 'POST')) {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Hanya Kepala Sekolah / Admin terverifikasi yang dapat mengubah profil sekolah.');
    }
    if (state.currentUser.tenant_id !== tenant.id) {
      throw new Error('Akses ditolak: Anda tidak berwenang mengubah profil sekolah lain.');
    }
    const wh = ('webhook_url' in body ? String(body.webhook_url || '') : (tenant.webhook_url || '')).trim();
    if (wh) {
      let okWh;
      try {
        const u = new URL(wh);
        const h = u.hostname.toLowerCase();
        okWh = u.protocol === 'https:' && h && !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(h) && !h.startsWith('10.') && !h.startsWith('192.168.') && !h.startsWith('169.254.');
      } catch {
        okWh = false;
      }
      if (!okWh) throw new Error('URL Webhook harus menggunakan https:// dan bukan alamat jaringan internal.');
    }
    const pPhoto = ('principal_photo' in body ? String(body.principal_photo || '') : (tenant.principal_photo || '')).trim();
    if (pPhoto && (!(pPhoto.startsWith('data:image/jpeg;') || pPhoto.startsWith('data:image/png;') || pPhoto.startsWith('data:image/webp;')) || pPhoto.length > 950000)) {
      throw new Error('Foto Kepala Sekolah harus berformat JPG/PNG/WebP dengan ukuran maksimal 900 KB.');
    }
    Object.assign(tenant, {
      name: body.name || tenant.name,
      short_name: body.name || tenant.short_name,
      level: body.level || tenant.level,
      npsn: body.npsn || tenant.npsn,
      district: body.district || tenant.district,
      address: body.address || tenant.address,
      principal_name: body.principal_name || tenant.principal_name,
      principal_photo: pPhoto,
      welcome_title: body.welcome_title || tenant.welcome_title,
      welcome_message: body.welcome_message !== undefined ? body.welcome_message : tenant.welcome_message,
      tppk_lead: body.tppk_lead || tenant.tppk_lead,
      hotline: body.hotline || tenant.hotline,
      email: body.email || tenant.email,
      notify_whatsapp: body.notify_whatsapp || tenant.notify_whatsapp,
      notify_email: body.notify_email || tenant.notify_email,
      webhook_url: wh,
      sla_hours: Math.max(1, Math.min(720, Number(body.sla_hours || tenant.sla_hours || 24))),
    });
    return { school: { ...tenant } };
  }

  if (cleanPath === '/api/auth/me' && method === 'GET') {
    if (!state.currentUser) throw new Error('Belum login');
    return { user: state.currentUser };
  }

  if (cleanPath === '/api/auth/demo-switch' && method === 'POST') {
    const uid = Number(body.user_id);
    if (![1, 2, 3, 4].includes(uid)) throw new Error('Switch cepat hanya untuk akun demo bawaan.');
    const found = state.users.find((u) => u.id === uid && u.role !== 'guest_reporter');
    if (!found) throw new Error('Akun tidak ditemukan');
    const safeFound = { ...found };
    delete safeFound._password;
    state.currentUser = safeFound;
    return { token: `local-${found.id}-v${found.token_version || 1}`, user: state.currentUser, tenant_code: state.tenants[0]?.tenant_code || 'MONSA-01' };
  }

  if (cleanPath === '/api/auth/login' && method === 'POST') {
    const found = state.users.find((u) => u.tenant_id === tenant.id && u.phone_or_email === body.phone_or_email && u.role !== 'guest_reporter');
    if (!found) throw new Error('No. HP/Email tidak ditemukan. Silakan daftar terlebih dahulu.');
    if (found._password && found._password !== (body.password || '')) {
      throw new Error('No. HP/Email atau kata sandi salah.');
    }
    if (found.verification_status === 'rejected') {
      throw new Error('Akun ini dinonaktifkan oleh Kepala Sekolah / Admin.');
    }
    const safeFound = { ...found };
    delete safeFound._password;
    state.currentUser = safeFound;
    return { token: `local-${found.id}-v${found.token_version || 1}`, user: state.currentUser };
  }

  if (cleanPath === '/api/auth/register' && method === 'POST') {
    const pw = (body.password || '').trim();
    if (!body.full_name || !body.phone_or_email) {
      throw new Error('Nama lengkap dan No. HP/Email wajib diisi.');
    }
    if (pw.length < 6) {
      throw new Error('Kata sandi wajib diisi minimal 6 karakter.');
    }
    if (state.users.some((u) => u.tenant_id === tenant.id && u.phone_or_email === body.phone_or_email)) {
      throw new Error('No. HP atau Email sudah terdaftar.');
    }
    const role = body.role || 'orang_tua';
    const user = {
      id: state.nextUserId++,
      tenant_id: tenant.id,
      full_name: body.full_name,
      phone_or_email: body.phone_or_email,
      _password: pw,
      role,
      student_name: body.student_name || '',
      student_class: body.student_class || '',
      bio_note: body.bio_note || '',
      verification_status: role === 'orang_tua' || role === 'siswa' ? 'verified' : 'pending',
      token_version: 1,
    };
    state.users.unshift(user);
    const safeUser = { ...user };
    delete safeUser._password;
    state.currentUser = safeUser;
    return { token: `local-${user.id}-v1`, user: safeUser };
  }

  if (cleanPath === '/api/complaints' && method === 'GET') {
    if (!state.currentUser) throw new Error('Silakan masuk');
    const isStaff = ['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) && state.currentUser.verification_status === 'verified';
    const tList = state.complaints.filter((c) => c.tenant_id === tenant.id);
    const list = isStaff ? tList : tList.filter((c) => c.user_id === state.currentUser.id);
    return {
      items: list.map((c) => {
        const masked =
          c.is_anonymous && c.user_id !== state.currentUser.id
            ? { ...c, reporter_display_name: 'Pelapor Anonim (Dilindungi UU PDP)', student_info: 'Disamarkan (Anonim)', user_id: null }
            : { ...c };
        return { ...masked, sla_info: computeComplaintSla(masked, tenant.sla_hours) };
      }),
    };
  }

  if (cleanPath === '/api/complaints' && method === 'POST') {
    if (!state.currentUser) throw new Error('Silakan masuk sebelum melapor.');
    const photo = (body.photo_data || '').trim();
    if (
      photo &&
      (!(photo.startsWith('data:image/jpeg;') || photo.startsWith('data:image/png;') || photo.startsWith('data:image/webp;')) ||
        photo.length > 950000)
    ) {
      throw new Error('Format foto harus JPG/PNG/WebP dengan ukuran terkompresi maksimal 900 KB.');
    }
    const audio = (body.audio_evidence || '').trim();
    if (!isValidAudioData(audio)) {
      throw new Error('Format pesan suara tidak valid atau melebihi batas 700 KB.');
    }
    const id = state.nextComplaintId++;
    const isAnon = body.is_anonymous ? 1 : 0;
    const prefix = tenant.tenant_code.split('-')[0];
    const vg = body.vulnerable_group || '';
    const dType = (body.disability_type || '').trim();
    const needsPriority = body.needs_priority_assistance || dType || (vg && vg !== 'Umum (Bukan Kelompok Rentan)') ? 1 : 0;
    const impacts = Array.isArray(body.impact_tags) ? body.impact_tags.join(', ') : (body.impact_tags || '');
    const item = {
      id,
      tenant_id: tenant.id,
      ticket_code: `ADU-${prefix}-${String(id).padStart(4, '0')}`,
      user_id: state.currentUser.id,
      is_anonymous: isAnon,
      reporter_display_name: isAnon ? 'Pelapor Anonim (Dilindungi UU PDP)' : state.currentUser.full_name,
      student_info: isAnon && !body.student_info ? 'Disamarkan (Anonim)' : body.student_info || '',
      category: body.category,
      urgency: body.urgency || 'Penting',
      location_detail: body.location_detail || '',
      description: body.description || (body.audio_evidence ? '[Lampiran Pesan Suara Pelapor]' : ''),
      photo_data: body.photo_data || '',
      audio_evidence: body.audio_evidence || '',
      routed_to: routeCategory(body.category || '', Boolean(needsPriority)),
      status: 'Diterima',
      staff_note: '',
      parent_rating: 0,
      parent_feedback: '',
      is_offline_synced: body.is_offline_synced ? 1 : 0,
      vulnerable_group: vg,
      needs_priority_assistance: needsPriority,
      disability_type: dType,
      special_need_note: (body.special_need_note || '').trim(),
      child_mode: body.child_mode ? 1 : 0,
      impact_tags: impacts,
      first_responded_at: '',
      resolved_at: '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    item.sla_info = computeComplaintSla(item, tenant.sla_hours);
    state.complaints.unshift(item);
    const notif = buildNotificationLinks(tenant, item);
    state.notifications.unshift({
      id: state.nextNotifId++,
      tenant_id: tenant.id,
      complaint_id: item.id,
      ticket_code: item.ticket_code,
      target_user_id: null,
      direction: 'to_school',
      channel: 'whatsapp_&_inapp',
      recipient: `WA ${notif.recipient_wa} | ${notif.recipient_email}`,
      status: notif.status,
      summary: `[${item.ticket_code}] ${item.category} (${item.urgency})`,
      staff_note_snapshot: '',
      wa_link: notif.wa_link,
      mailto_link: notif.mailto_link,
      is_read: 0,
      created_at: nowIso(),
    });
    return { item, notification: notif };
  }

  if (cleanPath === '/api/complaints/guest' && method === 'POST') {
    const photo = (body.photo_data || '').trim();
    if (
      photo &&
      (!(photo.startsWith('data:image/jpeg;') || photo.startsWith('data:image/png;') || photo.startsWith('data:image/webp;')) ||
        photo.length > 950000)
    ) {
      throw new Error('Format foto harus JPG/PNG/WebP dengan ukuran terkompresi maksimal 900 KB.');
    }
    const audio = (body.audio_evidence || '').trim();
    if (!isValidAudioData(audio)) {
      throw new Error('Format pesan suara tidak valid atau melebihi batas 700 KB.');
    }
    const id = state.nextComplaintId++;
    const isAnon = body.is_anonymous !== false ? 1 : 0;
    const prefix = tenant.tenant_code.split('-')[0];
    const vg = body.vulnerable_group || '';
    const dType = (body.disability_type || '').trim();
    const needsPriority = body.needs_priority_assistance || dType || (vg && vg !== 'Umum (Bukan Kelompok Rentan)') ? 1 : 0;
    const impacts = Array.isArray(body.impact_tags) ? body.impact_tags.join(', ') : (body.impact_tags || '');
    const guestPin = secureRandomDigits(6);
    const ticketCode = `ADU-${prefix}-${String(id).padStart(4, '0')}`;
    const item = {
      id,
      tenant_id: tenant.id,
      ticket_code: ticketCode,
      user_id: 0,
      is_guest: 1,
      _guest_pin: guestPin,
      is_anonymous: isAnon,
      reporter_display_name: isAnon ? 'Pelapor Cepat Anonim (Dilindungi UU PDP)' : (body.reporter_name || 'Warga Sekolah (Lapor Cepat)'),
      student_info: isAnon && !body.student_info ? 'Disamarkan (Anonim)' : body.student_info || '',
      category: body.category,
      urgency: body.urgency || 'Penting',
      location_detail: body.location_detail || '',
      description: body.description || (body.audio_evidence ? '[Lampiran Pesan Suara Pelapor]' : ''),
      photo_data: photo,
      audio_evidence: body.audio_evidence || '',
      resolution_photo: '',
      routed_to: routeCategory(body.category || '', Boolean(needsPriority)),
      status: 'Diterima',
      staff_note: '',
      parent_rating: 0,
      parent_feedback: '',
      is_offline_synced: 0,
      vulnerable_group: vg,
      needs_priority_assistance: needsPriority,
      disability_type: dType,
      special_need_note: (body.special_need_note || '').trim(),
      child_mode: body.child_mode ? 1 : 0,
      impact_tags: impacts,
      first_responded_at: '',
      resolved_at: '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    item.sla_info = computeComplaintSla(item, tenant.sla_hours);
    state.complaints.unshift(item);
    const notif = buildNotificationLinks(tenant, item);
    const safeItem = { ...item };
    delete safeItem._guest_pin;
    return { item: safeItem, notification: notif, guest_ticket_code: ticketCode, guest_pin: guestPin };
  }

  if (cleanPath === '/api/complaints/guest-track' && method === 'POST') {
    const code = (body.ticket_code || '').trim().toUpperCase();
    const pin = (body.pin || '').trim();
    const c = state.complaints.find((x) => x.tenant_id === tenant.id && x.ticket_code.toUpperCase() === code && x.is_guest === 1);
    if (!c || c._guest_pin !== pin) throw new Error('Kode tiket atau PIN 6-digit tidak cocok.');
    const safe = { ...c, sla_info: computeComplaintSla(c, tenant.sla_hours) };
    delete safe._guest_pin;
    return { item: safe };
  }

  if (cleanPath === '/api/complaints/guest-rate' && method === 'POST') {
    const code = (body.ticket_code || '').trim().toUpperCase();
    const pin = (body.pin || '').trim();
    const c = state.complaints.find((x) => x.tenant_id === tenant.id && x.ticket_code.toUpperCase() === code && x.is_guest === 1);
    if (!c || c._guest_pin !== pin) throw new Error('Kode tiket atau PIN 6-digit tidak cocok.');
    if (c.status !== 'Selesai') throw new Error('Penilaian bintang hanya dapat dikirim setelah aduan berstatus Selesai.');
    c.parent_rating = Math.max(1, Math.min(5, Number(body.parent_rating || 5)));
    c.parent_feedback = (body.parent_feedback || '').trim();
    c.updated_at = nowIso();
    const safe = { ...c, sla_info: computeComplaintSla(c, tenant.sla_hours) };
    delete safe._guest_pin;
    return { item: safe };
  }

  if (cleanPath.startsWith('/api/complaints/') && method === 'PATCH') {
    if (!state.currentUser) throw new Error('Silakan masuk terlebih dahulu.');
    const cid = Number(cleanPath.split('/').pop());
    const idx = state.complaints.findIndex((c) => c.id === cid);
    if (idx < 0) throw new Error('Pengaduan tidak ditemukan');
    const c = state.complaints[idx];
    if (c.tenant_id !== state.currentUser.tenant_id) {
      throw new Error('Akses ditolak: lintas tenant tidak diizinkan.');
    }
    if ('parent_rating' in body && c.user_id === state.currentUser.id) {
      if (c.status !== 'Selesai') {
        throw new Error('Penilaian bintang hanya dapat dikirim setelah aduan berstatus Selesai.');
      }
      const rating = Math.max(1, Math.min(5, Number(body.parent_rating || 5)));
      c.parent_rating = rating;
      c.parent_feedback = body.parent_feedback || '';
      c.updated_at = nowIso();
      return { item: { ...c } };
    }
    if (!['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) || state.currentUser.verification_status !== 'verified') {
      throw new Error('Hanya Tim TPPK/Piket atau Kepala Sekolah terverifikasi yang dapat memproses aduan.');
    }
    const validStatuses = ['Diterima', 'Diverifikasi Piket/TPPK', 'Ditangani TPPK/Kepsek', 'Selesai'];
    if (body.status && !validStatuses.includes(body.status)) {
      throw new Error('Status tidak valid.');
    }
    const tsNow = nowIso();
    c.status = body.status || c.status;
    c.staff_note = body.staff_note || '';
    if ('resolution_photo' in body) {
      const rp = (body.resolution_photo || '').trim();
      if (rp && (!(rp.startsWith('data:image/jpeg;') || rp.startsWith('data:image/png;') || rp.startsWith('data:image/webp;')) || rp.length > 950000)) {
        throw new Error('Format foto bukti penanganan harus JPG/PNG/WebP maksimal 900 KB.');
      }
      c.resolution_photo = rp;
    }
    if (!c.first_responded_at && (c.status !== 'Diterima' || c.staff_note)) {
      c.first_responded_at = tsNow;
    }
    if (!c.resolved_at && c.status === 'Selesai') {
      c.resolved_at = tsNow;
    }
    c.updated_at = tsNow;

    const reporter = state.users.find((u) => u.id === c.user_id);
    const isAnon = Boolean(c.is_anonymous);
    const isGuest = Boolean(c.is_guest);
    const contact = reporter?.phone_or_email || '';
    const noteText = c.staff_note || 'Tim sekolah telah memperbarui progres penanganan aduan Anda.';
    const msgBody =
      `*PEMBERITAHUAN TINDAK LANJUT SI-PAKAINGE MONSA - ${tenant.short_name}*\n` +
      `Kode Tiket: *${c.ticket_code}*\nStatus Terbaru: *${c.status}*\nTanggapan Sekolah: ${noteText}`;
    let waLink = '';
    let mailtoLink = '';
    let recipientLabel = isGuest ? 'Lacak Tiket Publik (Mode Tamu)' : 'Kotak Masuk Aplikasi (Anonim UU PDP)';
    let extStatus = isGuest ? 'tercatat_untuk_lacak_tamu' : 'terkirim_kotak_masuk_aplikasi';

    if (!isAnon && !isGuest && contact && !contact.endsWith('.local')) {
      recipientLabel = contact;
      if (contact.includes('@')) {
        mailtoLink = `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent(`[${c.ticket_code}] Update Status: ${c.status}`)}&body=${encodeURIComponent(msgBody.replace(/\*/g, ''))}`;
        extStatus = 'terkirim_inapp_siap_mailto';
      } else {
        const waNum = contact.replace(/\D/g, '').replace(/^0/, '62');
        if (waNum.length >= 8) {
          waLink = `https://wa.me/${waNum}?text=${encodeURIComponent(msgBody)}`;
          extStatus = 'terkirim_inapp_siap_wa';
        }
      }
    }

    const rNotif = {
      id: state.nextNotifId++,
      tenant_id: tenant.id,
      complaint_id: c.id,
      ticket_code: c.ticket_code,
      target_user_id: c.user_id,
      direction: 'to_reporter',
      channel: isAnon ? 'inapp_anonim' : waLink ? 'inapp_&_whatsapp' : 'inapp_&_email',
      recipient: recipientLabel,
      status: extStatus,
      summary: `[${c.ticket_code}] Tindak Lanjut: ${c.status}`,
      staff_note_snapshot: noteText,
      wa_link: waLink,
      mailto_link: mailtoLink,
      is_read: 0,
      created_at: nowIso(),
    };
    state.notifications.unshift(rNotif);

    return {
      item: c.is_anonymous && c.user_id !== state.currentUser?.id
        ? { ...c, reporter_display_name: 'Pelapor Anonim (Dilindungi UU PDP)', student_info: 'Disamarkan (Anonim)', user_id: null }
        : { ...c },
      reporter_notification: {
        is_anonymous_protected: isAnon,
        recipient: recipientLabel,
        wa_link: waLink,
        mailto_link: mailtoLink,
        status: extStatus,
        summary: rNotif.summary,
      },
    };
  }

  if (cleanPath === '/api/evaluations' && method === 'GET') {
    const summary = computeEvalSummary(tenant.id);
    let items = [];
    if (state.currentUser && state.currentUser.tenant_id === tenant.id) {
      const isStaff = ['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) && state.currentUser.verification_status === 'verified';
      const base = isStaff
        ? state.evaluations.filter((e) => e.tenant_id === tenant.id)
        : state.evaluations.filter((e) => e.tenant_id === tenant.id && e.user_id === state.currentUser.id);
      items = base.map((e) =>
        e.is_anonymous && e.user_id !== state.currentUser.id
          ? { ...e, respondent_name: 'Responden Anonim (Dilindungi UU PDP)', user_id: null }
          : { ...e }
      );
    }
    return { items, summary };
  }

  if (cleanPath === '/api/evaluations' && method === 'POST') {
    if (!state.currentUser) throw new Error('Silakan masuk terlebih dahulu sebelum mengirim penilaian.');
    if (state.currentUser.tenant_id !== tenant.id) {
      throw new Error('Akses ditolak: Anda hanya dapat menilai sekolah tempat akun terdaftar.');
    }
    const appR = Number(body.app_rating);
    const schoolR = Number(body.school_response_rating);
    if (!Number.isInteger(appR) || appR < 1 || appR > 5 || !Number.isInteger(schoolR) || schoolR < 1 || schoolR > 5) {
      throw new Error('Rating aplikasi dan rating respon sekolah harus berupa angka 1–5.');
    }
    const isAnon = body.is_anonymous ? 1 : 0;
    const item = {
      id: state.nextEvalId++,
      tenant_id: tenant.id,
      user_id: state.currentUser.id,
      respondent_name: isAnon ? 'Responden Anonim (Dilindungi UU PDP)' : state.currentUser.full_name,
      respondent_role: state.currentUser.role,
      is_anonymous: isAnon,
      ticket_code: (body.ticket_code || '').trim().slice(0, 40),
      app_rating: appR,
      school_response_rating: schoolR,
      response_speed: (body.response_speed || 'Cepat (≤24 Jam)').trim(),
      followup_clarity: (body.followup_clarity || 'Sangat Jelas & Tuntas').trim(),
      comment: (body.comment || '').trim().slice(0, 1000),
      created_at: nowIso(),
    };
    state.evaluations.unshift(item);
    return { item, summary: computeEvalSummary(tenant.id) };
  }

  if (cleanPath === '/api/ikm' && method === 'GET') {
    const tSurveys = state.ikm_surveys.filter((x) => x.tenant_id === tenant.id);
    const summary = computeIkmSummaryLocal(tSurveys);
    let items = [];
    if (state.currentUser && state.currentUser.tenant_id === tenant.id) {
      const isStaff = ['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) && state.currentUser.verification_status === 'verified';
      const base = isStaff ? tSurveys : tSurveys.filter((x) => x.user_id === state.currentUser.id);
      items = base.map((x) =>
        x.is_anonymous && x.user_id !== state.currentUser.id
          ? { ...x, respondent_name: 'Responden Anonim (Dilindungi UU PDP)', user_id: null }
          : { ...x }
      );
    }
    return { items, summary };
  }

  if (cleanPath === '/api/ikm' && method === 'POST') {
    if (!state.currentUser) throw new Error('Silakan masuk terlebih dahulu sebelum mengisi Survei IKM 9 Unsur.');
    if (state.currentUser.tenant_id !== tenant.id) {
      throw new Error('Akses ditolak: Anda hanya dapat mengisi IKM untuk sekolah tempat akun terdaftar.');
    }
    const keys = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9'];
    const scores = {};
    for (const k of keys) {
      const v = Number(body[k]);
      if (!Number.isInteger(v) || v < 1 || v > 4) {
        throw new Error(`Nilai unsur ${k.toUpperCase()} harus berupa angka 1 sampai 4.`);
      }
      scores[k] = v;
    }
    const isAnon = body.is_anonymous ? 1 : 0;
    const item = {
      id: state.nextIkmId++,
      tenant_id: tenant.id,
      user_id: state.currentUser.id,
      respondent_name: isAnon ? 'Responden Anonim (Dilindungi UU PDP)' : state.currentUser.full_name,
      respondent_role: state.currentUser.role,
      is_anonymous: isAnon,
      ...scores,
      suggestion: (body.suggestion || '').trim().slice(0, 1000),
      created_at: nowIso(),
    };
    state.ikm_surveys.unshift(item);
    return { item, summary: computeIkmSummaryLocal(state.ikm_surveys.filter((x) => x.tenant_id === tenant.id)) };
  }

  if (cleanPath === '/api/ikm/rtl' && method === 'GET') {
    const summary = computeIkmSummaryLocal(state.ikm_surveys.filter((x) => x.tenant_id === tenant.id));
    const weakest = summary.respondent_count > 0 ? [...summary.elements].sort((a, b) => a.nrr - b.nrr).slice(0, 2) : [];
    const targetDt = localDateYmd(30);
    return {
      items: state.ikm_action_plans.filter((x) => x.tenant_id === tenant.id),
      weakest_elements: weakest,
      suggested_target_date: targetDt,
    };
  }

  if (cleanPath === '/api/ikm/rtl' && method === 'POST') {
    if (!state.currentUser || !['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Guru Piket / Tim TPPK / Kepala Sekolah terverifikasi.');
    }
    const item = {
      id: state.nextRtlId++,
      tenant_id: tenant.id,
      unsur_code: body.unsur_code || 'U1',
      unsur_label: body.unsur_label || 'Unsur IKM',
      current_avg: Number(body.current_avg || 0),
      action_plan: (body.action_plan || '').trim(),
      pic_name: (body.pic_name || state.currentUser.full_name).trim(),
      target_date: (body.target_date || localDateYmd(30)).trim(),
      status: 'Direncanakan',
      evidence_note: '',
      created_by: state.currentUser.id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    state.ikm_action_plans.unshift(item);
    return { item };
  }

  if (cleanPath.startsWith('/api/ikm/rtl/') && method === 'PATCH') {
    if (!state.currentUser || !['tppk_piket', 'admin_sekolah'].includes(state.currentUser.role) || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Guru Piket / Tim TPPK / Kepala Sekolah terverifikasi.');
    }
    const rid = Number(cleanPath.split('/').pop());
    const found = state.ikm_action_plans.find((x) => x.id === rid && x.tenant_id === tenant.id);
    if (!found) throw new Error('RTL IKM tidak ditemukan.');
    found.status = body.status || found.status;
    found.evidence_note = body.evidence_note ?? found.evidence_note;
    found.updated_at = nowIso();
    return { item: { ...found } };
  }

  if (cleanPath === '/api/admin/users' && method === 'GET') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    return {
      items: state.users
        .filter((u) => u.tenant_id === tenant.id && u.role !== 'guest_reporter')
        .map((u) => {
          const safe = { ...u };
          delete safe._password;
          return safe;
        }),
    };
  }

  if (cleanPath === '/api/auth/change-password' && method === 'POST') {
    if (!state.currentUser) throw new Error('Silakan masuk terlebih dahulu.');
    const oldPw = (body.old_password || '').trim();
    const newPw = (body.new_password || '').trim();
    if (!oldPw || newPw.length < 6) {
      throw new Error('Kata sandi lama wajib diisi dan kata sandi baru minimal 6 karakter.');
    }
    const u = state.users.find((x) => x.id === state.currentUser.id);
    if (!u || u._password !== oldPw) {
      throw new Error('Kata sandi lama tidak sesuai.');
    }
    u._password = newPw;
    u.token_version = (u.token_version || 1) + 1;
    state.currentUser = { ...state.currentUser, token_version: u.token_version };
    return { ok: true, token: `local-${u.id}-v${u.token_version}`, message: 'Kata sandi berhasil diperbarui.' };
  }

  if (cleanPath.startsWith('/api/admin/users/') && cleanPath.endsWith('/verify') && method === 'PATCH') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    const uid = Number(cleanPath.split('/')[4]);
    const u = state.users.find((x) => x.id === uid && x.tenant_id === tenant.id && x.role !== 'guest_reporter');
    if (!u) throw new Error('Pengguna tidak ditemukan pada tenant sekolah Anda.');
    const status = body.verification_status || 'verified';
    u.verification_status = status;
    if (status === 'pending' || status === 'rejected') {
      u.token_version = (u.token_version || 1) + 1;
    }
    const safe = { ...u };
    delete safe._password;
    return { user: safe };
  }

  if (cleanPath.startsWith('/api/admin/users/') && cleanPath.endsWith('/reset-password') && method === 'POST') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    const uid = Number(cleanPath.split('/')[4]);
    const newPw = (body.new_password || '').trim();
    if (newPw.length < 6) throw new Error('Kata sandi sementara minimal 6 karakter.');
    const u = state.users.find((x) => x.id === uid && x.tenant_id === tenant.id && x.role !== 'guest_reporter');
    if (!u) throw new Error('Pengguna tidak ditemukan pada tenant sekolah Anda.');
    u._password = newPw;
    u.token_version = (u.token_version || 1) + 1;
    const safe = { ...u };
    delete safe._password;
    return { ok: true, user: safe, message: `Kata sandi ${u.full_name} berhasil direset.` };
  }

  if (cleanPath === '/api/public/fkp' && method === 'GET') {
    const tItems = state.public_transparency_items.filter((x) => x.tenant_id === tenant.id);
    const polls = state.fkp_polls
      .filter((p) => p.tenant_id === tenant.id && p.is_active)
      .map((p) => {
        const resps = state.fkp_responses.filter((r) => r.tenant_id === tenant.id && r.poll_id === p.id);
        const counts = {};
        for (const o of p.options) counts[o] = 0;
        for (const r of resps) counts[r.selected_option] = (counts[r.selected_option] || 0) + 1;
        return { ...p, counts, total_votes: resps.length };
      });
    return {
      transparency_items: tItems,
      polls,
      recent_feedback: state.fkp_responses.filter((r) => r.tenant_id === tenant.id).slice(0, 25),
    };
  }

  if (cleanPath === '/api/public/fkp/feedback' && method === 'POST') {
    const poll = state.fkp_polls.find((p) => p.id === Number(body.poll_id) && p.tenant_id === tenant.id);
    if (!poll || !body.selected_option) throw new Error('Pilih salah satu opsi usulan FKP.');
    const item = {
      id: state.nextFkpRespId++,
      tenant_id: tenant.id,
      poll_id: poll.id,
      selected_option: body.selected_option,
      respondent_role: body.respondent_role || 'Masyarakat Umum',
      respondent_name: body.respondent_name || 'Warga / Masyarakat Umum',
      suggestion: (body.suggestion || '').trim(),
      created_at: nowIso(),
    };
    state.fkp_responses.unshift(item);
    return { item };
  }

  if (cleanPath === '/api/public/transparency' && method === 'POST') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    const item = {
      id: state.nextPpidId++,
      tenant_id: tenant.id,
      category: body.category || 'Informasi Publik Sekolah',
      title: (body.title || '').trim(),
      summary: (body.summary || '').trim(),
      metric_value: (body.metric_value || '').trim(),
      updated_at: nowIso(),
    };
    state.public_transparency_items.push(item);
    return { item };
  }

  if (cleanPath.startsWith('/api/public/transparency/') && method === 'PATCH') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    const pid = Number(cleanPath.split('/').pop());
    const found = state.public_transparency_items.find((x) => x.id === pid && x.tenant_id === tenant.id);
    if (!found) throw new Error('Item PPID tidak ditemukan.');
    if (body.category !== undefined) found.category = String(body.category).trim() || found.category;
    if (body.title !== undefined) found.title = String(body.title).trim() || found.title;
    if (body.summary !== undefined) found.summary = String(body.summary).trim() || found.summary;
    if (body.metric_value !== undefined) found.metric_value = String(body.metric_value).trim();
    found.updated_at = nowIso();
    return { item: { ...found } };
  }

  if (cleanPath === '/api/public/fkp/polls' && method === 'POST') {
    if (!state.currentUser || state.currentUser.role !== 'admin_sekolah' || state.currentUser.verification_status !== 'verified') {
      throw new Error('Khusus Kepala Sekolah / Admin terverifikasi.');
    }
    const opts = Array.isArray(body.options) ? body.options.map((o) => String(o).trim()).filter(Boolean) : [];
    if (!String(body.topic_title || '').trim() || opts.length < 2) {
      throw new Error('Judul topik FKP dan minimal 2 opsi wajib diisi.');
    }
    const poll = {
      id: state.nextPollId++,
      tenant_id: tenant.id,
      topic_title: String(body.topic_title).trim(),
      topic_desc: String(body.topic_desc || '').trim(),
      options: opts,
      is_active: 1,
      created_at: nowIso(),
    };
    state.fkp_polls.unshift(poll);
    return { item: poll };
  }

  if (cleanPath === '/api/chat' && method === 'POST') {
    const q = (body.question || '').toLowerCase();
    const recap = computeRecap(tenant.id);
    const role = state.currentUser?.role || 'orang_tua';

    let answer;
    if (q.includes('maklumat') || q.includes('standar pelayanan') || q.includes('biaya') || q.includes('gratis') || q.includes('rp 0')) {
      answer =
        `Maklumat & Standar Pelayanan ${tenant.name}: Seluruh layanan pengaduan & konsultasi GRATIS (Rp 0, bebas pungli), SLA <= ${tenant.sla_hours || 24} jam kerja, bisa Anonim (UU PDP), dan ramah kelompok rentan (SK 421.2/045 & SK 421.2/047).`;
    } else if (q.includes('rentan') || q.includes('disabilitas') || q.includes('inklusi') || q.includes('perwali')) {
      answer =
        `Sesuai Perwali Kode Etik Makassar No. 68/2021 dan Kode Etik Pelayanan Kelompok Rentan ${tenant.name} (Kepala Sekolah: ${tenant.principal_name}), penyandang disabilitas, siswa inklusi, lansia, ibu hamil/menyusui, dan anak-anak mendapat layanan prioritas & pendampingan khusus.`;
    } else if (q.includes('pekppp') || q.includes('simpel') || q.includes('span') || q.includes('monev')) {
      answer =
        `SI-PAKAINGE MONSA mendukung penuh penilaian PEKPPP Aspek 04 (SIPP), Aspek 05 (Konsultasi & Pengaduan pendamping SP4N-LAPOR!), dan Aspek 06 (Inovasi SIMPEL).`;
    } else if (q.includes('banyak sekolah') || q.includes('tenant') || q.includes('makassar')) {
      answer =
        `Aplikasi ini dimiliki secara tunggal oleh ${tenant.name} (${tenant.tenant_code}), namun basis datanya memakai isolasi tenant_id agar sekolah lain di Kota Makassar dapat mengadopsinya nanti tanpa menulis ulang kode inti.`;
    } else if (q.includes('jumlah') || q.includes('laporan') || q.includes('status') || q.includes('rekap')) {
      if (role === 'tppk_piket' || role === 'admin_sekolah') {
        answer = `Rekap Pengaduan ${tenant.short_name}:\n• Total: ${recap.total} (${recap.done} selesai, ${recap.processing} diproses)\n• Prioritas Kelompok Rentan: ${recap.rentan_count}\n• Ketuntasan: ${recap.completion_pct}%`;
      } else {
        const mine = state.complaints.filter((c) => c.tenant_id === tenant.id && c.user_id === state.currentUser?.id);
        answer = mine.length
          ? `Anda memiliki ${mine.length} aduan. Tiket terbaru: ${mine[0].ticket_code} (Status: ${mine[0].status}).`
          : `Rekap publik ${tenant.short_name}: ${recap.total} aduan masuk, ${recap.done} selesai (${recap.completion_pct}%).`;
      }
    } else {
      answer = `Saya Asisten Resmi ${tenant.name} (Kepala Sekolah: ${tenant.principal_name}, NPSN ${tenant.npsn}).`;
    }
    return { answer, citations: state.knowledge_base.map((k) => ({ title: k.title, category: k.category })), role_scope: role };
  }

  throw new Error(`Endpoint ${method} ${cleanPath} tidak didukung.`);
}
