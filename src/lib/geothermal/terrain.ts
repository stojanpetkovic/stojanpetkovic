/**
 * The shape and the relief of the model: the outline of Vojvodina and the elevation
 * of its ground, in the local kilometres of `ORIGIN` (see field.ts).
 */

import { OUTLINE } from './outline';
import { TERRAIN_DATA, TERRAIN_GRID } from './terrain-data';

export { OUTLINE };

/** The level the model draws as zero: the median elevation inside the province, metres. */
export const DATUM_M = TERRAIN_GRID.datum;

let elevations: Float32Array | null = null;

function decode(): Float32Array {
  if (elevations) return elevations;
  const bin = atob(TERRAIN_DATA);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) * TERRAIN_GRID.step;
  elevations = out;
  return out;
}

/** Elevation above sea level at a point, metres, interpolated between the 1 km cells. */
export function elevationAt(x: number, y: number): number {
  const { x0, y0, cell, nx, ny } = TERRAIN_GRID;
  const data = decode();
  const u = Math.min(nx - 1.001, Math.max(0, (x - x0) / cell - 0.5));
  const v = Math.min(ny - 1.001, Math.max(0, (y - y0) / cell - 0.5));
  const i = Math.floor(u);
  const j = Math.floor(v);
  const fx = u - i;
  const fy = v - j;
  return (
    data[j * nx + i] * (1 - fx) * (1 - fy) +
    data[j * nx + i + 1] * fx * (1 - fy) +
    data[(j + 1) * nx + i] * (1 - fx) * fy +
    data[(j + 1) * nx + i + 1] * fx * fy
  );
}

/** Height of the ground above the datum at a point, km. */
export function reliefAt(x: number, y: number): number {
  return (elevationAt(x, y) - DATUM_M) / 1000;
}

/** Smallest and largest coordinates of the outline, km. */
export function outlineBounds(): { x0: number; x1: number; y0: number; y1: number } {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const ring of OUTLINE) {
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, x1, y0, y1 };
}

/** True where a point lies inside the outline (even-odd rule over all rings). */
export function insideOutline(x: number, y: number): boolean {
  let inside = false;
  for (const ring of OUTLINE) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a];
      const [xb, yb] = ring[b];
      if (ya > y !== yb > y && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) inside = !inside;
    }
  }
  return inside;
}
