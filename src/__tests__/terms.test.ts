import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import sr from '@/i18n/sr.json';
import de from '@/i18n/de.json';
import { legalLinks } from '@/config/nav.config';

type Section = { title: string; paragraphs: string[]; items?: string[] };
const terms = (d: unknown) => (d as { pages: { terms: { sections: Section[] } } }).pages.terms;

describe('terms of use', () => {
  const base = terms(en).sections;

  it.each([
    ['sr', sr],
    ['de', de],
  ])('%s has the same sections, paragraphs and list items as English', (_, locale) => {
    const sections = terms(locale).sections;
    expect(sections.map((s) => [s.paragraphs.length, s.items?.length ?? 0])).toEqual(
      base.map((s) => [s.paragraphs.length, s.items?.length ?? 0]),
    );
  });

  it('keeps a section on independence and conflicts of interest, with its list of commitments', () => {
    const section = base[1];
    expect(section.title).toMatch(/conflicts of interest/i);
    expect(section.items!.length).toBeGreaterThanOrEqual(7);
  });

  it('is linked from the footer', () => {
    expect(legalLinks.some((l) => l.href === '/terms')).toBe(true);
  });
});

describe('contact form terms', () => {
  const form = (d: unknown, ns: 'landing' | 'contact') =>
    (d as { pages: Record<string, { form: Record<string, string> }> }).pages[ns].form;

  it.each([
    ['en', en],
    ['sr', sr],
    ['de', de],
  ])('%s asks for the terms in both enquiry forms', (_, locale) => {
    for (const ns of ['landing', 'contact'] as const) {
      expect(form(locale, ns).termsLabel).toContain('{terms}');
      expect(form(locale, ns).termsLink).toBeTruthy();
      expect(form(locale, ns).termsRequired).toBeTruthy();
    }
  });
});
