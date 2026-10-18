import { describe, expect, it } from 'vitest';
import { canonicalPath, localizedPath, swapLocaleInPath } from '@/i18n';
import { legacyRedirects, toCanonicalRoute, toLocalizedRoute } from '@/i18n/routes';
import routesConfig from '@/config/routes.config';

describe('localized routes', () => {
  it('names each segment in the language of the page', () => {
    expect(localizedPath('/tools/well-kill', 'sr')).toBe('/sr/alati/gusenje-busotine');
    expect(localizedPath('/tools/well-kill', 'de')).toBe('/de/werkzeuge/bohrlochkill');
    expect(localizedPath('/tools/well-kill', 'en')).toBe('/tools/well-kill');
    expect(localizedPath('/projects/tag/geotermija', 'sr')).toBe('/sr/projekti/oznaka/geotermija');
    expect(localizedPath('/projects/page/2', 'de')).toBe('/de/projekte/seite/2');
  });

  it('gives a project its own slug in each language', () => {
    expect(localizedPath('/projects/geotermalni-model-melenci', 'en')).toBe('/projects/melenci-geothermal-model');
    expect(localizedPath('/projects/geotermalni-model-melenci', 'de')).toBe(
      '/de/projekte/geothermisches-modell-melenci',
    );
    expect(localizedPath('/projects/geotermalni-model-melenci', 'sr')).toBe('/sr/projekti/geotermalni-model-melenci');
  });

  it('reads every address back to its canonical path', () => {
    expect(canonicalPath('/sr/alati/gusenje-busotine')).toBe('/tools/well-kill');
    expect(canonicalPath('/de/projekte/schlagwort/geothermie')).toBe('/projects/tag/geothermie');
    expect(canonicalPath('/projects/melenci-geothermal-model')).toBe('/projects/geotermalni-model-melenci');
    expect(canonicalPath('/de')).toBe('/');
  });

  it('switches language to the same page under its other name', () => {
    expect(swapLocaleInPath('/sr/o-meni/', 'de')).toBe('/de/ueber-mich/');
    expect(swapLocaleInPath('/de/projekte/geothermisches-modell-melenci', 'en')).toBe(
      '/projects/melenci-geothermal-model',
    );
    expect(swapLocaleInPath('/sr/alati/ct-pad-pritiska?x=1#a', 'en')).toBe('/tools/ct-pressure-loss?x=1#a');
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
  const redirects = legacyRedirects(['en', 'sr', 'de'], 'en', {
    tools: ['ct-simulator', 'well-kill'],
    projects: ['geotermalni-model-melenci', 'caretrans'],
    projectTags: { sr: ['geotermija'], de: ['geothermie'] },
  });

  it('sends every old address to its new one', () => {
    expect(redirects['/sr/about']).toBe('/sr/o-meni/');
    expect(redirects['/de/tools/well-kill']).toBe('/de/werkzeuge/bohrlochkill/');
    expect(redirects['/sr/tools/ct-simulator']).toBe('/sr/alati/ct-simulator/');
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
