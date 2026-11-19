import { useState } from 'react';
import {
  BadgeCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  FileCheck2,
  FileDown,
  ShieldCheck,
  Users,
  Wallet,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { downloadServiceMaklumatPdf } from '../utils/pdfReport';
import { isTtsSupported, speakText, stopSpeech } from '../utils/speech';

const TIM_PENGELOLA_SK47 = [
  { role: 'Ketua Penanggung Jawab', name: 'Andi Windayani, S.Pd., M.Pd.', nip: '198112072007012013' },
  { role: 'Koordinator Layanan & Pengaduan', name: 'Erpin Rahayu, S.Pd., M.Pd.', nip: '197905142004112001' },
  { role: 'Wakil Koordinator', name: 'Herlina Iskandar, S.Pd.', nip: '197301022006042025' },
  { role: 'Sekretaris', name: 'Nurul Auliana, S.Pd.', nip: '-' },
  { role: 'Anggota Tim Pelaksana', name: 'Sudiarni, S.Pd., M.Pd.', nip: '197908182008012011' },
];

const FLOW_STEPS = [
  { step: '1. Diterima', desc: 'Pelapor kirim aduan (bisa Anonim) & langsung mendapat kode tiket ADU-MONSA.' },
  { step: '2. Diverifikasi Piket/TPPK', desc: 'Guru Piket / Tim TPPK memverifikasi aduan & memprioritaskan kelompok rentan.' },
  { step: '3. Ditangani TPPK/Kepsek', desc: 'Tindak lanjut resmi sekolah dengan target SLA <= 24 jam kerja.' },
  { step: '4. Selesai & Survei', desc: 'Notifikasi solusi dikirim ke pelapor; pelapor memberi rating & IKM 9 unsur.' },
];

export default function ServiceStandardsCard({ school, isStaff, onAction, onToast }) {
  const [expanded, setExpanded] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const slaHours = Number(school?.sla_hours || 24);

  function toggleReadMaklumat() {
    if (speaking) {
      stopSpeech();
      setSpeaking(false);
      return;
    }
    const script =
      `Maklumat dan Standar Pelayanan ${school?.name || 'UPTD SPF SD Negeri Unggulan Mongisidi 1'}. ` +
      `Seluruh layanan konsultasi, pengaduan, dan pendampingan peserta didik adalah GRATIS, nol rupiah, bebas pungutan liar. ` +
      `Target penyelesaian paling lambat ${slaHours} jam kerja. ` +
      `Identitas pelapor anonim dilindungi Undang-Undang Pelindungan Data Pribadi, dan kelompok rentan serta penyandang disabilitas mendapat layanan prioritas.`;
    const ok = speakText(script, (active) => setSpeaking(active));
    if (!ok) {
      onToast && onToast('Fitur pembacaan suara belum tersedia di browser perangkat ini.', 'error');
    }
  }

  return (
    <div className="bg-white rounded-3xl p-4 border border-emerald-200 shadow-xs space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <BadgeCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-xs font-extrabold text-[#0B2D52]">
                Etalase Standar Pelayanan & Maklumat Rp 0
              </h3>
              <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                100% GRATIS · BEBAS PUNGLI
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Kebijakan Pelayanan PEKPPP Aspek 01 · SK Inovasi SIMPEL 421.2/045 & SK Pengelola 421.2/047
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-bold text-[#0B2D52] flex items-center gap-1 shrink-0"
        >
          {expanded ? 'Tutup' : 'Maklumat'}
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* 4 Pilar Standar Pelayanan Digital */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-emerald-50/70 rounded-2xl p-2.5 border border-emerald-200 flex items-start gap-2">
          <Wallet className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-emerald-950">Biaya: Rp 0 (Gratis)</p>
            <p className="text-[10px] text-emerald-800">Zona Integritas anti pungli</p>
          </div>
        </div>
        <div className="bg-cyan-50/70 rounded-2xl p-2.5 border border-cyan-200 flex items-start gap-2">
          <Clock className="w-4 h-4 text-cyan-800 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-[#0B2D52]">SLA ≤ {slaHours} Jam Kerja</p>
            <p className="text-[10px] text-cyan-800">Alarm otomatis keterlambatan</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 flex items-start gap-2">
          <FileCheck2 className="w-4 h-4 text-[#0B2D52] shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-slate-900">Syarat Mudah & Anonim</p>
            <p className="text-[10px] text-slate-600">Dilindungi UU PDP No. 27/2022</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-2.5 border border-slate-200 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-slate-900">Jaminan Ramah Rentan</p>
            <p className="text-[10px] text-slate-600">Prioritas inklusi & disabilitas</p>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-3 text-xs">
          <div className="bg-white rounded-2xl p-3 border border-emerald-200 space-y-1.5">
            <p className="text-[11px] font-extrabold text-emerald-900 uppercase">
              Maklumat Pelayanan {school?.short_name || 'SDN Unggulan Mongisidi 1'}
            </p>
            <p className="text-[11px] text-slate-700 leading-relaxed italic">
              "Dengan ini kami menyatakan sanggup menyelenggarakan pelayanan konsultasi, pengaduan, dan pendampingan peserta didik secara transparan, GRATIS (Rp 0), tepat waktu maksimal {slaHours} jam kerja, melindungi identitas pelapor anonim sesuai UU PDP, serta mengutamakan pelayanan ramah kelompok rentan sesuai Perwali Makassar No. 68 Tahun 2021."
            </p>
            <p className="text-[10px] font-bold text-[#0B2D52]">
              — {school?.principal_name || 'Andi Windayani, S.Pd., M.Pd.'} (Kepala Sekolah · NIP. 198112072007012013)
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-extrabold text-[#0B2D52]">Alur Penanganan Pengaduan (4 Tahap Resmi):</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {FLOW_STEPS.map((f) => (
                <div key={f.step} className="bg-white rounded-xl p-2 border border-slate-200 text-[11px]">
                  <p className="font-extrabold text-[#0B2D52]">{f.step}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-extrabold text-[#0B2D52] flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-cyan-700" /> Tim Pengelola Layanan & Pengaduan (SK No. 421.2/047):
            </p>
            <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
              {TIM_PENGELOLA_SK47.map((m) => (
                <div key={m.name} className="px-2.5 py-1.5 flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-semibold text-slate-600">{m.role}</span>
                  <span className="font-bold text-slate-900 text-right">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => {
            downloadServiceMaklumatPdf({ school });
            onToast && onToast('Poster PDF Standar Pelayanan & Maklumat Rp 0 berhasil diunduh!');
          }}
          className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold inline-flex items-center gap-1.5"
        >
          <FileDown className="w-3.5 h-3.5" /> Unduh Poster Maklumat Rp 0 (.PDF)
        </button>
        {isTtsSupported() && (
          <button
            type="button"
            onClick={toggleReadMaklumat}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold inline-flex items-center gap-1.5 ${
              speaking ? 'bg-amber-600 text-white' : 'bg-cyan-50 hover:bg-cyan-100 text-[#0B2D52] border border-cyan-200'
            }`}
          >
            {speaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {speaking ? 'Hentikan Suara' : 'Dengar Maklumat'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onAction && onAction()}
          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0B2D52] text-[11px] font-extrabold inline-flex items-center gap-1.5"
        >
          {isStaff ? 'Buka Hasil & Poster IKM →' : 'Gunakan Layanan Gratis Sekarang →'}
        </button>
      </div>
    </div>
  );
}
