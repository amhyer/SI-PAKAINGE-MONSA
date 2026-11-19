"""Notifikasi 2-arah (webhook/SMTP) + worker asinkron (Fase 4A).

_NOTIF_QUEUE/_NOTIF_WORKER = SATU instance untuk seluruh proses
(invariant spec §3.4); worker dinyalakan malas oleh _enqueue_notif.
"""
import json
import os
import queue
import smtplib
import threading
import urllib.parse
import urllib.request
from email.mime.text import MIMEText

from complaints_lib import normalize_wa_number
from db import now_iso, open_conn


# --- Notifikasi async (Fase 2) -------------------------------------------
# Pengiriman webhook (timeout 4 dtk) & SMTP (timeout 5 dtk) dipindah ke worker
# daemon agar thread request tidak menahan respons pengguna.
_NOTIF_QUEUE = queue.Queue(maxsize=200)
_NOTIF_WORKER = None


def _post_webhook(webhook_url: str, payload: dict) -> bool:
    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=4):
            return True
    except Exception:
        return False


def _send_smtp_email(to_addr: str, subject: str, body_text: str, from_addr: str = "") -> bool:
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    if not smtp_host or not to_addr:
        return False
    try:
        msg = MIMEText(body_text, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = from_addr or os.environ.get("SMTP_FROM", to_addr)
        msg["To"] = to_addr
        with smtplib.SMTP(smtp_host, int(os.environ.get("SMTP_PORT", "587")), timeout=5) as srv:
            if os.environ.get("SMTP_TLS", "1") == "1":
                srv.starttls()
            if os.environ.get("SMTP_USER"):
                srv.login(os.environ["SMTP_USER"], os.environ.get("SMTP_PASS", ""))
            srv.send_message(msg)
        return True
    except Exception:
        return False


def _update_notif_status(log_id: int, status: str):
    try:
        with open_conn() as conn:
            conn.execute("UPDATE notification_logs SET status = ? WHERE id = ?", (status, log_id))
            conn.commit()
    except Exception:
        pass


def _notif_worker_loop():
    while True:
        job = _NOTIF_QUEUE.get()
        try:
            job()
        except Exception:
            pass
        finally:
            _NOTIF_QUEUE.task_done()


def _enqueue_notif(job, fallback=None):
    """Antrekan pengiriman ke worker. Bila antrean penuh, jalankan sinkron
    (fallback) agar notifikasi tidak hilang diam-diam."""
    global _NOTIF_WORKER
    if _NOTIF_WORKER is None or not _NOTIF_WORKER.is_alive():
        _NOTIF_WORKER = threading.Thread(target=_notif_worker_loop, daemon=True, name="monsa-notif")
        _NOTIF_WORKER.start()
    try:
        _NOTIF_QUEUE.put_nowait(job)
    except queue.Full:
        try:
            (fallback or job)()
        except Exception:
            pass


def dispatch_notifications(school: dict, item: dict) -> dict:
    wa_num = normalize_wa_number(school.get("notify_whatsapp") or "6281355982195")
    email_to = (school.get("notify_email") or school.get("email") or "sdnungmongisidi1@gmail.com").strip()
    urgent_tag = "[DARURAT TPPK] " if item.get("urgency") == "Darurat Anak" else ""
    priority_tag = "[PRIORITAS INKLUSI] " if item.get("needs_priority_assistance") else ""
    dis_note = f" | Kebutuhan Khusus: {item['disability_type']}" if item.get("disability_type") else ""
    dis_bracket = f" [{item['disability_type']}]" if item.get("disability_type") else ""
    summary = (
        f"{urgent_tag}{priority_tag}[{item['ticket_code']}] Aduan baru ({item['urgency']}) - {item['category']}{dis_note} | "
        f"Unit: {item['routed_to']} | Lokasi: {item.get('location_detail') or '-'}"
    )
    wa_msg = (
        f"*NOTIFIKASI SI-PAKAINGE MONSA - {school['short_name']}*\n"
        f"Kode Tiket: *{item['ticket_code']}*\n"
        f"Kategori: {item['category']}\n"
        f"Urgensi: *{item['urgency']}*{(' (PRIORITAS INKLUSI / RENTAN)' if item.get('needs_priority_assistance') else '')}{dis_bracket}\n"
        f"Unit Tujuan: {item['routed_to']}\n"
        f"Lokasi: {item.get('location_detail') or '-'}\n"
        f"Pelapor: {item['reporter_display_name']}\n"
        f"Ringkasan: {(item['description'] or '')[:180]}"
    )
    wa_link = f"https://wa.me/{wa_num}?text={urllib.parse.quote(wa_msg)}"
    subj = f"[{item['ticket_code']}] Aduan Baru SI-PAKAINGE MONSA"
    mailto_link = f"mailto:{urllib.parse.quote(email_to)}?subject={urllib.parse.quote(subj)}&body={urllib.parse.quote(wa_msg.replace('*', ''))}"

    # 1) Webhook & SMTP dikirim ASYNC oleh worker (Fase 2): thread request tidak
    #    lagi menahan timeout jaringan (4 dtk webhook + 5 dtk SMTP).
    webhook_url = (school.get("webhook_url") or os.environ.get("MONSA_WEBHOOK_URL") or "").strip()
    smtp_host = os.environ.get("SMTP_HOST", "").strip()
    do_webhook = bool(webhook_url)
    do_smtp = bool(smtp_host and email_to)
    webhook_status = "antre_async" if do_webhook else "siap_kirim_manual"
    email_status = "antre_async" if do_smtp else "siap_mailto"

    ts = now_iso()
    with open_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO notification_logs (
                tenant_id, complaint_id, ticket_code, target_user_id, direction,
                channel, recipient, status, summary, staff_note_snapshot, wa_link, mailto_link, is_read, created_at
            ) VALUES (?, ?, ?, NULL, 'to_school', 'whatsapp_&_inapp', ?, ?, ?, '', ?, ?, 0, ?)
            """,
            (school["id"], item["id"], item["ticket_code"], f"WA {wa_num} | {email_to}", f"{webhook_status} / {email_status}", summary, wa_link, mailto_link, ts),
        )
        log_id = cur.lastrowid
        conn.commit()

    if do_webhook or do_smtp:
        def _job():
            wh = "siap_kirim_manual"
            if do_webhook:
                wh = "terkirim_webhook" if _post_webhook(
                    webhook_url,
                    {"ticket_code": item["ticket_code"], "phone": wa_num, "email": email_to, "message": wa_msg},
                ) else "gagal_webhook_fallback_manual"
            em = "siap_mailto"
            if do_smtp:
                em = "terkirim_smtp" if _send_smtp_email(
                    email_to,
                    f"[{item['ticket_code']}] Aduan Baru - {school['short_name']}",
                    wa_msg.replace("*", ""),
                    os.environ.get("SMTP_FROM", email_to),
                ) else "gagal_smtp_fallback_mailto"
            _update_notif_status(log_id, f"{wh} / {em}")
        _enqueue_notif(_job, fallback=_job)
    return {
        "wa_link": wa_link,
        "mailto_link": mailto_link,
        "recipient_wa": wa_num,
        "recipient_email": email_to,
        "status": f"{webhook_status} / {email_status}",
    }


def dispatch_reporter_notification(school: dict, item: dict, reporter_contact: str = "") -> dict:
    is_anon = bool(item.get("is_anonymous"))
    is_guest = bool(item.get("is_guest"))
    contact = reporter_contact or ""

    wa_link = ""
    mailto_link = ""
    recipient_label = "Lacak Tiket Publik (Mode Tamu)" if is_guest else "Kotak Masuk Aplikasi (Anonim UU PDP)"
    channel = "guest_track_pin" if is_guest else "inapp_anonim"

    status_text = item.get("status") or "Diproses"
    note_text = (item.get("staff_note") or "").strip() or "Tim sekolah telah memperbarui progres penanganan aduan Anda."
    summary = f"[{item['ticket_code']}] Tindak Lanjut: {status_text}"
    msg_body = (
        f"*PEMBERITAHUAN TINDAK LANJUT SI-PAKAINGE MONSA - {school['short_name']}*\n"
        f"Kode Tiket: *{item['ticket_code']}*\n"
        f"Kategori: {item['category']}\n"
        f"Status Terbaru: *{status_text}*\n"
        f"Tanggapan Sekolah: {note_text}\n\n"
        f"Silakan buka tab Pantau pada aplikasi SI-PAKAINGE MONSA untuk melihat detail"
        f"{' dan memberi penilaian bintang (1-5).' if status_text == 'Selesai' else '.'}"
    )

    ext_status = "tercatat_untuk_lacak_tamu" if is_guest else "terkirim_kotak_masuk_aplikasi"
    pending = None  # (jenis, ...) -> dikirim async oleh worker setelah log tercatat
    if not is_anon and not is_guest and contact and not contact.endswith(".local"):
        recipient_label = contact
        if "@" in contact:
            channel = "inapp_&_email"
            subj = f"[{item['ticket_code']}] Update Status: {status_text} - SI-PAKAINGE MONSA"
            mailto_link = f"mailto:{urllib.parse.quote(contact)}?subject={urllib.parse.quote(subj)}&body={urllib.parse.quote(msg_body.replace('*', ''))}"
            if os.environ.get("SMTP_HOST", "").strip():
                ext_status = "antre_async"
                pending = ("smtp", subj)
            else:
                ext_status = "terkirim_inapp_siap_mailto"
        else:
            digits = "".join(ch for ch in contact if ch.isdigit())
            if len(digits) >= 8:
                wa_num = normalize_wa_number(contact)
                channel = "inapp_&_whatsapp"
                wa_link = f"https://wa.me/{wa_num}?text={urllib.parse.quote(msg_body)}"
                webhook_url = (school.get("webhook_url") or os.environ.get("MONSA_WEBHOOK_URL") or "").strip()
                if webhook_url:
                    ext_status = "antre_async"
                    pending = ("webhook", webhook_url, wa_num)
                else:
                    ext_status = "terkirim_inapp_siap_wa"

    ts = now_iso()
    with open_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO notification_logs (
                tenant_id, complaint_id, ticket_code, target_user_id, direction,
                channel, recipient, status, summary, staff_note_snapshot, wa_link, mailto_link, is_read, created_at
            ) VALUES (?, ?, ?, ?, 'to_reporter', ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (school["id"], item["id"], item["ticket_code"], item["user_id"], channel, recipient_label, ext_status, summary, note_text, wa_link, mailto_link, ts),
        )
        log_id = cur.lastrowid
        conn.commit()

    if pending:
        def _job():
            if pending[0] == "smtp":
                ok = _send_smtp_email(
                    contact,
                    pending[1],
                    msg_body.replace("*", ""),
                    os.environ.get("SMTP_FROM", school.get("email") or "sdnungmongisidi1@gmail.com"),
                )
                st = "terkirim_inapp_&_smtp" if ok else "terkirim_inapp_siap_mailto"
            else:
                ok = _post_webhook(
                    pending[1],
                    {"ticket_code": item["ticket_code"], "phone": pending[2], "message": msg_body, "direction": "to_reporter"},
                )
                st = "terkirim_inapp_&_webhook_wa" if ok else "terkirim_inapp_siap_wa"
            _update_notif_status(log_id, st)
        _enqueue_notif(_job, fallback=_job)
    return {
        "is_anonymous_protected": is_anon,
        "recipient": recipient_label,
        "wa_link": wa_link,
        "mailto_link": mailto_link,
        "status": ext_status,
        "summary": summary,
    }
