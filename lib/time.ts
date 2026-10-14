/** Short relative times for lists: "just now", "5 min ago", "in 3 days", "2 Mar 2026". */
const rtf = typeof Intl !== 'undefined' ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' }) : null;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function relative(ts: string | Date | null | undefined): string {
  if (!ts) return '';
  const d = typeof ts === 'string' ? new Date(ts) : ts;
  const secs = (d.getTime() - Date.now()) / 1000;
  if (Math.abs(secs) < 45) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size || unit === 'minute') return rtf ? rtf.format(Math.round(secs / size), unit) : d.toLocaleString();
  }
  return d.toLocaleString();
}

/** Full date and time, for tooltips. */
export const fullDate = (ts: string | null | undefined) => (ts ? new Date(ts).toLocaleString() : '');

export const isPast = (ts: string | null | undefined) => !!ts && new Date(ts).getTime() < Date.now();
