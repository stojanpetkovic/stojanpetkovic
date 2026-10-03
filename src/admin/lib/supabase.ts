import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';
import { env } from './env';

let adminClient: SupabaseClient | null = null;

/** Service-role client. Server only: bypasses RLS, which denies everyone else. */
export function db(): SupabaseClient {
  if (!adminClient) {
    if (!env.supabaseUrl || !env.supabaseSecretKey) {
      throw new Error('PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set');
    }
    adminClient = createClient(env.supabaseUrl, env.supabaseSecretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

/** Auth client bound to the request's cookies, used only for the login session. */
export function authClient(request: Request, cookies: AstroCookies) {
  return createServerClient(env.supabaseUrl, env.supabasePublishableKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name, value }) => ({
          name,
          value: value ?? '',
        }));
      },
      setAll(list) {
        for (const { name, value, options } of list) {
          cookies.set(name, value, {
            ...options,
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
          });
        }
      },
    },
  });
}
