import { useEffect, useState } from 'react';
import {
  Search,
  Star,
  CheckCircle2,
  Shield,
  FileText,
  Accessibility,
  FileDown,
  Bell,
  MessageCircle,
  Mail,
  X,
  Image as ImageIcon,
  RefreshCw,
  AlertTriangle,
  Timer,
  KeyRound,
  Camera,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../api';
import { DISABILITY_TYPES, STATUS_STEPS, STATUS_STYLE } from '../constants';
import { computeComplaintSla, computeSlaSummary } from '../utils/sla';
import MonevReportModal from './MonevReportModal';
import { ConfirmModal } from './ConfirmModal';
import EvaluationPanel from './EvaluationPanel';
import ModalShell from './ModalShell';

function compressResolutionPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        for (const maxW of [960, 720, 560]) {
          const scale = img.width > maxW ? maxW / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          for (const q of [0.72, 0.55, 0.42]) {
            const out = canvas.toDataURL('image/jpeg', q);
            if (out.length <= 880000) {
              resolve(out);
              return;
            }
          }
        }
        reject(new Error('Ukuran foto bukti penanganan terlalu besar (>900 KB). Pilih foto lain.'));
      };
      img.onerror = () => reject(new Error('File foto bukti penanganan tidak valid.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

export default function ComplaintTrackTab({
  user,
  school,
  complaints,
  presetFilter,
  presetSubTab,
  presetGuestLink,
  onClearSubTab,
  onClearGuestLink,
  onToast,
  onGoLapor,
  onRefresh,
  onNeedAuth,
}) {
  const [subTab, setSubTab] = useState(presetSubTab || 'tickets');
  const [query, setQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState(presetFilter || 'Semua');
  const [editingId, setEditingId] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [staffNote, setStaffNote] = useState('');
  const [resolutionPhoto, setResolutionPhoto] = useState('');
  const [ratingTarget, setRatingTarget] = useState({});
  const [saving, setSaving] = useState(false);
  const [guestCode, setGuestCode] = useState('');
  const [guestPin, setGuestPin] = useState('');
  const [guestTicket, setGuestTicket] = useState(null);
  const [guestLoading, setGuestLoading] = useState(false);
  const [guestRating, setGuestRating] = useState({ stars: 5, text: '' });
  const [savedGuestTickets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('monsa_guest_tickets') || '[]');
    } catch {
      return [];
    }
  });
  const [monevOpen, setMonevOpen] = useState(false);
  const [notifLogs, setNotifLogs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [lastReplyNotif, setLastReplyNotif] = useState(null);
  const [zoomPhoto, setZoomPhoto] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const isStaff = user && ['tppk_piket', 'admin_sekolah'].includes(user.role) && user.verification_status === 'verified';
  const slaHours = Number(school?.sla_hours || 24);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  async function fetchNotifications() {
    if (!user) return;
    try {
      const res = await apiFetch('/api/notifications');
      setNotifLogs(res.items || []);
      setUnreadCount(Number(res.unread_count || 0));
    } catch {
      setNotifLogs([]);
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    if (presetFilter) {
      setFilterStatus(presetFilter);
    }
  }, [presetFilter]);

  useEffect(() => {
    if (presetSubTab) {
      setSubTab(presetSubTab);
      onClearSubTab && onClearSubTab();
    }
  }, [presetSubTab]);

  useEffect(() => {
    if (presetGuestLink?.ticket_code && presetGuestLink?.pin) {
      handleGuestTrack(null, presetGuestLink.ticket_code, presetGuestLink.pin);
      onClearGuestLink && onClearGuestLink();
    }
  }, [presetGuestLink?.ticket_code, presetGuestLink?.pin]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
    }
  }, [user?.id, isStaff, complaints.length]);

  async function handleGuestTrack(e, overrideCode, overridePin) {
    if (e) e.preventDefault();
    const code = (overrideCode ?? guestCode).trim().toUpperCase();
    const pin = (overridePin ?? guestPin).trim();
    if (!code || !pin) {
      onToast && onToast('Isi Kode Tiket dan PIN 6-digit.', 'error');
      return;
    }
    setGuestLoading(true);
    try {
      const res = await apiFetch('/api/complaints/guest-track', {
        method: 'POST',
        body: JSON.stringify({ ticket_code: code, pin }),
      });
      setGuestCode(code);
      setGuestPin(pin);
      setGuestTicket(res.item);
    } catch (err) {
      setGuestTicket(null);
      onToast && onToast(err.message, 'error');
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleGuestRate(e) {
    e.preventDefault();
    if (!guestTicket) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/complaints/guest-rate', {
        method: 'POST',
        body: JSON.stringify({
          ticket_code: guestCode.trim().toUpperCase(),
          pin: guestPin.trim(),
          parent_rating: guestRating.stars,
          parent_feedback: guestRating.text,
        }),
      });
      setGuestTicket(res.item);
      onToast && onToast('Terima kasih! Penilaian bintang Anda telah tercatat.');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const guestTicketCard = guestTicket ? (
    <div className="bg-white rounded-3xl p-4 border-2 border-cyan-300 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900">
              HASIL QR / LACAK PIN
            </span>
            <span className="text-xs font-extrabold text-[#0B2D52]">{guestTicket.ticket_code}</span>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${STATUS_STYLE[guestTicket.status] || 'bg-slate-100'}`}>
              {guestTicket.status}
            </span>
            {guestTicket.child_mode ? (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                DARURAT MODE ANAK
              </span>
            ) : null}
            {guestTicket.disability_type ? (
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-300">
                INKLUSI: {DISABILITY_TYPES.find((d) => d.id === guestTicket.disability_type)?.label || guestTicket.disability_type}
              </span>
            ) : null}
          </div>
          <p className="text-xs font-bold text-slate-900 mt-1">{guestTicket.category}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-slate-400">{(guestTicket.created_at || '').slice(0, 10)}</span>
          <button
            type="button"
            onClick={() => setGuestTicket(null)}
            className="p-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600"
            aria-label="Tutup hasil lacak tamu"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-700 bg-slate-50 rounded-2xl p-3 border border-slate-100">{guestTicket.description}</p>
      {guestTicket.sla_info?.badge_text && (
        <div
          className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border ${
            guestTicket.sla_info.sla_state === 'terlambat' || guestTicket.sla_info.sla_state === 'selesai_lewat_sla'
              ? 'bg-rose-50 text-rose-800 border-rose-200'
              : guestTicket.sla_info.sla_state === 'kritis'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200'
          }`}
        >
          {guestTicket.sla_info.badge_text}
        </div>
      )}
      {guestTicket.audio_evidence && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
          <p className="text-[10px] font-bold text-amber-950 mb-1">Pesan Suara Pelapor (Voice Note):</p>
          <audio controls src={guestTicket.audio_evidence} className="w-full h-8" />
        </div>
      )}
      {guestTicket.staff_note && (
        <div className="bg-cyan-50/80 border border-cyan-200 rounded-2xl p-3 text-xs text-cyan-950">
          <p className="font-bold text-[11px] mb-0.5">Tanggapan Resmi Sekolah:</p>
          <p>{guestTicket.staff_note}</p>
        </div>
      )}
      {(guestTicket.photo_data || guestTicket.resolution_photo) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {guestTicket.photo_data && (
            <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200">
              <p className="text-[10px] font-bold text-slate-600 mb-1">Foto Awal (Sebelum)</p>
              <button type="button" onClick={() => setZoomPhoto(guestTicket.photo_data)} className="w-full">
                <img src={guestTicket.photo_data} alt="Foto awal" className="w-full h-28 object-cover rounded-xl" />
              </button>
            </div>
          )}
          {guestTicket.resolution_photo && (
            <div className="bg-emerald-50 p-2 rounded-2xl border border-emerald-200">
              <p className="text-[10px] font-bold text-emerald-800 mb-1">Foto Penanganan Sekolah (Sesudah)</p>
              <button type="button" onClick={() => setZoomPhoto(guestTicket.resolution_photo)} className="w-full">
                <img src={guestTicket.resolution_photo} alt="Foto sesudah" className="w-full h-28 object-cover rounded-xl" />
              </button>
            </div>
          )}
        </div>
      )}
      {guestTicket.status === 'Selesai' && (
        guestTicket.parent_rating > 0 ? (
          <p className="text-xs font-bold text-emerald-700">
            Penilaian Anda: {guestTicket.parent_rating}/5 Bintang {guestTicket.parent_feedback ? `— "${guestTicket.parent_feedback}"` : ''}
          </p>
        ) : (
          <form onSubmit={handleGuestRate} className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
            <p className="text-xs font-bold text-amber-900">Beri Penilaian Penyelesaian Sekolah</p>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setGuestRating({ ...guestRating, stars: s })}
                  aria-label={`Beri ${s} bintang`}
                >
                  <Star className={`w-5 h-5 ${s <= guestRating.stars ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`} />
                </button>
              ))}
              <span className="ml-2 text-xs font-bold text-amber-900">{guestRating.stars}/5</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={guestRating.text}
                onChange={(e) => setGuestRating({ ...guestRating, text: e.target.value })}
                placeholder="Masukan singkat (opsional)"
                className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs"
              />
              <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold">
                Kirim
              </button>
            </div>
          </form>
        )
      )}
    </div>
  ) : null;

  if (!user) {
    return (
      <div className="space-y-4">
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-extrabold text-sm text-[#0B2D52] flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-cyan-700" /> Lacak Lapor Cepat (Kode Tiket + PIN 6-Digit)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Untuk warga yang melapor tanpa mendaftar akun. Atau{' '}
                <button type="button" onClick={onNeedAuth} className="font-bold text-[#0B2D52] underline">
                  Masuk Akun
                </button>{' '}
                untuk melihat semua riwayat tiket Anda.
              </p>
            </div>
          </div>

          {savedGuestTickets.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-500">Tiket Lapor Cepat Terakhir di HP Ini:</p>
              <div className="flex flex-wrap gap-1.5">
                {savedGuestTickets.slice(0, 4).map((gt) => (
                  <button
                    key={gt.ticket_code}
                    type="button"
                    onClick={() => handleGuestTrack(null, gt.ticket_code, gt.pin)}
                    className="px-2.5 py-1 rounded-xl bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-[11px] font-bold text-[#0B2D52]"
                  >
                    {gt.ticket_code} (PIN: {gt.pin})
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleGuestTrack} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              required
              value={guestCode}
              onChange={(e) => setGuestCode(e.target.value)}
              placeholder="Kode Tiket (ADU-MONSA-...)"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono uppercase"
            />
            <input
              type="text"
              required
              value={guestPin}
              onChange={(e) => setGuestPin(e.target.value)}
              placeholder="PIN 6-Digit"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono"
            />
            <button
              type="submit"
              disabled={guestLoading}
              className="px-4 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold"
            >
              {guestLoading ? 'Mencari...' : 'Lacak Tiket'}
            </button>
          </form>
        </div>

        {guestTicketCard}

        {zoomPhoto && (
          <ModalShell
            onClose={() => setZoomPhoto('')}
            label="Pratinjau foto"
            backdropClassName="bg-slate-950/80 flex items-center justify-center p-4"
            panelClassName="relative max-w-xl w-full"
          >
              <button
                type="button"
                onClick={() => setZoomPhoto('')}
                className="absolute -top-10 right-0 text-white bg-white/20 rounded-full p-1.5"
                aria-label="Tutup pratinjau foto"
              >
                <X className="w-5 h-5" />
              </button>
              <img src={zoomPhoto} alt="Pratinjau foto" className="w-full max-h-[80vh] object-contain rounded-2xl bg-black" />
          </ModalShell>
        )}
      </div>
    );
  }

  const slaSummary = computeSlaSummary(complaints, slaHours, nowTick);

  const filtered = complaints.filter((c) => {
    const isRentan = Boolean(c.needs_priority_assistance) || (c.vulnerable_group && c.vulnerable_group !== 'Umum (Bukan Kelompok Rentan)');
    const sla = computeComplaintSla(c, slaHours, nowTick);
    let matchStatus = true;
    if (filterStatus === 'Melewati SLA') matchStatus = c.status !== 'Selesai' && sla.is_overdue;
    else if (filterStatus === 'Sedang Diproses') matchStatus = c.status !== 'Selesai';
    else if (filterStatus === 'Prioritas Rentan') matchStatus = isRentan;
    else if (filterStatus !== 'Semua') matchStatus = c.status === filterStatus;

    const q = query.trim().toLowerCase();
    const matchQuery =
      !q ||
      c.ticket_code.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q);
    return matchStatus && matchQuery;
  });

  function requestStaffUpdate(c) {
    setConfirmState({
      title: `Simpan Tindak Lanjut ${c.ticket_code}?`,
      message: `Status baru: ${nextStatus}\nCatatan: ${staffNote.trim() || '(kosong)'}\n\nPelapor akan otomatis menerima pemberitahuan tindak lanjut ini di aplikasinya.`,
      confirmLabel: 'Ya, Simpan Tindak Lanjut',
      tone: 'primary',
      onConfirm: () => executeStaffUpdate(c.id),
    });
  }

  async function executeStaffUpdate(cid) {
    setSaving(true);
    try {
      const res = await apiFetch(`/api/complaints/${cid}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus, staff_note: staffNote, resolution_photo: resolutionPhoto }),
      });
      setEditingId(null);
      setResolutionPhoto('');
      if (res?.reporter_notification) {
        setLastReplyNotif({ cid, ticket_code: res.item?.ticket_code, ...res.reporter_notification });
      }
      await fetchNotifications();
      onRefresh();
      onToast && onToast(`Tindak lanjut ${res.item?.ticket_code || ''} disimpan & dikirim ke pelapor.`);
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSaving(false);
      setConfirmState(null);
    }
  }

  async function markAllNotifsRead() {
    try {
      await apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      await fetchNotifications();
      onRefresh();
      onToast && onToast('Semua pemberitahuan ditandai sudah dibaca.');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    }
  }

  function requestRating(c) {
    const r = ratingTarget[c.id] || { stars: 5, text: '' };
    setConfirmState({
      title: `Kirim Penilaian ${r.stars}/5 Bintang?`,
      message: `Untuk penyelesaian tiket ${c.ticket_code}${r.text ? `\nMasukan: "${r.text}"` : ''}`,
      confirmLabel: 'Ya, Kirim Penilaian',
      tone: 'success',
      onConfirm: () => executeSubmitRating(c.id, r),
    });
  }

  async function executeSubmitRating(cid, r) {
    setSaving(true);
    try {
      await apiFetch(`/api/complaints/${cid}`, {
        method: 'PATCH',
        body: JSON.stringify({ parent_rating: r.stars, parent_feedback: r.text || '' }),
      });
      onRefresh();
      onToast && onToast('Terima kasih! Penilaian kepuasan Anda telah tercatat.');
    } catch (err) {
      onToast && onToast(err.message, 'error');
    } finally {
      setSaving(false);
      setConfirmState(null);
    }
  }

  return (
    <div className="space-y-3">
      {guestTicketCard}
      {/* Sub-Tab Switcher untuk Pelapor: Tiket Pengaduan vs Form Penilaian App & Respon Sekolah */}
      {!isStaff && (
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 grid grid-cols-2 gap-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setSubTab('tickets')}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition ${
              subTab === 'tickets' ? 'bg-[#0B2D52] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Daftar Tiket ({complaints.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('evaluation')}
            className={`py-2 px-3 rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
              subTab === 'evaluation' ? 'bg-[#0B2D52] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" /> Nilai App & Respon Sekolah
          </button>
        </div>
      )}

      {!isStaff && subTab === 'evaluation' ? (
        <EvaluationPanel
          user={user}
          school={school}
          complaints={complaints}
          onToast={onToast}
          onSubmitted={onRefresh}
        />
      ) : (
        <>
        {isStaff && (
        <div className="space-y-2">
          {(slaSummary.sla_overdue_count > 0 || slaSummary.sla_warning_count > 0 || slaSummary.sla_unresponded_count > 0) && (
            <div
              className={`rounded-2xl p-3 border flex items-center justify-between gap-2 flex-wrap ${
                slaSummary.sla_overdue_count > 0
                  ? 'bg-rose-50 border-rose-300 text-rose-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    slaSummary.sla_overdue_count > 0 ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <div className="text-[11px]">
                  <p className="font-extrabold">
                    Alarm Pengawasan SLA ≤ {slaHours} Jam (PEKPPP Aspek 05)
                  </p>
                  <p className="mt-0.5">
                    {slaSummary.sla_overdue_count > 0 && (
                      <strong className="text-rose-700">{slaSummary.sla_overdue_count} aduan melewati batas {slaHours} jam! </strong>
                    )}
                    {slaSummary.sla_warning_count > 0 && (
                      <span>{slaSummary.sla_warning_count} aduan mendekati batas waktu. </span>
                    )}
                    {slaSummary.sla_unresponded_count > 0 && (
                      <span>{slaSummary.sla_unresponded_count} aduan masih berstatus Diterima.</span>
                    )}
                  </p>
                </div>
              </div>
              {slaSummary.sla_overdue_count > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterStatus('Melewati SLA')}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-extrabold shrink-0"
                >
                  Filter Lewat SLA ({slaSummary.sla_overdue_count})
                </button>
              )}
            </div>
          )}

          <div className="bg-gradient-to-r from-cyan-900 to-[#0B2D52] text-white rounded-2xl p-3.5 flex items-center justify-between gap-2 flex-wrap">
            <div>
              <p className="text-xs font-bold">Panel Pengelola PEKPPP & Alert Tim Sekolah</p>
              <p className="text-[11px] text-cyan-100">Ekspor Monev (05B/06B) & teruskan alert WhatsApp ke tim piket.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNotifs(!showNotifs)}
                className="px-3 py-2 rounded-xl bg-white/15 border border-white/25 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Bell className="w-3.5 h-3.5" /> Alert ({notifLogs.length})
              </button>
              <button
                onClick={() => setMonevOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-white text-[#0B2D52] text-xs font-extrabold flex items-center gap-1.5"
              >
                <FileDown className="w-4 h-4" /> Ekspor Monev
              </button>
            </div>
          </div>

          {showNotifs && (
            <div className="bg-white rounded-2xl p-3 border border-cyan-200 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#0B2D52]">
                  Riwayat Notifikasi Masuk {unreadCount > 0 ? `(${unreadCount} Baru)` : '(WhatsApp & Email Sekolah)'}
                </p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={markAllNotifsRead}
                    className="px-2.5 py-1 rounded-xl bg-emerald-700 text-white text-[10px] font-bold"
                  >
                    Tandai Dibaca
                  </button>
                )}
              </div>
              {notifLogs.length === 0 ? (
                <p className="text-[11px] text-slate-500">Belum ada log notifikasi baru pada sesi ini.</p>
              ) : (
                notifLogs.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl p-2.5 border flex items-center justify-between gap-2 text-[11px] ${
                      n.is_read ? 'bg-slate-50 border-slate-200' : 'bg-cyan-50/70 border-cyan-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 truncate">{n.summary}</p>
                      <p className="text-slate-500">Tujuan: {n.recipient} · Status: {n.status}</p>
                    </div>
                    {n.wa_link && (
                      <a
                        href={n.wa_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1 shrink-0"
                      >
                        <MessageCircle className="w-3 h-3" /> Kirim WA
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {!isStaff && notifLogs.length > 0 && (
        <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 rounded-3xl p-4 border border-emerald-200 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-700" />
              <p className="text-xs font-extrabold text-emerald-950">
                Pemberitahuan Tindak Lanjut Sekolah {unreadCount > 0 ? `(${unreadCount} Baru)` : ''}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllNotifsRead}
                className="px-2.5 py-1 rounded-xl bg-emerald-700 text-white text-[10px] font-bold"
              >
                Tandai Dibaca
              </button>
            )}
          </div>
          <div className="space-y-2">
            {notifLogs.slice(0, 5).map((n) => (
              <div
                key={n.id}
                className={`rounded-2xl p-2.5 border text-xs ${
                  n.is_read ? 'bg-white/75 border-slate-200 text-slate-600' : 'bg-white border-emerald-400 text-slate-900 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-[#0B2D52]">{n.summary}</span>
                  {!n.is_read && <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-bold">BARU</span>}
                </div>
                {n.staff_note_snapshot && <p className="text-[11px] mt-1">{n.staff_note_snapshot}</p>}
                <p className="text-[10px] text-slate-400 mt-1">{n.created_at}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {isStaff && lastReplyNotif && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-extrabold text-emerald-950">
                Pemberitahuan Tindak Lanjut Terkirim ({lastReplyNotif.ticket_code})
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                {lastReplyNotif.is_anonymous_protected
                  ? 'Notifikasi otomatis masuk ke Kotak Masuk Aplikasi Pelapor. Identitas pelapor tetap anonim sesuai UU PDP.'
                  : `Notifikasi kotak masuk aplikasi pelapor sudah diperbarui (${lastReplyNotif.recipient}).`}
              </p>
            </div>
            <button onClick={() => setLastReplyNotif(null)} className="text-emerald-700 font-bold text-[11px]">
              Tutup
            </button>
          </div>
          {!lastReplyNotif.is_anonymous_protected && (lastReplyNotif.wa_link || lastReplyNotif.mailto_link) && (
            <div className="flex flex-wrap gap-2">
              {lastReplyNotif.wa_link && (
                <a
                  href={lastReplyNotif.wa_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Kabari Pelapor via WhatsApp
                </a>
              )}
              {lastReplyNotif.mailto_link && (
                <a
                  href={lastReplyNotif.mailto_link}
                  className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white text-[11px] font-bold flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" /> Kabari Pelapor via Email
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl p-3 border border-slate-200 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari kode tiket (misal ADU-MONSA-0001) atau isi aduan..."
              className="flex-1 bg-transparent text-xs focus:outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-slate-400 hover:text-slate-600" aria-label="Hapus pencarian">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              fetchNotifications();
              onRefresh();
              onToast && onToast('Data pengaduan diperbarui.');
            }}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
            title="Muat ulang daftar pengaduan"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {['Semua', 'Melewati SLA', 'Sedang Diproses', 'Prioritas Rentan', ...STATUS_STEPS].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap border ${
                filterStatus === st
                  ? st === 'Melewati SLA'
                    ? 'bg-rose-700 text-white border-rose-700'
                    : 'bg-[#0B2D52] text-white border-[#0B2D52]'
                  : st === 'Melewati SLA' && slaSummary.sla_overdue_count > 0
                    ? 'bg-rose-50 text-rose-700 border-rose-300'
                    : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {st}{st === 'Melewati SLA' && slaSummary.sla_overdue_count > 0 ? ` (${slaSummary.sla_overdue_count})` : ''}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-2.5">
          <FileText className="w-9 h-9 text-slate-300 mx-auto" />
          <p className="font-bold text-sm text-slate-700">Belum Ada Pengaduan pada Filter Ini</p>
          <p className="text-xs text-slate-500">
            {isStaff
              ? 'Belum ada laporan yang cocok dengan filter status/pencarian ini.'
              : 'Anda belum memiliki laporan pada filter ini. Gunakan tab Lapor untuk mengirim aduan resmi ke sekolah.'}
          </p>
          <div className="flex justify-center gap-2 pt-1">
            {(filterStatus !== 'Semua' || query) && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus('Semua');
                  setQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Tampilkan Semua
              </button>
            )}
            {!isStaff && onGoLapor && (
              <button type="button" onClick={onGoLapor} className="px-4 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold">
                + Buat Pengaduan
              </button>
            )}
          </div>
        </div>
      ) : (
        filtered.map((c) => {
          const stepIndex = Math.max(0, STATUS_STEPS.indexOf(c.status));
          const rState = ratingTarget[c.id] || { stars: c.parent_rating || 5, text: c.parent_feedback || '' };
          const isPriorityRentan = Boolean(c.needs_priority_assistance) || (c.vulnerable_group && c.vulnerable_group !== 'Umum (Bukan Kelompok Rentan)');
          const sla = computeComplaintSla(c, slaHours, nowTick);
          const slaBadgeClass =
            sla.sla_state === 'terlambat'
              ? 'bg-rose-100 text-rose-800 border-rose-300'
              : sla.sla_state === 'kritis'
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : sla.sla_state === 'selesai_tepat_waktu'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : sla.sla_state === 'selesai_lewat_sla'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-cyan-50 text-cyan-900 border-cyan-200';

          return (
            <div key={c.id} className={`bg-white rounded-3xl p-4 border shadow-xs space-y-3 ${sla.sla_state === 'terlambat' ? 'border-rose-400 ring-1 ring-rose-100' : isPriorityRentan ? 'border-cyan-400 ring-1 ring-cyan-100' : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-extrabold text-[#0B2D52]">{c.ticket_code}</span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${STATUS_STYLE[c.status] || 'bg-slate-100'}`}>
                      {c.status}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {c.urgency}
                    </span>
                    {c.child_mode ? (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                        🚨 DARURAT MODE ANAK
                      </span>
                    ) : null}
                    {isPriorityRentan && (
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-cyan-100 text-cyan-900 border border-cyan-300 flex items-center gap-1">
                        <Accessibility className="w-3 h-3" /> PRIORITAS INKLUSI
                      </span>
                    )}
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${slaBadgeClass}`}>
                      {sla.sla_state === 'terlambat' ? <AlertTriangle className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                      {sla.badge_text}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 mt-1.5">{c.category}</p>
                  {c.vulnerable_group && (
                    <p className="text-[11px] font-semibold text-cyan-800 mt-0.5">Kelompok Prioritas: {c.vulnerable_group}</p>
                  )}
                  {c.disability_type && (
                    <p className="text-[11px] font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1 mt-1">
                      Kebutuhan Khusus: {DISABILITY_TYPES.find((d) => d.id === c.disability_type)?.label || c.disability_type}
                      {isStaff ? ` — Panduan: ${DISABILITY_TYPES.find((d) => d.id === c.disability_type)?.guidance || ''}` : ''}
                      {c.special_need_note ? ` (${c.special_need_note})` : ''}
                    </p>
                  )}
                  {c.impact_tags && (
                    <p className="text-[10px] font-bold text-rose-800 mt-0.5">Dampak Anak: {c.impact_tags}</p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{(c.created_at || '').slice(0, 10)}</span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 rounded-2xl p-3 border border-slate-100">
                {c.description}
              </p>

              {c.audio_evidence && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-2.5">
                  <p className="text-[10px] font-bold text-amber-950 mb-1">Lampiran Pesan Suara (Voice Note Pelapor):</p>
                  <audio controls src={c.audio_evidence} className="w-full h-8" />
                </div>
              )}

              {(c.photo_data || c.resolution_photo) && (
                <div className={`grid gap-2 ${c.photo_data && c.resolution_photo ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                  {c.photo_data && (
                    <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-2xl border border-slate-200">
                      <button type="button" onClick={() => setZoomPhoto(c.photo_data)} className="shrink-0">
                        <img src={c.photo_data} alt="Foto awal pelapor" className="w-16 h-16 object-cover rounded-xl border border-slate-300" />
                      </button>
                      <div className="text-[11px] text-slate-600">
                        <p className="font-bold text-slate-800 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-cyan-700" /> Foto Awal (Sebelum)
                        </p>
                        <button type="button" onClick={() => setZoomPhoto(c.photo_data)} className="text-cyan-800 font-semibold hover:underline">
                          Ketuk untuk memperbesar
                        </button>
                      </div>
                    </div>
                  )}
                  {c.resolution_photo && (
                    <div className="flex items-center gap-2.5 bg-emerald-50 p-2 rounded-2xl border border-emerald-200">
                      <button type="button" onClick={() => setZoomPhoto(c.resolution_photo)} className="shrink-0">
                        <img src={c.resolution_photo} alt="Foto bukti penanganan sekolah" className="w-16 h-16 object-cover rounded-xl border border-emerald-300" />
                      </button>
                      <div className="text-[11px] text-emerald-900">
                        <p className="font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Bukti Penanganan (Sesudah)
                        </p>
                        <button type="button" onClick={() => setZoomPhoto(c.resolution_photo)} className="text-emerald-800 font-semibold hover:underline">
                          Ketuk untuk memperbesar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-1 pt-1">
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} className="text-center">
                    <div className={`h-1.5 rounded-full ${i <= stepIndex ? 'bg-emerald-600' : 'bg-slate-200'}`} />
                    <p className={`text-[9px] mt-1 font-medium leading-tight ${i <= stepIndex ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                <span>Pelapor: <strong className="text-slate-700">{c.reporter_display_name}</strong></span>
                <span>Unit: <strong className="text-slate-700">{c.routed_to}</strong></span>
                {c.location_detail && <span>Lokasi: <strong className="text-slate-700">{c.location_detail}</strong></span>}
              </div>

              {c.staff_note && (
                <div className="bg-cyan-50/80 border border-cyan-200 rounded-2xl p-3 text-xs text-cyan-950">
                  <p className="font-bold text-[11px] flex items-center gap-1 mb-0.5">
                    <Shield className="w-3.5 h-3.5 text-cyan-700" /> Tanggapan Resmi Sekolah:
                  </p>
                  <p>{c.staff_note}</p>
                </div>
              )}

              {isStaff && (
                <div className="pt-2 border-t border-slate-100">
                  {editingId === c.id ? (
                    <div className="space-y-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <select
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white"
                      >
                        {STATUS_STEPS.map((st) => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                      <textarea
                        rows={2}
                        value={staffNote}
                        onChange={(e) => setStaffNote(e.target.value)}
                        placeholder="Tulis catatan tindak lanjut Tim TPPK / Kepala Sekolah..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs bg-white"
                      />
                      <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                            <Camera className="w-3.5 h-3.5 text-emerald-700" /> Foto Bukti Penanganan (Sesudah)
                          </span>
                          <label className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold cursor-pointer hover:bg-emerald-100">
                            Pilih Foto
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (!file) return;
                                try {
                                  const comp = await compressResolutionPhoto(file);
                                  setResolutionPhoto(comp);
                                  onToast && onToast('Foto bukti penanganan siap dilampirkan.');
                                } catch (err) {
                                  onToast && onToast(err.message, 'error');
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                        {resolutionPhoto && (
                          <div className="flex items-center justify-between gap-2">
                            <img src={resolutionPhoto} alt="Pratinjau foto sesudah" className="w-12 h-12 object-cover rounded-lg border border-emerald-300" />
                            <button
                              type="button"
                              onClick={() => setResolutionPhoto('')}
                              className="text-[11px] font-bold text-rose-600 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Hapus
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => requestStaffUpdate(c)}
                          disabled={saving}
                          className="px-4 py-1.5 rounded-xl bg-[#0B2D52] text-white text-xs font-bold"
                        >
                          Simpan Tindak Lanjut
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(null);
                            setResolutionPhoto('');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(c.id);
                        setNextStatus(c.status);
                        setStaffNote(c.staff_note || '');
                        setResolutionPhoto(c.resolution_photo || '');
                      }}
                      className="text-xs font-bold text-[#0B2D52] hover:underline"
                    >
                      + Perbarui Status / Tanggapan / Foto Sesudah
                    </button>
                  )}
                </div>
              )}

              {c.status === 'Selesai' && !isStaff && (
                <div className="pt-2 border-t border-slate-100">
                  {c.parent_rating > 0 ? (
                    <div className="text-xs text-emerald-700 flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      Penilaian Anda (Masukan Inovasi SIMPEL): {c.parent_rating}/5 Bintang {c.parent_feedback ? `— "${c.parent_feedback}"` : ''}
                    </div>
                  ) : (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3 space-y-2">
                      <p className="text-xs font-bold text-amber-900">Beri Penilaian Penyelesaian Sekolah (Survei Kepuasan SIMPEL/SKM)</p>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <button
                            key={s}
                            type="button"
                            aria-label={`Beri ${s} bintang`}
                            onClick={() => setRatingTarget({ ...ratingTarget, [c.id]: { ...rState, stars: s } })}
                          >
                            <Star
                              className={`w-5 h-5 ${s <= rState.stars ? 'text-amber-500 fill-amber-400' : 'text-slate-300'}`}
                            />
                          </button>
                        ))}
                        <span className="ml-2 text-[11px] font-bold text-amber-900">{rState.stars}/5</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={rState.text}
                          onChange={(e) => setRatingTarget({ ...ratingTarget, [c.id]: { ...rState, text: e.target.value } })}
                          placeholder="Masukan singkat untuk peningkatan layanan (opsional)"
                          className="flex-1 rounded-xl border border-amber-200 px-3 py-1.5 text-xs bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => requestRating(c)}
                          disabled={saving}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-bold"
                        >
                          Kirim
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      {zoomPhoto && (
        <ModalShell
          onClose={() => setZoomPhoto('')}
          label="Foto bukti pengaduan"
          backdropClassName="bg-slate-950/80 flex items-center justify-center p-4"
          panelClassName="relative max-w-xl w-full"
        >
            <button
              type="button"
              onClick={() => setZoomPhoto('')}
              className="absolute -top-10 right-0 text-white bg-white/20 rounded-full p-1.5"
              aria-label="Tutup foto bukti pengaduan"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={zoomPhoto} alt="Foto bukti pengaduan" className="w-full max-h-[80vh] object-contain rounded-2xl bg-black" />
        </ModalShell>
      )}

      <MonevReportModal open={monevOpen} onClose={() => setMonevOpen(false)} school={school} onToast={onToast} />
        </>
      )}

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        loading={saving}
        onConfirm={() => confirmState?.onConfirm && confirmState.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
