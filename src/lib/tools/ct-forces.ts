/**
 * Axial forces on coiled tubing running into and out of a well, and the depths
 * and forces they limit: the weight indicator (CTWI) reading for RIH and POOH,
 * the depth where the string locks up, and the largest set-down weight and
 * overpull at a depth.
 *
 * Method: the "soft string" model of the CTES coiled tubing manual (chapters 6
 * and 7). The string is divided into short segments and a force balance is
 * taken on each from the bottom up, from the force at the BHA to the force at
 * the surface. Bending moments are neglected.
 *
 * - Buoyed weight per unit length: w = w_air + (ρi·Ai − ρo·Ao)/19.25 (lb/ft,
 *   densities in ppg, areas in in²).
 * - Normal force per unit length of an unbuckled segment: the weight component
 *   across the hole and the capstan force of the curvature added as vectors,
 *   N = √[(w·sinθ − F·θ′)² + (F·φ′·sinθ)²], F positive in tension, θ′ and φ′
 *   the build and walk rates in rad/ft. A build with compression pushes the
 *   tubing onto the low side and adds to the weight; the manual's statements
 *   about curvature and buckling follow from this sign.
 * - Axial force at the top of a segment:
 *   F2 = F1 + w·cosθ·ΔL ∓ Cf·N·ΔL, minus for RIH and plus for POOH.
 * - Helical buckling (RIH, compression P = −F above the critical force): the
 *   contact force per length grows by Bn = rc·P²/(4EI), rc the radial
 *   clearance, EI the bending stiffness. The critical force is
 *   FVH = 1.94·(EI·w²)^(1/3) below 15° inclination and otherwise the root of
 *   P⁴ = (8EI/rc)²·[(w·sinθ + P·θ′)² + (P·φ′·sinθ)²], which for a straight
 *   inclined segment is FCH = 2√2·√(EI·w·sinθ/rc).
 * - The weight indicator reads the force at the top of the CT less the force
 *   of the wellhead pressure on the CT cross-section, the stripper friction
 *   (down for RIH, up for POOH) and the reel back tension.
 * - Lock-up: buckled CT drags more as the compressive force grows, so the
 *   force needed at the top grows faster than the depth. The string locks up
 *   at a depth when the integration of the force balance diverges or the
 *   injector would have to push harder than its limit.
 *
 * Oilfield units: lengths in ft, diameters in in, density in ppg, pressure in
 * psi, force in lbf, weight in lb. The bending quantities are worked in lb and
 * in. `units.ts` converts for the page.
 */
import type { Station } from './well/survey';

export interface CtSection {
  /** Length of the section, ft. */
  length: number;
  /** Wall thickness, in. */
  wall: number;
}

export interface ForcesInput {
  /** Directional survey, MD in ft. The well is vertical above the first station. */
  stations: Station[];
  /** Inside diameter of the hole or casing the CT runs in, in; used where `holes` has no entry. */
  holeId: number;
  /** Inside diameter by depth, where it changes along the well: the CT runs in the smallest tubular at each depth. */
  holes?: { top: number; bottom: number; id: number }[];
  /** CT outside diameter, in. */
  ctOd: number;
  /** CT wall sections from the BHA end of the string towards the reel. */
  sections: CtSection[];
  /** BHA length, ft. */
  bhaLength: number;
  /** BHA weight in air, lb. */
  bhaWeight: number;
  /** BHA outside diameter, in. */
  bhaOd: number;
  /** Fluid density inside the CT, ppg. */
  rhoIn: number;
  /** Fluid density outside the CT, ppg. */
  rhoOut: number;
  /** Wellhead pressure, psi. */
  whp: number;
  /** Coefficient of friction between CT and hole. */
  cf: number;
  /** Stripper friction, lbf. */
  stripperFriction: number;
  /** Reel back tension, lbf. */
  reelTension: number;
  /** Young's modulus, psi. */
  modulus: number;
  /** Yield strength, psi. */
  yieldStrength: number;
  /** Fraction of the yield force allowed in tension at the surface. */
  designFactor: number;
  /** Largest force the injector can push the CT with, lbf. */
  snubLimit: number;
  /** Take friction into the buckling threshold (eq. 7.5); otherwise the conservative frictionless one. */
  frictionInBuckling?: boolean;
  /** Segment length of the integration, ft. */
  step?: number;
}

export type ForcesError =
  | 'stations'
  | 'holeId'
  | 'ctOd'
  | 'sections'
  | 'bhaLength'
  | 'bhaWeight'
  | 'bhaOd'
  | 'rhoIn'
  | 'rhoOut'
  | 'whp'
  | 'cf'
  | 'stripperFriction'
  | 'reelTension'
  | 'modulus'
  | 'yieldStrength'
  | 'designFactor'
  | 'snubLimit';

const STEEL_LB_PER_FT3 = 490;
const rad = (deg: number) => (deg * Math.PI) / 180;

const positive = (v: number) => Number.isFinite(v) && v > 0;
const nonNegative = (v: number) => Number.isFinite(v) && v >= 0;

export function validateForces(i: ForcesInput): ForcesError[] {
  const errors: ForcesError[] = [];
  if (i.stations.length < 1) errors.push('stations');
  if (!positive(i.ctOd)) errors.push('ctOd');
  if (!positive(i.holeId) || (!errors.includes('ctOd') && i.holeId <= i.ctOd)) errors.push('holeId');
  const sectionsOk =
    i.sections.length > 0 && i.sections.every((s) => positive(s.length) && positive(s.wall) && 2 * s.wall < i.ctOd);
  if (!sectionsOk) errors.push('sections');
  if (!nonNegative(i.bhaLength)) errors.push('bhaLength');
  if (!nonNegative(i.bhaWeight)) errors.push('bhaWeight');
  if (!nonNegative(i.bhaOd) || (!errors.includes('holeId') && i.bhaOd >= i.holeId)) errors.push('bhaOd');
  if (!positive(i.rhoIn) && i.rhoIn !== 0) errors.push('rhoIn');
  if (!nonNegative(i.rhoIn)) errors.push('rhoIn');
  if (!nonNegative(i.rhoOut)) errors.push('rhoOut');
  if (!nonNegative(i.whp)) errors.push('whp');
  if (!Number.isFinite(i.cf) || i.cf <= 0 || i.cf > 1) errors.push('cf');
  if (!nonNegative(i.stripperFriction)) errors.push('stripperFriction');
  if (!nonNegative(i.reelTension)) errors.push('reelTension');
  if (!positive(i.modulus)) errors.push('modulus');
  if (!positive(i.yieldStrength)) errors.push('yieldStrength');
  if (!Number.isFinite(i.designFactor) || i.designFactor <= 0 || i.designFactor > 1) errors.push('designFactor');
  if (!positive(i.snubLimit)) errors.push('snubLimit');
  return errors;
}

// ---------------------------------------------------------------------------
// Pieces of the force balance

/** Buoyed weight per unit length of the CT, lb/ft (eq. 6.3 and 6.4). */
export function buoyedWeight(od: number, wall: number, rhoIn: number, rhoOut: number): number {
  const ao = (Math.PI * od * od) / 4;
  const ai = (Math.PI * (od - 2 * wall) ** 2) / 4;
  const air = (STEEL_LB_PER_FT3 / 144) * (ao - ai);
  return air + (rhoIn * ai - rhoOut * ao) / 19.25;
}

/** Force of the wellhead pressure on the CT cross-section, lbf (eq. 6.18). */
export const pressureAreaForce = (od: number, whp: number) => (whp * Math.PI * od * od) / 4;

/** Moment of inertia of the CT cross-section, in⁴ (eq. 6.13). */
export const momentOfInertia = (od: number, wall: number) => (Math.PI * (od ** 4 - (od - 2 * wall) ** 4)) / 64;

/** Axial force at the top of a straight segment (eq. 6.6): `sign` −1 for RIH and +1 for POOH. */
export function straightSegmentForce(f1: number, w: number, thetaDeg: number, length: number, cf: number, sign: -1 | 1) {
  const t = rad(thetaDeg);
  return f1 + w * Math.cos(t) * length + sign * cf * w * Math.sin(t) * length;
}

/** Normal force per unit length of an unbuckled segment, lbf/ft (eq. 6.8 with the sign explained above). */
export function normalForce(f: number, w: number, theta: number, buildRate: number, walkRate: number) {
  const s = Math.sin(theta);
  return Math.hypot(w * s - f * buildRate, f * walkRate * s);
}

/**
 * Critical compressive force for helical buckling, lbf (eq. 7.1, 7.3, 7.4).
 * `w` in lb/in here. θ in rad, build and walk rates in rad/in.
 */
export function criticalHelical(ei: number, w: number, theta: number, buildRate: number, walkRate: number, rc: number): number {
  if (theta < rad(15)) return 1.94 * Math.cbrt(ei * w * w);
  const a = (8 * ei) / rc;
  const s = Math.sin(theta);
  // A straight hole has the closed form of eq. 7.3.
  if (buildRate === 0 && walkRate === 0) return 2 * Math.SQRT2 * Math.sqrt((ei * w * s) / rc);
  const g = (p: number) => p ** 4 - a * a * ((w * s + p * buildRate) ** 2 + (p * walkRate * s) ** 2);
  // The first positive root: expand until the sign changes, then bisect.
  let lo = 0;
  let hi = Math.max(1, 2 * Math.SQRT2 * Math.sqrt((ei * w * s) / rc));
  for (let n = 0; n < 60 && g(hi) < 0; n++) {
    lo = hi;
    hi *= 2;
  }
  for (let n = 0; n < 45; n++) {
    const mid = (lo + hi) / 2;
    if (g(mid) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Helix period of buckled CT, in (eq. 7.6). */
export const helixPeriod = (ei: number, force: number) => 2 * Math.PI * Math.sqrt((2 * ei) / force);

/** Shortening of a buckled length by the helix, same unit as `length` (eq. 7.7). */
export function helicalShortening(length: number, rc: number, period: number) {
  return length * (Math.sqrt((2 * Math.PI * rc / period) ** 2 + 1) - 1);
}

// ---------------------------------------------------------------------------
// The well path

export class Path {
  private readonly md: number[];
  private readonly inc: number[];
  private readonly azi: number[];

  constructor(stations: readonly Station[]) {
    const list = [...stations].sort((a, b) => a.md - b.md);
    if (list[0].md > 0) list.unshift({ md: 0, inclination: 0, azimuth: list[0].azimuth });
    this.md = list.map((s) => s.md);
    this.inc = list.map((s) => rad(s.inclination));
    // Unwrap the azimuth so interpolation never goes the long way round.
    this.azi = [];
    list.forEach((s, i) => {
      let a = rad(s.azimuth);
      if (i > 0) {
        const prev = this.azi[i - 1];
        while (a - prev > Math.PI) a -= 2 * Math.PI;
        while (a - prev < -Math.PI) a += 2 * Math.PI;
      }
      this.azi.push(a);
    });
  }

  get td() {
    return this.md[this.md.length - 1];
  }

  private at(array: number[], md: number) {
    const last = this.md.length - 1;
    if (md <= this.md[0]) return array[0];
    if (md >= this.md[last]) return array[last];
    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.md[mid] <= md) lo = mid;
      else hi = mid;
    }
    const t = (md - this.md[lo]) / (this.md[hi] - this.md[lo]);
    return array[lo] + t * (array[hi] - array[lo]);
  }

  inclination = (md: number) => this.at(this.inc, md);
  azimuth = (md: number) => this.at(this.azi, md);
}

// ---------------------------------------------------------------------------
// The integration

export interface ProfilePoint {
  /** Measured depth of the top of the segment, ft. */
  md: number;
  /** Axial force at that depth, lbf, positive in tension. */
  force: number;
  /** Critical compressive force for helical buckling, lbf; `null` in the BHA. */
  critical: number | null;
  buckled: boolean;
}

export interface Trip {
  /** Axial force at the top of the CT, lbf. */
  topForce: number;
  /** Weight indicator reading, lbf; negative when the injector has to push. */
  ctwi: number;
  /** The integration ran away: the string is locked up. */
  diverged: boolean;
  /** Length of CT that is helically buckled, ft. */
  buckledLength: number;
  /** Shallowest depth of buckled CT, ft; `null` when none. */
  buckleTop: number | null;
  /** Deepest depth of buckled CT, ft; `null` when none. */
  buckleBottom: number | null;
  profile: ProfilePoint[];
}

export type Direction = 'rih' | 'pooh';

const RUNAWAY = 1e7;

/**
 * One trip: the string with its BHA bottom at `depth`, moving in or out, with
 * `bottomForce` acting at the BHA (positive in tension: an overpull; negative
 * in compression: a set-down weight).
 */
export function trip(
  input: ForcesInput,
  depth: number,
  direction: Direction,
  bottomForce = 0,
  options: { profile?: boolean; path?: Path } = {}
): Trip {
  const path = options.path ?? new Path(input.stations);
  const keep = options.profile !== false;
  const step = input.step ?? 10;
  const sign = direction === 'rih' ? -1 : 1;
  const ctBottom = depth - input.bhaLength;
  const ctOd = input.ctOd;
  const holeAt = (md: number) => {
    let id = Infinity;
    for (const h of input.holes ?? []) if (md >= h.top && md <= h.bottom && h.id < id) id = h.id;
    return Number.isFinite(id) ? id : input.holeId;
  };
  const bhaVolumeGal = (Math.PI * input.bhaOd ** 2 * 12 * input.bhaLength) / 4 / 231;
  const bhaW = input.bhaLength > 0 ? (input.bhaWeight - input.rhoOut * bhaVolumeGal) / input.bhaLength : 0;

  const wallAt = (fromBottom: number) => {
    let acc = 0;
    for (const s of input.sections) {
      acc += s.length;
      if (fromBottom <= acc) return s.wall;
    }
    return input.sections[input.sections.length - 1].wall;
  };

  let force = bottomForce;
  let diverged = false;
  let buckledLength = 0;
  let buckleTop: number | null = null;
  let buckleBottom: number | null = null;
  const profile: ProfilePoint[] = keep ? [{ md: depth, force, critical: null, buckled: false }] : [];

  for (let m1 = depth; m1 > 1e-9; ) {
    const m2 = Math.max(0, m1 - step);
    const dl = m1 - m2;
    const mid = (m1 + m2) / 2;
    const inBha = mid > ctBottom;
    const theta = path.inclination(mid);
    const buildRate = (path.inclination(m1) - path.inclination(m2)) / dl;
    const walkRate = (path.azimuth(m1) - path.azimuth(m2)) / dl;

    let w: number;
    let ei = 0;
    if (inBha) {
      w = bhaW;
    } else {
      const wall = wallAt(ctBottom - mid < 0 ? 0 : ctBottom - mid);
      w = buoyedWeight(ctOd, wall, input.rhoIn, input.rhoOut);
      ei = input.modulus * momentOfInertia(ctOd, wall);
    }

    // The force at the top of the segment, with the drag evaluated at force `f`.
    const top = (f: number) => {
      let drag = normalForce(f, w, theta, buildRate, walkRate);
      let buckled = false;
      let critical: number | null = null;
      if (!inBha && f < 0) {
        const p = -f;
        const rc = Math.max(0.01, (holeAt(mid) - ctOd) / 2);
        critical = criticalHelical(ei, w / 12, theta, buildRate / 12, walkRate / 12, rc);
        if (input.frictionInBuckling) critical *= 1 + input.cf;
        if (direction === 'rih' && p > critical) {
          buckled = true;
          drag += ((rc * p * p) / (4 * ei)) * 12;
        }
      }
      return { f: force + w * Math.cos(theta) * dl + sign * input.cf * drag * dl, buckled, critical };
    };

    // Heun: the drag at the mean of the force at the two ends of the segment.
    const first = top(force);
    const second = top((force + first.f) / 2);
    const result = second;
    if (result.buckled) {
      buckledLength += dl;
      buckleBottom = buckleBottom === null ? m1 : Math.max(buckleBottom, m1);
      buckleTop = buckleTop === null ? m2 : Math.min(buckleTop, m2);
    }
    force = result.f;
    if (keep) profile.push({ md: m2, force, critical: result.critical, buckled: result.buckled });
    m1 = m2;
    if (!Number.isFinite(force) || Math.abs(force) > RUNAWAY) {
      diverged = true;
      break;
    }
  }

  const parea = pressureAreaForce(ctOd, input.whp);
  const stripper = direction === 'rih' ? -input.stripperFriction : input.stripperFriction;
  const ctwi = diverged ? -Infinity : force - parea + stripper - input.reelTension;
  return { topForce: force, ctwi, diverged, buckledLength, buckleTop, buckleBottom, profile };
}

/** The injector would have to push harder than its limit, or the string is locked up. */
const locked = (t: Trip, input: ForcesInput) => t.diverged || -t.ctwi > input.snubLimit;

/** Largest depth the BHA can be run to without lock-up, and whether that is TD. */
export function reach(input: ForcesInput, td?: number): { depth: number; toTd: boolean } {
  const path = new Path(input.stations);
  const end = td ?? path.td;
  const stepDepth = Math.max(10, (input.step ?? 10) * 2);
  let ok = input.bhaLength;
  for (let d = Math.max(stepDepth, input.bhaLength + stepDepth); d <= end + 1e-9; d += stepDepth) {
    if (locked(trip(input, d, 'rih', 0, { profile: false, path }), input)) return { depth: ok, toTd: false };
    ok = d;
  }
  return { depth: end, toTd: true };
}

/** Largest set-down weight at the BHA at `depth`, lbf. */
export function maxSetdown(input: ForcesInput, depth: number): number {
  const path = new Path(input.stations);
  const works = (sdw: number) => !locked(trip(input, depth, 'rih', -sdw, { profile: false, path }), input);
  if (!works(0)) return 0;
  let lo = 0;
  let hi = 100;
  for (let n = 0; n < 24 && works(hi); n++) {
    lo = hi;
    hi *= 2;
  }
  if (works(hi)) return hi;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (works(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Tension limit at the surface, lbf: the design factor on the yield force of the top section. */
export function tensionLimit(input: ForcesInput): number {
  const wall = input.sections[input.sections.length - 1].wall;
  const area = (Math.PI / 4) * (input.ctOd ** 2 - (input.ctOd - 2 * wall) ** 2);
  return input.designFactor * input.yieldStrength * area;
}

/** Largest overpull at the BHA at `depth` before the CT at the surface reaches the tension limit, lbf. */
export function maxOverpull(input: ForcesInput, depth: number): number {
  const limit = tensionLimit(input);
  const path = new Path(input.stations);
  const top = (op: number) => trip(input, depth, 'pooh', op, { profile: false, path }).topForce;
  if (top(0) >= limit) return 0;
  let lo = 0;
  let hi = limit;
  for (let n = 0; n < 40; n++) {
    const mid = (lo + hi) / 2;
    if (top(mid) <= limit) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface DepthPoint {
  depth: number;
  rih: number;
  pooh: number;
  /** Limit for RIH: below it the injector pushes harder than its limit. */
  limit: number;
  buckledLength: number;
  locked: boolean;
}

/** CTWI for RIH and POOH against depth, with no force at the BHA. */
export function ctwiCurve(input: ForcesInput, td: number, points = 40): DepthPoint[] {
  const out: DepthPoint[] = [];
  const path = new Path(input.stations);
  const first = input.bhaLength + (input.step ?? 10);
  for (let i = 0; i <= points; i++) {
    const depth = first + ((td - first) * i) / points;
    const rih = trip(input, depth, 'rih', 0, { profile: false, path });
    const pooh = trip(input, depth, 'pooh', 0, { profile: false, path });
    out.push({
      depth,
      rih: Number.isFinite(rih.ctwi) ? rih.ctwi : -input.snubLimit * 1.3,
      pooh: pooh.ctwi,
      limit: -input.snubLimit,
      buckledLength: rih.buckledLength,
      locked: locked(rih, input),
    });
  }
  return out;
}

export interface ForcesResult {
  depth: number;
  rih: Trip;
  pooh: Trip;
  /** Weight indicator reading for RIH at `depth`, lbf. */
  slackoff: number;
  /** Weight indicator reading for POOH at `depth`, lbf. */
  pickup: number;
  /** Force the injector has to push with at `depth`, lbf; 0 when the string runs in by its own weight. */
  injectorPush: number;
  maxSetdown: number;
  maxOverpull: number;
  tensionLimit: number;
  reach: { depth: number; toTd: boolean };
  /** First depth at which the string buckles helically while running in; `null` if it never does. */
  buckleOnset: number | null;
  curve: DepthPoint[];
}

export function calculateForces(input: ForcesInput, depth?: number): ForcesResult {
  const td = new Path(input.stations).td;
  const at = Math.min(depth ?? td, td > 0 ? td : depth ?? 0);
  const rih = trip(input, at, 'rih');
  const pooh = trip(input, at, 'pooh');
  const curve = ctwiCurve(input, td);
  const firstBuckled = curve.find((p) => p.buckledLength > 0);
  return {
    depth: at,
    rih,
    pooh,
    slackoff: rih.ctwi,
    pickup: pooh.ctwi,
    injectorPush: rih.diverged ? Infinity : Math.max(0, -rih.ctwi),
    maxSetdown: maxSetdown(input, at),
    maxOverpull: maxOverpull(input, at),
    tensionLimit: tensionLimit(input),
    reach: reach(input, td),
    buckleOnset: firstBuckled ? firstBuckled.depth : null,
    curve,
  };
}
