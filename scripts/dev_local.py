#!/usr/bin/env python3
"""
Launcher Pengembangan Lokal SI-PAKAINGE MONSA (Backend Port 8000 + Vite HMR Port 5173).
Jalankan: python3 scripts/dev_local.py
Tekan Ctrl+C untuk menghentikan kedua server secara bersamaan.
"""

import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
SERVER_SCRIPT = ROOT / "server" / "app.py"


def main():
    npm_cmd = shutil.which("npm") or "npm"
    if not (FRONTEND / "node_modules").exists():
        print("Memasang dependensi npm frontend terlebih dahulu...")
        subprocess.check_call([npm_cmd, "install", "--no-audit", "--no-fund"], cwd=str(FRONTEND))

    env = os.environ.copy()
    env.setdefault("PORT", "8000")

    print("Menyalakan Backend Python (http://127.0.0.1:8000)...")
    backend = subprocess.Popen([sys.executable, str(SERVER_SCRIPT)], cwd=str(ROOT), env=env)

    time.sleep(0.8)
    print("Menyalakan Vite Dev Server (http://localhost:5173) dengan proxy /api -> :8000...")
    frontend = subprocess.Popen([npm_cmd, "run", "dev"], cwd=str(FRONTEND), env=env)

    def shutdown(*_args):
        print("\nMenghentikan server pengembangan...")
        for proc in (frontend, backend):
            if proc.poll() is None:
                proc.terminate()
        for proc in (frontend, backend):
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    while True:
        if backend.poll() is not None or frontend.poll() is not None:
            shutdown()
        time.sleep(0.5)


if __name__ == "__main__":
    main()
