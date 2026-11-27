// Display formatting. Locale is the browser's on the client and en-US on the server render.
const number = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return Math.abs(value) >= 100_000 ? compact.format(value) : number.format(value);
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—';
  return `${(value * 100).toFixed(digits).replace(/\.0$/, '')}%`;
}

export function formatChange(change: number | null): string {
  if (change === null) return 'No prior data';
  const pct = Math.round(change * 100);
  return `${pct > 0 ? '+' : ''}${pct}% vs previous`;
}

export function formatMoney(cents: number | null): string {
  if (cents === null) return 'Free';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDate(
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', opts).format(new Date(iso));
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "3 days ago", "in 2 hours". */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return 'just now';
}

/** `MEETING_REQUEST` -> "Meeting request". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '—';
  const s = value.replaceAll('_', ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name: string | null | undefined, fallback = '?'): string {
  if (!name) return fallback;
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
