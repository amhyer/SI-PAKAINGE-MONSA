import { useEffect, useState } from 'react';
import { Award, Send, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../api';
import { IKM_ELEMENTS, IKM_SCALE_OPTIONS, getIkmGradeInfo } from '../utils/ikm';
import { ConfirmModal } from './ConfirmModal';

export default function IkmSurveyCard({ user, school, onToast, onSubmitted }) {
  const [scores, setScores] = useState({ u1: 4, u2: 4, u3: 4, u4: 4, u5: 4, u6: 4, u7: 4, u8: 4, u9: 4 });
  const [suggestion, setSuggestion] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [summary, setSummary] = useState(null);
  const [items, setItems] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function loadIkm() {
    try {
      const res = await apiFetch('/api/ikm');
      setSummary(res.summary || null);
      setItems(res.items || []);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadIkm();
  }, [user?.id, school?.id]);

  async function executeSubmit() {
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/ikm', {
        method: 'POST',
        body: JSON.stringify({ ...scores, suggestion, is_anonymous: isAnonymous }),
      });
      setSuggestion('');
      setSummary(res.summary || summary);
      await loadIkm();
      onSubmitted && onSubmitted();
      onToast && onToast('Survei IKM 9 Unsur berhasil dikirim! Skor IKM sekolah diperbarui.');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  const gradeInfo = getIkmGradeInfo(summary?.ikm_score || 0, summary?.respondent_count || 0);

  return (
    <div className="space-y-3">
      {summary && (
        <div className="bg-white rounded-3xl p-4 border border-cyan-200 shadow-xs flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-bold text-cyan-800 flex items-center gap-1">
              <Award className="w-4 h-4" /> Indeks Kepuasan Masyarakat (IKM 9 Unsur)
            </p>
            <p className="text-xl font-extrabold text-[#0B2D52] mt-0.5">
              {summary.respondent_count ? `${Number(summary.ikm_score).toFixed(2)} / 100` : 'Belum Ada Data'}
            </p>
            <p className="text-[10px] text-slate-500">
              {summary.respondent_count} responden · PermenPAN-RB No. 14/2017
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-2xl border text-xs font-extrabold ${gradeInfo.badgeClass}`}>
            Mutu {gradeInfo.grade} · {gradeInfo.predicate}
          </span>
        </div>
      )}

      {!user && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-[11px] text-amber-900 font-semibold">
          Masuk terlebih dahulu di tab <strong>Akun</strong> untuk mengirim Survei IKM 9 Unsur (bisa dikirim secara Anonim).
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!user) {
            onToast && onToast('Silakan masuk terlebih dahulu di tab Akun untuk mengisi Survei IKM.', 'error');
            return;
          }
          setConfirmOpen(true);
        }}
        className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3"
      >
        <div>
          <h3 className="text-xs font-extrabold text-[#0B2D52]">
            Kuesioner Resmi SKM / IKM 9 Unsur Pelayanan Sekolah
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Pilih nilai 1–4 pada 9 unsur pelayanan {school?.short_name || 'SDN Unggulan Mongisidi 1'} sesuai PermenPAN-RB No. 14/2017.
          </p>
        </div>

        <div className="space-y-2.5">
          {IKM_ELEMENTS.map((el) => (
            <div key={el.key} className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
              <div>
                <p className="text-xs font-extrabold text-slate-800">{el.code}. {el.label}</p>
                <p className="text-[10px] text-slate-500">{el.desc}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {IKM_SCALE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setScores((prev) => ({ ...prev, [el.key]: opt.value }))}
                    className={`px-2 py-1.5 rounded-xl text-[10px] font-bold border transition ${
                      scores[el.key] === opt.value
                        ? opt.color
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.short}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Saran Perbaikan Unsur Pelayanan (Opsional)
          </label>
          <textarea
            rows={2}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            placeholder="Masukan singkat untuk peningkatan kualitas layanan sekolah..."
            className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs"
          />
        </div>

        <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl p-3">
          <div>
            <p className="text-xs font-bold text-slate-800">Kirim Survei IKM sebagai Anonim</p>
            <p className="text-[10px] text-slate-500">Identitas disembunyikan sesuai UU PDP</p>
          </div>
          <button
            type="button"
            onClick={() => setIsAnonymous(!isAnonymous)}
            aria-label="Toggle survei IKM anonim"
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
          <Send className="w-4 h-4" /> Kirim Survei IKM 9 Unsur
        </button>
      </form>

      {items.length > 0 && (
        <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2">
          <p className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Riwayat Survei IKM Anda ({items.length})
          </p>
          {items.slice(0, 5).map((it) => {
            const avgU = ((it.u1 + it.u2 + it.u3 + it.u4 + it.u5 + it.u6 + it.u7 + it.u8 + it.u9) / 9) * 25;
            return (
              <div key={it.id} className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 flex items-center justify-between text-[11px]">
                <div>
                  <p className="font-bold text-slate-800">{it.respondent_name}</p>
                  {it.suggestion && <p className="text-slate-600 mt-0.5">"{it.suggestion}"</p>}
                </div>
                <span className="font-extrabold text-[#0B2D52] shrink-0">{avgU.toFixed(1)} / 100</span>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Kirim Survei IKM 9 Unsur?"
        message="Jawaban Anda pada U1–U9 akan dihitung otomatis ke dalam Indeks Kepuasan Masyarakat (PermenPAN-RB No. 14/2017)."
        confirmLabel="Ya, Kirim Survei IKM"
        tone="primary"
        loading={submitting}
        onConfirm={executeSubmit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
