// Unit test util IKM 9 unsur (PermenPAN-RB 14/2017) — Fase 3.
import { describe, expect, it } from 'vitest';
import {
  IKM_ELEMENTS,
  computeIkmSummaryLocal,
  getIkmGradeInfo,
  simulateIkmFromNrr,
} from '../utils/ikm';

describe('getIkmGradeInfo', () => {
  it('tanpa responden -> predikat khusus', () => {
    const g = getIkmGradeInfo(90, 0);
    expect(g.grade).toBe('-');
    expect(g.predicate).toBe('Belum Ada Data Responden');
  });

  it('batas nilai grade A/B/C/D (PermenPAN-RB 14/2017)', () => {
    expect(getIkmGradeInfo(88.31, 1).grade).toBe('A');
    expect(getIkmGradeInfo(88.30, 1).grade).toBe('B'); // di bawah 88.31
    expect(getIkmGradeInfo(76.61, 1).grade).toBe('B');
    expect(getIkmGradeInfo(76.60, 1).grade).toBe('C');
    expect(getIkmGradeInfo(65.0, 1).grade).toBe('C');
    expect(getIkmGradeInfo(64.99, 1).grade).toBe('D');
    expect(getIkmGradeInfo(25, 1).grade).toBe('D');
  });

  it('predicate mengikuti grade', () => {
    expect(getIkmGradeInfo(95, 5).predicate).toBe('Sangat Baik');
    expect(getIkmGradeInfo(80, 5).predicate).toBe('Baik');
    expect(getIkmGradeInfo(70, 5).predicate).toBe('Kurang Baik');
    expect(getIkmGradeInfo(50, 5).predicate).toBe('Tidak Baik');
  });
});

describe('computeIkmSummaryLocal', () => {
  it('tanpa baris: 0 responden, 9 elemen, skor 0', () => {
    const s = computeIkmSummaryLocal([]);
    expect(s.respondent_count).toBe(0);
    expect(s.ikm_score).toBe(0);
    expect(s.grade).toBe('-');
    expect(s.elements).toHaveLength(IKM_ELEMENTS.length);
    expect(s.lowest_element).toBeNull();
    expect(s.highest_element).toBeNull();
  });

  it('semua nilai 4 -> NRR 4, konversi 100, skor 100 (grade A)', () => {
    const rows = [1, 2, 3].map(() => ({
      u1: 4, u2: 4, u3: 4, u4: 4, u5: 4, u6: 4, u7: 4, u8: 4, u9: 4,
    }));
    const s = computeIkmSummaryLocal(rows);
    expect(s.respondent_count).toBe(3);
    expect(s.ikm_score).toBe(100);
    expect(s.grade).toBe('A');
    for (const el of s.elements) {
      expect(el.nrr).toBe(4);
      expect(el.konversi).toBe(100);
      expect(el.nrr_tertimbang).toBeCloseTo(4 / 9, 4);
    }
  });

  it('semua nilai 1 -> skor 25 (grade D)', () => {
    const rows = [{
      u1: 1, u2: 1, u3: 1, u4: 1, u5: 1, u6: 1, u7: 1, u8: 1, u9: 1,
    }];
    const s = computeIkmSummaryLocal(rows);
    expect(s.ikm_score).toBe(25);
    expect(s.grade).toBe('D');
    expect(s.predicate).toBe('Tidak Baik');
  });

  it('elemen terlemah/tertinggi terdeteksi dari rata-rata', () => {
    const rows = [
      { u1: 4, u2: 4, u3: 2, u4: 4, u5: 4, u6: 4, u7: 4, u8: 4, u9: 4 },
      { u1: 4, u2: 4, u3: 2, u4: 4, u5: 4, u6: 4, u7: 4, u8: 4, u9: 4 },
    ];
    const s = computeIkmSummaryLocal(rows);
    expect(s.lowest_element.key).toBe('u3');
    expect(s.lowest_element.nrr).toBe(2);
    expect(s.lowest_element.konversi).toBe(50);
    expect(s.highest_element.nrr).toBe(4);
    expect(s.highest_element.key).not.toBe('u3');
    // (2 + 4*8) / 9 * 25 = 94.44
    expect(s.ikm_score).toBe(94.44);
    expect(s.grade).toBe('A');
  });

  it('field hilang dihitung 0 (bukan undefined -> NaN)', () => {
    const s = computeIkmSummaryLocal([{ u2: 4, u3: 4, u4: 4, u5: 4, u6: 4, u7: 4, u8: 4, u9: 4 }]);
    const u1 = s.elements.find((e) => e.key === 'u1');
    expect(u1.nrr).toBe(0);
    expect(Number.isNaN(s.ikm_score)).toBe(false);
    expect(s.lowest_element.key).toBe('u1');
  });

  it('label elemen memakai kode U1..U9', () => {
    const s = computeIkmSummaryLocal([]);
    expect(s.elements[0].label).toBe('U1 - Persyaratan Pelayanan');
    expect(s.elements[8].label).toBe('U9 - Sarana & Prasarana');
  });
});

describe('simulateIkmFromNrr', () => {
  it('clamp NRR ke rentang 1..4', () => {
    const s = simulateIkmFromNrr({ u1: 9, u2: -3, u3: 2.5 });
    const byKey = Object.fromEntries(s.elements.map((e) => [e.key, e.nrr]));
    expect(byKey.u1).toBe(4);   // di atas 4 -> 4
    expect(byKey.u2).toBe(1);   // di bawah 1 -> 1
    expect(byKey.u3).toBe(2.5);
  });

  it('elemen tanpa nilai memakai default 4', () => {
    const s = simulateIkmFromNrr({});
    expect(s.elements.every((e) => e.nrr === 4)).toBe(true);
    // nrr_tertimbang dibulatkan 4 desimal (0.4444) lalu dijumlahkan:
    // 9 × 0.4444 × 25 = 99.99 — perilaku pembulatan yang ada di ikm.js.
    expect(s.ikm_score).toBe(99.99);
    expect(s.grade).toBe('A');
  });

  it('NRR 1 di satu elemen menurunkan skor ke 91.66', () => {
    const s = simulateIkmFromNrr({ u3: 1 });
    // (8 × 0.4444 + 0.1111) × 25 = 91.6575 -> 91.66
    expect(s.ikm_score).toBe(91.66);
    expect(s.respondent_count).toBe(1);
  });

  it('nrr_tertimbang = NRR / 9 dan konversi = NRR * 25', () => {
    const s = simulateIkmFromNrr({ u1: 2 });
    const u1 = s.elements.find((e) => e.key === 'u1');
    expect(u1.nrr_tertimbang).toBeCloseTo(2 / 9, 4);
    expect(u1.konversi).toBe(50);
  });
});
