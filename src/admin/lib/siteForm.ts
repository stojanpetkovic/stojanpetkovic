const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TIMEZONES = [
  { value: 'Europe/Belgrade', label: 'Srbija (Beograd)' },
  { value: 'America/New_York', label: 'SAD – istok (Florida, New York)' },
  { value: 'America/Chicago', label: 'SAD – centralno' },
  { value: 'America/Los_Angeles', label: 'SAD – zapad' },
  { value: 'Europe/London', label: 'UK (London)' },
];

/** Normalises "https://www.Example.com/path" to "example.com". */
export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function parseEmails(input: string): {
  emails: string[];
  invalid: string[];
} {
  const parts = input
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const emails = [...new Set(parts.filter((e) => EMAIL.test(e)))];
  return { emails, invalid: parts.filter((e) => !EMAIL.test(e)) };
}

export function readSiteForm(form: FormData) {
  const name = String(form.get('name') ?? '').trim();
  const domain = normalizeDomain(String(form.get('domain') ?? ''));
  const { emails, invalid } = parseEmails(String(form.get('client_emails') ?? ''));
  const email_language = form.get('email_language') === 'en' ? 'en' : 'sr';
  const tz = String(form.get('timezone') ?? 'Europe/Belgrade');
  const timezone = TIMEZONES.some((t) => t.value === tz) ? tz : 'Europe/Belgrade';
  const ga4 = String(form.get('ga4_property_id') ?? '')
    .trim()
    .replace(/^properties\//, '');

  const errors: string[] = [];
  if (!name) errors.push('Naziv sajta je obavezan.');
  if (!domain || !domain.includes('.')) errors.push('Domen nije ispravan (npr. valenaapartmani.com).');
  if (invalid.length) errors.push(`Neispravni emailovi: ${invalid.join(', ')}`);
  if (ga4 && !/^\d+$/.test(ga4)) errors.push('GA4 Property ID je broj (npr. 412345678), ne G-XXXX merni ID.');

  return {
    errors,
    values: {
      name,
      domain,
      client_name: String(form.get('client_name') ?? '').trim() || null,
      client_emails: emails,
      email_language,
      timezone,
      notify_owner: form.get('notify_owner') === 'on',
      ga4_property_id: ga4 || null,
      active: form.has('active') ? form.getAll('active').includes('on') : true,
    },
  };
}
