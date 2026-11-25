"""Regresi Fase 1-3 terhadap server berjalan (baca-saja, DB asli).

Jalankan DENGAN server hidup di 8127 (lihat plan Task 15 Step 2).
Exit 0 bila seluruh butir lulus.
"""
import base64
import hashlib
import hmac
import json
import socket
import subprocess
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8127"
results = []


def call(path, method="GET", body=None, token=None, headers=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["X-Monsa-Token"] = token
    if headers:
        h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read().decode("utf-8", "replace")
            try:
                parsed = json.loads(raw) if raw else {}
            except Exception:
                parsed = raw
            return r.status, parsed, dict(r.headers)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except Exception:
            parsed = raw
        return e.code, parsed, dict(e.headers)
    except Exception as e:
        return 0, {"error": str(e)}, {}


def check(label, got, exp):
    ok = got in exp
    results.append(ok)
    print("  %-46s -> %-42s %s" % (label, str(got), "LULUS" if ok else "GAGAL <<<"))


# 1) loader .env ber-BOM -> server harus hidup di 8127
c, _, _ = call("/api/health")
check("1. loader .env BOM (server di 8127)", c, [200])

# 2) bind 127.0.0.1
ip = ""
try:
    out = subprocess.run(
        ["powershell", "-Command",
         "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -notlike '127.*'}).IPAddress"],
        capture_output=True, text=True, timeout=15,
    ).stdout.split()
    ips = [i.strip() for i in out if i.strip().startswith(("192.", "10.", "172."))]
    ip = ips[0] if ips else ""
except Exception:
    pass
if ip:
    s = socket.socket()
    s.settimeout(3)
    try:
        s.connect((ip, 8127))
        opened = True
    except Exception:
        opened = False
    finally:
        s.close()
    check("2. bind localhost (konek via %s)" % ip,
          "terbuka" if opened else "ditolak", ["ditolak"])
else:
    print("  2. bind -> tidak ada IP non-loopback")
    results.append(True)

# 3) HSTS + CSP di HTML
c, _, hdr = call("/")
check("3a. HSTS di HTML", hdr.get("Strict-Transport-Security", ""),
      ["max-age=31536000; includeSubDomains"])
check("3b. CSP frame-ancestors none",
      "ADA" if "frame-ancestors 'none'" in hdr.get("Content-Security-Policy", "") else "HILANG",
      ["ADA"])

# 4) CORS ketat
c, _, hdr = call("/api/health", headers={"Origin": "https://evil.example"})
check("4. CORS origin asing tanpa ACAO",
      "ADA" if "Access-Control-Allow-Origin" in hdr else "bersih", ["bersih"])

# 5) K1 token key lama
payload = json.dumps(
    {"uid": 1, "role": "admin_sekolah", "tid": 1, "tv": 1, "exp": int(time.time()) + 9999},
    separators=(",", ":"),
).encode()
b64 = base64.urlsafe_b64encode(payload).decode()
sig = hmac.new(b"monsa-makassar-single-owner-multitenant-2026",
               b64.encode(), hashlib.sha256).hexdigest()
c, _, _ = call("/api/admin/users", headers={"X-Monsa-Token": f"{b64}.{sig}"})
check("5. K1: token key lama ditolak", c, [401, 403])

# 6) K2 demo-switch tanpa token
c, _, _ = call("/api/auth/demo-switch", "POST", {"user_id": 1})
check("6. K2: demo-switch tanpa token", c, [401, 403])

# 7) K3 brute-force (ident khusus)
codes = {}
for i in range(12):
    c, _, _ = call("/api/auth/login", "POST",
                   {"phone_or_email": "regresi-bruteforce2@uji.id", "password": f"salah{i}"})
    codes[c] = codes.get(c, 0) + 1
check("7. K3: brute-force -> 429", codes.get(429, 0) > 0, [True])

# 8) K4 redaksi log
call("/api/complaints/guest-track?ticket_code=ADU-MONSA-0001&pin=654321", "POST", {})
time.sleep(0.4)
with open("regresi.log", encoding="utf-8", errors="replace") as fh:
    log = fh.read()
check("8a. K4: PIN mentah tidak di log", "pin=654321" in log, [False])
check("8b. K4: redaksi pin=*** muncul", "pin=***" in log, [True])

# 9) login admin + paginasi
c, lg, _ = call("/api/auth/login", "POST",
                {"phone_or_email": "admin@monsa.sch.id", "password": "demo123"})
check("9a. login admin", c, [200])
tok = lg.get("token", "")
c, d, _ = call("/api/complaints?page=1&limit=3", token=tok)
check("9b. limit=3 + total=8 + has_more",
      (len(d.get("items", [])), d.get("total"), d.get("has_more")), [(3, 8, True)])

# 10) endpoint inti
for p in ("/api/bootstrap", "/api/app-info", "/api/public/fkp", "/api/evaluations"):
    c, _, _ = call(p, token=tok)
    check("10. %s" % p, c, [200])

print()
print("  RINGKASAN REGRESI: %d/%d lulus" % (sum(results), len(results)))
raise SystemExit(0 if all(results) else 1)
