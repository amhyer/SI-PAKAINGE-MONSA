import re
from db import now_iso, open_conn


def tokenize(text: str) -> set:
    return set(re.findall(r"[a-z0-9]+", (text or "").lower()))


def search_kb(conn, tenant_id: int, query: str, limit: int = 3):
    q_tokens = tokenize(query)
    rows = conn.execute("SELECT * FROM knowledge_base WHERE tenant_id = ?", (tenant_id,)).fetchall()
    scored = []
    for row in rows:
        hay = tokenize(f"{row['topic']} {row['keywords']} {row['summary']} {row['details']}")
        score = len(q_tokens & hay)
        if score > 0:
            scored.append((score, dict(row)))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored[:limit]]


def generate_chat_reply(question: str, user: dict, tenant_id: int) -> dict:
    clean_question = (question or "").strip()[:800]
    q_low = clean_question.lower()
    role = user.get("role", "orang_tua")
    uid = user.get("id")

    with open_conn() as conn:
        school = conn.execute("SELECT * FROM school_tenants WHERE id = ?", (tenant_id,)).fetchone()
        school_name = school["name"] if school else "UPTD SPF SDN Unggulan Mongisidi 1"
        kb_hits = search_kb(conn, tenant_id, clean_question, limit=3)

        is_status_query = any(w in q_low for w in ["status", "tiket", "adu-", "laporanku", "laporan saya", "progres", "sampai mana"])
        is_summary_query = any(w in q_low for w in ["rekap", "jumlah", "berapa", "statistik", "masuk", "selesai", "pekppp", "monev", "rentan", "ikm", "sla"])
        is_scale_query = any(w in q_low for w in ["banyak sekolah", "sekolah lain", "makassar", "multi", "tenant", "replikasi", "ekspansi"])
        is_maklumat_query = any(w in q_low for w in ["maklumat", "standar pelayanan", "biaya", "tarif", "gratis", "rp 0", "sk 421"])

        citations = [{"source": "SOP Resmi Sekolah", "title": h["topic"]} for h in kb_hits]
        parts = []
        actions = []

        if is_maklumat_query:
            sla_h = school["sla_hours"] if school and school["sla_hours"] else 24
            parts.append(
                f"**Standar Pelayanan & Maklumat Pelayanan Rp 0 ({school_name}):**\n"
                f"• **Biaya / Tarif:** **Rp 0 (100% GRATIS)**, Zona Integritas bebas pungutan liar.\n"
                f"• **Jangka Waktu (SLA):** Respon awal & tindak lanjut maksimal **<= {sla_h} jam kerja** dengan alarm keterlambatan otomatis.\n"
                "• **Persyaratan:** Tanpa syarat rumit; boleh mengirim secara **Anonim (UU PDP No. 27/2022)**.\n"
                "• **Dasar Hukum & Tim:** SK Inovasi SIMPEL `421.2/045` & SK Tim Pengelola `421.2/047` (Ketua: Andi Windayani, S.Pd., M.Pd.)."
            )
            citations.append({"source": "Standar Pelayanan", "title": "Maklumat Rp 0 & SK 421.2/047"})

        if is_scale_query:
            parts.append(
                f"**Arsitektur Pemilik Tunggal & Kesiapan Banyak Sekolah Makassar:**\n"
                f"Saat ini aplikasi dimiliki secara tunggal oleh **{school_name}** (`{school['tenant_code']}`). "
                "Namun seluruh database memakai isolasi `tenant_id` di tabel `school_tenants`, sehingga sekolah lain di Makassar bisa bergabung di masa depan lewat:\n"
                "1. **Mode Kode/QR Sekolah:** Satu backend melayani banyak sekolah terpisah.\n"
                "2. **Mode White-Label (1 Sekolah 1 APK):** Build mandiri per sekolah tanpa mengubah kode inti."
            )
            citations.append({"source": "Arsitektur Sistem", "title": "Isolasi Multi-Tenant (school_tenants)"})

        if is_status_query or is_summary_query:
            if role in ("tppk_piket", "admin_sekolah") and user.get("verification_status") == "verified":
                total = conn.execute("SELECT COUNT(*) FROM complaints WHERE tenant_id = ?", (tenant_id,)).fetchone()[0]
                selesai = conn.execute("SELECT COUNT(*) FROM complaints WHERE tenant_id = ? AND status = 'Selesai'", (tenant_id,)).fetchone()[0]
                rentan_cnt = conn.execute(
                    "SELECT COUNT(*) FROM complaints WHERE tenant_id = ? AND (needs_priority_assistance = 1 OR (vulnerable_group != '' AND vulnerable_group != 'Umum (Bukan Kelompok Rentan)'))",
                    (tenant_id,),
                ).fetchone()[0]
                proses = total - selesai
                parts.append(
                    f"**Ringkasan Aduan {school_name} (Akses Petugas/Kepsek):**\n"
                    f"• Total pengaduan masuk: **{total}** ({selesai} selesai, {proses} sedang diproses)\n"
                    f"• Aduan Prioritas Kelompok Rentan / Inklusi: **{rentan_cnt}**\n"
                    "Anda dapat mengunduh **Laporan Monev & FKP (PEKPPP 05B/06B)** langsung di tab **Pantau** atau **Akun**."
                )
                citations.append({"source": "Data Live Sekolah", "title": "Rekap Pengaduan & Monev PEKPPP"})
            else:
                if uid:
                    my_rows = conn.execute(
                        "SELECT ticket_code, category, status, staff_note FROM complaints WHERE tenant_id = ? AND user_id = ? ORDER BY id DESC LIMIT 3",
                        (tenant_id, uid),
                    ).fetchall()
                    if my_rows:
                        lines = []
                        for r in my_rows:
                            note = f" — Catatan: {r['staff_note']}" if r["staff_note"] else ""
                            lines.append(f"• **{r['ticket_code']}** ({r['category']}): **{r['status']}**{note}")
                        parts.append("**Status Pengaduan Anda:**\n" + "\n".join(lines))
                        citations.append({"source": "Data Tiket Anda", "title": "Pelacakan Pengaduan Pribadi"})
                    else:
                        parts.append(f"Anda belum memiliki tiket pengaduan di {school_name}. Buka tab **Lapor** untuk mengirim laporan baru.")
                else:
                    total = conn.execute("SELECT COUNT(*) FROM complaints WHERE tenant_id = ?", (tenant_id,)).fetchone()[0]
                    selesai = conn.execute("SELECT COUNT(*) FROM complaints WHERE tenant_id = ? AND status = 'Selesai'", (tenant_id,)).fetchone()[0]
                    parts.append(
                        f"**Publikasi Rekap Transparan {school_name}:**\n"
                        f"Tercatat **{total}** pengaduan masuk dan **{selesai}** telah diselesaikan. Silakan masuk di tab **Akun** untuk melacak tiket pribadi Anda."
                    )

        if kb_hits:
            for h in kb_hits[:2]:
                parts.append(f"**{h['topic']}**\n{h['summary']}\n{h['details']}")
                if h.get("action_label"):
                    actions.append({"tab": h.get("action_tab", "lapor"), "label": h["action_label"]})
        elif not parts:
            parts.append(
                f"Saya Asisten Resmi **{school_name}** (Kepala Sekolah: **{school['principal_name']}**, NPSN `{school['npsn']}`).\n"
                "Tanyakan seputar:\n"
                "• Cara mengirim pengaduan **Anonim** & **Prioritas Kelompok Rentan / Inklusi**\n"
                "• Integrasi **PEKPPP (04, 05, 06 SIMPEL)** & **SP4N-LAPOR!** (`lapor.go.id`)\n"
                "• Status tiket pengaduan & cara ekspor **Laporan Monev / FKP**"
            )

        answer = "\n\n".join(parts)
        conn.execute(
            "INSERT INTO chat_logs (tenant_id, user_id, user_role, question, answer, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (tenant_id, uid, role, clean_question, answer, now_iso()),
        )
        conn.commit()

    dedup = []
    seen = set()
    for a in actions:
        key = (a["tab"], a["label"])
        if key not in seen:
            seen.add(key)
            dedup.append(a)

    return {"answer": answer, "citations": citations, "actions": dedup[:2]}
