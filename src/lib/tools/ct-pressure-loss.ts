/**
 * Frictional pressure loss of a power-law fluid in coiled tubing.
 *
 * The string is split into the part off the reel (straight) and the part on the
 * reel (curved), each with its own friction factor, and the losses are added.
 *
 * - Reynolds number: Metzner–Reed generalised Reynolds number for power-law
 *   fluids.
 * - Straight tubing: laminar f = 16/Re, turbulent f = a/Re^b (Dodge–Metzner
 *   factors a and b), with the transition between Re = 3470 − 1370n and
 *   4270 − 1370n.
 * - Coiled tubing: the laminar factor is raised by ψ·De^φ with the Dean number
 *   De, the turbulent factor by 1.069·(ID/D)^0.1 and a flatter slope (0.8b),
 *   and the critical Reynolds number depends on ID/D and n (Zhou and Shah).
 * - In a transition region the loss is interpolated linearly in Re between the
 *   laminar loss at the lower limit and the turbulent loss at the upper limit,
 *   each taken at the flow rate that gives that Reynolds number.
 *
 * - Roughness: turbulent friction factors are multiplied by the ratio of the
 *   Haaland friction factor with the wall roughness to the one without it, so a
 *   roughness of zero gives the smooth-tube result unchanged. Laminar flow does
 *   not depend on roughness. For n other than 1 this extends a Newtonian
 *   correction by the generalised Reynolds number; treat it as an estimate.
 *
 * All quantities are in oilfield units: density in lb/gal, K in
 * lbf·s^n/100 ft², lengths in ft, diameters in inches, flow rate in gal/min,
 * pressure in psi, velocity in ft/min. `units.ts` converts to and from metric.
 *
 * Source of the check values in the tests: a reference worksheet for the same
 * method. Its curved-transition cells combine a laminar value without the
 * curvature factor, a turbulent value with (ID·D)^0.1 instead of (ID/D)^0.1 and
 * the straight-tubing limits in the interpolation, so that range is computed
 * here from the definitions above and not from the worksheet.
 */

export interface CtInput {
  /** Fluid density, lb/gal. */
  density: number;
  /** Power-law flow behaviour index n. */
  n: number;
  /** Power-law consistency index K, lbf·s^n/100 ft². */
  k: number;
  /** Diameter of the reel (the coil the tubing is wound on), in. */
  reelDiameter: number;
  /** Tubing outside diameter, in. */
  od: number;
  /** Tubing wall thickness, in. */
  wall: number;
  /** Total string length, ft. */
  totalLength: number;
  /** Length of tubing off the reel (straight), ft. */
  lengthOffReel: number;
  /** Flow rate, gal/min. */
  flowRate: number;
  /** Absolute roughness of the inside wall, in. Omitted or 0 for smooth tubing. */
  roughness?: number;
}

export type Regime = 'laminar' | 'transitional' | 'turbulent';

export interface CtSection {
  regime: Regime;
  /** Length of the section, ft. */
  length: number;
  /** Friction pressure loss over the section, psi. */
  pressureLoss: number;
  /** Fanning friction factor, where the flow is laminar or turbulent. */
  frictionFactor: number | null;
  /** Laminar limit and turbulent limit of the Reynolds number. */
  laminarLimit: number;
  turbulentLimit: number;
}

export interface CtResult {
  /** Inside diameter, in. */
  id: number;
  /** Flow area, in². */
  area: number;
  /** Mean velocity, ft/min. */
  velocity: number;
  /** Metzner–Reed generalised Reynolds number. */
  reynolds: number;
  /** Generalised Reynolds number on K rather than K′. */
  reynoldsGeneralised: number;
  /** Dean number. */
  dean: number;
  straight: CtSection;
  curved: CtSection;
  /** Total friction pressure loss, psi. */
  total: number;
}

export type CtError =
  | 'density'
  | 'n'
  | 'k'
  | 'reelDiameter'
  | 'od'
  | 'wall'
  | 'totalLength'
  | 'lengthOffReel'
  | 'flowRate'
  | 'roughness';

/** Fields that are not usable, empty when the input can be calculated. */
export function validateCtInput(input: CtInput): CtError[] {
  const errors: CtError[] = [];
  const positive = (key: CtError, value: number) => {
    if (!Number.isFinite(value) || value <= 0) errors.push(key);
  };
  positive('density', input.density);
  if (!Number.isFinite(input.n) || input.n <= 0 || input.n > 1.5) errors.push('n');
  positive('k', input.k);
  positive('reelDiameter', input.reelDiameter);
  positive('od', input.od);
  if (!Number.isFinite(input.wall) || input.wall <= 0 || 2 * input.wall >= input.od) errors.push('wall');
  positive('totalLength', input.totalLength);
  if (!Number.isFinite(input.lengthOffReel) || input.lengthOffReel < 0 || input.lengthOffReel > input.totalLength) {
    errors.push('lengthOffReel');
  }
  positive('flowRate', input.flowRate);
  const roughness = input.roughness ?? 0;
  if (!Number.isFinite(roughness) || roughness < 0 || (!errors.includes('od') && !errors.includes('wall') && roughness >= (input.od - 2 * input.wall) / 2)) {
    errors.push('roughness');
  }
  if (!errors.includes('od') && !errors.includes('wall') && input.reelDiameter <= input.od - 2 * input.wall) {
    errors.push('reelDiameter');
  }
  return errors;
}

/** Constant of the pressure formula in the units above (psi, lb/gal, gal/min, in, ft). */
const PRESSURE_CONSTANT = 154.63;

export function calculateCtPressureLoss(input: CtInput): CtResult {
  const { density: rho, n, k, reelDiameter: D, od, wall, totalLength, lengthOffReel, flowRate: Q } = input;
  const roughness = input.roughness ?? 0;
  const id = od - 2 * wall;
  const area = (Math.PI * id * id) / 4;
  const ratio = id / D;

  // Reynolds number as a function of flow rate: Re = reynoldsPerRate · Q^(2−n).
  const reynoldsPerRate =
    ((31.042 * rho) / (Math.pow(9.804, n) * k * Math.pow(id, 4 - 3 * n))) * Math.pow(n / (1 + 3 * n), n);
  const reynoldsAt = (q: number) => reynoldsPerRate * Math.pow(q, 2 - n);
  /** Flow rate that gives a Reynolds number. */
  const rateAt = (re: number) => Math.pow(re / reynoldsPerRate, 1 / (2 - n));
  const mrFactor = Math.pow((4 * n) / (3 * n + 1), n);
  const deanAt = (q: number) => (reynoldsAt(q) / mrFactor) * Math.sqrt(ratio);

  const loss = (f: number, length: number, q: number) =>
    (f * length * rho * q * q) / (PRESSURE_CONSTANT * Math.pow(id, 5));

  // Dodge–Metzner factors for turbulent flow.
  const a = (Math.log10(n) + 3.93) / 50;
  const b = (1.75 - Math.log10(n)) / 7;
  // Coiled-tubing curvature parameters.
  const psi = 47.969 - 153.8 * n + 166.22 * n * n - 60.132 * n ** 3;
  const phi = 0.875 * n - 0.515;

  // Wall roughness raises the turbulent factor by the Haaland rough/smooth ratio at the same Re.
  const haaland = (re_: number, relRoughness: number) =>
    Math.pow(-1.8 * Math.log10(Math.pow(relRoughness / 3.7, 1.11) + 6.9 / re_), -2);
  const roughnessFactor = (re_: number) => (roughness > 0 ? haaland(re_, roughness / id) / haaland(re_, 0) : 1);

  const re = reynoldsAt(Q);
  const dean = deanAt(Q);

  // Straight tubing.
  const sLow = 3470 - 1370 * n;
  const sHigh = 4270 - 1370 * n;
  const straightLaminar = (q: number, re_: number, length: number) => loss(16 / re_, length, q);
  const straightTurbulent = (q: number, re_: number, length: number) => loss((a / Math.pow(re_, b)) * roughnessFactor(re_), length, q);
  const straightLength = lengthOffReel;
  let straight: CtSection;
  if (re < sLow) {
    straight = {
      regime: 'laminar',
      length: straightLength,
      pressureLoss: straightLaminar(Q, re, straightLength),
      frictionFactor: 16 / re,
      laminarLimit: sLow,
      turbulentLimit: sHigh,
    };
  } else if (re > sHigh) {
    straight = {
      regime: 'turbulent',
      length: straightLength,
      pressureLoss: straightTurbulent(Q, re, straightLength),
      frictionFactor: (a / Math.pow(re, b)) * roughnessFactor(re),
      laminarLimit: sLow,
      turbulentLimit: sHigh,
    };
  } else {
    const lo = straightLaminar(rateAt(sLow), sLow, straightLength);
    const hi = straightTurbulent(rateAt(sHigh), sHigh, straightLength);
    straight = {
      regime: 'transitional',
      length: straightLength,
      pressureLoss: lo + ((re - sLow) * (hi - lo)) / (sHigh - sLow),
      frictionFactor: null,
      laminarLimit: sLow,
      turbulentLimit: sHigh,
    };
  }

  // Coiled tubing on the reel.
  const cLow = mrFactor * Math.pow(2100 * psi * Math.pow(ratio, 0.5 * phi), 1 / (1 - phi));
  const cHigh = cLow + 800;
  const curvedLength = totalLength - lengthOffReel;
  const curvedLaminar = (q: number, re_: number) => loss((psi * Math.pow(deanAt(q), phi) * 16) / re_, curvedLength, q);
  const curvedTurbulentFactor = (re_: number) => ((1.069 * a * Math.pow(ratio, 0.1)) / Math.pow(re_, 0.8 * b)) * roughnessFactor(re_);
  let curved: CtSection;
  if (re < cLow) {
    curved = {
      regime: 'laminar',
      length: curvedLength,
      pressureLoss: curvedLaminar(Q, re),
      frictionFactor: (psi * Math.pow(dean, phi) * 16) / re,
      laminarLimit: cLow,
      turbulentLimit: cHigh,
    };
  } else if (re > cHigh) {
    curved = {
      regime: 'turbulent',
      length: curvedLength,
      pressureLoss: loss(curvedTurbulentFactor(re), curvedLength, Q),
      frictionFactor: curvedTurbulentFactor(re),
      laminarLimit: cLow,
      turbulentLimit: cHigh,
    };
  } else {
    const lo = curvedLaminar(rateAt(cLow), cLow);
    const hi = loss(curvedTurbulentFactor(cHigh), curvedLength, rateAt(cHigh));
    curved = {
      regime: 'transitional',
      length: curvedLength,
      pressureLoss: lo + ((re - cLow) * (hi - lo)) / (cHigh - cLow),
      frictionFactor: null,
      laminarLimit: cLow,
      turbulentLimit: cHigh,
    };
  }

  return {
    id,
    area,
    velocity: (Q * 0.1337 * 144) / area,
    reynolds: re,
    reynoldsGeneralised: re / mrFactor,
    dean,
    straight,
    curved,
    total: straight.pressureLoss + curved.pressureLoss,
  };
}
