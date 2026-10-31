/**
 * The lead system now lives on webtano.com. This site keeps no lead admin of
 * its own: the old addresses below only point there, so a page or a client
 * site still cached with them keeps working.
 */
export const WEBTANO_URL = 'https://webtano.com';

/** A redirect to the same path on webtano.com, keeping the query string. */
export function toWebtano(url: URL, status: 301 | 302 | 307 | 308): Response {
  return new Response(null, {
    status,
    headers: { Location: `${WEBTANO_URL}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' },
  });
}
