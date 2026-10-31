export const prerender = false;

import type { APIRoute } from 'astro';
import { toWebtano } from '@/lib/webtano';

/* Moved to webtano.com. A 308 keeps the method and body, so a submission from
 * an old cached snippet still lands in the lead system there. */
export const ALL: APIRoute = ({ url }) => toWebtano(url, 308);
