import { AlertTriangle, CheckCircle2, HelpCircle, X } from 'lucide-react';

export function ConfirmModal({
  open,
  title = 'Konfirmasi Aksi',
  message = 'Apakah Anda yakin ingin melanjutkan?',
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  tone = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const badgeStyle =
    tone === 'danger'
      ? 'bg-rose-100 text-rose-700'
      : tone === 'success'
      ? 'bg-emerald-100 text-emerald-700'
      : 'bg-cyan-100 text-[#0B2D52]';

  const confirmBtnStyle =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-700 text-white'
      : tone === 'success'
      ? 'bg-emerald-700 hover:bg-emerald-800 text-white'
      : 'bg-[#0B2D52] hover:bg-[#092341] text-white';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-200 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${badgeStyle}`}>
            {tone === 'danger' ? <AlertTriangle className="w-5 h-5" /> : <HelpCircle className="w-5 h-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-extrabold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-line">{message}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2 justify-end pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition disabled:opacity-50 ${confirmBtnStyle}`}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastBanner({ toast, onClose }) {
  if (!toast) return null;
  const isErr = toast.type === 'error';
  return (
    <div className="fixed top-16 inset-x-0 z-50 px-4 pointer-events-none">
      <div
        className={`max-w-md mx-auto pointer-events-auto rounded-2xl px-4 py-3 shadow-xl border flex items-center justify-between gap-2.5 text-xs font-bold ${
          isErr
            ? 'bg-rose-600 border-rose-500 text-white'
            : 'bg-emerald-700 border-emerald-600 text-white'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isErr ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
          <span className="leading-snug">{toast.text}</span>
        </div>
        <button type="button" onClick={onClose} className="text-white/80 hover:text-white shrink-0 p-0.5" aria-label="Tutup notifikasi">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
