// Shared SLA <= 24h countdown & delay calculator for SI-PAKAINGE MONSA
// Supports both live server tickets and offline/localFallback mode.

export function localDateYmd(offsetDays = 0, nowMs = Date.now()) {
  const dt = new Date(nowMs + offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

export function parseSlaTimestamp(raw) {
  const txt = String(raw || '').trim().replace('T', ' ').slice(0, 19);
  if (!txt) return null;
  const m = txt.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) {
    const dt = new Date(raw);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
}

export function formatHoursDuration(hoursFloat) {
  const totalMins = Math.max(0, Math.round(Math.abs(Number(hoursFloat || 0)) * 60));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remH = hrs % 24;
    return `${days}h ${remH}j ${mins}m`;
  }
  return `${hrs}j ${mins}m`;
}

export function computeComplaintSla(item, slaHours = 24, nowMs = Date.now()) {
  const slaH = Math.max(1, Number(slaHours || 24));
  const createdDt = parseSlaTimestamp(item?.created_at);
  if (!createdDt) {
    return {
      sla_hours: slaH,
      sla_state: 'aman',
      is_overdue: false,
      is_warning: false,
      elapsed_hours: 0,
      remaining_hours: slaH,
      overdue_hours: 0,
      unresponded: item?.status === 'Diterima',
      badge_text: `Target SLA <= ${slaH} jam`,
    };
  }

  if (item?.status === 'Selesai') {
    const endDt = parseSlaTimestamp(item.resolved_at) || parseSlaTimestamp(item.updated_at) || new Date(nowMs);
    const elapsedH = Math.max(0, (endDt.getTime() - createdDt.getTime()) / 3600000);
    const onTime = elapsedH <= slaH;
    const overdueH = Math.max(0, elapsedH - slaH);
    return {
      sla_hours: slaH,
      sla_state: onTime ? 'selesai_tepat_waktu' : 'selesai_lewat_sla',
      is_overdue: !onTime,
      is_warning: false,
      elapsed_hours: Number(elapsedH.toFixed(2)),
      remaining_hours: 0,
      overdue_hours: Number(overdueH.toFixed(2)),
      unresponded: false,
      badge_text: onTime
        ? `Tuntas ${formatHoursDuration(elapsedH)} (Memenuhi SLA <=${slaH}j)`
        : `Tuntas ${formatHoursDuration(elapsedH)} (Lewat SLA +${formatHoursDuration(overdueH)})`,
    };
  }

  const elapsedH = Math.max(0, (nowMs - createdDt.getTime()) / 3600000);
  const remainingH = slaH - elapsedH;
  const warnThreshold = Math.min(6, slaH * 0.25);
  const isOverdue = remainingH <= 0;
  const isWarning = !isOverdue && remainingH <= warnThreshold;
  const overdueH = Math.max(0, -remainingH);
  const slaState = isOverdue ? 'terlambat' : isWarning ? 'kritis' : 'aman';

  let badgeText;
  if (isOverdue) {
    badgeText = `ALARM TERLAMBAT +${formatHoursDuration(overdueH)} (SLA ${slaH}j)`;
  } else if (isWarning) {
    badgeText = `SEGERA! Sisa ${formatHoursDuration(remainingH)} sebelum batas SLA ${slaH}j`;
  } else {
    badgeText = `Sisa ${formatHoursDuration(remainingH)} (SLA <=${slaH}j)`;
  }

  return {
    sla_hours: slaH,
    sla_state: slaState,
    is_overdue: isOverdue,
    is_warning: isWarning,
    elapsed_hours: Number(elapsedH.toFixed(2)),
    remaining_hours: Number(Math.max(0, remainingH).toFixed(2)),
    overdue_hours: Number(overdueH.toFixed(2)),
    unresponded: item?.status === 'Diterima',
    badge_text: badgeText,
  };
}

export function computeSlaSummary(complaints = [], slaHours = 24, nowMs = Date.now()) {
  const slaH = Math.max(1, Number(slaHours || 24));
  const items = complaints.map((c) => ({ c, sla: computeComplaintSla(c, slaH, nowMs) }));
  const overdueOpen = items.filter(({ c, sla }) => c.status !== 'Selesai' && sla.is_overdue);
  const warningOpen = items.filter(({ c, sla }) => c.status !== 'Selesai' && sla.is_warning);
  const unrespondedOpen = items.filter(({ c }) => c.status === 'Diterima');
  const resolved = items.filter(({ c }) => c.status === 'Selesai');
  const resolvedOnTime = resolved.filter(({ sla }) => sla.sla_state === 'selesai_tepat_waktu');
  const onTimePct = resolved.length ? Number(((resolvedOnTime.length / resolved.length) * 100).toFixed(1)) : 100;
  const avgResHours = resolved.length
    ? Number((resolved.reduce((acc, x) => acc + x.sla.elapsed_hours, 0) / resolved.length).toFixed(1))
    : 0;

  return {
    sla_hours: slaH,
    sla_overdue_count: overdueOpen.length,
    sla_warning_count: warningOpen.length,
    sla_unresponded_count: unrespondedOpen.length,
    sla_on_time_pct: onTimePct,
    avg_resolution_hours: avgResHours,
  };
}
