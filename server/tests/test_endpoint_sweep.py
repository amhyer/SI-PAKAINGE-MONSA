"""Sweep GET seluruh route utama (read-only) — jaring pengaman ekstraksi handler.

Setiap handler GET wajib mengembalikan 200 pada data seed. Test ini yang
menangkap route yang rusak tapi tidak disentuh test lain (monev, ikm/rtl, dll).
"""
import pytest


@pytest.fixture(scope="module")
def admin_token(live_server):
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    return data["token"]


GET_PUBLIK = [
    "/api/health", "/api/app-info", "/api/public-recap",
    "/api/public/fkp", "/",
]
GET_AUTH = [
    "/api/bootstrap", "/api/complaints", "/api/evaluations", "/api/ikm",
    "/api/ikm/rtl", "/api/notifications", "/api/reports/monev",
    "/api/tenants", "/api/auth/me", "/api/admin/users",
]


@pytest.mark.parametrize("path", GET_PUBLIK)
def test_get_publik_200(live_server, path):
    status, _, _ = live_server.request("GET", path)
    assert status == 200, f"{path} -> {status}, seharusnya 200"


@pytest.mark.parametrize("path", GET_AUTH)
def test_get_admin_200(live_server, admin_token, path):
    status, _, _ = live_server.request("GET", path, token=admin_token)
    assert status == 200, f"{path} -> {status}, seharusnya 200"
