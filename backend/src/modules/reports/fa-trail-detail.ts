export function possessionMinutes(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null {
  if (start == null || end == null) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.floor((e - s) / 60000);
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
