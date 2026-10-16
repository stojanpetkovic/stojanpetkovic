/**
 * A chart with depth running down the page and a force across it, as a CT
 * weight indicator plot is drawn. Series are polylines; each has a class the
 * page styles, so the colours follow the theme. Returns an SVG string.
 */

export interface DepthSeries {
  /** Stylesheet class: `dc-rih`, `dc-pooh`, `dc-limit`, `dc-critical`. */
  className: string;
  /** Points as [x, depth]. */
  points: [number, number][];
}

export interface DepthChartOptions {
  series: DepthSeries[];
  xLabel: string;
  yLabel: string;
  /** Formats a tick value. */
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  /** A horizontal marker, e.g. the depth being analysed. */
  marker?: { depth: number; label: string };
  width?: number;
  height?: number;
}

/** Round tick positions covering [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!(max > min)) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const step = (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}

const f = (n: number) => Number(n.toFixed(1));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderDepthChart(o: DepthChartOptions): string {
  const W = o.width ?? 420;
  const H = o.height ?? 360;
  const m = { left: 54, right: 12, top: 22, bottom: 38 };
  const all = o.series.flatMap((s) => s.points).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (all.length === 0) return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img"></svg>`;
  let xMin = Math.min(...all.map((p) => p[0]));
  let xMax = Math.max(...all.map((p) => p[0]));
  if (xMin === xMax) {
    xMin -= 1;
    xMax += 1;
  }
  const pad = (xMax - xMin) * 0.05;
  xMin -= pad;
  xMax += pad;
  const yMin = 0;
  const yMax = Math.max(...all.map((p) => p[1]), o.marker?.depth ?? 0);
  const x = (v: number) => m.left + ((v - xMin) / (xMax - xMin)) * (W - m.left - m.right);
  const y = (v: number) => m.top + ((v - yMin) / (yMax - yMin || 1)) * (H - m.top - m.bottom);

  const parts: string[] = [];
  for (const t of niceTicks(xMin, xMax, 5)) {
    parts.push(
      `<line class="dc-grid" x1="${f(x(t))}" y1="${m.top}" x2="${f(x(t))}" y2="${H - m.bottom}"/>`,
      `<text class="dc-tick" x="${f(x(t))}" y="${H - m.bottom + 14}" text-anchor="middle">${esc(o.formatX(t))}</text>`
    );
  }
  for (const t of niceTicks(yMin, yMax, 6)) {
    parts.push(
      `<line class="dc-grid" x1="${m.left}" y1="${f(y(t))}" x2="${W - m.right}" y2="${f(y(t))}"/>`,
      `<text class="dc-tick" x="${m.left - 6}" y="${f(y(t)) + 3}" text-anchor="end">${esc(o.formatY(t))}</text>`
    );
  }
  // The zero line of the force.
  if (xMin < 0 && xMax > 0) parts.push(`<line class="dc-zero" x1="${f(x(0))}" y1="${m.top}" x2="${f(x(0))}" y2="${H - m.bottom}"/>`);
  for (const s of o.series) {
    const pts = s.points.filter(([px, py]) => Number.isFinite(px) && Number.isFinite(py));
    if (pts.length > 1) parts.push(`<polyline class="dc-line ${s.className}" points="${pts.map(([px, py]) => `${f(x(px))},${f(y(py))}`).join(' ')}"/>`);
  }
  if (o.marker) {
    parts.push(
      `<line class="dc-marker" x1="${m.left}" y1="${f(y(o.marker.depth))}" x2="${W - m.right}" y2="${f(y(o.marker.depth))}"/>`,
      `<text class="dc-tick" x="${W - m.right - 2}" y="${f(y(o.marker.depth)) - 4}" text-anchor="end">${esc(o.marker.label)}</text>`
    );
  }
  parts.push(
    `<text class="dc-label" x="${(m.left + W - m.right) / 2}" y="${H - 6}" text-anchor="middle">${esc(o.xLabel)}</text>`,
    `<text class="dc-label" x="12" y="${m.top - 8}">${esc(o.yLabel)}</text>`
  );
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">${parts.join('')}</svg>`;
}
