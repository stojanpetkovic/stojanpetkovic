export const prerender = false;

import type { APIRoute } from 'astro';
import { createHash } from 'node:crypto';
import { db } from '@/admin/lib/supabase';
import { env } from '@/admin/lib/env';
import { findSite } from '@/admin/lib/ingest';
import { originMatches, parseUtm, str } from '@/admin/lib/leads';
import { channelOf, referrerHost } from '@/admin/lib/channels';
import type { Site } from '@/admin/lib/types';

/*
 * Page-view collector for the admin's own analytics. leads.js posts one small
 * request per page. No cookies and no IP address are stored: unique visitors
 * are counted with a hash that changes every day (see visitor_hash).
 */

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|go-http|java\//i;

// Sites by key, so a page view costs one insert rather than a lookup and an insert.
const SITE_TTL_MS = 5 * 60_000;
const siteCache = new Map<string, { site: Site | null; at: number }>();

async function siteFor(key: string): Promise<Site | null> {
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < SITE_TTL_MS) return hit.site;
  const site = await findSite(key);
  siteCache.set(key, { site, at: Date.now() });
  return site;
}

function device(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk|android(?!.*mobile)/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function cleanPath(raw: unknown): string {
  const value = str(raw, 600) ?? '/';
  try {
    // Query strings can carry emails or tokens; only the path is kept.
    return new URL(value, 'https://x').pathname.slice(0, 300) || '/';
  } catch {
    return '/';
  }
}

function noContent(origin: string | null) {
  return new Response(null, {
    status: 204,
    headers: origin
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          Vary: 'Origin',
        }
      : {},
  });
}

export const OPTIONS: APIRoute = ({ request }) => noContent(request.headers.get('origin'));

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');
  const ua = request.headers.get('user-agent') ?? '';
  // Answer bots and malformed requests the same way as real ones; they are simply not stored.
  if (!ua || BOT.test(ua)) return noContent(origin);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return noContent(origin);
  }

  const key = str(body.site_key, 64);
  const site = key ? await siteFor(key) : null;
  if (!site || !origin || !originMatches(origin, site.domain)) return noContent(origin);

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || '';
  const day = new Date().toISOString().slice(0, 10);
  const visitorHash = createHash('sha256')
    .update(`${env.ipHashSalt || site.id}:${day}:${site.id}:${ip}:${ua}`)
    .digest('hex');

  const entry = body.entry === true;
  const utm = parseUtm(body.utm);
  const host = referrerHost(str(body.referrer, 1000));
  const country = request.headers.get('cf-ipcountry');

  const { error } = await db()
    .from('page_views')
    .insert({
      site_id: site.id,
      path: cleanPath(body.path),
      entry,
      // Only the first page of a visit says where the visit came from.
      channel: entry ? channelOf({ utm_source: utm.utm_source, utm_medium: utm.utm_medium, referrerHost: host }) : null,
      referrer_host: entry ? host : null,
      utm_source: entry ? utm.utm_source : null,
      utm_medium: entry ? utm.utm_medium : null,
      utm_campaign: entry ? utm.utm_campaign : null,
      device: device(ua),
      country: country && /^[A-Z]{2}$/.test(country) && country !== 'XX' ? country : null,
      visitor_hash: visitorHash,
    });
  if (error) console.error('page view insert failed', error.message);

  return noContent(origin);
};
