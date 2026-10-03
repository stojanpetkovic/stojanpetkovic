# Production image for Railway, built in two stages.
#
# The Node adapter serves prerendered pages and keeps the contact/newsletter
# API routes available at runtime.

# ── Build ────────────────────────────────────────────────────────────────────
# Node 22 matches .nvmrc and the `engines` floor of 22.12.0.
FROM node:22 AS build

WORKDIR /app

# pnpm comes from the `packageManager` field rather than a version pinned
# here, so the container, CI and a developer's machine cannot drift apart.
RUN corepack enable

# Dependency manifests first: this layer is cached until they change, so
# editing a page does not reinstall the tree.
COPY package.json pnpm-lock.yaml ./
RUN corepack install && pnpm install --frozen-lockfile

COPY . .

ENV DEPLOY_TARGET=railway

# SITE_URL is what canonical tags, og:image, RSS and the sitemap are written
# against. A preview is not the deployed site, so it says so plainly rather
# than baking in a domain that is not yours.
ARG SITE_URL=http://localhost:4321
ENV SITE_URL=$SITE_URL

# The rest of the build-time configuration. Astro inlines each of these into
# the generated files, so a value that does not reach this stage is one the
# built site does not have.
#
# Empty is the default and behaves as unset: no measurement id injects no
# gtag, and an empty PUBLIC_CONSENT_ENABLED resolves to false.
#
# The GA4 measurement id is public — it ships in every page's HTML — so it
# defaults here rather than living only in the host's settings. A Railway
# variable of the same name still overrides it. Local `pnpm dev` and
# `pnpm build` do not read this file, so they send no analytics hits.
#
# RESEND_API_KEY, RESEND_FROM_EMAIL, RESEND_AUDIENCE_ID and NEWSLETTER_API_KEY
# are runtime secrets. Railway injects them directly into the running service.
#
# The contact and newsletter forms are prerendered, though, and decide at
# build time whether to enable their submit button (src/lib/email.ts). Without
# the key here they shipped disabled even with the key set on Railway. The
# key and audience id are therefore passed to the build command alone: only
# whether they are set reaches the HTML, and this stage is discarded, so the
# values never land in the runtime image.
ARG PUBLIC_GA_MEASUREMENT_ID=G-43JZTHHKJS
ARG PUBLIC_GTM_ID=
ARG PUBLIC_UMAMI_WEBSITE_ID=
ARG PUBLIC_UMAMI_SRC=
ARG PUBLIC_GOOGLE_MAPS_API_KEY=
ARG PUBLIC_CONSENT_ENABLED=
ARG PUBLIC_PRIVACY_POLICY_URL=
ARG GOOGLE_SITE_VERIFICATION=
ARG BING_SITE_VERIFICATION=
ENV PUBLIC_GA_MEASUREMENT_ID=$PUBLIC_GA_MEASUREMENT_ID \
    PUBLIC_GTM_ID=$PUBLIC_GTM_ID \
    PUBLIC_UMAMI_WEBSITE_ID=$PUBLIC_UMAMI_WEBSITE_ID \
    PUBLIC_UMAMI_SRC=$PUBLIC_UMAMI_SRC \
    PUBLIC_GOOGLE_MAPS_API_KEY=$PUBLIC_GOOGLE_MAPS_API_KEY \
    PUBLIC_CONSENT_ENABLED=$PUBLIC_CONSENT_ENABLED \
    PUBLIC_PRIVACY_POLICY_URL=$PUBLIC_PRIVACY_POLICY_URL \
    GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION \
    BING_SITE_VERIFICATION=$BING_SITE_VERIFICATION

ARG RESEND_API_KEY=
ARG RESEND_AUDIENCE_ID=
RUN RESEND_API_KEY=$RESEND_API_KEY RESEND_AUDIENCE_ID=$RESEND_AUDIENCE_ID pnpm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN corepack install && pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080

CMD ["pnpm", "start"]
