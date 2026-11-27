// Number formatting helpers shared by every chart.

/** 1,284 / 12.9K / 4.2M — auto-compact from 1,000 up. */
export function compact(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '–';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${trim(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}${trim(a / 1e6)}M`;
  if (a >= 1e3) return `${sign}${trim(a / 1e3)}K`;
  return `${sign}${Math.round(a)}`;
}

function trim(v: number): string {
  return (v >= 100 ? v.toFixed(0) : v.toFixed(1)).replace(/\.0$/, '');
}

/** ₦12.9M */
export function naira(n: number | null | undefined): string {
  return n == null ? '–' : `₦${compact(n)}`;
}

/** Full ₦ figure with thousands separators, for tooltips and tables. */
export function nairaFull(n: number | null | undefined): string {
  return n == null ? '–' : `₦${Math.round(n).toLocaleString('en-NG')}`;
}

export function pct(n: number | null | undefined, digits = 0): string {
  return n == null ? '–' : `${n.toFixed(digits).replace(/\.0+$/, '')}%`;
}

/** "2025-11" -> "Nov 25" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** "2026-10-26" -> "26 Oct" */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
