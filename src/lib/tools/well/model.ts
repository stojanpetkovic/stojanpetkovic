/**
 * The well model of the Well Builder: the items on the schematic (casing,
 * liner, tubing, coiled tubing, packer, perforations), their depths and sizes,
 * and the helpers that keep them consistent. Depths are measured depths in the
 * well's unit, feet or metres; sizes are in inches.
 */
import { pipeList, sizeLabel, type PipeKind } from './api-pipe';
import type { DepthUnit } from './survey';

export type ItemType = 'casing' | 'liner' | 'tubing' | 'ct' | 'packer' | 'perforation';

export interface WellItem {
  id: string;
  type: ItemType;
  /** Outside diameter, in. */
  od: number;
  /** Nominal weight, lb/ft (API pipe only). */
  weight: number;
  /** Wall thickness, in. */
  wall: number;
  /** Top and bottom, measured depth. For a packer the bottom is the top plus its length. */
  top: number;
  bottom: number;
}

export interface WellState {
  unit: DepthUnit;
  items: WellItem[];
  /** The deviation survey as typed. */
  survey: string;
}

export const ITEM_TYPES: readonly ItemType[] = ['casing', 'liner', 'tubing', 'ct', 'packer', 'perforation'];

/** Types drawn as a pipe: they have a size from a list. */
export const isPipe = (type: ItemType) => type === 'casing' || type === 'liner' || type === 'tubing' || type === 'ct';

export const CT_ODS = [1, 1.25, 1.5, 1.75, 2, 2.375, 2.625, 2.875, 3.5] as const;
export const CT_WALLS = [0.087, 0.095, 0.102, 0.109, 0.125, 0.134, 0.145, 0.156, 0.175, 0.188, 0.204, 0.224] as const;

/** Which API list a pipe type takes its sizes from; coiled tubing has its own. */
export const apiKind = (type: ItemType): PipeKind | null =>
  type === 'casing' || type === 'liner' ? 'casing' : type === 'tubing' ? 'tubing' : null;

const FT = 0.3048;
export const toUnit = (value: number, from: DepthUnit, to: DepthUnit) =>
  from === to ? value : from === 'ft' ? value * FT : value / FT;

let counter = 0;
export const newId = () => `i${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The snap step of dragging: 10 ft or 5 m. */
export const snapStep = (unit: DepthUnit) => (unit === 'ft' ? 10 : 5);

/** A new item of a type, placed at a depth the user dropped it or a default one. */
export function createItem(type: ItemType, unit: DepthUnit, depth: number): WellItem {
  const thousand = unit === 'ft' ? 1000 : 300;
  const base = { id: newId(), type, top: 0, bottom: Math.max(depth, snapStep(unit)) };
  switch (type) {
    case 'casing':
      return { ...base, od: 9.625, weight: 47, wall: 0.472 };
    case 'liner':
      return { ...base, od: 7, weight: 29, wall: 0.408, top: depth, bottom: depth + 2 * thousand };
    case 'tubing':
      return { ...base, od: 2.875, weight: 6.5, wall: 0.217 };
    case 'ct':
      return { ...base, od: 1.75, weight: 0, wall: 0.134 };
    case 'packer':
      return { ...base, od: 5, weight: 0, wall: 0, top: depth, bottom: depth + (unit === 'ft' ? 10 : 3) };
    case 'perforation':
      return { ...base, od: 0, weight: 0, wall: 0, top: depth, bottom: depth + (unit === 'ft' ? 100 : 30) };
  }
}

/** The inside diameter of a pipe item, in. */
export const insideDiameter = (item: WellItem) => item.od - 2 * item.wall;

/** The nominal sizes a type offers, as distinct ODs. */
export function sizeOptions(type: ItemType): number[] {
  const kind = apiKind(type);
  if (kind) return [...new Set(pipeList(kind).map((p) => p.od))];
  return type === 'ct' ? [...CT_ODS] : [];
}

/** The weights (with their walls) of an OD in the API list of a type. */
export function weightOptions(type: ItemType, od: number): { weight: number; wall: number }[] {
  const kind = apiKind(type);
  return kind ? pipeList(kind).filter((p) => p.od === od).map(({ weight, wall }) => ({ weight, wall })) : [];
}

/** Changes the OD of a pipe item to a listed size, taking the lightest weight that size has. */
export function withSize(item: WellItem, od: number): WellItem {
  const kind = apiKind(item.type);
  if (kind) {
    const first = weightOptions(item.type, od)[0];
    return first ? { ...item, od, weight: first.weight, wall: first.wall } : { ...item, od };
  }
  return { ...item, od };
}

export function withWeight(item: WellItem, weight: number): WellItem {
  const match = weightOptions(item.type, item.od).find((w) => w.weight === weight);
  return match ? { ...item, weight: match.weight, wall: match.wall } : item;
}

/** A short label of an item, e.g. "9-5/8 in 47 lb/ft casing" without the type word. */
export function itemSize(item: WellItem): string {
  if (item.type === 'perforation') return '';
  if (item.type === 'packer') return `${sizeLabel(item.od)}"`;
  if (item.type === 'ct') return `${sizeLabel(item.od)}" × ${item.wall}"`;
  return `${sizeLabel(item.od)}" × ${item.weight} lb/ft`;
}

/** Problems of an item: the names of the fields that cannot be used. */
export function itemErrors(item: WellItem): ('top' | 'bottom' | 'od')[] {
  const errors: ('top' | 'bottom' | 'od')[] = [];
  if (!Number.isFinite(item.top) || item.top < 0) errors.push('top');
  if (!Number.isFinite(item.bottom) || item.bottom <= item.top) errors.push('bottom');
  if (item.type !== 'perforation' && (!Number.isFinite(item.od) || item.od <= 0)) errors.push('od');
  return errors;
}

export const emptyWell = (unit: DepthUnit = 'ft'): WellState => ({ unit, items: [], survey: '' });

/** Reads a saved or imported well, dropping what does not fit the model. */
export function readWell(raw: unknown): WellState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Partial<WellState>;
  const unit: DepthUnit = data.unit === 'm' ? 'm' : 'ft';
  const items = Array.isArray(data.items)
    ? data.items.filter(
        (i): i is WellItem =>
          !!i &&
          typeof i === 'object' &&
          ITEM_TYPES.includes((i as WellItem).type) &&
          [i.od, i.weight, i.wall, i.top, i.bottom].every((n) => typeof n === 'number' && Number.isFinite(n))
      )
    : [];
  return {
    unit,
    items: items.map((i) => ({ ...i, id: typeof i.id === 'string' ? i.id : newId() })),
    survey: typeof data.survey === 'string' ? data.survey : '',
  };
}

/** The example well: surface, intermediate and production casing, a liner, tubing with a packer and perforations. */
export function exampleWell(unit: DepthUnit): WellState {
  const k = unit === 'ft' ? 1 : FT;
  const at = (feet: number) => Math.round(feet * k);
  const mk = (type: ItemType, od: number, weight: number, wall: number, top: number, bottom: number): WellItem => ({
    id: newId(),
    type,
    od,
    weight,
    wall,
    top: at(top),
    bottom: at(bottom),
  });
  const survey = [
    'MD,Inc,Azi',
    ...[
      [0, 0, 0],
      [1500, 0, 0],
      [2000, 8, 45],
      [3000, 28, 50],
      [4000, 46, 55],
      [5000, 58, 58],
      [6500, 60, 58],
      [8000, 61, 60],
      [10000, 62, 60],
    ].map(([md, i, a]) => `${at(md)},${i},${a}`),
  ].join('\n');
  return {
    unit,
    survey,
    items: [
      mk('casing', 13.375, 68, 0.48, 0, 1500),
      mk('casing', 9.625, 47, 0.472, 0, 6500),
      mk('liner', 7, 29, 0.408, 6300, 10000),
      mk('tubing', 2.875, 6.5, 0.217, 0, 8800),
      mk('packer', 5.5, 0, 0, 8800, 8810),
      mk('perforation', 0, 0, 0, 9200, 9400),
    ],
  };
}
