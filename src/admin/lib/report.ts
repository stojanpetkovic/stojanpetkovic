import { daysBetween, type ReportLocale, type SiteAnalytics } from './analytics';
import { dayKey } from './stats';
import type { Channel } from './channels';

/*
 * The client report: a printable page per site and period, in the client's
 * language (the site's email language). This module holds the periods on
 * offer and the report's words; the page renders them.
 */

export interface Period {
  key: string;
  label: string;
  current: string[];
  previous: string[];
}

function monthDays(year: number, month: number): string[] {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return daysBetween(from, `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`);
}

function monthLabel(year: number, month: number, locale: ReportLocale): string {
  const text = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'sr-Latn-RS', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Periods a report can cover: the current month so far, the six full months
 * before it, and the last 30 days. Each comes with the period before it, of
 * the same length, for the change figures.
 */
export function periods(timeZone: string, locale: ReportLocale): Period[] {
  const today = dayKey(new Date(), timeZone);
  const [year, month] = today.split('-').map(Number);
  const list: Period[] = [];

  for (let back = 0; back <= 6; back++) {
    const d = new Date(Date.UTC(year, month - 1 - back, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    let current = monthDays(y, m);
    if (back === 0) current = current.filter((day) => day <= today);
    const p = new Date(Date.UTC(y, m - 2, 1));
    let previous = monthDays(p.getUTCFullYear(), p.getUTCMonth() + 1);
    // Month to date compares with the same days of the month before.
    if (back === 0) previous = previous.slice(0, current.length);
    list.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      label:
        back === 0
          ? `${monthLabel(y, m, locale)} (${locale === 'en' ? 'to date' : 'do danas'})`
          : monthLabel(y, m, locale),
      current,
      previous,
    });
  }

  const last30 = daysBetween(dayKey(new Date(Date.now() - 29 * 86_400_000), timeZone), today);
  const prev30 = daysBetween(
    dayKey(new Date(Date.now() - 59 * 86_400_000), timeZone),
    dayKey(new Date(Date.now() - 30 * 86_400_000), timeZone),
  );
  list.push({
    key: 'last30',
    label: locale === 'en' ? 'Last 30 days' : 'Poslednjih 30 dana',
    current: last30,
    previous: prev30,
  });
  return list;
}

/** The requested period, or last month by default (the usual monthly report). */
export function pickPeriod(all: Period[], key: string | null): Period {
  return all.find((p) => p.key === key) ?? all[1];
}

const CHANNEL_EN: Record<Channel, string> = {
  'Google pretraga': 'Google Search',
  'Google oglasi': 'Google Ads',
  'Facebook/Instagram oglasi': 'Facebook/Instagram Ads',
  'Facebook/Instagram': 'Facebook/Instagram',
  'Bing pretraga': 'Bing Search',
  'Drugi sajtovi': 'Other websites',
  Email: 'Email',
  'Kampanja (ostalo)': 'Other campaigns',
  Direktno: 'Direct',
};

export function channelLabel(channel: string, locale: ReportLocale): string {
  return locale === 'en' ? (CHANNEL_EN[channel as Channel] ?? channel) : channel;
}

export const T = {
  sr: {
    title: 'Izveštaj o sajtu',
    period: 'Period',
    preparedFor: 'Pripremljeno za',
    visitors: 'Posetioci',
    visits: 'Posete',
    pageViews: 'Pregledi stranica',
    leads: 'Upiti',
    calls: 'Pozivi',
    contactClicks: 'Klikovi za kontakt',
    conversion: 'Stopa konverzije',
    conversionHint: 'upiti i pozivi na 100 poseta',
    vsPrevious: 'u odnosu na prethodni period',
    noPrevious: 'nema podataka za prethodni period',
    daily: 'Posetioci, upiti i pozivi po danu',
    sources: 'Odakle dolaze posetioci',
    source: 'Izvor',
    pages: 'Najposećenije stranice',
    page: 'Stranica',
    devices: 'Uređaji',
    countries: 'Zemlje',
    leadList: 'Upiti u ovom periodu',
    date: 'Datum',
    name: 'Ime',
    form: 'Forma',
    noLeads: 'U ovom periodu nije bilo upita.',
    noData: 'Nema podataka.',
    rate: 'Stopa',
    footer: 'Izveštaj pripremio Mr. Petković · stojanpetkovic.com',
    notes:
      'Posetioci se broje bez kolačića: ista osoba se računa jednom dnevno. Posete po izvoru računaju se po prvoj stranici svake posete. Pozivi su klikovi na broj telefona, WhatsApp ili SMS na sajtu.',
    summary: (s: Summary) =>
      `Za period ${s.period} sajt je imao ${s.visitors} ${/(^|[^1])[1-4]$/.test(s.visitors.replace(/\D/g, '')) ? 'posetioca' : 'posetilaca'}, ${s.leads} ${s.leadsWord} i ${s.calls} ${s.calls % 10 === 1 && s.calls % 100 !== 11 ? 'poziv' : 'poziva'}` +
      (s.rate ? `, što je stopa konverzije od ${s.rate}.` : '.') +
      (s.topSource ? ` Najviše poseta došlo je preko izvora „${s.topSource}“.` : ''),
    leadsWord: (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'upit' : 'upita'),
    print: 'Sačuvaj PDF',
    back: 'Nazad',
  },
  en: {
    title: 'Website report',
    period: 'Period',
    preparedFor: 'Prepared for',
    visitors: 'Visitors',
    visits: 'Visits',
    pageViews: 'Page views',
    leads: 'Inquiries',
    calls: 'Calls',
    contactClicks: 'Contact clicks',
    conversion: 'Conversion rate',
    conversionHint: 'inquiries and calls per 100 visits',
    vsPrevious: 'vs. previous period',
    noPrevious: 'no data for the previous period',
    daily: 'Visitors, inquiries and calls by day',
    sources: 'Where visitors come from',
    source: 'Source',
    pages: 'Most visited pages',
    page: 'Page',
    devices: 'Devices',
    countries: 'Countries',
    leadList: 'Inquiries in this period',
    date: 'Date',
    name: 'Name',
    form: 'Form',
    noLeads: 'There were no inquiries in this period.',
    noData: 'No data.',
    rate: 'Rate',
    footer: 'Report prepared by Mr. Petkovic · stojanpetkovic.com',
    notes:
      'Visitors are counted without cookies: the same person counts once per day. Visits by source are attributed to the first page of each visit. Calls are taps on the phone number, WhatsApp or text links on the website.',
    summary: (s: Summary) =>
      `In ${s.period} the website had ${s.visitors} ${s.visitors === '1' ? 'visitor' : 'visitors'} and received ${s.leads} ${s.leadsWord} and ${s.calls} ${s.calls === 1 ? 'call' : 'calls'}` +
      (s.rate ? `, a conversion rate of ${s.rate}.` : '.') +
      (s.topSource ? ` Most visits came from ${s.topSource}.` : ''),
    leadsWord: (n: number) => (n === 1 ? 'inquiry' : 'inquiries'),
    print: 'Save as PDF',
    back: 'Back',
  },
} as const;

export interface Summary {
  period: string;
  visitors: string;
  leads: number;
  calls: number;
  leadsWord: string;
  rate: string | null;
  topSource: string | null;
}

export function formatNumber(n: number, locale: ReportLocale): string {
  return n.toLocaleString(locale === 'en' ? 'en-US' : 'sr-Latn-RS');
}

export function formatRate(leads: number, visits: number, locale: ReportLocale): string | null {
  if (!visits) return null;
  return `${((leads / visits) * 100).toLocaleString(locale === 'en' ? 'en-US' : 'sr-Latn-RS', { maximumFractionDigits: 1 })}%`;
}

export function changeText(current: number, previous: number, locale: ReportLocale) {
  const t = T[locale];
  if (!previous) return { text: t.noPrevious, tone: 'neutral' as const };
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    text: `${pct >= 0 ? '+' : ''}${pct}% ${t.vsPrevious}`,
    tone: pct >= 0 ? ('up' as const) : ('down' as const),
  };
}

export function summaryOf(a: SiteAnalytics, periodLabel: string, locale: ReportLocale): string {
  const t = T[locale];
  const top = a.channels[0];
  return t.summary({
    period: locale === 'en' ? periodLabel : periodLabel.toLowerCase(),
    visitors: formatNumber(a.totals.visitors, locale),
    leads: a.totals.leads,
    calls: a.totals.calls,
    leadsWord: t.leadsWord(a.totals.leads),
    rate: formatRate(a.totals.contacts, a.totals.visits, locale),
    topSource: top && top.visits ? channelLabel(top.label, locale) : null,
  });
}
