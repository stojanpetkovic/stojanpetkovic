import siteConfig from '@/config/site.config';
import { getLocales, tData, type Locale } from '@/i18n';

/**
 * The site's name as written in `locale`.
 *
 * The brand is spelled per language — the Serbian name carries a diacritic the
 * English one does not — so it lives in the locale files as `site.name`.
 * `siteConfig.name` (from `branding.ts`) stays the default-locale spelling for
 * the places that run before a locale is known: the favicon initial, the
 * manifest and the default OG card.
 */
export function getSiteName(locale: Locale): string {
  return tData<string>('site.name', locale) ?? siteConfig.name;
}

/**
 * Every other spelling of the name across the configured locales, for
 * `alternateName` in JSON-LD, so search engines treat the spellings as one
 * entity rather than two.
 */
export function getSiteNameAlternates(locale: Locale): string[] {
  const current = getSiteName(locale);
  return [...new Set(getLocales().map(getSiteName))].filter((name) => name !== current);
}
