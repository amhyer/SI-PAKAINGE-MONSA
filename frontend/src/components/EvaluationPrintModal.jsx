import { Printer, FileDown, X, Star } from 'lucide-react';
import { downloadEvaluationPdf, getQualityPredicate } from '../utils/pdfReport';
import { localDateYmd } from '../utils/sla';
import logoMonsa from '../assets/logo-monsa.png';
import ModalShell from './ModalShell';

export default function EvaluationPrintModal({ open, onClose, school, summary, items, onToast }) {
  if (!open) return null;

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const dateStr = localDateYmd();
  const count = Number(summary?.eval_count || 0);
  const avgApp = Number(summary?.avg_app_rating || 0);
  const avgSchool = Number(summary?.avg_school_rating || 0);
  const speedEntries = Object.entries(summary?.speed_breakdown || {});
  const clarityEntries = Object.entries(summary?.clarity_breakdown || {});

  function handlePrint() {
    try {
      window.print();
      onToast && onToast('Membuka dialog cetak / Simpan sebagai PDF...');
    } catch {
      onToast && onToast('Dialog cetak dibatasi; gunakan tombol Unduh File .PDF di sebelahnya.', 'error');
    }
  }

  function handleDownloadPdf() {
    try {
      downloadEvaluationPdf({ school, summary, items });
      onToast && onToast('Laporan PDF resmi sekolah berhasil diunduh!');
    } catch (err) {
      onToast && onToast(err.message || 'Gagal membuat file PDF.', 'error');
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      titleId="evaluation-print-title"
      backdropClassName="bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4"
      panelClassName="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
    >
        {/* Top Action Bar (hidden when printing) */}
        <div className="bg-[#0B2D52] text-white px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 id="evaluation-print-title" className="text-sm font-bold">Pratinjau Cetak Laporan Sekolah (Format A4 PDF)</h3>
            <p className="text-[11px] text-cyan-200">Evaluasi Aplikasi SI-PAKAINGE & Respon Tindak Lanjut Sekolah</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-white text-[#0B2D52] text-xs font-extrabold flex items-center gap-1.5 hover:bg-cyan-50"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak / Print PDF
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" /> Unduh File .PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              aria-label="Tutup pratinjau cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable A4 Sheet */}
        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex-1">
          <div id="eval-print-sheet" className="bg-white rounded-2xl border border-slate-300 shadow-xs p-5 sm:p-8 space-y-5 text-slate-900">
            {/* Kop Surat Sekolah */}
            <div className="flex items-center gap-3 pb-3 border-b-2 border-[#0B2D52]">
              <img src={logoMonsa} alt="Logo Sekolah" className="w-14 h-14 object-contain shrink-0" />
              <div className="flex-1 text-center">
                <p className="text-[10px] font-bold tracking-wider uppercase text-cyan-800">
                  PEMERINTAH KOTA MAKASSAR · DINAS PENDIDIKAN
                </p>
                <h1 className="text-sm sm:text-base font-extrabold text-[#0B2D52] uppercase">
                  {schoolName}
                </h1>
                <p className="text-[10px] text-slate-600">
                  NPSN {school?.npsn || '40313912'} · {school?.address || 'Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142'}
                </p>
                <p className="text-[10px] text-slate-500">
                  Email: {school?.email || 'sdnungmongisidi1@gmail.com'} · Hotline: {school?.hotline || '(0411) 8918116 / WA 081355982195'}
                </p>
              </div>
            </div>

            {/* Report Heading */}
            <div className="text-center space-y-1">
              <h2 className="text-xs sm:text-sm font-extrabold text-[#0B2D52] uppercase">
                LAPORAN HASIL EVALUASI APLIKASI SI-PAKAINGE MONSA & RESPON TINDAK LANJUT SEKOLAH
              </h2>
              <p className="text-[11px] font-semibold text-cyan-800">
                Bukti Dukung Survei Kepuasan Masyarakat (PEKPPP Aspek 05B & Inovasi SIMPEL 06B)
              </p>
              <p className="text-[10px] text-slate-500">
                Tanggal Cetak: {dateStr} · Total Responden: <strong>{count} orang</strong>
              </p>
            </div>

            {/* Indeks Skor */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/60 p-3">
                <p className="text-[10px] font-bold uppercase text-cyan-900">Indeks Penilaian Aplikasi</p>
                <p className="text-xl font-extrabold text-[#0B2D52] mt-1 flex items-center gap-1">
                  {avgApp ? avgApp.toFixed(2) : '0.00'} / 5.00
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">Predikat: {getQualityPredicate(avgApp, count)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-[10px] font-bold uppercase text-emerald-900">Indeks Respon & Tindak Lanjut Sekolah</p>
                <p className="text-xl font-extrabold text-emerald-900 mt-1 flex items-center gap-1">
                  {avgSchool ? avgSchool.toFixed(2) : '0.00'} / 5.00
                  <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                </p>
                <p className="text-[10px] text-slate-600 mt-0.5">Predikat: {getQualityPredicate(avgSchool, count)}</p>
              </div>
            </div>

            {/* Rekapitulasi Kecepatan & Kejelasan */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[#0B2D52]">
                A. Rekapitulasi Kecepatan Respon & Kejelasan Tindak Lanjut
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left px-2.5 py-1.5 border-b border-slate-200">Kecepatan Respon</th>
                      <th className="text-right px-2.5 py-1.5 border-b border-slate-200">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speedEntries.length === 0 ? (
                      <tr><td colSpan={2} className="px-2.5 py-2 text-slate-400">Belum ada responden</td></tr>
                    ) : (
                      speedEntries.map(([k, v]) => (
                        <tr key={k} className="border-b border-slate-100">
                          <td className="px-2.5 py-1.5">{k}</td>
                          <td className="px-2.5 py-1.5 text-right font-bold">{v} ({count ? Math.round((v / count) * 100) : 0}%)</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="text-left px-2.5 py-1.5 border-b border-slate-200">Kejelasan Tindak Lanjut</th>
                      <th className="text-right px-2.5 py-1.5 border-b border-slate-200">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clarityEntries.length === 0 ? (
                      <tr><td colSpan={2} className="px-2.5 py-2 text-slate-400">Belum ada responden</td></tr>
                    ) : (
                      clarityEntries.map(([k, v]) => (
                        <tr key={k} className="border-b border-slate-100">
                          <td className="px-2.5 py-1.5">{k}</td>
                          <td className="px-2.5 py-1.5 text-right font-bold">{v} ({count ? Math.round((v / count) * 100) : 0}%)</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Daftar Responden */}
            <div className="space-y-2">
              <h3 className="text-xs font-extrabold text-[#0B2D52]">
                B. Daftar Penilaian & Masukan Responden (Identitas Anonim Dilindungi UU PDP)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full border border-slate-300 text-[10px]">
                  <thead className="bg-[#0B2D52] text-white">
                    <tr>
                      <th className="px-2 py-1.5 text-left">No</th>
                      <th className="px-2 py-1.5 text-left">Responden & Tanggal</th>
                      <th className="px-2 py-1.5 text-center">App</th>
                      <th className="px-2 py-1.5 text-center">Sekolah</th>
                      <th className="px-2 py-1.5 text-left">Respon & Tindak Lanjut</th>
                      <th className="px-2 py-1.5 text-left">Saran / Masukan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(!items || items.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-4 text-center text-slate-400">
                          Belum ada penilaian responden yang tercatat.
                        </td>
                      </tr>
                    ) : (
                      items.map((ev, idx) => (
                        <tr key={ev.id} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                          <td className="px-2 py-1.5">{idx + 1}</td>
                          <td className="px-2 py-1.5">
                            <p className="font-bold text-slate-900">{ev.respondent_name}</p>
                            <p className="text-[9px] text-slate-500">{(ev.created_at || '').slice(0, 10)}</p>
                          </td>
                          <td className="px-2 py-1.5 text-center font-extrabold text-[#0B2D52]">{ev.app_rating}/5</td>
                          <td className="px-2 py-1.5 text-center font-extrabold text-emerald-800">{ev.school_response_rating}/5</td>
                          <td className="px-2 py-1.5">
                            <p>{ev.response_speed}</p>
                            <p className="text-slate-500">{ev.followup_clarity}{ev.ticket_code ? ` · ${ev.ticket_code}` : ''}</p>
                          </td>
                          <td className="px-2 py-1.5">{ev.comment || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tanda Tangan Kepala Sekolah */}
            <div className="pt-4 flex justify-end">
              <div className="text-xs space-y-1 min-w-[230px]">
                <p>Makassar, {dateStr}</p>
                <p>Mengetahui, Kepala {school?.short_name || 'SDN Unggulan Mongisidi 1'}</p>
                <div className="h-12" />
                <p className="font-extrabold text-[#0B2D52] underline">{principalName}</p>
                <p className="text-[11px] text-slate-600">NIP. 198112072007012013</p>
              </div>
            </div>
          </div>
        </div>
    </ModalShell>
  );
}
