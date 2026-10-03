import { db } from './supabase';
import type { LeadStatus } from './types';

export interface LeadFilters {
  site: string;
  status: LeadStatus | '';
  q: string;
  spam: boolean;
  from: string;
  to: string;
}

export function readFilters(url: URL): LeadFilters {
  const status = url.searchParams.get('status') ?? '';
  return {
    site: url.searchParams.get('site') ?? '',
    status: (['new', 'contacted', 'won', 'lost'].includes(status) ? status : '') as LeadStatus | '',
    q: (url.searchParams.get('q') ?? '').trim().slice(0, 100),
    spam: url.searchParams.get('spam') === '1',
    from: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') ?? '') ? url.searchParams.get('from')! : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') ?? '') ? url.searchParams.get('to')! : '',
  };
}

export function leadQuery(f: LeadFilters, columns = '*', count = false) {
  let query = db()
    .from('leads')
    .select(columns, count ? { count: 'exact' } : undefined)
    .eq('is_spam', f.spam)
    .order('created_at', { ascending: false });
  if (/^[0-9a-f-]{36}$/.test(f.site)) query = query.eq('site_id', f.site);
  if (f.status) query = query.eq('status', f.status);
  if (f.from) query = query.gte('created_at', `${f.from}T00:00:00Z`);
  if (f.to) query = query.lte('created_at', `${f.to}T23:59:59Z`);
  if (f.q) {
    // Strip characters that have meaning inside a PostgREST or() filter.
    const term = f.q.replace(/[%,()*\\]/g, ' ').trim();
    if (term)
      query = query.or(`visitor_name.ilike.%${term}%,visitor_email.ilike.%${term}%,visitor_phone.ilike.%${term}%`);
  }
  return query;
}
