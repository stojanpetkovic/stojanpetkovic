/**
 * Routes Configuration
 *
 * The address of every page in each language. The code works with one
 * canonical path per page, the English one (`/tools/well-kill`); this file
 * says what each part of that path is called in the other languages, so a
 * Serbian page lives at `/sr/alati/gusenje-busotine` and a German one at
 * `/de/werkzeuge/bohrlochkill`.
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
    tools: { sr: 'alati', de: 'werkzeuge' },
    about: { sr: 'o-meni', de: 'ueber-mich' },
    contact: { sr: 'kontakt', de: 'kontakt' },
    courses: { sr: 'kursevi', de: 'kurse' },
    services: { sr: 'usluge', de: 'leistungen' },
    terms: { sr: 'uslovi-koriscenja', de: 'nutzungsbedingungen' },
    start: { sr: 'pocetak' },
  },
  projectSubsegments: {
    tag: { sr: 'oznaka', de: 'schlagwort' },
    page: { sr: 'strana', de: 'seite' },
  },
  tools: {
    'ct-pressure-loss': { sr: 'ct-pad-pritiska', de: 'ct-druckverlust' },
    'ct-strength-limits': { sr: 'ct-granice-cvrstoce', de: 'ct-festigkeitsgrenzen' },
    'nitrogen-displacement': { sr: 'zamena-fluida-azotom', de: 'stickstoff-verdraengung' },
    'nitrogen-vessel': { sr: 'azot-za-sud', de: 'stickstoff-fuer-behaelter' },
    'well-builder': { sr: 'crtanje-busotine', de: 'bohrungs-builder' },
    'well-kill': { sr: 'gusenje-busotine', de: 'bohrlochkill' },
  },
  projects: {
    'geotermalni-model-melenci': {
      en: 'melenci-geothermal-model',
      de: 'geothermisches-modell-melenci',
    },
    'geotermalni-potencijal-vojvodine': {
      en: 'geothermal-potential-of-vojvodina',
      de: 'geothermisches-potenzial-der-vojvodina',
    },
  },
};

export default routesConfig;
