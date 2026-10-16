import { describe, expect, it } from 'vitest';
import { buildReport, thin, type Fmt, type ReportCopyShape, type ReportData } from '../lib/tools/ct-report';
import { exampleItems } from '../lib/tools/bha';
import { calculateForces } from '../lib/tools/ct-forces';
import { bhaForSim, stationsOrVertical, wellForSim } from '../lib/tools/ct-project';
import { exampleWell } from '../lib/tools/well/model';
import { minimumCurvature } from '../lib/tools/well/survey';

const n = (v: number, d = 0) => v.toFixed(d);
const fmt: Fmt = {
  length: (v) => `${n(v)} ft`,
  lengthShort: (v) => `${n(v, 2)} ft`,
  diameter: (v) => `${n(v, 3)} in`,
  force: (v) => `${n(v)} lbf`,
  density: (v) => `${n(v, 2)} ppg`,
  pressure: (v) => `${n(v)} psi`,
  stress: (v) => `${n(v)} psi`,
  modulus: (v) => `${n(v)} psi`,
  mass: (v) => `${n(v)} lb`,
  linearWeight: (v) => `${n(v, 3)} lb/ft`,
  ratio: (v) => n(v, 2),
  angle: (v) => n(v, 1),
};

const copy: ReportCopyShape = {
  title: 'CT job report', created: 'Created {date}', bhaNo: 'BHA no.', runNo: 'Run no.', preparedBy: 'Prepared by', summary: 'Summary',
  incomplete: 'Incomplete', depth: 'BHA depth', reach: 'Reach', reachTd: 'TD', slackoff: 'RIH', pickup: 'POOH', maxSetdown: 'SDW', maxOverpull: 'OP', lockup: 'Lock-up',
  well: 'Well', tubulars: 'Tubulars', type: 'Type', size: 'Size', id: 'ID', top: 'Top', bottom: 'Bottom', wellTools: 'Tools in the well', survey: 'Survey', vertical: 'No survey',
  stations: 'Stations', tdMd: 'TD MD', tdTvd: 'TD TVD', maxInc: 'Max inclination', maxDls: 'Max dogleg', dlsBase: '100 ft', inc: 'Inc', azi: 'Azi', dls: 'DLS',
  ct: 'CT string', ctOd: 'CT OD', reel: 'Reel', stringLength: 'Length', length: 'Length', wall: 'Wall', weightAir: 'In air', weightBuoyed: 'Buoyed',
  bha: 'BHA', description: 'Description', weight: 'Weight', connection: 'Connection', total: 'Total',
  job: 'Job', rhoIn: 'Inside', rhoOut: 'Outside', whp: 'WHP', cf: 'Cf', stripper: 'Stripper', reelTension: 'Reel tension', modulus: 'E', yieldStrength: 'Yield', designFactor: 'DF', snubLimit: 'Snub',
  results: 'Results', injectorPush: 'Push', tensionLimit: 'Limit', buckleOnset: 'Buckles at', buckledLength: 'Buckled', ctwiTitle: 'CTWI', forceTitle: 'Force', rih: 'RIH', pooh: 'POOH', limit: 'Limit', critical: 'Critical',
  notesTitle: 'Notes', disclaimer: 'Check the result.',
  notes: ['Soft string model.', 'Rigid BHA.'],
  types: { casing: 'Casing', liner: 'Liner', tubing: 'Tubing', ct: 'Coiled tubing', packer: 'Packer', nipple: 'Landing nipple', sleeve: 'Sliding sleeve', perforation: 'Perforations' },
};

function data(overrides: Partial<ReportData> = {}): ReportData {
  const well = wellForSim(exampleWell('ft'));
  const items = exampleItems('sheet');
  const bha = bhaForSim(items);
  const job = { rhoIn: 8.35, rhoOut: 8.35, whp: 0, cf: 0.3, stripperFriction: 500, reelTension: 300, modulus: 27e6, yieldStrength: 80000, designFactor: 0.8, snubLimit: 15000 };
  const forces = {
    ...job,
    ctOd: 1.75,
    stations: stationsOrVertical(well, 8000),
    holes: well.holes,
    holeId: 2.441,
    sections: [{ length: 20000, wall: 0.134 }],
    bhaLength: bha.length,
    bhaWeight: bha.weight,
    bhaOd: 2.25,
  };
  return {
    date: '17 Oct 2026',
    meta: { bhaNo: '12', runNo: '3', preparedBy: 'S. P.' },
    depth: 8000,
    well: { items: exampleWell('ft').items, path: minimumCurvature(well.stations, 'ft'), svg: '<svg id="well"></svg>' },
    ct: { od: 1.75, reelDiameter: 72, sections: [{ length: 20000, wall: 0.134 }], svg: '<svg id="ct"></svg>' },
    bha: { items, svg: '<svg id="bha"></svg>' },
    job,
    results: calculateForces(forces, 8000),
    missing: [],
    charts: { ctwi: '<svg id="c1"></svg>', force: '<svg id="c2"></svg>' },
    verticalAssumed: false,
    ...overrides,
  };
}

describe('report', () => {
  const html = buildReport(data(), fmt, copy);

  it('has a header, a summary and the five sections in order', () => {
    expect(html).toContain('CT job report');
    expect(html).toContain('Created 17 Oct 2026');
    expect(html).toContain('BHA no.: 12 · Run no.: 3 · Prepared by: S. P.');
    const order = ['rpt-summary', '<span class="rpt-n">1</span>', '<span class="rpt-n">2</span>', '<span class="rpt-n">3</span>', '<span class="rpt-n">4</span>', '<span class="rpt-n">5</span>'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('lists the tubulars, the well tools and the survey with its summary', () => {
    expect(html).toContain('13.375 in × 68 lb/ft');
    expect(html).toContain('Landing nipple');
    expect(html).toContain('Max inclination');
    expect(html).toContain('TD TVD');
  });

  it('gives the CT string and the BHA as tables with totals', () => {
    expect(html).toContain('20000 ft');
    expect(html).toContain('Coil connector f/1-1/2&quot; coil');
    expect(html).toContain('<tfoot>');
    // the BHA total length is 9.96 ft and its tools are short: shown with decimals
    expect(html).toContain('9.96 ft');
    expect(html).toContain('0.55 ft');
  });

  it('puts the drawings in', () => {
    for (const id of ['well', 'ct', 'bha', 'c1', 'c2']) expect(html).toContain(`id="${id}"`);
  });

  it('has the results and the notes', () => {
    expect(html).toContain('Soft string model.');
    expect(html).toContain('Buckles at');
  });

  it('says what is missing when there are no results', () => {
    const bad = buildReport(data({ results: null, charts: null, missing: ['Add casing'] }), fmt, copy);
    expect(bad).toContain('Incomplete');
    expect(bad).toContain('Add casing');
    expect(bad).not.toContain('CTWI');
  });

  it('says no survey was given, and escapes what a visitor typed', () => {
    const items = exampleItems('sheet').map((i) => ({ ...i, description: '<script>x</script>' }));
    const out = buildReport(data({ verticalAssumed: true, bha: { items, svg: '' } }), fmt, copy);
    expect(out).toContain('No survey');
    expect(out).not.toContain('<script>');
  });
});

describe('one step of the report', () => {
  const sections = (html: string) => (html.match(/<span class="rpt-n">(\d)<\/span>/g) ?? []).map((m) => m.replace(/\D/g, ''));
  it('builds only the step asked for, under the same header', () => {
    expect(sections(buildReport(data(), fmt, copy, 'well'))).toEqual(['1']);
    expect(sections(buildReport(data(), fmt, copy, 'ct'))).toEqual(['2']);
    expect(sections(buildReport(data(), fmt, copy, 'bha'))).toEqual(['3']);
    expect(sections(buildReport(data(), fmt, copy, 'job'))).toEqual(['4']);
    expect(sections(buildReport(data(), fmt, copy, 'results'))).toEqual(['5']);
    expect(sections(buildReport(data(), fmt, copy))).toEqual(['1', '2', '3', '4', '5']);
    for (const scope of ['well', 'ct', 'bha', 'job'] as const) {
      const html = buildReport(data(), fmt, copy, scope);
      expect(html).toContain('CT job report');
      expect(html).not.toContain('rpt-summary');
    }
  });
  it('the results step keeps the summary', () => {
    expect(buildReport(data(), fmt, copy, 'results')).toContain('rpt-summary');
  });
  it('the well step holds the well and not the BHA', () => {
    const html = buildReport(data(), fmt, copy, 'well');
    expect(html).toContain('Tubulars');
    expect(html).not.toContain('Coil connector');
  });
});

describe('thinning a long survey', () => {
  it('keeps the first and the last and no more than the limit', () => {
    const rows = Array.from({ length: 500 }, (_, i) => i);
    const t = thin(rows, 40);
    expect(t).toHaveLength(40);
    expect(t[0]).toBe(0);
    expect(t[39]).toBe(499);
    expect(thin([1, 2, 3], 40)).toEqual([1, 2, 3]);
  });
});
