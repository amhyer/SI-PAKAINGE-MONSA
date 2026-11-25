import { useEffect, useState } from 'react';
import {
  BarChart3,
  Star,
  Smartphone,
  School,
  Printer,
  FileDown,
  CheckCircle2,
  ClipboardList,
  RefreshCw,
  Accessibility,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Timer,
  Award,
  Calculator,
  Printer as PrinterIcon,
  CalendarCheck,
} from 'lucide-react';
import { apiFetch } from '../api';
import { computeSlaSummary, localDateYmd } from '../utils/sla';
import { IKM_ELEMENTS, formatIkmScore, getIkmGradeInfo, simulateIkmFromNrr } from '../utils/ikm';
import MonevReportModal from './MonevReportModal';
import EvaluationPrintModal from './EvaluationPrintModal';
import IkmPosterModal from './IkmPosterModal';
import { downloadEvaluationPdf, downloadIkmPosterPdf, downloadIkmRtlPdf, getQualityPredicate } from '../utils/pdfReport';

export default function StaffResultsTab({
  user,
  school,
  stats,
  publicRecap,
  complaints,
  onToast,
  onGoTrack,
  onRefresh,
}) {
  const [evalItems, setEvalItems] = useState([]);
  const [evalSummary, setEvalSummary] = useState({
    eval_count: 0,
    avg_app_rating: 0,
    avg_school_rating: 0,
    speed_breakdown: {},
    clarity_breakdown: {},
  });
  const [loadingEval, setLoadingEval] = useState(false);
  const [monevOpen, setMonevOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [ikmPosterOpen, setIkmPosterOpen] = useState(false);
  const [ikmSummary, setIkmSummary] = useState(null);
  const [rtlItems, setRtlItems] = useState([]);
  const [weakestElements, setWeakestElements] = useState([]);
  const [rtlForm, setRtlForm] = useState({
    unsur_code: 'U3',
    unsur_label: 'U3 - Waktu Penyelesaian',
    current_avg: 0,
    action_plan: '',
    pic_name: user?.full_name || 'Tim Pengelola Layanan & Piket',
    target_date: localDateYmd(30),
  });
  const [savingRtl, setSavingRtl] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simNrr, setSimNrr] = useState({
    u1: 3.6, u2: 3.5, u3: 3.4, u4: 3.9, u5: 3.6, u6: 3.7, u7: 3.8, u8: 3.5, u9: 3.5,
  });

  async function loadEvaluations() {
    setLoadingEval(true);
    try {
      const [res, ikmRes, rtlRes] = await Promise.all([
        apiFetch('/api/evaluations'),
        apiFetch('/api/ikm'),
        apiFetch('/api/ikm/rtl').catch(() => ({ items: [], weakest_elements: [] })),
      ]);
      setEvalItems(res.items || []);
      setEvalSummary(
        res.summary || {
          eval_count: 0,
          avg_app_rating: 0,
          avg_school_rating: 0,
          speed_breakdown: {},
          clarity_breakdown: {},
        }
      );
      setIkmSummary(ikmRes.summary || null);
      setRtlItems(rtlRes.items || []);
      const weak = rtlRes.weakest_elements || [];
      setWeakestElements(weak);
      if (weak[0]) {
        setRtlForm((prev) => ({
          ...prev,
          unsur_code: weak[0].key.toUpperCase(),
          unsur_label: weak[0].label,
          current_avg: weak[0].nrr,
          target_date: rtlRes.suggested_target_date || prev.target_date,
        }));
      }
    } catch {
      // keep existing state
    } finally {
      setLoadingEval(false);
    }
  }

  async function handleSaveRtl(e) {
    e.preventDefault();
    if (!rtlForm.action_plan.trim()) return;
    setSavingRtl(true);
    try {
      await apiFetch('/api/ikm/rtl', {
        method: 'POST',
        body: JSON.stringify(rtlForm),
      });
      setRtlForm((prev) => ({ ...prev, action_plan: '' }));
      await loadEvaluations();
      onToast && onToast('Rencana Tindak Lanjut (RTL) 1 Bulan SKM berhasil disimpan!');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSavingRtl(false);
    }
  }

  async function handleCycleRtlStatus(item) {
    const nextMap = { Direncanakan: 'Dikerjakan', Dikerjakan: 'Selesai', Selesai: 'Direncanakan' };
    const nextStatus = nextMap[item.status] || 'Dikerjakan';
    try {
      await apiFetch(`/api/ikm/rtl/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, evidence_note: item.evidence_note || '' }),
      });
      await loadEvaluations();
      onToast && onToast(`Status RTL ${item.unsur_code} diubah menjadi "${nextStatus}".`);
    } catch (err) {
      onToast && onToast(err.message, 'error');
    }
  }

  useEffect(() => {
    loadEvaluations();
  }, [user?.id, school?.id, complaints.length]);

  const speedEntries = Object.entries(evalSummary.speed_breakdown || {});
  const clarityEntries = Object.entries(evalSummary.clarity_breakdown || {});
  const slaHours = Number(school?.sla_hours || publicRecap?.sla_hours || 24);
  const liveSla = complaints.length
    ? computeSlaSummary(complaints, slaHours)
    : {
        sla_hours: slaHours,
        sla_overdue_count: publicRecap?.sla_overdue_count ?? 0,
        sla_warning_count: publicRecap?.sla_warning_count ?? 0,
        sla_unresponded_count: publicRecap?.sla_unresponded_count ?? 0,
        sla_on_time_pct: publicRecap?.sla_on_time_pct ?? 100,
        avg_resolution_hours: publicRecap?.avg_resolution_hours ?? 0,
      };

  return (
    <div className="space-y-4">
      {/* Banner Header */}
      <div className="bg-gradient-to-r from-[#0B2D52] to-[#0E7490] rounded-3xl p-4 text-white space-y-2.5 shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/15 text-cyan-100">
              Panel Khusus {user?.role === 'admin_sekolah' ? 'Kepala Sekolah / Admin' : 'Tim TPPK & Piket'}
            </span>
            <h2 className="font-extrabold text-sm mt-1.5">
              Hasil Laporan & Penilaian dari Pengguna Aplikasi
            </h2>
            <p className="text-[11px] text-cyan-100 mt-0.5">
              Pantau hasil rekap aduan masuk, skor kepuasan aplikasi, evaluasi respon tindak lanjut sekolah, serta cetak laporan resmi PDF.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadEvaluations();
              onRefresh && onRefresh();
              onToast && onToast('Data hasil laporan & penilaian diperbarui.');
            }}
            className="p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white shrink-0"
            title="Muat ulang data hasil & penilaian"
            aria-label="Muat ulang data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingEval ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white text-[#0B2D52] text-xs font-extrabold flex items-center gap-1.5 hover:bg-cyan-50"
          >
            <Printer className="w-3.5 h-3.5" /> Pratinjau & Cetak PDF Penilaian
          </button>
          <button
            type="button"
            onClick={() => {
              downloadEvaluationPdf({ school, summary: evalSummary, items: evalItems });
              onToast && onToast('File PDF Hasil Penilaian Pengguna berhasil diunduh!');
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-extrabold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Unduh .PDF
          </button>
          <button
            type="button"
            onClick={() => setMonevOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-white/15 border border-white/25 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-white/25"
          >
            <FileDown className="w-3.5 h-3.5" /> Ekspor Monev PEKPPP
          </button>
        </div>
      </div>

      {/* Section 1: Hasil Laporan Pengaduan Sekolah */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-cyan-700" /> 1. Hasil Rekap Laporan Pengaduan Sekolah
          </h3>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            {publicRecap?.completion_pct ?? 100}% Tuntas
          </span>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <button
            type="button"
            onClick={() => onGoTrack('Semua')}
            className="bg-slate-50 hover:bg-slate-100 rounded-2xl p-2.5 border border-slate-200 transition"
          >
            <p className="text-lg font-extrabold text-[#0B2D52]">{stats?.total ?? 0}</p>
            <p className="text-[10px] text-slate-500 font-medium">Masuk</p>
          </button>
          <button
            type="button"
            onClick={() => onGoTrack('Sedang Diproses')}
            className="bg-amber-50 hover:bg-amber-100/70 rounded-2xl p-2.5 border border-amber-200 transition"
          >
            <p className="text-lg font-extrabold text-amber-700">{stats?.processing ?? 0}</p>
            <p className="text-[10px] text-amber-700 font-medium">Diproses</p>
          </button>
          <button
            type="button"
            onClick={() => onGoTrack('Selesai')}
            className="bg-emerald-50 hover:bg-emerald-100/70 rounded-2xl p-2.5 border border-emerald-200 transition"
          >
            <p className="text-lg font-extrabold text-emerald-700">{stats?.done ?? 0}</p>
            <p className="text-[10px] text-emerald-700 font-medium">Selesai</p>
          </button>
          <button
            type="button"
            onClick={() => onGoTrack('Prioritas Rentan')}
            className="bg-cyan-50 hover:bg-cyan-100/70 rounded-2xl p-2.5 border border-cyan-200 transition"
          >
            <p className="text-lg font-extrabold text-cyan-800">{publicRecap?.rentan_count ?? 0}</p>
            <p className="text-[10px] text-cyan-800 font-medium flex items-center justify-center gap-0.5">
              <Accessibility className="w-2.5 h-2.5" /> Rentan
            </p>
          </button>
        </div>

        {publicRecap?.by_category && publicRecap.by_category.length > 0 && (
          <div className="space-y-1.5">
            {publicRecap.by_category.map((cat) => (
              <div
                key={cat.category}
                className="flex items-center justify-between text-[11px] bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-100"
              >
                <span className="font-semibold text-slate-700 truncate pr-2">{cat.category}</span>
                <span className="font-bold text-[#0B2D52] shrink-0">
                  {cat.total} masuk ({cat.done} selesai · {cat.processing} proses)
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px] text-slate-600">
          <span className="flex items-center gap-1 font-semibold">
            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
            Kepuasan Penyelesaian Tiket: <strong>{publicRecap?.avg_rating ? `${publicRecap.avg_rating}/5.0` : 'Belum ada rating'}</strong> ({publicRecap?.rated_count || 0} tiket)
          </span>
          <button
            type="button"
            onClick={() => onGoTrack('Semua')}
            className="text-xs font-extrabold text-[#0B2D52] hover:underline flex items-center gap-1"
          >
            <ClipboardList className="w-3.5 h-3.5" /> Kelola Tiket →
          </button>
        </div>

        {/* SLA <=24h Monitoring Bar */}
        <div
          className={`rounded-2xl p-3 border space-y-2 ${
            liveSla.sla_overdue_count > 0
              ? 'bg-rose-50 border-rose-200'
              : liveSla.sla_warning_count > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50/70 border-emerald-200'
          }`}
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-[11px] font-extrabold text-slate-900 flex items-center gap-1.5">
              {liveSla.sla_overdue_count > 0 ? (
                <AlertTriangle className="w-4 h-4 text-rose-600" />
              ) : (
                <Timer className="w-4 h-4 text-emerald-700" />
              )}
              Pemantauan SLA ≤ {slaHours} Jam (PEKPPP Kecepatan Respon)
            </span>
            {liveSla.sla_overdue_count > 0 && (
              <button
                type="button"
                onClick={() => onGoTrack('Melewati SLA')}
                className="px-2.5 py-1 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-extrabold"
              >
                Tangani {liveSla.sla_overdue_count} Lewat SLA →
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
            <div className="bg-white/80 rounded-xl p-2 border border-slate-200">
              <p className="font-extrabold text-emerald-700">{liveSla.sla_on_time_pct}%</p>
              <p className="text-[10px] text-slate-500">Tepat Waktu SLA</p>
            </div>
            <div className="bg-white/80 rounded-xl p-2 border border-slate-200">
              <p className={`font-extrabold ${liveSla.sla_overdue_count > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                {liveSla.sla_overdue_count} / {liveSla.sla_warning_count}
              </p>
              <p className="text-[10px] text-slate-500">Lewat SLA / Kritis</p>
            </div>
            <div className="bg-white/80 rounded-xl p-2 border border-slate-200">
              <p className="font-extrabold text-[#0B2D52]">{liveSla.avg_resolution_hours} jam</p>
              <p className="text-[10px] text-slate-500">Rata-Rata Tuntas</p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Skor Penilaian dari Pengguna App */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 border border-cyan-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-800">
            <Smartphone className="w-4 h-4" /> Nilai Aplikasi dari Pengguna
          </div>
          <p className="text-xl font-extrabold text-[#0B2D52] mt-1 flex items-center gap-1">
            {evalSummary.avg_app_rating ? `${evalSummary.avg_app_rating}/5` : '- / 5'}
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {getQualityPredicate(evalSummary.avg_app_rating, evalSummary.eval_count)}
          </p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800">
            <School className="w-4 h-4" /> Nilai Respon & Tindak Lanjut
          </div>
          <p className="text-xl font-extrabold text-emerald-800 mt-1 flex items-center gap-1">
            {evalSummary.avg_school_rating ? `${evalSummary.avg_school_rating}/5` : '- / 5'}
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {getQualityPredicate(evalSummary.avg_school_rating, evalSummary.eval_count)}
          </p>
        </div>
      </div>

      {/* Distribusi Kecepatan & Kejelasan */}
      {(speedEntries.length > 0 || clarityEntries.length > 0) && (
        <div className="bg-white rounded-3xl p-4 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="space-y-1.5">
            <p className="font-extrabold text-[#0B2D52] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-cyan-700" /> Kecepatan Respon Sekolah
            </p>
            {speedEntries.map(([label, cnt]) => (
              <div key={label} className="flex justify-between bg-slate-50 rounded-xl px-2.5 py-1.5 text-[11px]">
                <span className="text-slate-700">{label}</span>
                <span className="font-bold text-[#0B2D52]">{cnt} ({Math.round((cnt / Math.max(1, evalSummary.eval_count)) * 100)}%)</span>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="font-extrabold text-[#0B2D52] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> Kejelasan Tindak Lanjut
            </p>
            {clarityEntries.map(([label, cnt]) => (
              <div key={label} className="flex justify-between bg-slate-50 rounded-xl px-2.5 py-1.5 text-[11px]">
                <span className="text-slate-700">{label}</span>
                <span className="font-bold text-emerald-800">{cnt} ({Math.round((cnt / Math.max(1, evalSummary.eval_count)) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daftar Masukan & Penilaian dari Pengguna App */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            2. Penilaian & Masukan dari Pengguna Aplikasi ({evalItems.length})
          </h4>
          <span className="text-[10px] text-slate-400">Anonim terlindungi UU PDP</span>
        </div>

        {evalItems.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-500 text-center">
            Belum ada penilaian masuk dari pengguna aplikasi (orang tua/siswa). Setelah pengguna mengirim penilaian di tab <strong>Pantau → Nilai App & Respon Sekolah</strong>, seluruh hasilnya akan tampil di sini dan siap dicetak PDF.
          </div>
        ) : (
          <div className="space-y-2">
            {evalItems.map((ev) => (
              <div key={ev.id} className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-bold text-slate-900">{ev.respondent_name}</span>
                  <span className="text-[10px] text-slate-400">{(ev.created_at || '').slice(0, 16)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-900 font-bold">
                    App: {ev.app_rating}/5 ★
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                    Respon Sekolah: {ev.school_response_rating}/5 ★
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                    {ev.response_speed}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                    {ev.followup_clarity}
                  </span>
                  {ev.ticket_code && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-bold">
                      {ev.ticket_code}
                    </span>
                  )}
                </div>
                {ev.comment && <p className="text-slate-700 leading-relaxed pt-0.5">"{ev.comment}"</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Kalkulator IKM 9 Unsur & Poster Mutu A/B/C/D (PermenPAN-RB No. 14/2017) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-700" />
              3. Indeks Kepuasan Masyarakat (IKM 9 Unsur · PermenPAN-RB 14/2017)
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Konversi otomatis NRR U1–U9 ke skala 25–100 & Mutu Grade A/B/C/D untuk publikasi papan PTSP sekolah.
            </p>
          </div>
          {(() => {
            const g = getIkmGradeInfo(ikmSummary?.ikm_score || 0, ikmSummary?.respondent_count || 0);
            return (
              <span className={`px-2.5 py-1 rounded-full border text-[11px] font-extrabold ${g.badgeClass}`}>
                {ikmSummary?.respondent_count ? `IKM ${formatIkmScore(ikmSummary.ikm_score)} · Mutu ${g.grade} (${g.predicate})` : 'Mutu - (Belum Ada Responden)'}
              </span>
            );
          })()}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIkmPosterOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-[#0B2D52] hover:bg-[#092341] text-white text-[11px] font-extrabold flex items-center gap-1.5"
          >
            <PrinterIcon className="w-3.5 h-3.5" /> Pratinjau Poster IKM (A/B/C/D)
          </button>
          <button
            type="button"
            onClick={() => {
              downloadIkmPosterPdf({ school, ikmSummary });
              onToast && onToast('Poster PDF Mutu IKM berhasil diunduh!');
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Unduh Poster IKM .PDF
          </button>
          <button
            type="button"
            onClick={() => setSimOpen(!simOpen)}
            className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-[#0B2D52] text-[11px] font-bold flex items-center gap-1.5"
          >
            <Calculator className="w-3.5 h-3.5" /> {simOpen ? 'Tutup Simulator Target' : 'Kalkulator Simulasi Target IKM'}
          </button>
        </div>

        {ikmSummary?.respondent_count > 0 && (
          <div className="space-y-1.5">
            {(ikmSummary.elements || []).map((el) => (
              <div key={el.key} className="bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-100 space-y-1">
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-slate-700 truncate pr-2">{el.label}</span>
                  <span className="font-extrabold text-[#0B2D52] shrink-0">
                    NRR {el.nrr.toFixed(2)} · {el.konversi.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, el.konversi))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {simOpen && (() => {
          const simResult = simulateIkmFromNrr(simNrr);
          const simGrade = getIkmGradeInfo(simResult.ikm_score, 1);
          return (
            <div className="bg-cyan-50/70 rounded-2xl p-3.5 border border-cyan-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-extrabold text-[#0B2D52]">
                  Simulasi Target Skor IKM (9 Unsur)
                </p>
                <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold ${simGrade.badgeClass}`}>
                  Simulasi: {formatIkmScore(simResult.ikm_score)} · Mutu {simGrade.grade} ({simGrade.predicate})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {IKM_ELEMENTS.map((el) => (
                  <div key={el.key} className="bg-white rounded-xl p-2 border border-cyan-100 text-[11px]">
                    <div className="flex justify-between font-bold text-slate-700 mb-1">
                      <span>{el.code}. {el.label}</span>
                      <span className="text-[#0B2D52]">{Number(simNrr[el.key]).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="0.1"
                      value={simNrr[el.key]}
                      onChange={(e) => setSimNrr((prev) => ({ ...prev, [el.key]: Number(e.target.value) }))}
                      className="w-full accent-[#0B2D52]"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  downloadIkmPosterPdf({ school, ikmSummary: simResult });
                  onToast && onToast('Poster PDF hasil simulasi IKM berhasil diunduh!');
                }}
                className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white text-[11px] font-bold inline-flex items-center gap-1.5"
              >
                <FileDown className="w-3.5 h-3.5" /> Unduh Poster Simulasi .PDF
              </button>
            </div>
          );
        })()}
      </div>

      {/* Section 4: Auto-RTL SKM 1 Bulan & Forum Konsultasi Publik (PEKPPP) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h4 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
              <CalendarCheck className="w-4 h-4 text-cyan-700" />
              4. Auto-RTL SKM 1 Bulan & Forum Konsultasi Publik
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Otomatis mendeteksi 2 unsur IKM terendah agar sekolah dapat menuntaskan perbaikan dalam ≤ 30 hari (indikator penuh PEKPPP).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              downloadIkmRtlPdf({ school, ikmSummary, rtlItems, weakestElements });
              onToast && onToast('Berita Acara & RTL SKM 1 Bulan (.PDF) berhasil diunduh!');
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Berita Acara RTL (.PDF)
          </button>
        </div>

        {weakestElements.length > 0 && (
          <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 space-y-2">
            <p className="text-[11px] font-extrabold text-amber-950">2 Unsur Terendah Terdeteksi Otomatis:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {weakestElements.map((w) => (
                <div key={w.key} className="bg-white rounded-xl p-2.5 border border-amber-200 flex items-center justify-between gap-2 text-[11px]">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800 truncate">{w.label}</p>
                    <p className="text-[10px] text-amber-800">NRR {Number(w.nrr).toFixed(2)} · Konversi {Number(w.konversi).toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setRtlForm((prev) => ({
                        ...prev,
                        unsur_code: w.key.toUpperCase(),
                        unsur_label: w.label,
                        current_avg: w.nrr,
                        action_plan: `Perbaikan & peninjauan ulang SOP untuk ${w.label} bersama tim piket dan perwakilan orang tua.`,
                      }))
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#0B2D52] text-white text-[10px] font-bold shrink-0"
                  >
                    Buat RTL
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSaveRtl} className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select
              value={rtlForm.unsur_label}
              onChange={(e) => {
                const chosen = IKM_ELEMENTS.find((x) => `${x.code} - ${x.label}` === e.target.value);
                setRtlForm((prev) => ({
                  ...prev,
                  unsur_code: chosen?.code || 'U1',
                  unsur_label: e.target.value,
                }));
              }}
              className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs"
            >
              {IKM_ELEMENTS.map((el) => (
                <option key={el.code} value={`${el.code} - ${el.label}`}>
                  {el.code} - {el.label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={rtlForm.pic_name}
              onChange={(e) => setRtlForm((prev) => ({ ...prev, pic_name: e.target.value }))}
              placeholder="Penanggung Jawab (PIC)"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            />
            <input
              type="date"
              value={rtlForm.target_date}
              onChange={(e) => setRtlForm((prev) => ({ ...prev, target_date: e.target.value }))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={rtlForm.action_plan}
              onChange={(e) => setRtlForm((prev) => ({ ...prev, action_plan: e.target.value }))}
              placeholder="Tulis langkah perbaikan konkret (target tuntas <= 1 bulan)..."
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={savingRtl}
              className="px-3.5 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold shrink-0"
            >
              {savingRtl ? 'Menyimpan...' : 'Tambah RTL'}
            </button>
          </div>
        </form>

        {rtlItems.length > 0 && (
          <div className="space-y-2">
            {rtlItems.map((rt) => (
              <div key={rt.id} className="bg-slate-50 rounded-2xl p-3 border border-slate-200 flex items-start justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-[#0B2D52]">{rt.unsur_label}</p>
                  <p className="text-slate-700 mt-0.5">{rt.action_plan}</p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    PIC: {rt.pic_name} · Target: {rt.target_date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCycleRtlStatus(rt)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold shrink-0 border ${
                    rt.status === 'Selesai'
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : rt.status === 'Dikerjakan'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-white text-slate-700 border-slate-300'
                  }`}
                >
                  {rt.status} ↻
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <MonevReportModal open={monevOpen} onClose={() => setMonevOpen(false)} school={school} onToast={onToast} />
      <EvaluationPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        school={school}
        summary={evalSummary}
        items={evalItems}
        onToast={onToast}
      />
      <IkmPosterModal
        open={ikmPosterOpen}
        onClose={() => setIkmPosterOpen(false)}
        school={school}
        ikmSummary={ikmSummary}
        onToast={onToast}
      />
    </div>
  );
}
