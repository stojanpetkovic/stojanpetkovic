/**
 * Routes Configuration
 *
 * The address of every page in each language. The code works with one
 * canonical path per page, the English one (`/projects/tag/seo`); this file
 * says what each part of that path is called in the other languages, so a
 * Serbian page lives at `/sr/projekti/oznaka/seo` and a German one at
 * `/de/projekte/schlagwort/seo`.
 *
 * `localizedPath()` in `src/i18n` applies these names to every link, the
 * language switcher, hreflang and the sitemap, and `astro.config.mjs` turns
 * every old address into a permanent redirect to the new one. A part that is
 * not listed keeps its English name in every language.
 *
 * Adding a page: add its first path segment to `segments`. Adding a tool: add
 * its slug to `tools`. Adding a project: give it an entry in `projects` only
 * when its file name is not already the right slug in every language.
 */

type Names = Partial<Record<string, string>>;

export interface RoutesConfig {
  /** First path segment of a page or section, by locale. */
  segments: Record<string, Names>;
  /** Segments under `/projects` that are not project slugs. */
  projectSubsegments: Record<string, Names>;
  /** Slug of each page under `/tools`, by locale. */
  tools: Record<string, Names>;
  /** URL slug of a project, keyed by its file name (shared by all locales). */
  projects: Record<string, Names>;
}

const routesConfig: RoutesConfig = {
  segments: {
    projects: { sr: 'projekti', de: 'projekte' },
    about: { sr: 'o-meni', de: 'ueber-mich' },
    contact: { sr: 'kontakt', de: 'kontakt' },
    services: { sr: 'usluge', de: 'leistungen' },
    terms: { sr: 'uslovi-koriscenja', de: 'nutzungsbedingungen' },
    privacy: { sr: 'politika-privatnosti', de: 'datenschutz' },
    start: { sr: 'pocetak' },
  },
  projectSubsegments: {
    tag: { sr: 'oznaka', de: 'schlagwort' },
    page: { sr: 'strana', de: 'seite' },
  },
  tools: {},
  projects: {},
};

export default routesConfig;
