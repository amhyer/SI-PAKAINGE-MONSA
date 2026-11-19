"""Test paginasi GET /api/complaints (Fase 2): limit/page/total/has_more."""

import math

import pytest


@pytest.fixture(scope="module")
def admin_token(live_server):
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    return data["token"]


@pytest.fixture(scope="module")
def baseline(live_server, admin_token):
    """Respons default sebagai acuan jumlah total tiket."""
    status, data, _ = live_server.request("GET", "/api/complaints", token=admin_token)
    assert status == 200
    return data


def test_default_batas_100_dan_total(live_server, admin_token, baseline):
    assert baseline["limit"] == 100
    assert len(baseline["items"]) == baseline["total"]
    assert baseline["has_more"] is False
    assert baseline["total"] >= 3  # minimal seed


def test_limit_3_mengembalikan_3_dengan_total(live_server, admin_token, baseline):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?page=1&limit=3", token=admin_token,
    )
    assert status == 200
    total = baseline["total"]
    assert len(data["items"]) == 3
    assert data["total"] == total  # total selalu jumlah penuh
    assert data["has_more"] is True
    assert data["page"] == 1
    assert data["limit"] == 3


def test_halaman_terakhir(live_server, admin_token, baseline):
    total = baseline["total"]
    pages = math.ceil(total / 3)
    status, data, _ = live_server.request(
        "GET", f"/api/complaints?page={pages}&limit=3", token=admin_token,
    )
    assert status == 200
    assert len(data["items"]) == total - (pages - 1) * 3
    assert data["has_more"] is False


def test_all_1_mengambil_semua(live_server, admin_token, baseline):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?all=1", token=admin_token,
    )
    assert status == 200
    assert len(data["items"]) == baseline["total"]


def test_limit_besar_dipangkas_ke_200(live_server, admin_token):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?limit=9999", token=admin_token,
    )
    assert status == 200
    assert data["limit"] == 200


def test_limit_negatif_dipaksa_positif(live_server, admin_token, baseline):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?limit=-5", token=admin_token,
    )
    assert status == 200
    assert data["limit"] >= 1
    assert len(data["items"]) <= baseline["total"]


def test_limit_tidak_valid_pakai_default(live_server, admin_token):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?limit=abc", token=admin_token,
    )
    assert status == 200
    assert data["limit"] == 100


def test_page_nol_dipaksa_satu(live_server, admin_token, baseline):
    status, data, _ = live_server.request(
        "GET", "/api/complaints?page=0&limit=3", token=admin_token,
    )
    assert status == 200
    assert data["page"] == 1
    assert len(data["items"]) == min(3, baseline["total"])


def test_orang_tua_hanya_melihat_tiketnya(live_server):
    status, parent = live_server.login("081241001101", "demo123")
    assert status == 200
    status, data, _ = live_server.request(
        "GET", "/api/complaints", token=parent["token"],
    )
    assert status == 200
    assert data["total"] >= 1
    assert all(i["user_id"] == parent["user"]["id"] for i in data["items"])
