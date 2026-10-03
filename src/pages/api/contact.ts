export const prerender = false;

import type { APIRoute } from 'astro';
import { RESEND_API_KEY, RESEND_FROM_EMAIL } from 'astro:env/server';
import { z } from 'astro/zod';
import { Resend } from 'resend';
import siteConfig from '@/config/site.config';
import { findSite, recordLead, visitorHash } from '@/admin/lib/ingest';

// Escape user-supplied values before they are interpolated into the
// notification email's HTML, so a message containing markup (links,
// tracking pixels, spoofed content) can't render in the recipient's inbox.
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const contactSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.email('Please enter a valid email address'),
  subject: z.string().max(200).optional(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(5000),
  honeypot: z.string().max(0), // Anti-spam: must be empty
});

/**
 * Hands the message to the lead admin as a lead from this site, so it arrives
 * as one record in /admin and one set of emails instead of a second, separate
 * notification. Returns false when the admin is not set up or the write fails,
 * and the caller falls back to sending the message directly.
 */
async function deliverAsLead(
  request: Request,
  clientAddress: string | undefined,
  fields: Record<string, string>
): Promise<boolean> {
  const siteKey = siteConfig.leads?.siteKey;
  if (!siteKey) return false;
  try {
    const site = await findSite(siteKey);
    if (!site) return false;

    // The form posts from the contact page, so its address (and any campaign
    // parameters the visitor arrived with) is in the Referer.
    const pageUrl = request.headers.get('referer');
    let utm: Record<string, string> = {};
    try {
      if (pageUrl) utm = Object.fromEntries(new URL(pageUrl).searchParams);
    } catch {
      // Not a URL: store the lead without campaign data.
    }

    const lead = await recordLead({
      site,
      fields,
      spam: false,
      form: 'contact',
      pageUrl,
      referrer: null,
      utm,
      userAgent: request.headers.get('user-agent'),
      ipHash: visitorHash(request, clientAddress, site),
    });
    return lead !== null;
  } catch (error) {
    console.error('Contact form lead delivery failed:', error);
    return false;
  }
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const formData = await request.formData();

    const data = {
      name: formData.get('name')?.toString() || '',
      email: formData.get('email')?.toString() || '',
      subject: formData.get('subject')?.toString() || '',
      message: formData.get('message')?.toString() || '',
      honeypot: formData.get('honeypot')?.toString() || '',
    };

    // Validate
    const result = contactSchema.safeParse(data);

    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const error of result.error.issues) {
        const field = error.path[0] as string;
        if (!fieldErrors[field]) {
          fieldErrors[field] = [];
        }
        fieldErrors[field].push(error.message);
      }

      return new Response(
        JSON.stringify({ success: false, errors: fieldErrors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Honeypot check (bot detection)
    if (result.data.honeypot) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const fields = Object.fromEntries(
      Object.entries({
        name: result.data.name,
        email: result.data.email,
        subject: result.data.subject ?? '',
        message: result.data.message,
      }).filter(([, value]) => value)
    );
    if (await deliverAsLead(request, clientAddress, fields)) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Send email via Resend
    const apiKey = RESEND_API_KEY;
    if (!apiKey) {
      console.error('RESEND_API_KEY is not set');
      return new Response(
        JSON.stringify({ success: false, errors: { form: ['Email service is not configured'] } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resend = new Resend(apiKey);

    const toEmail = siteConfig.email;
    const fromEmail = RESEND_FROM_EMAIL || toEmail;
    const siteLabel = siteConfig.name;

    const subject = result.data.subject
      ? `[${siteLabel}] ${result.data.subject}`
      : `[${siteLabel}] New contact from ${result.data.name}`;

    const { error } = await resend.emails.send({
      from: `Contact Form <${fromEmail}>`,
      to: toEmail,
      replyTo: result.data.email,
      subject,
      html: `
        <p><strong>Name:</strong> ${escapeHtml(result.data.name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(result.data.email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(result.data.message).replace(/\n/g, '<br>')}</p>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return new Response(
        JSON.stringify({ success: false, errors: { form: [error.message || 'Failed to send email'] } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Contact form error:', error);

    return new Response(
      JSON.stringify({ success: false, errors: { form: ['An unexpected error occurred'] } }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
