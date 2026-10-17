/**
 * The temperature field of the model: the temperature maps of the Geothermal
 * Atlas of Vojvodina (2010) at 500, 1,000 and 2,000 m, joined to the mean annual
 * temperature at the surface.
 *
 * At every point on the map the atlas gives three temperatures. Between them,
 * and between the surface and 500 m, temperature rises in straight lines;
 * below 2,000 m it continues at the slope between 1,000 and 2,000 m. Across the
 * map the grids are interpolated bilinearly, and outside the outline of the
 * province the value of the nearest cell inside it is used, so the block has no
 * gaps: that part is not data.
 *
 * The atlas draws temperature in colour classes (0.5, 1 and 2 degrees), so the
 * field has that resolution. Below 2,000 m, which is deeper than any map, it
 * is an extrapolation.
 */

import { ATLAS_GRID, ATLAS_LAYERS } from './atlas-data';
import { SETTLEMENTS, project, testDepth, unproject, type Well } from './wells';

/** Mean annual surface temperature assumed for Vojvodina, °C. */
export const SURFACE_TEMP = 11;

/** Depths of the atlas maps, km. */
export const ATLAS_DEPTHS_KM = [0.5, 1, 2] as const;

/** Temperature range of the colour scale, °C: green at the low end, red at the high end. */
export const COLOR_MIN = 10;
export const COLOR_MAX = 125;

/** Reference point of the local coordinates: the centre of the mapped area. */
export const ORIGIN = { lat: 45.4, lon: 20.0 };

// ── Gauss–Krüger zone 7 (MGI, Bessel 1841) ────────────────────────────────────
const BESSEL_A = 6377397.155;
const BESSEL_F = 1 / 299.1528128;
const GK_SCALE = 0.9999;
const GK_CENTRAL_MERIDIAN = (21 * Math.PI) / 180;
const GK_FALSE_EASTING = 7_500_000;

/**
 * Gauss–Krüger zone 7 coordinates, in kilometres, of a WGS84 position. The atlas
 * maps are drawn on this grid. The shift between the MGI datum and WGS84 is a
 * few hundred metres at most, small beside the 2 km cells.
 */
export function gaussKruger(lat: number, lon: number): { e: number; n: number } {
  const e2 = 2 * BESSEL_F - BESSEL_F * BESSEL_F;
  const ep2 = e2 / (1 - e2);
  const p = (lat * Math.PI) / 180;
  const l = (lon * Math.PI) / 180;
  const sin = Math.sin(p);
  const cos = Math.cos(p);
  const N = BESSEL_A / Math.sqrt(1 - e2 * sin * sin);
  const T = (sin / cos) ** 2;
  const C = ep2 * cos * cos;
  const A = (l - GK_CENTRAL_MERIDIAN) * cos;
  const M =
    BESSEL_A *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * p -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  const x =
    GK_SCALE *
    N *
    (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120);
  const y =
    GK_SCALE *
    (M +
      N *
        (sin / cos) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720));
  return { e: (GK_FALSE_EASTING + x) / 1000, n: y / 1000 };
}

// ── The atlas grids ─────────────────────────────────────────────────────────────
interface Grid {
  /** Temperature per cell, °C, with cells outside the province filled from the nearest cell inside. */
  values: Float32Array;
  /** 1 for cells the atlas covers. */
  inside: Uint8Array;
}

export interface Field {
  grids: Grid[];
}

function decodeLayer(data: string, min: number, step: number): Grid {
  const { nx, ny } = ATLAS_GRID;
  const bin = atob(data);
  const values = new Float32Array(nx * ny);
  const inside = new Uint8Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) {
    const b = bin.charCodeAt(i);
    if (b > 0) {
      values[i] = min + (b - 1) * step;
      inside[i] = 1;
    }
  }
  // Grow the covered area outwards a ring at a time until the grid is full.
  const done = Uint8Array.from(inside);
  for (let remaining = 1; remaining > 0; ) {
    remaining = 0;
    const fresh: [number, number][] = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (done[j * nx + i]) continue;
        let sum = 0;
        let count = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const jj = j + dj;
            const ii = i + di;
            if (jj < 0 || jj >= ny || ii < 0 || ii >= nx || !done[jj * nx + ii]) continue;
            sum += values[jj * nx + ii];
            count++;
          }
        }
        if (count) fresh.push([j * nx + i, sum / count]);
        else remaining++;
      }
    }
    for (const [k, v] of fresh) {
      values[k] = v;
      done[k] = 1;
    }
    if (!fresh.length) break;
  }
  return { values, inside };
}

let cached: Field | null = null;

export function buildField(): Field {
  cached ??= { grids: ATLAS_LAYERS.map((l) => decodeLayer(l.data, l.min, l.step)) };
  return cached;
}

/** Bilinear value of a grid at a Gauss–Krüger position in km. */
function sampleGrid(grid: Grid, e: number, n: number): number {
  const { e0, n0, cell, nx, ny } = ATLAS_GRID;
  const u = Math.min(nx - 1, Math.max(0, (e - e0) / cell - 0.5));
  const v = Math.min(ny - 1, Math.max(0, (n - n0) / cell - 0.5));
  const i = Math.min(nx - 2, Math.floor(u));
  const j = Math.min(ny - 2, Math.floor(v));
  const fx = u - i;
  const fy = v - j;
  const a = grid.values[j * nx + i];
  const b = grid.values[j * nx + i + 1];
  const c = grid.values[(j + 1) * nx + i];
  const d = grid.values[(j + 1) * nx + i + 1];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Temperatures at 500, 1,000 and 2,000 m below one point of the map. */
export type Column = [number, number, number];

/** The atlas column below a point given in local kilometres (east, north of `ORIGIN`). */
export function columnAt(field: Field, x: number, y: number): Column {
  const { lat, lon } = unproject(x, y, ORIGIN.lat, ORIGIN.lon);
  const { e, n } = gaussKruger(lat, lon);
  return [
    sampleGrid(field.grids[0], e, n),
    sampleGrid(field.grids[1], e, n),
    sampleGrid(field.grids[2], e, n),
  ];
}

/** True where the atlas covers the point, false where the value is carried over from the border. */
export function insideAtlas(field: Field, x: number, y: number): boolean {
  const { lat, lon } = unproject(x, y, ORIGIN.lat, ORIGIN.lon);
  const { e, n } = gaussKruger(lat, lon);
  const { e0, n0, cell, nx, ny } = ATLAS_GRID;
  const i = Math.floor((e - e0) / cell);
  const j = Math.floor((n - n0) / cell);
  return i >= 0 && i < nx && j >= 0 && j < ny && field.grids[0].inside[j * nx + i] === 1;
}

/** Temperature at a depth in km below a column of the atlas. */
export function tempFromColumn(col: Column, depthKm: number): number {
  if (depthKm <= 0) return SURFACE_TEMP;
  if (depthKm <= 0.5) return SURFACE_TEMP + ((col[0] - SURFACE_TEMP) * depthKm) / 0.5;
  if (depthKm <= 1) return col[0] + (col[1] - col[0]) * ((depthKm - 0.5) / 0.5);
  if (depthKm <= 2) return col[1] + (col[2] - col[1]) * (depthKm - 1);
  return col[2] + (col[2] - col[1]) * (depthKm - 2);
}

/** Depth in km at which a column reaches a temperature; the inverse of `tempFromColumn`. */
export function depthFromColumn(col: Column, temp: number): number {
  if (temp <= SURFACE_TEMP) return 0;
  if (temp <= col[0]) return (0.5 * (temp - SURFACE_TEMP)) / (col[0] - SURFACE_TEMP);
  if (temp <= col[1]) return 0.5 + (0.5 * (temp - col[0])) / (col[1] - col[0]);
  if (temp <= col[2]) return 1 + (temp - col[1]) / (col[2] - col[1]);
  return 2 + (temp - col[2]) / (col[2] - col[1]);
}

/** Local gradient in °C per km at a depth in km: the slope of the line segment that depth lies on. */
export function gradientFromColumn(col: Column, depthKm: number): number {
  if (depthKm <= 0.5) return (col[0] - SURFACE_TEMP) / 0.5;
  if (depthKm <= 1) return (col[1] - col[0]) / 0.5;
  return col[2] - col[1];
}

/** Temperature at a map position (local km) and a depth in km, °C. */
export function tempAt(field: Field, x: number, y: number, depthKm: number): number {
  return tempFromColumn(columnAt(field, x, y), depthKm);
}

/** Smallest, largest and mean temperature the atlas gives for one map, °C. */
export function atlasStats(
  field: Field,
  layer: number,
): { min: number; max: number; mean: number } {
  const grid = field.grids[layer];
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < grid.values.length; i++) {
    if (!grid.inside[i]) continue;
    min = Math.min(min, grid.values[i]);
    max = Math.max(max, grid.values[i]);
    sum += grid.values[i];
    count++;
  }
  return { min, max, mean: sum / count };
}

// ── Per-well gradient of the annex ──────────────────────────────────────────────
export interface WellPoint {
  well: Well;
  /** East and north of the settlement from `ORIGIN`, km. */
  x: number;
  y: number;
  /** Mean gradient over the well's tests, °C per km. */
  gradient: number;
}

/** Gradient implied by one test: how fast it is warmer than the surface, per km of depth. */
export function testGradient(temp: number, depthMetres: number, surface = SURFACE_TEMP): number {
  return (temp - surface) / (depthMetres / 1000);
}

export function wellPoint(well: Well): WellPoint {
  const place = SETTLEMENTS[well.place];
  const { x, y } = project(place.lat, place.lon, ORIGIN.lat, ORIGIN.lon);
  const gradients = well.tests.map((test) => testGradient(test.temp, testDepth(well, test)));
  return { well, x, y, gradient: gradients.reduce((a, b) => a + b, 0) / gradients.length };
}

/** Position on the green–yellow–red scale, 0 to 1, clamped. */
export function colorFraction(temp: number): number {
  return Math.min(1, Math.max(0, (temp - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)));
}

/** Colour of a temperature: green when cool, through yellow, to red when hot. Channels 0–255. */
export function tempColor(temp: number): [number, number, number] {
  const hue = 120 * (1 - colorFraction(temp));
  // HSL at full saturation and 45 % lightness.
  const l = 0.45;
  const a = l; // s * min(l, 1 - l) with s = 1
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
