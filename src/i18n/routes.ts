/**
 * Translate a path between its canonical form and the address it has in a
 * language. Canonical paths are the English ones the code is written with
 * (`/projects/tag/geothermal`); the names come from `src/config/routes.config.ts`.
 *
 * Both functions work on a path without the locale prefix and keep any query
 * string or hash. Plain functions on plain data, so `astro.config.mjs` can use
 * them for the redirects and the sitemap as well.
 */
import routesConfig, { type RoutesConfig } from '../config/routes.config.ts';

type Table = Record<string, Partial<Record<string, string>>>;

const name = (table: Table, key: string, locale: string): string => table[key]?.[locale] ?? key;

const reverse = (table: Table, value: string, locale: string): string =>
  Object.keys(table).find((key) => name(table, key, locale) === value) ?? value;

function split(path: string): { segments: string[]; trailingSlash: boolean; suffix: string } {
  const match = path.match(/^([^?#]*)(.*)$/)!;
  const [, pathname, suffix] = match;
  return {
    segments: pathname.split('/').filter(Boolean),
    trailingSlash: pathname.length > 1 && pathname.endsWith('/'),
    suffix,
  };
}

function join(segments: string[], trailingSlash: boolean, suffix: string): string {
  return `/${segments.join('/')}${trailingSlash && segments.length ? '/' : ''}${suffix}`;
}

function translate(path: string, locale: string, config: RoutesConfig, toLocale: boolean): string {
  const { segments, trailingSlash, suffix } = split(path);
  if (!segments.length) return join(segments, trailingSlash, suffix);
  const map = (table: Table, value: string) => (toLocale ? name(table, value, locale) : reverse(table, value, locale));

  const first = map(config.segments, segments[0]);
  const section = toLocale ? segments[0] : first;
  const out = [first];
  if (segments.length > 1) {
    if (section === 'tools') {
      out.push(map(config.tools, segments[1]));
    } else if (section === 'projects') {
      const sub = map(config.projectSubsegments, segments[1]);
      const isSub = toLocale ? segments[1] in config.projectSubsegments : sub in config.projectSubsegments;
      out.push(isSub ? sub : map(config.projects, segments[1]));
    } else {
      out.push(segments[1]);
    }
    out.push(...segments.slice(2));
  }
  return join(out, trailingSlash, suffix);
}

/** The address of a canonical path in a locale: `/tools/well-kill` → `/alati/gusenje-busotine` for `sr`. */
export function toLocalizedRoute(path: string, locale: string, config: RoutesConfig = routesConfig): string {
  return translate(path, locale, config, true);
}

/** The canonical path of a locale's address: `/alati/gusenje-busotine` in `sr` → `/tools/well-kill`. */
export function toCanonicalRoute(path: string, locale: string, config: RoutesConfig = routesConfig): string {
  return translate(path, locale, config, false);
}

/** One path segment in a locale, for the route files' `getStaticPaths`: `segment('tools', 'sr')` → `alati`. */
export function segment(key: string, locale: string, config: RoutesConfig = routesConfig): string {
  return name(config.segments, key, locale);
}

/** A segment under `/projects` (`tag`, `page`) in a locale. */
export function projectSubsegment(key: string, locale: string, config: RoutesConfig = routesConfig): string {
  return name(config.projectSubsegments, key, locale);
}

/** The slug of a tool page in a locale. */
export function toolSlug(key: string, locale: string, config: RoutesConfig = routesConfig): string {
  return name(config.tools, key, locale);
}

/** The URL slug of a project, from its file name, in a locale. */
export function projectSlug(key: string, locale: string, config: RoutesConfig = routesConfig): string {
  return name(config.projects, key, locale);
}

/**
 * Permanent redirects from the addresses the pages had before their segments
 * were translated (`/sr/projects/...`, `/de/tools/...`, `/projects/<file name>`)
 * to the ones they have now, so links and search rankings carry over. `pages`
 * lists what exists: the canonical tool slugs, the project file names and each
 * locale's project tag slugs, read from the source folders by `astro.config.mjs`.
 * Only addresses that changed appear.
 */
export function legacyRedirects(
  locales: string[],
  defaultLocale: string,
  pages: { tools: string[]; projects: string[]; projectTags: Record<string, string[]> },
  config: RoutesConfig = routesConfig,
): Record<string, string> {
  const redirects: Record<string, string> = {};
  for (const locale of locales) {
    const prefix = locale === defaultLocale ? '' : `/${locale}`;
    const add = (canonical: string) => {
      const target = `${prefix}${toLocalizedRoute(canonical, locale, config)}`;
      // To the trailing-slash form the canonical tags use, so it takes one hop.
      if (target !== `${prefix}${canonical}`) redirects[`${prefix}${canonical}`] = `${target}/`;
    };
    for (const key of Object.keys(config.segments)) add(`/${key}`);
    for (const tool of pages.tools) add(`/tools/${tool}`);
    for (const project of pages.projects) add(`/projects/${project}`);
    for (const tag of pages.projectTags[locale] ?? []) add(`/projects/tag/${tag}`);
  }
  return redirects;
}
