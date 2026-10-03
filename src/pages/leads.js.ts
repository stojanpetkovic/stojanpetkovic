export const prerender = false;

import type { APIRoute } from 'astro';
import source from '@/admin/collector/leads.js?raw';

/*
 * The collector every client site loads. Served from a route rather than
 * public/ so it carries its own short cache lifetime: as a static file it got
 * Cloudflare's default four hours, and a changed collector took that long to
 * reach visitors. Five minutes keeps it cheap without leaving old copies around.
 */
export const GET: APIRoute = () =>
  new Response(source, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      'Access-Control-Allow-Origin': '*',
    },
  });
