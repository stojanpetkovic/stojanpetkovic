/**
 * Well kill calculations: a kill fluid for a producing well killed by
 * bullheading or circulation, and the kill sheet of a drilling well for the
 * driller's method and the wait-and-weight method.
 *
 * Pressures are gauge. A column of fluid of density ρ and true vertical depth
 * TVD exerts ρ·g·TVD; the kill fluid is the fluid whose column balances the
 * formation pressure, plus a margin that keeps the well overbalanced.
 *
 * Quantities are metric: depths and lengths in m, diameters in mm, density in
 * kg/m³, pressure in bar, volumes in m³, flow in L/min, pump output in L/stroke.
 * `units.ts` converts to and from oilfield units on the page.
 */

const G = 9.80665;
/** Pressure in bar of a column of fluid of density `density` (kg/m³) and height `height` (m). */
export const hydrostatic = (density: number, height: number) => (density * G * height) / 1e5;
/** Density, kg/m³, of a fluid whose column of `height` m exerts `pressure` bar. */
const densityFor = (pressure: number, height: number) => (pressure * 1e5) / (G * height);
const circleArea = (diameterMm: number) => (Math.PI * (diameterMm / 1000) ** 2) / 4;

const positive = (v: number) => Number.isFinite(v) && v > 0;
const nonNegative = (v: number) => Number.isFinite(v) && v >= 0;

// ---------------------------------------------------------------------------
// Producing well: kill fluid, volumes and bullheading pressure

export interface WorkoverInput {
  /** True vertical depth of the formation, m. */
  tvd: number;
  /** Measured depth of the tubing shoe, m. */
  md: number;
  /** Density of the fluid in the well now, kg/m³. */
  density: number;
  /** Shut-in tubing pressure, bar. */
  sitp: number;
  /** Overbalance the kill fluid gives over the formation pressure, bar. */
  margin: number;
  /** Pressure above the formation pressure needed to inject fluid into the formation, bar. */
  inject: number;
  /** Fracture pressure at the formation depth, bar; 0 to leave the check out. */
  fracture: number;
  /** Tubing inside diameter, mm. */
  tubingId: number;
  /** Tubing outside diameter, mm. */
  tubingOd: number;
  /** Casing inside diameter, mm. */
  casingId: number;
  /** Pump rate, L/min. */
  rate: number;
}

export type WorkoverError = keyof WorkoverInput;

export function validateWorkover(i: WorkoverInput): WorkoverError[] {
  const errors: WorkoverError[] = [];
  for (const key of ['tvd', 'md', 'density', 'tubingId', 'tubingOd', 'casingId', 'rate'] as const) {
    if (!positive(i[key])) errors.push(key);
  }
  for (const key of ['sitp', 'margin', 'inject', 'fracture'] as const) {
    if (!nonNegative(i[key])) errors.push(key);
  }
  if (!errors.includes('tubingId') && !errors.includes('tubingOd') && i.tubingId >= i.tubingOd) errors.push('tubingId');
  if (!errors.includes('tubingOd') && !errors.includes('casingId') && i.casingId <= i.tubingOd) errors.push('casingId');
  return errors;
}

export interface WorkoverResult {
  /** Formation pressure at the depth, bar. */
  formationPressure: number;
  /** Density of the kill fluid, kg/m³. */
  killDensity: number;
  /** Increase over the present density, kg/m³. */
  densityIncrease: number;
  /** Hydrostatic pressure of the kill fluid at the depth, bar. */
  hydrostatic: number;
  /** Tubing volume to the shoe, m³; the volume bullheaded. */
  tubingVolume: number;
  /** Annulus volume from tubing to casing to the shoe depth, m³. */
  annulusVolume: number;
  /** Tubing and annulus together, m³. */
  circulationVolume: number;
  /** Time to pump the tubing volume, min. */
  tubingTime: number;
  /** Time to pump tubing and annulus, min. */
  circulationTime: number;
  /** Surface pressure needed to start bullheading (tubing full of the old fluid), bar. */
  startPressure: number;
  /** Surface pressure at the end of bullheading (tubing full of the kill fluid), bar; 0 if the well is dead. */
  endPressure: number;
  /** Bottomhole pressure while injecting, bar. */
  injectionPressure: number;
  /** Fracture pressure minus the injection pressure, bar; `null` when no fracture pressure is given. */
  fractureMargin: number | null;
}

export function calculateWorkover(i: WorkoverInput): WorkoverResult {
  const formationPressure = i.sitp + hydrostatic(i.density, i.tvd);
  const killDensity = densityFor(formationPressure + i.margin, i.tvd);
  const kill = hydrostatic(killDensity, i.tvd);
  const tubingVolume = circleArea(i.tubingId) * i.md;
  const annulusVolume = (circleArea(i.casingId) - circleArea(i.tubingOd)) * i.md;
  const circulationVolume = tubingVolume + annulusVolume;
  const injectionPressure = formationPressure + i.inject;
  const perMin = i.rate / 1000;
  return {
    formationPressure,
    killDensity,
    densityIncrease: killDensity - i.density,
    hydrostatic: kill,
    tubingVolume,
    annulusVolume,
    circulationVolume,
    tubingTime: tubingVolume / perMin,
    circulationTime: circulationVolume / perMin,
    startPressure: injectionPressure - hydrostatic(i.density, i.tvd),
    endPressure: Math.max(0, injectionPressure - kill),
    injectionPressure,
    fractureMargin: i.fracture > 0 ? i.fracture - injectionPressure : null,
  };
}

// ---------------------------------------------------------------------------
// Drilling well: kill sheet

export type DrillMethod = 'drillers' | 'waitWeight';

export interface DrillInput {
  /** True vertical depth of the well, m. */
  tvd: number;
  /** Density of the mud in the well, kg/m³. */
  mud: number;
  /** Shut-in drill pipe pressure, bar. */
  sidpp: number;
  /** Circulating pressure at the kill rate, bar. */
  scr: number;
  /** Pump speed at the kill rate, strokes/min. */
  spm: number;
  /** Pump output, L/stroke. */
  pump: number;
  /** Volume inside the drill string, m³. */
  stringVolume: number;
  /** Annulus volume from the bit to surface, m³. */
  annulusVolume: number;
  /** True vertical depth of the casing shoe, m. */
  shoeTvd: number;
  /** Mud density equivalent to the leak-off pressure at the shoe, kg/m³. */
  leakoff: number;
}

export type DrillError = keyof DrillInput;

export function validateDrill(i: DrillInput): DrillError[] {
  const errors: DrillError[] = [];
  for (const key of ['tvd', 'mud', 'scr', 'spm', 'pump', 'stringVolume', 'annulusVolume'] as const) {
    if (!positive(i[key])) errors.push(key);
  }
  if (!nonNegative(i.sidpp)) errors.push('sidpp');
  if (!positive(i.shoeTvd) || (!errors.includes('tvd') && i.shoeTvd > i.tvd)) errors.push('shoeTvd');
  if (!positive(i.leakoff) || (!errors.includes('mud') && i.leakoff <= i.mud)) errors.push('leakoff');
  return errors;
}

export interface SchedulePoint {
  /** Strokes pumped since the kill mud started down the string. */
  strokes: number;
  /** Time at the kill rate, min. */
  time: number;
  /** Drill pipe pressure to hold, bar. */
  pressure: number;
}

export interface DrillResult {
  /** Kill mud density, kg/m³. */
  killMud: number;
  /** Initial circulating pressure, bar. */
  icp: number;
  /** Final circulating pressure, bar. */
  fcp: number;
  strokesToBit: number;
  strokesToSurface: number;
  timeToBit: number;
  timeToSurface: number;
  /** Strokes of the whole kill: the driller's method circulates twice. */
  totalStrokes: Record<DrillMethod, number>;
  /** Time of the whole kill, min. */
  totalTime: Record<DrillMethod, number>;
  /** Maximum allowable annular surface pressure with the present mud, bar. */
  maasp: number;
  /** Drill pipe pressure against strokes while the kill mud goes down the string, from ICP to FCP. */
  schedule: SchedulePoint[];
}

/** Steps in the pressure schedule: one per tenth of the strokes to the bit. */
export const SCHEDULE_STEPS = 10;

export function calculateDrill(i: DrillInput): DrillResult {
  const killMud = i.mud + densityFor(i.sidpp, i.tvd);
  const icp = i.sidpp + i.scr;
  const fcp = (i.scr * killMud) / i.mud;
  const perStroke = i.pump / 1000;
  const strokesToBit = i.stringVolume / perStroke;
  const strokesToSurface = i.annulusVolume / perStroke;
  const schedule: SchedulePoint[] = [];
  for (let s = 0; s <= SCHEDULE_STEPS; s++) {
    const strokes = (strokesToBit * s) / SCHEDULE_STEPS;
    schedule.push({ strokes, time: strokes / i.spm, pressure: icp - ((icp - fcp) * s) / SCHEDULE_STEPS });
  }
  const totalStrokes: Record<DrillMethod, number> = {
    waitWeight: strokesToBit + strokesToSurface,
    drillers: strokesToSurface + strokesToBit + strokesToSurface,
  };
  return {
    killMud,
    icp,
    fcp,
    strokesToBit,
    strokesToSurface,
    timeToBit: strokesToBit / i.spm,
    timeToSurface: strokesToSurface / i.spm,
    totalStrokes,
    totalTime: { waitWeight: totalStrokes.waitWeight / i.spm, drillers: totalStrokes.drillers / i.spm },
    maasp: hydrostatic(i.leakoff - i.mud, i.shoeTvd),
    schedule,
  };
}
