#!/usr/bin/env python3
"""
Skrip Backup Harian Aman SQLite (Online Backup API, kompatibel dengan mode WAL).
Menyimpan hasil cadangan ke server/backups/ dan mempertahankan maksimal 30 arsip terbaru.
Jalankan manual atau via cron:
  0 2 * * * /usr/bin/python3 /opt/sikola-makassar/scripts/backup_db.py
"""

import argparse
import pathlib
import sqlite3
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "server" / "sikola_monsa.db"
DEFAULT_OUT = ROOT / "server" / "backups"


def backup_sqlite(db_path: pathlib.Path, out_dir: pathlib.Path, keep: int = 30) -> pathlib.Path:
    if not db_path.exists():
        raise FileNotFoundError(f"Database tidak ditemukan: {db_path}")
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = out_dir / f"sikola_monsa-{stamp}.db"

    src_conn = sqlite3.connect(str(db_path), timeout=20.0)
    dst_conn = sqlite3.connect(str(dest))
    try:
        src_conn.backup(dst_conn)
    finally:
        dst_conn.close()
        src_conn.close()

    archives = sorted(out_dir.glob("sikola_monsa-*.db"), key=lambda p: p.stat().st_mtime, reverse=True)
    for old in archives[keep:]:
        old.unlink(missing_ok=True)
    return dest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backup harian aman database SI-PAKAINGE MONSA")
    parser.add_argument("--db", type=pathlib.Path, default=DEFAULT_DB)
    parser.add_argument("--out", type=pathlib.Path, default=DEFAULT_OUT)
    parser.add_argument("--keep", type=int, default=30)
    args = parser.parse_args()
    saved = backup_sqlite(args.db, args.out, args.keep)
    print(f"Backup sukses: {saved} ({saved.stat().st_size:,} bytes)")
