"""Fondasi handler HTTP: header keamanan, JSON, IP klien, tenant, user (Fase 4A).

_REDact memakai cls._SENSITIVE_QS_RE yang tetap didefinisikan di kelas
akhir (app.py) — resolusi lewat MRO pada runtime (spec §6).
"""
import json
import os
import sys
from http.server import BaseHTTPRequestHandler

from security import verify_token


class PayloadTooLargeError(ValueError):
    pass


class SikolaHandlerBase(BaseHTTPRequestHandler):
    @classmethod
    def _redact(cls, text: str) -> str:
        return cls._SENSITIVE_QS_RE.sub(lambda m: f"{m.group(1)}=***", text)

    def log_message(self, format, *args):
        # Hanya baris permintaan yang dicatat; query string dirahasiakan agar
        # PIN tiket tamu (fitur tautan 1-klik) tidak bocor ke journalctl/stdout.
        msg = self._redact(format % args)
        sys.stdout.write(f"[MONSA-LAPOR] {self.address_string()} - {msg}\n")
        sys.stdout.flush()

    def send_security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "strict-origin-when-cross-origin")
        self.send_header("Permissions-Policy", "microphone=(self), camera=(self)")
        # HSTS: browser hanya menyimpan bila diakses via HTTPS (mis. lewat nginx),
        # diabaikan secara aman bila backend diakses langsung tanpa TLS.
        self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    # CSP hanya untuk halaman HTML (bukan respons API JSON): bundle Vite memakai
    # aset same-origin, foto/audio base64 (data:), dan unduh blob — tanpa font
    # atau skrip eksternal, sehingga kebijakan bisa ketat.
    CSP_POLICY = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; media-src 'self' data: blob:; "
        "connect-src 'self'; font-src 'self'; worker-src 'self'; "
        "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
    )

    def send_csp_header(self):
        self.send_header("Content-Security-Policy", self.CSP_POLICY)

    # Selalu diizinkan: APK Capacitor & halaman lokal saat pengembangan.
    ALWAYS_ALLOWED_ORIGINS = {"capacitor://localhost", "https://localhost", "http://localhost"}

    def send_cors_headers(self):
        """CORS default KETAT (K6): tanpa izin lintas-origin kecuali di-whitelist.

        Tanpa MONSA_CORS_ORIGINS, server tidak mengirim Access-Control-Allow-Origin
        sama sekali sehingga hanya same-origin yang dapat membaca respons API.
        """
        allowed_raw = os.environ.get("MONSA_CORS_ORIGINS", "").strip()
        req_origin = (self.headers.get("Origin") or "").strip().rstrip("/")
        if not req_origin:
            # Permintaan non-browser / same-origin tidak membutuhkan header CORS.
            return

        allow_list = set()
        allow_any = False
        for item in allowed_raw.split(","):
            item = item.strip().rstrip("/")
            if item == "*":
                allow_any = True
            elif item:
                allow_list.add(item)
        allow_list.update(self.ALWAYS_ALLOWED_ORIGINS)

        if allow_any:
            self.send_header("Access-Control-Allow-Origin", "*")
        elif req_origin in allow_list:
            self.send_header("Access-Control-Allow-Origin", req_origin)
            self.send_header("Vary", "Origin")
        else:
            # Origin tak dikenal: sengaja tidak mengklaim izin lintas-origin.
            return

        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Tenant-Code, X-Monsa-Token")

    def send_json(self, status: int, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_security_headers()
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_text_download(self, status: int, text: str, ctype: str, filename: str):
        body = text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.send_security_headers()
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # Proxy yang diizinkan menyetel header IP asal. Loopback = nginx pada host yang sama.
    TRUSTED_PROXIES_DEFAULT = ("127.0.0.1", "::1", "::ffff:127.0.0.1")

    def _trusted_proxies(self) -> set:
        proxies = set(self.TRUSTED_PROXIES_DEFAULT)
        extra = os.environ.get("MONSA_TRUSTED_PROXIES", "").strip()
        if extra:
            proxies.update(p.strip() for p in extra.split(",") if p.strip())
        return proxies

    def get_client_ip(self) -> str:
        """K3: header IP asal hanya dipercaya bila datang dari proxy tepercaya.

        - X-Real-IP diprioritaskan karena nginx menimpanya dengan $remote_addr
          sehingga tidak dapat dipalsukan klien.
        - X-Forwarded-For diambil dari EKOR, bukan awal: proxy meng-append IP klien
          asli ke belakang rantai, jadi entri PERTAMA justru bisa dibuat penyerang
          (ini sumber bypass rate-limit sebelumnya).
        - Akses langsung (bukan lewat proxy) -> semua header diabaikan.
        """
        peer = self.client_address[0] if self.client_address else "unknown"
        if peer not in self._trusted_proxies():
            return peer

        real_ip = (self.headers.get("X-Real-IP") or "").strip()
        if real_ip:
            return real_ip

        xff = (self.headers.get("X-Forwarded-For") or "").strip()
        if xff:
            last = xff.split(",")[-1].strip()
            if last:
                return last
        return peer

    def read_json_body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError:
            raise ValueError("Header Content-Length tidak valid.")
        if length <= 0:
            return {}
        if length > 2_500_000:
            raise PayloadTooLargeError("Payload terlalu besar (maksimal 2.5 MB).")
        raw = self.rfile.read(length).decode("utf-8")
        if not raw:
            return {}
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("Body JSON harus berupa objek ({...}).")
        return data

    def get_tenant(self, conn, qs=None):
        code = (self.headers.get("X-Tenant-Code") or "").strip()
        if not code and qs:
            code = (qs.get("tenant", [""])[0]).strip()
        if code:
            row = conn.execute("SELECT * FROM school_tenants WHERE tenant_code = ?", (code,)).fetchone()
            if row:
                return dict(row)
        row = conn.execute("SELECT * FROM school_tenants WHERE is_primary_owner = 1 ORDER BY id ASC LIMIT 1").fetchone()
        return dict(row)

    def get_current_user(self):
        monsa_tok = (self.headers.get("X-Monsa-Token") or "").strip()
        if monsa_tok:
            u = verify_token(monsa_tok)
            if u:
                return u
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return verify_token(auth[7:].strip())
        return None
