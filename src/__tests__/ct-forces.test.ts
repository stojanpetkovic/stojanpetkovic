import { describe, expect, it } from 'vitest';
import {
  buoyedWeight,
  calculateForces,
  criticalHelical,
  helicalShortening,
  helixPeriod,
  maxOverpull,
  maxSetdown,
  momentOfInertia,
  normalForce,
  pressureAreaForce,
  reach,
  straightSegmentForce,
  tensionLimit,
  trip,
  validateForces,
  type ForcesInput,
} from '../lib/tools/ct-forces';

const rad = (d: number) => (d * Math.PI) / 180;

/** 1.75 in. x 0.134 in. CT as in the manual's examples. */
const OD = 1.75;
const WALL = 0.134;

describe('worked examples of the CTES manual', () => {
  it('example 6.1: buoyed weight 1.288 lb/ft', () => {
    expect(buoyedWeight(OD, WALL, 0.2, 8.35)).toBeCloseTo(1.288, 2);
  });

  it('example 6.2: forces over a 10 ft segment at 80 degrees', () => {
    const w = 1.288;
    expect(straightSegmentForce(100, w, 80, 10, 0.3, -1)).toBeCloseTo(98.43, 1);
    expect(straightSegmentForce(100, w, 80, 10, 0.3, 1)).toBeCloseTo(106.04, 1);
  });

  it('table 6.2: pressure-area force', () => {
    expect(pressureAreaForce(1.25, 1000)).toBeCloseTo(1227, 0);
    expect(pressureAreaForce(1.75, 2000)).toBeCloseTo(4811, 0);
    expect(pressureAreaForce(2.375, 8000)).toBeCloseTo(35441, 0);
  });

  it('example 7.1: critical helical buckling force 1772 lbf', () => {
    const I = momentOfInertia(OD, WALL);
    expect(I).toBeCloseTo(0.2236, 4);
    const rc = (5 - OD) / 2;
    expect(rc).toBeCloseTo(1.625, 6);
    // The bending terms work in lb and in: w = 1.288 lb/ft is 0.1073 lb/in.
    const f = criticalHelical(27e6 * I, 1.288 / 12, rad(80), 0, 0, rc);
    expect(f).toBeCloseTo(1772, -1);
    expect(Math.abs(f - 1772)).toBeLessThan(3);
  });

  it('example 7.2: helix period 33.2 ft and shortening 0.66 ft', () => {
    const ei = 27e6 * momentOfInertia(OD, WALL);
    const period = helixPeriod(ei, 3000);
    expect(period / 12).toBeCloseTo(33.2, 1);
    expect(helicalShortening(2000, 1.625 / 12, period / 12)).toBeCloseTo(0.66, 1);
  });

  it('a vertical segment is buckled by a few hundred lbf at most (eq. 7.1)', () => {
    const ei = 27e6 * momentOfInertia(OD, WALL);
    const f = criticalHelical(ei, 1.288 / 12, 0, 0, 0, 1.625);
    expect(f).toBeLessThan(200);
    expect(f).toBeGreaterThan(20);
  });
});

describe('capstan force of a curve', () => {
  it('reduces to the weight component in a straight hole', () => {
    expect(normalForce(1000, 1.3, rad(60), 0, 0)).toBeCloseTo(1.3 * Math.sin(rad(60)), 9);
  });
  it('compression in a build adds to the weight, tension in a build takes from it', () => {
    const build = 0.0005;
    const weight = 1.3 * Math.sin(rad(60));
    expect(normalForce(-1000, 1.3, rad(60), build, 0)).toBeGreaterThan(weight);
    expect(normalForce(1000, 1.3, rad(60), build, 0)).toBeLessThan(weight);
  });
});

// ---------------------------------------------------------------------------
// Whole-string trips

const vertical = [
  { md: 0, inclination: 0, azimuth: 0 },
  { md: 10000, inclination: 0, azimuth: 0 },
];
const horizontal = [
  { md: 0, inclination: 90, azimuth: 0 },
  { md: 20000, inclination: 90, azimuth: 0 },
];
const base: ForcesInput = {
  stations: vertical,
  holeId: 5,
  ctOd: OD,
  sections: [{ length: 30000, wall: WALL }],
  bhaLength: 0,
  bhaWeight: 0,
  bhaOd: 2,
  rhoIn: 0.2,
  rhoOut: 8.35,
  whp: 0,
  cf: 0.3,
  stripperFriction: 0,
  reelTension: 0,
  modulus: 27e6,
  yieldStrength: 80000,
  designFactor: 0.8,
  snubLimit: 20000,
  step: 10,
};

describe('vertical well', () => {
  it('the weight indicator reads the buoyed weight of the string, in and out', () => {
    const w = buoyedWeight(OD, WALL, 0.2, 8.35);
    const rih = trip(base, 5000, 'rih');
    const pooh = trip(base, 5000, 'pooh');
    expect(rih.ctwi).toBeCloseTo(w * 5000, 0);
    expect(pooh.ctwi).toBeCloseTo(w * 5000, 0);
    expect(rih.buckledLength).toBe(0);
  });

  it('the wellhead pressure, stripper and reel tension take from the reading as in eq. 6.19 and 6.20', () => {
    const w = buoyedWeight(OD, WALL, 0.2, 8.35);
    const input = { ...base, whp: 2000, stripperFriction: 1000, reelTension: 500 };
    expect(trip(input, 5000, 'rih').ctwi).toBeCloseTo(w * 5000 - 4811 - 1000 - 500, 0);
    expect(trip(input, 5000, 'pooh').ctwi).toBeCloseTo(w * 5000 - 4811 + 1000 - 500, 0);
  });

  it('a force at the BHA is added to the force at the top', () => {
    const w = buoyedWeight(OD, WALL, 0.2, 8.35);
    expect(trip(base, 5000, 'pooh', 3000).ctwi).toBeCloseTo(w * 5000 + 3000, 0);
    // A set-down weight below the buckling force of vertical CT passes straight through.
    expect(trip(base, 5000, 'rih', -30).ctwi).toBeCloseTo(w * 5000 - 30, 0);
  });

  it('the BHA weight is buoyed and carried', () => {
    const input = { ...base, bhaLength: 20, bhaWeight: 200, bhaOd: 2 };
    const volume = (Math.PI * 4 * 12 * 20) / 4 / 231;
    const w = buoyedWeight(OD, WALL, 0.2, 8.35);
    expect(trip(input, 5000, 'rih').ctwi).toBeCloseTo(w * 4980 + 200 - 8.35 * volume, 0);
  });
});

describe('horizontal well', () => {
  const input = { ...base, stations: horizontal };
  const w = buoyedWeight(OD, WALL, 0.2, 8.35);
  const ei = 27e6 * momentOfInertia(OD, WALL);
  const rc = (5 - OD) / 2;

  it('unbuckled, the drag grows linearly with the length', () => {
    const rih = trip(input, 1000, 'rih');
    expect(rih.ctwi).toBeCloseTo(-0.3 * w * 1000, 0);
    expect(trip(input, 1000, 'pooh').ctwi).toBeCloseTo(0.3 * w * 1000, 0);
  });

  it('buckles where the drag has built up the critical force', () => {
    const critical = criticalHelical(ei, w / 12, rad(90), 0, 0, rc);
    const buckleAt = critical / (0.3 * w);
    expect(trip(input, buckleAt - 200, 'rih').buckledLength).toBe(0);
    expect(trip(input, buckleAt + 400, 'rih').buckledLength).toBeGreaterThan(0);
  });

  it('after buckling the force follows the closed solution P = P0·tan', () => {
    // Start in compression above the threshold so the string is buckled over its whole length.
    const critical = criticalHelical(ei, w / 12, rad(90), 0, 0, rc);
    const p0 = critical * 1.4;
    const length = 300;
    const t = trip({ ...input, step: 2 }, length, 'rih', -p0);
    const k = Math.sqrt((4 * ei * (w / 12)) / rc);
    const atan = Math.atan(p0 / k) + 0.3 * Math.sqrt(((w / 12) * rc) / (4 * ei)) * (length * 12);
    const analytic = k * Math.tan(atan);
    expect(-t.topForce).toBeCloseTo(analytic, -1);
    expect(Math.abs(-t.topForce - analytic) / analytic).toBeLessThan(0.01);
    expect(t.buckledLength).toBeCloseTo(length, 0);
  });

  it('locks up: the reach is finite, and the setdown weight at depth shrinks to nothing', () => {
    const r = reach(input);
    expect(r.toTd).toBe(false);
    expect(r.depth).toBeGreaterThan(3000);
    expect(r.depth).toBeLessThan(15000);
    expect(maxSetdown(input, 1000)).toBeGreaterThan(maxSetdown(input, 3000));
    expect(maxSetdown(input, r.depth + 3000)).toBe(0);
  });
});

describe('hole size by depth', () => {
  const input = { ...base, stations: horizontal };
  it('a tighter tubular delays buckling: the clearance enters the critical force', () => {
    const wide = trip({ ...input, holeId: 7 }, 8000, 'rih');
    const tight = trip({ ...input, holeId: 7, holes: [{ top: 0, bottom: 20000, id: 3.2 }] }, 8000, 'rih');
    expect(tight.buckledLength).toBeLessThan(wide.buckledLength);
  });
  it('the smallest tubular covering a depth is the one the CT runs in', () => {
    const smallEverywhere = trip({ ...input, holeId: 7, holes: [{ top: 0, bottom: 20000, id: 3.2 }, { top: 0, bottom: 20000, id: 6.0 }] }, 8000, 'rih');
    const smallOnly = trip({ ...input, holeId: 7, holes: [{ top: 0, bottom: 20000, id: 3.2 }] }, 8000, 'rih');
    expect(smallEverywhere.topForce).toBeCloseTo(smallOnly.topForce, 6);
  });
  it('falls back to holeId where no entry covers the depth', () => {
    const a = trip({ ...input, holeId: 5 }, 3000, 'rih');
    const b = trip({ ...input, holeId: 5, holes: [{ top: 9000, bottom: 12000, id: 3 }] }, 3000, 'rih');
    expect(b.topForce).toBeCloseTo(a.topForce, 6);
  });
});

describe('limits and the full calculation', () => {
  it('a vertical well is reached to TD and the overpull is the tension limit less the weight', () => {
    const result = calculateForces(base);
    expect(result.reach.toTd).toBe(true);
    expect(result.buckleOnset).toBeNull();
    const w = buoyedWeight(OD, WALL, 0.2, 8.35);
    expect(result.maxOverpull).toBeCloseTo(tensionLimit(base) - w * 10000, -1);
    expect(maxOverpull(base, 100000 > 0 ? 10000 : 0)).toBeCloseTo(result.maxOverpull, 0);
  });

  it('the tension limit is the design factor on the yield force of the top section', () => {
    const area = (Math.PI / 4) * (OD ** 2 - (OD - 2 * WALL) ** 2);
    expect(tensionLimit(base)).toBeCloseTo(0.8 * 80000 * area, 6);
  });

  it('a lower friction coefficient reaches further', () => {
    const rough = reach({ ...base, stations: horizontal, cf: 0.4 }).depth;
    const smooth = reach({ ...base, stations: horizontal, cf: 0.2 }).depth;
    expect(smooth).toBeGreaterThan(rough);
  });

  it('a lighter fluid inside the CT extends the reach in a build-and-hold well', () => {
    const stations = [
      { md: 0, inclination: 0, azimuth: 0 },
      { md: 2000, inclination: 0, azimuth: 0 },
      { md: 3500, inclination: 60, azimuth: 0 },
      { md: 12000, inclination: 60, azimuth: 0 },
    ];
    const heavy = reach({ ...base, stations, rhoIn: 8.35 }).depth;
    const light = reach({ ...base, stations, rhoIn: 2.0 }).depth;
    expect(light).toBeGreaterThanOrEqual(heavy);
  });

  it('refuses unusable input', () => {
    expect(validateForces(base)).toEqual([]);
    expect(validateForces({ ...base, holeId: 1.5 })).toContain('holeId');
    expect(validateForces({ ...base, cf: 0 })).toContain('cf');
    expect(validateForces({ ...base, sections: [] })).toContain('sections');
    expect(validateForces({ ...base, sections: [{ length: 100, wall: 1 }] })).toContain('sections');
    expect(validateForces({ ...base, stations: [] })).toContain('stations');
  });
});

describe('force in metric units', () => {
  it('is shown in tonnes-force: 2204.62 lbf is one tonne', async () => {
    const { UNITS, fromUs, toUs } = await import('../lib/tools/units');
    expect(UNITS.force.label.metric).toBe('t');
    expect(fromUs('force', 'metric', 2204.62262)).toBeCloseTo(1, 5);
    expect(toUs('force', 'metric', 5)).toBeCloseTo(11023.1131, 3);
  });
});
