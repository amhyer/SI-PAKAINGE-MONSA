// Unit test util SLA (Fase 3) — hitungan countdown/terlambat/penyelesaian.
import { describe, expect, it } from 'vitest';
import {
  computeComplaintSla,
  computeSlaSummary,
  formatHoursDuration,
  localDateYmd,
  parseSlaTimestamp,
} from '../utils/sla';

// Waktu acuan tetap: 15 Januari 2026, 12:00 waktu lokal.
const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

function fmt(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} `
    + `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const hoursAgo = (h, now = NOW) => fmt(now - h * 3600000);

describe('parseSlaTimestamp', () => {
  it('mem-parse format server YYYY-MM-DD HH:MM:SS sebagai waktu lokal', () => {
    const dt = parseSlaTimestamp('2026-01-15 10:30:00');
    expect(dt).toBeInstanceOf(Date);
    expect(dt.getFullYear()).toBe(2026);
    expect(dt.getHours()).toBe(10);
    expect(dt.getMinutes()).toBe(30);
  });

  it('menerima varian ISO dengan T', () => {
    const a = parseSlaTimestamp('2026-01-15T10:30:00');
    const b = parseSlaTimestamp('2026-01-15 10:30:00');
    expect(a.getTime()).toBe(b.getTime());
  });

  it('mengembalikan null untuk nilai kosong/rusak', () => {
    expect(parseSlaTimestamp('')).toBeNull();
    expect(parseSlaTimestamp(null)).toBeNull();
    expect(parseSlaTimestamp(undefined)).toBeNull();
    expect(parseSlaTimestamp('bukan-tanggal')).toBeNull();
  });
});

describe('formatHoursDuration', () => {
  it('format jam-menit biasa', () => {
    expect(formatHoursDuration(2.5)).toBe('2j 30m');
    expect(formatHoursDuration(0)).toBe('0j 0m');
    expect(formatHoursDuration(null)).toBe('0j 0m');
  });

  it('format melebihi 24 jam menyertakan hari', () => {
    expect(formatHoursDuration(30.5)).toBe('1h 6j 30m');
  });

  it('nilai negatif diambil nilai absolutnya', () => {
    expect(formatHoursDuration(-3)).toBe('3j 0m');
  });
});

describe('localDateYmd', () => {
  it('format YYYY-MM-DD dengan offset hari', () => {
    expect(localDateYmd(0, NOW)).toBe('2026-01-15');
    expect(localDateYmd(1, NOW)).toBe('2026-01-16');
    expect(localDateYmd(-1, NOW)).toBe('2026-01-14');
  });
});

describe('computeComplaintSla', () => {
  it('tiket baru: state aman, sisa ~SLA', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(1), status: 'Diproses' }, 24, NOW,
    );
    expect(r.sla_state).toBe('aman');
    expect(r.is_overdue).toBe(false);
    expect(r.is_warning).toBe(false);
    expect(r.remaining_hours).toBeCloseTo(23, 1);
    expect(r.unresponded).toBe(false);
    expect(r.badge_text).toContain('Sisa');
  });

  it('mendekati batas: state kritis + badge SEGERA', () => {
    // Sisa 5 jam <= ambang min(6, 24*0.25=6)
    const r = computeComplaintSla(
      { created_at: hoursAgo(19), status: 'Diproses' }, 24, NOW,
    );
    expect(r.sla_state).toBe('kritis');
    expect(r.is_warning).toBe(true);
    expect(r.is_overdue).toBe(false);
    expect(r.badge_text).toContain('SEGERA');
  });

  it('lewat batas: state terlambat + badge ALARM', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(30), status: 'Diproses' }, 24, NOW,
    );
    expect(r.sla_state).toBe('terlambat');
    expect(r.is_overdue).toBe(true);
    expect(r.overdue_hours).toBeCloseTo(6, 1);
    expect(r.badge_text).toContain('ALARM');
  });

  it('tepat 24 jam (sisa 0) dianggap terlambat', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(24), status: 'Diproses' }, 24, NOW,
    );
    expect(r.is_overdue).toBe(true);
    expect(r.remaining_hours).toBe(0);
  });

  it('selesai tepat waktu: elapsed <= SLA', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(10), resolved_at: hoursAgo(4), status: 'Selesai' },
      24, NOW,
    );
    expect(r.sla_state).toBe('selesai_tepat_waktu');
    expect(r.is_overdue).toBe(false);
    expect(r.elapsed_hours).toBeCloseTo(6, 1);
    expect(r.overdue_hours).toBe(0);
    expect(r.badge_text).toContain('Memenuhi SLA');
  });

  it('selesai lewat SLA: hitung kelebihan', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(40), resolved_at: hoursAgo(10), status: 'Selesai' },
      24, NOW,
    );
    expect(r.sla_state).toBe('selesai_lewat_sla');
    expect(r.is_overdue).toBe(true);
    expect(r.elapsed_hours).toBeCloseTo(30, 1);
    expect(r.overdue_hours).toBeCloseTo(6, 1);
    expect(r.badge_text).toContain('Lewat SLA');
  });

  it('tanpa created_at: aman, sisa penuh, tandai belum direspon bila Diterima', () => {
    const r = computeComplaintSla({ status: 'Diterima' }, 24, NOW);
    expect(r.sla_state).toBe('aman');
    expect(r.is_overdue).toBe(false);
    expect(r.elapsed_hours).toBe(0);
    expect(r.remaining_hours).toBe(24);
    expect(r.unresponded).toBe(true);
    expect(r.badge_text).toContain('Target SLA');
  });

  it('status Diterima dengan tiket lama tetap ditandai belum direspon', () => {
    const r = computeComplaintSla(
      { created_at: hoursAgo(30), status: 'Diterima' }, 24, NOW,
    );
    expect(r.unresponded).toBe(true);
    expect(r.is_overdue).toBe(true);
  });

  it('SLA tidak valid -> fallback 24 jam', () => {
    expect(computeComplaintSla({}, 0, NOW).sla_hours).toBe(24);
    expect(computeComplaintSla({}, undefined, NOW).sla_hours).toBe(24);
    expect(computeComplaintSla({}, -5, NOW).sla_hours).toBe(1); // minimal 1
  });
});

describe('computeSlaSummary', () => {
  const mixed = [
    { created_at: hoursAgo(30), status: 'Diproses' },          // terlambat
    { created_at: hoursAgo(19), status: 'Diproses' },          // kritis
    { created_at: hoursAgo(1), status: 'Diterima' },           // belum direspon
    { created_at: hoursAgo(10), resolved_at: hoursAgo(4), status: 'Selesai' }, // tepat
    { created_at: hoursAgo(40), resolved_at: hoursAgo(10), status: 'Selesai' }, // lewat
  ];

  it('menghitung overdue/warning/unresponded/persen tepat waktu', () => {
    const s = computeSlaSummary(mixed, 24, NOW);
    expect(s.sla_overdue_count).toBe(1);
    expect(s.sla_warning_count).toBe(1);
    expect(s.sla_unresponded_count).toBe(1);
    expect(s.sla_on_time_pct).toBe(50);   // 1 dari 2 selesai tepat waktu
    expect(s.avg_resolution_hours).toBe(18); // (6 + 30) / 2
    expect(s.sla_hours).toBe(24);
  });

  it('daftar kosong: nol masalah, 100% tepat waktu', () => {
    const s = computeSlaSummary([], 24, NOW);
    expect(s.sla_overdue_count).toBe(0);
    expect(s.sla_warning_count).toBe(0);
    expect(s.sla_unresponded_count).toBe(0);
    expect(s.sla_on_time_pct).toBe(100);
    expect(s.avg_resolution_hours).toBe(0);
  });

  it('tiket selesai tidak dihitung sebagai overdue terbuka', () => {
    const s = computeSlaSummary(
      [{ created_at: hoursAgo(40), resolved_at: hoursAgo(10), status: 'Selesai' }],
      24, NOW,
    );
    expect(s.sla_overdue_count).toBe(0);
    expect(s.sla_on_time_pct).toBe(0);
  });
});
