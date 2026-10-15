import { describe, expect, it } from 'vitest';
import { nitrogenZ, Z_PRESSURES, Z_TABLE, Z_TEMPERATURES } from '../lib/tools/n2-z';

describe('nitrogen compressibility factor', () => {
  it('returns the table values at the grid points', () => {
    expect(nitrogenZ(100, 20).z).toBeCloseTo(1.0008, 4);
    expect(nitrogenZ(300, 100).z).toBeCloseTo(1.1596, 4);
    expect(nitrogenZ(1, 20).z).toBeCloseTo(0.9998, 4);
  });
  it('interpolates between the grid points and stays between the neighbours', () => {
    const z = nitrogenZ(125, 30).z;
    const corners = [nitrogenZ(100, 20).z, nitrogenZ(100, 40).z, nitrogenZ(150, 20).z, nitrogenZ(150, 40).z];
    expect(z).toBeGreaterThan(Math.min(...corners));
    expect(z).toBeLessThan(Math.max(...corners));
    expect(nitrogenZ(100, 30).z).toBeCloseTo((nitrogenZ(100, 20).z + nitrogenZ(100, 40).z) / 2, 9);
  });
  it('is close to 1 at low pressure and rises with pressure at high temperature', () => {
    expect(Math.abs(nitrogenZ(1, 60).z - 1)).toBeLessThan(0.001);
    expect(nitrogenZ(300, 100).z).toBeGreaterThan(nitrogenZ(100, 100).z);
  });
  it('flags values outside the table and uses the edge', () => {
    const outside = nitrogenZ(700, 20);
    expect(outside.inRange).toBe(false);
    expect(outside.z).toBeCloseTo(nitrogenZ(500, 20).z, 9);
    expect(nitrogenZ(100, 20).inRange).toBe(true);
    expect(nitrogenZ(100, 200).inRange).toBe(false);
  });
  it('has one value for every pressure and temperature', () => {
    expect(Z_TABLE).toHaveLength(Z_PRESSURES.length);
    for (const row of Z_TABLE) expect(row).toHaveLength(Z_TEMPERATURES.length);
  });
  it('matches the compressibility implied by the worksheet conditions to a plausible value', () => {
    // 260 bar and 67.5 °C: the worksheet assumed Z = 1; the real value is about 1.12.
    const z = nitrogenZ(261.8, 67.5).z;
    expect(z).toBeGreaterThan(1.1);
    expect(z).toBeLessThan(1.15);
  });
});
