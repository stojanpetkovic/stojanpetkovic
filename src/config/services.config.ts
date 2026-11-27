/**
 * Services Configuration
 *
 * Every service the site sells, in the order they are shown. Each one with
 * `page: true` gets its own page at `/services/<id>` (named per locale in
 * `routes.config.ts`), with its copy under `pages.servicePage.items.<id>` in
 * the locale files. Websites already have their own page at `/web`, so that
 * entry only points there.
 *
 * The list feeds the service pages, the Services mega menu, the overview on
 * `/services`, the footer and the business's OfferCatalog in JSON-LD, so a
 * service added here shows up everywhere at once.
 */
import { localizedPath, t, defaultLocale, type Locale } from '@/i18n';

export interface ServiceEntry {
  /** English slug, the key in `routes.config.ts` and in the locale files. */
  id: string;
  /** Canonical path of the service's page. */
  href: string;
  /** Lucide icon name. */
  icon: string;
  /** Group in the mega menu (`nav.mega.groups.<group>`). */
  group: 'ads' | 'visibility' | 'web';
  /** Whether the page is rendered by the service page template. */
  page: boolean;
}

export const services: ServiceEntry[] = [
  { id: 'google-ads', href: '/services/google-ads', icon: 'search', group: 'ads', page: true },
  { id: 'facebook-instagram-ads', href: '/services/facebook-instagram-ads', icon: 'megaphone', group: 'ads', page: true },
  { id: 'local-seo', href: '/services/local-seo', icon: 'map-pin', group: 'visibility', page: true },
  { id: 'ai-search-visibility', href: '/services/ai-search-visibility', icon: 'sparkles', group: 'visibility', page: true },
  { id: 'websites', href: '/web', icon: 'layout', group: 'web', page: false },
  { id: 'ai-chat', href: '/services/ai-chat', icon: 'message-circle', group: 'web', page: true },
];

/** The services that have their own page under `/services`. */
export const servicePages = services.filter((service) => service.page);

/** A service's name, one-line summary and address in one locale. */
export function resolveService(service: ServiceEntry, locale: Locale = defaultLocale) {
  return {
    ...service,
    name: t(`pages.servicePage.items.${service.id}.name`, locale),
    summary: t(`pages.servicePage.items.${service.id}.summary`, locale),
    url: localizedPath(service.href, locale),
  };
}
