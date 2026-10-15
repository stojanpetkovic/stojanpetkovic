import { describe, expect, it } from 'vitest';
import { calculateCtPressureLoss, validateCtInput, type CtInput } from '../lib/tools/ct-pressure-loss';
import { fromUs, toUs } from '../lib/tools/units';

/** The example case of the reference worksheet, in oilfield units. */
const example: CtInput = {
  density: 15.52,
  n: 0.78,
  k: 0.836,
  reelDiameter: 83,
  od: 1.5,
  wall: 0.095,
  totalLength: 10220,
  lengthOffReel: 2690,
  flowRate: 31,
};

describe('CT pressure loss against the reference worksheet', () => {
  const result = calculateCtPressureLoss(example);

  it('geometry and velocity', () => {
    expect(result.id).toBeCloseTo(1.31, 6);
    expect(result.area).toBeCloseTo(1.3478217882, 8);
    expect(result.velocity).toBeCloseTo(442.8158123, 5);
  });

  it('Reynolds and Dean numbers', () => {
    expect(result.reynolds).toBeCloseTo(1316.567165, 4);
    expect(result.reynoldsGeneralised).toBeCloseTo(1388.432211, 4);
    expect(result.dean).toBeCloseTo(174.4300408, 4);
  });

  it('regimes and critical Reynolds numbers', () => {
    expect(result.straight.regime).toBe('laminar');
    expect(result.curved.regime).toBe('laminar');
    expect(result.straight.laminarLimit).toBeCloseTo(2401.4, 6);
    expect(result.straight.turbulentLimit).toBeCloseTo(3201.4, 6);
    expect(result.curved.laminarLimit).toBeCloseTo(3293.327325, 4);
    expect(result.curved.turbulentLimit).toBeCloseTo(4093.327325, 4);
  });

  it('pressure losses', () => {
    expect(result.straight.pressureLoss).toBeCloseTo(817.3237395, 4);
    expect(result.curved.pressureLoss).toBeCloseTo(3245.166123, 4);
    expect(result.total).toBeCloseTo(4062.489862, 4);
  });

  it('friction factors', () => {
    expect(result.straight.frictionFactor).toBeCloseTo(0.0121530, 6);
    // The coil raises the laminar friction factor by psi·De^phi.
    expect(result.curved.frictionFactor! / result.straight.frictionFactor!).toBeCloseTo(1.4184, 3);
  });
});

describe('CT pressure loss in the other regimes', () => {
  it('turbulent flow matches the worksheet value for the straight section', () => {
    // 764.014 psi is what the worksheet gives for turbulent flow at 31 gal/min.
    // Raising the rate until Re passes the straight limit reproduces the formula.
    const fast = calculateCtPressureLoss({ ...example, flowRate: 300 });
    expect(fast.straight.regime).toBe('turbulent');
    expect(fast.straight.pressureLoss).toBeGreaterThan(calculateCtPressureLoss(example).straight.pressureLoss);
  });

  it('turbulent flow follows the worksheet formulas for both sections', () => {
    // The worksheet's turbulent cells, written out independently of the module.
    const { density: mw, n: N, k: K, od, wall, reelDiameter: D2, lengthOffReel: loff, totalLength } = example;
    const Q = 200;
    const D1 = od - 2 * wall;
    const RE = ((31.042 * Q ** (2 - N) * mw) / (9.804 ** N * K * D1 ** (4 - 3 * N))) * (N / (1 + 3 * N)) ** N;
    const A = (Math.log10(N) + 3.93) / 50;
    const B = (1.75 - Math.log10(N)) / 7;
    const straight = ((A / RE ** B) * loff * mw * Q ** 2) / (154.63 * D1 ** 5);
    const curved =
      ((D1 / D2) ** 0.1 * ((1.069 * A) / RE ** (0.8 * B)) * (totalLength - loff) * mw * Q ** 2) / (154.63 * D1 ** 5);
    const result = calculateCtPressureLoss({ ...example, flowRate: Q });
    expect(result.straight.regime).toBe('turbulent');
    expect(result.curved.regime).toBe('turbulent');
    expect(result.straight.pressureLoss).toBeCloseTo(straight, 6);
    expect(result.curved.pressureLoss).toBeCloseTo(curved, 6);
  });

  it('is continuous across the straight transition', () => {
    const base = calculateCtPressureLoss(example);
    const rate = (re: number) =>
      Math.pow(re / (base.reynolds / Math.pow(example.flowRate, 2 - example.n)), 1 / (2 - example.n));
    const below = calculateCtPressureLoss({ ...example, flowRate: rate(2401.4 - 0.01) });
    const above = calculateCtPressureLoss({ ...example, flowRate: rate(2401.4 + 0.01) });
    expect(below.straight.regime).toBe('laminar');
    expect(above.straight.regime).toBe('transitional');
    expect(Math.abs(above.straight.pressureLoss - below.straight.pressureLoss) / below.straight.pressureLoss).toBeLessThan(0.01);
  });

  it('loss rises with flow rate in every regime', () => {
    let previous = 0;
    for (const q of [5, 20, 31, 60, 90, 150, 300]) {
      const { total } = calculateCtPressureLoss({ ...example, flowRate: q });
      expect(total).toBeGreaterThan(previous);
      previous = total;
    }
  });

  it('a string with no tubing on the reel has no curved loss', () => {
    const result = calculateCtPressureLoss({ ...example, lengthOffReel: example.totalLength });
    expect(result.curved.pressureLoss).toBeCloseTo(0, 8);
  });
});

describe('input checks', () => {
  it('accepts the example', () => {
    expect(validateCtInput(example)).toEqual([]);
  });

  it('names the unusable fields', () => {
    expect(validateCtInput({ ...example, n: 0 })).toContain('n');
    expect(validateCtInput({ ...example, wall: 0.8 })).toContain('wall');
    expect(validateCtInput({ ...example, lengthOffReel: 99999 })).toContain('lengthOffReel');
    expect(validateCtInput({ ...example, flowRate: Number.NaN })).toContain('flowRate');
    expect(validateCtInput({ ...example, reelDiameter: 1 })).toContain('reelDiameter');
  });
});

describe('unit conversion', () => {
  it('round-trips every quantity', () => {
    for (const q of ['density', 'k', 'diameter', 'length', 'flowRate', 'pressure', 'velocity'] as const) {
      expect(toUs(q, 'metric', fromUs(q, 'metric', 12.3456))).toBeCloseTo(12.3456, 9);
    }
  });

  it('known values', () => {
    expect(fromUs('pressure', 'metric', 1000)).toBeCloseTo(68.9476, 3);
    expect(fromUs('diameter', 'metric', 1.5)).toBeCloseTo(38.1, 6);
    expect(fromUs('length', 'metric', 1000)).toBeCloseTo(304.8, 6);
    expect(fromUs('flowRate', 'metric', 31)).toBeCloseTo(117.348, 2);
    expect(fromUs('density', 'metric', 8.34)).toBeCloseTo(999.4, 0);
  });

  it('the same case in metric gives the same loss', () => {
    const metric = {
      density: fromUs('density', 'metric', example.density),
      n: example.n,
      k: fromUs('k', 'metric', example.k),
      reelDiameter: fromUs('diameter', 'metric', example.reelDiameter),
      od: fromUs('diameter', 'metric', example.od),
      wall: fromUs('diameter', 'metric', example.wall),
      totalLength: fromUs('length', 'metric', example.totalLength),
      lengthOffReel: fromUs('length', 'metric', example.lengthOffReel),
      flowRate: fromUs('flowRate', 'metric', example.flowRate),
    };
    const back: CtInput = {
      density: toUs('density', 'metric', metric.density),
      n: metric.n,
      k: toUs('k', 'metric', metric.k),
      reelDiameter: toUs('diameter', 'metric', metric.reelDiameter),
      od: toUs('diameter', 'metric', metric.od),
      wall: toUs('diameter', 'metric', metric.wall),
      totalLength: toUs('length', 'metric', metric.totalLength),
      lengthOffReel: toUs('length', 'metric', metric.lengthOffReel),
      flowRate: toUs('flowRate', 'metric', metric.flowRate),
    };
    const direct = calculateCtPressureLoss(example).total;
    const viaMetric = calculateCtPressureLoss(back).total;
    expect(viaMetric).toBeCloseTo(direct, 6);
    expect(fromUs('pressure', 'metric', direct)).toBeCloseTo(280.1, 0);
  });
});
