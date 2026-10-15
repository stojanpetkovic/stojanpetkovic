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
import nl from '../i18n/nl.json';
import sr from '../i18n/sr.json';

const locales = { en, de, nl, sr } as Record<string, unknown>;

const BLOCKS = [
  'pages.home.hero.badges',
  'pages.home.hero.qualifications',
  'pages.home.hero.credentialsDialog',
  'pages.home.services.cards',
  'pages.home.workWithMe.cards',
  'pages.home.webGateway.items',
  'pages.home.aboutTeaser.facts',
  'pages.tools.meta',
  'pages.tools.hero',
  'pages.tools.items',
  'pages.tools.suggest',
  'pages.ctPressureLoss.meta',
  'pages.ctPressureLoss.hero',
  'pages.ctPressureLoss.fields',
  'pages.ctPressureLoss.results',
  'pages.ctPressureLoss.method',
  'pages.ctStrength.meta',
  'pages.ctStrength.hero',
  'pages.ctStrength.fields',
  'pages.ctStrength.results',
  'pages.ctStrength.method',
  'pages.tools.form',
  'nav.items.tools',
  'pages.web.meta',
  'pages.web.hero',
  'pages.web.services.cards',
  'pages.web.closing',
  'pages.web.glance.items',
  'pages.about.faq.cards',
  'projects.emptyTitle',
  'projects.emptyText',
  'pages.services.areas.consulting.included',
  'pages.services.areas.software.included',
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
  'footer.groups.engineering',
  'footer.links.focus',
  'nav.items.web',
];

const read = (tree: unknown, path: string) =>
  path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);

describe('page copy', () => {
  for (const [locale, tree] of Object.entries(locales)) {
    it.each(BLOCKS)(`${locale} has %s`, (path) => {
      expect(read(tree, path), `${locale}: ${path}`).toBeTruthy();
    });
  }
});
