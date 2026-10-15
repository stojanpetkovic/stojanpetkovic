/**
 * Unit systems for the engineering tools: oilfield (US) units and metric.
 *
 * Each quantity has a factor that converts a value in the metric unit to the
 * oilfield unit the calculation works in. The tools keep the typed values in
 * the system the visitor chose and convert on the way in and out.
 */

export type UnitSystem = 'us' | 'metric';

export interface UnitSpec {
  /** Unit label in each system. */
  label: Record<UnitSystem, string>;
  /** Multiply a metric value by this to get the oilfield value. */
  metricToUs: number;
  /** Added after the multiplication, for scales with a different zero (temperature). */
  usOffset?: number;
}

/** 1 lb/gal = 119.826 kg/m³. */
const PPG_TO_KGM3 = 119.826427;
/** 1 lbf/100 ft² = 0.478803 Pa. */
const LBF100FT2_TO_PA = 0.478802589;
/** 1 in = 25.4 mm; 1 ft = 0.3048 m. */
const IN_TO_MM = 25.4;
const FT_TO_M = 0.3048;
/** 1 US gal/min = 3.785412 L/min. */
const GPM_TO_LPM = 3.785411784;
/** 1 psi = 0.0689476 bar. */
const PSI_TO_BAR = 0.0689475729;
/** 1 psi = 0.00689476 MPa; 1 lbf = 0.00444822 kN. */
const PSI_TO_MPA = 0.00689475729;
const LBF_TO_KN = 0.00444822162;
/** 1 ft/min = 0.00508 m/s. */
const FTMIN_TO_MS = 0.00508;

export const UNITS = {
  density: { label: { us: 'lb/gal', metric: 'kg/m³' }, metricToUs: 1 / PPG_TO_KGM3 },
  n: { label: { us: '', metric: '' }, metricToUs: 1 },
  k: { label: { us: 'lbf·sⁿ/100 ft²', metric: 'Pa·sⁿ' }, metricToUs: 1 / LBF100FT2_TO_PA },
  diameter: { label: { us: 'in', metric: 'mm' }, metricToUs: 1 / IN_TO_MM },
  length: { label: { us: 'ft', metric: 'm' }, metricToUs: 1 / FT_TO_M },
  flowRate: { label: { us: 'gal/min', metric: 'L/min' }, metricToUs: 1 / GPM_TO_LPM },
  pressure: { label: { us: 'psi', metric: 'bar' }, metricToUs: 1 / PSI_TO_BAR },
  /** Stress and strength in psi or MPa. */
  stress: { label: { us: 'psi', metric: 'MPa' }, metricToUs: 1 / PSI_TO_MPA },
  /** Elastic modulus in psi or GPa. */
  modulus: { label: { us: 'psi', metric: 'GPa' }, metricToUs: 1000 / PSI_TO_MPA },
  force: { label: { us: 'lbf', metric: 'kN' }, metricToUs: 1 / LBF_TO_KN },
  ratio: { label: { us: '', metric: '' }, metricToUs: 1 },
  percent: { label: { us: '%', metric: '%' }, metricToUs: 1 },
  temperature: { label: { us: '°F', metric: '°C' }, metricToUs: 1.8, usOffset: 32 },
  /** Volume in m³ or barrels. */
  volume: { label: { us: 'bbl', metric: 'm³' }, metricToUs: 6.28981077 },
  /** Gas volume at standard conditions in sm³ or scf. */
  gasVolume: { label: { us: 'scf', metric: 'sm³' }, metricToUs: 35.3146667 },
  /** Gas volume factor: sm³/m³ or scf/bbl. */
  gasRatio: { label: { us: 'scf/bbl', metric: 'sm³/m³' }, metricToUs: 35.3146667 / 6.28981077 },
  liquidVolume: { label: { us: 'gal', metric: 'L' }, metricToUs: 0.264172052 },
  mass: { label: { us: 'lb', metric: 'kg' }, metricToUs: 2.20462262 },
  velocity: { label: { us: 'ft/min', metric: 'm/s' }, metricToUs: 1 / FTMIN_TO_MS },
} satisfies Record<string, UnitSpec>;

export type Quantity = keyof typeof UNITS;

/** A metric value expressed in oilfield units. */
function metricToUs(quantity: Quantity, value: number): number {
  const spec: UnitSpec = UNITS[quantity];
  return value * spec.metricToUs + (spec.usOffset ?? 0);
}

/** An oilfield value expressed in metric units. */
function usToMetric(quantity: Quantity, value: number): number {
  const spec: UnitSpec = UNITS[quantity];
  return (value - (spec.usOffset ?? 0)) / spec.metricToUs;
}

/** A value typed in `system` expressed in oilfield units. */
export function toUs(quantity: Quantity, system: UnitSystem, value: number): number {
  return system === 'us' ? value : metricToUs(quantity, value);
}

/** A value in oilfield units expressed in `system`. */
export function fromUs(quantity: Quantity, system: UnitSystem, value: number): number {
  return system === 'us' ? value : usToMetric(quantity, value);
}

/** A value in one unit system expressed in another. */
export function convert(quantity: Quantity, from: UnitSystem, to: UnitSystem, value: number): number {
  if (from === to) return value;
  return from === 'metric' ? metricToUs(quantity, value) : usToMetric(quantity, value);
}
