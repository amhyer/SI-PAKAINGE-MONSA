"""Agregasi IKM 9 unsur, evaluasi, rekap publik, dan markdown monev (Fase 4A)."""
from collections import Counter

from db import now_iso
from sla import compute_complaint_sla


IKM_ELEMENT_LABELS = [
    ("u1", "U1 - Persyaratan Pelayanan"),
    ("u2", "U2 - Sistem, Mekanisme & Prosedur"),
    ("u3", "U3 - Waktu Penyelesaian"),
    ("u4", "U4 - Biaya / Tarif (Rp 0 / Gratis)"),
    ("u5", "U5 - Produk Spesifikasi Pelayanan"),
    ("u6", "U6 - Kompetensi Pelaksana"),
    ("u7", "U7 - Perilaku Pelaksana"),
    ("u8", "U8 - Penanganan Pengaduan, Saran & Masukan"),
    ("u9", "U9 - Sarana & Prasarana"),
]


def get_ikm_grade(score: float, count: int) -> tuple:
    if count <= 0:
        return ("-", "Belum Ada Data Responden")
    if score >= 88.31:
        return ("A", "Sangat Baik")
    if score >= 76.61:
        return ("B", "Baik")
    if score >= 65.00:
        return ("C", "Kurang Baik")
    return ("D", "Tidak Baik")


def compute_ikm_summary(conn, tid: int) -> dict:
    rows = [dict(r) for r in conn.execute("SELECT * FROM ikm_surveys WHERE tenant_id = ? ORDER BY id DESC", (tid,)).fetchall()]
    cnt = len(rows)
    elements = []
    if cnt == 0:
        for key, label in IKM_ELEMENT_LABELS:
            elements.append({"key": key, "label": label, "nrr": 0.0, "nrr_tertimbang": 0.0, "konversi": 0.0})
        return {
            "respondent_count": 0,
            "ikm_score": 0.0,
            "grade": "-",
            "predicate": "Belum Ada Data Responden",
            "elements": elements,
            "lowest_element": None,
            "highest_element": None,
        }

    total_weighted = 0.0
    for key, label in IKM_ELEMENT_LABELS:
        avg_u = sum(int(r[key]) for r in rows) / cnt
        weighted = avg_u / 9.0
        total_weighted += weighted
        elements.append({
            "key": key,
            "label": label,
            "nrr": round(avg_u, 3),
            "nrr_tertimbang": round(weighted, 4),
            "konversi": round(avg_u * 25.0, 2),
        })
    ikm_score = round(total_weighted * 25.0, 2)
    grade, predicate = get_ikm_grade(ikm_score, cnt)
    sorted_els = sorted(elements, key=lambda x: x["nrr"])
    return {
        "respondent_count": cnt,
        "ikm_score": ikm_score,
        "grade": grade,
        "predicate": predicate,
        "elements": elements,
        "lowest_element": sorted_els[0],
        "highest_element": sorted_els[-1],
    }


def compute_evaluation_summary(conn, tid: int) -> dict:
    evals = [dict(r) for r in conn.execute("SELECT * FROM service_evaluations WHERE tenant_id = ? ORDER BY id DESC", (tid,)).fetchall()]
    cnt = len(evals)
    avg_app = round(sum(e["app_rating"] for e in evals) / cnt, 2) if cnt else 0.0
    avg_school = round(sum(e["school_response_rating"] for e in evals) / cnt, 2) if cnt else 0.0
    speed_counts = dict(Counter(e["response_speed"] for e in evals))
    clarity_counts = dict(Counter(e["followup_clarity"] for e in evals))
    return {
        "eval_count": cnt,
        "avg_app_rating": avg_app,
        "avg_school_rating": avg_school,
        "speed_breakdown": speed_counts,
        "clarity_breakdown": clarity_counts,
    }


def compute_public_recap(conn, tid: int) -> dict:
    school_row = conn.execute("SELECT sla_hours FROM school_tenants WHERE id = ?", (tid,)).fetchone()
    sla_hours = int(school_row["sla_hours"]) if school_row and school_row["sla_hours"] else 24
    rows = [dict(r) for r in conn.execute("SELECT * FROM complaints WHERE tenant_id = ? ORDER BY created_at DESC", (tid,)).fetchall()]
    total = len(rows)
    done = sum(1 for r in rows if r["status"] == "Selesai")
    processing = total - done
    rentan_count = sum(
        1
        for r in rows
        if r.get("needs_priority_assistance")
        or (r.get("vulnerable_group") and r["vulnerable_group"] not in ("", "Umum (Bukan Kelompok Rentan)"))
    )
    rated = [r["parent_rating"] for r in rows if r.get("parent_rating", 0) > 0]
    avg_rating = round(sum(rated) / len(rated), 2) if rated else 0.0
    completion_pct = round((done / total) * 100, 1) if total else 100.0
    eval_summary = compute_evaluation_summary(conn, tid)
    ikm_summary = compute_ikm_summary(conn, tid)

    sla_list = [compute_complaint_sla(r, sla_hours) for r in rows]
    sla_overdue_count = sum(1 for s, r in zip(sla_list, rows) if r["status"] != "Selesai" and s["is_overdue"])
    sla_warning_count = sum(1 for s, r in zip(sla_list, rows) if r["status"] != "Selesai" and s["is_warning"])
    sla_unresponded_count = sum(1 for r in rows if r["status"] == "Diterima")
    resolved_sla = [s for s, r in zip(sla_list, rows) if r["status"] == "Selesai"]
    resolved_on_time = sum(1 for s in resolved_sla if s["sla_state"] == "selesai_tepat_waktu")
    sla_on_time_pct = round((resolved_on_time / len(resolved_sla)) * 100, 1) if resolved_sla else 100.0
    avg_resolution_hours = round(sum(s["elapsed_hours"] for s in resolved_sla) / len(resolved_sla), 1) if resolved_sla else 0.0

    cat_counts = Counter(r["category"] for r in rows)
    by_category = [
        {
            "category": cat,
            "total": cnt,
            "done": sum(1 for r in rows if r["category"] == cat and r["status"] == "Selesai"),
            "processing": sum(1 for r in rows if r["category"] == cat and r["status"] != "Selesai"),
        }
        for cat, cnt in cat_counts.most_common()
    ]

    month_counts = Counter((r["created_at"] or "")[:7] for r in rows if r.get("created_at"))
    by_month = [{"month": m, "count": month_counts[m]} for m in sorted(month_counts.keys())]

    return {
        "total": total,
        "processing": processing,
        "done": done,
        "completion_pct": completion_pct,
        "rentan_count": rentan_count,
        "rated_count": len(rated),
        "avg_rating": avg_rating,
        "eval_count": eval_summary["eval_count"],
        "avg_app_rating": eval_summary["avg_app_rating"],
        "avg_school_rating": eval_summary["avg_school_rating"],
        "ikm_count": ikm_summary["respondent_count"],
        "ikm_score": ikm_summary["ikm_score"],
        "ikm_grade": ikm_summary["grade"],
        "ikm_predicate": ikm_summary["predicate"],
        "sla_hours": sla_hours,
        "sla_overdue_count": sla_overdue_count,
        "sla_warning_count": sla_warning_count,
        "sla_unresponded_count": sla_unresponded_count,
        "sla_on_time_pct": sla_on_time_pct,
        "avg_resolution_hours": avg_resolution_hours,
        "by_category": by_category,
        "by_month": by_month,
        "updated_at": now_iso(),
    }


def build_monev_markdown(school: dict, recap: dict, complaints: list) -> str:
    lines = [
        "# LAPORAN MONITORING, EVALUASI PENGADUAN & FKP_UPP",
        f"## {school['name']}",
        f"- **NPSN:** {school['npsn']}",
        f"- **Alamat:** {school['address']}",
        f"- **Kepala Sekolah:** {school['principal_name']} (NIP. 198112072007012013)",
        f"- **Email / Kontak:** {school['email']} · {school['hotline']}",
        f"- **Tanggal Cetak Otomatis:** {now_iso()}",
        "",
        "---",
        "",
        "## 1. RINGKASAN KINERJA PENGADUAN (PEKPPP ASPEK 05 & INOVASI SIMPEL 06)",
        "| Indikator | Nilai |",
        "|:---|---:|",
        f"| Total Pengaduan Masuk | {recap['total']} |",
        f"| Pengaduan Selesai | {recap['done']} |",
        f"| Pengaduan Dalam Proses | {recap['processing']} |",
        f"| Persentase Ketuntasan | {recap['completion_pct']}% |",
        f"| Kepatuhan SLA Penanganan (<= {recap.get('sla_hours', 24)} Jam) | {recap.get('sla_on_time_pct', 100)}% (Rata-rata tuntas {recap.get('avg_resolution_hours', 0)} jam) |",
        f"| Aduan Terbuka Melewati SLA / Mendekati Batas | {recap.get('sla_overdue_count', 0)} melewati SLA / {recap.get('sla_warning_count', 0)} kritis |",
        f"| Layanan Prioritas Kelompok Rentan / Inklusi | {recap['rentan_count']} |",
        f"| Rata-Rata Kepuasan Tiket Pengaduan | {recap['avg_rating']} / 5.0 ({recap['rated_count']} responden) |",
        f"| Rata-Rata Penilaian Aplikasi SI-PAKAINGE | {recap.get('avg_app_rating', 0)} / 5.0 ({recap.get('eval_count', 0)} responden) |",
        f"| Rata-Rata Penilaian Respon & Tindak Lanjut Sekolah | {recap.get('avg_school_rating', 0)} / 5.0 ({recap.get('eval_count', 0)} responden) |",
        f"| Indeks Kepuasan Masyarakat (IKM 9 Unsur PermenPAN-RB 14/2017) | {recap.get('ikm_score', 0)} / 100 (Mutu {recap.get('ikm_grade', '-')} - {recap.get('ikm_predicate', '-')}, {recap.get('ikm_count', 0)} responden) |",
        "",
        "## 2. REKAPITULASI PER KATEGORI PENGADUAN",
        "| No | Kategori | Masuk | Selesai | Diproses |",
        "|:--:|:---|---:|---:|---:|",
    ]
    def md_cell(v) -> str:
        return str(v or "-").replace("\r", " ").replace("\n", " ").replace("|", "\\|").strip() or "-"

    for idx, c in enumerate(recap["by_category"], 1):
        lines.append(f"| {idx} | {md_cell(c['category'])} | {c['total']} | {c['done']} | {c['processing']} |")

    lines.extend([
        "",
        "## 3. DAFTAR TINDAK LANJUT PENGADUAN (IDENTITAS PELAPOR ANONIM DILINDUNGI UU PDP)",
        "| Kode Tiket | Tanggal | Kategori | Prioritas Rentan | Unit Penangan | Status | Catatan Tindak Lanjut |",
        "|:---|:---|:---|:---|:---|:---|:---|",
    ])
    for r in complaints:
        vg = r.get("vulnerable_group") or ("Prioritas" if r.get("needs_priority_assistance") else "Umum")
        lines.append(
            f"| {md_cell(r['ticket_code'])} | {(r['created_at'] or '')[:10]} | {md_cell(r['category'])} | {md_cell(vg)} | {md_cell(r['routed_to'])} | {md_cell(r['status'])} | {md_cell(r.get('staff_note') or '-')} |"
        )

    lines.extend([
        "",
        "## 4. KANAL PENGADUAN RESMI TERINTEGRASI",
        "1. **Aplikasi Digital Sekolah:** SI-PAKAINGE MONSA (Modul Inovasi SIMPEL)",
        "2. **SP4N-LAPOR! Nasional:** https://www.lapor.go.id",
        f"3. **WhatsApp & Telepon Sekolah:** {school['hotline']}",
        f"4. **Email Resmi Sekolah:** {school['email']}",
        "5. **Sarana Fisik Sekolah:** Kotak Saran & Ruang Konsultasi Prioritas Ramah Kelompok Rentan",
        "",
        "---",
        f"Makassar, {now_iso()[:10]}",
        f"**Kepala {school['name']}**,",
        "",
        f"**{school['principal_name']}**",
        "NIP. 198112072007012013",
    ])
    return "\n".join(lines)
