import { describe, expect, it } from 'vitest';
import {
  calculateDrill,
  calculateWorkover,
  hydrostatic,
  validateDrill,
  validateWorkover,
  type DrillInput,
  type WorkoverInput,
} from '../lib/tools/well-kill';
import { fromUs, toUs } from '../lib/tools/units';

const drill: DrillInput = {
  tvd: 2500,
  mud: 1200,
  sidpp: 20,
  scr: 35,
  spm: 30,
  pump: 15,
  stringVolume: 20,
  annulusVolume: 60,
  shoeTvd: 1800,
  leakoff: 1700,
};

const workover: WorkoverInput = {
  tvd: 2300,
  md: 2400,
  density: 1000,
  sitp: 60,
  margin: 10,
  inject: 20,
  fracture: 450,
  tubingId: 62,
  tubingOd: 73,
  casingId: 160,
  rate: 300,
};

describe('kill sheet', () => {
  it('matches the oilfield rule of thumb: 10 ppg, 500 psi SIDPP, 10 000 ft gives about 10.96 ppg', () => {
    const r = calculateDrill({
      ...drill,
      tvd: fromUs('length', 'metric', 10000),
      mud: fromUs('density', 'metric', 10),
      sidpp: fromUs('pressure', 'metric', 500),
      shoeTvd: fromUs('length', 'metric', 8000),
      leakoff: fromUs('density', 'metric', 15),
    });
    expect(toUs('density', 'metric', r.killMud)).toBeCloseTo(10.96, 1);
  });

  const r = calculateDrill(drill);

  it('kill mud, ICP and FCP', () => {
    expect(r.killMud).toBeCloseTo(1200 + (20e5 / (9.80665 * 2500)), 6);
    expect(r.icp).toBeCloseTo(55, 9);
    expect(r.fcp).toBeCloseTo((35 * r.killMud) / 1200, 9);
    expect(r.fcp).toBeGreaterThan(35);
  });

  it('strokes and times', () => {
    expect(r.strokesToBit).toBeCloseTo(20 / 0.015, 6);
    expect(r.strokesToSurface).toBeCloseTo(60 / 0.015, 6);
    expect(r.timeToBit).toBeCloseTo(r.strokesToBit / 30, 9);
    expect(r.totalStrokes.waitWeight).toBeCloseTo(r.strokesToBit + r.strokesToSurface, 6);
    // The driller's method circulates the annulus once with the old mud and once with the kill mud.
    expect(r.totalStrokes.drillers).toBeCloseTo(r.strokesToBit + 2 * r.strokesToSurface, 6);
  });

  it('the schedule runs from ICP to FCP over the strokes to the bit', () => {
    expect(r.schedule).toHaveLength(11);
    expect(r.schedule[0]).toMatchObject({ strokes: 0, pressure: r.icp });
    expect(r.schedule[10].pressure).toBeCloseTo(r.fcp, 9);
    expect(r.schedule[10].strokes).toBeCloseTo(r.strokesToBit, 9);
    expect(r.schedule[5].pressure).toBeCloseTo((r.icp + r.fcp) / 2, 9);
  });

  it('MAASP is the leak-off density margin over the mud at the shoe', () => {
    expect(r.maasp).toBeCloseTo(hydrostatic(500, 1800), 9);
  });

  it('refuses unusable input', () => {
    expect(validateDrill(drill)).toEqual([]);
    expect(validateDrill({ ...drill, shoeTvd: 3000 })).toContain('shoeTvd');
    expect(validateDrill({ ...drill, leakoff: 1100 })).toContain('leakoff');
    expect(validateDrill({ ...drill, pump: 0 })).toContain('pump');
    expect(validateDrill({ ...drill, sidpp: NaN })).toContain('sidpp');
  });
});

describe('producing well kill', () => {
  const r = calculateWorkover(workover);

  it('formation pressure and kill fluid', () => {
    expect(r.formationPressure).toBeCloseTo(60 + hydrostatic(1000, 2300), 9);
    expect(hydrostatic(r.killDensity, 2300)).toBeCloseTo(r.formationPressure + 10, 9);
    expect(r.hydrostatic).toBeCloseTo(r.formationPressure + 10, 9);
    expect(r.densityIncrease).toBeCloseTo(r.killDensity - 1000, 9);
  });

  it('volumes and times', () => {
    expect(r.tubingVolume).toBeCloseTo((Math.PI * 0.062 ** 2) / 4 * 2400, 9);
    expect(r.annulusVolume).toBeCloseTo(((Math.PI * (0.16 ** 2 - 0.073 ** 2)) / 4) * 2400, 9);
    expect(r.tubingTime).toBeCloseTo((r.tubingVolume * 1000) / 300, 9);
    expect(r.circulationTime).toBeCloseTo((r.circulationVolume * 1000) / 300, 9);
  });

  it('bullheading pressure falls as the kill fluid goes in, and the fracture margin is reported', () => {
    expect(r.startPressure).toBeCloseTo(60 + 20, 9);
    expect(r.endPressure).toBeCloseTo(20 - 10, 9);
    expect(r.injectionPressure).toBeCloseTo(r.formationPressure + 20, 9);
    expect(r.fractureMargin).toBeCloseTo(450 - r.injectionPressure, 9);
  });

  it('the well is dead at surface when the kill fluid outweighs the injection pressure', () => {
    expect(calculateWorkover({ ...workover, margin: 40 }).endPressure).toBe(0);
  });

  it('leaves the fracture check out when no fracture pressure is given', () => {
    expect(calculateWorkover({ ...workover, fracture: 0 }).fractureMargin).toBeNull();
  });

  it('refuses unusable input', () => {
    expect(validateWorkover(workover)).toEqual([]);
    expect(validateWorkover({ ...workover, tubingId: 80 })).toContain('tubingId');
    expect(validateWorkover({ ...workover, casingId: 70 })).toContain('casingId');
    expect(validateWorkover({ ...workover, tvd: 0 })).toContain('tvd');
    expect(validateWorkover({ ...workover, sitp: -1 })).toContain('sitp');
  });
});
