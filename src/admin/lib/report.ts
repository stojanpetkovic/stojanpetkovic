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

/** The longest custom period a report accepts: a year and a day. */
const MAX_CUSTOM_DAYS = 366;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A period with chosen start and end days (inclusive), compared with the
 * period of the same length right before it. Returns null for dates that are
 * malformed, reversed, in the future or more than a year apart.
 */
export function customPeriod(
  from: string | null,
  to: string | null,
  timeZone: string,
  locale: ReportLocale,
): Period | null {
  if (!from || !to || !ISO_DAY.test(from) || !ISO_DAY.test(to)) return null;
  if (Number.isNaN(Date.parse(from)) || Number.isNaN(Date.parse(to))) return null;
  const today = dayKey(new Date(), timeZone);
  if (from > to || to > today) return null;
  const current = daysBetween(from, to);
  if (current.length > MAX_CUSTOM_DAYS) return null;
  const dayBefore = (day: string, n: number) =>
    new Date(Date.parse(`${day}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const previous = daysBetween(dayBefore(from, current.length), dayBefore(from, 1));
  const fmt = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'sr-Latn-RS', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
  const label = `${fmt.format(new Date(`${from}T12:00:00Z`))} – ${fmt.format(new Date(`${to}T12:00:00Z`))}`;
  return { key: 'custom', label, current, previous };
}

/**
 * The requested period: a custom range when `key` is "custom" and the dates
 * are valid, one of the offered periods by key, or last month by default (the
 * usual monthly report).
 */
export function pickPeriod(
  all: Period[],
  key: string | null,
  custom?: { from: string | null; to: string | null; timeZone: string; locale: ReportLocale },
): Period {
  if (key === 'custom' && custom) {
    const period = customPeriod(custom.from, custom.to, custom.timeZone, custom.locale);
    if (period) return period;
  }
  return all.find((p) => p.key === key) ?? all[1];
}

/*
 * Marketing spend for the reported period, entered on the report page and
 * carried in its URL, so a saved link or PDF keeps the figures it was printed
 * with. Nothing is stored. Spend is split by the two paid channels the
 * analytics can attribute contacts to, plus everything else (SEO, content,
 * print), which counts toward the totals only.
 */
export const CURRENCIES = ['EUR', 'USD', 'RSD'] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Spend {
  google: number;
  meta: number;
  other: number;
  currency: Currency;
  /** Average value of a won job, for estimated revenue and ROAS. */
  jobValue: number;
  total: number;
}

/** A non-negative amount from a form field, accepting "1.234,56" and "1,234.56". */
export function parseAmount(value: string | null): number {
  if (!value) return 0;
  let text = value.replace(/\s/g, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  // The later separator is the decimal one; the other groups thousands.
  if (lastComma > lastDot) text = text.replace(/\./g, '').replace(',', '.');
  else text = text.replace(/,/g, '');
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

export function parseSpend(params: URLSearchParams): Spend | null {
  const google = parseAmount(params.get('spendGoogle'));
  const meta = parseAmount(params.get('spendMeta'));
  const other = parseAmount(params.get('spendOther'));
  const currency = (CURRENCIES as readonly string[]).includes(params.get('currency') ?? '')
    ? (params.get('currency') as Currency)
    : 'EUR';
  const total = google + meta + other;
  if (!total) return null;
  return { google, meta, other, currency, jobValue: parseAmount(params.get('jobValue')), total };
}

export function formatMoney(amount: number, currency: Currency, locale: ReportLocale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'sr-Latn-RS', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount >= 100 ? 0 : 2,
  }).format(amount);
}

/** The paid channels spend is entered for, keyed as in channels.ts. */
export const PAID_CHANNELS = { google: 'Google oglasi', meta: 'Facebook/Instagram oglasi' } as const;

export interface SpendMetrics {
  total: number;
  perLead: number | null;
  perCall: number | null;
  perContact: number | null;
  won: number;
  perWon: number | null;
  /** Won jobs × average job value, when a job value was entered. */
  revenue: number | null;
  /** revenue ÷ spend. */
  roas: number | null;
  channels: { key: 'google' | 'meta'; label: string; spend: number; contacts: number; perContact: number | null }[];
}

const per = (amount: number, count: number) => (count > 0 ? amount / count : null);

export function spendMetrics(a: SiteAnalytics, spend: Spend, won: number): SpendMetrics {
  const revenue = spend.jobValue && won ? spend.jobValue * won : null;
  const channels = (['google', 'meta'] as const)
    .filter((key) => spend[key] > 0)
    .map((key) => {
      const row = a.channels.find((c) => c.label === PAID_CHANNELS[key]);
      const contacts = row ? row.leads + row.calls : 0;
      return { key, label: PAID_CHANNELS[key], spend: spend[key], contacts, perContact: per(spend[key], contacts) };
    });
  return {
    total: spend.total,
    perLead: per(spend.total, a.totals.leads),
    perCall: per(spend.total, a.totals.calls),
    perContact: per(spend.total, a.totals.contacts),
    won,
    perWon: per(spend.total, won),
    revenue,
    roas: revenue !== null ? revenue / spend.total : null,
    channels,
  };
}

const CHANNEL_EN: Record<Channel, string> = {
  'Google pretraga': 'Google Search',
  'Google oglasi': 'Google Ads',
  'Facebook/Instagram oglasi': 'Facebook/Instagram Ads',
  'Facebook/Instagram': 'Facebook/Instagram',
  'Druge društvene mreže': 'Other social networks',
  'Google Business profil': 'Google Business Profile',
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
    customPeriod: 'Prilagođeni period',
    from: 'Od',
    to: 'Do',
    apply: 'Primeni',
    spendHeading: 'Troškovi marketinga',
    spendGoogle: 'Google Ads',
    spendMeta: 'Meta (FB/IG) oglasi',
    spendOther: 'Ostali marketing',
    currency: 'Valuta',
    jobValue: 'Prosečna vrednost posla',
    optional: 'opciono',
    spendHint: 'Unesi koliko je potrošeno u ovom periodu. Iznosi ostaju u linku izveštaja i ne čuvaju se nigde.',
    invalidPeriod: 'Prilagođeni period nije ispravan (datumi od–do, ne u budućnosti, najviše godinu dana). Prikazan je prošli mesec.',
    costs: 'Troškovi i cena po rezultatu',
    totalSpend: 'Ukupno potrošeno',
    perLead: 'Cena po upitu',
    perCall: 'Cena po pozivu',
    perContact: 'Cena po kontaktu',
    perContactHint: 'upiti i pozivi zajedno',
    won: 'Dobijeni poslovi',
    wonHint: 'upiti označeni kao „dobijen“ u adminu',
    perWon: 'Cena po dobijenom klijentu',
    revenue: 'Procenjen prihod',
    revenueHint: 'dobijeni poslovi × prosečna vrednost posla',
    roas: 'Povraćaj na uloženo (ROAS)',
    roasHint: 'prihod podeljen sa troškovima',
    byChannel: 'Oglasi po kanalu',
    channel: 'Kanal',
    spent: 'Potrošeno',
    contacts: 'Kontakti',
    breakdownOther: 'Ostali marketing ulazi u ukupne troškove, ali se ne pripisuje jednom kanalu.',
    costNotes:
      'Cena po upitu i pozivu računa se iz ukupnih troškova za period. Kontakti po kanalu računaju se samo za posete obeležene kao plaćeni oglasi (UTM, gclid, fbclid).',
    costSummary: (s: CostSummary) =>
      ` Uloženo je ${s.total} u marketing, što je ${s.perContact ? `${s.perContact} po kontaktu` : 'bez kontakata u ovom periodu'}` +
      (s.won ? `, a ${s.won} ${s.won % 10 === 1 && s.won % 100 !== 11 ? 'upit je postao' : 'upita je postalo'} posao.` : '.'),
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
    customPeriod: 'Custom period',
    from: 'From',
    to: 'To',
    apply: 'Apply',
    spendHeading: 'Marketing spend',
    spendGoogle: 'Google Ads',
    spendMeta: 'Meta (FB/IG) ads',
    spendOther: 'Other marketing',
    currency: 'Currency',
    jobValue: 'Average job value',
    optional: 'optional',
    spendHint: 'Enter what was spent in this period. The amounts stay in the report link and are not stored anywhere.',
    invalidPeriod: 'The custom period is not valid (from–to dates, not in the future, at most one year). Showing last month.',
    costs: 'Spend and cost per result',
    totalSpend: 'Total spend',
    perLead: 'Cost per inquiry',
    perCall: 'Cost per call',
    perContact: 'Cost per contact',
    perContactHint: 'inquiries and calls together',
    won: 'Jobs won',
    wonHint: 'inquiries marked "won" in the admin',
    perWon: 'Cost per won client',
    revenue: 'Estimated revenue',
    revenueHint: 'jobs won × average job value',
    roas: 'Return on ad spend (ROAS)',
    roasHint: 'revenue divided by spend',
    byChannel: 'Ads by channel',
    channel: 'Channel',
    spent: 'Spent',
    contacts: 'Contacts',
    breakdownOther: 'Other marketing counts toward total spend but is not attributed to one channel.',
    costNotes:
      'Cost per inquiry and per call is worked out from total spend for the period. Contacts by channel count only visits marked as paid ads (UTM, gclid, fbclid).',
    costSummary: (s: CostSummary) =>
      ` ${s.total} went into marketing, ${s.perContact ? `${s.perContact} per contact` : 'with no contacts in this period'}` +
      (s.won ? `, and ${s.won} ${s.won === 1 ? 'inquiry' : 'inquiries'} turned into ${s.won === 1 ? 'a job' : 'jobs'}.` : '.'),
  },
} as const;

export interface CostSummary {
  total: string;
  perContact: string | null;
  won: number;
}

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
