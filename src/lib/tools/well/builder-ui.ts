/**
 * Browser side of the Well Builder page: the drag-and-drop schematic, the item
 * editor, the survey table and the 3D view, wired to one well state that is
 * saved in the browser.
 *
 * The page supplies the markup and the copy (a JSON block); this module reads
 * both, so no text is written here. Items are dragged from the palette onto the
 * schematic, moved and resized there with the pointer, and edited by number in
 * the editor, which is also the way to do it by keyboard.
 */
import { pipeProperties, sizeLabel, type ApiPipe } from './api-pipe';
import {
  CT_WALLS, ITEM_TYPES, apiKind, createItem, emptyWell, exampleWell, isPipe, isTubingTool, itemErrors, itemSize, newId,
  readWell, sizeOptions, snapStep, toUnit, weightOptions, withSize, withWeight, type ItemType, type WellItem, type WellState,
} from './model';
import { minimumCurvature, parseSurvey, pointAt, summarise, type DepthUnit, type PathPoint, type SurveyError } from './survey';
import { WellViewer, type ViewData } from './viewer3d';

export interface BuilderCopy {
  types: Record<ItemType, string>;
  editor: Record<string, string>;
  canvas: Record<string, string>;
  survey: { errors: Record<SurveyError['code'], string>; table: Record<string, string>; summary: Record<string, string> };
  view: Record<string, string>;
  marker: Record<string, string>;
  data: Record<string, string>;
  print: Record<string, string>;
}

const STORAGE_KEY = 'well-builder:v1';
const VIEW_W = 520;
const TOP = 62;
const PLOT_H = 560;
const LEFT = 64;
const MAX_WIDTH = 82;
const CENTRE = LEFT + MAX_WIDTH / 2 + 30;

/** A detail line with the item's own note after it. */
const withNote = (detail: string, item: WellItem) => (item.note ? `${detail} · ${item.note}` : detail);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (raw: string) => Number(raw.trim().replace(',', '.'));
const fmt = (n: number, digits = 0) => n.toLocaleString(document.documentElement.lang || 'en', { maximumFractionDigits: digits });

/** A step of 1, 2 or 5 times a power of ten, for about n steps over a span. */
function niceStep(span: number, n: number): number {
  const raw = span / n;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}

const COLOUR: Record<ItemType, string> = {
  casing: 'var(--color-foreground-muted)',
  liner: 'var(--color-foreground-subtle)',
  tubing: 'var(--color-brand-600)',
  ct: 'var(--cta)',
  packer: 'var(--color-foreground)',
  nipple: 'var(--color-foreground-subtle)',
  sleeve: 'var(--color-brand-800)',
  perforation: 'var(--destructive)',
};

export class WellBuilder {
  private state: WellState;
  private selected: string | null = null;
  private path: PathPoint[] = [];
  private surveyError: SurveyError | null = null;
  private viewer: WellViewer;
  private geometry = { maxDepth: 1000, perUnit: 0.56 };
  /** The scale held fixed while an item is dragged, so the drawing does not rescale under the pointer. */
  private locked: { maxDepth: number; perUnit: number } | null = null;

  private svg: SVGSVGElement;
  private editor: HTMLElement;

  constructor(
    private root: HTMLElement,
    private copy: BuilderCopy
  ) {
    this.svg = root.querySelector<SVGSVGElement>('#wb-svg')!;
    this.editor = root.querySelector<HTMLElement>('#wb-editor')!;
    this.viewer = new WellViewer(root.querySelector<HTMLCanvasElement>('#wb-3d')!, {
      north: copy.view.north,
      east: copy.view.east,
      depth: copy.view.depth,
      low: copy.view.low,
      high: copy.view.high,
    });
    this.state = this.load() ?? emptyWell('ft');
    this.bind();
    this.refreshAll();
  }

  // ---- state ------------------------------------------------------------

  private load(): WellState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? readWell(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* private mode or storage blocked: the well still works, it just is not remembered */
    }
  }

  private get unit(): DepthUnit {
    return this.state.unit;
  }

  private item(id: string | null) {
    return this.state.items.find((i) => i.id === id);
  }

  private update(change: (items: WellItem[]) => WellItem[], rerenderEditor = true) {
    this.state = { ...this.state, items: change(this.state.items) };
    this.save();
    this.renderSchematic();
    if (rerenderEditor) this.renderEditor();
    this.updateView();
  }

  private replace(id: string, next: WellItem, rerenderEditor = true) {
    this.update((items) => items.map((i) => (i.id === id ? next : i)), rerenderEditor);
  }

  // ---- wiring -----------------------------------------------------------

  private bind() {
    const root = this.root;
    root.querySelectorAll<HTMLElement>('[data-add]').forEach((tile) => this.bindPaletteTile(tile));
    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach((b) =>
      b.addEventListener('click', () => this.switchUnit(b.dataset.unit as DepthUnit))
    );
    root.querySelector('#wb-example')?.addEventListener('click', () => {
      if (this.state.items.length > 0 && !confirm(this.copy.data.confirmExample)) return;
      this.state = exampleWell(this.unit);
      this.selected = null;
      this.afterReplace();
    });
    root.querySelector('#wb-reset')?.addEventListener('click', () => {
      if (!confirm(this.copy.data.confirmReset)) return;
      this.state = emptyWell(this.unit);
      this.selected = null;
      this.afterReplace();
    });
    root.querySelector('#wb-export')?.addEventListener('click', () => this.exportJson());
    root.querySelector('#wb-print')?.addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', () => this.beforePrint());
    window.addEventListener('afterprint', () => this.afterPrint());
    root.querySelector<HTMLInputElement>('#wb-import')?.addEventListener('change', (e) => this.importFile(e, 'json'));
    root.querySelector<HTMLInputElement>('#wb-survey-file')?.addEventListener('change', (e) => this.importFile(e, 'survey'));
    root.querySelector('#wb-survey-clear')?.addEventListener('click', () => {
      this.state = { ...this.state, survey: '' };
      this.afterReplace();
    });
    root.querySelector<HTMLTextAreaElement>('#wb-survey')?.addEventListener('input', (e) => {
      this.state = { ...this.state, survey: (e.target as HTMLTextAreaElement).value };
      this.save();
      this.refreshSurvey();
      this.updateView();
    });
    root.querySelectorAll<HTMLElement>('[data-view]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = b.dataset.view!;
        if (v === 'in') this.viewer.zoomBy(1.3);
        else if (v === 'out') this.viewer.zoomBy(1 / 1.3);
        else this.viewer.preset(v as 'top' | 'side' | 'reset');
      })
    );
    this.svg.addEventListener('pointerdown', (e) => this.onSchematicDown(e));
    this.editor.addEventListener('change', (e) => this.onEditorChange(e));
    this.editor.addEventListener('click', (e) => this.onEditorClick(e));
  }

  private afterReplace() {
    this.save();
    this.refreshAll();
  }

  private refreshAll() {
    const textarea = this.root.querySelector<HTMLTextAreaElement>('#wb-survey');
    if (textarea) textarea.value = this.state.survey;
    this.root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.unit === this.unit))
    );
    this.root.querySelectorAll<HTMLElement>('[data-unit-label]').forEach((el) => (el.textContent = this.unit));
    this.renderSchematic();
    this.renderEditor();
    this.refreshSurvey();
    this.updateView();
  }

  private switchUnit(next: DepthUnit) {
    if (next === this.unit) return;
    const from = this.unit;
    const round = (n: number) => Math.round(n * 10) / 10;
    const items = this.state.items.map((i) => ({ ...i, top: round(toUnit(i.top, from, next)), bottom: round(toUnit(i.bottom, from, next)) }));
    // Re-write the measured depths of the survey in the new unit.
    let survey = this.state.survey;
    const parsed = parseSurvey(survey);
    if (parsed.stations) {
      survey = ['MD,Inc,Azi', ...parsed.stations.map((s) => `${round(toUnit(s.md, from, next))},${s.inclination},${s.azimuth}`)].join('\n');
    }
    this.state = { unit: next, items, survey };
    this.save();
    this.refreshAll();
  }

  // ---- print ------------------------------------------------------------

  private printed: string | null | undefined;

  /** Turns the page into a report: no selection or handles, the components as a table, the 3D view as a picture. */
  private beforePrint() {
    this.printed = this.selected;
    this.selected = null;
    this.renderSchematic();
    const c = this.copy;
    const url = `${location.host}${location.pathname}`;
    const lang = document.documentElement.lang || 'en';
    const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date());
    document.querySelectorAll('[data-print-url]').forEach((el) => (el.textContent = url));
    const foot = this.root.querySelector<HTMLElement>('#wb-print-foot');
    if (foot) {
      const signed = foot.dataset.signed === 'true' ? `${c.print.generated.replace('{url}', url).replace('{date}', date)} ` : '';
      foot.textContent = `${signed}${foot.dataset.note ?? ''}`.trim();
    }
    // What goes into the report: the well data and the 3D view are optional, the schematic is always there.
    this.root.classList.toggle('wb-print-no-data', !this.root.querySelector<HTMLInputElement>('#wb-print-data')?.checked);
    this.root.classList.toggle('wb-print-no-3d', !this.root.querySelector<HTMLInputElement>('#wb-print-3d')?.checked);

    const table = this.root.querySelector<HTMLElement>('#wb-print-table');
    if (table) {
      const inches = (n: number) => `${fmt(n, 3)} in`;
      const rows = [...this.state.items]
        .sort((a, b) => a.top - b.top || a.bottom - b.bottom)
        .map((i) => {
          const pipe = isPipe(i.type);
          const properties = pipe ? pipeProperties({ kind: apiKind(i.type) ?? 'tubing', od: i.od, weight: i.weight, wall: i.wall }) : null;
          const size = i.type === 'perforation' ? '' : `${sizeLabel(i.od)}"`;
          return `<tr><td>${esc(c.types[i.type])}</td><td>${esc(size)}</td><td>${apiKind(i.type) ? `${i.weight} lb/ft` : ''}</td><td>${properties ? inches(properties.id) : ''}</td><td>${properties && apiKind(i.type) ? inches(properties.drift) : ''}</td><td>${fmt(i.top)}</td><td>${fmt(i.bottom)}</td><td>${fmt(i.bottom - i.top)}</td></tr>`;
        })
        .join('');
      const e = c.editor;
      const head = [c.print.type, c.print.size, c.print.weight, e.id, e.drift, `${e.top} (${this.unit})`, `${e.bottom} (${this.unit})`, `${c.print.length} (${this.unit})`];
      table.innerHTML = `<table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    }
    this.viewer.draw();
    const picture = this.root.querySelector<HTMLImageElement>('#wb-3d-print');
    const canvas = this.root.querySelector<HTMLCanvasElement>('#wb-3d');
    if (picture && canvas) picture.src = canvas.toDataURL('image/png');
  }

  private afterPrint() {
    if (this.printed === undefined) return;
    this.selected = this.item(this.printed) ? this.printed : null;
    this.printed = undefined;
    this.renderSchematic();
    this.renderEditor();
  }

  // ---- files ------------------------------------------------------------

  private exportJson() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'well.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  private importFile(event: Event, kind: 'json' | 'survey') {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    file.text().then((text) => {
      if (kind === 'survey') {
        this.state = { ...this.state, survey: text };
      } else {
        let well: WellState | null = null;
        try {
          well = readWell(JSON.parse(text));
        } catch {
          well = null;
        }
        if (!well) {
          alert(this.copy.data.importError);
          return;
        }
        this.state = well;
        this.selected = null;
      }
      this.afterReplace();
    });
  }

  // ---- schematic --------------------------------------------------------

  private y(depth: number) {
    return TOP + depth * this.geometry.perUnit;
  }

  private depthAt(clientY: number): number {
    const matrix = this.svg.getScreenCTM();
    if (!matrix) return 0;
    const point = this.svg.createSVGPoint();
    point.x = 0;
    point.y = clientY;
    const inner = point.matrixTransform(matrix.inverse());
    return (inner.y - TOP) / this.geometry.perUnit;
  }

  private snap(depth: number) {
    const step = snapStep(this.unit);
    return Math.max(0, Math.round(depth / step) * step);
  }

  /** Pattern and gradient definitions of the drawing: steel hatching, rubber, ground and a cylinder shine. */
  private static DEFS = `<defs>
    <pattern id="wb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#fff" stroke-opacity="0.4" stroke-width="1.1"/></pattern>
    <pattern id="wb-rubber" width="5" height="5" patternUnits="userSpaceOnUse"><rect width="5" height="5" fill="#2b2b2b"/><path d="M0 0L5 5M5 0L0 5" stroke="#8a8a8a" stroke-width="0.7"/></pattern>
    <pattern id="wb-ground" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#222" stroke-width="1.3"/></pattern>
    <linearGradient id="wb-shine" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.38"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.22"/></linearGradient>
  </defs>`;

  private renderSchematic() {
    const items = this.state.items;
    const pipes = items.filter((i) => isPipe(i.type));
    const deepest = Math.max(0, ...items.map((i) => i.bottom));
    const floor = this.unit === 'ft' ? 1000 : 300;
    const step = niceStep(Math.max(floor, deepest * 1.1), 10);
    const maxDepth = Math.max(floor, Math.ceil((deepest * 1.1) / step) * step);
    this.geometry = this.locked ?? { maxDepth, perUnit: PLOT_H / maxDepth };

    const maxOd = Math.max(5, ...items.filter((i) => i.type !== 'perforation').map((i) => i.od));
    // The strings are drawn close together: the width grows a little slower than the diameter.
    const widthOf = (od: number) => Math.max(10, MAX_WIDTH * (od / maxOd) ** 0.75);
    // Tubing is drawn a fifth narrower than its diameter alone would give, so the string reads as slim.
    const sizeOf = (item: WellItem) => widthOf(item.od) * (item.type === 'tubing' ? 0.8 : 1);
    const wallOf = (item: WellItem) => Math.max(3, (item.wall * sizeOf(item)) / item.od);
    const INK = 'var(--color-foreground)';
    // The innermost casing or liner that reaches a depth: what a packer seals against and perforations pass through.
    const hostAt = (depth: number) =>
      pipes
        .filter((i) => (i.type === 'casing' || i.type === 'liner') && i.top <= depth && i.bottom >= depth)
        .sort((a, b) => a.od - b.od)[0];

    // Equipment symbols are larger than their length at this scale, so they are stacked upwards from the deepest
    // one, which keeps its depth, with a small gap; the true depth stays in the label. The tubing string runs down
    // through the last one.
    const equipment = items
      .filter((i) => i.type === 'packer' || i.type === 'nipple' || i.type === 'sleeve')
      .sort((a, b) => b.top - a.top || b.bottom - a.bottom);
    const placed = new Map<string, { y: number; h: number }>();
    let nextTop = Infinity;
    for (const item of equipment) {
      const minimum = item.type === 'packer' ? 26 : item.type === 'nipple' ? 15 : 19;
      const h = Math.max(minimum, this.y(item.bottom) - this.y(item.top));
      const y = Math.max(TOP, Math.min(this.y(item.top), nextTop - 6 - h));
      placed.set(item.id, { y, h });
      nextTop = y;
    }
    const stringBottom = (item: WellItem) =>
      Math.max(
        this.y(item.bottom),
        ...equipment.filter((e) => e.top <= item.bottom && item.type === 'tubing').map((e) => placed.get(e.id)!.y + placed.get(e.id)!.h)
      );

    let svg = WellBuilder.DEFS;
    const y0 = this.y(0);
    const widest = Math.max(0, ...pipes.map((i) => sizeOf(i)));

    // Depth grid and axis.
    for (let d = 0; d <= maxDepth; d += step) {
      svg += `<line x1="${LEFT - 6}" x2="${VIEW_W - 10}" y1="${this.y(d)}" y2="${this.y(d)}" class="wb-grid"/>`;
      svg += `<line x1="${LEFT - 6}" x2="${LEFT}" y1="${this.y(d)}" y2="${this.y(d)}" class="wb-tick"/>`;
      svg += `<text x="${LEFT - 10}" y="${this.y(d) + 4}" text-anchor="end" class="wb-axis">${fmt(d)}</text>`;
    }
    svg += `<line x1="${LEFT}" x2="${LEFT}" y1="${y0}" y2="${this.y(maxDepth)}" class="wb-tick"/>`;
    svg += `<text x="6" y="${y0 - 18}" class="wb-axis">MD, ${this.unit}</text>`;
    if (items.length === 0) {
      svg += `<text x="${CENTRE}" y="${TOP + 120}" text-anchor="middle" class="wb-empty">${esc(this.copy.canvas.empty)}</text>`;
    }

    // Ground and wellhead: a heavy surface line, hatched ground on both sides of the well and a label.
    const groundLeft = LEFT + 4;
    const groundRight = VIEW_W - 12;
    svg += `<rect x="${groundLeft}" y="${y0}" width="${CENTRE - widest / 2 + 6 - groundLeft}" height="14" fill="url(#wb-ground)"/>`;
    svg += `<rect x="${CENTRE + widest / 2 - 6}" y="${y0}" width="${groundRight - (CENTRE + widest / 2 - 6)}" height="14" fill="url(#wb-ground)"/>`;
    svg += `<line x1="${LEFT}" x2="${VIEW_W - 10}" y1="${y0}" y2="${y0}" stroke="${INK}" stroke-width="2.6"/>`;
    svg += `<text x="${CENTRE + widest / 2 + 48}" y="${y0 - 6}" class="wb-label wb-label-selected">${esc(this.copy.canvas.surface)}</text>`;
    const head = Math.max(34, widest * 0.3);
    svg += `<g class="wb-overlay" stroke="${INK}" stroke-width="0.8" fill="var(--color-foreground-muted)">`;
    svg += `<rect x="${CENTRE - head / 2}" y="${y0 - 26}" width="${head}" height="26"/>`;
    svg += `<rect x="${CENTRE - head / 3}" y="${y0 - 38}" width="${(head * 2) / 3}" height="12"/>`;
    svg += `<rect x="${CENTRE - head / 2 - 20}" y="${y0 - 20}" width="20" height="9"/><rect x="${CENTRE + head / 2}" y="${y0 - 20}" width="20" height="9"/>`;
    svg += `</g>`;

    // Pipes, the largest first so the smaller ones sit inside them. Only the walls take the pointer.
    const ordered = [...pipes].sort((a, b) => b.od - a.od || a.top - b.top);
    for (const item of ordered) {
      const w = sizeOf(item);
      const wall = wallOf(item);
      const inner = Math.max(2, w - 2 * wall);
      const x = CENTRE - w / 2;
      const y1 = this.y(item.top);
      const y2 = stringBottom(item);
      const sel = item.id === this.selected ? ' wb-selected' : '';
      const colour = COLOUR[item.type];
      const wallRect = (wx: number) =>
        `<rect x="${wx}" y="${y1}" width="${wall}" height="${y2 - y1}" fill="${colour}" stroke="${INK}" stroke-width="0.8"/>` +
        `<rect x="${wx}" y="${y1}" width="${wall}" height="${y2 - y1}" fill="url(#wb-hatch)" class="wb-overlay"/>` +
        `<rect x="${wx}" y="${y1}" width="${wall}" height="${y2 - y1}" fill="url(#wb-shine)" class="wb-overlay"/>`;
      svg += `<g data-id="${item.id}" class="wb-item${sel}">`;
      svg += `<rect x="${CENTRE - inner / 2}" y="${y1}" width="${inner}" height="${y2 - y1}" class="wb-bore"/>`;
      svg += wallRect(x) + wallRect(x + w - wall);
      if (item.type === 'ct') {
        // A coiled tubing string ends in a nozzle.
        svg += `<polygon points="${CENTRE - inner / 2},${y2} ${CENTRE + inner / 2},${y2} ${CENTRE + inner / 2 - 2},${y2 + 7} ${CENTRE - inner / 2 + 2},${y2 + 7}" fill="${colour}" stroke="${INK}" stroke-width="0.8"/>`;
      } else {
        // A shoe: the wall thickened and bevelled inwards at the bottom.
        const bevel = `fill="${colour}" stroke="${INK}" stroke-width="0.8"`;
        svg += `<polygon points="${x - 3},${y2 - 9} ${x + wall},${y2 - 9} ${x + wall + 9},${y2} ${x - 3},${y2}" ${bevel}/>`;
        svg += `<polygon points="${x + w + 3},${y2 - 9} ${x + w - wall},${y2 - 9} ${x + w - wall - 9},${y2} ${x + w + 3},${y2}" ${bevel}/>`;
      }
      svg += `</g>`;
    }

    // Packers: a mandrel, slips above and below and a rubber element that seals against the casing.
    const callouts: { y: number; x: number; name: string; detail: string; id: string }[] = [];
    for (const item of items) {
      const sel = item.id === this.selected ? ' wb-selected' : '';
      const slot = placed.get(item.id);
      const y1 = slot ? slot.y : this.y(item.top);
      if (item.type === 'packer') {
        const host = hostAt(item.top);
        // The element seals against the casing it sits in, so it is drawn touching the wall.
        const seal = host ? sizeOf(host) - 2 * wallOf(host) : widthOf(item.od);
        const w = Math.max(16, seal);
        const tubing = pipes.find((i) => i.type === 'tubing' && i.top <= item.top && i.bottom >= item.top);
        const tubingW = tubing ? sizeOf(tubing) : 12;
        const m = Math.max(10, tubingW) + 5;
        const boreW = Math.max(4, tubing ? tubingW - 2 * wallOf(tubing) : 6);
        const h = slot!.h;
        const cx = CENTRE;
        svg += `<g data-id="${item.id}" class="wb-item${sel}" stroke="${INK}" stroke-width="0.8">`;
        svg += `<rect x="${cx - m / 2}" y="${y1}" width="${m}" height="${h}" fill="${INK}"/>`;
        svg += `<rect x="${cx - w / 2}" y="${y1 + h * 0.3}" width="${w}" height="${h * 0.4}" rx="2" fill="url(#wb-rubber)"/>`;
        for (const side of [-1, 1]) {
          const edge = cx + (side * w) / 2;
          const near = cx + (side * m) / 2;
          svg += `<polygon points="${near},${y1 + 2} ${edge},${y1 + h * 0.3} ${near},${y1 + h * 0.3}" fill="${INK}"/>`;
          svg += `<polygon points="${near},${y1 + h * 0.7} ${edge},${y1 + h * 0.7} ${near},${y1 + h - 2}" fill="${INK}"/>`;
        }
        svg += `<rect x="${cx - boreW / 2}" y="${y1}" width="${boreW}" height="${h}" class="wb-bore"/>`;
        svg += `</g>`;
        callouts.push({ y: y1 + h / 2, x: cx + w / 2 + 4, name: `${this.copy.types.packer} ${itemSize(item)}`, detail: withNote(`${fmt(item.top)} ${this.unit}`, item), id: item.id });
      } else if (isTubingTool(item.type)) {
        // A landing nipple (a seat with lock grooves and a narrower bore) or a sliding sleeve (ports in the body
        // and an inner sleeve), both made up in the tubing string.
        const tubing = pipes.find((i) => i.type === 'tubing' && i.top <= item.top && i.bottom >= item.top);
        const tubingW = tubing ? sizeOf(tubing) : widthOf(item.od) * 0.8;
        const tubingBore = tubing ? tubingW - 2 * wallOf(tubing) : tubingW * 0.6;
        const w = tubingW + 5;
        const h = slot!.h;
        const cx = CENTRE;
        svg += `<g data-id="${item.id}" class="wb-item${sel}" stroke="${INK}" stroke-width="0.8">`;
        svg += `<rect x="${cx - w / 2}" y="${y1}" width="${w}" height="${h}" rx="2" fill="${COLOUR[item.type]}"/>`;
        svg += `<rect x="${cx - w / 2}" y="${y1}" width="${w}" height="${h}" rx="2" fill="url(#wb-hatch)" class="wb-overlay"/>`;
        if (item.type === 'nipple') {
          const seat = Math.max(3, tubingBore * 0.6);
          svg += `<rect x="${cx - tubingBore / 2}" y="${y1}" width="${tubingBore}" height="${h * 0.7}" class="wb-bore"/>`;
          svg += `<rect x="${cx - seat / 2}" y="${y1 + h * 0.7}" width="${seat}" height="${h * 0.3}" class="wb-bore"/>`;
          for (const f of [0.2, 0.38, 0.54]) {
            svg += `<line x1="${cx - tubingBore / 2 - 3}" x2="${cx - tubingBore / 2}" y1="${y1 + h * f}" y2="${y1 + h * f}" stroke="#fff" stroke-width="1.6"/>`;
            svg += `<line x1="${cx + tubingBore / 2}" x2="${cx + tubingBore / 2 + 3}" y1="${y1 + h * f}" y2="${y1 + h * f}" stroke="#fff" stroke-width="1.6"/>`;
          }
        } else {
          svg += `<rect x="${cx - tubingBore / 2}" y="${y1}" width="${tubingBore}" height="${h}" class="wb-bore"/>`;
          svg += `<rect x="${cx - tubingBore / 2}" y="${y1 + h * 0.12}" width="${tubingBore}" height="${h * 0.76}" fill="none" stroke-dasharray="3 2"/>`;
          for (const f of [0.3, 0.62]) {
            for (const side of [-1, 1]) {
              const edge = cx + (side * tubingBore) / 2;
              svg += `<rect x="${side < 0 ? edge - (w - tubingBore) / 2 : edge}" y="${y1 + h * f}" width="${(w - tubingBore) / 2}" height="4" fill="#fff"/>`;
            }
          }
        }
        svg += `</g>`;
        callouts.push({ y: y1 + h / 2, x: cx + w / 2 + 4, name: `${this.copy.types[item.type]} ${itemSize(item)}`, detail: withNote(`${fmt(item.top)} ${this.unit}`, item), id: item.id });
      } else if (item.type === 'perforation') {
        const host = hostAt(item.top) ?? hostAt(item.bottom) ?? [...pipes].sort((a, b) => a.od - b.od)[0];
        const hostW = host ? sizeOf(host) : widest || 40;
        const wall = host ? wallOf(host) : 6;
        const yb = Math.max(this.y(item.bottom), y1 + 16);
        const rows = Math.max(3, Math.round((yb - y1) / 7));
        svg += `<g data-id="${item.id}" class="wb-item${sel}" stroke="${COLOUR.perforation}" fill="${COLOUR.perforation}" stroke-width="1.2">`;
        for (let r = 0; r < rows; r++) {
          const yy = y1 + ((r + 0.5) * (yb - y1)) / rows;
          for (const side of [-1, 1]) {
            const inside = CENTRE + side * (hostW / 2 - wall);
            const out = CENTRE + side * (hostW / 2 + 14);
            svg += `<line x1="${inside}" x2="${out - side * 4}" y1="${yy}" y2="${yy}"/><polygon points="${out},${yy} ${out - side * 6},${yy - 3} ${out - side * 6},${yy + 3}" stroke="none"/>`;
          }
        }
        svg += `<rect x="${CENTRE - hostW / 2 - 14}" y="${y1 - 2}" width="${hostW + 28}" height="${yb - y1 + 4}" fill="transparent" stroke="none"/>`;
        svg += `</g>`;
        callouts.push({ y: (y1 + yb) / 2, x: CENTRE + hostW / 2 + 16, name: this.copy.types.perforation, detail: withNote(`${fmt(item.top)}–${fmt(item.bottom)} ${this.unit}`, item), id: item.id });
      } else {
        const w = sizeOf(item);
        callouts.push({ y: this.y(item.bottom), x: CENTRE + w / 2 + 4, name: `${this.copy.types[item.type]} ${itemSize(item)}`, detail: withNote(`${fmt(item.top)}–${fmt(item.bottom)} ${this.unit}`, item), id: item.id });
      }
    }

    // Callouts: a label for each item in a column on the right, joined to it by a leader line.
    const labelX = CENTRE + widest / 2 + 48;
    let lastY = -Infinity;
    for (const c of callouts.sort((a, b) => a.y - b.y)) {
      const ly = Math.max(c.y, lastY + 27);
      lastY = ly;
      const sel = c.id === this.selected ? ' wb-label-selected' : '';
      svg += `<polyline points="${c.x},${c.y} ${labelX - 8},${ly - 3}" class="wb-leader"/><circle cx="${c.x}" cy="${c.y}" r="2" class="wb-leader-dot"/>`;
      svg += `<text x="${labelX}" y="${ly}" class="wb-label${sel}">${esc(c.name)}<tspan x="${labelX}" dy="12" class="wb-detail">${esc(c.detail)}</tspan></text>`;
    }

    // Handles on the selected item.
    const selected = this.item(this.selected);
    if (selected) {
      const slot = placed.get(selected.id);
      for (const which of ['top', 'bottom'] as const) {
        const cy = slot ? (which === 'top' ? slot.y : slot.y + slot.h) : this.y(selected[which]);
        svg += `<circle data-handle="${which}" data-id="${selected.id}" cx="${CENTRE}" cy="${cy}" r="7" class="wb-handle"/>`;
      }
    }

    svg += `<text x="${LEFT}" y="${TOP + PLOT_H + 18}" class="wb-axis">${esc(this.copy.canvas.notToScale)}</text>`;
    this.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${TOP + PLOT_H + 28}`);
    this.svg.innerHTML = svg;
  }

  private onSchematicDown(event: PointerEvent) {
    const target = (event.target as Element).closest<SVGElement>('[data-id]');
    if (!target) {
      this.selected = null;
      this.renderSchematic();
      this.renderEditor();
      return;
    }
    const id = target.dataset.id!;
    const handle = (event.target as SVGElement).dataset.handle as 'top' | 'bottom' | undefined;
    const original = this.item(id);
    if (!original) return;
    this.selected = id;
    this.renderSchematic();
    this.renderEditor();
    event.preventDefault();

    this.locked = { ...this.geometry };
    const startDepth = this.depthAt(event.clientY);
    const limit = this.geometry.maxDepth;
    const move = (e: PointerEvent) => {
      const delta = this.depthAt(e.clientY) - startDepth;
      const current = this.item(id);
      if (!current) return;
      let { top, bottom } = original;
      const step = snapStep(this.unit);
      if (handle === 'top') top = Math.min(this.snap(original.top + delta), bottom - step);
      else if (handle === 'bottom') bottom = Math.min(limit, Math.max(this.snap(original.bottom + delta), top + step));
      else {
        const shift = Math.min(limit - original.bottom, Math.max(-original.top, Math.round(delta / step) * step));
        top = original.top + shift;
        bottom = original.bottom + shift;
      }
      if (top === current.top && bottom === current.bottom) return;
      this.replace(id, { ...current, top, bottom }, false);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.locked = null;
      this.renderSchematic();
      this.renderEditor();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ---- palette ----------------------------------------------------------

  private defaultDepth(type: ItemType): number {
    const thousand = this.unit === 'ft' ? 1000 : 300;
    const items = this.state.items;
    const deepest = (types: ItemType[]) => Math.max(0, ...items.filter((i) => types.includes(i.type)).map((i) => i.bottom));
    const casing = deepest(['casing', 'liner']);
    switch (type) {
      case 'casing':
        return casing + thousand;
      case 'liner':
        return Math.max(thousand, casing - thousand / 5);
      case 'tubing':
        return Math.max(thousand, casing * 0.9);
      case 'ct':
        return Math.max(thousand, deepest(['tubing']) * 0.85 || casing * 0.8);
      case 'packer':
        return Math.max(thousand / 2, (deepest(['tubing']) || casing) - thousand / 30);
      case 'nipple':
        // Just above the packer, or near the bottom of the tubing.
        return Math.max(thousand / 2, (deepest(['tubing']) || casing) - thousand / 10);
      case 'sleeve':
        return Math.max(thousand / 2, (deepest(['tubing']) || casing) - thousand / 3);
      case 'perforation':
        return Math.max(thousand / 2, (casing || thousand * 2) - thousand / 5);
    }
  }

  private bindPaletteTile(tile: HTMLElement) {
    tile.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const type = tile.dataset.add as ItemType;
      const start = { x: event.clientX, y: event.clientY };
      let ghost: HTMLElement | null = null;
      const move = (e: PointerEvent) => {
        if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
          ghost = tile.cloneNode(true) as HTMLElement;
          ghost.className += ' wb-ghost';
          document.body.appendChild(ghost);
        }
        if (ghost) {
          ghost.style.left = `${e.clientX + 8}px`;
          ghost.style.top = `${e.clientY + 8}px`;
        }
      };
      const up = (e: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        ghost?.remove();
        let depth: number;
        if (ghost) {
          const box = this.svg.getBoundingClientRect();
          const inside = e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
          if (!inside) return;
          depth = this.snap(this.depthAt(e.clientY));
        } else {
          depth = this.snap(this.defaultDepth(type));
        }
        const item = createItem(type, this.unit, depth);
        this.selected = item.id;
        this.update((items) => [...items, item]);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    // Keyboard: Enter or Space adds the item at its default depth.
    tile.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const item = createItem(tile.dataset.add as ItemType, this.unit, this.snap(this.defaultDepth(tile.dataset.add as ItemType)));
      this.selected = item.id;
      this.update((items) => [...items, item]);
    });
  }

  // ---- editor -----------------------------------------------------------

  private renderEditor() {
    const c = this.copy.editor;
    const item = this.item(this.selected);
    const list = this.state.items
      .map(
        (i) =>
          `<li><button type="button" data-select="${i.id}" aria-current="${i.id === this.selected}">${esc(this.copy.types[i.type])} ${esc(itemSize(i))}<span>${fmt(i.top)}–${fmt(i.bottom)} ${this.unit}</span></button></li>`
      )
      .join('');
    let html = `<ul class="wb-list" role="list">${list}</ul>`;
    if (!item) {
      this.editor.innerHTML = html + `<p class="wb-none">${esc(c.none)}</p>`;
      return;
    }
    const errors = itemErrors(item);
    const field = (key: string, label: string, control: string, hint = '') =>
      `<label class="wb-field"><span>${esc(label)}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
    const select = (key: string, options: { value: string | number; label: string }[], value: string | number) =>
      `<select data-field="${key}">${options
        .map((o) => `<option value="${o.value}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`)
        .join('')}</select>`;
    const input = (key: 'top' | 'bottom' | 'od', value: number) =>
      `<input type="text" inputmode="decimal" data-field="${key}" value="${value}"${errors.includes(key) ? ' aria-invalid="true"' : ''}>`;

    html += `<div class="wb-edit"><p class="wb-edit-title">${esc(this.copy.types[item.type])}</p><div class="wb-grid2">`;
    if (isPipe(item.type)) {
      html += field('od', c.size, select('od', sizeOptions(item.type).map((od) => ({ value: od, label: `${sizeLabel(od)}"` })), item.od));
      if (apiKind(item.type)) {
        html += field('weight', c.weight, select('weight', weightOptions(item.type, item.od).map((w) => ({ value: w.weight, label: `${w.weight} lb/ft` })), item.weight));
      } else {
        html += field('wall', c.wall, select('wall', CT_WALLS.map((w) => ({ value: w, label: `${w}"` })), item.wall));
      }
    } else if (item.type === 'packer') {
      html += field('od', c.packerOd, input('od', item.od));
    } else if (isTubingTool(item.type)) {
      html += field('od', c.size, select('od', sizeOptions(item.type).map((od) => ({ value: od, label: `${sizeLabel(od)}"` })), item.od));
    }
    if (item.type === 'packer') {
      html += field('top', c.depth, input('top', item.top));
    } else {
      html += field('top', c.top, input('top', item.top));
      html += field('bottom', c.bottom, input('bottom', item.bottom));
    }
    html += field('note', c.note, `<input type="text" data-field="note" value="${esc(item.note ?? '')}" placeholder="${esc(c.notePlaceholder)}">`);
    html += `</div>`;
    if (isPipe(item.type)) html += this.properties(item);
    html += `<div class="wb-actions"><button type="button" data-action="duplicate">${esc(c.duplicate)}</button><button type="button" data-action="delete">${esc(c.delete)}</button></div></div>`;
    this.editor.innerHTML = html;
  }

  private properties(item: WellItem): string {
    const c = this.copy.editor;
    const pipe: ApiPipe = { kind: apiKind(item.type) ?? 'tubing', od: item.od, weight: item.weight, wall: item.wall };
    const p = pipeProperties(pipe);
    const mm = (inches: number) => `${fmt(inches, 3)} in (${fmt(inches * 25.4, 1)} mm)`;
    const cap = (bblPerFt: number) => `${fmt(bblPerFt, 4)} bbl/ft (${fmt(bblPerFt * 521.612, 2)} L/m)`;
    const rows: [string, string][] = [[c.id, mm(p.id)]];
    if (apiKind(item.type)) rows.push([c.drift, mm(p.drift)]);
    rows.push([c.capacity, cap(p.capacity)], [c.displacement, cap(p.displacement)]);
    return `<dl class="wb-props">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
  }

  private onEditorClick(event: Event) {
    const target = event.target as HTMLElement;
    const select = target.closest<HTMLElement>('[data-select]');
    if (select) {
      this.selected = select.dataset.select!;
      this.renderSchematic();
      this.renderEditor();
      return;
    }
    const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
    const item = this.item(this.selected);
    if (!action || !item) return;
    if (action === 'delete') {
      this.selected = null;
      this.update((items) => items.filter((i) => i.id !== item.id));
    } else {
      const copy = { ...item, id: newId() };
      this.selected = copy.id;
      this.update((items) => [...items, copy]);
    }
  }

  private onEditorChange(event: Event) {
    const el = event.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset.field;
    const item = this.item(this.selected);
    if (!key || !item) return;
    if (key === 'od') {
      this.replace(item.id, item.type === 'packer' ? { ...item, od: num(el.value) } : withSize(item, num(el.value)));
    } else if (key === 'weight') {
      this.replace(item.id, withWeight(item, num(el.value)));
    } else if (key === 'note') {
      this.replace(item.id, { ...item, note: el.value.trim() || undefined }, false);
    } else if (key === 'wall') {
      this.replace(item.id, { ...item, wall: num(el.value) });
    } else if (key === 'top' || key === 'bottom') {
      const value = num(el.value);
      const next = { ...item, [key]: value } as WellItem;
      if (item.type === 'packer' && key === 'top') next.bottom = value + (item.bottom - item.top);
      this.replace(item.id, next);
    }
  }

  // ---- survey and 3D ----------------------------------------------------

  private refreshSurvey() {
    const parsed = parseSurvey(this.state.survey);
    const errorBox = this.root.querySelector<HTMLElement>('#wb-survey-error')!;
    const table = this.root.querySelector<HTMLElement>('#wb-survey-table')!;
    const summary = this.root.querySelector<HTMLElement>('#wb-survey-summary')!;
    if (parsed.error) {
      this.surveyError = this.state.survey.trim() === '' ? null : parsed.error;
      this.path = [];
      errorBox.hidden = this.surveyError === null;
      errorBox.textContent = this.surveyError ? this.describe(this.surveyError) : '';
      table.innerHTML = '';
      summary.innerHTML = '';
      return;
    }
    this.surveyError = null;
    errorBox.hidden = true;
    this.path = minimumCurvature(parsed.stations, this.unit);
    const t = this.copy.survey.table;
    const rows = this.path
      .slice(0, 600)
      .map(
        (p) =>
          `<tr><td>${fmt(p.md, 1)}</td><td>${fmt(p.inclination, 2)}</td><td>${fmt(p.azimuth, 2)}</td><td>${fmt(p.tvd, 1)}</td><td>${fmt(p.north, 1)}</td><td>${fmt(p.east, 1)}</td><td>${fmt(p.dls, 2)}</td></tr>`
      )
      .join('');
    table.innerHTML = `<table><thead><tr>${['md', 'inc', 'azi', 'tvd', 'north', 'east', 'dls']
      .map((k) => `<th scope="col">${esc(t[k])}</th>`)
      .join('')}</tr></thead><tbody>${rows}</tbody></table>`;
    const s = summarise(this.path);
    const m = this.copy.survey.summary;
    const cell = (label: string, value: string) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
    summary.innerHTML =
      cell(m.md, `${fmt(s.md, 1)} ${this.unit}`) +
      cell(m.tvd, `${fmt(s.tvd, 1)} ${this.unit}`) +
      cell(m.departure, `${fmt(s.departure, 1)} ${this.unit}`) +
      cell(m.closure, `${fmt(s.closureAzimuth, 1)}°`) +
      cell(m.maxInc, `${fmt(s.maxInclination, 1)}°`) +
      cell(m.maxDls, `${fmt(s.maxDls, 2)}°/${this.unit === 'ft' ? '100 ft' : '30 m'}`);
  }

  private describe(error: SurveyError): string {
    const text = this.copy.survey.errors[error.code];
    return 'line' in error ? text.replace('{line}', String(error.line)) : text;
  }

  private updateView() {
    const deepest = Math.max(0, ...this.state.items.map((i) => i.bottom));
    // Without a usable survey the well is drawn straight down to the deepest item.
    const path = this.path.length > 0 ? this.path : minimumCurvature([{ md: Math.max(deepest, 100), inclination: 0, azimuth: 0 }], this.unit);
    const items = this.state.items;
    const m = this.copy.marker;
    const markers: ViewData['markers'][number][] = [];
    for (const i of items) {
      if (i.type === 'casing' || i.type === 'liner') markers.push({ md: i.bottom, label: `${sizeLabel(i.od)}" ${m.shoe}`, kind: 'shoe' });
      else if (i.type === 'tubing') markers.push({ md: i.bottom, label: m.tubing, kind: 'tubing' });
      else if (i.type === 'ct') markers.push({ md: i.bottom, label: m.ct, kind: 'ct' });
      else if (i.type === 'packer') markers.push({ md: i.top, label: m.packer, kind: 'packer' });
      else if (i.type === 'nipple') markers.push({ md: i.top, label: m.nipple, kind: 'tubing' });
      else if (i.type === 'sleeve') markers.push({ md: i.top, label: m.sleeve, kind: 'tubing' });
    }
    this.viewer.setData({
      path,
      at: (md) => pointAt(path, md, this.unit),
      markers,
      intervals: items.filter((i) => i.type === 'perforation').map((i) => ({ from: i.top, to: i.bottom, label: m.perforations })),
      unit: this.unit,
    });
    const note = this.root.querySelector<HTMLElement>('#wb-3d-note');
    if (note) note.hidden = this.path.length > 0;
  }
}
