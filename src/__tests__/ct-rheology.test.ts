import { describe, expect, it } from "vitest";
import {
  equivalentPowerLaw,
  fitFann,
  interpolateByTemperature,
  stressFunction,
  FANN_RPM,
} from "../lib/tools/ct-rheology";
import { calculateCtPressureLoss } from "../lib/tools/ct-pressure-loss";

/** Dial readings of a Bingham fluid with PV in cP and τ₀ in lbf/100 ft². */
const binghamReadings = (pv: number, tau0: number) =>
  FANN_RPM.map((rpm) => tau0 / 1.0678 + (pv * rpm) / 300);

describe("equivalent power law", () => {
  it("returns a power-law fluid unchanged", () => {
    const f = stressFunction("powerLaw", { n: 0.78, k: 0.836 })!;
    const e = equivalentPowerLaw(f, 800);
    expect(e.n).toBeCloseTo(0.78, 8);
    expect(e.k).toBeCloseTo(0.836, 8);
  });

  it("returns a Newtonian fluid as n = 1", () => {
    const f = stressFunction("newtonian", { pv: 1 })!;
    const e = equivalentPowerLaw(f, 1500);
    expect(e.n).toBeCloseTo(1, 8);
    expect(e.k).toBeCloseTo(0.00208855, 7);
  });

  it("a Bingham fluid is shear-thinning and approaches Newtonian at high shear", () => {
    const f = stressFunction("bingham", { pv: 25.5, yp: 15 })!;
    const low = equivalentPowerLaw(f, 200);
    const high = equivalentPowerLaw(f, 20000);
    expect(low.n).toBeLessThan(high.n);
    expect(high.n).toBeGreaterThan(0.9);
    expect(low.n).toBeLessThan(0.6);
  });

  it("gives the same wall stress as the model", () => {
    const f = stressFunction("herschelBulkley", { yp: 3, n: 0.6, k: 0.5 })!;
    const e = equivalentPowerLaw(f, 600);
    const kPrime = e.k * Math.pow((3 * e.n + 1) / (4 * e.n), e.n);
    expect(kPrime * Math.pow(600, e.n)).toBeCloseTo(e.wallStress, 8);
  });
});

describe("fits to Fann readings", () => {
  it("recovers PV and YP of a Bingham fluid", () => {
    const fit = fitFann("bingham", binghamReadings(25.5, 15.14))!;
    expect(fit.params.pv).toBeCloseTo(25.5, 6);
    expect(fit.params.yp).toBeCloseTo(15.14, 4);
    expect(fit.deviation).toBeLessThan(0.1);
  });

  it("recovers n and K of a power-law fluid", () => {
    const k = 0.4;
    const n = 0.7;
    const readings = FANN_RPM.map(
      (rpm) => (k * Math.pow(1.7023 * rpm, n)) / 1.0678,
    );
    const fit = fitFann("powerLaw", readings)!;
    expect(fit.params.n).toBeCloseTo(n, 6);
    expect(fit.params.k).toBeCloseTo(k, 6);
    expect(fit.deviation).toBeLessThan(1e-6);
  });

  it("a Bingham fluid fits a Herschel–Bulkley model better than a power law", () => {
    const readings = binghamReadings(25.5, 15.14);
    const pl = fitFann("powerLaw", readings)!;
    const hb = fitFann("herschelBulkley", readings)!;
    expect(hb.deviation).toBeLessThan(pl.deviation);
  });

  it("the empirical model reproduces the measured points", () => {
    const readings = binghamReadings(25.5, 15.14);
    const f = stressFunction("empirical", { readings })!;
    expect(f(1.7023 * 300)).toBeCloseTo(1.0678 * readings[1], 8);
    expect(fitFann("empirical", readings)!.deviation).toBeLessThan(1e-8);
  });

  it("refuses readings that cannot support the fit", () => {
    expect(
      fitFann(
        "bingham",
        FANN_RPM.map(() => NaN),
      ),
    ).toBeNull();
    expect(
      stressFunction("empirical", {
        readings: [10, 5, ...Array(10).fill(NaN)],
      }),
    ).toBeNull();
  });
});

describe("temperature table", () => {
  const rows = [
    { temperature: 20, pv: 30, yp: 10 },
    { temperature: 60, pv: 20, yp: 6 },
  ];
  it("interpolates linearly and holds the end values", () => {
    expect(interpolateByTemperature(rows, 40)).toEqual({ pv: 25, yp: 8 });
    expect(interpolateByTemperature(rows, 5)).toEqual({ pv: 30, yp: 10 });
    expect(interpolateByTemperature(rows, 90)).toEqual({ pv: 20, yp: 6 });
  });
  it("a single row is a constant and none gives null", () => {
    expect(interpolateByTemperature([rows[0]], 99)).toEqual({ pv: 30, yp: 10 });
    expect(interpolateByTemperature([], 40)).toBeNull();
  });
});

describe("pressure loss with a non-power-law fluid", () => {
  const geometry = {
    reelDiameter: 83,
    od: 1.5,
    wall: 0.095,
    totalLength: 10220,
    lengthOffReel: 2690,
    flowRate: 31,
    density: 15.77,
  };
  const lossFor = (f: (g: number) => number) => {
    const area = (Math.PI * 1.31 * 1.31) / 4;
    const v = (31 * 0.1337 * 144) / area / 60;
    const e = equivalentPowerLaw(f, (8 * v) / (1.31 / 12));
    return calculateCtPressureLoss({ ...geometry, n: e.n, k: e.k }).total;
  };
  it("a yield stress raises the loss over the same fluid without one", () => {
    const plain = lossFor(stressFunction("newtonian", { pv: 25.5 })!);
    const withYield = lossFor(stressFunction("bingham", { pv: 25.5, yp: 15 })!);
    expect(withYield).toBeGreaterThan(plain);
  });
});
