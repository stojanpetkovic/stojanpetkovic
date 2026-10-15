/**
 * Strength limits of a coiled tubing string: stresses, burst, collapse and
 * tension limits for a given tubing size, material and load.
 *
 * - Axial stress: force over steel area, with the bending stress E·OD/(2R) from
 *   a bend of radius R added on the convex or concave side, whichever is larger.
 * - Pressure stresses at the inside wall from the Lamé equations for a thick
 *   cylinder (hoop and radial), combined with the axial stress into the von
 *   Mises equivalent stress. Torque is not included.
 * - Burst: API 5C3 internal yield, the capped-end yield from the von Mises
 *   criterion at the inside wall, and the pressure at which the wall fully
 *   plasticises.
 * - Collapse: Timoshenko round and oval, API 5C3 round (with the axial stress
 *   reducing the yield strength) and API RP 5C7 oval, which with tension is
 *   reduced by a correction factor.
 * - Tension limits: yield factor times yield strength times steel area, and the
 *   largest tension that keeps the von Mises stress at the yield factor with the
 *   given pressures.
 *
 * All quantities are in oilfield units: inches, psi, lbf, ft. `units.ts`
 * converts to and from metric. The check values in the tests are those of a
 * reference worksheet for the same method.
 */

export interface StrengthInput {
  /** Tubing outside diameter, in. */
  od: number;
  /** Wall thickness, in. */
  wall: number;
  /** Ovality, (ODmax − ODmin)/OD. */
  ovality: number;
  /** Minimum yield strength, psi. */
  yieldStress: number;
  /** Yield factor (design factor on the yield strength), %. */
  yieldFactor: number;
  /** Young's modulus, psi. */
  modulus: number;
  /** Poisson's ratio. */
  poisson: number;
  /** Internal pressure, psi. */
  pressureIn: number;
  /** External pressure, psi. */
  pressureOut: number;
  /** Axial force, lbf, positive in tension. */
  axialForce: number;
  /** Radius of the bend the tubing is bent over, ft. 0 for straight tubing. */
  bendingRadius: number;
  /** Safety factor of the 5C7 collapse correction, at least 1. */
  safetyFactor: number;
}

export type StrengthError = keyof StrengthInput;

export interface StrengthResult {
  id: number;
  /** Steel cross-section area, in². */
  area: number;
  /** OD/wall. */
  slenderness: number;
  stress: {
    axial: number;
    bending: number;
    axialMax: number;
    hoop: number;
    radial: number;
    vonMises: number;
    /** Von Mises stress as a percentage of the yield strength. */
    vonMisesPercent: number;
    /** True while the von Mises stress is below the yield factor. */
    withinYieldFactor: boolean;
  };
  burst: { api: number; cappedEnd: number; trueBurst: number };
  collapse: {
    timoshenkoRound: number;
    api5c3: number;
    api5c7Oval: number;
    timoshenkoOval: number;
    /** 5C7 collapse reduced for tension; null when the tubing is not in tension. */
    api5c7WithTension: number | null;
  };
  tension: { max: number; maxAtPressure: number };
  /** External minus internal pressure, psi; positive means collapse loading. */
  differentialPressure: number;
}

export function validateStrengthInput(input: StrengthInput): StrengthError[] {
  const errors: StrengthError[] = [];
  const positive = (key: StrengthError) => {
    if (!Number.isFinite(input[key]) || input[key] <= 0) errors.push(key);
  };
  const nonNegative = (key: StrengthError) => {
    if (!Number.isFinite(input[key]) || input[key] < 0) errors.push(key);
  };
  positive('od');
  positive('wall');
  if (!errors.includes('od') && !errors.includes('wall') && 2 * input.wall >= input.od) errors.push('wall');
  if (!Number.isFinite(input.ovality) || input.ovality < 0 || input.ovality >= 0.5) errors.push('ovality');
  positive('yieldStress');
  if (!Number.isFinite(input.yieldFactor) || input.yieldFactor <= 0 || input.yieldFactor > 100) {
    errors.push('yieldFactor');
  }
  positive('modulus');
  if (!Number.isFinite(input.poisson) || input.poisson <= 0 || input.poisson >= 0.5) errors.push('poisson');
  nonNegative('pressureIn');
  nonNegative('pressureOut');
  if (!Number.isFinite(input.axialForce)) errors.push('axialForce');
  nonNegative('bendingRadius');
  if (!Number.isFinite(input.safetyFactor) || input.safetyFactor < 1) errors.push('safetyFactor');
  return errors;
}

/** API 5C3 / 5C7 collapse by slenderness range, for a yield strength `y`. */
function apiCollapse(slenderness: number, y: number) {
  const a = 2.8762 + 0.10679e-5 * y + 0.21301e-10 * y ** 2 - 0.53132e-16 * y ** 3;
  const b = 0.026233 + 0.50609e-6 * y;
  const c = -465.93 + 0.030867 * y - 0.10483e-7 * y ** 2 + 0.36989e-13 * y ** 3;
  const k = (3 * (b / a)) / (2 + b / a);
  const f = (4.695e7 * k ** 3) / (y * (k - b / a) * (1 - k) ** 2);
  const g = (f * b) / a;
  const yieldToPlastic = (Math.sqrt((a - 2) ** 2 + 8 * (b + c / y)) + (a - 2)) / (2 * (b + c / y));
  const plasticToTransition = (y * (a - f)) / (c + y * (b - g));
  const transitionToElastic = (2 + b / a) / ((3 * b) / a);
  if (slenderness < yieldToPlastic) return (2 * y * (slenderness - 1)) / slenderness ** 2;
  if (slenderness < plasticToTransition) return y * (a / slenderness - b) - c;
  if (slenderness < transitionToElastic) return y * (f / slenderness - g);
  return 46.95e6 / (slenderness * (slenderness - 1) ** 2);
}

export function calculateStrength(input: StrengthInput): StrengthResult {
  const { od, wall, ovality, yieldStress: y, yieldFactor, modulus: e, poisson: nu } = input;
  const { pressureIn: pi, pressureOut: po, axialForce, bendingRadius, safetyFactor } = input;
  const id = od - 2 * wall;
  const area = (Math.PI / 4) * (od ** 2 - id ** 2);
  const dt = od / wall;
  const ri2 = (id / 2) ** 2;
  const ro2 = (od / 2) ** 2;

  // Stresses.
  const axial = axialForce / area;
  const bending = bendingRadius > 0 ? (e * od) / (2 * 12 * bendingRadius) : 0;
  const concave = axial - bending;
  const convex = axial + bending;
  const axialMax = Math.abs(concave) > Math.abs(convex) ? concave : convex;
  const lame = (pi * ri2 - po * ro2) / (ro2 - ri2);
  const wallTerm = (ri2 * ro2 * (po - pi)) / ((ro2 - ri2) * ri2);
  const hoop = -wallTerm + lame;
  const radial = wallTerm + lame;
  const vonMises = Math.sqrt(
    axialMax ** 2 + hoop ** 2 + radial ** 2 - axialMax * hoop - axialMax * radial - hoop * radial
  );
  const vonMisesPercent = (100 * vonMises) / y;

  // Burst.
  const burst = {
    api: (0.875 * y * 2) / dt,
    cappedEnd: ((4 * y) / Math.sqrt(3)) * (1 / dt) * (1 - 1 / dt),
    trueBurst: ((2 * y) / Math.sqrt(3)) * Math.log(1 / (1 - 2 / dt)),
  };

  // Collapse.
  const timoshenko = (oval: number) => {
    const s = axialMax / (2 * y);
    const reduction = Math.sqrt(Math.max(0, 1 - 3 * s * s)) - s;
    const py = (y * 2) / dt;
    const pe = ((2 * e) / (1 - nu ** 2)) * (1 / dt) ** 3;
    const m = py * reduction + pe * (1 + (3 * oval * od) / (2 * wall));
    return (m - Math.sqrt(Math.max(0, m * m - 4 * py * pe * reduction))) / 2;
  };
  const ratioTerm = axialMax / y;
  const reducedYield = y * (Math.sqrt(Math.max(0, 1 - 0.75 * ratioTerm ** 2)) - 0.5 * ratioTerm);
  const api5c3 = Math.max(0, apiCollapse(dt, reducedYield));
  const pc5c7 = apiCollapse(dt, y);
  const odMin = od * Math.sqrt((2 - ovality) / (2 + ovality));
  const odMax = od ** 2 / odMin;
  const gCt = y / (dt - 1) + (pc5c7 / 4) * (2 + ((3 * (odMax - odMin)) / od) * dt);
  const fCt = (2 * y * pc5c7) / (dt - 1);
  const api5c7Oval = gCt - Math.sqrt(Math.max(0, gCt ** 2 - fCt));

  // Tension.
  const maxTension = (yieldFactor * y * area) / 100;
  const sum = hoop + radial;
  const allowed = (yieldFactor * y) / 100;
  const discriminant = sum ** 2 + 4 * (allowed ** 2 - (hoop ** 2 + radial ** 2) + hoop * radial);
  const maxAtPressure = discriminant >= 0 ? (area * (sum + Math.sqrt(discriminant))) / 2 : 0;

  let withTension: number | null = null;
  if (axialForce > 0) {
    const base = (1 / safetyFactor) ** (4 / 3) - (axialForce / maxTension) ** (4 / 3);
    withTension = (base > 0 ? base ** 0.75 : 0) * api5c7Oval;
  }

  return {
    id,
    area,
    slenderness: dt,
    stress: {
      axial,
      bending,
      axialMax,
      hoop,
      radial,
      vonMises,
      vonMisesPercent,
      withinYieldFactor: vonMisesPercent < yieldFactor,
    },
    burst,
    collapse: {
      timoshenkoRound: timoshenko(0),
      api5c3,
      api5c7Oval,
      timoshenkoOval: timoshenko(ovality),
      api5c7WithTension: withTension,
    },
    tension: { max: maxTension, maxAtPressure },
    differentialPressure: po - pi,
  };
}
