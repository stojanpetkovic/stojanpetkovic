import { db } from './supabase';
import { env } from './env';
import { extractContact, hashIp, parseUtm, str } from './leads';
import { sendLeadEmails } from './email';
import type { Lead, Site } from './types';

// Submissions from one visitor to one site within this window before new
// ones are refused.
const RATE_LIMIT = { max: 5, minutes: 10 };

/** The active site a key belongs to, or null. */
export async function findSite(siteKey: string): Promise<Site | null> {
  const { data } = await db().from('sites').select('*').eq('site_key', siteKey).eq('active', true).maybeSingle<Site>();
  return data ?? null;
}

/** A salted hash of the visitor's address: enough to rate-limit, useless to anyone reading the table. */
export function visitorHash(request: Request, clientAddress: string | undefined, site: Site): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return hashIp(forwarded || clientAddress || 'unknown', env.ipHashSalt || site.id);
}

export async function isRateLimited(site: Site, ipHash: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT.minutes * 60_000).toISOString();
  const { count } = await db()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('site_id', site.id)
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  return (count ?? 0) >= RATE_LIMIT.max;
}

export interface LeadInput {
  site: Site;
  fields: Record<string, string>;
  spam: boolean;
  form: unknown;
  pageUrl: unknown;
  referrer: unknown;
  utm: unknown;
  userAgent: string | null;
  ipHash: string;
}

/**
 * Stores a lead and, unless it is spam, emails it to the client and the owner
 * in the background. Shared by the cross-site collector (/api/leads) and this
 * site's own contact form, so both produce the same record and the same email.
 */
export async function recordLead(input: LeadInput): Promise<Lead | null> {
  const contact = extractContact(input.fields);
  const { data: lead, error } = await db()
    .from('leads')
    .insert({
      site_id: input.site.id,
      form_name: str(input.form, 100) ?? 'contact',
      page_url: str(input.pageUrl, 1000),
      data: input.fields,
      visitor_name: contact.name?.slice(0, 200) ?? null,
      visitor_email: contact.email?.slice(0, 320) ?? null,
      visitor_phone: contact.phone?.slice(0, 50) ?? null,
      ...parseUtm(input.utm),
      referrer: str(input.referrer, 1000),
      user_agent: input.userAgent?.slice(0, 500) ?? null,
      ip_hash: input.ipHash,
      is_spam: input.spam,
    })
    .select('*')
    .single<Lead>();

  if (error || !lead) {
    console.error('lead insert failed', error?.message);
    return null;
  }

  // A honeypot hit is stored for the record but never emailed.
  if (!lead.is_spam) {
    sendLeadEmails(input.site, lead).catch((err) => console.error('sendLeadEmails failed', err));
  }
  return lead;
}
