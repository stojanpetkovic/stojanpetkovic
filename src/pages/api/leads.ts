export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/admin/lib/supabase';
import { env } from '@/admin/lib/env';
import {
  cleanFields,
  extractContact,
  hashIp,
  originMatches,
  parseUtm,
  str,
  type IncomingLead,
} from '@/admin/lib/leads';
import { sendLeadEmails } from '@/admin/lib/email';
import type { Lead, Site } from '@/admin/lib/types';

// Submissions from one visitor to one site within this window before the
// collector starts refusing them.
const RATE_LIMIT = { max: 5, minutes: 10 };

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      }
    : {};
}

function reply(status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export const OPTIONS: APIRoute = ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: cors(request.headers.get('origin')),
  });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const origin = request.headers.get('origin');

  // The snippet posts text/plain so the browser skips the CORS preflight;
  // the body is JSON either way.
  let body: IncomingLead;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return reply(400, { ok: false, error: 'invalid_json' });
  }

  const siteKey = str(body.site_key, 64);
  if (!siteKey) return reply(400, { ok: false, error: 'missing_site_key' });

  const { data: site } = await db()
    .from('sites')
    .select('*')
    .eq('site_key', siteKey)
    .eq('active', true)
    .maybeSingle<Site>();
  if (!site) return reply(404, { ok: false, error: 'unknown_site' });

  // Browsers always send Origin on a cross-site POST. A wrong one means the
  // key was copied onto someone else's page; a missing one is a server-side
  // integration, which the rate limit below still covers.
  if (origin && !originMatches(origin, site.domain)) {
    return reply(403, { ok: false, error: 'origin_not_allowed' });
  }
  const headers = cors(origin);

  const { fields, honeypot } = cleanFields(body.data);
  if (Object.keys(fields).length === 0) return reply(400, { ok: false, error: 'empty_form' }, headers);

  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ipHash = hashIp(forwarded || clientAddress || 'unknown', env.ipHashSalt || site.id);

  const since = new Date(Date.now() - RATE_LIMIT.minutes * 60_000).toISOString();
  const { count } = await db()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', site.id)
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((count ?? 0) >= RATE_LIMIT.max) return reply(429, { ok: false, error: 'rate_limited' }, headers);

  const contact = extractContact(fields);
  const { data: lead, error } = await db()
    .from('leads')
    .insert({
      site_id: site.id,
      form_name: str(body.form, 100) ?? 'contact',
      page_url: str(body.page_url, 1000),
      data: fields,
      visitor_name: contact.name?.slice(0, 200) ?? null,
      visitor_email: contact.email?.slice(0, 320) ?? null,
      visitor_phone: contact.phone?.slice(0, 50) ?? null,
      ...parseUtm(body.utm),
      referrer: str(body.referrer, 1000),
      user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? null,
      ip_hash: ipHash,
      is_spam: honeypot,
    })
    .select('*')
    .single<Lead>();

  if (error || !lead) {
    console.error('lead insert failed', error?.message);
    return reply(500, { ok: false, error: 'store_failed' }, headers);
  }

  // A honeypot hit is stored for the record but never emailed. The bot
  // gets the same success answer so it learns nothing.
  if (!lead.is_spam) {
    sendLeadEmails(site, lead).catch((err) => console.error('sendLeadEmails failed', err));
  }

  return reply(200, { ok: true }, headers);
};
