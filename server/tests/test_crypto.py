"""Test unit kriptografi & util keamanan backend (tanpa server).

Mencakup: hash password (pbkdf2 + legacy), token HMAC-SHA256, resolusi
kunci rahasia (K1: produksi gagal keras), loader .env (Fase 2), dan
redaksi log (K4).
"""

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

import app as app_mod
from db import hash_pw, needs_rehash, verify_pw


# --------------------------------------------------------------------------
# Hashing password
# --------------------------------------------------------------------------
def test_hash_pw_lalu_verify_benar():
    h = hash_pw("rahasia123")
    assert h.startswith("pbkdf2_sha256$")
    assert verify_pw("rahasia123", h) is True
    assert verify_pw("salah", h) is False


def test_hash_pw_acak_salt_unik():
    # Salt berbeda tiap panggilan -> hash berbeda untuk password sama.
    assert hash_pw("sama") != hash_pw("sama")


def test_verify_pw_kosong_dan_rusak():
    assert verify_pw("x", "") is False
    assert verify_pw("x", "pbkdf2_sha256$hanya-dua-bagian") is False


def test_legacy_sha256_masih_divalidasi_tapi_perlu_rehash():
    legacy = hashlib.sha256(b"monsa-mks-salt::lama123").hexdigest()
    assert verify_pw("lama123", legacy) is True
    assert verify_pw("salah", legacy) is False
    assert needs_rehash(legacy) is True
    assert needs_rehash(hash_pw("baru")) is False


# --------------------------------------------------------------------------
# Token HMAC (create/verify)
# --------------------------------------------------------------------------
def test_token_roundtrip_sah():
    # uid 4 = admin_sekolah pada seed; role yang dikembalikan diambil dari DB
    # (bukan dari payload) sehingga token tidak bisa dipakai menaikkan peran.
    tok = app_mod.create_token(4, "admin_sekolah", 1, 1)
    user = app_mod.verify_token(tok)
    assert user is not None
    assert user["id"] == 4
    assert user["role"] == "admin_sekolah"
    assert "password_hash" not in user
    assert "token_version" not in user


def test_token_signature_dipalsukan_ditolak():
    tok = app_mod.create_token(1, "admin_sekolah", 1, 1)
    b64, sig = tok.split(".", 1)
    forged = b64 + "." + ("0" if sig[0] != "0" else "1") + sig[1:]
    assert app_mod.verify_token(forged) is None


def test_token_key_lama_ditolak():
    # Forge token dengan kunci hardcoded lama (temuan audit K1).
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
    assert app_mod.verify_token(f"{b64}.{sig}") is None


def test_token_kedaluwarsa_ditolak():
    payload = json.dumps(
        {"uid": 1, "role": "admin_sekolah", "tid": 1, "tv": 1,
         "exp": int(time.time()) - 60},
        separators=(",", ":"),
    ).encode("utf-8")
    b64 = base64.urlsafe_b64encode(payload).decode("ascii")
    sig = hmac.new(app_mod.SECRET_KEY, b64.encode("ascii"), hashlib.sha256).hexdigest()
    assert app_mod.verify_token(f"{b64}.{sig}") is None


def test_token_uid_tidak_ada_ditolak():
    assert app_mod.verify_token(app_mod.create_token(999999, "orang_tua", 1, 1)) is None


def test_token_sampah_ditolak():
    assert app_mod.verify_token("") is None
    assert app_mod.verify_token("tanpa-titik") is None
    assert app_mod.verify_token("a.b") is None
    assert app_mod.verify_token(None) is None


# --------------------------------------------------------------------------
# K1: resolusi kunci rahasia
# --------------------------------------------------------------------------
def test_dev_tanpa_kunci_dapat_kunci_acak(monkeypatch):
    monkeypatch.delenv("MONSA_SECRET_KEY", raising=False)
    monkeypatch.delenv("MONSA_ENV", raising=False)
    monkeypatch.delenv("MONSA_DISABLE_DEMO", raising=False)
    key1 = app_mod._resolve_secret_key()
    key2 = app_mod._resolve_secret_key()
    assert isinstance(key1, bytes) and len(key1) == 64  # token_hex(32)
    assert key1 != key2  # acak, bukan default tetap


def test_produksi_tanpa_kunci_gagal_keras(monkeypatch):
    monkeypatch.delenv("MONSA_SECRET_KEY", raising=False)
    monkeypatch.setenv("MONSA_ENV", "production")
    with pytest.raises(SystemExit) as exc:
        app_mod._resolve_secret_key()
    assert exc.value.code == 1


def test_produksi_kunci_pendek_gagal_keras(monkeypatch):
    monkeypatch.setenv("MONSA_ENV", "production")
    monkeypatch.setenv("MONSA_SECRET_KEY", "pendek-sekali")  # < 32 karakter
    with pytest.raises(SystemExit) as exc:
        app_mod._resolve_secret_key()
    assert exc.value.code == 1


def test_produksi_kunci_panjang_diterima(monkeypatch):
    monkeypatch.setenv("MONSA_ENV", "production")
    monkeypatch.setenv("MONSA_SECRET_KEY", "a" * 32)
    assert app_mod._resolve_secret_key() == b"a" * 32


def test_produksi_lewat_disable_demo_juga_ketat(monkeypatch):
    monkeypatch.delenv("MONSA_SECRET_KEY", raising=False)
    monkeypatch.delenv("MONSA_ENV", raising=False)
    monkeypatch.setenv("MONSA_DISABLE_DEMO", "1")
    with pytest.raises(SystemExit):
        app_mod._resolve_secret_key()


def test_dev_kunci_pendek_diizinkan(monkeypatch):
    # Hanya produksi yang menuntut >= 32 karakter.
    monkeypatch.delenv("MONSA_ENV", raising=False)
    monkeypatch.delenv("MONSA_DISABLE_DEMO", raising=False)
    monkeypatch.setenv("MONSA_SECRET_KEY", "pendek")
    assert app_mod._resolve_secret_key() == b"pendek"


# --------------------------------------------------------------------------
# Loader .env (Fase 2)
# --------------------------------------------------------------------------
def test_load_dotenv_parse_dan_tidak_timpa_env(tmp_path, monkeypatch):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# komentar harus diabaikan\n"
        "\n"
        "FOO_MONSA_UJI=1\n"
        'BAR_MONSA_UJI="dua tiga"\n'
        "KUTIP_MONSA_UJI='satu'\n"
        "BARIS_TANPA_TANDA_SAMA\n"
        "=tanpa-kunci\n"
        "1BAD_KEY=x\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("BAR_MONSA_UJI", "dari_shell")  # sudah ada -> jangan ditimpa
    monkeypatch.delenv("FOO_MONSA_UJI", raising=False)
    monkeypatch.delenv("KUTIP_MONSA_UJI", raising=False)

    loaded = app_mod._load_dotenv(str(env_file))

    assert loaded == 2  # FOO + KUTIP (BAR sudah terisi dari shell)
    assert os.environ.get("FOO_MONSA_UJI") == "1"
    assert os.environ.get("BAR_MONSA_UJI") == "dari_shell"  # tidak ditimpa
    assert os.environ.get("KUTIP_MONSA_UJI") == "satu"
    assert os.environ.get("BAD_KEY") is None  # key tidak valid dibuang


def test_load_dotenv_file_tidak_ada(tmp_path):
    assert app_mod._load_dotenv(str(tmp_path / "tidak-ada.env")) == 0


def test_load_dotenv_toleran_bom(tmp_path, monkeypatch):
    # File .env yang disimpan Notepad Windows / PowerShell -Encoding utf8
    # memakai BOM UTF-8 — loader tidak boleh menolaknya secara diam-diam.
    env_file = tmp_path / ".env"
    env_file.write_bytes(
        b"\xef\xbb\xbf"  # BOM UTF-8
        b"PORT_MONSA_UJI=8127\n"
        b"MONSA_BIND=\n"
    )
    monkeypatch.delenv("PORT_MONSA_UJI", raising=False)
    monkeypatch.delenv("MONSA_BIND", raising=False)

    loaded = app_mod._load_dotenv(str(env_file))

    assert loaded == 2
    assert os.environ.get("PORT_MONSA_UJI") == "8127"
    assert os.environ.get("MONSA_BIND") == ""


# --------------------------------------------------------------------------
# K4: redaksi log
# --------------------------------------------------------------------------
def test_redact_sembunyikan_pin_token_password():
    line = (
        "POST /api/complaints/guest-track?ticket_code=ADU-MONSA-0001"
        "&pin=654321&token=abc.def&password=rahasia&api_key=zzz&q=bebas HTTP/1.1"
    )
    out = app_mod.SikolaHandler._redact(line)
    for rahasia in ("654321", "abc.def", "rahasia", "zzz"):
        assert rahasia not in out, f"rahasia {rahasia!r} bocor ke log"
    for sudah_diredaksi in ("pin=***", "token=***", "password=***", "api_key=***"):
        assert sudah_diredaksi in out
    # Parameter biasa tidak tersentuh.
    assert "ticket_code=ADU-MONSA-0001" in out
    assert "q=bebas" in out


def test_redact_pesan_normal_tidak_berubah():
    line = 'GET /api/health HTTP/1.1" 200'
    assert app_mod.SikolaHandler._redact(line) == line
