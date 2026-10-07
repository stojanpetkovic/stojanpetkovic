import { createHash } from "node:crypto";
import type { Lead } from "./types";
import { channelOf, referrerHost, type Channel } from "./channels";

const MAX_FIELDS = 60;
const MAX_VALUE_LENGTH = 5000;

// Honeypot fields: a person never fills them, a bot usually does.
const HONEYPOT_FIELDS = [
  "_gotcha",
  "website_hp",
  "hp_field",
  "honeypot",
  "bot-field",
  "bot_field",
];

// Technical fields that are noise in a lead: captcha tokens, CSRF tokens, etc.
const IGNORED_FIELD =
  /^(_|g-recaptcha-response$|h-captcha-response$|cf-turnstile-response$|csrf|_token$|authenticity_token$|password)/i;

export interface IncomingLead {
  site_key?: unknown;
  form?: unknown;
  page_url?: unknown;
  referrer?: unknown;
  utm?: unknown;
  data?: unknown;
}

export function str(value: unknown, max = 500): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Flattens the submitted fields into a plain string map and reports honeypot hits. */
export function cleanFields(raw: unknown): {
  fields: Record<string, string>;
  honeypot: boolean;
} {
  const fields: Record<string, string> = {};
  let honeypot = false;
  if (!raw || typeof raw !== "object") return { fields, honeypot };

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (HONEYPOT_FIELDS.includes(key.toLowerCase())) {
      if (typeof value === "string" && value.trim()) honeypot = true;
      continue;
    }
    if (IGNORED_FIELD.test(key)) continue;
    if (Object.keys(fields).length >= MAX_FIELDS) break;

    const text = Array.isArray(value)
      ? value.map(String).join(", ")
      : value == null
        ? ""
        : String(value);
    const clean = text.trim().slice(0, MAX_VALUE_LENGTH);
    if (clean) fields[key.slice(0, 100)] = clean;
  }
  return { fields, honeypot };
}

function findField(
  fields: Record<string, string>,
  pattern: RegExp,
  exclude?: RegExp,
): string | null {
  for (const [key, value] of Object.entries(fields)) {
    if (pattern.test(key) && !(exclude && exclude.test(key))) return value;
  }
  return null;
}

/** Picks the visitor's name, email and phone out of whatever the form called them. */
export function extractContact(fields: Record<string, string>) {
  const email =
    findField(fields, /e-?mail/i) ??
    Object.values(fields).find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ??
    null;
  const phone = findField(fields, /phone|tel|telefon|mobil/i);
  const first = findField(fields, /first.?name|^ime$/i);
  const last = findField(fields, /last.?name|prezime/i);
  const name =
    findField(
      fields,
      /(^|_|-)(full.?)?name$|^ime.?i.?prezime|^ime$|^name/i,
      /company|firma|user.?name|first|last/i,
    ) ??
    ([first, last].filter(Boolean).join(" ") || null);
  return { name, email, phone };
}

export function parseUtm(raw: unknown) {
  const utm = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    utm_source: str(utm.utm_source, 200),
    utm_medium: str(utm.utm_medium, 200),
    utm_campaign: str(utm.utm_campaign, 200),
    utm_term: str(utm.utm_term, 200),
    utm_content: str(utm.utm_content, 200),
  };
}

export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** True when the Origin header belongs to the site's domain or one of its subdomains. */
export function originMatches(origin: string | null, domain: string): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    const base = domain.toLowerCase().replace(/^www\./, "");
    return host === base || host.endsWith(`.${base}`);
  } catch {
    return false;
  }
}

/** Where a lead came from, in words a client understands. */
export function leadSource(
  lead: Pick<Lead, "utm_source" | "utm_medium" | "referrer"> & {
    user_agent?: string | null;
  },
): Channel {
  return channelOf({
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    referrerHost: referrerHost(lead.referrer),
    userAgent: lead.user_agent,
  });
}
