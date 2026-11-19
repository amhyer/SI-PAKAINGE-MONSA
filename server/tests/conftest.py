"""Fixture pytest SI-PAKAINGE MONSA (Fase 3).

PRINSIP ISOLASI — dijalankan SEBELUM modul db/app diimpor:
- Seluruh test memakai DB TEMPORER (MONSA_DB_PATH) — file
  `server/sikola_monsa.db` (data asli) TIDAK PERNAH dibuka.
- MONSA_SECRET_KEY tetap agar token bisa dibuat & divalidasi lintas-panggilan.
- Server uji berjalan sebagai subprocess pada port acak; stdout ditangkap ke
  file agar tes redaksi log (K4) dapat membuktikan `pin=***`.

Jalankan:  python -m pytest server/tests
"""

import atexit
import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

SERVER_DIR = Path(__file__).resolve().parents[1]  # .../server
PROJECT_ROOT = SERVER_DIR.parent

# --- Isolasi total: env dipasang sebelum modul db/app diimpor di mana pun. ---
_TEST_DIR = tempfile.mkdtemp(prefix="monsa-pytest-")
TEST_DB = os.path.join(_TEST_DIR, "unit.db")   # DB untuk test unit (proses pytest)
LIVE_DB = os.path.join(_TEST_DIR, "live.db")   # DB untuk subprocess server uji

os.environ["MONSA_DB_PATH"] = TEST_DB
os.environ["MONSA_SECRET_KEY"] = "kunci-rahasia-uji-fase3-" + "x" * 36  # >= 32 char
for _k in ("MONSA_ENV", "MONSA_DISABLE_DEMO", "MONSA_CORS_ORIGINS",
           "MONSA_WEBHOOK_URL", "MONSA_BIND", "PORT"):
    os.environ.pop(_k, None)

atexit.register(shutil.rmtree, _TEST_DIR, True)  # bersihkan DB temp saat pytest selesai

sys.path.insert(0, str(SERVER_DIR))

from db import init_db  # noqa: E402  (setelah sys.path diatur)

init_db()  # seed DB temp proses pytest (dipakai test unit hash/token)


# --------------------------------------------------------------------------
# Receiver webhook lokal (thread) — membuktikan notifikasi async benar-benar
# terkirim, bukan hanya tercatat.
# --------------------------------------------------------------------------
class WebhookReceiver:
    def __init__(self):
        self.hits = []
        self._lock = threading.Lock()
        owner = self

        class _H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(n)
                with owner._lock:
                    owner.hits.append(body.decode("utf-8", "replace"))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")

            def log_message(self, *args):
                pass

        self._server = HTTPServer(("127.0.0.1", 0), _H)
        self.port = self._server.server_address[1]
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def clear(self):
        with self._lock:
            self.hits.clear()

    @property
    def payloads(self):
        with self._lock:
            return list(self.hits)

    def stop(self):
        self._server.shutdown()
        self._server.server_close()


@pytest.fixture(scope="session")
def webhook_receiver():
    rx = WebhookReceiver()
    yield rx
    rx.stop()


# --------------------------------------------------------------------------
# Server uji: subprocess server/app.py pada port acak, DB temp, log file.
# --------------------------------------------------------------------------
class LiveServer:
    def __init__(self, base, proc, log_path, db_path, receiver):
        self.base = base
        self.proc = proc
        self.log_path = log_path
        self.db_path = db_path
        self.receiver = receiver

    def request(self, method, path, body=None, token=None, tenant=None, headers=None):
        """Kirim request HTTP -> (status, data_json, headers_dict)."""
        h = {"Content-Type": "application/json"}
        if token:
            h["X-Monsa-Token"] = token
        if tenant:
            h["X-Tenant-Code"] = tenant
        if headers:
            h.update(headers)
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8", "replace")
                try:
                    parsed = json.loads(raw) if raw else {}
                except ValueError:
                    parsed = {"_raw": raw}
                return resp.status, parsed, dict(resp.headers)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except ValueError:
                parsed = {"_raw": raw}
            return e.code, parsed, dict(e.headers)
        except Exception as e:  # koneksi gagal -> status 0 agar tes jatuh jelas
            return 0, {"error": str(e)}, {}

    def login(self, ident, password, tenant=None):
        return self.request(
            "POST", "/api/auth/login",
            {"phone_or_email": ident, "password": password}, tenant=tenant,
        )[:2]

    def read_log(self):
        with open(self.log_path, encoding="utf-8", errors="replace") as fh:
            return fh.read()

    def query(self, sql, args=()):
        conn = sqlite3.connect(self.db_path, timeout=15)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA busy_timeout = 15000")
            return conn.execute(sql, args).fetchall()
        finally:
            conn.close()


def _free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope="session")
def live_server(webhook_receiver):
    port = _free_port()
    log_path = os.path.join(_TEST_DIR, "server.log")
    env = os.environ.copy()
    env.update({
        "MONSA_DB_PATH": LIVE_DB,
        "MONSA_BIND": "127.0.0.1",
        "MONSA_WEBHOOK_URL": f"http://127.0.0.1:{webhook_receiver.port}/hook",
        "PORT": str(port),
        "PYTHONIOENCODING": "utf-8",
    })
    for k in ("MONSA_ENV", "MONSA_DISABLE_DEMO", "MONSA_CORS_ORIGINS"):
        env.pop(k, None)

    log_file = open(log_path, "w", encoding="utf-8", errors="replace")
    proc = subprocess.Popen(
        [sys.executable, str(SERVER_DIR / "app.py")],
        cwd=str(PROJECT_ROOT),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
    )

    base = f"http://127.0.0.1:{port}"
    ready = False
    deadline = time.time() + 30
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=2) as resp:
                if resp.status == 200:
                    ready = True
                    break
        except Exception:
            time.sleep(0.3)
    if not ready:
        log_file.close()
        proc.kill()
        tail = ""
        if os.path.exists(log_path):
            with open(log_path, encoding="utf-8", errors="replace") as fh:
                tail = fh.read()[-2000:]
        pytest.fail(f"Server uji gagal start (port {port}):\n{tail}")

    srv = LiveServer(base, proc, log_path, LIVE_DB, webhook_receiver)
    yield srv

    proc.terminate()
    try:
        proc.wait(timeout=10)
    except Exception:
        proc.kill()
    log_file.close()
