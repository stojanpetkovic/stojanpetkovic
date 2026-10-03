import { db } from './supabase';
import { leadSource } from './leads';
import { dayKey, pagePath } from './stats';
import { CHANNELS } from './channels';
import type { Lead, Site } from './types';

/*
 * Reads the admin's own analytics: the per-day totals in page_view_daily
 * (rolled up every 15 minutes, see the rollup_page_views migration) joined
 * with the leads for the same days, so every breakdown can show visits,
 * leads and the rate between them.
 */

export const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function parseRange(value: string | null): RangeDays {
  const n = Number(value);
  return (RANGES as readonly number[]).includes(n) ? (n as RangeDays) : 30;
}

interface DailyRow {
  site_id: string;
  day: string;
  views: number;
  visits: number;
  visitors: number;
  channels: Record<string, number>;
  pages: Record<string, number>;
  entry_pages: Record<string, number>;
  devices: Record<string, number>;
  countries: Record<string, number>;
}

export interface Totals {
  visitors: number;
  visits: number;
  views: number;
  leads: number;
}

export interface Breakdown {
  label: string;
  visits: number;
  leads: number;
}

export interface SiteAnalytics {
  days: number;
  totals: Totals;
  previous: Totals;
  daily: { day: string; visitors: number; leads: number }[];
  channels: Breakdown[];
  pages: { label: string; views: number; leads: number }[];
  devices: { key: string; label: string; count: number }[];
  countries: { code: string; label: string; count: number }[];
  hasData: boolean;
}

export type ReportLocale = 'sr' | 'en';

const DEVICE_LABELS: Record<ReportLocale, Record<string, string>> = {
  sr: { mobile: 'Telefon', desktop: 'Računar', tablet: 'Tablet' },
  en: { mobile: 'Mobile', desktop: 'Desktop', tablet: 'Tablet' },
};

const countryNames = new Map<ReportLocale, Intl.DisplayNames>();
function countryName(code: string, locale: ReportLocale): string {
  if (code === '??') return locale === 'en' ? 'Unknown' : 'Nepoznato';
  try {
    if (!countryNames.has(locale)) {
      countryNames.set(locale, new Intl.DisplayNames([locale === 'en' ? 'en' : 'sr-Latn'], { type: 'region' }));
    }
    return countryNames.get(locale)!.of(code) ?? code;
  } catch {
    return code;
  }
}

function addInto(target: Map<string, number>, source: Record<string, number> | undefined) {
  for (const [key, value] of Object.entries(source ?? {})) target.set(key, (target.get(key) ?? 0) + value);
}

const sorted = (map: Map<string, number>, limit: number) =>
  [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

/** Calendar days (YYYY-MM-DD, in the site's timezone) covering the last `days` days including today. */
function dayList(days: number, timeZone: string, offset = 0): string[] {
  const list: string[] = [];
  for (let i = days - 1 + offset; i >= offset; i--) list.push(dayKey(new Date(Date.now() - i * 86_400_000), timeZone));
  return list;
}

/** Every calendar day from `from` to `to` inclusive (YYYY-MM-DD; plain dates, no timezone). */
export function daysBetween(from: string, to: string): string[] {
  const list: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    list.push(new Date(t).toISOString().slice(0, 10));
  }
  return list;
}

/** The last `days` days including today, compared with the `days` before them. */
export function siteAnalytics(site: Site, days: RangeDays): Promise<SiteAnalytics> {
  return analyzeDays(site, dayList(days, site.timezone), dayList(days, site.timezone, days), 'sr');
}

/**
 * Totals and breakdowns for the given calendar days (in the site's timezone),
 * with `previous` as the period the change figures compare against.
 */
export async function analyzeDays(
  site: Site,
  current: string[],
  previous: string[],
  locale: ReportLocale,
): Promise<SiteAnalytics> {
  const first = [...previous, ...current].sort()[0];
  const last = [...previous, ...current].sort().at(-1)!;
  // A day either side, so leads near midnight in the site's timezone are not
  // cut off; each lead is then placed on its own day below.
  const leadsFrom = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString();
  const leadsTo = new Date(Date.parse(`${last}T00:00:00Z`) + 2 * 86_400_000).toISOString();

  const [{ data: dailyData }, { data: leadData }] = await Promise.all([
    db().from('page_view_daily').select('*').eq('site_id', site.id).gte('day', first).lte('day', last),
    db()
      .from('leads')
      .select('created_at, page_url, utm_source, utm_medium, referrer')
      .eq('site_id', site.id)
      .eq('is_spam', false)
      .gte('created_at', leadsFrom)
      .lt('created_at', leadsTo),
  ]);
  const rows = (dailyData ?? []) as DailyRow[];
  const leads = (leadData ?? []) as Pick<Lead, 'created_at' | 'page_url' | 'utm_source' | 'utm_medium' | 'referrer'>[];

  const inCurrent = new Set(current);
  const inPrevious = new Set(previous);
  const leadDay = (l: { created_at: string }) => dayKey(new Date(l.created_at), site.timezone);
  const currentLeads = leads.filter((l) => inCurrent.has(leadDay(l)));

  const sum = (set: Set<string>, leadCount: number): Totals => {
    const t = { visitors: 0, visits: 0, views: 0, leads: leadCount };
    for (const r of rows) {
      if (!set.has(r.day)) continue;
      t.visitors += r.visitors;
      t.visits += r.visits;
      t.views += r.views;
    }
    return t;
  };

  const channelVisits = new Map<string, number>();
  const pageViews = new Map<string, number>();
  const devices = new Map<string, number>();
  const countries = new Map<string, number>();
  const visitorsByDay = new Map<string, number>();
  for (const r of rows) {
    if (!inCurrent.has(r.day)) continue;
    addInto(channelVisits, r.channels);
    addInto(pageViews, r.pages);
    addInto(devices, r.devices);
    addInto(countries, r.countries);
    visitorsByDay.set(r.day, r.visitors);
  }

  const leadsByChannel = new Map<string, number>();
  const leadsByPage = new Map<string, number>();
  const leadsByDay = new Map<string, number>();
  for (const l of currentLeads) {
    const channel = leadSource(l);
    leadsByChannel.set(channel, (leadsByChannel.get(channel) ?? 0) + 1);
    const path = pagePath(l.page_url);
    leadsByPage.set(path, (leadsByPage.get(path) ?? 0) + 1);
    const day = leadDay(l);
    leadsByDay.set(day, (leadsByDay.get(day) ?? 0) + 1);
  }

  const channels = CHANNELS.map((label) => ({
    label,
    visits: channelVisits.get(label) ?? 0,
    leads: leadsByChannel.get(label) ?? 0,
  }))
    .filter((c) => c.visits || c.leads)
    .sort((a, b) => b.visits - a.visits || b.leads - a.leads);

  return {
    days: current.length,
    totals: sum(inCurrent, currentLeads.length),
    previous: sum(inPrevious, leads.filter((l) => inPrevious.has(leadDay(l))).length),
    daily: current.map((day) => ({ day, visitors: visitorsByDay.get(day) ?? 0, leads: leadsByDay.get(day) ?? 0 })),
    channels,
    pages: sorted(pageViews, 12).map(([label, views]) => ({ label, views, leads: leadsByPage.get(label) ?? 0 })),
    devices: sorted(devices, 5).map(([key, count]) => ({ key, label: DEVICE_LABELS[locale][key] ?? key, count })),
    countries: sorted(countries, 8).map(([code, count]) => ({ code, label: countryName(code, locale), count })),
    hasData: rows.some((r) => inCurrent.has(r.day)),
  };
}

/** Visitors and leads per site for the dashboard, over the last `days` days. */
export async function sitesOverview(sites: Site[], days: RangeDays) {
  const since = new Date(Date.now() - (days + 1) * 86_400_000);
  const [{ data: dailyData }, { data: leadData }] = await Promise.all([
    db().from('page_view_daily').select('site_id, day, visitors, visits').gte('day', since.toISOString().slice(0, 10)),
    db().from('leads').select('site_id, created_at').eq('is_spam', false).gte('created_at', since.toISOString()),
  ]);

  return sites.map((site) => {
    const window = new Set(dayList(days, site.timezone));
    const rows = ((dailyData ?? []) as Pick<DailyRow, 'site_id' | 'day' | 'visitors' | 'visits'>[]).filter(
      (r) => r.site_id === site.id && window.has(r.day),
    );
    const leads = ((leadData ?? []) as { site_id: string; created_at: string }[]).filter(
      (l) => l.site_id === site.id && window.has(dayKey(new Date(l.created_at), site.timezone)),
    ).length;
    const visitors = rows.reduce((n, r) => n + r.visitors, 0);
    const visits = rows.reduce((n, r) => n + r.visits, 0);
    return { site, visitors, visits, leads, rate: visits ? leads / visits : null };
  });
}

/** "3,2%" — leads per visit, or a dash when there were no visits to divide by. */
export function rate(leads: number, visits: number): string {
  if (!visits) return '—';
  return `${((leads / visits) * 100).toLocaleString('sr-Latn-RS', { maximumFractionDigits: 1 })}%`;
}

export function change(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'neutral' } {
  if (!previous) return { text: 'nema podataka za prethodni period', tone: 'neutral' };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: `${pct >= 0 ? '+' : ''}${pct}% u odnosu na prethodni period`, tone: pct >= 0 ? 'up' : 'down' };
}
