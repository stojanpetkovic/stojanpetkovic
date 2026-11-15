import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import sr from '@/i18n/sr.json';
import de from '@/i18n/de.json';
import { legalLinks } from '@/config/nav.config';

type Section = { title: string; paragraphs: string[]; items?: string[] };
const legal = (d: unknown, page: 'terms' | 'privacy') =>
  (d as { pages: Record<string, { sections: Section[] }> }).pages[page];

describe.each(['terms', 'privacy'] as const)('%s page', (page) => {
  const base = legal(en, page).sections;

  it.each([
    ['sr', sr],
    ['de', de],
  ])('%s has the same sections, paragraphs and list items as English', (_, locale) => {
    const sections = legal(locale, page).sections;
    expect(sections.map((s) => [s.paragraphs.length, s.items?.length ?? 0])).toEqual(
      base.map((s) => [s.paragraphs.length, s.items?.length ?? 0]),
    );
  });

  it('is linked from the footer', () => {
    expect(legalLinks.some((l) => l.href === `/${page}`)).toBe(true);
  });
});

describe('terms of use', () => {
  it('keeps a section on independence from any employer', () => {
    const section = legal(en, 'terms').sections.find((s) => /independence/i.test(s.title));
    expect(section?.paragraphs.join(' ')).toMatch(/employer/i);
  });

  it('says results are not guaranteed', () => {
    expect(legal(en, 'terms').sections.some((s) => /guarantee/i.test(s.title))).toBe(true);
  });
});

describe('privacy policy', () => {
  it('names the controller, the processors and the rights', () => {
    const text = JSON.stringify(legal(en, 'privacy'));
    for (const word of ['Controller', 'Vercel', 'Resend', 'webtano.com', 'withdraw consent', 'poverenik.rs']) {
      expect(text).toContain(word);
    }
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
