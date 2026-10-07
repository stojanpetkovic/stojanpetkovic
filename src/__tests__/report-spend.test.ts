/**
 * The client report's custom period and marketing-spend figures.
 *
 * A custom period must reject dates the report cannot honour — reversed, in
 * the future, malformed or longer than a year — rather than quietly showing a
 * different range under the chosen label. Spend arrives as typed text in
 * either Serbian or English number format, and every cost figure divides by a
 * count that can be zero.
 */
import { describe, expect, it, vi } from 'vitest';

// report.ts reaches the database module through analytics.ts; nothing here
// queries it.
vi.mock('../admin/lib/supabase', () => ({ db: () => ({}) }));

import { customPeriod, parseAmount, parseSpend, spendMetrics } from '../admin/lib/report';
import type { SiteAnalytics } from '../admin/lib/analytics';

const TZ = 'Europe/Belgrade';

describe('customPeriod()', () => {
  it('covers both ends and compares with the same length right before', () => {
    const p = customPeriod('2026-03-10', '2026-03-16', TZ, 'en')!;
    expect(p.current).toHaveLength(7);
    expect(p.current[0]).toBe('2026-03-10');
    expect(p.current.at(-1)).toBe('2026-03-16');
    expect(p.previous).toHaveLength(7);
    expect(p.previous[0]).toBe('2026-03-03');
    expect(p.previous.at(-1)).toBe('2026-03-09');
  });

  it('rejects reversed, malformed, future and over-long ranges', () => {
    expect(customPeriod('2026-03-16', '2026-03-10', TZ, 'en')).toBeNull();
    expect(customPeriod('2026-3-1', '2026-03-10', TZ, 'en')).toBeNull();
    expect(customPeriod(null, '2026-03-10', TZ, 'en')).toBeNull();
    expect(customPeriod('2026-01-01', '2099-01-01', TZ, 'en')).toBeNull();
    expect(customPeriod('2024-01-01', '2025-06-01', TZ, 'en')).toBeNull();
  });
});

describe('parseAmount()', () => {
  it('reads both number formats and ignores what is not a positive amount', () => {
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('850')).toBe(850);
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('-40')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
});

const analytics = (leads: number, calls: number, channels: SiteAnalytics['channels'] = []) =>
  ({
    totals: { visitors: 0, visits: 0, views: 0, leads, calls, emailClicks: 0, contacts: leads + calls },
    channels,
  }) as unknown as SiteAnalytics;

describe('spendMetrics()', () => {
  const spend = parseSpend(new URLSearchParams('spendGoogle=600&spendMeta=300&spendOther=100&currency=EUR&jobValue=2000'))!;

  it('divides total spend by inquiries, calls, contacts and won jobs', () => {
    const m = spendMetrics(analytics(10, 15), spend, 4);
    expect(m.total).toBe(1000);
    expect(m.perLead).toBe(100);
    expect(m.perCall).toBeCloseTo(66.67, 2);
    expect(m.perContact).toBe(40);
    expect(m.perWon).toBe(250);
    expect(m.revenue).toBe(8000);
    expect(m.roas).toBe(8);
  });

  it('attributes each paid channel its own spend and contacts', () => {
    const m = spendMetrics(
      analytics(10, 15, [
        { label: 'Google oglasi', visits: 300, leads: 4, calls: 8 },
        { label: 'Facebook/Instagram oglasi', visits: 200, leads: 3, calls: 0 },
      ]),
      spend,
      4,
    );
    expect(m.channels).toEqual([
      { key: 'google', label: 'Google oglasi', spend: 600, contacts: 12, perContact: 50 },
      { key: 'meta', label: 'Facebook/Instagram oglasi', spend: 300, contacts: 3, perContact: 100 },
    ]);
  });

  it('shows no cost per result when there was nothing to divide by', () => {
    const m = spendMetrics(analytics(0, 0), spend, 0);
    expect(m.perLead).toBeNull();
    expect(m.perCall).toBeNull();
    expect(m.perContact).toBeNull();
    expect(m.perWon).toBeNull();
    expect(m.revenue).toBeNull();
    expect(m.roas).toBeNull();
  });

  it('reports no spend when every amount is empty', () => {
    expect(parseSpend(new URLSearchParams('spendGoogle=&currency=USD'))).toBeNull();
  });
});
