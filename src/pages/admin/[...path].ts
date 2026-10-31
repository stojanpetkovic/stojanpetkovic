export const prerender = false;

import type { APIRoute } from 'astro';
import { WEBTANO_URL } from '@/lib/webtano';

/* The lead admin moved to webtano.com/admin. */
export const GET: APIRoute = () => Response.redirect(`${WEBTANO_URL}/admin`, 301);
