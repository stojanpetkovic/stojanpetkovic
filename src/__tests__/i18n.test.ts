import { describe, it, expect } from 'vitest';
import {
  t,
  tData,
  localizedPath,
  resolveLocale,
  isValidLocale,
  getLocaleName,
  getLocaleFromPath,
  getSecondaryLocales,
  stripLocaleFromPath,
  swapLocaleInPath,
} from '../i18n';

describe('i18n t() helper', () => {
  it('returns a translation for a valid dotted key', () => {
    expect(t('common.readMore', 'en')).toBe('Read more');
  });

  it('returns the German translation when locale is de', () => {
    expect(t('common.readMore', 'de')).toBe('Weiterlesen');
  });

  it('falls back to the default-locale string when the locale has no entry', () => {
    // 'fr' has no dictionary — should fall back to English
    expect(t('common.readMore', 'fr')).toBe('Read more');
  });

  it('returns the key itself when no translation exists in any dictionary', () => {
    expect(t('some.missing.key', 'en')).toBe('some.missing.key');
  });

  it('interpolates {placeholder} variables', () => {
    expect(t('blog.readingTime', 'en', { minutes: 5 })).toBe('5 min read');
    expect(t('blog.readingTime', 'de', { minutes: 5 })).toBe('5 Min. Lesezeit');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(t('blog.readingTime', 'en', {})).toBe('{minutes} min read');
  });
});

describe('i18n tData() helper', () => {
  it('returns a structured (array) value by dotted key', () => {
    // Asserts the shape rather than the copy. The previous version read
    // `pages.about.intro.facts` and checked for the literal "Astro 7"; the
    // about page was later restructured, `intro` stopped existing, and the
    // test failed for a reason that had nothing to do with tData().
    const items = tData<{ icon: string; title: string; description: string }[]>(
      'pages.about.principles.items',
      'en'
    );
    expect(Array.isArray(items)).toBe(true);
    expect(items?.length).toBeGreaterThan(0);
    expect(items?.[0]).toEqual(
      expect.objectContaining({
        icon: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
      })
    );
  });

  it('returns the German structured value when locale is de', () => {
    const hero = tData<{ badge: string }>('pages.about.hero', 'de');
    expect(hero?.badge).toBe('Über mich');
  });

  it('falls back to the default-locale value when the locale has no entry', () => {
    // 'fr' has no dictionary — should fall back to the English data
    const cards = tData<unknown[]>('pages.about.faq.cards', 'fr');
    expect(Array.isArray(cards)).toBe(true);
    expect(cards?.length).toBe(2);
  });

  it('returns undefined when the key is absent in every dictionary', () => {
    expect(tData('pages.does.not.exist', 'en')).toBeUndefined();
  });
});

describe('i18n getSecondaryLocales()', () => {
  it('lists every non-default locale the site ships', () => {
    // Real config: enabled, with 'en' as the default and 'sr' and 'de' prefixed.
    expect(getSecondaryLocales()).toEqual(['sr', 'de']);
  });
});

describe('i18n localizedPath()', () => {
  it('returns the path unchanged when i18n is disabled (single locale)', () => {
    // With default config (locales: ['en']), i18n is effectively off
    expect(localizedPath('/about')).toBe('/about');
    expect(localizedPath('/')).toBe('/');
    expect(localizedPath('blog/hello')).toBe('/blog/hello');
  });
});

describe('i18n locale helpers', () => {
  it('resolves an unknown locale to the default', () => {
    expect(resolveLocale('xx')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
  });

  it('validates a configured locale', () => {
    expect(isValidLocale('en')).toBe(true);
    expect(isValidLocale('xx')).toBe(false);
    expect(isValidLocale(undefined)).toBe(false);
  });

  it('returns the display name when configured, otherwise the code', () => {
    expect(getLocaleName('en')).toBe('English');
    expect(getLocaleName('de')).toBe('Deutsch');
    expect(getLocaleName('sr')).toBe('Srpski');
    expect(getLocaleName('xx')).toBe('xx');
  });
});

describe('i18n getLocaleFromPath()', () => {
  it('returns the default locale for the root path', () => {
    expect(getLocaleFromPath('/')).toBe('en');
  });

  it('returns the default locale when no recognized prefix is present', () => {
    expect(getLocaleFromPath('/about')).toBe('en');
    expect(getLocaleFromPath('/blog/hello-world')).toBe('en');
  });

  it('returns the default locale when the first segment is not a configured locale', () => {
    // 'fr' is not a configured locale, so it is not recognized
    expect(getLocaleFromPath('/fr/about')).toBe('en');
    expect(getLocaleFromPath('/zh-cn/blog')).toBe('en');
  });

  it('normalizes paths without a leading slash', () => {
    expect(getLocaleFromPath('about')).toBe('en');
  });
});

describe('i18n stripLocaleFromPath()', () => {
  it('leaves a path unchanged when the first segment is not a configured locale', () => {
    expect(stripLocaleFromPath('/about')).toBe('/about');
    expect(stripLocaleFromPath('/fr/about')).toBe('/fr/about');
  });

  it('returns "/" for the root path', () => {
    expect(stripLocaleFromPath('/')).toBe('/');
  });
});

describe('i18n swapLocaleInPath()', () => {
  it('returns the path unchanged when targeting the default locale (no prefix added)', () => {
    expect(swapLocaleInPath('/about', 'en')).toBe('/about');
  });

  it('prefixes the path when targeting the configured secondary locale', () => {
    expect(swapLocaleInPath('/about', 'sr')).toBe('/sr/o-meni');
  });
});

describe('i18n meta titles never embed the site name', () => {
  // SEO.astro renders the document <title> as `${title} — ${siteConfig.name}`,
  // so any meta-title dictionary value that already contains the site name
  // would render it twice (e.g. "Blog — Astro Rocket — Astro Rocket"). Every
  // key below feeds that `title` prop and must therefore stay brand-free.
  //
  // The shipped brand is checked as a literal on purpose: importing
  // site.config.ts here would pull in `astro:env/server` (see i18n.config.ts),
  // and this guards the theme's own default dictionaries against a regression.
  const SITE_NAME = 'Astro Rocket';
  const METATITLE_KEYS = [
    'blog.metaTitle',
    'blog.pageMetaTitle',
    'blog.tagMetaTitle',
    'projects.metaTitle',
    'projects.pageMetaTitle',
    'projects.tagMetaTitle',
    'errors.metaTitle',
    'pages.home.meta.title',
    'pages.about.meta.title',
    'pages.services.meta.title',
    'pages.contact.meta.title',
  ];

  const cases = ['en', 'sr', 'de'].flatMap((locale) =>
    METATITLE_KEYS.map((key) => [locale, key] as [string, string])
  );

  it.each(cases)('%s "%s" does not include the site name', (locale, key) => {
    expect(t(key, locale)).not.toContain(SITE_NAME);
  });
});
