import { describe, it, expect, vi } from 'vitest';

// Exercise the nav config's locale resolution with i18n turned ON and two
// locales. The default locale stays at the site root; the secondary locale is
// prefixed and labels are translated via the dictionary. Guards the localized
// header/footer nav and logo wired up for #438.
vi.mock('@/config/i18n.config', () => ({
  default: {
    enabled: true,
    defaultLocale: 'en',
    locales: ['en', 'de'],
    localeNames: { en: 'English', de: 'Deutsch' },
    detectBrowserLocale: false,
  },
}));

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getNavItems, getLogoHref, resolveNavItem, type NavItem } from '@/config/nav.config';

describe('nav config — locale resolution (en default, de secondary)', () => {
  it('keeps default-locale hrefs at the site root', () => {
    const items = getNavItems('en');
    expect(items.find((i) => i.label === 'Projects')?.href).toBe('/projects');
    expect(items.find((i) => i.label === 'About')?.href).toBe('/about');
  });

  it('prefixes secondary-locale hrefs with the locale', () => {
    const items = getNavItems('de');
    expect(items.map((i) => i.href)).toEqual([
      '/de',
      '/de/services',
      '/de/projects',
      '/de/about',
      '/de/contact',
    ]);
  });

  it('translates labels via the dictionary (labelKey)', () => {
    const de = getNavItems('de');
    // de.json: nav.items.about = "Über mich", nav.items.services = "Leistungen"
    expect(de.find((i) => i.href === '/de/about')?.label).toBe('Über mich');
    expect(de.find((i) => i.href === '/de/services')?.label).toBe('Leistungen');
  });

  it('points the logo at the locale home', () => {
    expect(getLogoHref('en')).toBe('/');
    expect(getLogoHref('de')).toBe('/de');
  });

  it('never locale-prefixes external, mailto/tel, or anchor hrefs', () => {
    expect(
      resolveNavItem(
        { label: 'GitHub', href: 'https://github.com/x', order: 1, external: true },
        'de'
      ).href
    ).toBe('https://github.com/x');
    expect(resolveNavItem({ label: 'Top', href: '#top', order: 1 }, 'de').href).toBe('#top');
    expect(resolveNavItem({ label: 'Mail', href: 'mailto:a@b.com', order: 1 }, 'de').href).toBe(
      'mailto:a@b.com'
    );
  });

  it('applies a per-locale override (label + path), still locale-prefixed', () => {
    const item: NavItem = {
      label: 'Contact',
      href: '/contact',
      order: 1,
      locales: { de: { label: 'Kontakt aufnehmen', href: '/kontakt' } },
    };
    expect(resolveNavItem(item, 'de')).toEqual({
      label: 'Kontakt aufnehmen',
      href: '/de/kontakt',
      external: undefined,
    });
    // The default locale is unaffected by a de-only override.
    expect(resolveNavItem(item, 'en')).toEqual({
      label: 'Contact',
      href: '/contact',
      external: undefined,
    });
  });

  it('falls back to the literal label when no labelKey is set', () => {
    expect(resolveNavItem({ label: 'Docs', href: '/docs', order: 1 }, 'de').label).toBe('Docs');
  });
});

describe('Services mega menu', () => {
  const services = (locale: 'en' | 'de') => getNavItems(locale).find((i) => i.mega)!;

  it('groups the service pages under Services and keeps the top bar short', () => {
    const items = getNavItems('en');
    expect(items.map((i) => i.label)).toEqual(['Home', 'Services', 'Projects', 'About', 'Contact']);
    const hrefs = services('en').mega!.groups.flatMap((g) => g.links.map((l) => l.href));
    expect(hrefs).toContain('/courses');
    expect(hrefs).toContain('/tools');
    expect(hrefs).toContain('/web');
    expect(hrefs).toContain('/tools/well-kill');
  });

  it('prefixes every link and the covered sections with the locale', () => {
    const mega = services('de').mega!;
    for (const link of [...mega.groups.flatMap((g) => g.links), mega.overview]) {
      expect(link.href.startsWith('/de/'), link.href).toBe(true);
    }
    expect(mega.activePrefixes).toContain('/de/courses');
  });

  it('every link has a label and goes to a page that exists', () => {
    const pages = resolve(__dirname, '../pages');
    for (const link of services('en').mega!.groups.flatMap((g) => g.links)) {
      expect(link.label, link.href).toBeTruthy();
      const path = link.href.split('#')[0].replace(/^\//, '');
      expect(existsSync(resolve(pages, `${path}.astro`)) || existsSync(resolve(pages, path, 'index.astro')), link.href).toBe(true);
    }
  });
});
