import { defineMiddleware } from 'astro:middleware';
import { isSameOrigin } from '@/lib/csrf';

// Old lead endpoints that only redirect to webtano.com. Client sites post to
// them cross-site, so they skip the same-origin check.
const CROSS_SITE_ENDPOINTS = ['/api/leads', '/api/hit', '/api/event'];

/**
 * Same-origin check for every state-changing request (the contact and
 * newsletter forms). Prerendered pages pass straight through.
 *
 * Astro's built-in `security.checkOrigin` is off because it would also reject
 * the cross-site posts the redirects above exist to pass on.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const { pathname } = context.url;
  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method);
  const crossSiteAllowed = CROSS_SITE_ENDPOINTS.some((p) => pathname === p || pathname === `${p}/`);
  if (changesState && !crossSiteAllowed && !isSameOrigin(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }
  return next();
});
