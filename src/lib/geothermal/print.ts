/**
 * The printed sheet of the 3D model and the geometry behind it: paper sizes, the frame
 * the visitor places over the model, the measuring tools and the temperature profile
 * under a point. All of it is plain data and plain strings, so it can be tested without
 * a browser; `workspace.ts` reads the model off the page and hands it over.
 */

import {
  COLOR_MAX,
  COLOR_MIN,
  depthFromColumn,
  tempColor,
  tempFromColumn,
  type Column,
} from './field';

export type Paper = 'a4' | 'a3';
export type Orientation = 'landscape' | 'portrait';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sheet sizes in millimetres, short side first. */
const PAPER_MM: Record<Paper, [number, number]> = { a4: [210, 297], a3: [297, 420] };

/** Margin on every side of the sheet, mm. */
export const SHEET_MARGIN_MM = 10;

/** Width over height of the picture on the sheet, and so of the frame over the model. */
export const FRAME_ASPECT = 1.15;

/** Width and height of the sheet in millimetres. */
export function sheetMm(paper: Paper, orientation: Orientation): { w: number; h: number } {
  const [short, long] = PAPER_MM[paper];
  return orientation === 'landscape' ? { w: long, h: short } : { w: short, h: long };
}

/**
 * The picture's box on the sheet, mm. On a landscape sheet the picture takes the left
 * 64 % and the data run down the right; on a portrait sheet it spans the width and the
 * data sit below. Either way it has the aspect of the frame.
 */
export function pictureMm(paper: Paper, orientation: Orientation): { w: number; h: number } {
  const sheet = sheetMm(paper, orientation);
  const content = sheet.w - 2 * SHEET_MARGIN_MM;
  const w = Math.round(orientation === 'landscape' ? content * 0.64 : content);
  return { w, h: Math.round(w / FRAME_ASPECT) };
}

/** Pixels to render the picture at, for a print resolution, capped on the long side. */
export function pictureSize(
  paper: Paper,
  orientation: Orientation,
  dpi = 200,
  cap = 4096,
): { w: number; h: number } {
  const mm = pictureMm(paper, orientation);
  const scale = Math.min(1, cap / Math.max(mm.w, mm.h) / (dpi / 25.4));
  return { w: Math.round((mm.w / 25.4) * dpi * scale), h: Math.round((mm.h / 25.4) * dpi * scale) };
}

/** The `@page` rule that sets the sheet for the browser's print dialog. */
export function pageCss(paper: Paper, orientation: Orientation): string {
  return `@page { size: ${paper.toUpperCase()} ${orientation}; margin: ${SHEET_MARGIN_MM}mm; }`;
}

// ── The frame over the model ───────────────────────────────────────────────────────

/** The frame at first: the largest of the right aspect, centred, at a fraction of the stage. */
export function defaultFrame(stageW: number, stageH: number, fraction = 0.82): Rect {
  const w = Math.min(stageW * fraction, stageH * fraction * FRAME_ASPECT);
  const h = w / FRAME_ASPECT;
  return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
}

/** The frame moved by a drag, kept inside the stage. */
export function moveFrame(r: Rect, dx: number, dy: number, bounds: { w: number; h: number }): Rect {
  return {
    ...r,
    x: Math.min(Math.max(0, r.x + dx), bounds.w - r.w),
    y: Math.min(Math.max(0, r.y + dy), bounds.h - r.h),
  };
}

export type Handle = 'nw' | 'ne' | 'sw' | 'se';

/**
 * The frame resized by dragging a corner: the opposite corner stays where it is, the
 * aspect is kept, and the frame stays inside the stage and above a minimum width.
 */
export function resizeFrame(
  r: Rect,
  handle: Handle,
  dx: number,
  dy: number,
  bounds: { w: number; h: number },
  minW = 140,
): Rect {
  // Drag along the diagonal: how far the dragged corner moved outwards, as a width.
  const east = handle === 'ne' || handle === 'se' ? 1 : -1;
  const south = handle === 'sw' || handle === 'se' ? 1 : -1;
  const grow = (east * dx + south * dy * FRAME_ASPECT) / 2;
  // The corner that stays put.
  const ax = east === 1 ? r.x : r.x + r.w;
  const ay = south === 1 ? r.y : r.y + r.h;
  const roomW = east === 1 ? bounds.w - ax : ax;
  const roomH = south === 1 ? bounds.h - ay : ay;
  const maxW = Math.min(roomW, roomH * FRAME_ASPECT);
  const w = Math.min(Math.max(minW, r.w + grow), Math.max(minW, maxW));
  const h = w / FRAME_ASPECT;
  return { x: east === 1 ? ax : ax - w, y: south === 1 ? ay : ay - h, w, h };
}

// ── Measuring ───────────────────────────────────────────────────────────────────────

/** Distance between two points of the map, km (both in local kilometres). */
export function distanceKm(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Bearing from a to b in degrees clockwise from north, 0 to 360. */
export function bearingDeg(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const deg = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * The scale of the picture on the sheet, as the denominator of 1:n rounded to two figures:
 * the ground width the frame spans against the width of the picture on paper. It holds
 * only for a view from above; seen at an angle the scale changes across the picture.
 */
export function scaleDenominator(groundWidthKm: number, pictureWidthMm: number): number {
  const n = (groundWidthKm * 1_000_000) / pictureWidthMm;
  const digits = Math.floor(Math.log10(n)) - 1;
  const step = 10 ** Math.max(0, digits);
  return Math.round(n / step) * step;
}

/** CSS colour stops of the temperature scale, the same the model paints with. */
export function legendStops(count = 16): string {
  return Array.from({ length: count }, (_, i) => {
    const temp = COLOR_MIN + ((COLOR_MAX - COLOR_MIN) * i) / (count - 1);
    const [r, g, b] = tempColor(temp);
    return `rgb(${r} ${g} ${b}) ${Math.round((i / (count - 1)) * 100)}%`;
  }).join(', ');
}

/** Temperatures labelled under the colour bar, with their position along it in per cent. */
export const LEGEND_TICKS = [10, 40, 70, 100, 125].map((value) => ({
  value,
  left: ((value - COLOR_MIN) / (COLOR_MAX - COLOR_MIN)) * 100,
}));

// ── Temperature profile under a point ──────────────────────────────────────────────

/** Temperature against depth below one atlas column, from the surface down. */
export function profilePoints(
  col: Column,
  maxDepthKm = 2.8,
  step = 0.1,
): { depth: number; temp: number }[] {
  const out: { depth: number; temp: number }[] = [];
  for (let d = 0; d <= maxDepthKm + 1e-9; d += step) {
    out.push({ depth: Math.round(d * 1000) / 1000, temp: tempFromColumn(col, d) });
  }
  return out;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * A small chart of the profile: temperature across, depth down, the three atlas depths
 * marked, and optionally the depth at which a chosen temperature is reached. Colours
 * come from the classes `pf-*`, so the screen and the sheet can style it their own way.
 */
export function profileSvg(
  col: Column,
  o: {
    maxDepthKm?: number;
    contourTemp?: number;
    tempLabel: string;
    depthLabel: string;
    width?: number;
    height?: number;
  },
): string {
  const W = o.width ?? 260;
  const H = o.height ?? 190;
  const maxD = o.maxDepthKm ?? 2.8;
  const m = { l: 34, r: 10, t: 10, b: 26 };
  const x = (t: number) =>
    m.l + (Math.min(Math.max(t, 0), COLOR_MAX) / COLOR_MAX) * (W - m.l - m.r);
  const y = (d: number) => m.t + (d / maxD) * (H - m.t - m.b);
  const line = profilePoints(col, maxD, 0.1)
    .map((p, i) => `${i ? 'L' : 'M'}${x(p.temp).toFixed(1)} ${y(p.depth).toFixed(1)}`)
    .join(' ');
  const grid: string[] = [];
  for (let t = 0; t <= COLOR_MAX; t += 25) {
    grid.push(
      `<line class="pf-grid" x1="${x(t).toFixed(1)}" y1="${m.t}" x2="${x(t).toFixed(1)}" y2="${H - m.b}"/>` +
        `<text class="pf-text" x="${x(t).toFixed(1)}" y="${H - m.b + 12}" text-anchor="middle">${t}</text>`,
    );
  }
  for (let d = 0; d <= maxD + 1e-9; d += 0.5) {
    grid.push(
      `<line class="pf-grid" x1="${m.l}" y1="${y(d).toFixed(1)}" x2="${W - m.r}" y2="${y(d).toFixed(1)}"/>` +
        `<text class="pf-text" x="${m.l - 5}" y="${(y(d) + 3).toFixed(1)}" text-anchor="end">${d}</text>`,
    );
  }
  const dots = [0.5, 1, 2]
    .map((d, i) => {
      const [r, g, b] = tempColor(col[i]);
      return `<circle class="pf-dot" cx="${x(col[i]).toFixed(1)}" cy="${y(d).toFixed(1)}" r="3.5" fill="rgb(${r} ${g} ${b})"/>`;
    })
    .join('');
  let contour = '';
  if (o.contourTemp !== undefined) {
    const d = depthFromColumn(col, o.contourTemp);
    if (d <= maxD) {
      contour =
        `<line class="pf-contour" x1="${m.l}" y1="${y(d).toFixed(1)}" x2="${x(o.contourTemp).toFixed(1)}" y2="${y(d).toFixed(1)}"/>` +
        `<line class="pf-contour" x1="${x(o.contourTemp).toFixed(1)}" y1="${y(d).toFixed(1)}" x2="${x(o.contourTemp).toFixed(1)}" y2="${H - m.b}"/>`;
    }
  }
  return (
    `<svg class="pf" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${o.tempLabel}, ${o.depthLabel}`)}">` +
    grid.join('') +
    `<line class="pf-axis" x1="${m.l}" y1="${m.t}" x2="${m.l}" y2="${H - m.b}"/>` +
    `<line class="pf-axis" x1="${m.l}" y1="${H - m.b}" x2="${W - m.r}" y2="${H - m.b}"/>` +
    contour +
    `<path class="pf-line" d="${line}" fill="none"/>` +
    dots +
    `<text class="pf-text" x="${(m.l + W - m.r) / 2}" y="${H - 2}" text-anchor="middle">${esc(o.tempLabel)}</text>` +
    `<text class="pf-text" x="8" y="${(m.t + H - m.b) / 2}" text-anchor="middle" transform="rotate(-90 8 ${(m.t + H - m.b) / 2})">${esc(o.depthLabel)}</text>` +
    `</svg>`
  );
}

// ── The sheet ─────────────────────────────────────────────────────────────────────

export interface SheetRow {
  label: string;
  value: string;
}

export interface SheetData {
  paper: Paper;
  orientation: Orientation;
  title: string;
  subtitle: string;
  /** Date text, already formatted. */
  date: string;
  /** The picture, as a data URL. */
  image: string;
  imageAlt: string;
  credit: string;
  facts: { title: string; rows: SheetRow[] }[];
  legend: {
    title: string;
    /** CSS `background` of the colour bar. */
    stops: string;
    ticks: { value: number; left: number }[];
    keys: string[];
  };
  /** The point the visitor probed, with its profile chart (an SVG string). */
  point?: { title: string; rows: SheetRow[]; chart: string };
  /** The wells inside the frame. */
  wells: { title: string; head: string[]; rows: string[][]; empty: string };
  /** The well the visitor selected, one line per tested interval. */
  selected?: { title: string; rows: SheetRow[]; tests: string[] };
  notes: { title: string; items: string[] };
  footer: string;
}

const facts = (rows: SheetRow[]) =>
  `<table class="gs-table gs-facts"><tbody>${rows
    .map((r) => `<tr><th>${esc(r.label)}</th><td>${esc(r.value)}</td></tr>`)
    .join('')}</tbody></table>`;

/** The sheet as HTML: a title, the picture, the legend and settings, the wells and the notes. */
export function buildSheet(d: SheetData): string {
  const p = pictureMm(d.paper, d.orientation);
  const side: string[] = [];
  side.push(
    `<section class="gs-block"><h2>${esc(d.legend.title)}</h2>` +
      `<div class="gs-bar" style="background: linear-gradient(to right, ${d.legend.stops})"></div>` +
      `<div class="gs-ticks">${d.legend.ticks.map((t) => `<span style="left:${t.left}%">${t.value}</span>`).join('')}</div>` +
      `<ul class="gs-keys">${d.legend.keys.map((k) => `<li>${esc(k)}</li>`).join('')}</ul></section>`,
  );
  for (const f of d.facts) {
    side.push(`<section class="gs-block"><h2>${esc(f.title)}</h2>${facts(f.rows)}</section>`);
  }
  if (d.point) {
    side.push(
      `<section class="gs-block"><h2>${esc(d.point.title)}</h2>${facts(d.point.rows)}<div class="gs-chart">${d.point.chart}</div></section>`,
    );
  }
  const wells = d.wells.rows.length
    ? `<table class="gs-table gs-grid"><thead><tr>${d.wells.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${d.wells.rows
        .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : `<p class="gs-empty">${esc(d.wells.empty)}</p>`;
  const selected = d.selected
    ? `<section class="gs-block gs-selected"><h2>${esc(d.selected.title)}</h2>${facts(d.selected.rows)}<ul class="gs-notes">${d.selected.tests
        .map((t) => `<li>${esc(t)}</li>`)
        .join('')}</ul></section>`
    : '';
  return (
    `<article class="geo-sheet geo-sheet--${d.orientation} geo-sheet--${d.paper}" style="--gs-picture:${p.w}mm">` +
    `<header class="gs-head"><div><h1>${esc(d.title)}</h1><p>${esc(d.subtitle)}</p></div><p class="gs-date">${esc(d.date)}</p></header>` +
    `<div class="gs-body"><figure class="gs-picture"><img src="${esc(d.image)}" alt="${esc(d.imageAlt)}"><figcaption>${esc(d.credit)}</figcaption></figure>` +
    `<aside class="gs-side">${side.join('')}</aside></div>` +
    `<section class="gs-block gs-wells"><h2>${esc(d.wells.title)}</h2>${wells}</section>${selected}` +
    `<footer class="gs-foot"><h2>${esc(d.notes.title)}</h2><ul class="gs-notes">${d.notes.items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><p>${esc(d.footer)}</p></footer>` +
    `</article>`
  );
}
