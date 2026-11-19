"""Perhitungan SLA <= 24 jam (Fase 4A) — fungsi murni, stdlib saja."""
from datetime import datetime


def parse_iso_dt(raw: str):
    txt = (raw or "").strip().replace("T", " ")[:19]
    if not txt:
        return None
    try:
        return datetime.strptime(txt, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _fmt_hours_id(hours_float: float) -> str:
    total_mins = max(0, round(abs(float(hours_float or 0.0)) * 60))
    hrs, mins = divmod(total_mins, 60)
    if hrs >= 24:
        days, rem_h = divmod(hrs, 24)
        return f"{days}h {rem_h}j {mins}m"
    return f"{hrs}j {mins}m"


def compute_complaint_sla(item: dict, sla_hours: int = 24) -> dict:
    sla_h = max(1, int(sla_hours or 24))
    created_dt = parse_iso_dt(item.get("created_at"))
    if not created_dt:
        return {
            "sla_hours": sla_h,
            "sla_state": "aman",
            "is_overdue": False,
            "is_warning": False,
            "elapsed_hours": 0.0,
            "remaining_hours": float(sla_h),
            "overdue_hours": 0.0,
            "unresponded": item.get("status") == "Diterima",
            "badge_text": f"Target SLA <= {sla_h} jam",
        }
    now_dt = datetime.now()
    if item.get("status") == "Selesai":
        end_dt = parse_iso_dt(item.get("resolved_at")) or parse_iso_dt(item.get("updated_at")) or now_dt
        elapsed_h = max(0.0, (end_dt - created_dt).total_seconds() / 3600.0)
        on_time = elapsed_h <= sla_h
        overdue_h = max(0.0, elapsed_h - sla_h)
        badge_text = (
            f"Tuntas {_fmt_hours_id(elapsed_h)} (Memenuhi SLA <={sla_h}j)"
            if on_time
            else f"Tuntas {_fmt_hours_id(elapsed_h)} (Lewat SLA +{_fmt_hours_id(overdue_h)})"
        )
        return {
            "sla_hours": sla_h,
            "sla_state": "selesai_tepat_waktu" if on_time else "selesai_lewat_sla",
            "is_overdue": not on_time,
            "is_warning": False,
            "elapsed_hours": round(elapsed_h, 2),
            "remaining_hours": 0.0,
            "overdue_hours": round(overdue_h, 2),
            "unresponded": False,
            "badge_text": badge_text,
        }
    elapsed_h = max(0.0, (now_dt - created_dt).total_seconds() / 3600.0)
    remaining_h = sla_h - elapsed_h
    warn_threshold = min(6.0, sla_h * 0.25)
    is_overdue = remaining_h <= 0.0
    is_warning = (not is_overdue) and remaining_h <= warn_threshold
    overdue_h = max(0.0, -remaining_h)
    sla_state = "terlambat" if is_overdue else ("kritis" if is_warning else "aman")
    if is_overdue:
        badge_text = f"ALARM TERLAMBAT +{_fmt_hours_id(overdue_h)} (SLA {sla_h}j)"
    elif is_warning:
        badge_text = f"SEGERA! Sisa {_fmt_hours_id(remaining_h)} sebelum batas SLA {sla_h}j"
    else:
        badge_text = f"Sisa {_fmt_hours_id(remaining_h)} (SLA <={sla_h}j)"
    return {
        "sla_hours": sla_h,
        "sla_state": sla_state,
        "is_overdue": is_overdue,
        "is_warning": is_warning,
        "elapsed_hours": round(elapsed_h, 2),
        "remaining_hours": round(max(0.0, remaining_h), 2),
        "overdue_hours": round(overdue_h, 2),
        "unresponded": item.get("status") == "Diterima",
        "badge_text": badge_text,
    }


def enrich_complaint_sla(d: dict, sla_hours: int = 24) -> dict:
    d["sla_info"] = compute_complaint_sla(d, sla_hours)
    return d
