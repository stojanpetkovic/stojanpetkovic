/**
 * The CT Simulator's report: the whole job laid out as a document, one section
 * per step with its tables and drawings, and a summary of the results at the
 * top. It is built as an HTML string from the project data and the copy of the
 * page, so it can be tested and printed to PDF without the editors' screens.
 *
 * All values arrive in oilfield units (ft, in, lb, ppg, psi); the `Fmt` the
 * page passes turns them into the system on screen, with the unit; table
 * headers carry no units.
 */
import type { BhaItem, BhaMeta } from './bha';
import { itemWeight, totals } from './bha';
import type { ForcesResult } from './ct-forces';
import { buoyedWeight } from './ct-forces';
import type { PathPoint } from './well/survey';
import type { WellItem } from './well/model';

export interface Fmt {
  length: (ft: number) => string;
  /** Length of a short item, with decimals (the tools of a BHA are a few feet long). */
  lengthShort: (ft: number) => string;
  diameter: (inches: number) => string;
  force: (lbf: number) => string;
  density: (ppg: number) => string;
  pressure: (psi: number) => string;
  stress: (psi: number) => string;
  modulus: (psi: number) => string;
  mass: (lb: number) => string;
  /** Weight per unit length, lb/ft in and lb/ft or kg/m out. */
  linearWeight: (lbPerFt: number) => string;
  ratio: (value: number) => string;
  angle: (deg: number) => string;
}

export interface ReportData {
  /** Date text, already formatted. */
  date: string;
  meta: BhaMeta;
  /** Depth of the BHA analysed, ft. */
  depth: number;
  well: {
    /** Tubulars and tools of the Well Builder, depths in ft. */
    items: WellItem[];
    path: PathPoint[];
    /** The well schematic as SVG markup, or empty. */
    svg: string;
  };
  ct: {
    od: number;
    reelDiameter: number | null;
    sections: { length: number; wall: number }[];
    svg: string;
  };
  bha: { items: BhaItem[]; svg: string };
  job: {
    rhoIn: number;
    rhoOut: number;
    whp: number;
    cf: number;
    stripperFriction: number;
    reelTension: number;
    modulus: number;
    yieldStrength: number;
    designFactor: number;
    snubLimit: number;
  };
  /** The results, or `null` when something is missing. */
  results: ForcesResult | null;
  /** Lines saying what is missing when there are no results. */
  missing: string[];
  /** Charts of the results as SVG markup. */
  charts: { ctwi: string; force: string } | null;
  /** The survey was empty, so the well was taken as vertical. */
  verticalAssumed: boolean;
}

export interface ReportCopyShape {
  [key: string]: string | string[] | Record<string, string>;
  notes: string[];
  types: Record<string, string>;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function table(head: string[], rows: string[][], options: { foot?: string[]; align?: ('l' | 'r')[]; className?: string } = {}): string {
  const align = options.align ?? head.map((_, i) => (i === 0 ? 'l' : 'r'));
  const cell = (tag: string, text: string, i: number) => `<${tag} class="${align[i] === 'r' ? 'r' : ''}">${esc(text)}</${tag}>`;
  return `<table class="rpt-table ${options.className ?? ''}"><thead><tr>${head.map((h, i) => cell('th', h, i)).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c, i) => cell('td', c, i)).join('')}</tr>`)
    .join('')}</tbody>${options.foot ? `<tfoot><tr>${options.foot.map((c, i) => cell('td', c, i)).join('')}</tr></tfoot>` : ''}</table>`;
}

/** A two-column table of labels and values. */
const facts = (rows: [string, string][]) =>
  `<table class="rpt-table rpt-facts"><tbody>${rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>`;

const section = (n: number, title: string, body: string) =>
  `<section class="rpt-section"><h2><span class="rpt-n">${n}</span>${esc(title)}</h2>${body}</section>`;

/** Rows of a long list, thinned to at most `max`, always keeping the first and the last. */
export function thin<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.round((i * (rows.length - 1)) / (max - 1))]);
  return out;
}

/** The part of the report to build: all of it, or one step. */
export type ReportScope = 'all' | 'well' | 'ct' | 'bha' | 'job' | 'results';

export function buildReport(d: ReportData, f: Fmt, c: ReportCopyShape, scope: ReportScope = 'all'): string {
  const want = (part: ReportScope) => scope === 'all' || scope === part;
  const t = (key: string) => String(c[key] ?? key);
  const parts: string[] = [];

  // --- header ---
  const meta = [
    d.meta.bhaNo && `${t('bhaNo')}: ${d.meta.bhaNo}`,
    d.meta.runNo && `${t('runNo')}: ${d.meta.runNo}`,
    d.meta.preparedBy && `${t('preparedBy')}: ${d.meta.preparedBy}`,
  ].filter(Boolean) as string[];
  parts.push(
    `<header class="rpt-head"><h1>${esc(t('title'))}</h1><p>${esc(t('created').replace('{date}', d.date))}${meta.length ? ` · ${esc(meta.join(' · '))}` : ''}</p></header>`
  );

  // --- summary ---
  const r = d.results;
  if (scope !== 'all' && scope !== 'results') {
    // A single step has no summary of the results.
  } else if (r) {
    const lock = t('lockup');
    parts.push(
      `<section class="rpt-summary"><h2>${esc(t('summary'))}</h2>${facts([
        [t('depth'), f.length(d.depth)],
        [t('reach'), r.reach.toTd ? t('reachTd') : f.length(r.reach.depth)],
        [t('slackoff'), Number.isFinite(r.slackoff) ? f.force(r.slackoff) : lock],
        [t('pickup'), f.force(r.pickup)],
        [t('maxSetdown'), f.force(r.maxSetdown)],
        [t('maxOverpull'), f.force(r.maxOverpull)],
      ])}</section>`
    );
  } else {
    parts.push(`<section class="rpt-summary"><h2>${esc(t('summary'))}</h2><p class="rpt-warn">${esc(t('incomplete'))}</p><ul>${d.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></section>`);
  }

  // --- 1 well ---
  const pipes = d.well.items.filter((i) => ['casing', 'liner', 'tubing', 'ct'].includes(i.type));
  const tools = d.well.items.filter((i) => !['casing', 'liner', 'tubing', 'ct'].includes(i.type));
  const typeName = (type: string) => c.types[type] ?? type;
  const last = d.well.path[d.well.path.length - 1];
  const maxInc = d.well.path.reduce((m, p) => Math.max(m, p.inclination), 0);
  const maxDls = d.well.path.reduce((m, p) => Math.max(m, p.dls), 0);
  let well = '';
  if (d.well.svg) well += `<figure class="rpt-figure rpt-well">${d.well.svg}</figure>`;
  well += `<h3>${esc(t('tubulars'))}</h3>`;
  well += table(
    [t('type'), t('size'), `${t('id')}`, `${t('top')}`, `${t('bottom')}`],
    pipes.map((i) => [
      typeName(i.type),
      i.type === 'ct' ? `${f.diameter(i.od)} × ${f.diameter(i.wall)}` : `${f.diameter(i.od)} × ${i.weight} lb/ft`,
      f.diameter(i.od - 2 * i.wall),
      f.length(i.top),
      f.length(i.bottom),
    ]),
    { align: ['l', 'l', 'r', 'r', 'r'] }
  );
  if (tools.length > 0) {
    well += `<h3>${esc(t('wellTools'))}</h3>${table(
      [t('type'), t('size'), `${t('top')}`, `${t('bottom')}`],
      tools.map((i) => [typeName(i.type), i.type === 'perforation' ? '–' : f.diameter(i.od), f.length(i.top), f.length(i.bottom)]),
      { align: ['l', 'l', 'r', 'r'] }
    )}`;
  }
  well += `<h3>${esc(t('survey'))}</h3>`;
  if (d.verticalAssumed || !last) {
    well += `<p class="rpt-note">${esc(t('vertical'))}</p>`;
  } else {
    well += facts([
      [t('stations'), String(d.well.path.length)],
      [t('tdMd'), f.length(last.md)],
      [t('tdTvd'), f.length(last.tvd)],
      [t('maxInc'), f.angle(maxInc)],
      [t('maxDls'), `${f.angle(maxDls)} / ${t('dlsBase')}`],
    ]);
    well += table(
      [`MD`, t('inc'), t('azi'), `TVD`, t('dls')],
      thin(d.well.path, 40).map((p) => [f.length(p.md), f.angle(p.inclination), f.angle(p.azimuth), f.length(p.tvd), f.angle(p.dls)]),
      { className: 'rpt-small' }
    );
  }
  if (want('well')) parts.push(section(1, t('well'), well));

  // --- 2 CT string ---
  const steel = 490 / 144;
  let ct = '';
  const total = d.ct.sections.reduce((s, x) => s + x.length, 0);
  ct += `<div class="rpt-two">${d.ct.svg ? `<figure class="rpt-figure rpt-string cs-preview">${d.ct.svg}</figure>` : ''}<div>`;
  ct += facts([
    [t('ctOd'), f.diameter(d.ct.od)],
    [t('reel'), d.ct.reelDiameter ? f.diameter(d.ct.reelDiameter) : '–'],
    [t('stringLength'), f.length(total)],
  ]);
  ct += table(
    ['#', `${t('length')}`, `${t('wall')}`, `${t('id')}`, `${t('weightAir')}`, `${t('weightBuoyed')}`],
    d.ct.sections.map((s, i) => {
      const area = (Math.PI / 4) * (d.ct.od ** 2 - (d.ct.od - 2 * s.wall) ** 2);
      return [
        String(i + 1),
        f.length(s.length),
        f.diameter(s.wall),
        f.diameter(d.ct.od - 2 * s.wall),
        f.linearWeight(steel * area),
        f.linearWeight(buoyedWeight(d.ct.od, s.wall, d.job.rhoIn, d.job.rhoOut)),
      ];
    }),
    { foot: ['', f.length(total), '', '', '', ''], className: 'rpt-small' }
  );
  ct += '</div></div>';
  if (want('ct')) parts.push(section(2, t('ct'), ct));

  // --- 3 BHA ---
  const bt = totals(d.bha.items);
  let bha = '';
  bha += `<div class="rpt-two">${d.bha.svg ? `<figure class="rpt-figure rpt-bha bha-svg-copy">${d.bha.svg}</figure>` : ''}<div>`;
  bha += table(
    ['#', t('description'), `OD`, `${t('id')}`, `${t('length')}`, `${t('weight')}`, t('connection')],
    d.bha.items.map((i, n) => [
      String(n + 1),
      i.description,
      f.diameter(i.od),
      i.bore === null ? 'N/A' : f.diameter(i.bore),
      f.lengthShort(i.length),
      f.mass(itemWeight(i)),
      i.connection || '–',
    ]),
    { foot: ['', t('total'), f.diameter(bt.maxOd), bt.minBore === null ? '–' : f.diameter(bt.minBore), f.lengthShort(bt.length), f.mass(bt.weight), ''], align: ['l', 'l', 'r', 'r', 'r', 'r', 'l'], className: 'rpt-small' }
  );
  bha += '</div></div>';
  if (want('bha')) parts.push(section(3, t('bha'), bha));

  // --- 4 job ---
  const j = d.job;
  if (want('job'))
    parts.push(
    section(
      4,
      t('job'),
      `<div class="rpt-cols">${facts([
        [t('depth'), f.length(d.depth)],
        [t('rhoIn'), f.density(j.rhoIn)],
        [t('rhoOut'), f.density(j.rhoOut)],
        [t('whp'), f.pressure(j.whp)],
        [t('cf'), f.ratio(j.cf)],
      ])}${facts([
        [t('stripper'), f.force(j.stripperFriction)],
        [t('reelTension'), f.force(j.reelTension)],
        [t('modulus'), f.modulus(j.modulus)],
        [t('yieldStrength'), f.stress(j.yieldStrength)],
        [t('designFactor'), f.ratio(j.designFactor)],
        [t('snubLimit'), f.force(j.snubLimit)],
      ])}</div>`
    )
  );

  // --- 5 results ---
  let res = '';
  if (r) {
    const lock = t('lockup');
    res += facts([
      [t('reach'), r.reach.toTd ? t('reachTd') : f.length(r.reach.depth)],
      [t('slackoff'), Number.isFinite(r.slackoff) ? f.force(r.slackoff) : lock],
      [t('pickup'), f.force(r.pickup)],
      [t('injectorPush'), Number.isFinite(r.injectorPush) ? f.force(r.injectorPush) : lock],
      [t('maxSetdown'), f.force(r.maxSetdown)],
      [t('maxOverpull'), f.force(r.maxOverpull)],
      [t('tensionLimit'), f.force(r.tensionLimit)],
      [t('buckleOnset'), r.buckleOnset === null ? '–' : f.length(r.buckleOnset)],
      [t('buckledLength'), f.length(r.rih.buckledLength)],
    ]);
    if (d.charts) {
      res += `<div class="rpt-two rpt-charts"><figure class="rpt-figure"><figcaption>${esc(t('ctwiTitle'))}</figcaption><div class="ct-chart">${d.charts.ctwi}</div><p class="ct-legend"><span class="ct-key dc-rih">${esc(t('rih'))}</span><span class="ct-key dc-pooh">${esc(t('pooh'))}</span><span class="ct-key dc-limit">${esc(t('limit'))}</span></p></figure><figure class="rpt-figure"><figcaption>${esc(t('forceTitle'))}</figcaption><div class="ct-chart">${d.charts.force}</div><p class="ct-legend"><span class="ct-key dc-rih">${esc(t('rih'))}</span><span class="ct-key dc-pooh">${esc(t('pooh'))}</span><span class="ct-key dc-critical">${esc(t('critical'))}</span></p></figure></div>`;
    }
  } else {
    res += `<p class="rpt-warn">${esc(t('incomplete'))}</p><ul>${d.missing.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`;
  }
  res += `<h3>${esc(t('notesTitle'))}</h3><ul class="rpt-notes">${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
  if (want('results')) parts.push(section(5, t('results'), res));

  parts.push(`<footer class="rpt-foot">${esc(t('disclaimer'))}</footer>`);
  return `<article class="rpt">${parts.join('')}</article>`;
}
