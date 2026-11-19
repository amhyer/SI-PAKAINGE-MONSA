"""Test integrasi keamanan API (server uji hidup, DB temp).

Mencakup: forge token key lama (K1), guard demo-switch (K2), rate-limit
brute-force (K3), IDOR peran, dan isolasi antar-tenant.
"""

# --------------------------------------------------------------------------
# K1: token dengan kunci hardcoded lama harus ditolak
# --------------------------------------------------------------------------
import base64
import hashlib
import hmac
import json
import time


def test_token_key_lama_ditolak(live_server):
    payload = json.dumps(
        {"uid": 1, "role": "admin_sekolah", "tid": 1, "tv": 1,
         "exp": int(time.time()) + 9999},
        separators=(",", ":"),
    ).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    sig = hmac.new(
        b"monsa-makassar-single-owner-multitenant-2026",
        b64.encode("ascii"), hashlib.sha256,
    ).hexdigest()
    status, _, _ = live_server.request(
        "GET", "/api/admin/users", headers={"X-Monsa-Token": f"{b64}.{sig}"},
    )
    assert status in (401, 403), f"token key lama diterima: {status}"


def test_token_acak_ditolak(live_server):
    status, _, _ = live_server.request(
        "GET", "/api/admin/users", headers={"X-Monsa-Token": "abc.def"},
    )
    assert status in (401, 403)


# --------------------------------------------------------------------------
# K2: demo-switch wajib token admin terverifikasi
# --------------------------------------------------------------------------
def test_demo_switch_tanpa_token_ditolak(live_server):
    status, _, _ = live_server.request("POST", "/api/auth/demo-switch", {"user_id": 1})
    assert status == 403


def test_demo_switch_token_bukan_admin_ditolak(live_server):
    status, data = live_server.login("081241001101", "demo123")  # orang tua
    assert status == 200
    status, _, _ = live_server.request(
        "POST", "/api/auth/demo-switch", {"user_id": 1}, token=data["token"],
    )
    assert status == 403


def test_demo_switch_akun_pending_ditolak(live_server):
    # Pak Baso: role tppk_piket tetapi verification_status = pending.
    status, data = live_server.login("085299007707", "demo123")
    assert status == 200
    status, _, _ = live_server.request(
        "POST", "/api/auth/demo-switch", {"user_id": 1}, token=data["token"],
    )
    assert status == 403


def test_demo_switch_admin_terverifikasi_diterima(live_server):
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    status, out, _ = live_server.request(
        "POST", "/api/auth/demo-switch", {"user_id": 1}, token=data["token"],
    )
    assert status == 200
    assert out.get("token"), "demo-switch tidak mengembalikan token"
    assert out.get("user", {}).get("id") == 1


def test_demo_switch_id_di_luar_4_akun_demo_ditolak(live_server):
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    status, _, _ = live_server.request(
        "POST", "/api/auth/demo-switch", {"user_id": 9999}, token=data["token"],
    )
    assert status == 403


# --------------------------------------------------------------------------
# K3: brute-force login diblokir (ident khusus agar tidak mengunci akun lain)
# --------------------------------------------------------------------------
def test_brute_force_login_diblokir_429(live_server):
    ident = "bruteforce-uji@monsa.test"
    statuses = [
        live_server.request(
            "POST", "/api/auth/login",
            {"phone_or_email": ident, "password": f"salah-{i}"},
        )[0]
        for i in range(12)
    ]
    assert 401 in statuses, "kredensial salah seharusnya ditolak 401"
    assert 429 in statuses, f"rate-limit 429 tidak muncul: {statuses}"
    # Setelah terkunci, login ber-ident lain tetap normal.
    status, _ = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200


# --------------------------------------------------------------------------
# IDOR: peran biasa tidak boleh mengubah tiket milik orang lain
# --------------------------------------------------------------------------
def test_idor_orang_tua_tidak_bisa_ubah_tiket_lain(live_server):
    status, parent = live_server.login("081241001101", "demo123")
    assert status == 200
    status, admin = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    status, listing, _ = live_server.request(
        "GET", "/api/complaints", token=admin["token"],
    )
    assert status == 200
    others = [i for i in listing["items"] if i["user_id"] != parent["user"]["id"]]
    assert others, "tidak ditemukan tiket milik pengguna lain untuk diuji"
    target = others[0]

    status, _, _ = live_server.request(
        "PATCH", f"/api/complaints/{target['id']}",
        {"parent_feedback": "upaya IDOR"}, token=parent["token"],
    )
    assert status == 403, "orang tua berhasil mengubah tiket milik orang lain!"


def test_idor_peran_biasa_ke_endpoint_admin_ditolak(live_server):
    status, parent = live_server.login("081241001101", "demo123")
    assert status == 200
    status, _, _ = live_server.request(
        "GET", "/api/admin/users", token=parent["token"],
    )
    assert status == 403


def test_tanpa_token_endpoint_terlindungi_ditolak(live_server):
    # Endpoint biasa menolak dengan 401; endpoint admin sudah ketat sejak
    # awal (403 tanpa membedakan) — yang penting tidak pernah 200.
    for path in ("/api/complaints", "/api/notifications"):
        status, _, _ = live_server.request("GET", path)
        assert status == 401, f"{path} tanpa token -> {status}, seharusnya 401"
    status, _, _ = live_server.request("GET", "/api/admin/users")
    assert status in (401, 403), f"/api/admin/users tanpa token -> {status}"


# --------------------------------------------------------------------------
# Isolasi antar-tenant
# --------------------------------------------------------------------------
def test_isolasi_antar_tenant(live_server):
    # 1) Admin tenant MONSA-01 membuat tenant baru.
    status, admin = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    status, created, _ = live_server.request(
        "POST", "/api/tenants",
        {"tenant_code": "TES-ISO", "name": "Sekolah Uji Isolasi",
         "npsn": "99990001", "admin_password": "rahasia123"},
        token=admin["token"],
    )
    assert status == 201, f"create tenant gagal: {status} {created}"

    # 2) Daftarkan orang tua di tenant baru.
    status, reg, _ = live_server.request(
        "POST", "/api/auth/register",
        {"full_name": "Pengguna Uji Isolasi", "phone_or_email": "uji.isolasi@tes.id",
         "password": "katauji123", "role": "orang_tua"},
        tenant="TES-ISO",
    )
    assert status == 201, f"register tenant-2 gagal: {status} {reg}"
    token_t2 = reg["token"]

    # 3) Token tenant-2 mengakses daftar tiket tenant-1 -> 403.
    status, _, _ = live_server.request(
        "GET", "/api/complaints", token=token_t2, tenant="MONSA-01",
    )
    assert status == 403, "token lintas tenant bisa membaca daftar tiket tenant lain!"

    # 4) Tiket tenant-1 di-PATCH token tenant-2 -> 403.
    status, _, _ = live_server.request(
        "PATCH", "/api/complaints/1", {"parent_feedback": "lintas tenant"},
        token=token_t2, tenant="MONSA-01",
    )
    assert status == 403, "token lintas tenant bisa mengubah tiket tenant lain!"

    # 5) Token tenant-2 di tenant-nya sendiri -> 200 &0 tiket.
    status, own, _ = live_server.request(
        "GET", "/api/complaints", token=token_t2, tenant="TES-ISO",
    )
    assert status == 200
    assert own["total"] == 0
    assert own["items"] == []
