import { Resend } from 'resend';
import { db } from './supabase';
import { env } from './env';
import { leadSource } from './leads';
import type { Lead, Site } from './types';

const ADMIN_URL = `${(process.env.SITE_URL || 'https://stojanpetkovic.com').replace(/\/$/, '')}/admin`;

const copy = {
  sr: {
    subject: (site: string, form: string) => `Novi upit sa sajta ${site} (${form})`,
    heading: 'Stigao je novi upit',
    intro: (site: string) => `Neko je upravo popunio formu na sajtu ${site}. Svi podaci iz forme su ispod.`,
    replyHint: 'Odgovorite direktno na ovaj email i odgovor ide posetiocu.',
    details: 'Detalji',
    form: 'Forma',
    page: 'Stranica',
    source: 'Izvor',
    time: 'Vreme',
    footer: 'Ovaj email je automatski poslat sa sistema za upite koji je postavio Stojan Petković.',
    locale: 'sr-RS',
  },
  en: {
    subject: (site: string, form: string) => `New inquiry from ${site} (${form})`,
    heading: 'You have a new inquiry',
    intro: (site: string) => `Someone just filled in a form on ${site}. Everything they submitted is below.`,
    replyHint: 'Reply to this email and your answer goes straight to the visitor.',
    details: 'Details',
    form: 'Form',
    page: 'Page',
    source: 'Source',
    time: 'Time',
    footer: 'This email was sent automatically by the lead system set up by Stojan Petković.',
    locale: 'en-US',
  },
} as const;

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function label(key: string): string {
  const spaced = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function row(name: string, value: string): string {
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px;vertical-align:top;width:34%">${escape(name)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e4e4e7;color:#18181b;font-size:14px;white-space:pre-wrap">${escape(value)}</td>
  </tr>`;
}

function render(site: Site, lead: Lead, lang: 'sr' | 'en', adminLink: string | null) {
  const t = copy[lang];
  const time = new Intl.DateTimeFormat(t.locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: site.timezone || 'Europe/Belgrade',
  }).format(new Date(lead.created_at));

  const fields = Object.entries(lead.data)
    .map(([k, v]) => row(label(k), v))
    .join('');
  const meta = [
    row(t.form, lead.form_name),
    lead.page_url ? row(t.page, lead.page_url) : '',
    row(t.source, leadSource(lead)),
    row(t.time, time),
  ].join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px">
    <div style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:#3b82f6;padding:20px 24px;color:#ffffff">
        <div style="font-size:13px;opacity:.85">${escape(site.name)}</div>
        <div style="font-size:20px;font-weight:bold;margin-top:4px">${t.heading}</div>
      </div>
      <div style="padding:20px 24px">
        <p style="margin:0 0 6px;color:#3f3f46;font-size:14px">${escape(t.intro(site.name))}</p>
        ${lead.visitor_email ? `<p style="margin:0 0 16px;color:#71717a;font-size:13px">${t.replyHint}</p>` : ''}
        <table style="width:100%;border-collapse:collapse">${fields}</table>
        <div style="margin:20px 0 6px;font-size:12px;font-weight:bold;color:#a1a1aa;text-transform:uppercase;letter-spacing:.06em">${t.details}</div>
        <table style="width:100%;border-collapse:collapse">${meta}</table>
        ${adminLink ? `<p style="margin:20px 0 0"><a href="${adminLink}" style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:5px;font-size:14px">Otvori u adminu</a></p>` : ''}
      </div>
    </div>
    <p style="color:#a1a1aa;font-size:11px;text-align:center;margin:16px 0 0">${t.footer}</p>
  </div></body></html>`;

  const text = [
    t.heading,
    t.intro(site.name),
    '',
    ...Object.entries(lead.data).map(([k, v]) => `${label(k)}: ${v}`),
    '',
    `${t.form}: ${lead.form_name}`,
    lead.page_url ? `${t.page}: ${lead.page_url}` : '',
    `${t.source}: ${leadSource(lead)}`,
    `${t.time}: ${time}`,
    adminLink ? `\n${adminLink}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');

  return { subject: t.subject(site.name, lead.form_name), html, text };
}

async function log(entry: {
  lead_id: string;
  recipient: string;
  kind: 'client' | 'owner';
  status: 'sent' | 'failed';
  provider_id?: string | null;
  error?: string | null;
}) {
  const { error } = await db().from('email_log').insert(entry);
  if (error) console.error('email_log insert failed', error.message);
}

async function sendOne(
  resend: Resend,
  lead: Lead,
  to: string,
  kind: 'client' | 'owner',
  message: ReturnType<typeof render>,
) {
  try {
    const { data, error } = await resend.emails.send({
      from: env.leadsFromEmail,
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: lead.visitor_email ?? undefined,
    });
    if (error) throw new Error(error.message);
    await log({
      lead_id: lead.id,
      recipient: to,
      kind,
      status: 'sent',
      provider_id: data?.id ?? null,
    });
  } catch (err) {
    const message_ = err instanceof Error ? err.message : String(err);
    console.error(`lead email to ${to} failed:`, message_);
    await log({
      lead_id: lead.id,
      recipient: to,
      kind,
      status: 'failed',
      error: message_.slice(0, 1000),
    });
  }
}

/** Emails the lead to the site's client addresses and to the owner, logging every attempt. */
export async function sendLeadEmails(site: Site, lead: Lead, only?: 'client' | 'owner') {
  if (!env.resendApiKey || !env.leadsFromEmail) {
    console.error('RESEND_API_KEY or LEADS_FROM_EMAIL missing; lead emails not sent');
    return;
  }
  const resend = new Resend(env.resendApiKey);
  const jobs: Promise<void>[] = [];

  if (only !== 'owner') {
    const clientMessage = render(site, lead, site.email_language, null);
    for (const to of site.client_emails) jobs.push(sendOne(resend, lead, to, 'client', clientMessage));
  }
  if (only !== 'client' && site.notify_owner && env.ownerEmail) {
    const ownerMessage = render(site, lead, 'sr', `${ADMIN_URL}/leads/${lead.id}`);
    jobs.push(sendOne(resend, lead, env.ownerEmail, 'owner', ownerMessage));
  }
  await Promise.all(jobs);
}
