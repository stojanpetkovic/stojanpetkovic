/**
 * The report a calculator page saves as PDF: the inputs in tables by group, the
 * results in tables (and any drawings or schedules the page shows), and the
 * method with its assumptions. It is built from plain data the page reads off
 * itself, so the layout is the same for every calculator and can be tested
 * without a browser. The classes are those of the CT Simulator report.
 */

export interface ToolReportRow {
  label: string;
  value: string;
}

export interface ToolReportTable {
  title?: string;
  head: string[];
  rows: string[][];
}

export interface ToolReportData {
  title: string;
  /** Date text, already formatted. */
  date: string;
  /** The unit system the values are in, e.g. "Oilfield (US)". */
  system: string;
  inputs: { title: string; rows: ToolReportRow[] }[];
  results: {
    /** The main figure of the page, shown large. */
    headline?: ToolReportRow;
    rows: ToolReportRow[];
    tables: ToolReportTable[];
    figures: { title: string; svg: string }[];
  };
  method?: {
    title: string;
    intro: string;
    steps: string[];
    assumptionsTitle: string;
    assumptions: string[];
    reference: string;
  };
  /** The note every tool page carries about checking the result. */
  note: string;
  labels: { created: string; inputs: string; results: string; method: string };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const facts = (rows: ToolReportRow[]) =>
  `<table class="rpt-table rpt-facts"><tbody>${rows.map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`).join('')}</tbody></table>`;

const grid = (t: ToolReportTable) =>
  `<table class="rpt-table rpt-small"><thead><tr>${t.head.map((h, i) => `<th class="${i > 0 ? 'r' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${i > 0 ? 'r' : ''}">${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

const section = (n: number, title: string, body: string) =>
  `<section class="rpt-section"><h2><span class="rpt-n">${n}</span>${esc(title)}</h2>${body}</section>`;

export function buildToolReport(d: ToolReportData): string {
  const parts: string[] = [];
  parts.push(
    `<header class="rpt-head"><h1>${esc(d.title)}</h1><p>${esc(d.labels.created.replace('{date}', d.date))}${d.system ? ` · ${esc(d.system)}` : ''}</p></header>`
  );

  // Inputs: one table per group, two groups to a row.
  const groups = d.inputs.filter((g) => g.rows.length > 0);
  if (groups.length > 0) {
    parts.push(
      section(
        1,
        d.labels.inputs,
        `<div class="rpt-cols rpt-groups">${groups.map((g) => `<div class="rpt-group"><h3>${esc(g.title)}</h3>${facts(g.rows)}</div>`).join('')}</div>`
      )
    );
  }

  // Results.
  const r = d.results;
  let res = '';
  if (r.headline) {
    res += `<div class="rpt-headline"><span>${esc(r.headline.label)}</span><strong>${esc(r.headline.value)}</strong></div>`;
  }
  if (r.rows.length > 0) res += facts(r.rows);
  for (const t of r.tables) res += `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}${grid(t)}`;
  for (const f of r.figures) res += `<figure class="rpt-figure rpt-tool-figure"><figcaption>${esc(f.title)}</figcaption>${f.svg}</figure>`;
  if (res) parts.push(section(groups.length > 0 ? 2 : 1, d.labels.results, res));

  // Method.
  if (d.method) {
    const m = d.method;
    let body = m.intro ? `<p class="rpt-note">${esc(m.intro)}</p>` : '';
    if (m.steps.length > 0) body += `<ol class="rpt-notes">${m.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>`;
    if (m.assumptions.length > 0) body += `<h3>${esc(m.assumptionsTitle)}</h3><ul class="rpt-notes">${m.assumptions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
    if (m.reference) body += `<p class="rpt-note">${esc(m.reference)}</p>`;
    parts.push(section(parts.length, d.labels.method, body));
  }

  if (d.note) parts.push(`<footer class="rpt-foot">${esc(d.note)}</footer>`);
  return `<article class="rpt">${parts.join('')}</article>`;
}
