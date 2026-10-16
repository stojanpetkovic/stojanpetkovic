/**
 * Coiled tubing bottom hole assembly (BHA): the tools run on the end of the
 * string, listed from the top (the coil connector) to the bottom, with the
 * outside and inside diameter, length and connection of each.
 *
 * Diameters are in inches and lengths in feet, the units a BHA sheet is
 * written in; the page converts for display. The drawing is built here as an
 * SVG string so it can be tested: each tool is a body of its outside diameter
 * and length with its bore, and a few strokes that say what kind of tool it
 * is. Widths follow the largest outside diameter; heights follow the lengths,
 * with a minimum height per tool so a short tool still has room for its label.
 */

export const KINDS = [
  'connector',
  'crossover',
  'swivel',
  'checkValve',
  'disconnect',
  'circSub',
  'motorhead',
  'jar',
  'accelerator',
  'centralizer',
  'nozzle',
  'mill',
  'motor',
  'packer',
  'overshot',
  'generic',
] as const;

export type Kind = (typeof KINDS)[number];

export interface BhaItem {
  id: string;
  kind: Kind;
  description: string;
  /** Outside diameter, in. */
  od: number;
  /** Inside diameter, in; `null` where the tool has no through bore. */
  bore: number | null;
  /** Length, ft. */
  length: number;
  connection: string;
  /** Weight in air, lb; left out, it is estimated from the sizes as steel. */
  weight?: number;
}

export interface BhaMeta {
  bhaNo: string;
  runNo: string;
  preparedBy: string;
}

/** Typical size of a tool of each kind, taken from common BHA sheets; a starting point to edit. */
export const KIND_DEFAULTS: Record<Kind, { bore: number | null; length: number; od?: number }> = {
  connector: { bore: 1.25, length: 0.55 },
  crossover: { bore: 1.0, length: 0.67 },
  swivel: { bore: 0.75, length: 1.27 },
  checkValve: { bore: null, length: 1.15 },
  disconnect: { bore: 0.812, length: 1.32 },
  circSub: { bore: 0.6875, length: 0.79 },
  motorhead: { bore: 0.812, length: 3.5 },
  jar: { bore: 0.5, length: 5 },
  accelerator: { bore: 0.5, length: 6 },
  centralizer: { bore: 1.0, length: 2 },
  nozzle: { bore: 0.5, length: 1 },
  mill: { bore: 0.75, length: 1.5 },
  motor: { bore: null, length: 12 },
  packer: { bore: 0.75, length: 4 },
  overshot: { bore: null, length: 2.5 },
  generic: { bore: 1.0, length: 1 },
};

export type BhaField = 'description' | 'od' | 'bore' | 'length' | 'weight';

/** Steel, lb per in³. */
const STEEL_LB_IN3 = 0.2836;

/** Weight in air of a tool made of solid steel with its bore, lb. */
export function estimateWeight(item: Pick<BhaItem, 'od' | 'bore' | 'length'>): number {
  const bore = item.bore ?? 0;
  return STEEL_LB_IN3 * ((Math.PI / 4) * (item.od ** 2 - bore ** 2)) * item.length * 12;
}

/** The weight entered for a tool, or the estimate. */
export const itemWeight = (item: BhaItem): number =>
  item.weight !== undefined && Number.isFinite(item.weight) ? item.weight : estimateWeight(item);

/** Fields of one tool that cannot be drawn. */
export function validateItem(item: BhaItem): BhaField[] {
  const errors: BhaField[] = [];
  if (item.description.trim() === '') errors.push('description');
  if (!Number.isFinite(item.od) || item.od <= 0) errors.push('od');
  if (item.bore !== null && (!Number.isFinite(item.bore) || item.bore <= 0 || item.bore >= item.od)) errors.push('bore');
  if (!Number.isFinite(item.length) || item.length <= 0) errors.push('length');
  if (item.weight !== undefined && (!Number.isFinite(item.weight) || item.weight < 0)) errors.push('weight');
  return errors;
}

export interface BhaTotals {
  /** Total length, ft. */
  length: number;
  /** Largest outside diameter, in. */
  maxOd: number;
  /** Smallest through bore, in; `null` when no tool has one or a tool is closed. */
  minBore: number | null;
  count: number;
  /** Total weight in air, lb. */
  weight: number;
}

export function totals(items: BhaItem[]): BhaTotals {
  const open = items.filter((i) => i.bore !== null);
  return {
    length: items.reduce((sum, i) => sum + (Number.isFinite(i.length) ? i.length : 0), 0),
    maxOd: items.reduce((max, i) => (Number.isFinite(i.od) ? Math.max(max, i.od) : max), 0),
    // A tool with no bore (a back pressure valve) is a closed point, not a restriction to quote.
    minBore: open.length > 0 ? Math.min(...open.map((i) => i.bore as number)) : null,
    count: items.length,
    weight: items.reduce((sum, i) => sum + (Number.isFinite(i.length) && Number.isFinite(i.od) ? itemWeight(i) : 0), 0),
  };
}

let counter = 0;
export const newId = () => `t${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newItem(kind: Kind, description: string, previous?: BhaItem): BhaItem {
  const d = KIND_DEFAULTS[kind];
  const od = d.od ?? previous?.od ?? 2;
  return {
    id: newId(),
    kind,
    description,
    od,
    bore: d.bore !== null && d.bore >= od ? Number((od * 0.5).toFixed(3)) : d.bore,
    length: d.length,
    connection: '',
  };
}

// ---------------------------------------------------------------------------
// Saved form

export interface BhaFile {
  format: 'bha-builder';
  version: 1;
  items: Omit<BhaItem, 'id'>[];
  meta: BhaMeta;
}

export function toFile(items: BhaItem[], meta: BhaMeta): BhaFile {
  return {
    format: 'bha-builder',
    version: 1,
    items: items.map(({ id: _id, ...rest }) => rest),
    meta,
  };
}

/** Items and header of a saved BHA, or `null` if the data is not one. */
export function fromFile(data: unknown): { items: BhaItem[]; meta: BhaMeta } | null {
  if (!data || typeof data !== 'object') return null;
  const file = data as Partial<BhaFile>;
  if (file.format !== 'bha-builder' || file.version !== 1 || !Array.isArray(file.items)) return null;
  const items: BhaItem[] = [];
  for (const raw of file.items) {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    if (!KINDS.includes(r.kind as Kind) || typeof r.description !== 'string') return null;
    if (typeof r.od !== 'number' || typeof r.length !== 'number') return null;
    if (r.bore !== null && typeof r.bore !== 'number') return null;
    items.push({
      id: newId(),
      kind: r.kind as Kind,
      description: r.description,
      od: r.od,
      bore: r.bore as number | null,
      length: r.length,
      connection: typeof r.connection === 'string' ? r.connection : '',
      ...(typeof r.weight === 'number' ? { weight: r.weight } : {}),
    });
  }
  const m = (file.meta ?? {}) as Partial<BhaMeta>;
  return {
    items,
    meta: {
      bhaNo: typeof m.bhaNo === 'string' ? m.bhaNo : '',
      runNo: typeof m.runNo === 'string' ? m.runNo : '',
      preparedBy: typeof m.preparedBy === 'string' ? m.preparedBy : '',
    },
  };
}

// ---------------------------------------------------------------------------
// Examples, from the BHA workbook

type Row = [kind: Kind, description: string, od: number, bore: number | null, length: number, connection: string];

const rows = (list: Row[]): Omit<BhaItem, 'id'>[] =>
  list.map(([kind, description, od, bore, length, connection]) => ({ kind, description, od, bore, length, connection }));

/** A 1-1/2" coil BHA of ten tools: 9.96 ft, 3.04 m. */
const SHEET: Row[] = [
  ['connector', 'Coil connector f/1-1/2" coil', 2.188, 1.25, 0.55, '1-1/4" CS Pin'],
  ['crossover', 'Sub x-over', 2.0, 1.0, 0.67, '1-1/4" CS x 1-1/2" MT BxP'],
  ['swivel', 'Swivel', 2.25, 0.75, 1.27, '1-1/2" MT BxP'],
  ['crossover', 'Sub x-over', 2.0, 1.0, 0.67, '1-1/2" MT x 1-1/4" CS BxP'],
  ['checkValve', 'Back pressure valve', 1.925, null, 1.15, '1-1/4" CS BxP'],
  ['checkValve', 'Back pressure valve', 1.925, null, 1.15, '1-1/4" CS BxP'],
  ['disconnect', 'Mechanical disconnect', 2.125, 1.5, 1.1, '1-1/4" CS BxP'],
  ['disconnect', 'Mechanical disconnect', 2.125, 1.5, 1.1, '1-1/4" CS BxP'],
  ['checkValve', 'Back pressure valve', 1.925, null, 1.15, '1-1/4" CS BxP'],
  ['checkValve', 'Back pressure valve', 1.925, null, 1.15, '1-1/4" CS BxP'],
];

/** Motorhead assemblies: tool, check valves, cross-over, hydraulic disconnect, dual circulation sub, cross-over. */
const motorhead = (od: number, thread: string, tec: [number, number], nrv: [number, number], x1: number, hyd: [number, number], dual: number, x2: [number, number, string]): Row[] => [
  ['connector', 'TEC', od, tec[0], tec[1], `${thread} Pin`],
  ['checkValve', "NRV's", od, nrv[0], nrv[1], `${thread} Box x Box`],
  ['crossover', 'Cross-over', od, nrv[0], x1, `${thread} Pin x Pin`],
  ['disconnect', 'Hydraulic disconnect', od, hyd[0], hyd[1], `${thread} Box x Pin`],
  ['circSub', 'Dual circulation sub', od, 0.6875, dual, `${thread} Box x Pin`],
  ['crossover', 'Cross-over', od, x2[0], x2[1], x2[2]],
];

export const EXAMPLES = {
  sheet: rows(SHEET),
  motorhead1_11_16: rows([
    ['connector', 'Internal TEC', 1.75, null, 0.56, '1.375" 12 TPI 60° Pin'],
    ['checkValve', "NRV's", 1.6875, 0.625, 0.88, '1.375" 12 TPI 60° Box x Box'],
    ['crossover', 'Cross-over', 1.6875, 0.812, 0.09, '1.375" 12 TPI 60° Pin x Pin'],
    ['disconnect', 'Hydraulic disconnect', 1.6875, 0.5625, 1.32, '1.375" 12 TPI 60° Box x Pin'],
    ['circSub', 'Dual circulation sub', 1.6875, 0.4375, 0.72, '1.375" 12 TPI 60° Box x Pin'],
  ]),
  motorhead2_1_8: rows(motorhead(2.125, '1.938" 10 ACME', [1.025, 0.55], [1.025, 0.95], 0.09, [0.812, 1.32], 0.79, [1.0, 0.4, '1.938" 10 ACME Box'])),
  motorhead2_3_8: rows(motorhead(2.375, '1.938" 10 ACME', [1.0, 0.47], [1.312, 0.95], 0.09, [0.812, 1.41], 0.79, [0.625, 0.32, '1.938" 10 ACME Box'])),
  motorhead2_7_8: rows(motorhead(2.875, '2.375" 10 ACME', [1.312, 0.47], [1.312, 1.03], 0.09, [0.812, 1.32], 0.79, [1.0, 0.65, '2.250" 10 ACME Box'])),
  motorhead3_1_8: rows(motorhead(3.125, '2.250" 10 ACME', [1.312, 0.5], [1.312, 1.04], 0.09, [0.812, 1.32], 0.79, [1.0, 0.75, '2.250" 10 ACME Box x 2-3/8" REG Pin'])),
} as const;

export type ExampleKey = keyof typeof EXAMPLES;

export function exampleItems(key: ExampleKey): BhaItem[] {
  return EXAMPLES[key].map((item) => ({ ...item, id: newId() }));
}

// ---------------------------------------------------------------------------
// Drawing

export interface DrawOptions {
  /** Drawing height before the minimum per tool applies, px. */
  height?: number;
  /** Formats a length for the dimension column. */
  formatLength: (ft: number) => string;
  /** Formats a diameter for the label. */
  formatDiameter: (inches: number) => string;
  /** Label of the total length. */
  totalLabel: string;
  /** Text of an empty drawing. */
  empty: string;
}

const W = 340;
const CX = 104;
const MAX_WIDTH = 60;
const MIN_ROW = 40;
const TOP = 28;
const LABEL_X = 166;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const f = (n: number) => Number(n.toFixed(2));

export interface RowLayout {
  item: BhaItem;
  y: number;
  height: number;
  width: number;
}

/** Position and size of each tool in the drawing. */
export function layoutRows(items: BhaItem[], height = 760): { rows: RowLayout[]; height: number } {
  const t = totals(items);
  const n = items.length;
  const target = Math.max(height, n * MIN_ROW + 80);
  const k = t.length > 0 ? (target - n * MIN_ROW) / t.length : 0;
  const rows: RowLayout[] = [];
  let y = TOP;
  for (const item of items) {
    const h = MIN_ROW + k * (Number.isFinite(item.length) ? item.length : 0);
    const w = t.maxOd > 0 ? Math.max(14, (item.od / t.maxOd) * MAX_WIDTH) : 14;
    rows.push({ item, y, height: h, width: w });
    y += h;
  }
  return { rows, height: y + 20 };
}

/** Strokes that say what kind of tool a body is, in the body's own box. */
function decoration(kind: Kind, x: number, y: number, w: number, h: number, bw: number): string {
  const cx = x + w / 2;
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
  const parts: string[] = [];
  switch (kind) {
    case 'connector':
      parts.push(line(x, y + h * 0.3, x + w, y + h * 0.3), line(x, y + h * 0.5, x + w, y + h * 0.5));
      break;
    case 'crossover':
      parts.push(line(x, y + h * 0.5, cx - bw / 2, y + h * 0.28), line(x + w, y + h * 0.5, cx + bw / 2, y + h * 0.28));
      break;
    case 'swivel':
      parts.push(line(x, y + h * 0.35, x + w, y + h * 0.35), line(x, y + h * 0.65, x + w, y + h * 0.65), `<circle cx="${f(cx)}" cy="${f(y + h / 2)}" r="${f(Math.min(w, h) * 0.12)}"/>`);
      break;
    case 'checkValve':
      parts.push(line(x + w * 0.15, y + h * 0.3, cx, y + h * 0.6), line(x + w * 0.85, y + h * 0.3, cx, y + h * 0.6));
      break;
    case 'disconnect':
      parts.push(`<polyline points="${f(x)},${f(y + h * 0.5)} ${f(x + w * 0.25)},${f(y + h * 0.4)} ${f(x + w * 0.5)},${f(y + h * 0.6)} ${f(x + w * 0.75)},${f(y + h * 0.4)} ${f(x + w)},${f(y + h * 0.5)}"/>`);
      break;
    case 'circSub':
      parts.push(`<circle cx="${f(cx)}" cy="${f(y + h * 0.5)}" r="${f(Math.min(bw, h) * 0.28)}"/>`, line(x, y + h * 0.5, x + (w - bw) / 2, y + h * 0.5), line(x + w, y + h * 0.5, x + w - (w - bw) / 2, y + h * 0.5));
      break;
    case 'motorhead':
      parts.push(line(x, y + h * 0.25, x + w, y + h * 0.25), line(x, y + h * 0.5, x + w, y + h * 0.5), line(x, y + h * 0.75, x + w, y + h * 0.75));
      break;
    case 'jar':
      parts.push(line(x, y + h * 0.35, x + w, y + h * 0.35), line(x, y + h * 0.65, x + w, y + h * 0.65), line(x + w * 0.2, y + h * 0.4, x + w * 0.2, y + h * 0.6), line(x + w * 0.8, y + h * 0.4, x + w * 0.8, y + h * 0.6));
      break;
    case 'accelerator': {
      const pts: string[] = [];
      for (let i = 0; i <= 8; i++) pts.push(`${f(i % 2 ? x + w * 0.7 : x + w * 0.3)},${f(y + h * (0.12 + 0.76 * (i / 8)))}`);
      parts.push(`<polyline points="${pts.join(' ')}"/>`);
      break;
    }
    case 'centralizer':
      parts.push(`<path d="M ${f(x + w * 0.15)} ${f(y + h * 0.1)} Q ${f(x - w * 0.35)} ${f(y + h * 0.5)} ${f(x + w * 0.15)} ${f(y + h * 0.9)}"/>`, `<path d="M ${f(x + w * 0.85)} ${f(y + h * 0.1)} Q ${f(x + w * 1.35)} ${f(y + h * 0.5)} ${f(x + w * 0.85)} ${f(y + h * 0.9)}"/>`);
      break;
    case 'nozzle':
      parts.push(line(x + w * 0.2, y + h * 0.75, x + w * 0.05, y + h * 0.95), line(x + w * 0.8, y + h * 0.75, x + w * 0.95, y + h * 0.95), line(cx, y + h * 0.8, cx, y + h * 0.98));
      break;
    case 'mill': {
      const pts: string[] = [];
      const teeth = Math.max(3, Math.round(w / 9));
      for (let i = 0; i <= teeth * 2; i++) pts.push(`${f(x + (w * i) / (teeth * 2))},${f(y + h * (i % 2 ? 0.8 : 0.95))}`);
      parts.push(`<polyline points="${pts.join(' ')}"/>`);
      break;
    }
    case 'motor':
      for (let i = 0; i < 7; i++) parts.push(line(x, y + h * (0.1 + i * 0.13) + h * 0.06, x + w, y + h * (0.1 + i * 0.13) - h * 0.06));
      break;
    case 'packer':
      parts.push(`<rect class="bha-rubber" x="${f(x - w * 0.12)}" y="${f(y + h * 0.3)}" width="${f(w * 1.24)}" height="${f(h * 0.4)}" rx="${f(Math.min(6, w * 0.1))}"/>`);
      break;
    case 'overshot':
      parts.push(line(x, y + h * 0.4, x + w, y + h * 0.4), `<path d="M ${f(x + w * 0.35)} ${f(y + h)} L ${f(x + w * 0.35)} ${f(y + h * 0.7)} L ${f(x + w * 0.65)} ${f(y + h * 0.7)} L ${f(x + w * 0.65)} ${f(y + h)}"/>`);
      break;
    case 'generic':
      break;
  }
  return `<g class="bha-deco">${parts.join('')}</g>`;
}

/** The BHA as an SVG: tools top to bottom, a length column on the left and a label for each tool on the right. */
export function renderSvg(items: BhaItem[], options: DrawOptions): string {
  if (items.length === 0) {
    return `<svg viewBox="0 0 ${W} 160" xmlns="http://www.w3.org/2000/svg" role="img"><text class="bha-empty" x="${W / 2}" y="84" text-anchor="middle">${esc(options.empty)}</text></svg>`;
  }
  const { rows, height } = layoutRows(items, options.height);
  const total = totals(items).length;
  const parts: string[] = [];
  let fromBottom = total;

  // The threaded connection between two tools, drawn behind them.
  rows.slice(1).forEach((row, i) => {
    const w = Math.min(rows[i].width, row.width) * 0.5;
    parts.push(`<rect class="bha-neck" x="${f(CX - w / 2)}" y="${f(row.y - 4)}" width="${f(w)}" height="8" rx="2"/>`);
  });

  rows.forEach((row, index) => {
    const { item, y, height: h, width } = row;
    const x = CX - width / 2;
    const bw = item.bore === null ? 0 : Math.max(5, (item.bore / item.od) * width);
    const group: string[] = [];
    const corner = f(Math.min(9, width * 0.24, h * 0.3));
    group.push(`<rect class="bha-body" x="${f(x)}" y="${f(y)}" width="${f(width)}" height="${f(h)}" rx="${corner}"/>`);
    if (bw > 0) {
      // A cutaway of the bore: a darker channel with its own shading.
      group.push(`<rect class="bha-bore" x="${f(CX - bw / 2)}" y="${f(y + h * 0.05)}" width="${f(bw)}" height="${f(h * 0.9)}" rx="${f(Math.min(5, bw * 0.3))}"/>`);
    }
    // A highlight down the left side gives the body its round look.
    group.push(`<line class="bha-shine" x1="${f(x + width * 0.16)}" y1="${f(y + corner * 0.8)}" x2="${f(x + width * 0.16)}" y2="${f(y + h - corner * 0.8)}"/>`);
    group.push(decoration(item.kind, x, y, width, h, bw));
    // The label: number and description, then the dimensions.
    const dims = `${options.formatDiameter(item.od)}${item.bore === null ? '' : ` / ${options.formatDiameter(item.bore)}`} · ${options.formatLength(item.length)}`;
    const mid = y + h / 2;
    group.push(
      `<line class="bha-leader" x1="${f(x + width + 4)}" y1="${f(mid)}" x2="${LABEL_X - 6}" y2="${f(mid)}"/>`,
      `<text class="bha-label" x="${LABEL_X}" y="${f(mid - 3)}"><tspan class="bha-num">${index + 1}</tspan> ${esc(clip(item.description, 26))}</text>`,
      `<text class="bha-dims" x="${LABEL_X}" y="${f(mid + 10)}">${esc(clip(dims, 34))}</text>`
    );
    parts.push(`<g data-index="${index}">${group.join('')}</g>`);
    // Length column: the height of the string above the bottom of this tool.
    parts.push(`<text class="bha-axis" x="46" y="${f(y + h + 3)}" text-anchor="end">${esc(options.formatLength(fromBottom - item.length))}</text>`, `<line class="bha-tick" x1="50" y1="${f(y + h)}" x2="58" y2="${f(y + h)}"/>`);
    fromBottom -= item.length;
  });

  const top = rows[0].y;
  const bottom = rows[rows.length - 1].y + rows[rows.length - 1].height;
  parts.push(
    `<line class="bha-tick" x1="54" y1="${f(top)}" x2="54" y2="${f(bottom)}"/>`,
    `<line class="bha-tick" x1="50" y1="${f(top)}" x2="58" y2="${f(top)}"/>`,
    `<text class="bha-axis" x="46" y="${f(top + 3)}" text-anchor="end">${esc(options.formatLength(total))}</text>`,
    `<text class="bha-total" x="${CX}" y="${f(height - 4)}" text-anchor="middle">${esc(options.totalLabel)} ${esc(options.formatLength(total))}</text>`
  );
  return `<svg viewBox="0 0 ${W} ${f(height)}" xmlns="http://www.w3.org/2000/svg" role="img">${DEFS}${parts.join('')}</svg>`;
}

/** Shading for the round bodies and the dark bore; the colours come from the page's variables. */
const DEFS = `<defs>
  <linearGradient id="bha-metal" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" class="bha-stop-edge"/>
    <stop offset="0.28" class="bha-stop-light"/>
    <stop offset="0.55" class="bha-stop-mid"/>
    <stop offset="1" class="bha-stop-edge"/>
  </linearGradient>
  <linearGradient id="bha-hole" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" class="bha-stop-edge"/>
    <stop offset="0.5" class="bha-stop-dark"/>
    <stop offset="1" class="bha-stop-edge"/>
  </linearGradient>
</defs>`;
