/**
 * A picture of the whole coiled tubing string for the CT Simulator's Tools
 * step: the reel at the top, the tubing in its wall sections, and the BHA at the
 * bottom. It is schematic: section lengths set the heights (with a minimum so
 * a short section stays visible) and the wall thickness sets the stroke. The
 * labels are given by the page, in its units and language.
 */

export interface StringSection {
  /** Length, ft. */
  length: number;
  /** Wall thickness, in. */
  wall: number;
}

export interface StringDrawingOptions {
  /** CT outside diameter, in. */
  od: number;
  /** Reel core diameter, in; `null` when not entered. */
  reelDiameter: number | null;
  sections: StringSection[];
  bha: { length: number; od: number; tools: number } | null;
  label: {
    reel: string;
    string: string;
    bha: string;
    empty: string;
    formatLength: (ft: number) => string;
    formatDiameter: (inches: number) => string;
    formatWall: (inches: number) => string;
  };
}

const W = 260;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const n = (v: number) => Number(v.toFixed(1));

/** Heights of the sections in the drawing: proportional to the length, at least `min`, together `total` when they can. */
export function sectionHeights(lengths: number[], total = 210, min = 34): number[] {
  const sum = lengths.reduce((a, b) => a + b, 0);
  if (sum <= 0) return lengths.map(() => min);
  const spare = Math.max(0, total - min * lengths.length);
  return lengths.map((l) => min + (spare * l) / sum);
}

export function renderStringSvg(o: StringDrawingOptions): string {
  const sections = o.sections.filter((s) => Number.isFinite(s.length) && s.length > 0 && Number.isFinite(s.wall) && s.wall > 0);
  if (!(o.od > 0) || sections.length === 0) {
    return `<svg viewBox="0 0 ${W} 120" xmlns="http://www.w3.org/2000/svg" role="img"><text class="cs-empty" x="${W / 2}" y="64" text-anchor="middle">${esc(o.label.empty)}</text></svg>`;
  }
  const parts: string[] = [];
  const x = 150;
  const reelCy = 66;
  const reelR = 46;
  const top = reelCy + reelR + 6;

  // Reel: the core and the wrap of tubing around it.
  parts.push(
    `<circle class="cs-reel" cx="64" cy="${reelCy}" r="${reelR}"/>`,
    `<circle class="cs-reel-wrap" cx="64" cy="${reelCy}" r="${reelR - 12}"/>`,
    `<circle class="cs-reel-core" cx="64" cy="${reelCy}" r="12"/>`,
    `<text class="cs-label" x="64" y="${reelCy - reelR - 7}" text-anchor="middle">${esc(o.label.reel)}</text>`,
    `<text class="cs-dims" x="64" y="${reelCy + 4}" text-anchor="middle">${o.reelDiameter ? esc(o.label.formatDiameter(o.reelDiameter)) : '–'}</text>`,
    // The tubing leaves the reel and runs down.
    `<path class="cs-feed" d="M 110 ${reelCy} Q ${x} ${reelCy} ${x} ${reelCy + 36} L ${x} ${top}"/>`
  );

  const heights = sectionHeights(sections.map((s) => s.length));
  const wallMax = Math.max(...sections.map((s) => s.wall));
  let y = top;
  sections.forEach((s, i) => {
    const h = heights[i];
    // Wall thickness sets the stroke; the thickest wall is the widest.
    const stroke = 5 + (s.wall / wallMax) * 7;
    parts.push(
      `<line class="cs-tube" data-section="${i}" x1="${x}" y1="${n(y)}" x2="${x}" y2="${n(y + h)}" stroke-width="${n(stroke)}"/>`,
      `<line class="cs-bore" x1="${x}" y1="${n(y)}" x2="${x}" y2="${n(y + h)}" stroke-width="${n(Math.max(1.5, stroke - 2.4 - (s.wall / wallMax) * 4))}"/>`,
      `<line class="cs-leader" x1="${x + 12}" y1="${n(y + h / 2)}" x2="${x + 24}" y2="${n(y + h / 2)}"/>`,
      `<text class="cs-label" x="${x + 28}" y="${n(y + h / 2 - 2)}">${esc(o.label.formatLength(s.length))}</text>`,
      `<text class="cs-dims" x="${x + 28}" y="${n(y + h / 2 + 10)}">${esc(o.label.formatWall(s.wall))}</text>`
    );
    y += h;
  });

  // The bracket of the string: the OD and the total length.
  const total = sections.reduce((a, s) => a + s.length, 0);
  parts.push(
    `<line class="cs-tick" x1="${x - 24}" y1="${top}" x2="${x - 24}" y2="${n(y)}"/>`,
    `<line class="cs-tick" x1="${x - 28}" y1="${top}" x2="${x - 20}" y2="${top}"/>`,
    `<line class="cs-tick" x1="${x - 28}" y1="${n(y)}" x2="${x - 20}" y2="${n(y)}"/>`,
    `<text class="cs-label" x="${x - 30}" y="${n((top + y) / 2 - 2)}" text-anchor="end">${esc(o.label.string)}</text>`,
    `<text class="cs-dims" x="${x - 30}" y="${n((top + y) / 2 + 10)}" text-anchor="end">${esc(o.label.formatDiameter(o.od))} · ${esc(o.label.formatLength(total))}</text>`
  );

  // The BHA at the end of the string.
  let end = y;
  if (o.bha && o.bha.length > 0) {
    const h = Math.min(64, 30 + o.bha.length * 1.5);
    const ratio = o.od > 0 && o.bha.od > 0 ? Math.min(2.2, Math.max(1, o.bha.od / o.od)) : 1.3;
    const w = 14 * ratio;
    parts.push(
      `<rect class="cs-bha" x="${n(x - w / 2)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="2"/>`,
      `<line class="cs-bha-line" x1="${n(x - w / 2)}" y1="${n(y + h * 0.35)}" x2="${n(x + w / 2)}" y2="${n(y + h * 0.35)}"/>`,
      `<line class="cs-bha-line" x1="${n(x - w / 2)}" y1="${n(y + h * 0.7)}" x2="${n(x + w / 2)}" y2="${n(y + h * 0.7)}"/>`,
      `<line class="cs-leader" x1="${n(x + w / 2 + 4)}" y1="${n(y + h / 2)}" x2="${x + 24}" y2="${n(y + h / 2)}"/>`,
      `<text class="cs-label" x="${x + 28}" y="${n(y + h / 2 - 2)}">${esc(o.label.bha)}</text>`,
      `<text class="cs-dims" x="${x + 28}" y="${n(y + h / 2 + 10)}">${esc(o.label.formatLength(o.bha.length))} · ${o.bha.tools}</text>`
    );
    end = y + h;
  }
  const height = n(end + 20);
  return `<svg viewBox="0 0 ${W} ${height}" xmlns="http://www.w3.org/2000/svg" role="img">${parts.join('')}</svg>`;
}
