/**
 * The CT Simulator's project: the well from the Well Builder, the BHA from the
 * BHA Builder and the CT string and job the simulator itself keeps. The
 * editors save to the browser's storage; this module reads what they saved
 * and turns it into the inputs of the forces calculation, and says what is
 * still missing. Nothing here touches the page, so it can be tested.
 *
 * Units: the well keeps depths in feet or metres as the visitor chose; the
 * BHA is in inches and feet; the results are in oilfield units (ft, in, lb).
 */
import { totals, type BhaItem } from './bha';
import { insideDiameter, toUnit, type WellItem, type WellState } from './well/model';
import { parseSurvey, type Station } from './well/survey';

export const WELL_KEY = 'well-builder:v1';
export const BHA_KEY = 'bha-builder:v1';
export const SIM_KEY = 'ct-simulator:v1';

export interface HoleSize {
  /** Top and bottom, measured depth, ft. */
  top: number;
  bottom: number;
  /** Inside diameter, in. */
  id: number;
}

export interface WellForSim {
  /** Survey stations in feet; empty when the well has none. */
  stations: Station[];
  /** Tubulars the CT can run in, with their inside diameters, in order of the well. */
  holes: HoleSize[];
  /** Deepest depth of the well, ft: the end of the survey, else the deepest tubular. */
  td: number;
  /** The survey text could not be read. */
  surveyError: boolean;
}

/** Pipe that the CT runs inside: casing, liner and tubing, not the CT itself. */
const isHole = (item: WellItem) => item.type === 'casing' || item.type === 'liner' || item.type === 'tubing';

/** The well of the Well Builder as the simulator needs it. */
export function wellForSim(well: WellState): WellForSim {
  const parsed = well.survey.trim() === '' ? { stations: [] as Station[] } : parseSurvey(well.survey);
  const surveyError = 'error' in parsed && parsed.error !== undefined;
  const stations = 'stations' in parsed && parsed.stations ? parsed.stations.map((s) => ({ ...s, md: toUnit(s.md, well.unit, 'ft') })) : [];
  const holes = well.items
    .filter(isHole)
    .map((i) => ({ top: toUnit(i.top, well.unit, 'ft'), bottom: toUnit(i.bottom, well.unit, 'ft'), id: insideDiameter(i) }))
    .filter((h) => h.id > 0);
  const deepestPipe = holes.reduce((max, h) => Math.max(max, h.bottom), 0);
  const td = stations.length > 0 ? stations[stations.length - 1].md : deepestPipe;
  return { stations, holes, td, surveyError };
}

export interface BhaForSim {
  /** Length, ft. */
  length: number;
  /** Weight in air, lb. */
  weight: number;
  /** Largest outside diameter, in. */
  od: number;
}

/** The BHA of the BHA Builder as one rigid body: total length and weight, largest OD. */
export function bhaForSim(items: BhaItem[]): BhaForSim {
  const t = totals(items);
  return { length: t.length, weight: t.weight, od: t.maxOd };
}

export type Missing = 'well' | 'survey' | 'surveyError' | 'holes' | 'bha' | 'depth' | 'string';

/** Every part of the project that has to be filled in before the results mean something. */
export function missingParts(well: WellForSim, bha: BhaForSim, ctSections: number, depth: number): Missing[] {
  const missing: Missing[] = [];
  if (well.surveyError) missing.push('surveyError');
  if (well.holes.length === 0) missing.push('holes');
  if (well.stations.length === 0 && !well.surveyError) missing.push('survey');
  if (bha.length <= 0) missing.push('bha');
  if (ctSections === 0) missing.push('string');
  if (!(depth > bha.length) || (well.td > 0 && depth > well.td + 1e-6)) missing.push('depth');
  return missing;
}

/** The survey to calculate with: the real one, or a vertical well down to `depth` when there is none. */
export function stationsOrVertical(well: WellForSim, depth: number): Station[] {
  if (well.stations.length > 0) return well.stations;
  return [
    { md: 0, inclination: 0, azimuth: 0 },
    { md: Math.max(depth, 1), inclination: 0, azimuth: 0 },
  ];
}

/** Inside diameter used where no tubular covers the depth: the smallest listed, else a typical production casing. */
export function fallbackHole(well: WellForSim): number {
  return well.holes.length > 0 ? Math.min(...well.holes.map((h) => h.id)) : 6.184;
}

function read<T>(key: string, pick: (raw: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? pick(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export { read as readStorage };
