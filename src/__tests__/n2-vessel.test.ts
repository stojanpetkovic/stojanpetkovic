import { describe, expect, it } from 'vitest';
import { calculateVessel, validateVesselInput, type VesselInput } from '../lib/tools/n2-vessel';
import { calculateN2Displacement } from '../lib/tools/n2-displacement';

const example: VesselInput = { volume: 10, pressure: 100, initialPressure: 0, temperature: 20, compressibility: 1 };

describe('nitrogen for a vessel', () => {
  it('follows the volume factor of the reference worksheet', () => {
    const r = calculateVessel(example);
    expect(r.factor).toBeCloseTo((2.8416 * 10000) / 293, 9);
    expect(r.gas).toBeCloseTo(969.8294, 3);
    expect(r.liquid).toBeCloseTo((969.8294 * 1000) / 696.5, 3);
    expect(r.mass).toBeCloseTo(r.liquid * 0.808, 9);
  });
  it('uses the same factor as the displacement tool', () => {
    // The worksheet's mean conditions: 26082.3375 kPa at 67.5 °C is 217.66687 sm3/m3.
    const d = calculateN2Displacement({
      ctLength: 5000, ctOd: 31.175, ctWall: 2.77, depth: 3000, tubingOd: 73.02, tubingWall: 5.51,
      fluidDensity: 1000, tempDepth: 120, tempSurface: 15, compressibility: 1, nitrogenDensity: 227.5,
    });
    const v = calculateVessel({ volume: 1, pressure: d.pressureMean, initialPressure: 0, temperature: d.tempMean, compressibility: 1 });
    expect(v.gas).toBeCloseTo(d.factorMean, 9);
  });
  it('scales with volume and with the pressure added, and falls with temperature', () => {
    expect(calculateVessel({ ...example, volume: 20 }).gas).toBeCloseTo(2 * calculateVessel(example).gas, 9);
    expect(calculateVessel({ ...example, initialPressure: 50 }).gas).toBeCloseTo(calculateVessel(example).gas / 2, 9);
    expect(calculateVessel({ ...example, temperature: 60 }).gas).toBeLessThan(calculateVessel(example).gas);
  });
  it('divides by Z, so a real gas needs less nitrogen per volume of vessel', () => {
    expect(calculateVessel({ ...example, compressibility: 1.2 }).gas).toBeCloseTo(calculateVessel(example).gas / 1.2, 9);
  });
});

describe('input checks', () => {
  it('accepts the example', () => expect(validateVesselInput(example)).toEqual([]));
  it('names the unusable fields', () => {
    expect(validateVesselInput({ ...example, volume: 0 })).toContain('volume');
    expect(validateVesselInput({ ...example, pressure: -5 })).toContain('pressure');
    expect(validateVesselInput({ ...example, initialPressure: 100 })).toContain('initialPressure');
    expect(validateVesselInput({ ...example, temperature: NaN })).toContain('temperature');
    expect(validateVesselInput({ ...example, compressibility: 5 })).toContain('compressibility');
  });
});
