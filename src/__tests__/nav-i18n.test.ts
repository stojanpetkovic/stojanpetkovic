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
    expect(items.find((i) => i.label === 'Blog')?.href).toBe('/blog');
    expect(items.find((i) => i.label === 'About')?.href).toBe('/about');
  });

  it('prefixes secondary-locale hrefs with the locale', () => {
    const items = getNavItems('de');
    expect(items.map((i) => i.href)).toEqual([
      '/de/leistungen',
      '/de/web',
      '/de/blog',
      '/de/ueber-mich',
      '/de/kontakt',
    ]);
  });

  it('translates labels via the dictionary (labelKey)', () => {
    const de = getNavItems('de');
    // de.json: nav.items.about = "Über mich", nav.items.services = "Leistungen"
    expect(de.find((i) => i.href === '/de/ueber-mich')?.label).toBe('Über mich');
    expect(de.find((i) => i.href === '/de/leistungen')?.label).toBe('Leistungen');
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

describe('top bar', () => {
  it('lists the client-facing pages only, with no engineering section', () => {
    const items = getNavItems('en');
    expect(items.map((i) => i.label)).toEqual(['Services', 'Websites', 'Blog', 'About', 'Contact']);
    // Only Services opens a menu, and it lists the service pages.
    expect(items.filter((i) => i.mega).map((i) => i.label)).toEqual(['Services']);
    const links = items[0].mega!.groups.flatMap((g) => g.links.map((l) => l.href));
    expect(links).toContain('/services/local-seo');
    expect(links).toContain('/web');
    expect(links.every((href) => href.startsWith('/services/') || href === '/web')).toBe(true);
  });

  it('names the service pages in the visitor\'s language', () => {
    const sr = getNavItems('sr')[0].mega!;
    expect(sr.groups.flatMap((g) => g.links.map((l) => l.href))).toContain('/sr/usluge/google-oglasi');
    expect(sr.groups.flatMap((g) => g.links.map((l) => l.label))).toContain('Google oglasi');
  });

  it('every link goes to a page that exists', () => {
    const pages = resolve(__dirname, '../pages');
    for (const item of getNavItems('en')) {
      const path = item.href.split('#')[0].replace(/^\//, '') || 'index';
      expect(existsSync(resolve(pages, `${path}.astro`)) || existsSync(resolve(pages, path, 'index.astro')), item.href).toBe(true);
    }
  });
});
