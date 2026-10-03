# Lead admin (/admin)

Private lead inbox and analytics for every site built by Stojan Petković,
served from this site at `/admin`. The portfolio stays prerendered; only the
admin pages and `/api/leads` render on demand (`prerender = false`).
Supabase holds the data and the login, Resend sends the email, and the
visual language follows the Tailwick admin template.

Code lives in `src/admin/` (lib, components, layout, stylesheet), routes in
`src/pages/admin/` and `src/pages/api/leads.ts`, the guard in
`src/middleware.ts`, and the embeddable collector in `public/leads.js`. The
admin compiles its own Tailwind stylesheet; `src/styles/global.css` excludes
the admin's files, so nothing from it reaches the portfolio's CSS.

## What it does

- **Collects leads** from any site through one script tag (`/leads.js`). Every
  form submission is copied to `POST /api/leads` in parallel with whatever the
  form already does; the site's own form handling is untouched.
- **Emails each lead** to the site's client addresses (in Serbian or English)
  and to the owner, with the visitor's address as Reply-To. Every attempt is
  logged and can be resent from the lead page.
- **Shows lead analytics** per site and overall: leads per day, by form, by
  source (UTM, fbclid/gclid, referrer) and by page, plus a status pipeline
  (new → contacted → won/lost) with notes, filters and CSV export.

## Security model

- One account only. Sign-ups are disabled in Supabase, and the middleware also
  rejects any session whose email is not `ADMIN_EMAIL`.
- Tables have RLS on with no policies: the anon and authenticated roles can
  read nothing. Only the server, using the secret key, touches the data.
- `/api/leads` accepts a browser submission only from the site's own domain
  (or a subdomain), rate-limits by hashed IP, and stores honeypot hits as spam
  without emailing them.
- Every state-changing request except `/api/leads` must be same-origin
  (CSRF), checked in the middleware in place of Astro's `checkOrigin`.

## Setup

1. Set these in `.env` locally and in the Railway service's variables:
   - `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase → Project Settings → API Keys.
   - `SUPABASE_SECRET_KEY`: the secret key from the same page. Server only.
   - `ADMIN_EMAIL`: the one account allowed in.
   - `RESEND_API_KEY`: resend.com → API Keys (sending access is enough).
   - `LEADS_FROM_EMAIL`: sender on a verified Resend domain, e.g. `Lead obaveštenja <leads@stojanpetkovic.com>`.
   - `OWNER_EMAIL`: where the owner's copy of every lead goes.
   - `IP_HASH_SALT`: any long random string (`openssl rand -hex 32`).
2. Supabase → Authentication → Sign In / Providers: turn **off** "Allow new
   users to sign up". Then Authentication → Users → Add user → create the
   `ADMIN_EMAIL` account with a strong password (auto-confirm).
3. Resend → Domains: add and verify the domain used in `LEADS_FROM_EMAIL`.
4. `pnpm dev`, open `/admin`, sign in, add a site, paste its snippet into the
   site's layout.

## Embedding on a site

```html
<script src="https://stojanpetkovic.com/leads.js" data-site-key="SITE_KEY" defer></script>
```

- `data-lead-ignore` on a form skips it; password and search forms are skipped
  automatically.
- `data-lead-form="booking"` names a form in reports (default: its `id`).
- A hidden `<input name="website_hp" tabindex="-1" autocomplete="off" hidden>`
  catches bots.
- Forms sent purely from JavaScript can call `window.stojanLeads.send(name, data)`.

## Roadmap

- Phase 2: Google Analytics 4 (Data API, service account), cached daily.
- Phase 3: printable monthly report per site → PDF, emailed automatically.
