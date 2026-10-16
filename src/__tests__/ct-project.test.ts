import { describe, expect, it } from 'vitest';
import { bhaForSim, fallbackHole, missingParts, stationsOrVertical, wellForSim } from '../lib/tools/ct-project';
import { estimateWeight, exampleItems, itemWeight, totals, validateItem } from '../lib/tools/bha';
import { exampleWell } from '../lib/tools/well/model';

describe('the well of the Well Builder', () => {
  it('reads the survey in feet and the tubulars with their inside diameters', () => {
    const w = wellForSim(exampleWell('ft'));
    expect(w.stations.length).toBeGreaterThan(5);
    expect(w.td).toBe(10000);
    // casing, casing, liner and tubing; the packer, nipple, sleeve and perforations are not holes
    expect(w.holes).toHaveLength(4);
    const tubing = w.holes.find((h) => Math.abs(h.id - (2.875 - 2 * 0.217)) < 1e-9);
    expect(tubing).toBeDefined();
    expect(w.surveyError).toBe(false);
  });

  it('converts a well kept in metres', () => {
    const w = wellForSim(exampleWell('m'));
    expect(w.td).toBeCloseTo(10000, -1);
    expect(w.holes.some((h) => h.bottom > 8000)).toBe(true);
  });

  it('flags an unreadable survey and falls back to the deepest pipe without one', () => {
    const bad = wellForSim({ ...exampleWell('ft'), survey: 'not a survey 1 2' });
    expect(bad.surveyError).toBe(true);
    const none = wellForSim({ ...exampleWell('ft'), survey: '' });
    expect(none.stations).toEqual([]);
    expect(none.td).toBe(10000);
    expect(stationsOrVertical(none, 8000)).toHaveLength(2);
    expect(fallbackHole(none)).toBeGreaterThan(0);
  });
});

describe('the BHA', () => {
  it('weighs a tool as steel when no weight is entered', () => {
    // A 2 in. OD, 1 in. bore, 10 ft tool: π/4·(4 − 1)·120 in³·0.2836 lb/in³.
    expect(estimateWeight({ od: 2, bore: 1, length: 10 })).toBeCloseTo(0.2836 * (Math.PI / 4) * 3 * 120, 6);
    const item = { ...exampleItems('sheet')[0] };
    expect(itemWeight(item)).toBe(estimateWeight(item));
    expect(itemWeight({ ...item, weight: 12 })).toBe(12);
    expect(validateItem({ ...item, weight: -1 })).toContain('weight');
  });

  it('is one rigid body for the simulation', () => {
    const items = exampleItems('sheet');
    const b = bhaForSim(items);
    expect(b.length).toBeCloseTo(9.96, 9);
    expect(b.od).toBe(2.25);
    expect(b.weight).toBeCloseTo(totals(items).weight, 9);
    expect(b.weight).toBeGreaterThan(20);
    expect(totals(items.map((i, n) => (n === 0 ? { ...i, weight: 100 } : i))).weight).toBeGreaterThan(b.weight);
  });
});

describe('what is missing', () => {
  const well = wellForSim(exampleWell('ft'));
  const bha = bhaForSim(exampleItems('sheet'));
  it('nothing is missing for a complete project', () => {
    expect(missingParts(well, bha, 1, 8000)).toEqual([]);
  });
  it('names every gap', () => {
    const empty = wellForSim({ unit: 'ft', items: [], survey: '' });
    expect(missingParts(empty, bhaForSim([]), 0, 0).sort()).toEqual(['bha', 'depth', 'holes', 'string', 'survey'].sort());
    expect(missingParts(well, bha, 1, 20000)).toEqual(['depth']);
    expect(missingParts({ ...well, surveyError: true }, bha, 1, 8000)).toContain('surveyError');
  });
});
