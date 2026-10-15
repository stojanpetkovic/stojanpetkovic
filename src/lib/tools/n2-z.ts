/**
 * Compressibility factor Z of nitrogen, from a table and bilinear interpolation.
 *
 * The values are the real-gas compressibility factor Z = P·M/(ρ·R·T) of pure
 * nitrogen, computed from the densities of the NIST Chemistry WebBook fluid
 * properties for nitrogen (the equation of state of Span et al., 2000), with
 * M = 28.0134 g/mol and R = 8.314462618 J/(mol·K). Pressures are absolute.
 *
 * Between the table points Z is interpolated linearly in pressure and in
 * temperature. Outside the table the nearest edge is used and the result is
 * flagged, so a caller can say that the value is not interpolated.
 */

/** Absolute pressures of the table rows, bar. */
export const Z_PRESSURES = [1, 25, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

/** Temperatures of the table columns, °C. */
export const Z_TEMPERATURES = [-20, 0, 20, 40, 60, 80, 100, 120, 140, 160];

/** Z[row of Z_PRESSURES][column of Z_TEMPERATURES]. */
export const Z_TABLE: number[][] = [
  [0.9993, 0.9996, 0.9998, 0.9999, 1.0000, 1.0001, 1.0002, 1.0003, 1.0003, 1.0003],
  [0.9835, 0.9904, 0.9954, 0.9992, 1.0020, 1.0042, 1.0059, 1.0071, 1.0081, 1.0089],
  [0.9714, 0.9845, 0.9940, 1.0010, 1.0063, 1.0103, 1.0133, 1.0156, 1.0174, 1.0188],
  [0.9628, 0.9848, 1.0008, 1.0125, 1.0213, 1.0278, 1.0328, 1.0365, 1.0392, 1.0413],
  [0.9763, 1.0019, 1.0205, 1.0343, 1.0445, 1.0521, 1.0578, 1.0620, 1.0650, 1.0672],
  [1.0098, 1.0338, 1.0518, 1.0652, 1.0751, 1.0824, 1.0878, 1.0916, 1.0943, 1.0961],
  [1.0583, 1.0776, 1.0924, 1.1036, 1.1118, 1.1178, 1.1220, 1.1248, 1.1266, 1.1275],
  [1.1168, 1.1298, 1.1401, 1.1478, 1.1533, 1.1571, 1.1596, 1.1609, 1.1613, 1.1611],
  [1.1817, 1.1878, 1.1927, 1.1963, 1.1986, 1.1997, 1.1999, 1.1993, 1.1980, 1.1963],
  [1.2506, 1.2496, 1.2489, 1.2480, 1.2466, 1.2447, 1.2423, 1.2395, 1.2364, 1.2330],
  [1.3218, 1.3138, 1.3074, 1.3018, 1.2966, 1.2914, 1.2863, 1.2812, 1.2760, 1.2708],
  [1.3943, 1.3796, 1.3676, 1.3573, 1.3481, 1.3396, 1.3316, 1.3239, 1.3166, 1.3095],
];

/** Atmospheric pressure, bar, to turn a gauge pressure into an absolute one. */
export const ATMOSPHERE_BAR = 1.01325;

export interface ZValue {
  z: number;
  /** False when the pressure or temperature is outside the table and the edge value was used. */
  inRange: boolean;
}

function locate(axis: readonly number[], value: number): { index: number; fraction: number } {
  const last = axis.length - 1;
  if (value <= axis[0]) return { index: 0, fraction: 0 };
  if (value >= axis[last]) return { index: last - 1, fraction: 1 };
  let i = 0;
  while (axis[i + 1] < value) i++;
  return { index: i, fraction: (value - axis[i]) / (axis[i + 1] - axis[i]) };
}

/** Z of nitrogen at an absolute pressure in bar and a temperature in °C. */
export function nitrogenZ(pressureBar: number, celsius: number): ZValue {
  const p = locate(Z_PRESSURES, pressureBar);
  const t = locate(Z_TEMPERATURES, celsius);
  const at = (i: number, j: number) => Z_TABLE[i][j];
  const lower = at(p.index, t.index) * (1 - t.fraction) + at(p.index, t.index + 1) * t.fraction;
  const upper = at(p.index + 1, t.index) * (1 - t.fraction) + at(p.index + 1, t.index + 1) * t.fraction;
  const inRange =
    pressureBar >= Z_PRESSURES[0] &&
    pressureBar <= Z_PRESSURES[Z_PRESSURES.length - 1] &&
    celsius >= Z_TEMPERATURES[0] &&
    celsius <= Z_TEMPERATURES[Z_TEMPERATURES.length - 1];
  return { z: lower * (1 - p.fraction) + upper * p.fraction, inRange };
}
