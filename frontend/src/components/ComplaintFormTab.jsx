import { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  Send,
  WifiOff,
  CheckCircle2,
  AlertTriangle,
  Accessibility,
  Camera,
  Trash2,
  MessageCircle,
  Mail,
  ClipboardList,
  Mic,
  MicOff,
  KeyRound,
  Copy,
  UserCircle2,
  Siren,
  Baby,
  Square,
  AudioLines,
  Link2,
} from 'lucide-react';
import { apiFetch, pushOfflineQueue } from '../api';
import {
  CHILD_IMPACTS,
  CHILD_LOCATIONS,
  CHILD_MODE_ISSUES,
  COMPLAINT_CATEGORIES,
  DISABILITY_TYPES,
  URGENCIES,
  VULNERABLE_GROUPS,
} from '../constants';
import { ConfirmModal } from './ConfirmModal';
import QrCodeSvg from './QrCodeSvg';
import { isSttSupported, startDictation } from '../utils/speech';
import { tLabel } from '../utils/i18n';

function compressImageToDataUrl(file) {
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
        reject(new Error('Ukuran foto masih terlalu besar (>900 KB) setelah kompresi. Gunakan foto yang lebih kecil.'));
      };
      img.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

function buildGuestTrackUrl(ticketCode, pin) {
  if (typeof window === 'undefined') return `?tiket=${encodeURIComponent(ticketCode)}&pin=${encodeURIComponent(pin)}`;
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?tiket=${encodeURIComponent(ticketCode)}&pin=${encodeURIComponent(pin)}`;
}

export default function ComplaintFormTab({
  user,
  school,
  lang = 'id',
  isOnline,
  presetCategory,
  presetRentan,
  onClearPreset,
  onToast,
  onGoTrack,
  onOpenGuestLink,
  onCreated,
  onNeedAuth,
}) {
  const [category, setCategory] = useState(COMPLAINT_CATEGORIES[0].id);
  const [urgency, setUrgency] = useState('Penting');
  const [vulnerableGroup, setVulnerableGroup] = useState(VULNERABLE_GROUPS[0].id);
  const [needsPriorityAssistance, setNeedsPriorityAssistance] = useState(false);
  const [disabilityType, setDisabilityType] = useState('');
  const [specialNeedNote, setSpecialNeedNote] = useState('');

  // Mode Anak & Darurat TPPK
  const [childMode, setChildMode] = useState(false);
  const [childIssue, setChildIssue] = useState(CHILD_MODE_ISSUES[0]);
  const [childImpacts, setChildImpacts] = useState([]);
  const [childLocation, setChildLocation] = useState(CHILD_LOCATIONS[0]);

  const [locationDetail, setLocationDetail] = useState('');
  const [studentInfo, setStudentInfo] = useState('');
  const [description, setDescription] = useState('');
  const [photoData, setPhotoData] = useState('');
  const [photoName, setPhotoName] = useState('');

  // Voice Note (Audio Evidence)
  const [audioEvidence, setAudioEvidence] = useState('');
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const mediaRecRef = useRef(null);
  const recTimerRef = useRef(null);
  const recChunksRef = useRef([]);

  const [isAnonymous, setIsAnonymous] = useState(true);
  const [guestReporterName, setGuestReporterName] = useState('');
  const [guestReceipt, setGuestReceipt] = useState(null);
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmState, setConfirmState] = useState(null);

  useEffect(() => {
    if (presetCategory) {
      setCategory(presetCategory);
    }
    if (presetRentan) {
      setVulnerableGroup(VULNERABLE_GROUPS[1].id);
      setNeedsPriorityAssistance(true);
    }
    if ((presetCategory || presetRentan) && onClearPreset) {
      onClearPreset();
    }
  }, [presetCategory, presetRentan]);

  useEffect(() => {
    return () => {
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
        mediaRecRef.current.stop();
      }
    };
  }, []);

  const isGuestMode = !user;

  function saveGuestTicketLocal(code, pin, cat) {
    try {
      const prev = JSON.parse(localStorage.getItem('monsa_guest_tickets') || '[]');
      const next = [{ ticket_code: code, pin, category: cat, saved_at: new Date().toLocaleDateString('id-ID') }, ...prev].slice(0, 10);
      localStorage.setItem('monsa_guest_tickets', JSON.stringify(next));
    } catch {
      // ignore storage quota
    }
  }

  function handleDictation() {
    if (listening) return;
    setListening(true);
    startDictation({
      onResult: (text) => {
        setDescription((prev) => (prev ? `${prev.trim()} ${text}` : text));
        onToast && onToast('Suara berhasil diubah menjadi teks.');
      },
      onError: (msg) => {
        onToast && onToast(msg, 'error');
      },
      onEnd: () => setListening(false),
    });
  }

  async function startVoiceNote() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onToast && onToast('Perekam suara (MediaRecorder) tidak didukung di browser/perangkat ini.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
        : new MediaRecorder(stream);
      recChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) clearInterval(recTimerRef.current);
        setRecordingAudio(false);
        const blob = new Blob(recChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        if (blob.size > 520000) {
          onToast && onToast('Rekaman suara terlalu panjang (>500 KB). Mohon rekam lebih singkat (maks 35 detik).', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = String(reader.result || '');
          if (dataUrl.length > 740000) {
            onToast && onToast('Ukuran pesan suara melebihi batas 700 KB setelah dikodekan. Mohon rekam lebih singkat.', 'error');
            return;
          }
          setAudioEvidence(dataUrl);
          onToast && onToast('Pesan suara (Voice Note) siap dilampirkan!');
        };
        reader.readAsDataURL(blob);
      };
      mediaRecRef.current = recorder;
      recorder.start();
      setRecordingAudio(true);
      setRecordSeconds(0);
      recTimerRef.current = setInterval(() => {
        setRecordSeconds((s) => {
          if (s + 1 >= 35) {
            recorder.stop();
            return 35;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      onToast && onToast('Izin mikrofon ditolak atau tidak tersedia di perangkat ini.', 'error');
    }
  }

  function stopVoiceNote() {
    if (mediaRecRef.current && mediaRecRef.current.state === 'recording') {
      mediaRecRef.current.stop();
    }
  }

  async function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const compressed = await compressImageToDataUrl(file);
      setPhotoData(compressed);
      setPhotoName(file.name);
      onToast && onToast('Foto bukti siap dilampirkan.');
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    }
  }

  function toggleChildImpact(id) {
    setChildImpacts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleChildEmergencySubmit() {
    if (isGuestMode && !isOnline) {
      setFeedback({ type: 'error', text: 'Tombol Darurat Tanpa Akun butuh internet. Atau masuk di tab Akun untuk antrean offline.' });
      return;
    }
    const impactLabels = CHILD_IMPACTS.filter((im) => childImpacts.includes(im.id)).map((im) => im.label);
    const autoDesc =
      `[LAPOR DARURAT MODE ANAK] Kejadian: ${childIssue.id}. Lokasi: ${childLocation}.` +
      (impactLabels.length ? ` Dampak/Perasaan: ${impactLabels.join(', ')}.` : '') +
      (description.trim() ? ` Cerita tambahan: ${description.trim()}` : '');

    executeSubmit({
      category: childIssue.category,
      urgency: childIssue.urgency,
      vulnerable_group: 'Anak-Anak Membutuhkan Pendampingan Khusus',
      needs_priority_assistance: true,
      disability_type: disabilityType,
      special_need_note: specialNeedNote.trim(),
      child_mode: true,
      impact_tags: childImpacts,
      location_detail: childLocation,
      student_info: studentInfo || 'Pelapor Anak (Mode Ramah Siswa)',
      description: autoDesc,
      photo_data: photoData,
      audio_evidence: audioEvidence,
      is_anonymous: isAnonymous,
      ...(isGuestMode && !isAnonymous ? { reporter_name: guestReporterName.trim() } : {}),
    });
  }

  function requestSubmit(e) {
    e.preventDefault();
    if (!description.trim() && !audioEvidence) {
      setFeedback({ type: 'error', text: 'Mohon isi uraian kejadian atau rekam pesan suara terlebih dahulu.' });
      onToast && onToast('Isi uraian kejadian atau rekam pesan suara.', 'error');
      return;
    }
    const isVulnerableSelected = vulnerableGroup !== VULNERABLE_GROUPS[0].id;
    const isPriority = needsPriorityAssistance || isVulnerableSelected || Boolean(disabilityType);
    if (isGuestMode && !isOnline) {
      setFeedback({ type: 'error', text: 'Lapor Cepat Tanpa Akun memerlukan koneksi internet agar server dapat menerbitkan PIN 6-digit. Silakan masuk di tab Akun untuk antrean offline.' });
      return;
    }
    setConfirmState({
      title: isGuestMode ? 'Kirim Lapor Cepat Tanpa Akun?' : isOnline ? 'Konfirmasi Kirim Pengaduan' : 'Simpan Laporan Offline?',
      message:
        `Kategori: ${category}\n` +
        `Urgensi: ${urgency}${isPriority ? ' (Jalur Prioritas Inklusi/Rentan)' : ''}\n` +
        `Identitas: ${isAnonymous ? 'Anonim (Dilindungi UU PDP)' : isGuestMode ? (guestReporterName.trim() || 'Warga Sekolah (Lapor Cepat)') : user.full_name}\n\n` +
        `${isGuestMode ? 'Setelah terkirim, Anda akan menerima Kode Tiket, PIN 6-Digit, & QR Lacak 1-Klik.' : isOnline ? 'Pastikan data sudah benar sebelum dikirim ke sekolah.' : 'Perangkat offline: laporan disimpan lokal dan otomatis dikirim saat online.'}`,
      confirmLabel: isOnline ? 'Ya, Kirim Pengaduan' : 'Ya, Simpan Offline',
      tone: 'primary',
      onConfirm: () => executeSubmit(),
    });
  }

  async function executeSubmit(overridePayload = null) {
    const isVulnerableSelected = vulnerableGroup !== VULNERABLE_GROUPS[0].id;
    const payload = overridePayload || {
      category,
      urgency,
      vulnerable_group: isVulnerableSelected ? vulnerableGroup : '',
      needs_priority_assistance: needsPriorityAssistance || isVulnerableSelected || Boolean(disabilityType),
      disability_type: disabilityType,
      special_need_note: specialNeedNote.trim(),
      child_mode: childMode,
      impact_tags: childImpacts,
      location_detail: locationDetail,
      student_info: studentInfo,
      description: description.trim() || '[Lampiran Pesan Suara Pelapor]',
      photo_data: photoData,
      audio_evidence: audioEvidence,
      is_anonymous: isAnonymous,
      ...(isGuestMode && !isAnonymous ? { reporter_name: guestReporterName.trim() } : {}),
    };

    if (!isOnline && !isGuestMode) {
      pushOfflineQueue(payload);
      setDescription('');
      setLocationDetail('');
      setStudentInfo('');
      setPhotoData('');
      setPhotoName('');
      setAudioEvidence('');
      setDisabilityType('');
      setSpecialNeedNote('');
      setChildImpacts([]);
      setVulnerableGroup(VULNERABLE_GROUPS[0].id);
      setNeedsPriorityAssistance(false);
      setConfirmState(null);
      setFeedback({
        type: 'offline',
        text: 'Perangkat sedang offline. Laporan (termasuk foto & suara) disimpan di Antrean Lokal dan otomatis terkirim saat sinyal kembali.',
      });
      onToast && onToast('Laporan tersimpan di antrean offline.', 'success');
      onCreated && onCreated();
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    setGuestReceipt(null);
    try {
      const endpoint = isGuestMode ? '/api/complaints/guest' : '/api/complaints';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setDescription('');
      setLocationDetail('');
      setStudentInfo('');
      setPhotoData('');
      setPhotoName('');
      setAudioEvidence('');
      setDisabilityType('');
      setSpecialNeedNote('');
      setChildImpacts([]);
      setGuestReporterName('');
      setVulnerableGroup(VULNERABLE_GROUPS[0].id);
      setNeedsPriorityAssistance(false);
      if (isGuestMode && res.guest_pin) {
        const code = res.guest_ticket_code || res.item.ticket_code;
        saveGuestTicketLocal(code, res.guest_pin, res.item.category);
        setGuestReceipt({
          ticket_code: code,
          pin: res.guest_pin,
          routed_to: res.item.routed_to,
          track_url: buildGuestTrackUrl(code, res.guest_pin),
        });
      }
      setFeedback({
        type: 'success',
        text: `Laporan terkirim! Kode Tiket: ${res.item.ticket_code} (Diteruskan ke ${res.item.routed_to}).`,
        notification: res.notification || null,
      });
      onToast && onToast(`Pengaduan ${res.item.ticket_code} berhasil dikirim!`);
      onCreated && onCreated(res.item);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setSubmitting(false);
      setConfirmState(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-[#0B2D52] to-[#0E7490] rounded-3xl p-4 text-white space-y-2.5">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-cyan-200 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-sm">
              {tLabel(lang, 'formHeading')} — {school?.short_name || 'SDN Unggulan Mongisidi 1'}
            </h2>
            <p className="text-[11px] text-cyan-100 mt-1 leading-relaxed">
              Terintegrasi dengan standar PEKPPP Aspek 05 & Pelayanan Ramah Kelompok Rentan (Perwali Makassar No. 68/2021). Target respons maksimal {school?.sla_hours || 24} jam.
            </p>
          </div>
        </div>
        {isGuestMode && (
          <div className="bg-white/15 border border-white/25 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="font-bold text-cyan-100 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 shrink-0" /> Mode Lapor Cepat Tanpa Akun aktif — langsung dapat QR Tiket & PIN 6-Digit!
            </span>
            <button
              type="button"
              onClick={onNeedAuth}
              className="px-2.5 py-1 rounded-xl bg-white text-[#0B2D52] font-extrabold text-[10px] inline-flex items-center gap-1"
            >
              <UserCircle2 className="w-3.5 h-3.5" /> Masuk Akun
            </button>
          </div>
        )}
      </div>

      {/* Mode Anak & Tombol Lapor Darurat TPPK 1-Ketuk */}
      <div className={`rounded-3xl p-4 border-2 transition space-y-3 ${childMode ? 'bg-rose-50 border-rose-300' : 'bg-white border-rose-200'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0">
              <Siren className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-rose-950 flex items-center gap-1.5">
                {tLabel(lang, 'formUrgentBtn')}
              </h3>
              <p className="text-[11px] text-rose-800">
                Khusus siswa SD atau pelapor darurat perundungan/kekerasan: pilih gambar, perasaan, lokasi, langsung terkirim tanpa mengetik panjang!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setChildMode(!childMode)}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold shrink-0 inline-flex items-center gap-1.5 ${
              childMode ? 'bg-slate-800 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'
            }`}
          >
            <Baby className="w-4 h-4" /> {childMode ? 'Kembali Form Biasa' : 'Buka Mode Anak'}
          </button>
        </div>

        {childMode && (
          <div className="bg-white rounded-2xl p-3.5 border border-rose-200 space-y-3 text-xs">
            <div>
              <p className="font-extrabold text-slate-900 mb-2">1. Apa yang terjadi hari ini? (Sentuh satu kartu)</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {CHILD_MODE_ISSUES.map((ci) => (
                  <button
                    type="button"
                    key={ci.id}
                    onClick={() => setChildIssue(ci)}
                    className={`p-3 rounded-2xl border text-left transition ${
                      childIssue.id === ci.id
                        ? 'bg-rose-50 border-rose-600 ring-2 ring-rose-500'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xl block mb-1">{ci.emoji}</span>
                    <span className="font-extrabold text-[11px] text-slate-900 leading-snug block">{ci.id}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-extrabold text-slate-900 mb-1.5">2. Bagaimana perasaanmu sekarang? (Boleh pilih lebih dari satu)</p>
              <div className="flex flex-wrap gap-1.5">
                {CHILD_IMPACTS.map((im) => {
                  const active = childImpacts.includes(im.id);
                  return (
                    <button
                      type="button"
                      key={im.id}
                      onClick={() => toggleChildImpact(im.id)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                        active ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {im.emoji} {im.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="font-extrabold text-slate-900 mb-1.5">3. Di mana kejadiannya?</p>
              <div className="flex flex-wrap gap-1.5">
                {CHILD_LOCATIONS.map((loc) => (
                  <button
                    type="button"
                    key={loc}
                    onClick={() => setChildLocation(loc)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border ${
                      childLocation === loc ? 'bg-[#0B2D52] text-white border-[#0B2D52]' : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={submitting}
              onClick={handleChildEmergencySubmit}
              className="w-full py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md"
            >
              <Siren className="w-4 h-4" />
              {submitting ? 'MENGIRIM SINYAL DARURAT...' : 'KIRIM DARURAT KE TIM TPPK SEKARANG (1-KETUK)'}
            </button>
          </div>
        )}
      </div>

      {/* Kartu Resi Lapor Cepat + QR Code + Tautan 1-Klik */}
      {guestReceipt && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 space-y-3 text-xs">
          <p className="font-extrabold text-amber-950 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4 text-amber-700" /> Kartu Lacak Cepat (Tiket, PIN & QR Code 1-Klik)
          </p>
          <p className="text-[11px] text-amber-900">
            Simpan kartu ini atau kirim ke WhatsApp pribadi Anda. Pindai QR atau klik tautannya kapan saja untuk langsung melihat balasan sekolah tanpa mengetik ulang PIN:
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <QrCodeSvg value={guestReceipt.track_url} size={132} />
            <div className="flex-1 w-full space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-2xl p-2.5 border border-amber-200 text-center">
                  <p className="text-[10px] font-bold text-slate-500">KODE TIKET</p>
                  <p className="text-sm font-black font-mono text-[#0B2D52] mt-0.5">{guestReceipt.ticket_code}</p>
                </div>
                <div className="bg-white rounded-2xl p-2.5 border border-amber-200 text-center">
                  <p className="text-[10px] font-bold text-slate-500">PIN 6-DIGIT</p>
                  <p className="text-sm font-black font-mono text-emerald-700 mt-0.5">{guestReceipt.pin}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(guestReceipt.track_url);
                      onToast && onToast('Tautan Lacak 1-Klik berhasil disalin!');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-950 font-bold text-[11px] inline-flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" /> Salin Tautan 1-Klik
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Kartu Lacak SI-PAKAINGE MONSA\nTiket: ${guestReceipt.ticket_code}\nPIN: ${guestReceipt.pin}\nBuka 1-Klik: ${guestReceipt.track_url}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> Simpan ke WhatsApp Saya
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const txt = `Tiket SI-PAKAINGE MONSA: ${guestReceipt.ticket_code} | PIN: ${guestReceipt.pin}`;
                    if (navigator.clipboard?.writeText) {
                      navigator.clipboard.writeText(txt);
                      onToast && onToast('Kode Tiket & PIN berhasil disalin.');
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-950 font-bold text-[11px] inline-flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" /> Salin PIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenGuestLink) {
                      onOpenGuestLink(guestReceipt.ticket_code, guestReceipt.pin);
                    } else if (onGoTrack) {
                      onGoTrack();
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white font-bold text-[11px] inline-flex items-center gap-1.5"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Cek Balasan Langsung →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-2xl p-3.5 text-xs space-y-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : feedback.type === 'offline'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'offline' ? (
              <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
            ) : feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span className="font-medium leading-relaxed">{feedback.text}</span>
          </div>
          {feedback.notification && (
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={feedback.notification.wa_link}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-xl bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1.5"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Kirim Alert WA ke Guru Piket
              </a>
              <a
                href={feedback.notification.mailto_link}
                className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-900 text-[11px] font-bold flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Kirim Salinan Email Sekolah
              </a>
              {onGoTrack && (
                <button
                  type="button"
                  onClick={onGoTrack}
                  className="px-3 py-1.5 rounded-xl bg-[#0B2D52] text-white text-[11px] font-bold flex items-center gap-1.5"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> Lihat di Tab Pantau →
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <form onSubmit={requestSubmit} className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">1. Pilih Kategori Pengaduan</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMPLAINT_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                className={`text-left p-3 rounded-2xl border transition ${
                  category === cat.id
                    ? 'border-[#0B2D52] bg-cyan-50/70 ring-1 ring-[#0B2D52]'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-bold text-slate-900">{cat.id}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{cat.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Modul Prioritas Kelompok Rentan & Tag Kebutuhan Khusus Disabilitas (LAKSA+) */}
        <div className="bg-cyan-50/70 border border-cyan-200 rounded-2xl p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <Accessibility className="w-4 h-4 text-cyan-800 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-cyan-950">2. Prioritas Disabilitas, Lansia & Sekolah Inklusi (Perwali 68/2021 · LAKSA+)</p>
              <p className="text-[11px] text-cyan-800">
                Penyandang disabilitas, siswa inklusi, lansia, & ibu hamil langsung masuk Antrean Prioritas Inklusi dengan penyesuaian cara respon petugas.
              </p>
            </div>
          </div>

          <select
            value={vulnerableGroup}
            onChange={(e) => {
              const val = e.target.value;
              setVulnerableGroup(val);
              if (val !== VULNERABLE_GROUPS[0].id) setNeedsPriorityAssistance(true);
            }}
            className="w-full rounded-xl border border-cyan-200 px-3 py-2 text-xs bg-white font-medium text-slate-800"
          >
            {VULNERABLE_GROUPS.map((vg) => (
              <option key={vg.id} value={vg.id}>{vg.id} — {vg.desc}</option>
            ))}
          </select>

          <div>
            <p className="text-[11px] font-bold text-cyan-950 mb-1.5">Tag Kebutuhan Khusus (Opsional — Memicu Antrean Prioritas Inklusi):</p>
            <div className="flex flex-wrap gap-1.5">
              {DISABILITY_TYPES.map((dt) => {
                const active = disabilityType === dt.id;
                return (
                  <button
                    type="button"
                    key={dt.id}
                    onClick={() => {
                      const next = active ? '' : dt.id;
                      setDisabilityType(next);
                      if (next) setNeedsPriorityAssistance(true);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition ${
                      active ? 'bg-[#0B2D52] text-white border-[#0B2D52]' : 'bg-white text-cyan-950 border-cyan-200 hover:bg-cyan-100'
                    }`}
                  >
                    {dt.label}
                  </button>
                );
              })}
            </div>
            {disabilityType && (
              <p className="text-[10px] text-emerald-800 font-semibold mt-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-1.5">
                Panduan untuk petugas: {DISABILITY_TYPES.find((d) => d.id === disabilityType)?.guidance}
              </p>
            )}
          </div>

          {(needsPriorityAssistance || disabilityType) && (
            <input
              type="text"
              value={specialNeedNote}
              onChange={(e) => setSpecialNeedNote(e.target.value)}
              placeholder="Catatan kebutuhan pendampingan (mis. balas via WA teks / perlu kursi roda di gerbang)"
              className="w-full rounded-xl border border-cyan-200 px-3 py-1.5 text-xs bg-white"
            />
          )}

          <label className="flex items-center gap-2 text-xs text-cyan-950 font-semibold cursor-pointer">
            <input
              type="checkbox"
              checked={needsPriorityAssistance}
              onChange={(e) => setNeedsPriorityAssistance(e.target.checked)}
              className="rounded border-cyan-400 text-cyan-800"
            />
            Aktifkan Jalur Prioritas Tanpa Antre & Pendampingan Khusus
          </label>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-2">3. Tingkat Mendesak</label>
          <div className="grid grid-cols-3 gap-2">
            {URGENCIES.map((u) => (
              <button
                type="button"
                key={u.id}
                onClick={() => setUrgency(u.id)}
                className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                  urgency === u.id ? u.color + ' ring-2 ring-offset-1 ring-slate-400' : 'bg-white border-slate-200 text-slate-500'
                }`}
              >
                {u.id}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Lokasi / Ruang Kelas (Opsional)</label>
            <input
              type="text"
              value={locationDetail}
              onChange={(e) => setLocationDetail(e.target.value)}
              placeholder="Contoh: Kelas 4B, Toilet Disabilitas, Loket TU"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Kelas / Info Siswa (Opsional)</label>
            <input
              type="text"
              value={studentInfo}
              onChange={(e) => setStudentInfo(e.target.value)}
              placeholder="Contoh: Kelas 3A (atau kosongkan)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600"
            />
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <label className="block text-xs font-bold text-slate-700">4. Ceritakan Kejadian atau Rekam Pesan Suara</label>
            <div className="flex flex-wrap gap-1.5">
              {isSttSupported() && (
                <button
                  type="button"
                  onClick={handleDictation}
                  disabled={listening}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 ${
                    listening
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-cyan-50 hover:bg-cyan-100 text-[#0B2D52] border border-cyan-200'
                  }`}
                >
                  {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  {listening ? 'Mendengarkan...' : 'Dikte Suara → Teks'}
                </button>
              )}
              {!recordingAudio ? (
                <button
                  type="button"
                  onClick={startVoiceNote}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300"
                >
                  <AudioLines className="w-3.5 h-3.5" /> Rekam Voice Note
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopVoiceNote}
                  className="px-2.5 py-1 rounded-xl text-[11px] font-bold inline-flex items-center gap-1 bg-rose-600 text-white animate-pulse"
                >
                  <Square className="w-3 h-3" /> Stop ({recordSeconds}d / 35d)
                </button>
              )}
            </div>
          </div>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tuliskan kronologi, atau gunakan Dikte Suara / Rekam Voice Note jika lebih nyaman berbicara..."
            className="w-full rounded-2xl border border-slate-200 px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-600"
          />
          {audioEvidence && (
            <div className="mt-2 bg-amber-50 border border-amber-200 rounded-2xl p-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex-1 min-w-[180px]">
                <p className="text-[10px] font-bold text-amber-950 mb-1">Lampiran Pesan Suara (Voice Note) Siap Dikirim:</p>
                <audio controls src={audioEvidence} className="w-full h-8" />
              </div>
              <button
                type="button"
                onClick={() => setAudioEvidence('')}
                className="p-2 rounded-xl text-rose-700 hover:bg-rose-100"
                aria-label="Hapus pesan suara"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Unggah Foto Bukti (Opsional, Kompresi Otomatis di Perangkat) */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-cyan-700" /> 5. Lampirkan Foto Bukti (Opsional)
              </p>
              <p className="text-[11px] text-slate-500">
                Cocok untuk laporan fasilitas rusak, kebersihan, atau dokumen. Dikompresi otomatis agar hemat kuota.
              </p>
            </div>
            <label className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer hover:bg-slate-100 shrink-0">
              Pilih Foto / Kamera
              <input type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
            </label>
          </div>
          {photoData && (
            <div className="flex items-center justify-between gap-3 bg-white p-2 rounded-xl border border-slate-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <img src={photoData} alt="Pratinjau foto bukti" className="w-14 h-14 object-cover rounded-lg border border-slate-200 shrink-0" />
                <span className="text-[11px] font-semibold text-slate-700 truncate">{photoName || 'Foto bukti siap dikirim'}</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  setConfirmState({
                    title: 'Hapus Foto Bukti?',
                    message: 'Foto lampiran yang sudah dipilih akan dihapus dari formulir ini.',
                    confirmLabel: 'Ya, Hapus Foto',
                    tone: 'danger',
                    onConfirm: () => {
                      setPhotoData('');
                      setPhotoName('');
                      setConfirmState(null);
                      onToast && onToast('Foto bukti dihapus.');
                    },
                  })
                }
                className="p-2 rounded-xl text-rose-600 hover:bg-rose-50"
                aria-label="Hapus foto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-800">Sembunyikan Identitas (Anonim)</p>
              <p className="text-[11px] text-slate-500">Nama pelapor disamarkan sesuai UU PDP No. 27/2022</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`w-12 h-7 rounded-full p-1 transition ${isAnonymous ? 'bg-emerald-600' : 'bg-slate-300'}`}
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow transition ${isAnonymous ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          {isGuestMode && !isAnonymous && (
            <input
              type="text"
              value={guestReporterName}
              onChange={(e) => setGuestReporterName(e.target.value)}
              placeholder="Nama Pelapor (opsional, mis. Wali Murid Kelas 4)"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
            />
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-2xl bg-[#0B2D52] hover:bg-[#092341] text-white font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {submitting ? 'Mengirim Pengaduan...' : isOnline ? tLabel(lang, 'formSubmit') : 'Simpan di Antrean Offline'}
        </button>
      </form>

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        loading={submitting}
        onConfirm={() => confirmState?.onConfirm && confirmState.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
