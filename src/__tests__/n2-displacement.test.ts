import { describe, expect, it } from 'vitest';
import { calculateN2Displacement, validateN2Input, type N2Input } from '../lib/tools/n2-displacement';
import { convert, fromUs, toUs } from '../lib/tools/units';

// The reference worksheet's example: 5000 m of 31.175 x 2.77 mm tubing, pumped from 3000 m in a 73.02 x 5.51 mm string.
const example: N2Input = {
  ctLength: 5000,
  ctOd: 31.175,
  ctWall: 2.77,
  depth: 3000,
  tubingOd: 73.02,
  tubingWall: 5.51,
  fluidDensity: 1000,
  tempDepth: 120,
  tempSurface: 15,
  compressibility: 1,
  nitrogenDensity: 227.5,
};

describe('nitrogen displacement against the reference worksheet', () => {
  const r = calculateN2Displacement(example);
  it('capacities and pressures', () => {
    expect(r.boreCapacity).toBeCloseTo(0.5161269, 6);
    expect(r.steelVolume).toBeCloseTo(0.2471863, 6);
    expect(r.pressureDepth * 100).toBeCloseTo(29430, 6);
    expect(r.pressureSurface * 100).toBeCloseTo(22734.675, 6);
    expect(r.pressureMean * 100).toBeCloseTo(26082.3375, 6);
    expect(r.tempMean).toBe(67.5);
  });
  it('volume factors', () => {
    expect(r.factorMean).toBeCloseTo(217.66687, 4);
    expect(r.factorSurface).toBeCloseTo(224.31546, 4);
  });
  it('nitrogen to fill the tubing still on the reel', () => {
    expect(r.reel.gas).toBeCloseTo(231.5505, 3);
    expect(r.reel.liquid).toBeCloseTo(332.4487, 3);
    expect(r.reel.mass).toBeCloseTo(268.6185, 3);
  });
  it('counts the bore once where the worksheet counts it twice', () => {
    // Worksheet: (tubing - steel + bore) x depth = 9.864 m3, 2147.07 sm3, 2490.79 kg for the well.
    const sheetVolume = ((r.freeVolume + r.boreCapacity) * 3000) / 1000;
    expect(sheetVolume).toBeCloseTo(9.864033, 5);
    expect(sheetVolume * r.factorMean).toBeCloseTo(2147.0733, 3);
    expect(r.fillVolume).toBeCloseTo(8.31565, 4);
    expect(r.well.gas).toBeCloseTo(1810.04, 1);
    // Annulus (tubing minus the whole outside of the coil) plus the bore equals the free volume.
    const tubing = (Math.PI * ((73.02 - 11.02) / 1000) ** 2) / 4 * 1000;
    const coilOutside = (Math.PI * (31.175 / 1000) ** 2) / 4 * 1000;
    expect(r.freeVolume).toBeCloseTo(tubing - coilOutside + r.boreCapacity, 9);
  });
  it('adds the well and the reel', () => {
    expect(r.total.mass).toBeCloseTo(r.well.mass + r.reel.mass, 9);
    expect(r.total.liquid).toBeCloseTo((r.total.gas * 1000) / 696.5, 9);
    expect(r.total.mass).toBeCloseTo(r.total.liquid * 0.808, 9);
  });
});

describe('input checks', () => {
  it('accepts the example', () => expect(validateN2Input(example)).toEqual([]));
  it('names the unusable fields', () => {
    expect(validateN2Input({ ...example, depth: 6000 })).toContain('depth');
    expect(validateN2Input({ ...example, ctOd: 80 })).toContain('ctOd');
    expect(validateN2Input({ ...example, nitrogenDensity: 1200 })).toContain('nitrogenDensity');
    expect(validateN2Input({ ...example, compressibility: 0 })).toContain('compressibility');
    expect(validateN2Input({ ...example, tempDepth: NaN })).toContain('tempDepth');
  });
});

describe('units', () => {
  it('converts temperature with its offset, both ways', () => {
    expect(toUs('temperature', 'metric', 100)).toBeCloseTo(212, 9);
    expect(fromUs('temperature', 'metric', 32)).toBeCloseTo(0, 9);
    expect(convert('temperature', 'metric', 'us', -40)).toBeCloseTo(-40, 9);
  });
  it('converts between systems without drift', () => {
    expect(convert('mass', 'us', 'metric', convert('mass', 'metric', 'us', 2759.4))).toBeCloseTo(2759.4, 9);
    expect(convert('gasVolume', 'metric', 'us', 1)).toBeCloseTo(35.3147, 3);
    expect(convert('length', 'metric', 'us', 3000)).toBeCloseTo(9842.5, 1);
  });
});
