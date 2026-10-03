// Read secrets at runtime from the process environment (Railway variables),
// falling back to Vite's build-time env for `astro dev`.
function read(name: string): string {
  const value = process.env[name] ?? (import.meta.env as Record<string, string | undefined>)[name];
  return value?.trim() ?? '';
}

export const env = {
  get supabaseUrl() {
    return read('PUBLIC_SUPABASE_URL');
  },
  get supabasePublishableKey() {
    return read('PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  },
  get supabaseSecretKey() {
    return read('SUPABASE_SECRET_KEY');
  },
  get adminEmail() {
    return read('ADMIN_EMAIL').toLowerCase();
  },
  get resendApiKey() {
    return read('RESEND_API_KEY');
  },
  get leadsFromEmail() {
    return read('LEADS_FROM_EMAIL');
  },
  get ownerEmail() {
    return read('OWNER_EMAIL');
  },
  get ipHashSalt() {
    return read('IP_HASH_SALT');
  },
};
