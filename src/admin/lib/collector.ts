import { createHash } from 'node:crypto';
import { env } from './env';
import { findSite } from './ingest';
import { originMatches, str } from './leads';
import type { Site } from './types';

/*
 * Shared by the endpoints leads.js calls on every page (/api/hit for page
 * views, /api/event for contact clicks): bot filtering, the cached site
 * lookup, device and country, and the daily visitor hash. No cookies and no
 * IP address are stored anywhere.
 */

export const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|gtmetrix|pingdom|uptime|monitor|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|go-http|java\//i;

// Sites by key, so a hit costs one insert rather than a lookup and an insert.
const SITE_TTL_MS = 5 * 60_000;
const siteCache = new Map<string, { site: Site | null; at: number }>();

export async function siteFor(key: string): Promise<Site | null> {
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < SITE_TTL_MS) return hit.site;
  const site = await findSite(key);
  siteCache.set(key, { site, at: Date.now() });
  return site;
}

export function device(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk|android(?!.*mobile)/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function cleanPath(raw: unknown): string {
  const value = str(raw, 600) ?? '/';
  try {
    // Query strings can carry emails or tokens; only the path is kept.
    return new URL(value, 'https://x').pathname.slice(0, 300) || '/';
  } catch {
    return '/';
  }
}

export function country(request: Request): string | null {
  const value = request.headers.get('cf-ipcountry');
  return value && /^[A-Z]{2}$/.test(value) && value !== 'XX' ? value : null;
}

/** sha256(salt, UTC day, site, IP, user agent): unique per visitor per day, and only that. */
export function visitorHash(request: Request, clientAddress: string | undefined, site: Site, ua: string): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || clientAddress || '';
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${env.ipHashSalt || site.id}:${day}:${site.id}:${ip}:${ua}`)
    .digest('hex');
}

export function noContent(origin: string | null) {
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

/**
 * Parses a beacon from leads.js and resolves its site. Returns null for bots,
 * malformed bodies, unknown keys and other origins, which every collector
 * answers the same way: an empty 204, so nothing is learned from the reply.
 */
export async function readBeacon(request: Request) {
  const origin = request.headers.get('origin');
  const ua = request.headers.get('user-agent') ?? '';
  if (!ua || BOT.test(ua)) return null;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return null;
  }

  const key = str(body.site_key, 64);
  const site = key ? await siteFor(key) : null;
  if (!site || !origin || !originMatches(origin, site.domain)) return null;
  return { site, body, ua };
}
