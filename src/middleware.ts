import { defineMiddleware } from 'astro:middleware';
import { authClient } from '@/admin/lib/supabase';
import { env } from '@/admin/lib/env';
import { isSameOrigin } from '@/admin/lib/csrf';

// The one endpoint other sites post to. It checks the caller's origin against
// the submitting site's own domain instead (src/pages/api/leads.ts).
const CROSS_SITE_ENDPOINT = '/api/leads';

/**
 * Same-origin check for every state-changing request, then the login guard
 * for the private lead admin under /admin. Prerendered portfolio pages pass
 * straight through, so the site itself never waits on an auth check.
 *
 * Astro's built-in `security.checkOrigin` is off because it would also reject
 * the cross-site submissions /api/leads exists to receive; the check below
 * covers the contact and newsletter endpoints the same way it did.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  context.locals.adminEmail = null;

  if (context.isPrerendered) return next();

  const changesState = !['GET', 'HEAD', 'OPTIONS'].includes(context.request.method);
  const crossSiteAllowed = pathname === CROSS_SITE_ENDPOINT || pathname === `${CROSS_SITE_ENDPOINT}/`;
  if (changesState && !crossSiteAllowed && !isSameOrigin(context.request)) {
    return new Response('Forbidden', { status: 403 });
  }

  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isLogin = pathname === '/admin/login' || pathname === '/admin/login/';
  if (!isAdmin || isLogin) return next();

  const supabase = authClient(context.request, context.cookies);
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase() ?? null;

  // A valid Supabase session is not enough: only the one configured
  // admin account gets in, so a stray sign-up can never see client data.
  if (!email || !env.adminEmail || email !== env.adminEmail) {
    if (data.user) await supabase.auth.signOut();
    return context.redirect('/admin/login');
  }

  context.locals.adminEmail = email;
  const response = await next();
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
