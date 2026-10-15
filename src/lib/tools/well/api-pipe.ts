/**
 * API casing and tubing sizes: outside diameter, nominal weight and wall.
 *
 * The sizes and nominal weights are those of API Spec 5CT (casing and tubing)
 * with the wall thickness of each weight; everything else is derived from them:
 * the inside diameter (OD − 2·wall), the capacity and displacement per unit
 * length, and the drift diameter by the API drift rule (the inside diameter
 * less 1/8 in up to 8-5/8 in casing, 5/32 in from 9-5/8 to 13-3/8 in, 3/16 in
 * from 16 in; for tubing 3/32 in up to 2-7/8 in and 1/8 in above). Grades,
 * collapse and burst ratings are not included.
 *
 * The values are nominal. Check them against API 5CT or the mill's data sheet
 * before they go into a design.
 *
 * Quantities are oilfield units: diameters and wall in inches, weight in lb/ft,
 * capacity in bbl/ft.
 */

export type PipeKind = 'casing' | 'tubing';

export interface ApiPipe {
  kind: PipeKind;
  /** Outside diameter, in. */
  od: number;
  /** Nominal weight (threaded and coupled), lb/ft. */
  weight: number;
  /** Wall thickness, in. */
  wall: number;
}

export interface PipeProperties extends ApiPipe {
  /** Inside diameter, in. */
  id: number;
  /** Drift diameter, in. */
  drift: number;
  /** Internal capacity, bbl/ft. */
  capacity: number;
  /** Steel displacement, bbl/ft. */
  displacement: number;
}

/** Casing as [OD, [weight, wall] ...]. */
const CASING: [number, [number, number][]][] = [
  [4.5, [[9.5, 0.205], [10.5, 0.224], [11.6, 0.25], [13.5, 0.29], [15.1, 0.337]]],
  [5, [[11.5, 0.22], [13, 0.253], [15, 0.296], [18, 0.362], [21.4, 0.437], [23.2, 0.478]]],
  [5.5, [[14, 0.244], [15.5, 0.275], [17, 0.304], [20, 0.361], [23, 0.415]]],
  [6.625, [[20, 0.288], [24, 0.352], [28, 0.417], [32, 0.475]]],
  [7, [[17, 0.231], [20, 0.272], [23, 0.317], [26, 0.362], [29, 0.408], [32, 0.453], [35, 0.498], [38, 0.54]]],
  [7.625, [[24, 0.3], [26.4, 0.328], [29.7, 0.375], [33.7, 0.43], [39, 0.5]]],
  [8.625, [[24, 0.264], [28, 0.304], [32, 0.352], [36, 0.4], [40, 0.45], [44, 0.5], [49, 0.557]]],
  [9.625, [[32.3, 0.312], [36, 0.352], [40, 0.395], [43.5, 0.435], [47, 0.472], [53.5, 0.545], [58.4, 0.595]]],
  [10.75, [[32.75, 0.279], [40.5, 0.35], [45.5, 0.4], [51, 0.45], [55.5, 0.495], [60.7, 0.545], [65.7, 0.595]]],
  [11.75, [[42, 0.333], [47, 0.375], [54, 0.435], [60, 0.489]]],
  [13.375, [[48, 0.33], [54.5, 0.38], [61, 0.43], [68, 0.48], [72, 0.514]]],
  [16, [[65, 0.375], [75, 0.438], [84, 0.495]]],
  [18.625, [[87.5, 0.435]]],
  [20, [[94, 0.438], [106.5, 0.5], [133, 0.635]]],
];

/** Tubing as [OD, [weight, wall] ...]. */
const TUBING: [number, [number, number][]][] = [
  [1.05, [[1.2, 0.113]]],
  [1.315, [[1.8, 0.133]]],
  [1.66, [[2.4, 0.14]]],
  [1.9, [[2.9, 0.145]]],
  [2.375, [[4, 0.167], [4.6, 0.19], [4.7, 0.19], [5.8, 0.254], [5.95, 0.254]]],
  [2.875, [[6.4, 0.217], [6.5, 0.217], [7.8, 0.276], [8.6, 0.308], [8.7, 0.308]]],
  [3.5, [[7.7, 0.216], [9.2, 0.254], [9.3, 0.254], [10.2, 0.289], [12.7, 0.375], [12.95, 0.375]]],
  [4, [[9.5, 0.226], [11, 0.262]]],
  [4.5, [[12.6, 0.271], [12.75, 0.271]]],
];

const expand = (kind: PipeKind, table: typeof CASING): ApiPipe[] =>
  table.flatMap(([od, weights]) => weights.map(([weight, wall]) => ({ kind, od, weight, wall })));

export const API_CASING: readonly ApiPipe[] = expand('casing', CASING);
export const API_TUBING: readonly ApiPipe[] = expand('tubing', TUBING);

/** Barrels per cubic inch per foot: 12 in/ft ÷ 9702 in³/bbl. */
const BBL_PER_FT_PER_IN2 = 12 / 9702;

function driftAllowance(kind: PipeKind, od: number): number {
  if (kind === 'tubing') return od <= 2.875 ? 3 / 32 : 1 / 8;
  if (od < 9.625) return 1 / 8;
  if (od < 16) return 5 / 32;
  return 3 / 16;
}

export function pipeProperties(pipe: ApiPipe): PipeProperties {
  const id = pipe.od - 2 * pipe.wall;
  const area = (d: number) => (Math.PI / 4) * d * d;
  return {
    ...pipe,
    id,
    drift: id - driftAllowance(pipe.kind, pipe.od),
    capacity: area(id) * BBL_PER_FT_PER_IN2,
    displacement: (area(pipe.od) - area(id)) * BBL_PER_FT_PER_IN2,
  };
}

/** The sizes of a kind, smallest first, each with its derived properties. */
export function pipeList(kind: PipeKind): PipeProperties[] {
  return (kind === 'casing' ? API_CASING : API_TUBING).map(pipeProperties);
}

/** The pipe of a kind with an OD and a nominal weight, if the table has it. */
export function findPipe(kind: PipeKind, od: number, weight: number): PipeProperties | undefined {
  return pipeList(kind).find((p) => Math.abs(p.od - od) < 1e-6 && Math.abs(p.weight - weight) < 1e-6);
}

/** Fractional-inch label of a size, e.g. 9.625 → 9-5/8. */
export function sizeLabel(od: number): string {
  const whole = Math.floor(od + 1e-9);
  const eighths = Math.round((od - whole) * 16);
  if (eighths === 0) return String(whole);
  if (eighths === 16) return String(whole + 1);
  let n = eighths;
  let d = 16;
  while (n % 2 === 0) {
    n /= 2;
    d /= 2;
  }
  return whole === 0 ? `${n}/${d}` : `${whole}-${n}/${d}`;
}
