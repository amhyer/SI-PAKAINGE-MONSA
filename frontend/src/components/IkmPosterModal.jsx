import { Printer, FileDown, X, Award } from 'lucide-react';
import { downloadIkmPosterPdf } from '../utils/pdfReport';
import { getIkmGradeInfo } from '../utils/ikm';
import { localDateYmd } from '../utils/sla';
import logoMonsa from '../assets/logo-monsa.png';

export default function IkmPosterModal({ open, onClose, school, ikmSummary, onToast }) {
  if (!open) return null;

  const schoolName = school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1';
  const principalName = school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.';
  const dateStr = localDateYmd();
  const cnt = Number(ikmSummary?.respondent_count || 0);
  const score = Number(ikmSummary?.ikm_score || 0);
  const gradeInfo = getIkmGradeInfo(score, cnt);
  const elements = ikmSummary?.elements || [];

  function handlePrint() {
    try {
      window.print();
      onToast && onToast('Membuka dialog cetak Poster IKM...');
    } catch {
      onToast && onToast('Dialog cetak dibatasi; gunakan tombol Unduh Poster .PDF di sebelahnya.', 'error');
    }
  }

  function handleDownload() {
    try {
      downloadIkmPosterPdf({ school, ikmSummary });
      onToast && onToast('Poster PDF Mutu IKM berhasil diunduh!');
    } catch (err) {
      onToast && onToast(err.message || 'Gagal mengunduh Poster PDF IKM.', 'error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-3xl max-h-[92vh] rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#0B2D52] text-white px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h3 className="text-sm font-bold">Pratinjau Poster Publikasi IKM Sekolah (PermenPAN-RB 14/2017)</h3>
            <p className="text-[11px] text-cyan-200">Siap Cetak A4 untuk Papan Pelayanan Sekolah & Bukti PEKPPP</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-xl bg-white text-[#0B2D52] text-xs font-extrabold flex items-center gap-1.5 hover:bg-cyan-50"
            >
              <Printer className="w-3.5 h-3.5" /> Cetak Poster
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5"
            >
              <FileDown className="w-3.5 h-3.5" /> Unduh Poster .PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              aria-label="Tutup pratinjau poster IKM"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto bg-slate-100 flex-1">
          <div id="eval-print-sheet" className="bg-white rounded-2xl border border-slate-300 shadow-xs p-5 sm:p-8 space-y-5 text-slate-900">
            <div className="flex items-center gap-3 pb-3 border-b-2 border-[#0B2D52]">
              <img src={logoMonsa} alt="Logo Sekolah" className="w-14 h-14 object-contain shrink-0" />
              <div className="flex-1 text-center">
                <p className="text-[10px] font-bold tracking-wider uppercase text-cyan-800">
                  PEMERINTAH KOTA MAKASSAR · DINAS PENDIDIKAN
                </p>
                <h1 className="text-sm sm:text-base font-extrabold text-[#0B2D52] uppercase">{schoolName}</h1>
                <p className="text-[10px] text-slate-600">
                  NPSN {school?.npsn || '40313912'} · {school?.address || 'Jl. R.W. Monginsidi No. 13, Maricaya Baru, Makassar 90142'}
                </p>
              </div>
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-sm sm:text-base font-extrabold text-[#0B2D52] uppercase">
                INDEKS KEPUASAN MASYARAKAT (IKM) LAYANAN PENGADUAN & KONSULTASI
              </h2>
              <p className="text-[11px] font-semibold text-cyan-800">
                Sesuai PermenPAN-RB Nomor 14 Tahun 2017 (9 Unsur Pelayanan Publik)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border-2 border-[#0B2D52] bg-cyan-50/50 p-4 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-600">Nilai IKM (Skala 25–100)</p>
                <p className="text-3xl font-extrabold text-[#0B2D52] mt-1">{cnt ? score.toFixed(2) : '0.00'}</p>
                <p className="text-[11px] text-slate-600 mt-1">Total Responden: <strong>{cnt} orang</strong></p>
              </div>
              <div className={`rounded-2xl border-2 p-4 text-center flex flex-col justify-center ${gradeInfo.badgeClass}`}>
                <p className="text-[10px] font-bold uppercase">Mutu Pelayanan (Grade)</p>
                <p className="text-3xl font-extrabold mt-1 flex items-center justify-center gap-1.5">
                  <Award className="w-7 h-7" /> {gradeInfo.grade}
                </p>
                <p className="text-xs font-extrabold mt-0.5">{gradeInfo.predicate}</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-2 border border-slate-200 text-center text-[10px] text-slate-600">
              Standar Mutu: <strong>A</strong> (88,31–100 Sangat Baik) · <strong>B</strong> (76,61–88,30 Baik) · <strong>C</strong> (65,00–76,60 Kurang Baik) · <strong>D</strong> (25,00–64,99 Tidak Baik)
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border border-slate-300 text-[11px]">
                <thead className="bg-[#0B2D52] text-white">
                  <tr>
                    <th className="px-2.5 py-2 text-left">No</th>
                    <th className="px-2.5 py-2 text-left">9 Unsur Pelayanan (PermenPAN-RB 14/2017)</th>
                    <th className="px-2.5 py-2 text-center">NRR (1–4)</th>
                    <th className="px-2.5 py-2 text-center">Konversi</th>
                    <th className="px-2.5 py-2 text-left">Kategori</th>
                  </tr>
                </thead>
                <tbody>
                  {elements.map((el, i) => {
                    const g = getIkmGradeInfo(el.konversi, cnt);
                    return (
                      <tr key={el.key} className={i % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                        <td className="px-2.5 py-1.5">{i + 1}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-slate-800">{el.label}</td>
                        <td className="px-2.5 py-1.5 text-center font-bold text-[#0B2D52]">{cnt ? el.nrr.toFixed(2) : '-'}</td>
                        <td className="px-2.5 py-1.5 text-center font-bold text-emerald-800">{cnt ? el.konversi.toFixed(2) : '-'}</td>
                        <td className="px-2.5 py-1.5">{cnt ? `${g.predicate} (${g.grade})` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-2 flex items-start justify-between gap-4 flex-wrap">
              <div className="bg-cyan-50/70 border border-cyan-200 rounded-2xl p-3 text-[10px] text-slate-700 max-w-xs space-y-1">
                <p className="font-extrabold text-[#0B2D52]">MAKLUMAT PELAYANAN RP 0 (GRATIS)</p>
                <p>Seluruh layanan pengaduan, konsultasi, dan pendampingan di {school?.short_name || 'SDN Unggulan Mongisidi 1'} tidak dipungut biaya (Rp 0) dan ramah kelompok rentan.</p>
              </div>
              <div className="text-xs space-y-1 min-w-[210px]">
                <p>Makassar, {dateStr}</p>
                <p>Kepala {school?.short_name || 'SDN Unggulan Mongisidi 1'}</p>
                <div className="h-10" />
                <p className="font-extrabold text-[#0B2D52] underline">{principalName}</p>
                <p className="text-[11px] text-slate-600">NIP. 198112072007012013</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
