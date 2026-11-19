import { handleLocalApi, syncLocalUser } from './localFallback';

const TOKEN_KEY = 'monsa_lapor_token';
const TENANT_KEY = 'monsa_lapor_tenant';
const API_URL_KEY = 'monsa_lapor_api_url';
const OFFLINE_QUEUE_KEY = 'monsa_lapor_offline_queue';
const CACHE_BOOTSTRAP_KEY = 'monsa_lapor_bootstrap_cache';

const memStore = {};

function safeGet(key, fallback = '') {
  try {
    const v = window.localStorage.getItem(key);
    return v !== null ? v : (key in memStore ? memStore[key] : fallback);
  } catch {
    return key in memStore ? memStore[key] : fallback;
  }
}

function safeSet(key, val) {
  memStore[key] = val;
  try {
    window.localStorage.setItem(key, val);
  } catch {
    // sandboxed iframe without allow-same-origin
  }
}

function safeDel(key) {
  delete memStore[key];
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getToken() {
  return safeGet(TOKEN_KEY, '');
}

export function setToken(token) {
  if (token) safeSet(TOKEN_KEY, token);
  else {
    safeDel(TOKEN_KEY);
    syncLocalUser(null);
  }
}

export function getTenantCode() {
  return safeGet(TENANT_KEY, 'MONSA-01') || 'MONSA-01';
}

export function setTenantCode(code) {
  safeSet(TENANT_KEY, code || 'MONSA-01');
}

export function getApiBaseUrl() {
  const saved = safeGet(API_URL_KEY, '').trim();
  // VITE_API_BASE_URL (dari frontend/.env.production) hanya berlaku untuk APK
  // native: web selalu same-origin dengan server yang menyajinya sehingga tidak
  // pernah terkena masalah lintas-asal (CORS) saat dibuka dari mesin lokal.
  const envUrl = (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_API_BASE_URL &&
    isNativeAndroidApp()
  )
    ? String(import.meta.env.VITE_API_BASE_URL).trim()
    : '';
  const raw = saved || envUrl;
  return raw ? raw.replace(/\/+$/, '') : '';
}

export function setApiBaseUrl(url) {
  const clean = String(url || '').trim().replace(/\/+$/, '');
  if (clean) safeSet(API_URL_KEY, clean);
  else safeDel(API_URL_KEY);
}

export function buildApiUrl(path) {
  const base = getApiBaseUrl();
  return base ? `${base}${path}` : path;
}

export function isNativeAndroidApp() {
  try {
    return Boolean(
      typeof window !== 'undefined' &&
      (window.Capacitor?.isNativePlatform?.() || window.location.protocol === 'capacitor:')
    );
  } catch {
    return false;
  }
}

export function getOfflineQueue() {
  try {
    return JSON.parse(safeGet(OFFLINE_QUEUE_KEY, '[]'));
  } catch {
    return [];
  }
}

export function pushOfflineQueue(item) {
  const q = getOfflineQueue();
  q.push({ ...item, local_id: Date.now() + Math.random(), queued_at: new Date().toISOString() });
  safeSet(OFFLINE_QUEUE_KEY, JSON.stringify(q));
  return q;
}

export function removeOfflineQueueIds(ids) {
  if (!ids || !ids.length) return getOfflineQueue();
  const idSet = new Set(ids);
  const remaining = getOfflineQueue().filter((it) => !idSet.has(it.local_id));
  if (remaining.length) safeSet(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));
  else safeDel(OFFLINE_QUEUE_KEY);
  return remaining;
}

export function saveBootstrapCache(data) {
  try {
    safeSet(CACHE_BOOTSTRAP_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadBootstrapCache() {
  try {
    return JSON.parse(safeGet(CACHE_BOOTSTRAP_KEY, 'null'));
  } catch {
    return null;
  }
}

function isSandboxedViewer() {
  try {
    return window.location.protocol === 'about:' || window.location.protocol === 'file:' || window.location.origin === 'null';
  } catch {
    return true;
  }
}

/**
 * True bila SEMUA data hanya diproses di perangkat ini dan tidak pernah
 * sampai ke server sekolah:
 * - viewer ter-sandbox / HTML portabel (file:, about:, origin null), atau
 * - APK native yang belum diatur alamat servernya (VITE_API_BASE_URL kosong).
 */
export function isLocalDataMode() {
  try {
    if (isSandboxedViewer()) return true;
    return isNativeAndroidApp() && !getApiBaseUrl();
  } catch {
    return false;
  }
}

export async function apiFetch(path, options = {}) {
  const tenantCode = getTenantCode();
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    'X-Tenant-Code': tenantCode,
    ...(token ? { Authorization: `Bearer ${token}`, 'X-Monsa-Token': token } : {}),
    ...(options.headers || {}),
  };

  if (isSandboxedViewer()) {
    return handleLocalApi(path, { ...options, headers });
  }

  const base = getApiBaseUrl();
  if (isNativeAndroidApp() && !base) {
    return handleLocalApi(path, { ...options, headers });
  }

  try {
    const res = await fetch(buildApiUrl(path), {
      ...options,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const apiErr = new Error(data.error || `Permintaan gagal (${res.status})`);
      apiErr.status = res.status;
      throw apiErr;
    }
    if (data && data.user) {
      syncLocalUser(data.user);
    }
    return data;
  } catch (err) {
    if (err instanceof TypeError) {
      const method = (options.method || 'GET').toUpperCase();
      const cleanPath = path.split('?')[0];
      const readOnlyOfflinePaths = ['/api/bootstrap', '/api/public-recap', '/api/public/fkp', '/api/app-info'];
      if (method === 'GET' && readOnlyOfflinePaths.includes(cleanPath)) {
        return handleLocalApi(path, { ...options, headers });
      }
      throw new Error(
        'Tidak dapat terhubung ke server sekolah. Periksa koneksi internet Anda lalu coba lagi.',
        { cause: err },
      );
    }
    throw err;
  }
}
