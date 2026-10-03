import * as secrets from 'astro:env/server';

// Secrets come through astro:env so they are read from the host's variables at
// runtime; reading them off `import.meta.env` would inline every value present
// at build time into the server bundle. Each one is read when it is used, not
// when this module loads: astro:env fills them in only after the adapter has
// handed over the environment.
const read = (value: string | undefined) => value?.trim() ?? '';

export const env = {
  get supabaseUrl() {
    return read(secrets.PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey() {
    return read(secrets.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  },
  get supabaseSecretKey() {
    return read(secrets.SUPABASE_SECRET_KEY);
  },
  get adminEmail() {
    return read(secrets.ADMIN_EMAIL).toLowerCase();
  },
  get resendApiKey() {
    return read(secrets.RESEND_API_KEY);
  },
  get leadsFromEmail() {
    return read(secrets.LEADS_FROM_EMAIL);
  },
  get ownerEmail() {
    return read(secrets.OWNER_EMAIL);
  },
  get ipHashSalt() {
    return read(secrets.IP_HASH_SALT);
  },
  get siteUrl() {
    return read(secrets.SITE_URL).replace(/\/$/, '') || 'https://stojanpetkovic.com';
  },
};
