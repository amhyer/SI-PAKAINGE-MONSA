import { useState, useEffect } from 'react';
import { FileSpreadsheet, FileText, Copy, X, Check, Printer } from 'lucide-react';
import { apiFetch, buildApiUrl, getTenantCode, getToken } from '../api';
import { downloadEvaluationPdf } from '../utils/pdfReport';
import ModalShell from './ModalShell';

export default function MonevReportModal({ open, onClose, school, onToast }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr('');
    apiFetch('/api/reports/monev')
      .then((res) => setReport(res))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function triggerClientDownload(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadFormat(fmt) {
    // If live server is reachable, try direct authenticated download; otherwise synthesize from report
    const token = getToken();
    try {
      const res = await fetch(buildApiUrl(`/api/reports/monev?format=${fmt}`), {
        headers: { Authorization: `Bearer ${token}`, 'X-Monsa-Token': token, 'X-Tenant-Code': getTenantCode() },
      });
      if (res.ok && res.headers.get('Content-Disposition')) {
        const txt = await res.text();
        triggerClientDownload(
          txt,
          fmt === 'csv' ? '05B_REKAP_PENGADUAN_MONSA_2026.csv' : '05B_LAPORAN_MONEV_FKP_MONSA_2026.md',
          fmt === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'
        );
        onToast && onToast(`Berhasil mengunduh laporan ${fmt.toUpperCase()}!`);
        return;
      }
    } catch {
      // Fallback below
    }
    if (report?.markdown && fmt === 'md') {
      triggerClientDownload(report.markdown, '05B_LAPORAN_MONEV_FKP_MONSA_2026.md', 'text/markdown;charset=utf-8');
      onToast && onToast('Berhasil mengunduh laporan MD!');
    } else if (report?.recap && fmt === 'csv') {
      const rows = [
        ['Indikator', 'Nilai'],
        ['Nama Sekolah', school?.name || 'UPTD SPF SDN Unggulan Mongisidi 1'],
        ['Kepala Sekolah', school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.'],
        ['Total Masuk', report.recap.total],
        ['Selesai', report.recap.done],
        ['Diproses', report.recap.processing],
        ['Ketuntasan (%)', report.recap.completion_pct],
        [`Kepatuhan SLA <= ${report.recap.sla_hours || 24} Jam (%)`, report.recap.sla_on_time_pct ?? 100],
        ['Rata-Rata Durasi Tuntas (Jam)', report.recap.avg_resolution_hours ?? 0],
        ['Aduan Terbuka Lewat SLA', report.recap.sla_overdue_count ?? 0],
        ['Prioritas Kelompok Rentan', report.recap.rentan_count],
        ['Rata-Rata Rating Kepuasan Tiket', report.recap.avg_rating],
        ['Rata-Rata Penilaian Aplikasi SI-PAKAINGE', report.recap.avg_app_rating || 0],
        ['Rata-Rata Penilaian Respon & Tindak Lanjut Sekolah', report.recap.avg_school_rating || 0],
        ['Jumlah Responden Evaluasi App & Sekolah', report.recap.eval_count || 0],
        ['Skor IKM 9 Unsur (PermenPAN-RB 14/2017)', `${report.recap.ikm_score || 0} (Mutu ${report.recap.ikm_grade || '-'})`],
        ['Jumlah Responden IKM 9 Unsur', report.recap.ikm_count || 0],
      ];
      const safeCsvCell = (val) => {
        let s = String(val ?? '');
        if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) {
          s = `'${s}`;
        }
        return `"${s.replace(/"/g, '""')}"`;
      };
      if (Array.isArray(report.complaints) && report.complaints.length > 0) {
        rows.push(['', '']);
        rows.push([
          'Kode Tiket',
          'Tanggal Masuk',
          'Pelapor (UU PDP)',
          'Kategori',
          'Prioritas',
          'Kelompok Rentan',
          'Tujuan Unit',
          'Status',
          'Status SLA',
          'Rating Orang Tua',
          'Uraian Pengaduan',
          'Tindak Lanjut Sekolah',
        ]);
        report.complaints.forEach((c) => {
          rows.push([
            c.ticket_code,
            c.created_at,
            c.is_anonymous ? 'Pelapor Anonim (Dilindungi UU PDP)' : (c.reporter_display_name || '-'),
            c.category,
            c.urgency,
            c.needs_priority_assistance ? c.vulnerable_group || 'Prioritas' : 'Umum',
            c.routed_to,
            c.status,
            c.sla_info?.badge_text || c.sla_badge || c.sla_state || '-',
            c.parent_rating || '-',
            c.description || '-',
            c.staff_note || '',
          ]);
        });
      }
      const csvText = rows.map((r) => r.map(safeCsvCell).join(',')).join('\n');
      triggerClientDownload(csvText, '05B_REKAP_PENGADUAN_MONSA_2026.csv', 'text/csv;charset=utf-8');
      onToast && onToast('Berhasil mengunduh rekap Excel (.csv)!');
    }
  }

  async function copyMarkdown() {
    if (!report?.markdown) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(report.markdown);
      } else {
        const ta = document.createElement('textarea');
        ta.value = report.markdown;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      onToast && onToast('Teks laporan Monev disalin ke clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErr('Clipboard dibatasi browser; gunakan tombol Unduh Laporan Monev (.md) di atas.');
      onToast && onToast('Clipboard dibatasi; gunakan tombol Unduh Laporan (.md).', 'error');
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      titleId="monev-report-title"
      closeOnBackdrop={false}
      backdropClassName="bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3"
      panelClassName="bg-white w-full max-w-2xl max-h-[88vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
    >
        <div className="bg-[#0B2D52] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h3 id="monev-report-title" className="font-bold text-sm">Ekspor Laporan Monev & FKP_UPP (PEKPPP 05B & 06B)</h3>
            <p className="text-[11px] text-cyan-200 mt-0.5">{school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1'}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center" aria-label="Tutup laporan monev">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {loading && <p className="text-xs text-slate-500">Menyusun laporan otomatis dari data aduan...</p>}
          {err && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{err}</p>}

          {report && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200">
                  <p className="text-lg font-extrabold text-[#0B2D52]">{report.recap.total}</p>
                  <p className="text-[10px] text-slate-500">Total Aduan</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-2.5 border border-emerald-200">
                  <p className="text-lg font-extrabold text-emerald-700">{report.recap.completion_pct}%</p>
                  <p className="text-[10px] text-emerald-700">Ketuntasan</p>
                </div>
                <div className="bg-cyan-50 rounded-2xl p-2.5 border border-cyan-200">
                  <p className="text-lg font-extrabold text-cyan-800">{report.recap.rentan_count}</p>
                  <p className="text-[10px] text-cyan-800">Prioritas Rentan</p>
                </div>
                <div className="bg-amber-50 rounded-2xl p-2.5 border border-amber-200">
                  <p className="text-lg font-extrabold text-amber-700">{report.recap.avg_rating || '-'} / 5</p>
                  <p className="text-[10px] text-amber-800">Kepuasan Masyarakat</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => downloadFormat('md')}
                  className="px-3.5 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5" /> Unduh Laporan Monev (.md)
                </button>
                <button
                  onClick={() => downloadFormat('csv')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Unduh Rekap Excel (.csv)
                </button>
                <button
                  onClick={async () => {
                    try {
                      const ev = await apiFetch('/api/evaluations');
                      downloadEvaluationPdf({ school, summary: ev.summary, items: ev.items || [] });
                      onToast && onToast('Laporan PDF Penilaian App & Respon Sekolah berhasil diunduh!');
                    } catch (e) {
                      onToast && onToast(e.message || 'Gagal mengunduh PDF penilaian.', 'error');
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Unduh PDF Penilaian App & Respon
                </button>
                <button
                  onClick={copyMarkdown}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Tersalin!' : 'Salin Teks Laporan'}
                </button>
              </div>

              <div className="bg-slate-950 text-slate-100 rounded-2xl p-3.5 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto max-h-72">
                {report.markdown}
              </div>
            </>
          )}
        </div>
    </ModalShell>
  );
}
