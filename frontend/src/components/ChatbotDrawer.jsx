import { useEffect, useState } from 'react';
import { Bot, Send, X, BookOpen, Lock, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { apiFetch } from '../api';
import { isTtsSupported, speakText, stopSpeech } from '../utils/speech';
import ModalShell from './ModalShell';

export default function ChatbotDrawer({ open, onClose, user, school, onNavigateTab }) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [speakingIdx, setSpeakingIdx] = useState(null);
  const getGreeting = () => ({
    sender: 'bot',
    text: `Halo! Saya Asisten Resmi SI-PAKAINGE MONSA (${school?.short_name || 'SDN Unggulan Mongisidi 1'}). Tanyakan prosedur pengaduan TPPK, Prioritas Kelompok Rentan (Perwali 68/2021), integrasi PEKPPP/SIMPEL & SP4N-LAPOR!, atau status tiket pengaduan.`,
    citations: [],
    actions: [],
  });
  const [messages, setMessages] = useState([getGreeting()]);

  useEffect(() => {
    if (school?.short_name && messages.length === 1 && messages[0].sender === 'bot') {
      setMessages([getGreeting()]);
    }
  }, [school?.short_name]);

  if (!open) return null;

  const quickPrompts = [
    'Bagaimana layanan Prioritas Kelompok Rentan & Inklusi?',
    'Apa hubungan aplikasi ini dengan PEKPPP, SIMPEL & SP4N-LAPOR!?',
    'Apakah laporan saya sedang diproses?',
    'Bagaimana aplikasi ini bisa dipakai banyak sekolah di Makassar?',
  ];

  async function ask(textToSend) {
    const q = (textToSend ?? question).trim();
    if (!q || loading) return;
    setQuestion('');
    setMessages((prev) => [...prev, { sender: 'user', text: q }]);
    setLoading(true);
    try {
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      });
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: data.answer, citations: data.citations || [], actions: data.actions || [] },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: `Maaf, asisten mengalami kendala: ${err.message}`, citations: [] },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      titleId="chatbot-modal-title"
      closeOnBackdrop={false}
      backdropClassName="bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="bg-white w-full sm:max-w-lg h-[88vh] sm:h-[80vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
    >
        <div className="bg-gradient-to-r from-[#0B2D52] to-[#0E7490] text-white px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 id="chatbot-modal-title" className="font-bold text-sm leading-tight">Asisten SI-PAKAINGE MONSA</h3>
              <p className="text-[11px] text-cyan-100 flex items-center gap-1 mt-0.5">
                <Lock className="w-3 h-3" />
                {user ? `Peran: ${user.role.replace('_', ' ')}` : 'Mode Tamu'} · PEKPPP & Ramah Rentan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMessages([getGreeting()])}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              aria-label="Reset percakapan"
              title="Reset percakapan"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          <div className="flex flex-wrap gap-1.5 pb-1">
            {quickPrompts.map((qp) => (
              <button
                type="button"
                key={qp}
                disabled={loading}
                onClick={() => ask(qp)}
                className="text-left text-[11px] px-2.5 py-1.5 rounded-xl bg-white border border-cyan-200 text-cyan-900 hover:bg-cyan-50 disabled:opacity-50 transition"
              >
                {qp}
              </button>
            ))}
          </div>

          {messages.map((m, idx) => (
            <div key={idx} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line shadow-xs ${
                  m.sender === 'user'
                    ? 'bg-[#0B2D52] text-white rounded-br-xs'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                }`}
              >
                <p className="leading-relaxed">{m.text}</p>
                {m.sender === 'bot' && isTtsSupported() && (
                  <div className="mt-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        if (speakingIdx === idx) {
                          stopSpeech();
                          setSpeakingIdx(null);
                        } else {
                          speakText(m.text, (active) => setSpeakingIdx(active ? idx : null));
                        }
                      }}
                      className="text-[10px] font-bold text-cyan-800 hover:text-[#0B2D52] inline-flex items-center gap-1"
                    >
                      {speakingIdx === idx ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                      {speakingIdx === idx ? 'Hentikan' : 'Bacakan Jawaban'}
                    </button>
                  </div>
                )}
                {m.citations && m.citations.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Rujukan SOP Sekolah
                    </p>
                    {m.citations.map((c, i) => (
                      <div key={i} className="text-[11px] text-cyan-800 bg-cyan-50/70 rounded-lg px-2 py-1">
                        {c.title}
                      </div>
                    ))}
                  </div>
                )}
                {m.actions && m.actions.length > 0 && onNavigateTab && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {m.actions.map((act, idxA) => (
                      <button
                        type="button"
                        key={idxA}
                        onClick={() => onNavigateTab(act.tab || 'lapor')}
                        className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white text-[11px] font-bold hover:bg-[#092341] transition"
                      >
                        {act.label} →
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl px-4 py-2.5 text-xs text-slate-500">
                Menelusuri SOP & data tiket {school?.short_name || 'sekolah'}...
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Tulis pertanyaan Anda di sini..."
            className="flex-1 bg-slate-100 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="w-10 h-10 rounded-2xl bg-[#0B2D52] text-white flex items-center justify-center disabled:opacity-40"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
    </ModalShell>
  );
}
