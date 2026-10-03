export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/admin/lib/supabase';
import { parseUtm, str } from '@/admin/lib/leads';
import { channelOf, referrerHost } from '@/admin/lib/channels';
import { cleanPath, country, device, noContent, readBeacon, visitorHash } from '@/admin/lib/collector';

/*
 * Contact-click collector: leads.js reports a click on a call, WhatsApp, SMS
 * or email link, with the campaign the visitor first arrived from, so calls
 * count as conversions next to form inquiries.
 */

const KINDS = ['call', 'whatsapp', 'sms', 'email'] as const;

export const OPTIONS: APIRoute = ({ request }) => noContent(request.headers.get('origin'));

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');
  const beacon = await readBeacon(request);
  if (!beacon) return noContent(origin);
  const { site, body, ua } = beacon;

  const kind = KINDS.find((k) => k === body.kind);
  if (!kind) return noContent(origin);

  const utm = parseUtm(body.utm);
  const host = referrerHost(str(body.referrer, 1000));

  const { error } = await db()
    .from('site_events')
    .insert({
      site_id: site.id,
      kind,
      target: str(body.target, 200),
      path: cleanPath(body.path),
      channel: channelOf({ utm_source: utm.utm_source, utm_medium: utm.utm_medium, referrerHost: host }),
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      referrer_host: host,
      device: device(ua),
      country: country(request),
      visitor_hash: visitorHash(request, clientAddress, site, ua),
    });
  if (error) console.error('site event insert failed', error.message);

  return noContent(origin);
};
