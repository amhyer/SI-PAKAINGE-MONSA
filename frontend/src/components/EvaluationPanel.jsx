import { useEffect, useState } from 'react';
import { Star, Smartphone, School, Send, CheckCircle2, MessageSquareHeart, Clock, ShieldCheck, Printer, FileDown, Award } from 'lucide-react';
import { apiFetch } from '../api';
import { ConfirmModal } from './ConfirmModal';
import EvaluationPrintModal from './EvaluationPrintModal';
import IkmSurveyCard from './IkmSurveyCard';
import { downloadEvaluationPdf } from '../utils/pdfReport';

const SPEED_OPTIONS = [
  'Sangat Cepat (≤6 Jam)',
  'Cepat (≤24 Jam)',
  'Cukup (>24 Jam)',
  'Lambat / Perlu Perbaikan',
];

const CLARITY_OPTIONS = [
  'Sangat Jelas & Tuntas',
  'Cukup Jelas',
  'Kurang Jelas / Belum Selesai',
];

function StarPicker({ label, hint, value, onChange }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-extrabold text-slate-800">{label}</p>
          <p className="text-[11px] text-slate-500">{hint}</p>
        </div>
        <span className="text-xs font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
          {value} / 5
        </span>
      </div>
      <div className="flex items-center gap-1.5 pt-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            aria-label={`${label}: ${s} bintang`}
            onClick={() => onChange(s)}
            className="p-1 rounded-lg hover:bg-amber-50 transition"
          >
            <Star className={`w-6 h-6 ${s <= value ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function EvaluationPanel({ user, school, complaints, onToast, onSubmitted }) {
  const [evalMode, setEvalMode] = useState('app_school');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ eval_count: 0, avg_app_rating: 0, avg_school_rating: 0 });
  const [appRating, setAppRating] = useState(5);
  const [schoolRating, setSchoolRating] = useState(5);
  const [responseSpeed, setResponseSpeed] = useState(SPEED_OPTIONS[0]);
  const [followupClarity, setFollowupClarity] = useState(CLARITY_OPTIONS[0]);
  const [ticketCode, setTicketCode] = useState('');
  const [comment, setComment] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const isStaff = user && ['tppk_piket', 'admin_sekolah'].includes(user.role) && user.verification_status === 'verified';

  async function loadEvaluations() {
    try {
      const res = await apiFetch('/api/evaluations');
      setItems(res.items || []);
      setSummary(res.summary || { eval_count: 0, avg_app_rating: 0, avg_school_rating: 0 });
    } catch {
      // ignore silently
    }
  }

  useEffect(() => {
    loadEvaluations();
  }, [user?.id, school?.id]);

  function requestSubmit(e) {
    e.preventDefault();
    if (!user) {
      onToast && onToast('Silakan masuk terlebih dahulu di tab Akun untuk mengirim penilaian.', 'error');
      return;
    }
    setConfirmOpen(true);
  }

  async function executeSubmit() {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/evaluations', {
        method: 'POST',
        body: JSON.stringify({
          app_rating: appRating,
          school_response_rating: schoolRating,
          response_speed: responseSpeed,
          followup_clarity: followupClarity,
          ticket_code: ticketCode,
          comment,
          is_anonymous: isAnonymous,
        }),
      });
      setComment('');
      setTicketCode('');
      setSummary(res.summary || summary);
      await loadEvaluations();
      onSubmitted && onSubmitted();
      onToast && onToast('Terima kasih! Penilaian aplikasi & respon sekolah berhasil disimpan.');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Mode Switcher: App & Respon Sekolah vs IKM 9 Unsur PermenPAN-RB 14/2017 */}
      <div className="bg-white rounded-2xl p-1.5 border border-slate-200 grid grid-cols-2 gap-1.5 shadow-xs">
        <button
          type="button"
          onClick={() => setEvalMode('app_school')}
          className={`py-2 px-2.5 rounded-xl text-[11px] font-extrabold transition flex items-center justify-center gap-1 ${
            evalMode === 'app_school' ? 'bg-cyan-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Star className="w-3.5 h-3.5" /> App & Respon (1–5★)
        </button>
        <button
          type="button"
          onClick={() => setEvalMode('ikm_9')}
          className={`py-2 px-2.5 rounded-xl text-[11px] font-extrabold transition flex items-center justify-center gap-1 ${
            evalMode === 'ikm_9' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Award className="w-3.5 h-3.5" /> Survei IKM 9 Unsur
        </button>
      </div>

      {evalMode === 'ikm_9' ? (
        <IkmSurveyCard user={user} school={school} onToast={onToast} onSubmitted={onSubmitted} />
      ) : (
        <>
      {/* Summary Score Cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white rounded-2xl p-3.5 border border-cyan-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-800">
            <Smartphone className="w-4 h-4" /> Penilaian Aplikasi
          </div>
          <p className="text-xl font-extrabold text-[#0B2D52] mt-1 flex items-center gap-1">
            {summary.avg_app_rating ? `${summary.avg_app_rating}/5` : '- / 5'}
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {summary.eval_count} responden · Kemudahan & fitur SI-PAKAINGE
          </p>
        </div>
        <div className="bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-xs">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-800">
            <School className="w-4 h-4" /> Respon Sekolah
          </div>
          <p className="text-xl font-extrabold text-emerald-800 mt-1 flex items-center gap-1">
            {summary.avg_school_rating ? `${summary.avg_school_rating}/5` : '- / 5'}
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {summary.eval_count} responden · Kecepatan & tindak lanjut
          </p>
        </div>
      </div>

      {/* Print / Export Official PDF School Report */}
      <div className="bg-gradient-to-r from-[#0B2D52] to-[#0E7490] text-white rounded-2xl p-3.5 flex items-center justify-between gap-2.5 flex-wrap">
        <div>
          <p className="text-xs font-extrabold">Laporan Resmi Penilaian App & Respon Sekolah (PDF)</p>
          <p className="text-[11px] text-cyan-100 mt-0.5">
            {isStaff
              ? 'Lengkap dengan Kop Surat Sekolah, rekap seluruh responden, & tanda tangan Kepala Sekolah.'
              : 'Lihat pratinjau cetak atau unduh PDF ringkasan survei & riwayat penilaian Anda.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPrintOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-white text-[#0B2D52] text-[11px] font-extrabold flex items-center gap-1.5 hover:bg-cyan-50"
          >
            <Printer className="w-3.5 h-3.5" /> Pratinjau & Cetak PDF
          </button>
          <button
            type="button"
            onClick={() => {
              downloadEvaluationPdf({ school, summary, items });
              onToast && onToast('File PDF Laporan Penilaian Sekolah berhasil diunduh!');
            }}
            className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-extrabold flex items-center gap-1.5"
          >
            <FileDown className="w-3.5 h-3.5" /> Unduh .PDF
          </button>
        </div>
      </div>

      {/* Form Penilaian Aplikasi & Tindak Lanjut Sekolah */}
      {!user && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-900 font-semibold">
          Masuk terlebih dahulu di tab <strong>Akun</strong> agar penilaian Anda tercatat resmi atas nama akun (tetap bisa memilih mode Anonim).
        </div>
      )}
      <form onSubmit={requestSubmit} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3.5">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-cyan-50 text-[#0B2D52] flex items-center justify-center shrink-0">
            <MessageSquareHeart className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-[#0B2D52]">
              Formulir Penilaian Aplikasi & Respon Tindak Lanjut Sekolah
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Masukan Anda digunakan untuk evaluasi mutu layanan publik (PEKPPP 05B & Inovasi SIMPEL 06B) {school?.short_name || 'SDN Unggulan Mongisidi 1'}.
            </p>
          </div>
        </div>

        <StarPicker
          label="1. Penilaian Aplikasi SI-PAKAINGE MONSA"
          hint="Kemudahan mengisi laporan, kejelasan menu, fitur anonim & ramah rentan"
          value={appRating}
          onChange={setAppRating}
        />

        <StarPicker
          label="2. Penilaian Respon & Tindak Lanjut Sekolah"
          hint="Kecepatan tanggapan tim piket/TPPK, keramahan layanan & ketuntasan solusi"
          value={schoolRating}
          onChange={setSchoolRating}
        />

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-cyan-700" /> 3. Kecepatan Respon Sekolah
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setResponseSpeed(opt)}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border text-left transition ${
                  responseSpeed === opt
                    ? 'bg-[#0B2D52] text-white border-[#0B2D52]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" /> 4. Kejelasan & Hasil Tindak Lanjut
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {CLARITY_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFollowupClarity(opt)}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-bold border text-left transition ${
                  followupClarity === opt
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {complaints && complaints.length > 0 && (
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              5. Terkait Tiket Pengaduan (Opsional)
            </label>
            <select
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white"
            >
              <option value="">Penilaian Umum (Tanpa Tiket Tertentu)</option>
              {complaints.map((c) => (
                <option key={c.id} value={c.ticket_code}>
                  {c.ticket_code} — {c.category} ({c.status})
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            {complaints && complaints.length > 0 ? '6.' : '5.'} Saran / Masukan untuk Aplikasi & Tim Sekolah
          </label>
          <textarea
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tuliskan apresiasi, saran perbaikan fitur aplikasi, atau evaluasi respon tindak lanjut sekolah..."
            className="w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
        </div>

        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <div>
            <p className="text-xs font-bold text-slate-800">Kirim Penilaian sebagai Anonim</p>
            <p className="text-[11px] text-slate-500">Nama Anda disamarkan di rekap sekolah (UU PDP)</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(!isAnonymous)}
            aria-label="Toggle penilaian anonim"
            className={`w-12 h-7 rounded-full p-1 transition ${isAnonymous ? 'bg-emerald-600' : 'bg-slate-300'}`}
          >
            <div className={`w-5 h-5 rounded-full bg-white shadow transition ${isAnonymous ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-2xl bg-[#0B2D52] hover:bg-[#092341] text-white text-xs font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {submitting ? 'Menyimpan Penilaian...' : 'Kirim Penilaian Aplikasi & Respon Sekolah'}
        </button>
      </form>

      {/* Evaluation History List (Staff sees all for school, User sees their own) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
        <h4 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          {isStaff ? `Daftar Evaluasi & Masukan Masuk (${items.length})` : `Riwayat Penilaian Anda (${items.length})`}
        </h4>
        {items.length === 0 ? (
          <p className="text-xs text-slate-500">
            Belum ada penilaian yang tercatat. Isi formulir di atas untuk memberikan penilaian pertama Anda.
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((ev) => (
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

      <ConfirmModal
        open={confirmOpen}
        title="Kirim Penilaian App & Respon Sekolah?"
        message={`Skor Aplikasi: ${appRating}/5 Bintang\nSkor Respon Sekolah: ${schoolRating}/5 Bintang\nKecepatan: ${responseSpeed}\nTindak Lanjut: ${followupClarity}\nIdentitas: ${isAnonymous ? 'Anonim (UU PDP)' : user?.full_name || 'Pengguna'}`}
        confirmLabel="Ya, Kirim Penilaian"
        tone="success"
        loading={submitting}
        onConfirm={executeSubmit}
        onCancel={() => setConfirmOpen(false)}
      />

      <EvaluationPrintModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        school={school}
        summary={summary}
        items={items}
        onToast={onToast}
      />
        </>
      )}
    </div>
  );
}
