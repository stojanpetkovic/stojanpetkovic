export const prerender = false;

import type { APIRoute } from 'astro';
import { db } from '@/admin/lib/supabase';
import { readFilters, leadQuery } from '@/admin/lib/leadQuery';
import { leadSource } from '@/admin/lib/leads';
import { STATUS_LABELS } from '@/admin/lib/format';
import type { Lead, Site } from '@/admin/lib/types';

function cell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Neutralise spreadsheet formulas a visitor could have typed into a form.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async ({ url }) => {
  const filters = readFilters(url);
  const [{ data: sitesData }, { data: leadsData }] = await Promise.all([
    db().from('sites').select('id, name'),
    leadQuery(filters).limit(10_000),
  ]);
  const siteNames = new Map(((sitesData ?? []) as Pick<Site, 'id' | 'name'>[]).map((s) => [s.id, s.name]));
  const leads = (leadsData ?? []) as unknown as Lead[];

  const fieldKeys = [...new Set(leads.flatMap((l) => Object.keys(l.data)))];
  const header = [
    'Vreme',
    'Sajt',
    'Forma',
    'Status',
    'Ime',
    'Email',
    'Telefon',
    'Izvor',
    'Kampanja',
    'Stranica',
    ...fieldKeys,
    'Beleške',
  ];
  const rows = leads.map((l) => [
    l.created_at,
    siteNames.get(l.site_id) ?? '',
    l.form_name,
    STATUS_LABELS[l.status],
    l.visitor_name,
    l.visitor_email,
    l.visitor_phone,
    leadSource(l),
    l.utm_campaign,
    l.page_url,
    ...fieldKeys.map((k) => l.data[k] ?? ''),
    l.notes,
  ]);

  // BOM so Excel opens the UTF-8 file with č, ć, š intact.
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="lidovi-${stamp}.csv"`,
    },
  });
};
