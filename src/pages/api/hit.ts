export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/admin/lib/supabase';
import { parseUtm, str } from '@/admin/lib/leads';
import { channelOf, referrerHost } from '@/admin/lib/channels';
import { cleanPath, country, device, noContent, readBeacon, visitorHash } from '@/admin/lib/collector';

/*
 * Page-view collector for the admin's own analytics. leads.js posts one small
 * request per page. No cookies and no IP address are stored: unique visitors
 * are counted with a hash that changes every day (see visitor_hash).
 */

export const OPTIONS: APIRoute = ({ request }) => noContent(request.headers.get('origin'));

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');
  const beacon = await readBeacon(request);
  if (!beacon) return noContent(origin);
  const { site, body, ua } = beacon;

  const entry = body.entry === true;
  const utm = parseUtm(body.utm);
  const host = referrerHost(str(body.referrer, 1000));

  const { error } = await db()
    .from('page_views')
    .insert({
      site_id: site.id,
      path: cleanPath(body.path),
      entry,
      // Only the first page of a visit says where the visit came from.
      channel: entry ? channelOf({ utm_source: utm.utm_source, utm_medium: utm.utm_medium, referrerHost: host, userAgent: ua }) : null,
      referrer_host: entry ? host : null,
      utm_source: entry ? utm.utm_source : null,
      utm_medium: entry ? utm.utm_medium : null,
      utm_campaign: entry ? utm.utm_campaign : null,
      device: device(ua),
      country: country(request),
      visitor_hash: visitorHash(request, clientAddress, site, ua),
    });
  if (error) console.error('page view insert failed', error.message);

  return noContent(origin);
};
