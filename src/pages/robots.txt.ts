import type { APIRoute } from 'astro';
import { SITE_URL_FALLBACK } from '@/config/site-url';

export const GET: APIRoute = ({ site }) => {
  const siteUrl = site?.toString() || SITE_URL_FALLBACK;

  const robotsTxt = `
User-agent: *
Allow: /

# Block API routes and the private admin
Disallow: /api/
Disallow: /admin/

# Plain-Markdown map of this site for language models — see https://llmstxt.org
# LLM map: ${siteUrl}llms.txt

Sitemap: ${siteUrl}sitemap-index.xml
`.trim();

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
};
