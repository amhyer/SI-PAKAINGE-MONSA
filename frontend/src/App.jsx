import { useEffect, useRef, useState } from 'react';
import {
  Home,
  FilePlus2,
  ClipboardList,
  UserCircle2,
  Bot,
  Wifi,
  WifiOff,
  Phone,
  MapPin,
  Mail,
  ExternalLink,
  Accessibility,
  BarChart3,
  Star,
  Layers,
  ChevronDown,
  ChevronUp,
  UserCheck,
  Bell,
  Quote,
  Pencil,
  MessageCircle,
  X,
  Info,
  RefreshCw,
  Contrast,
  Languages,
  AlertTriangle,
} from 'lucide-react';
import {
  apiFetch,
  getOfflineQueue,
  getToken,
  isLocalDataMode,
  loadBootstrapCache,
  removeOfflineQueueIds,
  saveBootstrapCache,
  setToken,
} from './api';
import { CLIENT_APP_INFO, RENTAN_ETHICS_7, RENTAN_FACILITIES, SP4N_LAPOR_URL } from './constants';
import ComplaintFormTab from './components/ComplaintFormTab';
import ComplaintTrackTab from './components/ComplaintTrackTab';
import AccountSchoolTab from './components/AccountSchoolTab';
import StaffResultsTab from './components/StaffResultsTab';
import ServiceStandardsCard from './components/ServiceStandardsCard';
import PublicFkpBoard from './components/PublicFkpBoard';
import AppSpecsModal from './components/AppSpecsModal';
import ChatbotDrawer from './components/ChatbotDrawer';
import { ToastBanner } from './components/ConfirmModal';
import { tLabel } from './utils/i18n';
import logoMonsa from './assets/logo-monsa.png';

export default function App() {
  const [activeTab, setActiveTab] = useState('beranda');
  const [school, setSchool] = useState(null);
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [stats, setStats] = useState({ total: 0, processing: 0, done: 0, tenants_count: 1 });
  const [publicRecap, setPublicRecap] = useState(null);
  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [showRentanDetail, setShowRentanDetail] = useState(false);
  const [trackPresetFilter, setTrackPresetFilter] = useState('Semua');
  const [trackSubTab, setTrackSubTab] = useState('');
  const [formPresetCategory, setFormPresetCategory] = useState('');
  const [formPresetRentan, setFormPresetRentan] = useState(false);
  const [zoomPrincipalPhoto, setZoomPrincipalPhoto] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [offlineCount, setOfflineCount] = useState(getOfflineQueue().length);
  const [syncMsg, setSyncMsg] = useState('');
  const [toast, setToast] = useState(null);
  const [serverAppInfo, setServerAppInfo] = useState(null);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState('');
  const [swWaiting, setSwWaiting] = useState(false);
  const [dismissedUpdateBanner, setDismissedUpdateBanner] = useState(false);
  const [a11yLarge, setA11yLarge] = useState(() => {
    try {
      return localStorage.getItem('monsa_a11y_large') === '1';
    } catch {
      return false;
    }
  });
  const [highContrast, setHighContrast] = useState(() => {
    try {
      return localStorage.getItem('monsa_high_contrast') === '1';
    } catch {
      return false;
    }
  });
  const [lang, setLang] = useState(() => {
    try {
      return localStorage.getItem('monsa_lang') === 'mks' ? 'mks' : 'id';
    } catch {
      return 'id';
    }
  });
  const [presetGuestLink, setPresetGuestLink] = useState(null);
  const swRegRef = useRef(null);
  const userRef = useRef(null);
  userRef.current = user;
  const isStaff = Boolean(user && ['tppk_piket', 'admin_sekolah'].includes(user.role) && user.verification_status === 'verified');
  const navItems = [
    { id: 'beranda', label: tLabel(lang, 'navHome'), icon: Home },
    isStaff
      ? { id: 'lapor', label: tLabel(lang, 'navStaffResults'), icon: BarChart3 }
      : { id: 'lapor', label: tLabel(lang, 'navReport'), icon: FilePlus2 },
    { id: 'pantau', label: isStaff ? tLabel(lang, 'navStaffManage') : tLabel(lang, 'navTrack'), icon: ClipboardList },
    { id: 'akun', label: tLabel(lang, 'navAccount'), icon: UserCircle2 },
  ];

  function showToast(text, type = 'success') {
    setToast({ text, type, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev && prev.text === text ? null : prev));
    }, 3600);
  }

  async function loadBootstrap() {
    try {
      const data = await apiFetch('/api/bootstrap');
      setSchool(data.school);
      setDemoAccounts(data.demo_accounts || []);
      setStats(data.stats || { total: 0, processing: 0, done: 0, tenants_count: 1 });
      setPublicRecap(data.public_recap || null);
      saveBootstrapCache(data);
    } catch {
      const cached = loadBootstrapCache();
      if (cached) {
        setSchool(cached.school);
        setDemoAccounts(cached.demo_accounts || []);
        setStats(cached.stats || { total: 0, processing: 0, done: 0, tenants_count: 1 });
        setPublicRecap(cached.public_recap || null);
      }
    }
  }

  async function loadSessionAndComplaints(currentUser) {
    let activeUser = currentUser;
    if (!activeUser && getToken()) {
      try {
        const me = await apiFetch('/api/auth/me');
        activeUser = me.user;
        setUser(activeUser);
      } catch (err) {
        if (err?.status === 401 || err?.status === 403) {
          setToken('');
        }
        setUser(null);
      }
    }
    if (activeUser) {
      try {
        const res = await apiFetch('/api/complaints');
        setComplaints(res.items || []);
      } catch {
        setComplaints([]);
      }
      try {
        const nRes = await apiFetch('/api/notifications');
        setUnreadNotifCount(Number(nRes.unread_count || 0));
      } catch {
        setUnreadNotifCount(0);
      }
    } else {
      setComplaints([]);
      setUnreadNotifCount(0);
    }
  }

  async function syncOfflineReports() {
    const activeUser = userRef.current;
    const queue = getOfflineQueue();
    if (!queue.length || !activeUser) return;
    const syncedIds = [];
    for (const item of queue) {
      try {
        await apiFetch('/api/complaints', {
          method: 'POST',
          body: JSON.stringify({ ...item, is_offline_synced: true }),
        });
        syncedIds.push(item.local_id);
      } catch (err) {
        // Skip permanently invalid items (>400 <500 except 401/403/429) or stop on network/server failure
        if (err?.status && err.status >= 400 && err.status < 500 && ![401, 403, 429].includes(err.status)) {
          syncedIds.push(item.local_id);
          continue;
        }
        break;
      }
    }
    if (syncedIds.length > 0) {
      const remaining = removeOfflineQueueIds(syncedIds);
      setOfflineCount(remaining.length);
      setSyncMsg(`${syncedIds.length} laporan offline berhasil disinkronkan ke server sekolah.`);
      showToast(`${syncedIds.length} laporan offline berhasil disinkronkan!`);
      loadBootstrap();
      loadSessionAndComplaints(activeUser);
    }
  }

  async function checkForAppUpdates(notifyUser = false) {
    setCheckingUpdate(true);
    try {
      if (swRegRef.current && swRegRef.current.update) {
        swRegRef.current.update().catch(() => {});
      }
      const info = await apiFetch('/api/app-info', { cache: 'no-store' });
      setServerAppInfo(info);
      setLastCheckedAt(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      const hasNewer = Number(info?.version_code || 0) > CLIENT_APP_INFO.version_code;
      if (notifyUser) {
        if (hasNewer || swWaiting) {
          showToast(`Pembaruan versi v${info.version} tersedia!`);
        } else {
          showToast(`Aplikasi Anda sudah versi terbaru (v${CLIENT_APP_INFO.version}).`);
        }
      }
    } catch {
      if (notifyUser) showToast('Gagal memeriksa pembaruan ke server saat ini.', 'error');
    } finally {
      setCheckingUpdate(false);
    }
  }

  function applySwOrReloadUpdate() {
    const reg = swRegRef.current;
    if (reg && reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  }

  useEffect(() => {
    loadBootstrap();
    loadSessionAndComplaints(null);
    checkForAppUpdates(false);

    if (typeof window !== 'undefined' && window.location.search) {
      const sp = new URLSearchParams(window.location.search);
      const tCode = (sp.get('tiket') || '').trim().toUpperCase();
      const tPin = (sp.get('pin') || '').trim();
      if (tCode && tPin) {
        setPresetGuestLink({ ticket_code: tCode, pin: tPin });
        setActiveTab('pantau');
      }
    }

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((reg) => {
          if (!reg) return;
          swRegRef.current = reg;
          if (reg.waiting) setSwWaiting(true);
          reg.addEventListener('updatefound', () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                setSwWaiting(true);
              }
            });
          });
        })
        .catch(() => {});
    }

    const onUp = () => {
      setIsOnline(true);
      syncOfflineReports();
    };
    const onDown = () => setIsOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  useEffect(() => {
    if (user && isOnline) {
      syncOfflineReports();
    }
  }, [user, isOnline]);

  function toggleA11yLarge() {
    setA11yLarge((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('monsa_a11y_large', next ? '1' : '0');
      } catch {
        // ignore
      }
      showToast(next ? 'Mode Huruf Besar (Ramah Lansia & Disabilitas) aktif.' : 'Ukuran huruf kembali standar.');
      return next;
    });
  }

  function toggleHighContrast() {
    setHighContrast((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('monsa_high_contrast', next ? '1' : '0');
      } catch {
        // ignore
      }
      showToast(next ? 'Mode Kontras Tinggi (Low-Vision) aktif.' : 'Kontras kembali standar.');
      return next;
    });
  }

  function toggleLang() {
    setLang((prev) => {
      const next = prev === 'id' ? 'mks' : 'id';
      try {
        localStorage.setItem('monsa_lang', next);
      } catch {
        // ignore
      }
      showToast(next === 'mks' ? "Bahasa ramah Makassar–Indonesia (Sipakainge) aktif — Tabe'!" : 'Bahasa Indonesia baku aktif.');
      return next;
    });
  }

  return (
    <div className={`min-h-screen bg-slate-100 text-slate-900 pb-24 ${a11yLarge ? 'monsa-a11y-large' : ''} ${highContrast ? 'monsa-high-contrast' : ''}`}>
      <ToastBanner toast={toast} onClose={() => setToast(null)} />
      {/* Top Official School Header */}
      <header className="sticky top-0 z-30 bg-[#0B2D52] text-white shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-white p-0.5 flex items-center justify-center shrink-0 shadow overflow-hidden">
              <img src={logoMonsa} alt="Logo UPTD SPF SDN Unggulan Mongisidi 1" className="w-full h-full object-contain rounded-xl" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200 truncate">
                SI-PAKAINGE MONSA · PEKPPP & Ramah Rentan
              </p>
              <h1 className="font-extrabold text-sm leading-tight truncate">
                {school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={toggleA11yLarge}
              className={`px-2 py-1 rounded-full text-[10px] font-extrabold border transition ${
                a11yLarge
                  ? 'bg-amber-400 text-[#0B2D52] border-amber-300'
                  : 'bg-white/10 text-cyan-100 border-white/20 hover:bg-white/20'
              }`}
              title="Aktifkan/matikan huruf besar untuk lansia & low-vision"
              aria-label="Mode huruf besar"
            >
              Aa+
            </button>
            <button
              type="button"
              onClick={toggleHighContrast}
              className={`px-2 py-1 rounded-full text-[10px] font-extrabold border transition inline-flex items-center gap-1 ${
                highContrast
                  ? 'bg-yellow-400 text-black border-yellow-300'
                  : 'bg-white/10 text-cyan-100 border-white/20 hover:bg-white/20'
              }`}
              title="Mode Kontras Tinggi (Hitam-Kuning) untuk low-vision"
              aria-label="Mode kontras tinggi"
            >
              <Contrast className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={toggleLang}
              className={`px-2 py-1 rounded-full text-[10px] font-extrabold border transition inline-flex items-center gap-0.5 ${
                lang === 'mks'
                  ? 'bg-emerald-400 text-[#0B2D52] border-emerald-300'
                  : 'bg-white/10 text-cyan-100 border-white/20 hover:bg-white/20'
              }`}
              title="Ganti bahasa Indonesia / Makassar-Indonesia (Sipakainge)"
              aria-label="Ganti bahasa"
            >
              <Languages className="w-3 h-3" /> {lang.toUpperCase()}
            </button>
            {user && unreadNotifCount > 0 && (
              <button
                onClick={() => setActiveTab('pantau')}
                className="relative bg-rose-600 text-white px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 shadow"
                title="Lihat pemberitahuan tindak lanjut sekolah"
              >
                <Bell className="w-3 h-3" /> {unreadNotifCount}
              </button>
            )}
            <span
              className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${
                isOnline ? 'bg-emerald-500/20 text-emerald-200' : 'bg-amber-500/25 text-amber-200'
              }`}
            >
              {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </span>
          </div>
        </div>
      </header>

      {isLocalDataMode() && (
        <div
          role="alert"
          className="bg-amber-400 text-amber-950 border-b-2 border-amber-500 px-4 py-2 flex items-center justify-center gap-2 text-center"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <p className="text-[11px] font-extrabold leading-snug">
            Mode Lokal — data di perangkat ini TIDAK terkirim ke sekolah. Atur alamat server sekolah di tab Akun agar laporan diterima.
          </p>
        </div>
      )}

      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {(() => {
          const sCode = Number(serverAppInfo?.version_code || CLIENT_APP_INFO.version_code);
          const minCode = Number(serverAppInfo?.min_supported_code || CLIENT_APP_INFO.min_supported_code);
          const mustUpdate = CLIENT_APP_INFO.version_code < minCode;
          const hasUpdate = sCode > CLIENT_APP_INFO.version_code || swWaiting;
          if (!mustUpdate && (!hasUpdate || dismissedUpdateBanner)) return null;
          return (
            <div
              className={`rounded-2xl p-3 text-xs border flex flex-wrap items-center justify-between gap-2 ${
                mustUpdate ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-cyan-50 border-cyan-200 text-[#0B2D52]'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">
                  {mustUpdate ? 'Pembaruan Wajib Tersedia' : `Pembaruan Aplikasi v${serverAppInfo?.version || CLIENT_APP_INFO.version} Tersedia`}
                </p>
                <p className="text-[11px] opacity-85">
                  Perbarui agar fitur layanan, keamanan, & catatan aduan tetap sinkron.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSpecsOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 font-bold text-[11px]"
                >
                  Detail
                </button>
                <button
                  type="button"
                  onClick={applySwOrReloadUpdate}
                  className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white font-bold text-[11px] inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Perbarui
                </button>
                {!mustUpdate && (
                  <button
                    type="button"
                    onClick={() => setDismissedUpdateBanner(true)}
                    className="p-1 rounded-lg hover:bg-black/5"
                    aria-label="Tutup banner pembaruan"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {syncMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 text-xs font-medium flex items-center justify-between">
            <span>{syncMsg}</span>
            <button onClick={() => setSyncMsg('')} className="font-bold ml-3">Tutup</button>
          </div>
        )}

        {offlineCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-3 text-xs flex items-center justify-between">
            <span>Ada {offlineCount} laporan tersimpan di perangkat (offline).</span>
            {isOnline && user && (
              <button onClick={syncOfflineReports} className="px-3 py-1 rounded-xl bg-amber-600 text-white font-bold">
                Kirim Sekarang
              </button>
            )}
          </div>
        )}

        {activeTab === 'beranda' && (
          <div className="space-y-4">
            {/* Hero Card */}
            <div className="bg-gradient-to-br from-[#0B2D52] via-[#0F4C75] to-[#0E7490] rounded-3xl p-5 text-white shadow-lg space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-white/15 text-cyan-100">
                  NPSN {school?.npsn || '40313912'} · Terakreditasi A
                </span>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-100 flex items-center gap-1">
                  <Accessibility className="w-3 h-3" /> Ramah Kelompok Rentan & Inklusi
                </span>
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-cyan-400/20 text-cyan-100">
                  Modul Pengaduan SIMPEL
                </span>
              </div>

              <div>
                <h2 className="text-lg font-extrabold leading-snug">
                  {tLabel(lang, 'greetingBanner')}
                </h2>
                <p className="text-xs text-cyan-100 mt-1.5 leading-relaxed">
                  <em>Saling Mengingatkan dengan Hormat untuk Layanan Sekolah yang Lebih Baik.</em> Diselenggarakan oleh <strong>{school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1'}</strong> (Kepala Sekolah: <strong>{school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.'}</strong>) sesuai standar PEKPPP & Perwali Makassar No. 68 Tahun 2021.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => setActiveTab('lapor')}
                  className="bg-white text-[#0B2D52] font-extrabold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 shadow hover:bg-cyan-50 transition"
                >
                  {isStaff ? <BarChart3 className="w-4 h-4" /> : <FilePlus2 className="w-4 h-4" />}
                  {isStaff ? 'Hasil & Penilaian' : tLabel(lang, 'ctaReport')}
                </button>
                <button
                  onClick={() => setActiveTab('pantau')}
                  className="bg-white/15 border border-white/25 text-white font-bold text-xs py-3 px-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-white/20 transition"
                >
                  <ClipboardList className="w-4 h-4" /> {isStaff ? 'Kelola Aduan' : tLabel(lang, 'ctaTrack')}
                </button>
              </div>
            </div>

            {/* Ruang Foto & Sambutan Resmi Kepala Sekolah (Dapat Diperbarui Admin/Kepsek) */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 flex items-center gap-1">
                  <Quote className="w-3 h-3" /> {school?.welcome_title || 'Sambutan Kepala Sekolah'}
                </span>
                {user?.role === 'admin_sekolah' && user?.verification_status === 'verified' && (
                  <button
                    onClick={() => setActiveTab('akun')}
                    className="text-[10px] font-bold text-[#0B2D52] bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full flex items-center gap-1"
                  >
                    <Pencil className="w-3 h-3" /> Edit Foto & Sambutan
                  </button>
                )}
              </div>

              <div className="flex items-start gap-3.5">
                <button
                  type="button"
                  onClick={() => {
                    if (school?.principal_photo) setZoomPrincipalPhoto(true);
                    else if (user?.role === 'admin_sekolah' && user?.verification_status === 'verified') setActiveTab('akun');
                  }}
                  className="w-20 h-24 rounded-2xl border-2 border-cyan-100 bg-gradient-to-br from-[#0B2D52] to-[#0E7490] text-white shrink-0 overflow-hidden flex flex-col items-center justify-center shadow-xs hover:scale-[1.02] transition"
                  title={school?.principal_photo ? 'Ketuk untuk memperbesar foto' : 'Foto Kepala Sekolah'}
                >
                  {school?.principal_photo ? (
                    <img
                      src={school.principal_photo}
                      alt={`Foto ${school?.principal_name || 'Kepala Sekolah'}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center px-1.5">
                      <UserCircle2 className="w-8 h-8 mx-auto text-cyan-200" />
                      <p className="text-[8px] font-bold text-cyan-100 mt-1 leading-tight">Foto Kepala Sekolah</p>
                    </div>
                  )}
                </button>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                    {school?.welcome_message ||
                      "Assalamu'alaikum Warahmatullahi Wabarakatuh. Selamat datang di SI-PAKAINGE MONSA. Kami berkomitmen menghadirkan layanan konsultasi dan pengaduan yang transparan, bebas pungli, serta ramah bagi penyandang disabilitas dan seluruh kelompok rentan."}
                  </p>
                  <div className="pt-1 border-t border-slate-100">
                    <p className="text-xs font-extrabold text-[#0B2D52]">
                      {school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Kepala {school?.short_name || 'SDN Unggulan Mongisidi 1'} · NIP. 198112072007012013
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Publikasi Rekap Pengaduan Transparan (Siap Screenshot untuk PEKPPP 05B/Screenshot/) */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-xs font-extrabold text-[#0B2D52] flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-cyan-700" /> Publikasi Rekap Pengaduan Publik (Transparan)
                  </h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Pemutakhiran Real-Time: {publicRecap?.updated_at || '-'} · Bukti Publikasi PEKPPP Aspek 05
                  </p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {publicRecap?.completion_pct ?? 100}% Tuntas
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTrackPresetFilter('Semua');
                    setActiveTab('pantau');
                  }}
                  className="bg-slate-50 hover:bg-slate-100 rounded-2xl p-2.5 border border-slate-200 text-center transition cursor-pointer"
                >
                  <p className="text-lg font-extrabold text-[#0B2D52]">{stats.total}</p>
                  <p className="text-[10px] text-slate-500 font-medium">Masuk →</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrackPresetFilter('Sedang Diproses');
                    setActiveTab('pantau');
                  }}
                  className="bg-amber-50 hover:bg-amber-100/70 rounded-2xl p-2.5 border border-amber-200 text-center transition cursor-pointer"
                >
                  <p className="text-lg font-extrabold text-amber-700">{stats.processing}</p>
                  <p className="text-[10px] text-amber-700 font-medium">Diproses →</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrackPresetFilter('Selesai');
                    setActiveTab('pantau');
                  }}
                  className="bg-emerald-50 hover:bg-emerald-100/70 rounded-2xl p-2.5 border border-emerald-200 text-center transition cursor-pointer"
                >
                  <p className="text-lg font-extrabold text-emerald-700">{stats.done}</p>
                  <p className="text-[10px] text-emerald-700 font-medium">Selesai →</p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTrackPresetFilter('Prioritas Rentan');
                    setActiveTab('pantau');
                  }}
                  className="bg-cyan-50 hover:bg-cyan-100/70 rounded-2xl p-2.5 border border-cyan-200 text-center transition cursor-pointer"
                >
                  <p className="text-lg font-extrabold text-cyan-800">{publicRecap?.rentan_count ?? 0}</p>
                  <p className="text-[10px] text-cyan-800 font-medium">Rentan →</p>
                </button>
              </div>

              {publicRecap?.by_category && publicRecap.by_category.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {publicRecap.by_category.map((cat) => (
                    <button
                      type="button"
                      key={cat.category}
                      onClick={() => {
                        if (isStaff) {
                          setTrackPresetFilter('Semua');
                          setActiveTab('pantau');
                        } else {
                          setFormPresetCategory(cat.category);
                          setActiveTab('lapor');
                        }
                      }}
                      className="w-full flex items-center justify-between text-[11px] bg-slate-50 hover:bg-cyan-50 rounded-xl px-3 py-1.5 border border-slate-100 hover:border-cyan-200 transition text-left"
                    >
                      <span className="font-semibold text-slate-700 truncate pr-2">{cat.category}</span>
                      <span className="font-bold text-[#0B2D52] shrink-0">
                        {cat.total} aduan ({cat.done} selesai) · {isStaff ? 'Kelola →' : 'Lapor →'}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-1.5">
                  <span className="flex items-center gap-1 font-semibold">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                    Skor App: <strong>{publicRecap?.avg_app_rating ? `${publicRecap.avg_app_rating}/5` : '-'}</strong>
                    {' · '}
                    Respon Sekolah: <strong>{publicRecap?.avg_school_rating ? `${publicRecap.avg_school_rating}/5` : '-'}</strong>
                    {' · '}
                    IKM: <strong>{publicRecap?.ikm_count ? `${publicRecap.ikm_score} (${publicRecap.ikm_grade})` : '-'}</strong>
                    {' · '}
                    Tiket: <strong>{publicRecap?.avg_rating ? `${publicRecap.avg_rating}/5` : '-'}</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      SLA ≤ {school?.sla_hours || 24}j: {publicRecap?.sla_on_time_pct ?? 100}% Tepat Waktu
                    </span>
                    {isStaff && (publicRecap?.sla_overdue_count ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTrackPresetFilter('Melewati SLA');
                          setActiveTab('pantau');
                        }}
                        className="text-[10px] font-extrabold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full"
                      >
                        Alarm: {publicRecap.sla_overdue_count} Lewat SLA →
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isStaff) {
                      setActiveTab('lapor');
                    } else {
                      setTrackSubTab('evaluation');
                      setActiveTab('pantau');
                    }
                  }}
                  className="w-full py-2 px-3 rounded-2xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-[#0B2D52] text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition"
                >
                  <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                  {isStaff
                    ? 'Lihat Hasil Penilaian Pengguna & Cetak PDF →'
                    : 'Beri Penilaian Aplikasi & Respon Tindak Lanjut Sekolah →'}
                </button>
              </div>
            </div>

            {/* Etalase Standar Pelayanan Digital & Maklumat Rp 0 (PEKPPP Aspek Kebijakan Pelayanan) */}
            <ServiceStandardsCard
              school={school}
              isStaff={isStaff}
              onToast={showToast}
              onAction={() => setActiveTab('lapor')}
            />

            {/* Papan Transparansi Publik (PPID Sekolah) & Forum Konsultasi Publik (FKP) Digital */}
            <PublicFkpBoard user={user} school={school} onToast={showToast} />

            {/* Modul Ramah Kelompok Rentan & Kode Etik (Perwali No. 68/2021) */}
            <div className="bg-white rounded-3xl p-4 border border-cyan-200 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-cyan-50 text-cyan-800 flex items-center justify-center shrink-0">
                    <Accessibility className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-extrabold text-slate-900">
                      Pelayanan Publik Ramah Kelompok Rentan
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Perwali Kode Etik Makassar No. 68/2021 & Kode Etik UPTD SPF SDN Unggulan Mongisidi 1
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRentanDetail(!showRentanDetail)}
                  className="text-xs font-bold text-cyan-800 flex items-center gap-1 shrink-0"
                >
                  {showRentanDetail ? 'Tutup' : 'Detail'}
                  {showRentanDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {RENTAN_FACILITIES.map((f) => (
                  <button
                    type="button"
                    key={f}
                    onClick={() => setShowRentanDetail(true)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-cyan-50 hover:bg-cyan-100 text-cyan-900 border border-cyan-200 transition"
                  >
                    ✓ {f}
                  </button>
                ))}
              </div>

              {showRentanDetail && (
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 space-y-2">
                  <p className="text-[11px] font-bold text-slate-800">7 Kode Etik Pegawai Melayani Kelompok Rentan:</p>
                  {RENTAN_ETHICS_7.map((item) => (
                    <p key={item} className="text-[11px] text-slate-600 leading-relaxed">{item}</p>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (isStaff) {
                        setTrackPresetFilter('Prioritas Rentan');
                        setActiveTab('pantau');
                      } else {
                        setFormPresetRentan(true);
                        setActiveTab('lapor');
                      }
                    }}
                    className="mt-1 px-3 py-1.5 rounded-xl bg-cyan-800 text-white text-[11px] font-bold inline-flex items-center gap-1.5"
                  >
                    <Accessibility className="w-3.5 h-3.5" />
                    {isStaff ? 'Lihat Aduan Prioritas Rentan →' : 'Buat Aduan Jalur Prioritas Rentan →'}
                  </button>
                </div>
              )}
            </div>

            {/* Kanal Pengaduan Resmi & Tautan SP4N-LAPOR! */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900">Kanal Resmi Konsultasi, Pengaduan & SP4N-LAPOR!</h3>

              <a
                href={SP4N_LAPOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-2xl bg-rose-50 border border-rose-200 hover:bg-rose-100/70 transition"
              >
                <div>
                  <p className="text-xs font-extrabold text-rose-900">SP4N-LAPOR! Nasional (lapor.go.id)</p>
                  <p className="text-[11px] text-rose-700">Kanal pengaduan nasional terintegrasi Pemkot Makassar</p>
                </div>
                <ExternalLink className="w-4 h-4 text-rose-800 shrink-0" />
              </a>

              <div className="text-xs text-slate-600 space-y-1.5">
                <p className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-cyan-700 shrink-0" />
                  <span>Kepala Sekolah: <strong>{school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.'}</strong></span>
                </p>
                <p className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                  <span>{school?.address || 'Jl. R.W. Monginsidi No. 13, Maricaya Baru, Kota Makassar 90142'}</span>
                </p>
                <div className="flex flex-wrap gap-2 pt-0.5">
                  <a
                    href={`https://wa.me/${(school?.notify_whatsapp || '6281355982195').replace(/\D/g, '').replace(/^0/, '62')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold inline-flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-700" /> Chat WA Pengaduan
                  </a>
                  <a
                    href="tel:04118918116"
                    className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold inline-flex items-center gap-1.5"
                  >
                    <Phone className="w-3.5 h-3.5 text-cyan-700" /> Telepon (0411) 8918116
                  </a>
                  <a
                    href={`mailto:${school?.email || 'sdnungmongisidi1@gmail.com'}`}
                    className="px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold inline-flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5 text-cyan-700" /> {school?.email || 'sdnungmongisidi1@gmail.com'}
                  </a>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-start gap-2 text-[11px] text-slate-500">
                <Layers className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
                <span>
                  Pemilik tunggal: <strong>UPTD SPF SDN Unggulan Mongisidi 1</strong>, dengan arsitektur database terisolasi (<code>tenant_id</code>) yang siap direplikasi untuk sekolah lain di Kota Makassar.
                </span>
              </div>
            </div>

            {/* Footer 1-Baris Info Versi, Spesifikasi & Cek Pembaruan (Terlihat sebelum/sesudah login) */}
            <div className="bg-white/80 rounded-2xl px-4 py-2.5 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600 font-semibold">
                {CLIENT_APP_INFO.app_name} <strong className="text-[#0B2D52]">v{CLIENT_APP_INFO.version}</strong> · Build {CLIENT_APP_INFO.version_code}
              </span>
              <button
                type="button"
                onClick={() => setSpecsOpen(true)}
                className="font-extrabold text-cyan-800 hover:text-[#0B2D52] inline-flex items-center gap-1"
              >
                <Info className="w-3.5 h-3.5" /> Spesifikasi & Cek Pembaruan →
              </button>
            </div>
          </div>
        )}

        {activeTab === 'lapor' && (
          isStaff ? (
            <StaffResultsTab
              user={user}
              school={school}
              stats={stats}
              publicRecap={publicRecap}
              complaints={complaints}
              onToast={showToast}
              onGoTrack={(filter) => {
                setTrackPresetFilter(filter || 'Semua');
                setTrackSubTab('tickets');
                setActiveTab('pantau');
              }}
              onRefresh={() => {
                loadBootstrap();
                loadSessionAndComplaints(user);
              }}
            />
          ) : (
            <ComplaintFormTab
              user={user}
              school={school}
              lang={lang}
              isOnline={isOnline}
              presetCategory={formPresetCategory}
              presetRentan={formPresetRentan}
              onClearPreset={() => {
                setFormPresetCategory('');
                setFormPresetRentan(false);
              }}
              onToast={showToast}
              onGoTrack={() => {
                setTrackPresetFilter('Semua');
                setActiveTab('pantau');
              }}
              onOpenGuestLink={(code, pin) => {
                setPresetGuestLink({ ticket_code: code, pin });
                setActiveTab('pantau');
              }}
              onCreated={() => {
                setOfflineCount(getOfflineQueue().length);
                loadBootstrap();
                loadSessionAndComplaints(user);
              }}
              onNeedAuth={() => setActiveTab('akun')}
            />
          )
        )}

        {activeTab === 'pantau' && (
          <ComplaintTrackTab
            user={user}
            school={school}
            complaints={complaints}
            presetFilter={trackPresetFilter}
            presetSubTab={trackSubTab}
            presetGuestLink={presetGuestLink}
            onClearSubTab={() => setTrackSubTab('')}
            onClearGuestLink={() => setPresetGuestLink(null)}
            onToast={showToast}
            onGoLapor={() => setActiveTab('lapor')}
            onRefresh={() => {
              loadBootstrap();
              loadSessionAndComplaints(user);
            }}
            onNeedAuth={() => setActiveTab('akun')}
          />
        )}

        {activeTab === 'akun' && (
          <AccountSchoolTab
            user={user}
            school={school}
            demoAccounts={demoAccounts}
            serverAppInfo={serverAppInfo}
            checkingUpdate={checkingUpdate}
            swWaiting={swWaiting}
            onCheckUpdate={checkForAppUpdates}
            onOpenSpecs={() => setSpecsOpen(true)}
            onToast={showToast}
            onAuthChange={(newUser) => {
              setUser(newUser);
              loadSessionAndComplaints(newUser);
            }}
            onSchoolUpdated={(updated) => {
              setSchool(updated);
              loadBootstrap();
            }}
            onTenantChanged={(tenantCode) => {
              setUser(null);
              setComplaints([]);
              setUnreadNotifCount(0);
              loadBootstrap();
              showToast(`Beralih pratinjau ke tenant ${tenantCode}. Silakan masuk dengan akun sekolah tersebut.`);
            }}
          />
        )}
      </main>

      {/* Floating AI Assistant Button */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-20 right-4 z-40 bg-gradient-to-r from-[#0B2D52] to-[#0E7490] text-white px-4 py-3 rounded-full shadow-xl flex items-center gap-2 text-xs font-bold hover:scale-105 transition"
      >
        <Bot className="w-4 h-4" /> {tLabel(lang, 'ctaChat')}
      </button>

      {/* Bottom 4-Tab Navigation */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 shadow-lg">
        <div className="max-w-2xl mx-auto grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const showBadge = item.id === 'pantau' && unreadNotifCount > 0;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 transition ${
                  active ? 'text-[#0B2D52] font-extrabold' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                  {showBadge && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[9px] font-extrabold flex items-center justify-center">
                      {unreadNotifCount}
                    </span>
                  )}
                </div>
                <span className="text-[11px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <ChatbotDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        user={user}
        school={school}
        onNavigateTab={(tab) => {
          setActiveTab(tab);
          setChatOpen(false);
        }}
      />

      <AppSpecsModal
        open={specsOpen}
        onClose={() => setSpecsOpen(false)}
        serverAppInfo={serverAppInfo}
        checkingUpdate={checkingUpdate}
        lastCheckedAt={lastCheckedAt}
        swWaiting={swWaiting}
        onCheckUpdate={() => checkForAppUpdates(true)}
        onApplyUpdate={applySwOrReloadUpdate}
      />

      {zoomPrincipalPhoto && school?.principal_photo && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4" onClick={() => setZoomPrincipalPhoto(false)}>
          <div className="relative max-w-md w-full bg-white rounded-3xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomPrincipalPhoto(false)}
              className="absolute top-3 right-3 bg-slate-900/70 text-white rounded-full p-1.5"
              aria-label="Tutup foto"
            >
              <X className="w-4 h-4" />
            </button>
            <img src={school.principal_photo} alt={school.principal_name} className="w-full max-h-[70vh] object-contain bg-slate-900" />
            <div className="p-4 text-center">
              <p className="text-sm font-extrabold text-[#0B2D52]">{school.principal_name}</p>
              <p className="text-xs text-slate-500">Kepala {school.short_name} · NIP. 198112072007012013</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
