/**
 * Directional survey: parsing a pasted deviation log and the minimum curvature
 * method for the well path.
 *
 * A survey is a list of stations of measured depth (MD), inclination from the
 * vertical and azimuth from north, in degrees. The minimum curvature method
 * joins consecutive stations by a circular arc: for the dogleg angle β between
 * two stations, the ratio factor RF = (2/β)·tan(β/2) (1 for a straight
 * section) gives the changes of north, east and true vertical depth (TVD):
 *
 *   ΔN   = ΔMD/2 · (sin I1 cos A1 + sin I2 cos A2) · RF
 *   ΔE   = ΔMD/2 · (sin I1 sin A1 + sin I2 sin A2) · RF
 *   ΔTVD = ΔMD/2 · (cos I1 + cos I2) · RF
 *
 * The well is taken to run vertically from the surface to the first station
 * when that one is below the surface. Depths and offsets are in the unit of
 * the input (feet or metres); the dogleg severity is per 100 ft or per 30 m.
 */

export interface Station {
  md: number;
  inclination: number;
  azimuth: number;
}

export interface PathPoint extends Station {
  tvd: number;
  /** Northing, positive north. */
  north: number;
  /** Easting, positive east. */
  east: number;
  /** Dogleg severity from the previous point, deg per 100 ft or per 30 m. */
  dls: number;
}

export type DepthUnit = 'ft' | 'm';

export type SurveyError =
  | { code: 'empty' }
  | { code: 'columns'; line: number }
  | { code: 'number'; line: number }
  | { code: 'range'; line: number }
  | { code: 'order'; line: number };

export type ParsedSurvey = { stations: Station[]; error?: undefined } | { stations?: undefined; error: SurveyError };

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Splits a line at semicolons, tabs or commas, else at runs of spaces. */
function splitLine(line: string): string[] {
  if (line.includes(';')) return line.split(';').map((c) => c.trim());
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  // Commas separate columns unless they are decimal commas (a lone number per cell).
  if (line.includes(',') && /^[^,]*,[^,]*,[^,]*$/.test(line.trim())) return line.split(',').map((c) => c.trim());
  return line.trim().split(/\s+/);
}

const toNumber = (cell: string) => Number(cell.replace(',', '.'));

/**
 * Reads text of three columns, MD, inclination and azimuth, one station per line. A header line, empty
 * lines and lines starting with # are skipped.
 */
export function parseSurvey(text: string): ParsedSurvey {
  const stations: Station[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (raw === '' || raw.startsWith('#')) continue;
    const cells = splitLine(raw).filter((c) => c !== '');
    const numbers = cells.slice(0, 3).map(toNumber);
    // A first line of words is a header.
    if (stations.length === 0 && cells.length >= 1 && numbers.every((n) => Number.isNaN(n))) continue;
    if (cells.length < 3) return { error: { code: 'columns', line: i + 1 } };
    if (numbers.some((n) => !Number.isFinite(n))) return { error: { code: 'number', line: i + 1 } };
    const [md, inclination, azimuth] = numbers;
    if (md < 0 || inclination < 0 || inclination > 180 || azimuth < 0 || azimuth > 360) {
      return { error: { code: 'range', line: i + 1 } };
    }
    const previous = stations[stations.length - 1];
    if (previous && md <= previous.md) return { error: { code: 'order', line: i + 1 } };
    stations.push({ md, inclination, azimuth });
  }
  if (stations.length === 0) return { error: { code: 'empty' } };
  return { stations };
}

/** Dogleg severity base: 100 ft or 30 m. */
const dlsBase = (unit: DepthUnit) => (unit === 'ft' ? 100 : 30);

/** The minimum curvature path through the stations, starting at the surface. */
export function minimumCurvature(stations: readonly Station[], unit: DepthUnit): PathPoint[] {
  const start: PathPoint = {
    md: 0,
    inclination: stations[0]?.md === 0 ? stations[0].inclination : 0,
    azimuth: stations[0]?.md === 0 ? stations[0].azimuth : 0,
    tvd: 0,
    north: 0,
    east: 0,
    dls: 0,
  };
  const path: PathPoint[] = [start];
  // A first station below the surface is reached by a vertical section.
  const rest = stations[0]?.md === 0 ? stations.slice(1) : stations;
  for (const next of rest) {
    path.push(advance(path[path.length - 1], next, unit));
  }
  return path;
}

function advance(from: PathPoint, to: Station, unit: DepthUnit): PathPoint {
  const dMd = to.md - from.md;
  const i1 = rad(from.inclination);
  const i2 = rad(to.inclination);
  const a1 = rad(from.azimuth);
  const a2 = rad(to.azimuth);
  const cosBeta = Math.min(1, Math.max(-1, Math.cos(i2 - i1) - Math.sin(i1) * Math.sin(i2) * (1 - Math.cos(a2 - a1))));
  const beta = Math.acos(cosBeta);
  const ratio = beta < 1e-9 ? 1 : (2 / beta) * Math.tan(beta / 2);
  const half = (dMd / 2) * ratio;
  return {
    md: to.md,
    inclination: to.inclination,
    azimuth: to.azimuth,
    north: from.north + half * (Math.sin(i1) * Math.cos(a1) + Math.sin(i2) * Math.cos(a2)),
    east: from.east + half * (Math.sin(i1) * Math.sin(a1) + Math.sin(i2) * Math.sin(a2)),
    tvd: from.tvd + half * (Math.cos(i1) + Math.cos(i2)),
    dls: ((beta * 180) / Math.PI / dMd) * dlsBase(unit),
  };
}

/** The position and angles at a measured depth along the path, interpolating the angles linearly. */
export function pointAt(path: readonly PathPoint[], md: number, unit: DepthUnit): PathPoint {
  const last = path[path.length - 1];
  if (md <= path[0].md) return path[0];
  if (md >= last.md) {
    // Below the last station the well is taken to continue at the last angles.
    return md === last.md
      ? last
      : advance(last, { md, inclination: last.inclination, azimuth: last.azimuth }, unit);
  }
  let i = 0;
  while (path[i + 1].md < md) i++;
  const a = path[i];
  const b = path[i + 1];
  const f = (md - a.md) / (b.md - a.md);
  return advance(a, { md, inclination: a.inclination + f * (b.inclination - a.inclination), azimuth: a.azimuth + f * (b.azimuth - a.azimuth) }, unit);
}

export interface SurveySummary {
  md: number;
  tvd: number;
  /** Horizontal distance from the surface location at the last point. */
  departure: number;
  maxInclination: number;
  maxDls: number;
  /** Direction of the departure, degrees from north. */
  closureAzimuth: number;
}

export function summarise(path: readonly PathPoint[]): SurveySummary {
  const last = path[path.length - 1];
  const departure = Math.hypot(last.north, last.east);
  const azimuth = ((Math.atan2(last.east, last.north) * 180) / Math.PI + 360) % 360;
  return {
    md: last.md,
    tvd: last.tvd,
    departure,
    maxInclination: Math.max(...path.map((p) => p.inclination)),
    maxDls: Math.max(...path.map((p) => p.dls)),
    closureAzimuth: departure < 1e-9 ? 0 : azimuth,
  };
}
