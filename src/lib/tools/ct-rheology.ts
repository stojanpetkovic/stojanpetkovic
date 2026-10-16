/**
 * Rheology models for the CT pressure-loss tool.
 *
 * The friction calculation in `ct-pressure-loss.ts` works with a power-law
 * fluid (n, K). Every other model is reduced to that form at the flow in
 * question: the model gives the wall shear stress at a wall shear rate, and the
 * equivalent power-law pair (n′, K) is the one with the same stress and the same
 * slope on the log–log flow curve at that shear rate. A power-law fluid
 * returns its own n and K unchanged; for the others the pair depends on the
 * flow rate, which is why it is resolved per calculation.
 *
 * Units are oilfield units throughout: shear rate in 1/s, shear stress in
 * lbf/100 ft², viscosity in cP, K in lbf·sⁿ/100 ft². Fann dial readings θ at N
 * rpm correspond to γ = 1.7023·N and τ = 1.0678·θ.
 */

export type RheologyModel =
  | "newtonian"
  | "bingham"
  | "powerLaw"
  | "herschelBulkley"
  | "empirical";

export const RHEOLOGY_MODELS: RheologyModel[] = [
  "newtonian",
  "bingham",
  "powerLaw",
  "herschelBulkley",
  "empirical",
];

/** Fann 35 speeds, rpm, in the order of the dial-reading fields. */
export const FANN_RPM = [
  600, 300, 200, 100, 60, 30, 20, 10, 6, 3, 2, 1,
] as const;

/** 1 cP in lbf·s/100 ft². */
const CP_TO_LBF = 1 / 478.802589;
const SHEAR_PER_RPM = 1.7023;
const STRESS_PER_DIAL = 1.0678;
/** 1 lbf/100 ft² in Pa, to quote the yield point the way the viscometer reports it. */
const LBF_TO_PA = 0.478802589;

export interface FluidParameters {
  /** Newtonian viscosity, or plastic viscosity of a Bingham fluid, cP. */
  pv?: number;
  /** Yield stress (Bingham yield point, Herschel–Bulkley τ₀), lbf/100 ft². */
  yp?: number;
  /** Flow behaviour index. */
  n?: number;
  /** Consistency index, lbf·sⁿ/100 ft². */
  k?: number;
  /** Fann dial readings θ in `FANN_RPM` order, NaN where blank. */
  readings?: number[];
}

export type FluidError = "pv" | "yp" | "n" | "k" | "readings";

interface Point {
  shear: number;
  stress: number;
}

/** The measured flow curve from the dial readings, sorted by shear rate. */
export function readingPoints(readings: number[]): Point[] {
  return FANN_RPM.map((rpm, i) => ({
    shear: SHEAR_PER_RPM * rpm,
    stress: STRESS_PER_DIAL * readings[i],
  }))
    .filter((p) => Number.isFinite(p.stress) && p.stress > 0)
    .sort((a, b) => a.shear - b.shear);
}

/** Wall shear stress, lbf/100 ft², at a shear rate for the model; `null` if the parameters are unusable. */
export function stressFunction(
  model: RheologyModel,
  p: FluidParameters,
): ((shear: number) => number) | null {
  const ok = (...v: (number | undefined)[]) =>
    v.every((x) => x !== undefined && Number.isFinite(x));
  switch (model) {
    case "newtonian":
      if (!ok(p.pv) || p.pv! <= 0) return null;
      return (g) => p.pv! * CP_TO_LBF * g;
    case "bingham":
      if (!ok(p.pv, p.yp) || p.pv! <= 0 || p.yp! < 0) return null;
      return (g) => p.yp! + p.pv! * CP_TO_LBF * g;
    case "powerLaw":
      if (!ok(p.n, p.k) || p.n! <= 0 || p.n! > 1.5 || p.k! <= 0) return null;
      return (g) => p.k! * Math.pow(g, p.n!);
    case "herschelBulkley":
      if (
        !ok(p.yp, p.n, p.k) ||
        p.yp! < 0 ||
        p.n! <= 0 ||
        p.n! > 1.5 ||
        p.k! <= 0
      )
        return null;
      return (g) => p.yp! + p.k! * Math.pow(g, p.n!);
    case "empirical": {
      const pts = readingPoints(p.readings ?? []);
      if (pts.length < 3) return null;
      // Piecewise power law through the measured points on log–log axes, with the end segments extended.
      return (g) => {
        let i = pts.findIndex((q) => q.shear >= g);
        if (i <= 0) i = 1;
        if (i === -1 || i >= pts.length) i = pts.length - 1;
        const a = pts[i - 1];
        const b = pts[i];
        const slope =
          Math.log(b.stress / a.stress) / Math.log(b.shear / a.shear);
        return a.stress * Math.pow(g / a.shear, slope);
      };
    }
  }
}

export interface EquivalentPowerLaw {
  /** Power-law index n′ at the wall. */
  n: number;
  /** True power-law consistency K giving the same wall stress at that n′, lbf·sⁿ/100 ft². */
  k: number;
  /** Wall shear stress, lbf/100 ft². */
  wallStress: number;
}

/**
 * Equivalent power law at a pseudo shear rate Γ = 8V/D, 1/s.
 *
 * Iterates the wall shear rate γw = Γ(3n′+1)/(4n′) with n′ the local slope of
 * the model's flow curve; for a power-law fluid the slope is n at once and the
 * loop returns it with K unchanged.
 */
export function equivalentPowerLaw(
  f: (shear: number) => number,
  pseudoShear: number,
): EquivalentPowerLaw {
  const slopeAt = (g: number) => {
    const e = 1e-3;
    return Math.log(f(g * Math.exp(e)) / f(g * Math.exp(-e))) / (2 * e);
  };
  let n = 1;
  let wall = pseudoShear * 1;
  for (let i = 0; i < 40; i++) {
    wall = (pseudoShear * (3 * n + 1)) / (4 * n);
    const next = Math.min(1.5, Math.max(0.05, slopeAt(wall)));
    if (Math.abs(next - n) < 1e-10) {
      n = next;
      break;
    }
    n = 0.5 * (n + next);
  }
  wall = (pseudoShear * (3 * n + 1)) / (4 * n);
  const stress = f(wall);
  const kPrime = stress / Math.pow(pseudoShear, n);
  return {
    n,
    k: kPrime * Math.pow((4 * n) / (3 * n + 1), n),
    wallStress: stress,
  };
}

export interface FannFit {
  params: FluidParameters;
  /** Root-mean-square relative deviation of the model from the readings, %. */
  deviation: number;
}

const regress = (xs: number[], ys: number[]) => {
  const m = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / m;
  const my = ys.reduce((a, b) => a + b, 0) / m;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < m; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
};

/**
 * Fit a model to Fann readings. Bingham plastic uses the 600 and 300 rpm
 * readings (PV = θ600 − θ300, YP = θ300 − PV); Herschel–Bulkley takes the
 * yield stress from the low-speed readings (τ₀ = 2τ₃ − τ₆) and fits n and K to
 * the rest; power law is a least-squares line on log–log axes and Newtonian a
 * least-squares line through the origin. `null` when the readings do not
 * support the fit.
 */
export function fitFann(
  model: RheologyModel,
  readings: number[],
): FannFit | null {
  const pts = readingPoints(readings);
  if (pts.length < 2) return null;
  const stressOf = (rpm: number) => {
    const i = FANN_RPM.indexOf(rpm as (typeof FANN_RPM)[number]);
    return STRESS_PER_DIAL * readings[i];
  };
  let params: FluidParameters | null = null;

  if (model === "newtonian") {
    const num = pts.reduce((s, p) => s + p.shear * p.stress, 0);
    const den = pts.reduce((s, p) => s + p.shear * p.shear, 0);
    params = { pv: num / den / CP_TO_LBF };
  } else if (model === "bingham") {
    const t600 = readings[0];
    const t300 = readings[1];
    if (!Number.isFinite(t600) || !Number.isFinite(t300)) return null;
    const pv = t600 - t300;
    params = { pv, yp: STRESS_PER_DIAL * (t300 - pv) };
    if (pv <= 0 || params.yp! < 0) return null;
  } else if (model === "powerLaw") {
    const { slope, intercept } = regress(
      pts.map((p) => Math.log(p.shear)),
      pts.map((p) => Math.log(p.stress)),
    );
    params = { n: slope, k: Math.exp(intercept) };
  } else if (model === "herschelBulkley") {
    const t3 = stressOf(3);
    const t6 = stressOf(6);
    if (!Number.isFinite(t3) || !Number.isFinite(t6)) return null;
    const yp = Math.max(0, 2 * t3 - t6);
    const rest = pts.filter((p) => p.stress > yp * 1.0001);
    if (rest.length < 2) return null;
    const { slope, intercept } = regress(
      rest.map((p) => Math.log(p.shear)),
      rest.map((p) => Math.log(p.stress - yp)),
    );
    params = { yp, n: slope, k: Math.exp(intercept) };
  } else {
    params = { readings };
  }

  const f = stressFunction(model, params);
  if (!f) return null;
  const deviation =
    Math.sqrt(
      pts.reduce((s, p) => s + ((f(p.shear) - p.stress) / p.stress) ** 2, 0) /
        pts.length,
    ) * 100;
  return { params, deviation };
}

export interface TemperaturePoint {
  temperature: number;
  pv: number;
  yp: number;
}

/**
 * PV and YP at a temperature, linearly interpolated between the entered rows
 * and held at the end values outside them. One row is a constant. `null` with
 * no usable rows.
 */
export function interpolateByTemperature(
  rows: TemperaturePoint[],
  temperature: number,
): { pv: number; yp: number } | null {
  const pts = rows
    .filter((r) => [r.temperature, r.pv, r.yp].every(Number.isFinite))
    .sort((a, b) => a.temperature - b.temperature);
  if (pts.length === 0 || !Number.isFinite(temperature)) return null;
  if (temperature <= pts[0].temperature)
    return { pv: pts[0].pv, yp: pts[0].yp };
  const last = pts[pts.length - 1];
  if (temperature >= last.temperature) return { pv: last.pv, yp: last.yp };
  const i = pts.findIndex((p) => p.temperature >= temperature);
  const a = pts[i - 1];
  const b = pts[i];
  const w = (temperature - a.temperature) / (b.temperature - a.temperature);
  return { pv: a.pv + w * (b.pv - a.pv), yp: a.yp + w * (b.yp - a.yp) };
}

/** Yield point quoted in Pa from lbf/100 ft², as the viscometer reports it. */
export const ypToPa = (lbf: number) => lbf * LBF_TO_PA;
