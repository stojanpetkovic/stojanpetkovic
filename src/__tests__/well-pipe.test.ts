import { describe, expect, it } from 'vitest';
import { API_CASING, API_TUBING, findPipe, pipeList, pipeProperties, sizeLabel } from '../lib/tools/well/api-pipe';

describe('API pipe table', () => {
  it('has the well-known sizes with their inside diameters', () => {
    const id = (kind: 'casing' | 'tubing', od: number, w: number) => findPipe(kind, od, w)!.id;
    expect(id('casing', 5.5, 17)).toBeCloseTo(4.892, 3);
    expect(id('casing', 7, 29)).toBeCloseTo(6.184, 3);
    expect(id('casing', 9.625, 47)).toBeCloseTo(8.681, 3);
    expect(id('casing', 13.375, 68)).toBeCloseTo(12.415, 3);
    expect(id('casing', 20, 94)).toBeCloseTo(19.124, 3);
    expect(id('tubing', 2.375, 4.7)).toBeCloseTo(1.995, 3);
    expect(id('tubing', 2.875, 6.5)).toBeCloseTo(2.441, 3);
    expect(id('tubing', 3.5, 9.3)).toBeCloseTo(2.992, 3);
    expect(id('tubing', 4.5, 12.75)).toBeCloseTo(3.958, 3);
  });
  it('has the drift diameters API lists for common sizes', () => {
    expect(findPipe('casing', 5.5, 17)!.drift).toBeCloseTo(4.767, 3);
    expect(findPipe('casing', 7, 26)!.drift).toBeCloseTo(6.151, 3);
    expect(findPipe('casing', 9.625, 40)!.drift).toBeCloseTo(8.679, 3);
    expect(findPipe('casing', 13.375, 68)!.drift).toBeCloseTo(12.259, 3);
    expect(findPipe('tubing', 2.875, 6.5)!.drift).toBeCloseTo(2.347, 3);
    expect(findPipe('tubing', 3.5, 9.3)!.drift).toBeCloseTo(2.867, 3);
  });
  it('agrees each nominal weight with the plain-end weight of its wall, within the coupling allowance', () => {
    for (const pipe of [...API_CASING, ...API_TUBING]) {
      const plainEnd = 10.68 * (pipe.od - pipe.wall) * pipe.wall;
      // Small tubing carries a larger coupling allowance than casing.
      const allowance = pipe.kind === 'tubing' ? 0.08 : 0.065;
      expect(Math.abs(pipe.weight - plainEnd) / pipe.weight, `${pipe.od} x ${pipe.weight}`).toBeLessThan(allowance);
    }
  });
  it('has no duplicate sizes and heavier weights have thicker walls', () => {
    for (const kind of ['casing', 'tubing'] as const) {
      const seen = new Set<string>();
      let previous: { od: number; weight: number; wall: number } | undefined;
      for (const p of pipeList(kind)) {
        const key = `${p.od}/${p.weight}`;
        expect(seen.has(key)).toBe(false);
        seen.add(key);
        if (previous && previous.od === p.od) expect(p.wall).toBeGreaterThanOrEqual(previous.wall);
        previous = p;
      }
    }
  });
  it('derives capacity and displacement in barrels per foot', () => {
    const p = pipeProperties({ kind: 'casing', od: 7, weight: 29, wall: 0.408 });
    expect(p.capacity).toBeCloseTo(0.0371, 4);
    expect(p.displacement).toBeCloseTo(0.0105, 4);
    // Steel displacement times the density of steel (489 lb/ft³ = 2745 lb/bbl) is about the plain-end weight per foot.
    expect(p.displacement * 2745).toBeCloseTo(28.8, 0);
  });
  it('labels sizes in fractions', () => {
    expect(sizeLabel(9.625)).toBe('9-5/8');
    expect(sizeLabel(13.375)).toBe('13-3/8');
    expect(sizeLabel(5.5)).toBe('5-1/2');
    expect(sizeLabel(7)).toBe('7');
    expect(sizeLabel(2.875)).toBe('2-7/8');
    expect(sizeLabel(1.05)).toBe('1-1/16');
  });
});
