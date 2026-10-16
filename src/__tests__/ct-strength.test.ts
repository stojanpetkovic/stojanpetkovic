import { describe, expect, it } from 'vitest';
import { calculateStrength, validateStrengthInput, type StrengthInput } from '../lib/tools/ct-strength';
import { fromUs, toUs } from '../lib/tools/units';

// The reference worksheet's example: 1.75 in x 0.134 in, 80 ksi, with the bend radius left at its 1e9 ft.
const example: StrengthInput = {
  od: 1.75,
  wall: 0.134,
  ovality: 0.05,
  yieldStress: 80000,
  yieldFactor: 80,
  modulus: 30e6,
  poisson: 0.33,
  pressureIn: 3000,
  pressureOut: 1700,
  axialForce: 20000,
  bendingRadius: 1e9,
  safetyFactor: 1,
};

describe('CT strength limits against the reference worksheet', () => {
  const r = calculateStrength(example);
  it('geometry', () => {
    expect(r.id).toBeCloseTo(1.482, 9);
    expect(r.area).toBeCloseTo(0.680293, 5);
  });
  it('stresses', () => {
    expect(r.stress.axial).toBeCloseTo(29399.0954, 3);
    expect(r.stress.bending).toBeCloseTo(0.0021875, 9);
    expect(r.stress.axialMax).toBeCloseTo(29399.0976, 3);
    expect(r.stress.hoop).toBeCloseTo(6192.7045, 3);
    expect(r.stress.radial).toBeCloseTo(-3000, 6);
    expect(r.stress.vonMises).toBeCloseTo(28920.097, 2);
    expect(r.stress.vonMisesPercent).toBeCloseTo(36.1501, 3);
    expect(r.stress.withinYieldFactor).toBe(true);
  });
  it('burst', () => {
    expect(r.burst.api).toBeCloseTo(10720, 6);
    expect(r.burst.cappedEnd).toBeCloseTo(13063.4958, 3);
    expect(r.burst.trueBurst).toBeCloseTo(15355.0471, 3);
  });
  it('collapse', () => {
    expect(r.collapse.timoshenkoRound).toBeCloseTo(9363.2882, 3);
    expect(r.collapse.api5c3).toBeCloseTo(8646.3278, 3);
    expect(r.collapse.api5c7Oval).toBeCloseTo(4874.8077, 3);
    expect(r.collapse.timoshenkoOval).toBeCloseTo(4365.5643, 3);
    expect(r.collapse.api5c7WithTension).toBeCloseTo(3510.8448, 3);
  });
  it('tension and differential pressure', () => {
    expect(r.tension.max).toBeCloseTo(43538.7545, 3);
    expect(r.tension.maxAtPressure).toBeCloseTo(44286.5807, 3);
    expect(r.differentialPressure).toBe(-1300);
  });
});

describe('other loads', () => {
  it('has no tension-corrected collapse in compression', () => {
    expect(calculateStrength({ ...example, axialForce: -5000 }).collapse.api5c7WithTension).toBeNull();
  });
  it('reduces the 5C7 collapse more as tension grows, to zero at the yield tension', () => {
    const at = (f: number) => calculateStrength({ ...example, axialForce: f }).collapse.api5c7WithTension!;
    expect(at(30000)).toBeLessThan(at(10000));
    expect(at(43538.7545)).toBeCloseTo(0, 2);
    expect(at(60000)).toBe(0);
  });
  it('adds bending stress for a tight bend, on the worse side', () => {
    const r = calculateStrength({ ...example, bendingRadius: 6.9 });
    expect(r.stress.bending).toBeCloseTo((30e6 * 1.75) / (2 * 12 * 6.9), 6);
    expect(Math.abs(r.stress.axialMax)).toBeCloseTo(r.stress.axial + r.stress.bending, 6);
  });
  it('flags a von Mises stress above the yield factor', () => {
    expect(calculateStrength({ ...example, axialForce: 45000 }).stress.withinYieldFactor).toBe(false);
  });
  it('selects the elastic range for a very thin wall', () => {
    const r = calculateStrength({ ...example, wall: 0.04, axialForce: 0 });
    expect(r.collapse.api5c3).toBeCloseTo(46.95e6 / ((1.75 / 0.04) * (1.75 / 0.04 - 1) ** 2), 3);
  });
});

describe('input checks', () => {
  it('accepts the example', () => expect(validateStrengthInput(example)).toEqual([]));
  it('names the unusable fields', () => {
    expect(validateStrengthInput({ ...example, wall: 1 })).toContain('wall');
    expect(validateStrengthInput({ ...example, poisson: 0.6 })).toContain('poisson');
    expect(validateStrengthInput({ ...example, yieldFactor: 120 })).toContain('yieldFactor');
    expect(validateStrengthInput({ ...example, safetyFactor: 0.9 })).toContain('safetyFactor');
    expect(validateStrengthInput({ ...example, pressureIn: NaN })).toContain('pressureIn');
  });
});

describe('metric units', () => {
  it('round-trips and matches the known factors', () => {
    expect(fromUs('stress', 'metric', 80000)).toBeCloseTo(551.58, 2);
    expect(fromUs('modulus', 'metric', 30e6)).toBeCloseTo(206.84, 2);
    expect(fromUs('force', 'metric', 20000)).toBeCloseTo(9.0718, 3);
    expect(toUs('stress', 'metric', fromUs('stress', 'metric', 80000))).toBeCloseTo(80000, 6);
  });
});
