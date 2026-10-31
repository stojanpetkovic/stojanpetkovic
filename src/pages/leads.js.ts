export const prerender = false;

import type { APIRoute } from 'astro';
import { toWebtano } from '@/lib/webtano';

/* The collector moved to webtano.com/leads.js. Old snippets that still load it
 * from here get sent there, and it posts to webtano.com from then on. */
export const GET: APIRoute = ({ url }) => toWebtano(url, 301);
