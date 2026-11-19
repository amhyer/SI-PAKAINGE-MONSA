import { useEffect, useState } from 'react';
import { UserCheck, LogOut, School, ShieldCheck, Building2, CheckCircle2, Layers, Plus, FileDown, Camera, Trash2, Server, KeyRound, RefreshCw, Info } from 'lucide-react';
import { apiFetch, setToken, getTenantCode, setTenantCode, getApiBaseUrl, setApiBaseUrl } from '../api';
import { CLIENT_APP_INFO, ROLES } from '../constants';
import MonevReportModal from './MonevReportModal';
import { ConfirmModal } from './ConfirmModal';

function compressPrincipalPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        for (const maxW of [640, 480]) {
          const scale = img.width > maxW ? maxW / img.width : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          for (const q of [0.8, 0.62, 0.45]) {
            const out = canvas.toDataURL('image/jpeg', q);
            if (out.length <= 880000) {
              resolve(out);
              return;
            }
          }
        }
        reject(new Error('Foto kepala sekolah masih terlalu besar (>900 KB). Pilih gambar lain.'));
      };
      img.onerror = () => reject(new Error('File foto kepala sekolah tidak valid.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

export default function AccountSchoolTab({
  user,
  school,
  demoAccounts,
  serverAppInfo,
  checkingUpdate,
  swWaiting,
  onCheckUpdate,
  onOpenSpecs,
  onToast,
  onAuthChange,
  onSchoolUpdated,
  onTenantChanged,
}) {
  const [mode, setMode] = useState('login');
  const [fullName, setFullName] = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('orang_tua');
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBaseUrl());
  const [serverCheckStatus, setServerCheckStatus] = useState('');

  const [schoolForm, setSchoolForm] = useState(school || {});
  const [adminUsers, setAdminUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [newTenant, setNewTenant] = useState({ tenant_code: '', name: '', npsn: '', level: 'SD', district: 'Kota Makassar' });
  const [monevOpen, setMonevOpen] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [pwOpen, setPwOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetNewPw, setResetNewPw] = useState('');

  useEffect(() => {
    if (school) setSchoolForm(school);
  }, [school]);

  useEffect(() => {
    if (user && user.role === 'admin_sekolah' && user.verification_status === 'verified') {
      apiFetch('/api/admin/users').then((res) => setAdminUsers(res.items || [])).catch(() => {});
      apiFetch('/api/tenants').then((res) => setTenants(res.items || [])).catch(() => {});
    }
  }, [user]);

  async function handleDemoSwitch(uid) {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ user_id: uid }),
      });
      if (res.tenant_code) setTenantCode(res.tenant_code);
      else setTenantCode('MONSA-01');
      setToken(res.token);
      onAuthChange(res.user);
      onToast && onToast(`Beralih ke akun: ${res.user.full_name}`);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitAuth(e) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { phone_or_email: phoneOrEmail, password }
          : { full_name: fullName, phone_or_email: phoneOrEmail, password, role, student_name: studentName, student_class: studentClass };
      const res = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      setToken(res.token);
      onAuthChange(res.user);
      setMsg({ type: 'success', text: `Selamat datang, ${res.user.full_name}!` });
      onToast && onToast(`Selamat datang, ${res.user.full_name}!`);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function requestSaveSchool(e) {
    e.preventDefault();
    setConfirmState({
      title: 'Simpan Pengaturan Sekolah & Sambutan?',
      message: `Identitas sekolah, saluran alert WA/Email, serta foto & sambutan Kepala Sekolah (${schoolForm.welcome_title || 'Sambutan Kepala Sekolah'}) akan diperbarui di seluruh aplikasi.`,
      confirmLabel: 'Ya, Simpan Pengaturan',
      tone: 'primary',
      onConfirm: executeSaveSchool,
    });
  }

  async function executeSaveSchool() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/school-profile', {
        method: 'PUT',
        body: JSON.stringify(schoolForm),
      });
      onSchoolUpdated(res.school);
      setMsg({ type: 'success', text: 'Profil, sambutan Kepala Sekolah & saluran notifikasi berhasil disimpan.' });
      onToast && onToast('Pengaturan sekolah & sambutan Kepala Sekolah tersimpan!');
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
      setConfirmState(null);
    }
  }

  function requestCreateTenant(e) {
    e.preventDefault();
    setConfirmState({
      title: 'Daftarkan Sekolah Mitra Baru?',
      message: `Kode Tenant: ${(newTenant.tenant_code || '').toUpperCase()}\nNama Sekolah: ${newTenant.name}\nNPSN: ${newTenant.npsn}\n\nDatabase terisolasi akan disiapkan untuk sekolah ini.`,
      confirmLabel: 'Ya, Daftarkan Tenant',
      tone: 'primary',
      onConfirm: executeCreateTenant,
    });
  }

  async function executeCreateTenant() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(newTenant),
      });
      setTenants((prev) => [...prev, res.tenant]);
      setNewTenant({ tenant_code: '', name: '', npsn: '', level: 'SD', district: 'Kota Makassar' });
      const credInfo = res.initial_admin_password
        ? ` Akun Admin awal: ${res.initial_admin_email} (sandi: ${res.initial_admin_password}).`
        : '';
      setMsg({ type: 'success', text: `Tenant sekolah baru (${res.tenant.tenant_code}) berhasil dibuat dengan database terisolasi.${credInfo}` });
      onToast && onToast(`Tenant ${res.tenant.tenant_code} berhasil didaftarkan.`);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
      setConfirmState(null);
    }
  }

  function requestVerifyStaff(au, status) {
    setConfirmState({
      title: status === 'verified' ? 'Verifikasi Akun Petugas?' : 'Tangguhkan Akun Petugas?',
      message: `Nama: ${au.full_name}\nPeran: ${au.role.replace('_', ' ')}\n\n${status === 'verified' ? 'Petugas ini akan mendapat akses mengelola pengaduan sekolah.' : 'Akses petugas ini akan ditangguhkan sementara.'}`,
      confirmLabel: status === 'verified' ? 'Ya, Verifikasi' : 'Ya, Tangguhkan',
      tone: status === 'verified' ? 'success' : 'danger',
      onConfirm: () => executeVerifyStaff(au.id, status),
    });
  }

  async function executeVerifyStaff(uid, status) {
    try {
      const upd = await apiFetch(`/api/admin/users/${uid}/verify`, {
        method: 'PATCH',
        body: JSON.stringify({ verification_status: status }),
      });
      const res = await apiFetch('/api/admin/users');
      setAdminUsers(res.items || []);
      const txt = `Status akun ${upd.user?.full_name || 'petugas'} diperbarui menjadi "${status}".`;
      setMsg({ type: 'success', text: txt });
      onToast && onToast(txt);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setConfirmState(null);
    }
  }

  function requestLogout() {
    setConfirmState({
      title: 'Keluar dari Akun?',
      message: `Anda sedang masuk sebagai ${user?.full_name}. Lanjutkan keluar dari sesi ini?`,
      confirmLabel: 'Ya, Keluar',
      tone: 'danger',
      onConfirm: () => {
        setToken('');
        onAuthChange(null);
        setConfirmState(null);
        onToast && onToast('Anda telah keluar dari akun.');
      },
    });
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (pwForm.new_password.length < 6) {
      const txt = 'Kata sandi baru minimal 6 karakter.';
      setMsg({ type: 'error', text: txt });
      onToast && onToast(txt, 'error');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      const txt = 'Konfirmasi kata sandi baru tidak cocok.';
      setMsg({ type: 'error', text: txt });
      onToast && onToast(txt, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ old_password: pwForm.old_password, new_password: pwForm.new_password }),
      });
      if (res.token) setToken(res.token);
      setPwForm({ old_password: '', new_password: '', confirm_password: '' });
      setPwOpen(false);
      setMsg({ type: 'success', text: res.message || 'Kata sandi berhasil diperbarui.' });
      onToast && onToast(res.message || 'Kata sandi berhasil diperbarui.');
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminResetPassword(e) {
    e.preventDefault();
    if (!resetTarget || resetNewPw.trim().length < 6) {
      const txt = 'Kata sandi sementara minimal 6 karakter.';
      setMsg({ type: 'error', text: txt });
      onToast && onToast(txt, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: resetNewPw.trim() }),
      });
      setMsg({ type: 'success', text: res.message || `Kata sandi ${resetTarget.full_name} berhasil direset.` });
      onToast && onToast(res.message || `Kata sandi ${resetTarget.full_name} berhasil direset.`);
      setResetTarget(null);
      setResetNewPw('');
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      onToast && onToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {msg && (
        <div
          className={`rounded-2xl p-3 text-xs font-medium border ${
            msg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {msg.text}
        </div>
      )}

      {user ? (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200">
                {user.role.replace('_', ' ')}
              </span>
              <h3 className="font-bold text-base text-slate-900 mt-1.5">{user.full_name}</h3>
              <p className="text-xs text-slate-500">{user.phone_or_email}</p>
              {user.student_class && <p className="text-xs text-slate-600 mt-0.5">Keterangan: {user.student_class}</p>}
            </div>
            <button
              onClick={requestLogout}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Keluar
            </button>
          </div>

          {user.verification_status === 'pending' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 text-xs text-amber-900">
              Akun petugas/admin Anda masih berstatus <strong>Menunggu Verifikasi</strong> oleh Kepala Sekolah/Admin.
            </div>
          )}

          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setPwOpen((v) => !v)}
              className="text-xs font-bold text-[#0B2D52] hover:text-cyan-700 flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" /> {pwOpen ? 'Tutup Form Ubah Kata Sandi' : 'Ubah Kata Sandi Saya'}
            </button>
            {pwOpen && (
              <form onSubmit={handleChangePassword} className="mt-3 space-y-2 bg-slate-50 rounded-2xl p-3 border border-slate-200">
                <input
                  type="password"
                  required
                  value={pwForm.old_password}
                  onChange={(e) => setPwForm({ ...pwForm, old_password: e.target.value })}
                  placeholder="Kata sandi lama"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm({ ...pwForm, new_password: e.target.value })}
                    placeholder="Kata sandi baru (min. 6 karakter)"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={pwForm.confirm_password}
                    onChange={(e) => setPwForm({ ...pwForm, confirm_password: e.target.value })}
                    placeholder="Ulangi kata sandi baru"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold"
                >
                  Simpan Kata Sandi Baru
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold ${mode === 'login' ? 'bg-white shadow-xs text-[#0B2D52]' : 'text-slate-500'}`}
            >
              Masuk Akun
            </button>
            <button
              onClick={() => setMode('register')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold ${mode === 'register' ? 'bg-white shadow-xs text-[#0B2D52]' : 'text-slate-500'}`}
            >
              Daftar Baru
            </button>
          </div>

          <form onSubmit={handleSubmitAuth} className="space-y-3">
            {mode === 'register' && (
              <>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nama Lengkap Anda"
                  required
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs"
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs bg-white"
                >
                  {ROLES.map((r) => (
                    <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
                  ))}
                </select>
                {(role === 'orang_tua' || role === 'siswa') && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="Nama Siswa (Opsional)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    />
                    <input
                      type="text"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      placeholder="Kelas (mis. 4B)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                    />
                  </div>
                )}
              </>
            )}

            <input
              type="text"
              value={phoneOrEmail}
              onChange={(e) => setPhoneOrEmail(e.target.value)}
              placeholder="No. HP atau Email"
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kata Sandi"
              required
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-2xl bg-[#0B2D52] text-white text-xs font-bold"
            >
              {mode === 'login' ? 'Masuk ke SI-PAKAINGE MONSA' : 'Daftar & Masuk'}
            </button>
          </form>
        </div>
      )}

      {/* Demo 1-tap role switcher */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-cyan-700" /> Akun Uji Coba Semua Peran (1-Ketuk / Login Manual)
          </p>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            Sandi Login Manual: <code>demo123</code>
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(demoAccounts || []).map((acc) => (
            <button
              key={acc.id}
              onClick={() => handleDemoSwitch(acc.id)}
              disabled={loading}
              className={`text-left p-3 rounded-2xl border transition ${
                user?.id === acc.id ? 'border-[#0B2D52] bg-cyan-50/70' : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <p className="text-xs font-bold text-slate-900">{acc.full_name}</p>
              <p className="text-[11px] text-slate-500">{acc.role.replace('_', ' ')} · {acc.phone_or_email}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Staff / Admin PEKPPP Monev Export */}
      {user && ['tppk_piket', 'admin_sekolah'].includes(user.role) && user.verification_status === 'verified' && (
        <div className="bg-gradient-to-r from-[#0B2D52] to-[#0E7490] text-white rounded-3xl p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold">Ekspor Laporan Monev & FKP_UPP (PEKPPP 05B & 06B)</p>
            <p className="text-[11px] text-cyan-100 mt-0.5">
              Hasilkan dokumen rekap resmi (.md / .csv) untuk melengkapi folder Bukti Dukung 05B & 06B.
            </p>
          </div>
          <button
            onClick={() => setMonevOpen(true)}
            className="px-4 py-2 rounded-xl bg-white text-[#0B2D52] text-xs font-extrabold flex items-center gap-1.5 shrink-0"
          >
            <FileDown className="w-4 h-4" /> Buka Ekspor
          </button>
        </div>
      )}

      {/* Admin School Profile, Notification Channels & Multi-Tenant Architecture Panel */}
      {user?.role === 'admin_sekolah' && user?.verification_status === 'verified' && (
        <div className="space-y-4">
          <form onSubmit={requestSaveSchool} className="bg-white rounded-3xl p-4 border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-cyan-700" /> Pengaturan Identitas & Notifikasi WhatsApp/Email Sekolah
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={schoolForm.name || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
                placeholder="Nama Resmi Sekolah"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.npsn || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, npsn: e.target.value })}
                placeholder="NPSN"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.principal_name || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, principal_name: e.target.value })}
                placeholder="Nama Kepala Sekolah"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.email || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })}
                placeholder="Email Resmi Sekolah"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.hotline || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, hotline: e.target.value })}
                placeholder="Telepon / Hotline Sekolah"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.tppk_lead || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, tppk_lead: e.target.value })}
                placeholder="Tim Koordinator / TPPK"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.address || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })}
                placeholder="Alamat Resmi Sekolah"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs sm:col-span-2"
              />
              <input
                type="text"
                value={schoolForm.notify_whatsapp || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, notify_whatsapp: e.target.value })}
                placeholder="No. WA Penerima Alert (mis. 6281355982195)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.notify_email || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, notify_email: e.target.value })}
                placeholder="Email Penerima Alert"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="number"
                min={1}
                max={720}
                value={schoolForm.sla_hours ?? 24}
                onChange={(e) => setSchoolForm({ ...schoolForm, sla_hours: e.target.value })}
                placeholder="Target SLA Respons (Jam)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <input
                type="text"
                value={schoolForm.webhook_url || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, webhook_url: e.target.value })}
                placeholder="URL Webhook WA Gateway (Opsional, mis. https://...)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-2.5">
              <p className="text-xs font-bold text-[#0B2D52]">Foto & Sambutan Kepala Sekolah (Tampil di Beranda)</p>
              <div className="flex items-center gap-3">
                <div className="w-16 h-20 rounded-xl border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                  {schoolForm.principal_photo ? (
                    <img src={schoolForm.principal_photo} alt="Preview Kepsek" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] text-slate-400 text-center px-1">Belum ada foto</span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-2">
                    <label className="px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-900 text-[11px] font-bold cursor-pointer inline-flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" />
                      {schoolForm.principal_photo ? 'Ganti Foto Kepsek' : 'Unggah Foto Kepsek'}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          try {
                            const dataUrl = await compressPrincipalPhoto(file);
                            setSchoolForm((prev) => ({ ...prev, principal_photo: dataUrl }));
                            onToast && onToast('Foto siap — tekan Simpan Pengaturan & Sambutan untuk menerapkan.');
                          } catch (err) {
                            setMsg({ type: 'error', text: err.message });
                            onToast && onToast(err.message, 'error');
                          }
                        }}
                      />
                    </label>
                    {schoolForm.principal_photo && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            title: 'Hapus Foto Kepala Sekolah?',
                            message: 'Foto akan dihapus dari pratinjau (tekan Simpan Pengaturan & Sambutan untuk menerapkan permanen).',
                            confirmLabel: 'Ya, Hapus Foto',
                            tone: 'danger',
                            onConfirm: () => {
                              setSchoolForm((prev) => ({ ...prev, principal_photo: '' }));
                              setConfirmState(null);
                              onToast && onToast('Foto dihapus dari draf pengaturan.');
                            },
                          })
                        }
                        className="px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Hapus Foto
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">Foto otomatis dikompresi agar ringan & bisa diganti kapan saja.</p>
                </div>
              </div>
              <input
                type="text"
                value={schoolForm.welcome_title || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, welcome_title: e.target.value })}
                placeholder="Judul Sambutan (mis. Sambutan Kepala Sekolah)"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
              <textarea
                rows={3}
                value={schoolForm.welcome_message || ''}
                onChange={(e) => setSchoolForm({ ...schoolForm, welcome_message: e.target.value })}
                placeholder="Tulis sambutan rilis aplikasi atau pembaruan informasi sekolah..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>

            <button type="submit" disabled={loading} className="px-4 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold">
              Simpan Pengaturan & Sambutan
            </button>
          </form>

          {/* Multi-School Makassar Architecture */}
          <div className="bg-white rounded-3xl p-4 border border-cyan-200 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-[#0B2D52] flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-cyan-700" /> Arsitektur Siap Skala Banyak Sekolah Makassar
              </h4>
              <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                Aplikasi berjalan eksklusif untuk <strong>{school?.name}</strong> (Kode Tenant: <code>{getTenantCode()}</code>), dengan isolasi <code>tenant_id</code> agar sekolah lain di Kota Makassar dapat mengadopsinya nanti tanpa menulis ulang kode inti.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-bold text-slate-700">Tenant Terdaftar ({tenants.length}):</p>
              {tenants.map((t) => (
                <div key={t.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2 text-xs border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-800">{t.name} ({t.tenant_code})</p>
                    <p className="text-[10px] text-slate-500">NPSN {t.npsn} · {t.is_primary_owner ? 'Pemilik Tunggal Utama' : 'Tenant Sekolah Mitra'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={getTenantCode() === t.tenant_code}
                    onClick={() =>
                      setConfirmState({
                        title: `Beralih ke Tenant ${t.tenant_code}?`,
                        message: `Aplikasi akan memuat ulang tampilan dengan database terisolasi milik ${t.name} (${t.tenant_code}). Sesi masuk saat ini akan direset.`,
                        confirmLabel: 'Ya, Muat Pratinjau',
                        tone: 'primary',
                        onConfirm: () => {
                          setToken('');
                          setTenantCode(t.tenant_code);
                          setConfirmState(null);
                          if (onTenantChanged) {
                            onTenantChanged(t.tenant_code);
                          } else {
                            window.location.reload();
                          }
                        },
                      })
                    }
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                      getTenantCode() === t.tenant_code ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {getTenantCode() === t.tenant_code ? 'Aktif' : 'Pratinjau'}
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={requestCreateTenant} className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Simulasi Tambah Sekolah Mitra Makassar (Multi-Tenant)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newTenant.tenant_code}
                  onChange={(e) => setNewTenant({ ...newTenant, tenant_code: e.target.value })}
                  placeholder="Kode (mis. SDN-02)"
                  required
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  placeholder="Nama Sekolah Baru"
                  required
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
                <input
                  type="text"
                  value={newTenant.npsn}
                  onChange={(e) => setNewTenant({ ...newTenant, npsn: e.target.value })}
                  placeholder="NPSN"
                  required
                  className="rounded-xl border border-slate-200 px-3 py-2 text-xs"
                />
              </div>
              <button type="submit" disabled={loading} className="px-4 py-2 rounded-xl bg-cyan-700 text-white text-xs font-bold">
                Daftarkan Tenant Sekolah
              </button>
            </form>
          </div>

          <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-700" /> Verifikasi Akun Petugas Sekolah
            </h4>
            {adminUsers.map((au) => (
              <div key={au.id} className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 rounded-2xl p-2.5 text-xs">
                <div>
                  <p className="font-bold text-slate-800">{au.full_name}</p>
                  <p className="text-[11px] text-slate-500">{au.role.replace('_', ' ')} · {au.verification_status}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(au);
                      setResetNewPw('');
                    }}
                    className="px-2 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold"
                  >
                    Reset Sandi
                  </button>
                  {au.verification_status !== 'verified' ? (
                    <button
                      type="button"
                      onClick={() => requestVerifyStaff(au, 'verified')}
                      className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-bold"
                    >
                      Verifikasi
                    </button>
                  ) : (
                    <>
                      <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Aktif
                      </span>
                      {au.id !== user.id && (
                        <button
                          type="button"
                          onClick={() => requestVerifyStaff(au, 'pending')}
                          className="px-2 py-0.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-bold"
                        >
                          Tangguhkan
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {resetTarget && (
              <form onSubmit={handleAdminResetPassword} className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                <p className="text-xs font-bold text-amber-950">Reset Kata Sandi: {resetTarget.full_name}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    minLength={6}
                    value={resetNewPw}
                    onChange={(e) => setResetNewPw(e.target.value)}
                    placeholder="Kata sandi sementara baru (min. 6 karakter)"
                    className="flex-1 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs"
                  />
                  <button type="submit" disabled={loading} className="px-3 py-1.5 rounded-xl bg-amber-700 text-white text-xs font-bold">
                    Simpan
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(null)}
                    className="px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700 text-xs font-bold"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Pengaturan Alamat Server Sekolah (untuk APK Android / Multi-Perangkat) */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
          <Server className="w-4 h-4 text-cyan-700" /> Koneksi Server Pusat Sekolah (Khusus APK Android)
        </h4>
        <p className="text-[11px] text-slate-500">
          Kosongkan untuk mode otomatis (web server yang sama atau mode lokal HP). Saat diinstal sebagai APK di banyak HP warga sekolah, isi alamat HTTPS server sekolah (mis. <code>https://lapor.sdnungmongisidi1.sch.id</code>).
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={serverUrlInput}
            onChange={(e) => setServerUrlInput(e.target.value)}
            placeholder="https://server-sekolah.sch.id"
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs"
          />
          <button
            type="button"
            onClick={async () => {
              const cleaned = serverUrlInput.trim().replace(/\/+$/, '');
              if (!cleaned) {
                setApiBaseUrl('');
                setServerCheckStatus('Koneksi direset ke mode otomatis/lokal.');
                onToast && onToast('Alamat server direset ke mode otomatis.');
                return;
              }
              if (!/^https?:\/\/[a-z0-9.-]+/i.test(cleaned)) {
                setServerCheckStatus('URL server harus diawali https:// atau http:// (mis. https://lapor.sdnungmongisidi1.sch.id).');
                onToast && onToast('Alamat server harus diawali https:// atau http://', 'error');
                return;
              }
              setApiBaseUrl(cleaned);
              try {
                const res = await fetch(`${cleaned}/api/health`);
                const d = await res.json();
                if (res.ok && d?.status === 'ok') {
                  setServerCheckStatus(`Terhubung ke server: ${d.owner || cleaned}`);
                  onToast && onToast('Berhasil terhubung ke server sekolah!');
                } else {
                  setServerCheckStatus('Server merespons tetapi status tidak dikenal.');
                }
              } catch {
                setServerCheckStatus('Alamat tersimpan, namun server belum dapat dijangkau dari perangkat ini.');
                onToast && onToast('Alamat server tersimpan (belum terhubung saat ini).', 'error');
              }
            }}
            className="px-3.5 py-2 rounded-xl bg-[#0B2D52] text-white text-xs font-bold shrink-0"
          >
            Simpan & Tes
          </button>
        </div>
        {serverCheckStatus && <p className="text-[11px] font-semibold text-cyan-800">{serverCheckStatus}</p>}
      </div>

      {/* Kartu Spesifikasi & Cek Pembaruan Aplikasi */}
      <div className="bg-white rounded-3xl p-4 border border-slate-200 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#0B2D52]" /> Spesifikasi & Pembaruan Aplikasi
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Versi terpasang: <strong>v{CLIENT_APP_INFO.version}</strong> (Build {CLIENT_APP_INFO.version_code})
              {serverAppInfo?.version && ` · Server: v${serverAppInfo.version}`}
            </p>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${
              Number(serverAppInfo?.version_code || CLIENT_APP_INFO.version_code) > CLIENT_APP_INFO.version_code || swWaiting
                ? 'bg-amber-100 text-amber-900'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {Number(serverAppInfo?.version_code || CLIENT_APP_INFO.version_code) > CLIENT_APP_INFO.version_code || swWaiting
              ? 'Update Tersedia'
              : 'Versi Terbaru'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={checkingUpdate}
            onClick={() => onCheckUpdate && onCheckUpdate(true)}
            className="px-3.5 py-2 rounded-xl bg-[#0B2D52] hover:bg-[#08223d] disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
            {checkingUpdate ? 'Memeriksa...' : 'Cek Pembaruan Sekarang'}
          </button>
          <button
            type="button"
            onClick={() => onOpenSpecs && onOpenSpecs()}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Info className="w-3.5 h-3.5 text-cyan-700" /> Spesifikasi & Changelog
          </button>
        </div>
      </div>

      {/* Official School Identity Card */}
      {school && (
        <div className="bg-slate-900 text-white rounded-3xl p-4 space-y-1.5">
          <p className="text-[11px] text-cyan-300 font-bold flex items-center gap-1.5">
            <School className="w-3.5 h-3.5" /> Pemilik Tunggal Resmi Aplikasi
          </p>
          <p className="font-bold text-sm">{school.name}</p>
          <p className="text-[11px] text-slate-300">Kepala Sekolah: {school.principal_name} (NIP 198112072007012013)</p>
          <p className="text-[11px] text-slate-300">NPSN: {school.npsn} · {school.level}</p>
          <p className="text-[11px] text-slate-300">{school.address}</p>
          <p className="text-[11px] text-slate-300">Email: {school.email} · Hotline: {school.hotline}</p>
        </div>
      )}

      <MonevReportModal open={monevOpen} onClose={() => setMonevOpen(false)} school={school} onToast={onToast} />

      <ConfirmModal
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone}
        loading={loading}
        onConfirm={() => confirmState?.onConfirm && confirmState.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
