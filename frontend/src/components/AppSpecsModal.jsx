import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  ShieldCheck,
  History,
  Download,
  Cpu,
} from 'lucide-react';
import { CLIENT_APP_INFO } from '../constants';
import ModalShell from './ModalShell';

export default function AppSpecsModal({
  open,
  onClose,
  serverAppInfo,
  checkingUpdate,
  lastCheckedAt,
  swWaiting,
  onCheckUpdate,
  onApplyUpdate,
}) {
  if (!open) return null;

  const info = serverAppInfo || CLIENT_APP_INFO;
  const serverCode = Number(info.version_code || CLIENT_APP_INFO.version_code);
  const minCode = Number(info.min_supported_code || CLIENT_APP_INFO.min_supported_code);
  const hasNewerServer = serverCode > CLIENT_APP_INFO.version_code;
  const mustUpdate = CLIENT_APP_INFO.version_code < minCode;
  const hasAnyUpdate = hasNewerServer || swWaiting;

  return (
    <ModalShell
      onClose={onClose}
      titleId="app-specs-modal-title"
      backdropClassName="bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      panelClassName="w-full max-w-xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
    >
        <div className="bg-[#0B2D52] text-white px-5 py-4 flex items-center justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200">
              Informasi Resmi & Pembaruan Aplikasi
            </p>
            <h3 id="app-specs-modal-title" className="text-base font-extrabold">{info.app_name || CLIENT_APP_INFO.app_name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
            aria-label="Tutup jendela spesifikasi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Status Pembaruan */}
          <div
            className={`rounded-2xl p-4 border space-y-3 ${
              mustUpdate
                ? 'bg-rose-50 border-rose-200'
                : hasAnyUpdate
                ? 'bg-amber-50 border-amber-200'
                : 'bg-emerald-50 border-emerald-200'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {mustUpdate || hasAnyUpdate ? (
                  <AlertTriangle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${mustUpdate ? 'text-rose-600' : 'text-amber-600'}`}
                  />
                ) : (
                  <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-emerald-600" />
                )}
                <div>
                  <p className="font-extrabold text-slate-900">
                    {mustUpdate
                      ? 'Pembaruan Wajib Tersedia'
                      : hasAnyUpdate
                      ? `Pembaruan Tersedia (v${info.version})`
                      : 'Aplikasi Sudah Versi Terbaru'}
                  </p>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Terpasang di perangkat: <strong>v{CLIENT_APP_INFO.version}</strong> (Build {CLIENT_APP_INFO.version_code})
                    {' · '}
                    Versi Server: <strong>v{info.version}</strong> (Build {serverCode})
                  </p>
                  {lastCheckedAt && (
                    <p className="text-[10px] text-slate-500 mt-0.5">Terakhir diperiksa: {lastCheckedAt}</p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checkingUpdate}
                onClick={onCheckUpdate}
                className="px-3.5 py-2 rounded-xl bg-[#0B2D52] hover:bg-[#08223d] disabled:opacity-60 text-white font-bold inline-flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                {checkingUpdate ? 'Memeriksa...' : 'Cek Pembaruan Sekarang'}
              </button>

              {hasAnyUpdate && onApplyUpdate && (
                <button
                  type="button"
                  onClick={onApplyUpdate}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang Versi Baru
                </button>
              )}

              {info.apk_download_url && (
                <a
                  href={info.apk_download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh APK Terbaru
                </a>
              )}
            </div>
          </div>

          {/* Identitas & Spesifikasi Perangkat */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-cyan-700" /> Identitas & Spesifikasi Perangkat
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                <p className="text-slate-400 font-semibold">Pemilik Resmi</p>
                <p className="font-bold text-slate-800">{info.owner || CLIENT_APP_INFO.owner}</p>
                <p className="text-slate-500">NPSN: {info.npsn || CLIENT_APP_INFO.npsn}</p>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                <p className="text-slate-400 font-semibold">ID Paket Android</p>
                <p className="font-bold text-slate-800 font-mono">{info.android_package || CLIENT_APP_INFO.android_package}</p>
                <p className="text-slate-500">Tanggal Rilis: {info.release_date || CLIENT_APP_INFO.release_date}</p>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                <p className="text-slate-400 font-semibold">Syarat Android APK</p>
                <p className="font-bold text-slate-800">Min: {info.min_android || CLIENT_APP_INFO.min_android}</p>
                <p className="text-slate-500">Target: {info.target_android || CLIENT_APP_INFO.target_android}</p>
              </div>
              <div className="bg-white rounded-xl p-2.5 border border-slate-200">
                <p className="text-slate-400 font-semibold">Dukungan Web & PWA</p>
                <p className="font-bold text-slate-800">Chrome, Safari, Edge, Firefox</p>
                <p className="text-slate-500">Dapat dipasang ke Layar Utama (PWA)</p>
              </div>
            </div>
          </div>

          {/* Arsitektur, Keamanan & Kepatuhan */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-[#0B2D52]" /> Spesifikasi Teknis, Keamanan & Regulasi
            </h4>
            <div className="space-y-2">
              {(info.specs || CLIENT_APP_INFO.specs).map((sp) => (
                <div key={sp.label} className="bg-slate-50 rounded-xl p-2.5 border border-slate-100">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-800 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> {sp.label}
                  </p>
                  <p className="text-[11px] text-slate-700 mt-0.5 leading-relaxed">{sp.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Riwayat Pembaruan (Changelog) */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2.5">
            <h4 className="font-extrabold text-slate-900 flex items-center gap-1.5">
              <History className="w-4 h-4 text-emerald-700" /> Riwayat Pembaruan (Changelog)
            </h4>
            <div className="space-y-2.5">
              {(info.changelog || CLIENT_APP_INFO.changelog).map((rel) => (
                <div key={rel.version} className="bg-slate-50 rounded-xl p-3 border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#0B2D52]">
                      v{rel.version} <span className="font-normal text-slate-500">(Build {rel.code})</span>
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500">{rel.date}</span>
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-700">
                    {rel.notes.map((n, idx) => (
                      <li key={idx}>{n}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
    </ModalShell>
  );
}
