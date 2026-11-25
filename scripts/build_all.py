#!/usr/bin/env python3
"""
Skrip Build & Validasi Terpadu SI-PAKAINGE MONSA.
Menjalankan:
  1. Pemeriksaan sintaks Python (server/*.py)
  2. Vite production build -> web_bundle/
  3. Capacitor sync -> frontend/android/
  4. Pembentukan ulang SIKOLA-Plus-Interactive.html (1-file portabel)
  5. Audit tombol JSX (<button>) & paritas API offline (localFallback.js)
"""

import pathlib
import py_compile
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
SERVER = ROOT / "server"
WEB_BUNDLE = ROOT / "web_bundle"
HTML_OUT = ROOT / "SIKOLA-Plus-Interactive.html"


def run(cmd, cwd=ROOT):
    print(f"\n>>> {' '.join(cmd)}")
    res = subprocess.run(cmd, cwd=str(cwd))
    if res.returncode != 0:
        sys.exit(res.returncode)


def check_python():
    print("1. Memeriksa sintaks Python (server/*.py)...")
    for pyf in sorted(SERVER.glob("*.py")):
        py_compile.compile(str(pyf), doraise=True)
        print(f"   OK: {pyf.name}")


def build_frontend_and_android():
    npm_cmd = shutil.which("npm") or "npm"
    npx_cmd = shutil.which("npx") or "npx"
    if not (FRONTEND / "node_modules").exists():
        print("2a. Memasang dependensi npm frontend...")
        run([npm_cmd, "install", "--no-audit", "--no-fund"], cwd=FRONTEND)
    print("2b. Build Vite produksi -> web_bundle/...")
    run([npm_cmd, "run", "build"], cwd=FRONTEND)
    print("3. Sinkronisasi aset ke Android Capacitor...")
    run([npx_cmd, "cap", "sync", "android"], cwd=FRONTEND)


def build_interactive_html():
    print("4. Membangun SIKOLA-Plus-Interactive.html...")
    html = (WEB_BUNDLE / "index.html").read_text(encoding="utf-8")
    css_file = next((WEB_BUNDLE / "assets").glob("*.css"))
    js_file = next((WEB_BUNDLE / "assets").glob("*.js"))
    css_text = css_file.read_text(encoding="utf-8")
    js_text = js_file.read_text(encoding="utf-8").replace("</script>", r"<\/script>")
    html = re.sub(
        r"<link[^>]+rel=[\"']stylesheet[\"'][^>]*>",
        lambda _m: f"<style>{css_text}</style>",
        html,
    )
    html = re.sub(
        r"<script[^>]+src=[\"'][^\"']+[\"'][^>]*></script>",
        lambda _m: f'<script type="module">{js_text}</script>',
        html,
    )
    html = re.sub(r"<link[^>]+rel=[\"']manifest[\"'][^>]*>", "", html)
    HTML_OUT.write_text(html, encoding="utf-8")
    print(f"   OK: {HTML_OUT.name} ({HTML_OUT.stat().st_size:,} bytes)")


def audit_jsx_and_fallback():
    print("5. Audit JSX <button> & paritas localFallback.js...")
    buttons = 0
    unwired = []
    for p in (FRONTEND / "src").rglob("*.jsx"):
        txt = p.read_text(encoding="utf-8")
        for m in re.finditer(r"<button\b([^>]*)>", txt, re.S):
            buttons += 1
            attrs = m.group(1)
            if "onClick" not in attrs and 'type="submit"' not in attrs and "type={'submit'}" not in attrs:
                unwired.append((p.name, attrs.strip()[:60]))
    print(f"   JSX <button> terhubung: {buttons - len(unwired)}/{buttons}")
    if unwired:
        print("   PERINGATAN tombol tanpa aksi:", unwired)
        sys.exit(1)

    node_cmd = shutil.which("node")
    if node_cmd:
        test_js = (
            "globalThis.localStorage={_d:{},getItem(k){return this._d[k]??null},"
            "setItem(k,v){this._d[k]=String(v)},removeItem(k){delete this._d[k]}};"
            f"const {{handleLocalApi}}=await import('{(FRONTEND / 'src' / 'localFallback.js').as_uri()}');"
            "const info=await handleLocalApi('/api/app-info',{method:'GET'});"
            "if(!info?.version||!info?.specs?.length)throw new Error('app-info invalid');"
            "console.log('   OK localFallback parity: v'+info.version+' (build '+info.version_code+')');"
        )
        run([node_cmd, "--input-type=module", "-e", test_js], cwd=ROOT)


if __name__ == "__main__":
    check_python()
    build_frontend_and_android()
    build_interactive_html()
    audit_jsx_and_fallback()
    print("\nSELESAI: Semua build, sinkronisasi Android, HTML interaktif, dan audit sukses.")
