import { useEffect, useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronUp,
  FileDown,
  Globe,
  Megaphone,
  Pencil,
  Plus,
  Send,
  Users,
  Vote,
} from 'lucide-react';
import { apiFetch } from '../api';
import { FKP_ROLES } from '../constants';
import { downloadFkpMinutesPdf } from '../utils/pdfReport';

export default function PublicFkpBoard({ user, school, onToast }) {
  const [expanded, setExpanded] = useState(false);
  const [transparencyItems, setTransparencyItems] = useState([]);
  const [polls, setPolls] = useState([]);
  const [recentFeedback, setRecentFeedback] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activePollIdx, setActivePollIdx] = useState(0);
  const [selectedOpt, setSelectedOpt] = useState('');
  const [respRole, setRespRole] = useState(FKP_ROLES[0]);
  const [respName, setRespName] = useState(user?.full_name || '');
  const [suggestion, setSuggestion] = useState('');
  const [submittingVote, setSubmittingVote] = useState(false);

  const [ppidModalOpen, setPpidModalOpen] = useState(false);
  const [editingPpidId, setEditingPpidId] = useState(null);
  const [ppidForm, setPpidForm] = useState({
    category: 'Program & Anggaran Sekolah (BOS)',
    title: '',
    summary: '',
    metric_value: '',
  });
  const [savingPpid, setSavingPpid] = useState(false);

  const [pollFormOpen, setPollFormOpen] = useState(false);
  const [pollForm, setPollForm] = useState({
    topic_title: '',
    topic_desc: '',
    options_text: '',
  });
  const [savingPoll, setSavingPoll] = useState(false);

  const isAdmin = Boolean(user && user.role === 'admin_sekolah' && user.verification_status === 'verified');

  async function loadFkp() {
    setLoading(true);
    try {
      const res = await apiFetch('/api/public/fkp');
      setTransparencyItems(res.transparency_items || []);
      const pl = res.polls || [];
      setPolls(pl);
      setRecentFeedback(res.recent_feedback || []);
      const targetPoll = pl[activePollIdx] || pl[0];
      if (targetPoll?.options?.length) {
        setSelectedOpt((prev) => (targetPoll.options.includes(prev) ? prev : targetPoll.options[0]));
      }
    } catch {
      // keep existing state if offline
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFkp();
  }, [school?.id]);

  useEffect(() => {
    if (user?.full_name && !respName) {
      setRespName(user.full_name);
    }
  }, [user?.full_name]);

  const activePoll = polls[activePollIdx] || polls[0] || null;

  useEffect(() => {
    if (activePoll?.options?.length && !activePoll.options.includes(selectedOpt)) {
      setSelectedOpt(activePoll.options[0]);
    }
  }, [activePoll?.id]);

  async function handleSubmitFkp(e) {
    e.preventDefault();
    if (!activePoll || !selectedOpt) return;
    setSubmittingVote(true);
    try {
      await apiFetch('/api/public/fkp/feedback', {
        method: 'POST',
        body: JSON.stringify({
          poll_id: activePoll.id,
          selected_option: selectedOpt,
          respondent_role: respRole,
          respondent_name: respName.trim() || 'Warga / Masyarakat Umum',
          suggestion: suggestion.trim(),
        }),
      });
      setSuggestion('');
      await loadFkp();
      onToast && onToast('Aspirasi & suara FKP Anda berhasil dicatat!');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSubmittingVote(false);
    }
  }

  function startAddPpid() {
    setEditingPpidId(null);
    setPpidForm({ category: 'Program & Anggaran Sekolah (BOS)', title: '', summary: '', metric_value: '' });
    setPpidModalOpen(true);
  }

  function startEditPpid(item) {
    setEditingPpidId(item.id);
    setPpidForm({
      category: item.category || 'Informasi Publik Sekolah',
      title: item.title || '',
      summary: item.summary || '',
      metric_value: item.metric_value || '',
    });
    setPpidModalOpen(true);
  }

  async function handleSavePpid(e) {
    e.preventDefault();
    if (!ppidForm.title.trim() || !ppidForm.summary.trim()) return;
    setSavingPpid(true);
    try {
      if (editingPpidId) {
        await apiFetch(`/api/public/transparency/${editingPpidId}`, {
          method: 'PATCH',
          body: JSON.stringify(ppidForm),
        });
        onToast && onToast('Informasi publik PPID berhasil diperbarui!');
      } else {
        await apiFetch('/api/public/transparency', {
          method: 'POST',
          body: JSON.stringify(ppidForm),
        });
        onToast && onToast('Informasi publik PPID berhasil ditambahkan!');
      }
      setPpidForm({ category: 'Program & Anggaran Sekolah (BOS)', title: '', summary: '', metric_value: '' });
      setEditingPpidId(null);
      setPpidModalOpen(false);
      await loadFkp();
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSavingPpid(false);
    }
  }

  async function handleCreatePoll(e) {
    e.preventDefault();
    const options = pollForm.options_text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!pollForm.topic_title.trim() || options.length < 2) {
      onToast && onToast('Judul topik FKP dan minimal 2 opsi (1 per baris) wajib diisi.', 'error');
      return;
    }
    setSavingPoll(true);
    try {
      await apiFetch('/api/public/fkp/polls', {
        method: 'POST',
        body: JSON.stringify({
          topic_title: pollForm.topic_title.trim(),
          topic_desc: pollForm.topic_desc.trim() || 'Pilih prioritas perbaikan layanan sekolah:',
          options,
        }),
      });
      setPollForm({ topic_title: '', topic_desc: '', options_text: '' });
      setPollFormOpen(false);
      setActivePollIdx(0);
      await loadFkp();
      onToast && onToast('Topik Forum Konsultasi Publik (FKP) baru berhasil diterbitkan!');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSavingPoll(false);
    }
  }

  return (
    <div className="bg-white rounded-3xl p-4 border border-cyan-200 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-cyan-50 text-[#0B2D52] flex items-center justify-center shrink-0 border border-cyan-200">
            <Globe className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs font-extrabold text-[#0B2D52]">
                Papan Transparansi Publik (PPID) & FKP Digital
              </h3>
              <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-300">
                TERBUKA UNTUK UMUM
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Keterbukaan BOS/SPMB & Forum Konsultasi Publik bagi Orang Tua, Alumni, Komite, & Masyarakat Luas
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-[#0B2D52] flex items-center gap-1 shrink-0"
        >
          {expanded ? 'Tutup' : 'Buka FKP'}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Ringkasan Cepat PPID */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {(transparencyItems || []).slice(0, expanded ? 12 : 4).map((item) => (
          <div key={item.id} className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-bold uppercase text-cyan-800 truncate">{item.category}</span>
              <div className="flex items-center gap-1 shrink-0">
                {item.metric_value && (
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                    {item.metric_value}
                  </span>
                )}
                {isAdmin && expanded && (
                  <button
                    type="button"
                    onClick={() => startEditPpid(item)}
                    className="p-1 rounded-lg bg-white border border-slate-200 text-[#0B2D52] hover:bg-cyan-50"
                    title="Edit informasi publik ini"
                    aria-label="Edit informasi PPID"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <p className="font-extrabold text-slate-900 leading-snug">{item.title}</p>
            {expanded && <p className="text-[10px] text-slate-600 leading-relaxed">{item.summary}</p>}
          </div>
        ))}
      </div>

      {expanded && (
        <div className="space-y-3 pt-1">
          {isAdmin && (
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-extrabold text-[#0B2D52] flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" /> Panel Admin PPID & Topik FKP
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => (ppidModalOpen ? setPpidModalOpen(false) : startAddPpid())}
                    className="px-2.5 py-1 rounded-xl bg-[#0B2D52] text-white text-[10px] font-bold inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> {ppidModalOpen ? 'Tutup Form PPID' : 'Tambah Info PPID'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPollFormOpen(!pollFormOpen)}
                    className="px-2.5 py-1 rounded-xl bg-cyan-700 text-white text-[10px] font-bold inline-flex items-center gap-1"
                  >
                    <Vote className="w-3 h-3" /> {pollFormOpen ? 'Tutup Form FKP' : 'Buat Topik FKP Baru'}
                  </button>
                </div>
              </div>

              {ppidModalOpen && (
                <form onSubmit={handleSavePpid} className="space-y-2 pt-1 text-xs bg-white p-3 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-extrabold text-[#0B2D52]">
                    {editingPpidId ? 'Perbarui Informasi Publik PPID' : 'Tambah Informasi Publik PPID Baru'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={ppidForm.category}
                      onChange={(e) => setPpidForm({ ...ppidForm, category: e.target.value })}
                      placeholder="Kategori (mis. Dana BOS / SPMB)"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="text"
                      value={ppidForm.metric_value}
                      onChange={(e) => setPpidForm({ ...ppidForm, metric_value: e.target.value })}
                      placeholder="Badge Nilai (mis. Triwulan IV)"
                      className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                    />
                  </div>
                  <input
                    type="text"
                    required
                    value={ppidForm.title}
                    onChange={(e) => setPpidForm({ ...ppidForm, title: e.target.value })}
                    placeholder="Judul Informasi Publik..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                  />
                  <textarea
                    rows={2}
                    required
                    value={ppidForm.summary}
                    onChange={(e) => setPpidForm({ ...ppidForm, summary: e.target.value })}
                    placeholder="Ringkasan informasi publik untuk masyarakat..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs bg-white"
                  />
                  <button
                    type="submit"
                    disabled={savingPpid}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white font-bold text-xs"
                  >
                    {savingPpid ? 'Menyimpan...' : editingPpidId ? 'Simpan Perubahan PPID' : 'Publikasikan ke Papan PPID'}
                  </button>
                </form>
              )}

              {pollFormOpen && (
                <form onSubmit={handleCreatePoll} className="space-y-2 pt-1 text-xs bg-white p-3 rounded-xl border border-cyan-200">
                  <p className="text-[11px] font-extrabold text-[#0B2D52]">Terbitkan Topik Polling FKP Baru</p>
                  <input
                    type="text"
                    required
                    value={pollForm.topic_title}
                    onChange={(e) => setPollForm({ ...pollForm, topic_title: e.target.value })}
                    placeholder="Judul Topik FKP (mis. Jam Layanan PTSP Semester Genap)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={pollForm.topic_desc}
                    onChange={(e) => setPollForm({ ...pollForm, topic_desc: e.target.value })}
                    placeholder="Deskripsi singkat pertanyaan..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <textarea
                    rows={3}
                    required
                    value={pollForm.options_text}
                    onChange={(e) => setPollForm({ ...pollForm, options_text: e.target.value })}
                    placeholder={'Tulis opsi pilihan (1 opsi per baris), mis:\nBuka Jam 07.00 WITA\nLayanan Online 24 Jam\nLoket Prioritas Khusus Lansia'}
                    className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={savingPoll}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0B2D52] text-white font-bold text-xs"
                  >
                    {savingPoll ? 'Menerbitkan...' : 'Terbitkan Topik FKP'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Jajak Pendapat / Forum Konsultasi Publik (FKP) */}
          {activePoll && (
            <div className="bg-cyan-50/70 rounded-2xl p-3.5 border border-cyan-200 space-y-3 text-xs">
              {polls.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {polls.map((pl, idx) => (
                    <button
                      type="button"
                      key={pl.id}
                      onClick={() => setActivePollIdx(idx)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border ${
                        idx === activePollIdx ? 'bg-[#0B2D52] text-white border-[#0B2D52]' : 'bg-white text-slate-700 border-cyan-200'
                      }`}
                    >
                      Topik #{idx + 1}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-extrabold text-[#0B2D52] flex items-center gap-1.5">
                    <Vote className="w-4 h-4 text-cyan-700" /> {activePoll.topic_title}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{activePoll.topic_desc}</p>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white text-[#0B2D52] border border-cyan-200 shrink-0">
                  {activePoll.total_votes} Suara
                </span>
              </div>

              <form onSubmit={handleSubmitFkp} className="space-y-2.5">
                <div className="space-y-1.5">
                  {activePoll.options.map((opt) => {
                    const cnt = Number(activePoll.counts?.[opt] || 0);
                    const pct = activePoll.total_votes ? Math.round((cnt / activePoll.total_votes) * 100) : 0;
                    const chosen = selectedOpt === opt;
                    return (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => setSelectedOpt(opt)}
                        className={`w-full text-left rounded-xl p-2.5 border transition ${
                          chosen ? 'bg-white border-[#0B2D52] ring-1 ring-[#0B2D52]' : 'bg-white/80 border-cyan-100 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-800">
                          <span>{chosen ? '● ' : '○ '}{opt}</span>
                          <span className="text-cyan-800 shrink-0">{pct}% ({cnt})</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-[#0E7490] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={respRole}
                    onChange={(e) => setRespRole(e.target.value)}
                    className="rounded-xl border border-cyan-200 px-3 py-1.5 text-xs bg-white font-semibold text-slate-800"
                  >
                    {FKP_ROLES.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={respName}
                    onChange={(e) => setRespName(e.target.value)}
                    placeholder="Nama / Inisial (Opsional)"
                    className="rounded-xl border border-cyan-200 px-3 py-1.5 text-xs bg-white"
                  />
                </div>
                <textarea
                  rows={2}
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  placeholder="Tuliskan saran terbuka untuk perbaikan layanan sekolah (opsional)..."
                  className="w-full rounded-xl border border-cyan-200 px-3 py-2 text-xs bg-white"
                />
                <button
                  type="submit"
                  disabled={submittingVote || !selectedOpt}
                  className="w-full py-2 rounded-xl bg-[#0B2D52] hover:bg-[#08223d] disabled:opacity-50 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submittingVote ? 'Mengirim Suara FKP...' : 'Kirim Suara & Masukan FKP (Tanpa Login)'}
                </button>
              </form>
            </div>
          )}

          {/* Masukan Terbaru */}
          {recentFeedback.length > 0 && (
            <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
              <p className="text-[11px] font-extrabold text-[#0B2D52] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-cyan-700" /> Aspirasi Masyarakat Terbaru ({recentFeedback.length})
              </p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {recentFeedback.slice(0, 6).map((fb) => (
                  <div key={fb.id} className="bg-white rounded-xl p-2 border border-slate-100 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{fb.respondent_name}</span>
                      <span className="text-[10px] text-cyan-800 font-semibold">{fb.respondent_role}</span>
                    </div>
                    <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">Pilihan: {fb.selected_option}</p>
                    {fb.suggestion && <p className="text-[11px] text-slate-600 mt-0.5">"{fb.suggestion}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            downloadFkpMinutesPdf({ school, transparencyItems, polls, recentFeedback });
            onToast && onToast('Draft Berita Acara FKP & PPID (.PDF) berhasil diunduh!');
          }}
          className="px-3 py-1.5 rounded-xl bg-[#0B2D52] hover:bg-[#08223d] text-white text-[11px] font-extrabold inline-flex items-center gap-1.5"
        >
          <FileDown className="w-3.5 h-3.5" /> Unduh Draft Berita Acara FKP (.PDF)
        </button>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-[#0B2D52] border border-cyan-200 text-[11px] font-extrabold inline-flex items-center gap-1.5"
        >
          <Megaphone className="w-3.5 h-3.5" /> {expanded ? 'Ringkas Tampilan' : loading ? 'Memuat...' : 'Ikut Jajak Pendapat FKP →'}
        </button>
      </div>
    </div>
  );
}
