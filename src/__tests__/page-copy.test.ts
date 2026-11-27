/**
 * The page views read their copy from the locale files by key. A key that goes
 * missing renders as a crash on that page (`Cannot read properties of
 * undefined`) rather than as a build error, and the parity test cannot see it
 * because every locale loses the key together. This names the blocks each view
 * depends on and checks all four locales still carry them.
 */
import { describe, expect, it } from 'vitest';
import en from '../i18n/en.json';
import de from '../i18n/de.json';
import sr from '../i18n/sr.json';
import { services, servicePages } from '../config/services.config';

const locales = { en, de, sr } as Record<string, unknown>;

const BLOCKS = [
  'pages.home.meta',
  'pages.home.hero',
  'pages.home.pillars.items',
  'pages.home.industries.items',
  'pages.home.testimonials.items',
  'pages.home.portfolio',
  'pages.home.final',
  'pages.web.meta',
  'pages.web.hero',
  'pages.web.services.cards',
  'pages.web.closing',
  'pages.web.glance.items',
  'pages.web.details.sections',
  'pages.web.faq.items',
  'pages.about.faq.cards',
  'projects.emptyTitle',
  'projects.emptyText',
  'pages.services.areas.marketing.included',
  'pages.services.areas.web.included',
  'pages.services.overviewFaq.cards',
  'pages.services.process.steps',
  'pages.contact.meta',
  'pages.contact.hero',
  'pages.contact.help',
  'pages.contact.next',
  'pages.contact.facts',
  'pages.contact.form.services',
  'pages.contact.form.timelines',
  'pages.about.background.paragraphs',
  'nav.items.web',
  'nav.mega.groups',
  'pages.servicePage.common.cta',
  ...servicePages.flatMap(({ id }) => [
    `pages.servicePage.items.${id}.meta`,
    `pages.servicePage.items.${id}.hero`,
    `pages.servicePage.items.${id}.intro.paragraphs`,
    `pages.servicePage.items.${id}.details.sections`,
    `pages.servicePage.items.${id}.areas`,
    `pages.servicePage.items.${id}.included.items`,
    `pages.servicePage.items.${id}.fit`,
    `pages.servicePage.items.${id}.steps.items`,
    `pages.servicePage.items.${id}.faq`,
  ]),
  ...services.map(({ id }) => `pages.servicePage.items.${id}.summary`),
];

const read = (tree: unknown, path: string) =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

describe('service page meta', () => {
  for (const [locale, tree] of Object.entries(locales)) {
    it.each(servicePages.map(({ id }) => id))(`${locale} %s has a title and description that fit in search results`, (id) => {
      const meta = read(tree, `pages.servicePage.items.${id}.meta`) as { title: string; description: string };
      expect(meta.title.length).toBeLessThanOrEqual(60);
      expect(meta.description.length).toBeGreaterThanOrEqual(110);
      expect(meta.description.length).toBeLessThanOrEqual(160);
    });
  }
});

describe('page copy', () => {
  for (const [locale, tree] of Object.entries(locales)) {
    it.each(BLOCKS)(`${locale} has %s`, (path) => {
      expect(read(tree, path), `${locale}: ${path}`).toBeTruthy();
    });
  }
});
