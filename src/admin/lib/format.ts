import type { LeadStatus } from './types';

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Novi',
  contacted: 'Kontaktiran',
  won: 'Dogovoren',
  lost: 'Izgubljen',
};

const TZ = 'Europe/Belgrade';

export function formatDateTime(iso: string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatDate(iso: string, timeZone = TZ): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', {
    dateStyle: 'medium',
    timeZone,
  }).format(new Date(iso));
}

/** "pre 5 min", "pre 3 h", "pre 2 dana" — for lists where recency matters more than the date. */
export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'upravo';
  if (minutes < 60) return `pre ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `pre ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `pre ${days} ${days === 1 ? 'dan' : 'dana'}`;
  return formatDate(iso);
}

export function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.pathname === '/' ? u.hostname : u.pathname;
  } catch {
    return url;
  }
}
