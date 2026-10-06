/**
 * Brand values needed before `astro:env` exists.
 *
 * `astro.config.mjs` generates the favicon PNG/ICO files in a build hook and
 * needs the site's initial and its theme colour to do it — but it cannot
 * import `site.config.ts`, which reads `astro:env/server` and so cannot be
 * loaded at config time. Same constraint as `site-url.ts`, same answer: keep
 * the values in a plain module both sides import, so they cannot drift.
 *
 * Change them here. `site.config.ts` reads from this file.
 */
/**
 * The brand in the default locale. Other locales spell it in their own
 * dictionary (`site.name`); read it through `getSiteName(locale)`.
 */
export const SITE_NAME = 'Mr.Petkovic';

/**
 * An image to draw the favicons from instead of the letter monogram: a path
 * from the project root, and the square of it to use (left, top, size, in the
 * source's pixels) — framed on the face, so the mark still reads at 16px.
 * Remove it to go back to the initial on THEME_COLOR.
 */
export const FAVICON_IMAGE: { path: string; crop: { left: number; top: number; size: number } } | undefined = {
  path: 'src/assets/profile/favicon-avatar.webp',
  crop: { left: 140, top: 40, size: 960 },
};

/** Browser toolbar colour, and the fill behind the favicon letter. */
export const THEME_COLOR = '#0083fe';
