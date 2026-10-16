import { describe, expect, it } from 'vitest';
import { buildToolReport, type ToolReportData } from '../lib/tools/tool-report';

const base: ToolReportData = {
  title: 'CT Pressure Loss',
  date: '17 October 2026',
  system: 'Oilfield (US)',
  inputs: [
    { title: 'Fluid', rows: [{ label: 'Density', value: '15.77 lb/gal' }, { label: 'Rheology model', value: 'Bingham plastic' }] },
    { title: 'Flow', rows: [{ label: 'Flow rate', value: '31 gal/min' }] },
    { title: 'Empty', rows: [] },
  ],
  results: {
    headline: { label: 'Total friction pressure loss', value: '2,535 psi' },
    rows: [{ label: 'Velocity', value: '442.8 ft/min' }],
    tables: [{ title: 'Schedule', head: ['Strokes', 'Pressure'], rows: [['0', '55'], ['100', '54']] }],
    figures: [{ title: 'Chart', svg: '<svg id="fig"></svg>' }],
  },
  method: { title: 'Method', intro: 'Intro.', steps: ['Step one.', 'Step two.'], assumptionsTitle: 'Assumptions', assumptions: ['One.'], reference: 'Reference.' },
  note: 'Check the result.',
  labels: { created: 'Created {date}', inputs: 'Inputs', results: 'Results', method: 'Method and assumptions' },
};

describe('tool report', () => {
  const html = buildToolReport(base);

  it('has the title, the date and the unit system', () => {
    expect(html).toContain('<h1>CT Pressure Loss</h1>');
    expect(html).toContain('Created 17 October 2026 · Oilfield (US)');
  });

  it('puts the inputs in tables by group and leaves out empty groups', () => {
    expect(html).toContain('Fluid');
    expect(html).toContain('15.77 lb/gal');
    expect(html).toContain('Flow rate');
    expect(html).not.toContain('>Empty<');
    expect((html.match(/class="rpt-group"/g) ?? []).length).toBe(2);
  });

  it('has the results with the headline, a table, a schedule and the drawing', () => {
    expect(html).toContain('rpt-headline');
    expect(html).toContain('2,535 psi');
    expect(html).toContain('442.8 ft/min');
    expect(html).toContain('<th class="r">Pressure</th>');
    expect(html).toContain('id="fig"');
  });

  it('has the method with its assumptions and the note', () => {
    expect(html).toContain('Step two.');
    expect(html).toContain('Assumptions');
    expect(html).toContain('Reference.');
    expect(html).toContain('Check the result.');
  });

  it('numbers the sections in order', () => {
    expect([...html.matchAll(/<span class="rpt-n">(\d)<\/span>/g)].map((m) => m[1])).toEqual(['1', '2', '3']);
  });

  it('copes with a page that has no inputs, results or method, and escapes text', () => {
    const bare = buildToolReport({ ...base, title: '<b>x</b>', inputs: [], results: { rows: [], tables: [], figures: [] }, method: undefined, note: '' });
    expect(bare).not.toContain('<b>');
    expect(bare).not.toContain('rpt-section');
    expect(bare).toContain('rpt-head');
  });
});
