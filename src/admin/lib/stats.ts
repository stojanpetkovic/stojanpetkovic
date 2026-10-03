import { leadSource } from './leads';
import type { Lead } from './types';

type StatLead = Pick<
  Lead,
  'created_at' | 'form_name' | 'page_url' | 'utm_source' | 'utm_medium' | 'referrer' | 'status' | 'site_id'
>;

/** YYYY-MM-DD of an instant as seen in the given timezone. */
export function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** One entry per calendar day for the last `days` days, oldest first, with zero-filled gaps. */
export function dailySeries(leads: StatLead[], days: number, timeZone: string) {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key = dayKey(new Date(lead.created_at), timeZone);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const series: { day: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(new Date(Date.now() - i * 86_400_000), timeZone);
    series.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

export function countBy<T>(items: T[], keyOf: (item: T) => string, limit = 8) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item) || '—';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function pagePath(url: string | null): string {
  if (!url) return '—';
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function summarize(leads: StatLead[]) {
  const now = Date.now();
  const within = (days: number) =>
    leads.filter((l) => now - new Date(l.created_at).getTime() < days * 86_400_000).length;
  const previous30 = leads.filter((l) => {
    const age = now - new Date(l.created_at).getTime();
    return age >= 30 * 86_400_000 && age < 60 * 86_400_000;
  }).length;
  const last30 = within(30);
  const won = leads.filter((l) => l.status === 'won').length;
  const closed = leads.filter((l) => l.status === 'won' || l.status === 'lost').length;
  return {
    today: within(1),
    last7: within(7),
    last30,
    previous30,
    change: previous30 ? Math.round(((last30 - previous30) / previous30) * 100) : null,
    winRate: closed ? Math.round((won / closed) * 100) : null,
    bySource: countBy(leads, (l) => leadSource(l)),
    byForm: countBy(leads, (l) => l.form_name),
    byPage: countBy(leads, (l) => pagePath(l.page_url)),
  };
}
