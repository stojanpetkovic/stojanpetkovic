import { describe, expect, it } from 'vitest';
import { canonicalPath, localizedPath, swapLocaleInPath } from '@/i18n';
import { legacyRedirects, toCanonicalRoute, toLocalizedRoute } from '@/i18n/routes';
import routesConfig from '@/config/routes.config';

// A config with translated tool and project slugs, to exercise those tables
// now that the site itself has none.
const fixture = {
  ...routesConfig,
  segments: { ...routesConfig.segments, tools: { sr: 'alati', de: 'werkzeuge' } },
  tools: { 'well-kill': { sr: 'gusenje-busotine', de: 'bohrlochkill' } },
  projects: { 'geotermalni-model-melenci': { en: 'melenci-geothermal-model', de: 'geothermisches-modell-melenci' } },
};

describe('localized routes', () => {
  it('names each segment in the language of the page', () => {
    expect(localizedPath('/services', 'sr')).toBe('/sr/usluge');
    expect(localizedPath('/services', 'de')).toBe('/de/leistungen');
    expect(localizedPath('/services', 'en')).toBe('/services');
    expect(localizedPath('/projects/tag/seo', 'sr')).toBe('/sr/projekti/oznaka/seo');
    expect(localizedPath('/projects/page/2', 'de')).toBe('/de/projekte/seite/2');
    expect(toLocalizedRoute('/tools/well-kill', 'sr', fixture)).toBe('/alati/gusenje-busotine');
  });

  it('gives a project its own slug in each language', () => {
    expect(toLocalizedRoute('/projects/geotermalni-model-melenci', 'en', fixture)).toBe('/projects/melenci-geothermal-model');
    expect(toLocalizedRoute('/projects/geotermalni-model-melenci', 'de', fixture)).toBe(
      '/projekte/geothermisches-modell-melenci',
    );
    expect(toLocalizedRoute('/projects/geotermalni-model-melenci', 'sr', fixture)).toBe('/projekti/geotermalni-model-melenci');
  });

  it('reads every address back to its canonical path', () => {
    expect(canonicalPath('/sr/usluge')).toBe('/services');
    expect(canonicalPath('/de/projekte/schlagwort/seo')).toBe('/projects/tag/seo');
    expect(toCanonicalRoute('/alati/gusenje-busotine', 'sr', fixture)).toBe('/tools/well-kill');
    expect(toCanonicalRoute('/projects/melenci-geothermal-model', 'en', fixture)).toBe('/projects/geotermalni-model-melenci');
    expect(canonicalPath('/de')).toBe('/');
  });

  it('switches language to the same page under its other name', () => {
    expect(swapLocaleInPath('/sr/o-meni/', 'de')).toBe('/de/ueber-mich/');
    expect(swapLocaleInPath('/de/projekte/caretrans', 'en')).toBe('/projects/caretrans');
    expect(swapLocaleInPath('/sr/usluge?x=1#a', 'en')).toBe('/services?x=1#a');
  });

  it('keeps a project whose slug is the name of a subsegment apart from it', () => {
    expect(toLocalizedRoute('/projects/tag', 'sr')).toBe('/projekti/oznaka');
    expect(toCanonicalRoute('/projekti/oznaka', 'sr')).toBe('/projects/tag');
  });

  it('round-trips every configured name', () => {
    const paths = [
      ...Object.keys(routesConfig.segments).map((s) => `/${s}`),
      ...Object.keys(routesConfig.tools).map((t) => `/tools/${t}`),
      ...Object.keys(routesConfig.projects).map((p) => `/projects/${p}`),
    ];
    for (const locale of ['en', 'sr', 'de']) {
      const seen = new Set<string>();
      for (const path of paths) {
        const localized = toLocalizedRoute(path, locale);
        expect(seen.has(localized), `${locale} ${localized} is used twice`).toBe(false);
        seen.add(localized);
        expect(toCanonicalRoute(localized, locale)).toBe(path);
      }
    }
  });
});

describe('legacy redirects', () => {
  const redirects = legacyRedirects(
    ['en', 'sr', 'de'],
    'en',
    {
      tools: ['well-kill'],
      projects: ['geotermalni-model-melenci', 'caretrans'],
      projectTags: { sr: ['geotermija'], de: ['geothermie'] },
    },
    fixture,
  );

  it('sends every old address to its new one', () => {
    expect(redirects['/sr/about']).toBe('/sr/o-meni/');
    expect(redirects['/de/tools/well-kill']).toBe('/de/werkzeuge/bohrlochkill/');
    expect(redirects['/projects/geotermalni-model-melenci']).toBe('/projects/melenci-geothermal-model/');
    expect(redirects['/de/projects/caretrans']).toBe('/de/projekte/caretrans/');
    expect(redirects['/sr/projects/tag/geotermija']).toBe('/sr/projekti/oznaka/geotermija/');
    expect(redirects['/de/projects/tag/geothermie']).toBe('/de/projekte/schlagwort/geothermie/');
  });

  it('leaves out addresses that did not change', () => {
    expect(redirects['/about']).toBeUndefined();
    expect(redirects['/projects/caretrans']).toBeUndefined();
    expect(redirects['/de/contact']).toBe('/de/kontakt/');
    expect(Object.values(redirects)).not.toContain('/tools/well-kill');
  });
});
