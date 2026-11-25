"""Struktur modul Fase 4A — dibuat SETELAH seluruh ekstraksi selesai."""
import importlib
import re
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]

MODUL = [
    "config", "ratelimit", "security", "complaints_lib", "sla", "notify",
    "metrics", "handler_base", "handler_admin", "handler_complaints",
    "handler_reports", "handler_public",
]


def test_semua_modul_ada_dan_bisa_diimpor():
    for m in MODUL:
        assert (SERVER_DIR / f"{m}.py").exists(), f"{m}.py belum dibuat"
        importlib.import_module(m)


def test_tidak_ada_modul_yang_mengimpor_app():
    for m in MODUL:
        src = (SERVER_DIR / f"{m}.py").read_text(encoding="utf-8")
        assert not re.search(r"^\s*(import app\b|from app import)", src, re.M), (
            f"{m}.py mengimpor app — melanggar DAG (siklus)"
        )


def test_app_tidak_lagi_mendefinisikan_handle():
    src = (SERVER_DIR / "app.py").read_text(encoding="utf-8")
    sisa = re.findall(r"^\s+def (handle_\w+|serve_static)\(", src, re.M)
    assert not sisa, f"masih ada handler di app.py (harusnya di mixin): {sisa}"


def test_besar_file_dalam_target():
    # Target spek: app <=450, modul <=600 — gerbang kasar +10% toleransi eksekusi.
    app_lines = len((SERVER_DIR / "app.py").read_text(encoding="utf-8").splitlines())
    assert app_lines <= 500, f"app.py {app_lines} baris (target <=500)"
    for m in MODUL:
        n = len((SERVER_DIR / f"{m}.py").read_text(encoding="utf-8").splitlines())
        assert n <= 650, f"{m}.py {n} baris (target <=650)"
