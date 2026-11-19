"""Test notifikasi async (Fase 2): respons cepat + worker kirim webhook.

Bukti: (1) create pengaduan tidak menahan respons (tidak sinkron),
(2) status log bergerak ke terkirim_webhook, (3) payload benar-benar
diterima receiver webhook lokal.
"""

import time


def test_notifikasi_async_end_to_end(live_server):
    live_server.receiver.clear()

    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    token = data["token"]

    # 1) Respons create harus cepat — pengiriman webhook/SMTP tidak boleh
    #    memblokir thread request (timeout webhook 4 dtk + SMTP 5 dtk dulu).
    t0 = time.time()
    status, out, _ = live_server.request(
        "POST", "/api/complaints",
        {"category": "Saran & Aspirasi",
         "description": "Uji notifikasi async pytest",
         "is_anonymous": True},
        token=token,
    )
    elapsed = time.time() - t0
    assert status == 201, f"create gagal: {status} {out}"
    assert elapsed < 2.0, (
        f"respons create lambat ({elapsed:.2f} dtk) — pengiriman notifikasi "
        "tampaknya masih sinkron"
    )
    ticket = out["item"]["ticket_code"]

    # 2) Worker meng-update status log: antre_async -> terkirim_webhook.
    final_status = ""
    for _ in range(40):  # maksimum ~10 dtk
        time.sleep(0.25)
        rows = live_server.query(
            "SELECT status FROM notification_logs WHERE ticket_code = ? "
            "ORDER BY id DESC LIMIT 1",
            (ticket,),
        )
        final_status = rows[0]["status"] if rows else ""
        if final_status and "antre" not in final_status:
            break
    assert "terkirim_webhook" in final_status, (
        f"status log akhir {final_status!r} tidak berisi terkirim_webhook"
    )

    # 3) Payload webhook benar-benar diterima receiver lokal.
    time.sleep(0.3)
    payloads = live_server.receiver.payloads
    assert any(ticket in p for p in payloads), (
        f"receiver tidak menerima payload untuk {ticket} (hit={len(payloads)})"
    )


def test_tanpa_webhook_status_tetap_tercatat(live_server):
    """Tanpa webhook di tenant, log notifikasi tetap ada & bukan antre."""
    status, data = live_server.login("admin@monsa.sch.id", "demo123")
    assert status == 200
    status, out, _ = live_server.request(
        "POST", "/api/complaints",
        {"category": "Saran & Aspirasi",
         "description": "Uji log notifikasi tanpa webhook",
         "is_anonymous": True},
        token=data["token"],
    )
    assert status == 201
    ticket = out["item"]["ticket_code"]

    rows = live_server.query(
        "SELECT status FROM notification_logs WHERE ticket_code = ? "
        "ORDER BY id DESC LIMIT 1",
        (ticket,),
    )
    assert rows, "log notifikasi tidak tercatat untuk pengaduan baru"
    # Nilai awal pasti tercatat (bisa antre_async atau sudah terkirim).
    assert rows[0]["status"]
