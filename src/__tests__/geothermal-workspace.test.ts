import { describe, expect, it } from 'vitest';
import en from '@/i18n/en.json';
import sr from '@/i18n/sr.json';
import de from '@/i18n/de.json';
import { makeFormat, probeRows, selectedWell, wellRow } from '@/lib/geothermal/workspace';
import type { WorkspaceStrings } from '@/lib/geothermal/workspace';
import type { GroundHit } from '@/lib/geothermal/scene';
import { WELLS } from '@/lib/geothermal/wells';

const copy = (en.pages as any).geothermalModel;
const ws = copy.workspace as WorkspaceStrings;
const f = makeFormat('en');
const units = copy.units;

const hit: GroundHit = {
  x: 0,
  y: 0,
  lat: 45.4,
  lon: 20,
  e: 7500,
  n: 5030,
  elevation: 81.4,
  column: [34.2, 57.1, 98.6],
};

describe('probe rows', () => {
  it('lists position, elevation and the three atlas depths', () => {
    const rows = probeRows(hit, null, ws, f, units);
    expect(rows.map((r) => r.label)).toEqual([
      ws.probe.rows.position,
      ws.probe.rows.gk,
      ws.probe.rows.elevation,
      'At 500 m',
      'At 1,000 m',
      'At 2,000 m',
    ]);
    expect(rows[2].value).toBe('81 m');
    expect(rows[4].value).toBe('57.1 °C');
  });

  it('adds the depth to the chosen temperature when contours are on', () => {
    const rows = probeRows(hit, 50, ws, f, units);
    const last = rows[rows.length - 1];
    expect(last.label).toBe('Depth to 50 °C');
    // 50 °C lies between the 500 m (34.2) and 1,000 m (57.1) temperatures.
    const metres = Number(last.value.replace(/[^\d]/g, ''));
    expect(metres).toBeGreaterThan(500);
    expect(metres).toBeLessThan(1000);
  });
});

describe('well rows', () => {
  it('has one cell per column of the sheet table', () => {
    for (const w of WELLS)
      expect(wellRow(w, copy as never, f)).toHaveLength(ws.sheet.wellsHead.length);
  });

  it('describes the selected well with one line per tested interval', () => {
    const w = WELLS.find((x) => x.tests.length > 1) ?? WELLS[0];
    const sel = selectedWell(
      w,
      {
        ...copy,
        locale: 'en',
        detailTest: copy.test.interval,
        detailNoInterval: copy.test.noInterval,
        detailLowerBound: copy.test.lowerBound,
      } as never,
      f,
    );
    expect(sel.tests).toHaveLength(w.tests.length);
    expect(sel.rows.some((r) => r.value.includes(String(w.year)))).toBe(true);
  });
});

describe('workspace copy', () => {
  const keys = (o: unknown, prefix = ''): string[] =>
    o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
      : [prefix];
  const base = keys(ws);

  it.each([
    ['sr', sr],
    ['de', de],
  ])('%s has every key of English', (_, locale) => {
    expect(keys((locale.pages as any).geothermalModel.workspace)).toEqual(base);
  });

  it.each([
    ['sr', sr],
    ['de', de],
  ])('%s keeps the placeholders of English', (_, locale) => {
    const cells = (o: any): string[] =>
      typeof o === 'string' ? [o] : Object.values(o).flatMap(cells);
    const marks = (o: unknown) => cells(o).map((s) => (s.match(/\{\w+\}/g) ?? []).sort().join());
    expect(marks((locale.pages as any).geothermalModel.workspace)).toEqual(marks(ws));
  });
});
