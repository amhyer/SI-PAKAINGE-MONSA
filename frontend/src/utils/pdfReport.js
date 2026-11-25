import { localDateYmd } from './sla.js';
import { formatIkmScore } from './ikm.js';

// Pure-JS A4 PDF 1.4 generator for SI-PAKAINGE MONSA official school reports.
// Zero external dependencies; works identically online, offline, in sandboxed previews, and in Android WebView.

function cleanPdfText(input) {
  return String(input ?? '')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[·•]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/★/g, '*')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, ' ');
}

function pdfEscape(str) {
  return cleanPdfText(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapText(text, maxChars) {
  const cleaned = cleanPdfText(text).trim();
  if (!cleaned) return ['-'];
  const words = cleaned.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      if (w.length <= maxChars) {
        cur = w;
      } else {
        for (let i = 0; i < w.length; i += maxChars) {
          lines.push(w.slice(i, i + maxChars));
        }
      }
    } else if (cur.length + 1 + w.length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w.length <= maxChars ? w : w.slice(0, maxChars);
      if (w.length > maxChars) {
        for (let i = maxChars; i < w.length; i += maxChars) {
          lines.push(w.slice(i, i + maxChars));
        }
        cur = '';
      }
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : ['-'];
}

export function getQualityPredicate(avgScore, count) {
  if (!count) return 'Belum Ada Data Responden';
  if (avgScore >= 4.2) return 'Sangat Baik (Mutu Prima)';
  if (avgScore >= 3.4) return 'Baik (Memenuhi Standar)';
  if (avgScore >= 2.6) return 'Cukup (Perlu Peningkatan)';
  return 'Kurang (Evaluasi Segera)';
}

export function buildEvaluationPdfBytes({ school, summary, items, printedAt }) {
  const W = 595.28; // A4 width pt
  const H = 841.89; // A4 height pt
  const ML = 42;
  const MR = 42;
  const CW = W - ML - MR;

  const pages = [];
  let ops = [];
  let y = H - 44;

  function flushPage() {
    pages.push(ops.join('\n'));
    ops = [];
    y = H - 48;
  }

  function ensureSpace(needed) {
    if (y - needed < 54) {
      flushPage();
      return true;
    }
    return false;
  }

  function drawRect(x, topY, w, h, fillRgb = null, strokeRgb = null, lineW = 0.6) {
    const bottomY = topY - h;
    ops.push('q');
    if (fillRgb) ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    if (strokeRgb) {
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
      ops.push(`${lineW} w`);
    }
    ops.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRgb && strokeRgb) ops.push('B');
    else if (fillRgb) ops.push('f');
    else ops.push('S');
    ops.push('Q');
  }

  function drawLine(x1, y1, x2, y2, rgb = [0.7, 0.75, 0.82], lineW = 0.6) {
    ops.push(`q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineW} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }

  function drawText(text, x, ty, size = 9.5, font = 'F1', rgb = [0.08, 0.12, 0.18]) {
    ops.push(`BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${ty.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
  }

  function drawCentered(text, centerX, ty, size = 10, font = 'F2', rgb = [0.08, 0.12, 0.18]) {
    const clean = cleanPdfText(text);
    const estW = clean.length * size * 0.48;
    drawText(clean, Math.max(ML, centerX - estW / 2), ty, size, font, rgb);
  }

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const npsn = school?.npsn || '40313912';
  const address = school?.address || 'Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142';
  const contact = `Email: ${school?.email || 'sdnungmongisidi1@gmail.com'} | Hotline: ${school?.hotline || '(0411) 8918116 / WA 081355982195'}`;
  const dateStr = printedAt || localDateYmd();

  // 1. Official School Letterhead (Kop Surat)
  drawRect(ML, y, CW, 58, [0.043, 0.176, 0.322]); // #0B2D52
  drawCentered('PEMERINTAH KOTA MAKASSAR - DINAS PENDIDIKAN', W / 2, y - 16, 9, 'F2', [0.75, 0.92, 0.98]);
  drawCentered(schoolName.toUpperCase(), W / 2, y - 31, 12.5, 'F2', [1, 1, 1]);
  drawCentered(`NPSN ${npsn} | ${address}`, W / 2, y - 44, 7.8, 'F1', [0.85, 0.94, 0.98]);
  drawCentered(contact, W / 2, y - 54, 7.2, 'F1', [0.75, 0.88, 0.95]);
  y -= 68;

  drawLine(ML, y + 4, W - MR, y + 4, [0.05, 0.45, 0.56], 1.6);
  y -= 14;

  // Report Title
  drawCentered('LAPORAN RESMI EVALUASI APLIKASI SI-PAKAINGE MONSA', W / 2, y, 11.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 14;
  drawCentered('& PENILAIAN RESPON TINDAK LANJUT SEKOLAH (PEKPPP 05B & SIMPEL 06B)', W / 2, y, 9.5, 'F2', [0.055, 0.455, 0.565]);
  y -= 14;
  drawText(`Tanggal Cetak: ${dateStr}`, ML, y, 8.2, 'F1', [0.35, 0.4, 0.48]);
  drawText(`Total Responden: ${summary?.eval_count ?? 0} orang`, W - MR - 118, y, 8.2, 'F2', [0.043, 0.176, 0.322]);
  y -= 14;

  // 2. Summary Score Cards
  const avgApp = Number(summary?.avg_app_rating || 0);
  const avgSchool = Number(summary?.avg_school_rating || 0);
  const count = Number(summary?.eval_count || 0);
  const boxW = (CW - 10) / 2;

  drawRect(ML, y, boxW, 52, [0.94, 0.98, 1.0], [0.65, 0.85, 0.92], 0.8);
  drawText('INDEKS PENILAIAN APLIKASI SI-PAKAINGE', ML + 10, y - 14, 8, 'F2', [0.055, 0.455, 0.565]);
  drawText(`${avgApp ? avgApp.toFixed(2) : '0.00'} / 5.00`, ML + 10, y - 31, 14, 'F2', [0.043, 0.176, 0.322]);
  drawText(`Predikat: ${getQualityPredicate(avgApp, count)}`, ML + 10, y - 44, 7.8, 'F1', [0.25, 0.32, 0.4]);

  const bx2 = ML + boxW + 10;
  drawRect(bx2, y, boxW, 52, [0.93, 0.99, 0.96], [0.62, 0.86, 0.74], 0.8);
  drawText('INDEKS RESPON & TINDAK LANJUT SEKOLAH', bx2 + 10, y - 14, 8, 'F2', [0.04, 0.45, 0.3]);
  drawText(`${avgSchool ? avgSchool.toFixed(2) : '0.00'} / 5.00`, bx2 + 10, y - 31, 14, 'F2', [0.03, 0.38, 0.24]);
  drawText(`Predikat: ${getQualityPredicate(avgSchool, count)}`, bx2 + 10, y - 44, 7.8, 'F1', [0.22, 0.34, 0.28]);
  y -= 66;

  // 3. Speed & Clarity Breakdown
  drawText('A. REKAPITULASI KECEPATAN RESPON & KEJELASAN TINDAK LANJUT', ML, y, 9.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;
  const speedEntries = Object.entries(summary?.speed_breakdown || {});
  const clarityEntries = Object.entries(summary?.clarity_breakdown || {});
  const halfW = (CW - 10) / 2;
  const rowsCount = Math.max(1, speedEntries.length, clarityEntries.length);
  const blockH = 18 + rowsCount * 15 + 6;
  ensureSpace(blockH + 10);

  drawRect(ML, y, halfW, 18, [0.93, 0.95, 0.97], [0.8, 0.84, 0.88]);
  drawText('Kecepatan Respon Sekolah', ML + 8, y - 12, 8.2, 'F2');
  drawText('Jumlah', ML + halfW - 38, y - 12, 8.2, 'F2');

  drawRect(ML + halfW + 10, y, halfW, 18, [0.93, 0.95, 0.97], [0.8, 0.84, 0.88]);
  drawText('Kejelasan Tindak Lanjut', ML + halfW + 18, y - 12, 8.2, 'F2');
  drawText('Jumlah', ML + CW - 38, y - 12, 8.2, 'F2');

  let ry = y - 18;
  for (let i = 0; i < rowsCount; i++) {
    drawRect(ML, ry, halfW, 15, [1, 1, 1], [0.85, 0.88, 0.91]);
    if (speedEntries[i]) {
      const [k, v] = speedEntries[i];
      const pct = count ? Math.round((v / count) * 100) : 0;
      drawText(cleanPdfText(k).slice(0, 32), ML + 8, ry - 10.5, 7.8, 'F1');
      drawText(`${v} (${pct}%)`, ML + halfW - 44, ry - 10.5, 7.8, 'F2');
    } else if (i === 0 && !speedEntries.length) {
      drawText('Belum ada responden', ML + 8, ry - 10.5, 7.8, 'F1', [0.5, 0.55, 0.6]);
    }

    drawRect(ML + halfW + 10, ry, halfW, 15, [1, 1, 1], [0.85, 0.88, 0.91]);
    if (clarityEntries[i]) {
      const [k, v] = clarityEntries[i];
      const pct = count ? Math.round((v / count) * 100) : 0;
      drawText(cleanPdfText(k).slice(0, 32), ML + halfW + 18, ry - 10.5, 7.8, 'F1');
      drawText(`${v} (${pct}%)`, ML + CW - 44, ry - 10.5, 7.8, 'F2');
    } else if (i === 0 && !clarityEntries.length) {
      drawText('Belum ada responden', ML + halfW + 18, ry - 10.5, 7.8, 'F1', [0.5, 0.55, 0.6]);
    }
    ry -= 15;
  }
  y = ry - 16;

  // 4. Detailed Respondent Table
  ensureSpace(45);
  drawText('B. DAFTAR EVALUASI & SARAN RESPONDEN (IDENTITAS ANONIM DILINDUNGI UU PDP)', ML, y, 9.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;

  const cols = [
    { label: 'No', w: 22 },
    { label: 'Responden & Tanggal', w: 112 },
    { label: 'App', w: 30 },
    { label: 'Sekolah', w: 38 },
    { label: 'Respon & Tindak Lanjut', w: 122 },
    { label: 'Saran / Masukan', w: CW - (22 + 112 + 30 + 38 + 122) },
  ];

  function drawTableHeader() {
    drawRect(ML, y, CW, 19, [0.043, 0.176, 0.322]);
    let cx = ML;
    for (const c of cols) {
      drawText(c.label, cx + 4, y - 13, 7.6, 'F2', [1, 1, 1]);
      cx += c.w;
    }
    y -= 19;
  }

  drawTableHeader();

  if (!items || items.length === 0) {
    drawRect(ML, y, CW, 24, [0.98, 0.99, 1], [0.84, 0.87, 0.9]);
    drawText('Belum ada data evaluasi masuk pada periode ini.', ML + 8, y - 15, 8.2, 'F1', [0.4, 0.45, 0.52]);
    y -= 24;
  } else {
    items.forEach((ev, idx) => {
      const respLines = wrapText(`${ev.respondent_name || 'Responden'} (${(ev.created_at || '').slice(0, 10)})`, 22);
      const speedLines = wrapText(`${ev.response_speed || '-'} / ${ev.followup_clarity || '-'}${ev.ticket_code ? ` [${ev.ticket_code}]` : ''}`, 25);
      const commentLines = wrapText(ev.comment || '-', 36);
      const maxLines = Math.max(respLines.length, speedLines.length, commentLines.length, 1);
      const rowH = Math.max(20, maxLines * 10.5 + 8);

      if (ensureSpace(rowH + 6)) {
        drawTableHeader();
      }

      const bg = idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995];
      drawRect(ML, y, CW, rowH, bg, [0.84, 0.87, 0.9]);
      let cx = ML;
      for (let ci = 0; ci < cols.length - 1; ci++) {
        cx += cols[ci].w;
        drawLine(cx, y, cx, y - rowH, [0.86, 0.89, 0.92], 0.5);
      }

      let x0 = ML;
      drawText(String(idx + 1), x0 + 5, y - 12, 7.6, 'F1');
      x0 += cols[0].w;

      respLines.forEach((ln, li) => drawText(ln, x0 + 4, y - 12 - li * 10.5, 7.4, li === 0 ? 'F2' : 'F1'));
      x0 += cols[1].w;

      drawText(`${ev.app_rating}/5`, x0 + 5, y - 12, 7.8, 'F2', [0.043, 0.176, 0.322]);
      x0 += cols[2].w;

      drawText(`${ev.school_response_rating}/5`, x0 + 6, y - 12, 7.8, 'F2', [0.03, 0.42, 0.28]);
      x0 += cols[3].w;

      speedLines.forEach((ln, li) => drawText(ln, x0 + 4, y - 12 - li * 10.5, 7.2, 'F1'));
      x0 += cols[4].w;

      commentLines.forEach((ln, li) => drawText(ln, x0 + 4, y - 12 - li * 10.5, 7.3, 'F1'));

      y -= rowH;
    });
  }

  // 5. Principal Approval Signature Block
  y -= 18;
  ensureSpace(92);
  const sigX = W - MR - 210;
  drawText(`Makassar, ${dateStr}`, sigX, y, 8.8, 'F1');
  drawText(`Mengetahui, Kepala ${school?.short_name || 'SDN Unggulan Mongisidi 1'}`, sigX, y - 13, 8.8, 'F1');
  drawText(principalName, sigX, y - 56, 9.2, 'F2', [0.043, 0.176, 0.322]);
  drawText('NIP. 198112072007012013', sigX, y - 68, 8.4, 'F1');

  flushPage();
  return assemblePdfDocument(pages, {
    W,
    H,
    ML,
    MR,
    footerLabel: `SI-PAKAINGE MONSA - Laporan Evaluasi Resmi ${schoolName}`,
  });
}

function assemblePdfDocument(pages, { W, H, ML, MR, footerLabel }) {
  // Assemble PDF objects with running footers
  const objects = [];
  const addObj = (body) => {
    objects.push(body);
    return objects.length;
  };

  const font1Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const font2Id = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = addObj(''); // placeholder
  const pageIds = [];

  const totalPages = pages.length;
  pages.forEach((content, idx) => {
    const footer = `q 0.82 0.85 0.90 RG 0.5 w ${ML} 34 m ${W - MR} 34 l S Q\n` +
      `BT /F1 7.2 Tf 0.42 0.47 0.54 rg ${ML} 23 Td (${pdfEscape(footerLabel)}) Tj ET\n` +
      `BT /F1 7.2 Tf 0.42 0.47 0.54 rg ${W - MR - 62} 23 Td (${pdfEscape(`Halaman ${idx + 1} / ${totalPages}`)}) Tj ET`;
    const stream = `${content}\n${footer}`;
    const cId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pId = addObj(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${font1Id} 0 R /F2 ${font2Id} 0 R >> >> /Contents ${cId} 0 R >>`
    );
    pageIds.push(pId);
  });

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const catalogId = addObj(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function buildIkmPosterPdfBytes({ school, ikmSummary, printedAt }) {
  const W = 595.28;
  const H = 841.89;
  const ML = 40;
  const MR = 40;
  const CW = W - ML - MR;
  const ops = [];
  let y = H - 40;

  function drawRect(x, topY, w, h, fillRgb = null, strokeRgb = null, lineW = 0.7) {
    const bottomY = topY - h;
    ops.push('q');
    if (fillRgb) ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    if (strokeRgb) {
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
      ops.push(`${lineW} w`);
    }
    ops.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRgb && strokeRgb) ops.push('B');
    else if (fillRgb) ops.push('f');
    else ops.push('S');
    ops.push('Q');
  }
  function drawLine(x1, y1, x2, y2, rgb = [0.75, 0.8, 0.86], lineW = 0.6) {
    ops.push(`q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineW} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }
  function drawText(text, x, ty, size = 9.5, font = 'F1', rgb = [0.08, 0.12, 0.18]) {
    ops.push(`BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${ty.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
  }
  function drawCentered(text, centerX, ty, size = 10, font = 'F2', rgb = [0.08, 0.12, 0.18]) {
    const clean = cleanPdfText(text);
    const estW = clean.length * size * 0.48;
    drawText(clean, Math.max(ML, centerX - estW / 2), ty, size, font, rgb);
  }

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const dateStr = printedAt || localDateYmd();
  const cnt = Number(ikmSummary?.respondent_count || 0);
  const score = Number(ikmSummary?.ikm_score || 0);
  const grade = ikmSummary?.grade || '-';
  const predicate = ikmSummary?.predicate || 'Belum Ada Data Responden';

  // Kop Surat Banner
  drawRect(ML, y, CW, 58, [0.043, 0.176, 0.322]);
  drawCentered('PEMERINTAH KOTA MAKASSAR - DINAS PENDIDIKAN', W / 2, y - 16, 9, 'F2', [0.75, 0.92, 0.98]);
  drawCentered(schoolName.toUpperCase(), W / 2, y - 31, 12.5, 'F2', [1, 1, 1]);
  drawCentered(`NPSN ${school?.npsn || '40313912'} | ${school?.address || 'Jl. R.W. Monginsidi No. 13, Makassar'}`, W / 2, y - 44, 7.8, 'F1', [0.85, 0.94, 0.98]);
  drawCentered(`Email: ${school?.email || 'sdnungmongisidi1@gmail.com'} | Hotline: ${school?.hotline || '(0411) 8918116'}`, W / 2, y - 54, 7.2, 'F1', [0.75, 0.88, 0.95]);
  y -= 72;

  drawCentered('PUBLIKASI INDEKS KEPUASAN MASYARAKAT (IKM)', W / 2, y, 13.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 15;
  drawCentered('Berdasarkan PermenPAN-RB Nomor 14 Tahun 2017 (9 Unsur Pelayanan Publik)', W / 2, y, 9.2, 'F1', [0.055, 0.455, 0.565]);
  y -= 18;

  // Big Score & Grade Poster Box
  const gradeRgb =
    grade === 'A' ? [0.03, 0.46, 0.28] : grade === 'B' ? [0.05, 0.42, 0.56] : grade === 'C' ? [0.75, 0.42, 0.04] : grade === 'D' ? [0.72, 0.12, 0.18] : [0.4, 0.45, 0.52];
  drawRect(ML, y, CW, 92, [0.95, 0.985, 0.995], gradeRgb, 1.4);
  const leftW = CW * 0.54;
  drawLine(ML + leftW, y - 10, ML + leftW, y - 82, [0.82, 0.86, 0.9], 0.8);

  drawCentered('NILAI INDEKS KEPUASAN MASYARAKAT', ML + leftW / 2, y - 20, 8.8, 'F2', [0.25, 0.32, 0.4]);
  drawCentered(cnt ? formatIkmScore(score) : '0.00', ML + leftW / 2, y - 54, 30, 'F2', [0.043, 0.176, 0.322]);
  drawCentered(`Skala 25.00 - 100.00 | Jumlah Responden: ${cnt} orang`, ML + leftW / 2, y - 75, 8.2, 'F1', [0.32, 0.38, 0.45]);

  const rightX = ML + leftW;
  const rightW = CW - leftW;
  drawCentered('MUTU PELAYANAN (GRADE)', rightX + rightW / 2, y - 20, 8.8, 'F2', [0.25, 0.32, 0.4]);
  drawCentered(grade, rightX + rightW / 2, y - 54, 30, 'F2', gradeRgb);
  drawCentered(`Predikat: ${predicate}`, rightX + rightW / 2, y - 75, 9.2, 'F2', gradeRgb);
  y -= 108;

  // Scale Legend Strip
  drawRect(ML, y, CW, 24, [0.96, 0.97, 0.985], [0.84, 0.87, 0.91], 0.6);
  drawCentered('Konversi Mutu PermenPAN-RB 14/2017:  A (88.31-100: Sangat Baik)  |  B (76.61-88.30: Baik)  |  C (65.00-76.60: Kurang Baik)  |  D (25.00-64.99: Tidak Baik)', W / 2, y - 15, 7.2, 'F1', [0.25, 0.3, 0.38]);
  y -= 36;

  // 9 Unsur Table
  drawText('RINCIAN NILAI RATA-RATA (NRR) 9 UNSUR PELAYANAN SEKOLAH', ML, y, 9.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;

  const cols = [
    { label: 'No', w: 26 },
    { label: 'Unsur Pelayanan Publik (PermenPAN-RB 14/2017)', w: 266 },
    { label: 'NRR (1-4)', w: 68 },
    { label: 'Nilai Konversi', w: 78 },
    { label: 'Kategori', w: CW - (26 + 266 + 68 + 78) },
  ];
  drawRect(ML, y, CW, 20, [0.043, 0.176, 0.322]);
  let cx = ML;
  for (const c of cols) {
    drawText(c.label, cx + 6, y - 13.5, 7.8, 'F2', [1, 1, 1]);
    cx += c.w;
  }
  y -= 20;

  const els = ikmSummary?.elements || [];
  els.forEach((el, idx) => {
    const rowH = 22;
    const bg = idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995];
    drawRect(ML, y, CW, rowH, bg, [0.84, 0.87, 0.9]);
    let xLine = ML;
    for (let ci = 0; ci < cols.length - 1; ci++) {
      xLine += cols[ci].w;
      drawLine(xLine, y, xLine, y - rowH, [0.86, 0.89, 0.92], 0.5);
    }
    const konv = Number(el.konversi || 0);
    const cat = !cnt ? '-' : konv >= 88.31 ? 'Sangat Baik (A)' : konv >= 76.61 ? 'Baik (B)' : konv >= 65 ? 'Kurang Baik (C)' : 'Tidak Baik (D)';

    let x0 = ML;
    drawText(String(idx + 1), x0 + 9, y - 14, 8, 'F1');
    x0 += cols[0].w;
    drawText(cleanPdfText(el.label), x0 + 6, y - 14, 8, 'F2', [0.1, 0.15, 0.22]);
    x0 += cols[1].w;
    drawText(cnt ? formatIkmScore(el.nrr) : '-', x0 + 18, y - 14, 8.2, 'F2', [0.043, 0.176, 0.322]);
    x0 += cols[2].w;
    drawText(cnt ? formatIkmScore(konv) : '-', x0 + 20, y - 14, 8.2, 'F2', [0.03, 0.42, 0.28]);
    x0 += cols[3].w;
    drawText(cat, x0 + 6, y - 14, 7.6, 'F1');
    y -= rowH;
  });

  y -= 16;
  if (cnt > 0 && ikmSummary?.highest_element && ikmSummary?.lowest_element) {
    drawRect(ML, y, CW, 42, [0.94, 0.98, 0.96], [0.68, 0.86, 0.76], 0.7);
    drawText(`Unsur Tertinggi: ${cleanPdfText(ikmSummary.highest_element.label)} (NRR ${formatIkmScore(ikmSummary.highest_element.nrr)} / Konversi ${formatIkmScore(ikmSummary.highest_element.konversi)})`, ML + 10, y - 16, 8.2, 'F2', [0.03, 0.38, 0.24]);
    drawText(`Prioritas Peningkatan: ${cleanPdfText(ikmSummary.lowest_element.label)} (NRR ${formatIkmScore(ikmSummary.lowest_element.nrr)} / Konversi ${formatIkmScore(ikmSummary.lowest_element.konversi)})`, ML + 10, y - 31, 8.2, 'F1', [0.2, 0.28, 0.35]);
    y -= 54;
  }

  // Maklumat & Principal Signature
  drawRect(ML, y, CW * 0.52, 74, [0.97, 0.98, 1.0], [0.8, 0.86, 0.92], 0.7);
  drawText('MAKLUMAT PELAYANAN (RP 0 / GRATIS)', ML + 10, y - 16, 8.2, 'F2', [0.043, 0.176, 0.322]);
  drawText('Seluruh layanan pengaduan, konsultasi, & pendampingan', ML + 10, y - 31, 7.6, 'F1');
  drawText('di UPTD SPF SDN Unggulan Mongisidi 1 adalah GRATIS (Rp 0),', ML + 10, y - 43, 7.6, 'F1');
  drawText('bebas pungli, & ramah kelompok rentan (Perwali No. 68/2021).', ML + 10, y - 55, 7.6, 'F1');

  const sigX = W - MR - 210;
  drawText(`Makassar, ${dateStr}`, sigX, y - 10, 8.6, 'F1');
  drawText(`Kepala ${school?.short_name || 'SDN Unggulan Mongisidi 1'}`, sigX, y - 22, 8.6, 'F1');
  drawText(principalName, sigX, y - 58, 9, 'F2', [0.043, 0.176, 0.322]);
  drawText('NIP. 198112072007012013', sigX, y - 70, 8.2, 'F1');

  return assemblePdfDocument([ops.join('\n')], {
    W,
    H,
    ML,
    MR,
    footerLabel: `SI-PAKAINGE MONSA - Poster Resmi IKM PermenPAN-RB 14/2017 (${schoolName})`,
  });
}

export function downloadIkmPosterPdf({ school, ikmSummary }) {
  const bytes = buildIkmPosterPdfBytes({ school, ikmSummary });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = localDateYmd();
  a.href = url;
  a.download = `Poster-IKM-Mutu-${ikmSummary?.grade || 'Sekolah'}-MONSA-${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildServiceMaklumatPdfBytes({ school, printedAt }) {
  const W = 595.28;
  const H = 841.89;
  const ML = 42;
  const MR = 42;
  const CW = W - ML - MR;
  const ops = [];
  let y = H - 42;

  function drawRect(x, topY, w, h, fillRgb = null, strokeRgb = null, lineW = 0.7) {
    const bottomY = topY - h;
    ops.push('q');
    if (fillRgb) ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    if (strokeRgb) {
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
      ops.push(`${lineW} w`);
    }
    ops.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRgb && strokeRgb) ops.push('B');
    else if (fillRgb) ops.push('f');
    else ops.push('S');
    ops.push('Q');
  }
  function drawLine(x1, y1, x2, y2, rgb = [0.75, 0.8, 0.86], lineW = 0.6) {
    ops.push(`q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineW} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }
  function drawText(text, x, ty, size = 9.5, font = 'F1', rgb = [0.08, 0.12, 0.18]) {
    ops.push(`BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${ty.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
  }
  function drawCentered(text, centerX, ty, size = 10, font = 'F2', rgb = [0.08, 0.12, 0.18]) {
    const clean = cleanPdfText(text);
    const estW = clean.length * size * 0.48;
    drawText(clean, Math.max(ML, centerX - estW / 2), ty, size, font, rgb);
  }

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const slaHours = Number(school?.sla_hours || 24);
  const dateStr = printedAt || localDateYmd();

  // Kop Surat
  drawRect(ML, y, CW, 58, [0.043, 0.176, 0.322]);
  drawCentered('PEMERINTAH KOTA MAKASSAR - DINAS PENDIDIKAN', W / 2, y - 16, 9, 'F2', [0.75, 0.92, 0.98]);
  drawCentered(schoolName.toUpperCase(), W / 2, y - 31, 12.5, 'F2', [1, 1, 1]);
  drawCentered(`NPSN ${school?.npsn || '40313912'} | ${school?.address || 'Jl. R.W. Monginsidi No. 13, Makassar'}`, W / 2, y - 44, 7.8, 'F1', [0.85, 0.94, 0.98]);
  drawCentered(`Email: ${school?.email || 'sdnungmongisidi1@gmail.com'} | Hotline: ${school?.hotline || '(0411) 8918116'}`, W / 2, y - 54, 7.2, 'F1', [0.75, 0.88, 0.95]);
  y -= 74;

  drawCentered('MAKLUMAT & STANDAR PELAYANAN PUBLIK DIGITAL', W / 2, y, 13, 'F2', [0.043, 0.176, 0.322]);
  y -= 15;
  drawCentered('SI-PAKAINGE MONSA · SK Inovasi SIMPEL 421.2/045 & SK Pengelola 421.2/047', W / 2, y, 8.8, 'F1', [0.055, 0.455, 0.565]);
  y -= 18;

  // Maklumat Box
  drawRect(ML, y, CW, 82, [0.93, 0.99, 0.96], [0.03, 0.46, 0.28], 1.2);
  drawCentered('MAKLUMAT PELAYANAN BEBAS PUNGLI (RP 0 / GRATIS)', W / 2, y - 18, 10.5, 'F2', [0.03, 0.38, 0.24]);
  drawText(cleanPdfText('"Dengan ini kami menyatakan sanggup menyelenggarakan pelayanan konsultasi, pengaduan,'), ML + 14, y - 35, 8.5, 'F1');
  drawText(cleanPdfText('dan pendampingan peserta didik sesuai Standar Pelayanan yang ditetapkan: GRATIS (Rp 0),'), ML + 14, y - 47, 8.5, 'F1');
  drawText(cleanPdfText(`respon cepat <= ${slaHours} jam kerja, melindungi pelapor anonim (UU PDP), serta memprioritaskan`), ML + 14, y - 59, 8.5, 'F1');
  drawText(cleanPdfText('penyandang disabilitas & kelompok rentan (Perwali Kota Makassar No. 68 Tahun 2021)."'), ML + 14, y - 71, 8.5, 'F1');
  y -= 96;

  // 6 Standard Components Table (PEKPPP Aspek Kebijakan Pelayanan)
  drawText('A. KOMPONEN STANDAR PELAYANAN (PEKPPP ASPEK KEBIJAKAN PELAYANAN)', ML, y, 9.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;

  const stdRows = [
    ['1. Biaya / Tarif Pelayanan', 'Rp 0 (100% GRATIS, bebas pungutan liar / Zona Integritas).'],
    ['2. Jangka Waktu Penyelesaian (SLA)', `Respon awal & tindak lanjut maksimal <= ${slaHours} jam kerja.`],
    ['3. Persyaratan Pengaduan', 'Tanpa syarat rumit. Uraian keluhan jelas; foto & identitas bersifat opsional (bisa Anonim).'],
    ['4. Mekanisme & Alur (4 Tahap)', '1) Diterima -> 2) Diverifikasi Piket/TPPK -> 3) Ditangani TPPK/Kepsek -> 4) Selesai & Nilai.'],
    ['5. Prioritas Kelompok Rentan', 'Akses jalan landai, parkir & toilet disabilitas, ruang tunggu prioritas, Guru Pendamping Inklusi.'],
    ['6. Kanal Pengaduan & Eskalasi', 'Aplikasi SI-PAKAINGE MONSA, WA 081355982195, Email Sekolah, & SP4N-LAPOR! (lapor.go.id).'],
  ];

  stdRows.forEach(([k, v], idx) => {
    const rowH = 26;
    drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995], [0.82, 0.86, 0.9]);
    drawLine(ML + 175, y, ML + 175, y - rowH, [0.84, 0.88, 0.92], 0.5);
    drawText(k, ML + 8, y - 16, 8, 'F2', [0.043, 0.176, 0.322]);
    const vLines = wrapText(v, 60);
    vLines.slice(0, 2).forEach((ln, li) => drawText(ln, ML + 183, y - 11 - li * 10, 7.8, 'F1'));
    y -= rowH;
  });

  y -= 18;
  drawText('B. TIM PENGELOLA LAYANAN & PENGADUAN RESMI (SK NO. 421.2/047)', ML, y, 9.5, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;
  const team = [
    ['Ketua Penanggung Jawab', 'Andi Windayani, S.Pd., M.Pd. (NIP. 198112072007012013)'],
    ['Koordinator Layanan & Pengaduan', 'Erpin Rahayu, S.Pd., M.Pd. (NIP. 197905142004112001)'],
    ['Wakil Koordinator', 'Herlina Iskandar, S.Pd. (NIP. 197301022006042025)'],
    ['Sekretaris', 'Nurul Auliana, S.Pd.'],
    ['Anggota / Tim Pelaksana', 'Sudiarni, S.Pd., M.Pd. (NIP. 197908182008012011)'],
  ];
  team.forEach(([role, person], idx) => {
    const rowH = 20;
    drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995], [0.84, 0.87, 0.9]);
    drawLine(ML + 175, y, ML + 175, y - rowH, [0.86, 0.89, 0.92], 0.5);
    drawText(role, ML + 8, y - 13, 7.8, 'F2');
    drawText(person, ML + 183, y - 13, 7.8, 'F1');
    y -= rowH;
  });

  y -= 24;
  const sigX = W - MR - 210;
  drawText(`Makassar, ${dateStr}`, sigX, y, 8.8, 'F1');
  drawText(`Kepala ${school?.short_name || 'SDN Unggulan Mongisidi 1'}`, sigX, y - 13, 8.8, 'F1');
  drawText(principalName, sigX, y - 54, 9.2, 'F2', [0.043, 0.176, 0.322]);
  drawText('NIP. 198112072007012013', sigX, y - 66, 8.4, 'F1');

  return assemblePdfDocument([ops.join('\n')], {
    W,
    H,
    ML,
    MR,
    footerLabel: `SI-PAKAINGE MONSA - Standar Pelayanan & Maklumat Rp 0 (${schoolName})`,
  });
}

export function downloadServiceMaklumatPdf({ school }) {
  const bytes = buildServiceMaklumatPdfBytes({ school });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = localDateYmd();
  a.href = url;
  a.download = `Standar-Pelayanan-Maklumat-Rp0-MONSA-${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadEvaluationPdf({ school, summary, items }) {
  const bytes = buildEvaluationPdfBytes({ school, summary, items });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = localDateYmd();
  a.href = url;
  a.download = `Laporan-Evaluasi-App-Respon-MONSA-${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildIkmRtlPdfBytes({ school, ikmSummary, rtlItems, weakestElements, printedAt }) {
  const W = 595.28;
  const H = 841.89;
  const ML = 42;
  const MR = 42;
  const CW = W - ML - MR;
  const pages = [];
  let ops = [];
  let y = H - 42;

  function nextPage() {
    pages.push(ops.join('\n'));
    ops = [];
    y = H - 48;
  }
  function ensureSpace(needH) {
    if (y - needH < 64) {
      nextPage();
    }
  }
  function drawRect(x, topY, w, h, fillRgb = null, strokeRgb = null, lineW = 0.7) {
    const bottomY = topY - h;
    ops.push('q');
    if (fillRgb) ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    if (strokeRgb) {
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
      ops.push(`${lineW} w`);
    }
    ops.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRgb && strokeRgb) ops.push('B');
    else if (fillRgb) ops.push('f');
    else ops.push('S');
    ops.push('Q');
  }
  function drawLine(x1, y1, x2, y2, rgb = [0.75, 0.8, 0.86], lineW = 0.6) {
    ops.push(`q ${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lineW} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S Q`);
  }
  function drawText(text, x, ty, size = 9, font = 'F1', rgb = [0.08, 0.12, 0.18]) {
    ops.push(`BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${ty.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
  }
  function drawCentered(text, centerX, ty, size = 10, font = 'F2', rgb = [0.08, 0.12, 0.18]) {
    const clean = cleanPdfText(text);
    const estW = clean.length * size * 0.48;
    drawText(clean, Math.max(ML, centerX - estW / 2), ty, size, font, rgb);
  }

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const dateStr = printedAt || localDateYmd();

  drawRect(ML, y, CW, 56, [0.043, 0.176, 0.322]);
  drawCentered('PEMERINTAH KOTA MAKASSAR - DINAS PENDIDIKAN', W / 2, y - 16, 9, 'F2', [0.75, 0.92, 0.98]);
  drawCentered(schoolName.toUpperCase(), W / 2, y - 31, 12.2, 'F2', [1, 1, 1]);
  drawCentered(`NPSN ${school?.npsn || '40313912'} | ${school?.address || 'Jl. R.W. Monginsidi No. 13, Makassar'}`, W / 2, y - 44, 7.6, 'F1', [0.85, 0.94, 0.98]);
  y -= 72;

  drawCentered('BERITA ACARA & RENCANA TINDAK LANJUT SKM (1 BULAN)', W / 2, y, 12.2, 'F2', [0.043, 0.176, 0.322]);
  y -= 14;
  drawCentered('Evaluasi Survei Kepuasan Masyarakat 9 Unsur & Forum Konsultasi Publik (PEKPPP)', W / 2, y, 8.6, 'F1', [0.055, 0.455, 0.565]);
  y -= 18;

  drawRect(ML, y, CW, 46, [0.95, 0.98, 1], [0.76, 0.84, 0.92]);
  drawText(`Skor IKM Saat Ini: ${formatIkmScore(ikmSummary?.ikm_score)} (Mutu: ${ikmSummary?.grade || '-'} - ${ikmSummary?.predicate || '-'})`, ML + 12, y - 16, 9, 'F2', [0.043, 0.176, 0.322]);
  const weakText = (weakestElements || []).length
    ? weakestElements.map((w) => `${w.label} (NRR ${Number(w.nrr || 0).toFixed(2)})`).join(' | ')
    : 'Belum ada unsur lemah terdeteksi (isi survei IKM terlebih dahulu)';
  drawText(cleanPdfText(`Fokus Perbaikan Terendah: ${weakText}`).slice(0, 92), ML + 12, y - 32, 8.2, 'F1');
  y -= 60;

  drawText('DAFTAR RENCANA TINDAK LANJUT (TARGET <= 30 HARI)', ML, y, 9.2, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;

  function drawTableHeader() {
    drawRect(ML, y, CW, 20, [0.043, 0.176, 0.322]);
    drawText('Unsur & Rencana Perbaikan', ML + 8, y - 13, 8, 'F2', [1, 1, 1]);
    drawText('PIC / Penanggung Jawab', ML + 295, y - 13, 8, 'F2', [1, 1, 1]);
    drawText('Target & Status', ML + 420, y - 13, 8, 'F2', [1, 1, 1]);
    y -= 20;
  }

  const list = rtlItems || [];
  if (list.length === 0) {
    drawRect(ML, y, CW, 30, [0.98, 0.99, 1], [0.84, 0.88, 0.92]);
    drawText('Belum ada item RTL SKM yang dicatat pada periode ini.', ML + 12, y - 19, 8.5, 'F1');
    y -= 40;
  } else {
    drawTableHeader();

    list.forEach((item, idx) => {
      const planLines = wrapText(item.action_plan || '', 55).slice(0, 3);
      const rowH = Math.max(38, 22 + planLines.length * 9.5);
      if (y - rowH < 72) {
        nextPage();
        drawTableHeader();
      }
      drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995], [0.82, 0.86, 0.9]);
      drawLine(ML + 290, y, ML + 290, y - rowH, [0.85, 0.88, 0.92], 0.5);
      drawLine(ML + 415, y, ML + 415, y - rowH, [0.85, 0.88, 0.92], 0.5);
      drawText(cleanPdfText(`${item.unsur_label} (NRR ${Number(item.current_avg || 0).toFixed(2)})`).slice(0, 52), ML + 8, y - 12, 7.6, 'F2', [0.043, 0.176, 0.322]);
      planLines.forEach((ln, li) => drawText(ln, ML + 8, y - 23 - li * 9.5, 7.4, 'F1'));
      drawText(cleanPdfText(item.pic_name || '-').slice(0, 22), ML + 295, y - 16, 7.6, 'F1');
      drawText(cleanPdfText(item.target_date || '-'), ML + 420, y - 14, 7.6, 'F2');
      drawText(cleanPdfText(item.status || 'Direncanakan'), ML + 420, y - 26, 7.4, 'F1', [0.055, 0.455, 0.565]);
      y -= rowH;
    });
  }

  ensureSpace(96);
  y -= 24;
  const sigX = W - MR - 210;
  drawText(`Makassar, ${dateStr}`, sigX, y, 8.8, 'F1');
  drawText(`Kepala ${school?.short_name || 'SDN Unggulan Mongisidi 1'}`, sigX, y - 13, 8.8, 'F1');
  drawText(principalName, sigX, y - 54, 9.2, 'F2', [0.043, 0.176, 0.322]);
  drawText('NIP. 198112072007012013', sigX, y - 66, 8.4, 'F1');

  pages.push(ops.join('\n'));
  return assemblePdfDocument(pages, {
    W,
    H,
    ML,
    MR,
    footerLabel: `SI-PAKAINGE MONSA - Berita Acara RTL SKM 1 Bulan (${schoolName})`,
  });
}

export function downloadIkmRtlPdf(params) {
  const bytes = buildIkmRtlPdfBytes(params);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = localDateYmd();
  a.href = url;
  a.download = `Berita-Acara-RTL-SKM-MONSA-${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function buildFkpMinutesPdfBytes({ school, transparencyItems, polls, recentFeedback, printedAt }) {
  const W = 595.28;
  const H = 841.89;
  const ML = 42;
  const MR = 42;
  const CW = W - ML - MR;
  const pages = [];
  let ops = [];
  let y = H - 42;

  function nextPage() {
    pages.push(ops.join('\n'));
    ops = [];
    y = H - 48;
  }
  function ensureSpace(needH) {
    if (y - needH < 64) {
      nextPage();
    }
  }
  function drawRect(x, topY, w, h, fillRgb = null, strokeRgb = null, lineW = 0.7) {
    const bottomY = topY - h;
    ops.push('q');
    if (fillRgb) ops.push(`${fillRgb[0]} ${fillRgb[1]} ${fillRgb[2]} rg`);
    if (strokeRgb) {
      ops.push(`${strokeRgb[0]} ${strokeRgb[1]} ${strokeRgb[2]} RG`);
      ops.push(`${lineW} w`);
    }
    ops.push(`${x.toFixed(2)} ${bottomY.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    if (fillRgb && strokeRgb) ops.push('B');
    else if (fillRgb) ops.push('f');
    else ops.push('S');
    ops.push('Q');
  }
  function drawText(text, x, ty, size = 9, font = 'F1', rgb = [0.08, 0.12, 0.18]) {
    ops.push(`BT /${font} ${size} Tf ${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${ty.toFixed(2)} Td (${pdfEscape(text)}) Tj ET`);
  }
  function drawCentered(text, centerX, ty, size = 10, font = 'F2', rgb = [0.08, 0.12, 0.18]) {
    const clean = cleanPdfText(text);
    const estW = clean.length * size * 0.48;
    drawText(clean, Math.max(ML, centerX - estW / 2), ty, size, font, rgb);
  }

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const dateStr = printedAt || localDateYmd();

  drawRect(ML, y, CW, 56, [0.043, 0.176, 0.322]);
  drawCentered('PEMERINTAH KOTA MAKASSAR - DINAS PENDIDIKAN', W / 2, y - 16, 9, 'F2', [0.75, 0.92, 0.98]);
  drawCentered(schoolName.toUpperCase(), W / 2, y - 31, 12.2, 'F2', [1, 1, 1]);
  drawCentered(`NPSN ${school?.npsn || '40313912'} | ${school?.address || 'Jl. R.W. Monginsidi No. 13, Makassar'}`, W / 2, y - 44, 7.6, 'F1', [0.85, 0.94, 0.98]);
  y -= 72;

  drawCentered('BERITA ACARA FORUM KONSULTASI PUBLIK (FKP) & PPID', W / 2, y, 12.2, 'F2', [0.043, 0.176, 0.322]);
  y -= 14;
  drawCentered('Rekapitulasi Aspirasi Warga Sekolah, Orang Tua, & Masyarakat Luas (PEKPPP)', W / 2, y, 8.6, 'F1', [0.055, 0.455, 0.565]);
  y -= 18;

  // 1. Papan Transparansi PPID
  ensureSpace(46);
  drawText('1. RINGKASAN PAPAN TRANSPARANSI INFORMASI PUBLIK (PPID SEKOLAH)', ML, y, 9, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;
  (transparencyItems || []).slice(0, 12).forEach((item, idx) => {
    const rowH = 30;
    ensureSpace(rowH + 4);
    drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [0.97, 0.99, 1] : [1, 1, 1], [0.82, 0.87, 0.92]);
    drawText(cleanPdfText(`[${item.category}] ${item.title} - ${item.metric_value || ''}`).slice(0, 88), ML + 8, y - 12, 8, 'F2', [0.043, 0.176, 0.322]);
    drawText(cleanPdfText(item.summary || '').slice(0, 100), ML + 8, y - 23, 7.3, 'F1');
    y -= rowH;
  });

  y -= 14;
  ensureSpace(46);
  drawText('2. HASIL PEMUNGUTAN SUARA FORUM KONSULTASI PUBLIK (FKP) DIGITAL', ML, y, 9, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;

  (polls || []).slice(0, 10).forEach((poll) => {
    ensureSpace(34);
    drawRect(ML, y, CW, 24, [0.94, 0.98, 0.99], [0.75, 0.85, 0.92]);
    drawText(cleanPdfText(`${poll.topic_title} (Total: ${poll.total_votes || 0} suara)`).slice(0, 92), ML + 8, y - 15, 8.2, 'F2', [0.043, 0.176, 0.322]);
    y -= 26;
    const totalV = Math.max(1, Number(poll.total_votes || 0));
    (poll.options || []).forEach((opt, idx) => {
      const cnt = Number((poll.counts || {})[opt] || 0);
      const pct = poll.total_votes ? Math.round((cnt / totalV) * 100) : 0;
      const rowH = 20;
      ensureSpace(rowH + 4);
      drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995], [0.84, 0.88, 0.92]);
      drawText(cleanPdfText(`${idx + 1}. ${opt}`).slice(0, 68), ML + 8, y - 13, 7.8, 'F1');
      drawText(`${cnt} suara (${pct}%)`, ML + CW - 92, y - 13, 7.8, 'F2', [0.055, 0.455, 0.565]);
      y -= rowH;
    });
    y -= 8;
  });

  y -= 6;
  ensureSpace(40);
  drawText('3. USULAN & MASUKAN MASYARAKAT TERCATAT', ML, y, 9, 'F2', [0.043, 0.176, 0.322]);
  y -= 12;
  const fbList = (recentFeedback || []).filter((f) => (f.suggestion || '').trim()).slice(0, 50);
  if (fbList.length === 0) {
    ensureSpace(30);
    drawRect(ML, y, CW, 24, [0.98, 0.99, 1], [0.84, 0.88, 0.92]);
    drawText('Masukan terbuka masyarakat akan tercantum di sini setelah peserta FKP mengisi saran.', ML + 8, y - 15, 7.8, 'F1');
    y -= 28;
  } else {
    fbList.forEach((fb, idx) => {
      const rowH = 26;
      ensureSpace(rowH + 4);
      drawRect(ML, y, CW, rowH, idx % 2 === 0 ? [1, 1, 1] : [0.97, 0.985, 0.995], [0.84, 0.88, 0.92]);
      drawText(cleanPdfText(`${fb.respondent_name} (${fb.respondent_role}) - Pilihan: ${fb.selected_option}`).slice(0, 92), ML + 8, y - 11, 7.4, 'F2', [0.043, 0.176, 0.322]);
      drawText(cleanPdfText(`Saran: ${fb.suggestion}`).slice(0, 98), ML + 8, y - 21, 7.3, 'F1');
      y -= rowH;
    });
  }

  ensureSpace(96);
  y -= 20;
  const sigX = W - MR - 210;
  drawText(`Makassar, ${dateStr}`, sigX, y, 8.8, 'F1');
  drawText(`Kepala ${school?.short_name || 'SDN Unggulan Mongisidi 1'}`, sigX, y - 13, 8.8, 'F1');
  drawText(principalName, sigX, y - 54, 9.2, 'F2', [0.043, 0.176, 0.322]);
  drawText('NIP. 198112072007012013', sigX, y - 66, 8.4, 'F1');

  pages.push(ops.join('\n'));
  return assemblePdfDocument(pages, {
    W,
    H,
    ML,
    MR,
    footerLabel: `SI-PAKAINGE MONSA - Berita Acara FKP & PPID Sekolah (${schoolName})`,
  });
}

export function downloadFkpMinutesPdf(params) {
  const bytes = buildFkpMinutesPdfBytes(params);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = localDateYmd();
  a.href = url;
  a.download = `Berita-Acara-FKP-PPID-MONSA-${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
