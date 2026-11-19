"""Test header keamanan HTTP: CSP, HSTS, CORS (ketat), dan redaksi log (K4).

Bukti redaksi dibaca dari stdout subprocess server uji (file log).
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------
# CSP & HSTS
# --------------------------------------------------------------------------
def test_hsts_dikirim_di_html(live_server):
    status, _, hdr = live_server.request("GET", "/")
    assert status == 200
    assert hdr.get("Strict-Transport-Security") == "max-age=31536000; includeSubDomains"


def test_csp_ketat_di_html(live_server):
    status, _, hdr = live_server.request("GET", "/")
    assert status == 200
    csp = hdr.get("Content-Security-Policy", "")
    assert csp, "CSP tidak ada di halaman HTML"
    assert "default-src 'self'" in csp
    assert "frame-ancestors 'none'" in csp
    assert "object-src 'none'" in csp


def test_csp_tidak_dipasang_di_api_json(live_server):
    _, _, hdr = live_server.request("GET", "/api/health")
    assert "Content-Security-Policy" not in hdr


def test_csp_tidak_dipasang_di_aset_js(live_server):
    assets = sorted((PROJECT_ROOT / "web_bundle" / "assets").glob("*.js"))
    assert assets, "bundle web_bundle/assets/*.js tidak ditemukan"
    _, _, hdr = live_server.request("GET", f"/assets/{assets[0].name}")
    assert "Content-Security-Policy" not in hdr


def test_header_dasar_keamanan_selalu_ada(live_server):
    _, _, hdr = live_server.request("GET", "/api/health")
    assert hdr.get("X-Content-Type-Options") == "nosniff"
    assert hdr.get("X-Frame-Options") == "SAMEORIGIN"
    assert hdr.get("Referrer-Policy") == "strict-origin-when-cross-origin"


# --------------------------------------------------------------------------
# CORS ketat (tanpa MONSA_CORS_ORIGINS)
# --------------------------------------------------------------------------
def test_cors_origin_asing_tanpa_acao(live_server):
    _, _, hdr = live_server.request(
        "GET", "/api/health", headers={"Origin": "https://evil.example"},
    )
    assert "Access-Control-Allow-Origin" not in hdr, "CORS membuka origin asing!"


def test_cors_origin_localhost_port_ditolak(live_server):
    # Hanya origin persis yang diizinkan; localhost:5173 bukan whitelist.
    _, _, hdr = live_server.request(
        "GET", "/api/health", headers={"Origin": "http://localhost:5173"},
    )
    assert "Access-Control-Allow-Origin" not in hdr


def test_cors_capacitor_diizinkan(live_server):
    _, _, hdr = live_server.request(
        "GET", "/api/health", headers={"Origin": "capacitor://localhost"},
    )
    assert hdr.get("Access-Control-Allow-Origin") == "capacitor://localhost"


def test_cors_tanpa_origin_tidak_ada_acao(live_server):
    _, _, hdr = live_server.request("GET", "/api/health")
    assert "Access-Control-Allow-Origin" not in hdr


# --------------------------------------------------------------------------
# K4: redaksi PIN/token di log stdout server
# --------------------------------------------------------------------------
def test_pin_tamu_tidak_bocor_ke_log(live_server):
    status, guest, _ = live_server.request(
        "POST", "/api/complaints/guest",
        {"category": "Fasilitas Kelas / Toilet / Kantin",
         "description": "Uji redaksi log pytest", "is_anonymous": True},
    )
    assert status == 201, f"lapor tamu gagal: {status} {guest}"
    pin = guest.get("guest_pin") or ""
    ticket = guest.get("guest_ticket_code") or ""
    assert pin and ticket

    # Kirim PIN lewat query string — jalur yang rawan tercatat mentah.
    live_server.request(
        "POST",
        f"/api/complaints/guest-track?ticket_code={ticket}&pin={pin}",
        {},
    )
    # Token juga diuji pada query string.
    live_server.request("GET", "/api/health?token=rahasia-token-xyz")

    import time
    time.sleep(0.3)  # tunggu flush log

    log = live_server.read_log()
    assert pin not in log, f"PIN {pin} bocor ke log server!"
    assert "rahasia-token-xyz" not in log, "token bocor ke log server!"
    assert "pin=***" in log, "redaksi pin=*** tidak muncul di log"
    assert "token=***" in log, "redaksi token=*** tidak muncul di log"
