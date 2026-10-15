import { describe, expect, it } from 'vitest';
import {
  createItem, emptyWell, exampleWell, itemErrors, readWell, sizeOptions, toUnit, weightOptions, withSize, withWeight,
} from '../lib/tools/well/model';
import { minimumCurvature, parseSurvey } from '../lib/tools/well/survey';

describe('well model', () => {
  it('creates items with sensible depths and sizes', () => {
    expect(createItem('casing', 'ft', 3000)).toMatchObject({ top: 0, bottom: 3000, od: 9.625, weight: 47 });
    expect(createItem('liner', 'ft', 6000)).toMatchObject({ top: 6000, bottom: 8000, od: 7 });
    expect(createItem('packer', 'm', 2000)).toMatchObject({ top: 2000, bottom: 2003 });
    expect(createItem('perforation', 'ft', 9000)).toMatchObject({ top: 9000, bottom: 9100 });
    expect(createItem('nipple', 'ft', 8700)).toMatchObject({ top: 8700, bottom: 8703, od: 2.875 });
    expect(createItem('sleeve', 'm', 2500)).toMatchObject({ top: 2500, bottom: 2501.2 });
  });
  it('changes size and weight within the API lists, taking the wall with it', () => {
    const item = withSize(createItem('casing', 'ft', 3000), 7);
    expect(item).toMatchObject({ od: 7, weight: 17, wall: 0.231 });
    expect(withWeight(item, 29)).toMatchObject({ weight: 29, wall: 0.408 });
    expect(withWeight(item, 99)).toMatchObject({ weight: 17 });
    expect(sizeOptions('tubing')).toContain(2.875);
    expect(weightOptions('tubing', 2.875).map((w) => w.weight)).toContain(6.5);
    expect(sizeOptions('packer')).toEqual([]);
    // Nipples and sleeves are made up in the tubing string, so they take its sizes.
    expect(sizeOptions('nipple')).toEqual(sizeOptions('tubing'));
    expect(sizeOptions('sleeve')).toContain(3.5);
  });
  it('finds the unusable fields of an item', () => {
    expect(itemErrors(createItem('casing', 'ft', 3000))).toEqual([]);
    expect(itemErrors({ ...createItem('casing', 'ft', 3000), bottom: 0 })).toEqual(['bottom']);
    expect(itemErrors({ ...createItem('casing', 'ft', 3000), top: -5 })).toContain('top');
  });
  it('reads a saved well and drops items it cannot use', () => {
    const well = exampleWell('ft');
    const read = readWell(JSON.parse(JSON.stringify(well)))!;
    expect(read.items).toHaveLength(well.items.length);
    expect(readWell({ unit: 'm', items: [{ type: 'nope' }, { type: 'casing', od: 9.625, weight: 47, wall: 0.472, top: 0, bottom: 100 }] })!.items).toHaveLength(1);
    expect(readWell(null)).toBeNull();
    expect(emptyWell('m').unit).toBe('m');
  });
  it('keeps the note of an item through saving and reading', () => {
    const well = exampleWell('ft');
    well.items[0] = { ...well.items[0], note: 'XN 2.205"' };
    expect(readWell(JSON.parse(JSON.stringify(well)))!.items[0].note).toBe('XN 2.205"');
    expect(readWell(JSON.parse(JSON.stringify(exampleWell('ft'))))!.items[0].note).toBeUndefined();
  });
  it('has landing nipple and sliding sleeve in the example', () => {
    const types = exampleWell('ft').items.map((i) => i.type);
    expect(types).toContain('nipple');
    expect(types).toContain('sleeve');
  });
  it('converts depths between units', () => {
    expect(toUnit(1000, 'ft', 'm')).toBeCloseTo(304.8, 9);
    expect(toUnit(304.8, 'm', 'ft')).toBeCloseTo(1000, 9);
  });
  it('has an example whose survey parses and whose depths fit it', () => {
    for (const unit of ['ft', 'm'] as const) {
      const well = exampleWell(unit);
      const parsed = parseSurvey(well.survey);
      expect(parsed.stations).toBeDefined();
      const path = minimumCurvature(parsed.stations!, unit);
      const td = path.at(-1)!.md;
      for (const item of well.items) expect(item.bottom).toBeLessThanOrEqual(td);
    }
  });
});
