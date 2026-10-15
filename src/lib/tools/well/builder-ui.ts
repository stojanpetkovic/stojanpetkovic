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
  CT_WALLS, ITEM_TYPES, apiKind, createItem, emptyWell, exampleWell, isPipe, itemErrors, itemSize, newId,
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
}

const STORAGE_KEY = 'well-builder:v1';
const VIEW_W = 720;
const TOP = 28;
const PLOT_H = 560;
const LEFT = 64;
const CENTRE = LEFT + (VIEW_W - LEFT) / 2 - 40;
const MAX_WIDTH = 290;

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

  private renderSchematic() {
    const items = this.state.items;
    const pipes = items.filter((i) => isPipe(i.type));
    const deepest = Math.max(0, ...items.map((i) => i.bottom));
    const floor = this.unit === 'ft' ? 1000 : 300;
    const step = niceStep(Math.max(floor, deepest * 1.1), 10);
    const maxDepth = Math.max(floor, Math.ceil((deepest * 1.1) / step) * step);
    this.geometry = this.locked ?? { maxDepth, perUnit: PLOT_H / maxDepth };

    const maxOd = Math.max(5, ...items.filter((i) => i.type !== 'perforation').map((i) => i.od));
    const widthOf = (od: number) => Math.max(10, (MAX_WIDTH * od) / maxOd);

    let svg = '';
    // Depth axis.
    for (let d = 0; d <= maxDepth; d += step) {
      svg += `<line x1="${LEFT - 6}" x2="${VIEW_W - 10}" y1="${this.y(d)}" y2="${this.y(d)}" class="wb-grid"/>`;
      svg += `<text x="${LEFT - 10}" y="${this.y(d) + 4}" text-anchor="end" class="wb-axis">${fmt(d)}</text>`;
    }
    svg += `<text x="6" y="14" class="wb-axis">MD, ${this.unit}</text>`;
    if (items.length === 0) {
      svg += `<text x="${CENTRE}" y="${TOP + 120}" text-anchor="middle" class="wb-empty">${esc(this.copy.canvas.empty)}</text>`;
    }

    // Pipes, the largest first so the smaller ones sit inside them.
    const ordered = [...pipes].sort((a, b) => b.od - a.od || a.top - b.top);
    const widest = ordered[0] ? widthOf(ordered[0].od) : 0;
    for (const item of ordered) {
      const w = widthOf(item.od);
      const wall = Math.max(4, (item.wall * MAX_WIDTH) / maxOd);
      const inner = Math.max(2, w - 2 * wall);
      const x = CENTRE - w / 2;
      const y1 = this.y(item.top);
      const y2 = this.y(item.bottom);
      const sel = item.id === this.selected ? ' wb-selected' : '';
      // Only the walls take the pointer, so a pipe inside another does not cover it.
      svg += `<g data-id="${item.id}" class="wb-item${sel}">`;
      svg += `<rect x="${CENTRE - inner / 2}" y="${y1}" width="${inner}" height="${y2 - y1}" class="wb-bore"/>`;
      svg += `<rect x="${x}" y="${y1}" width="${wall}" height="${y2 - y1}" fill="${COLOUR[item.type]}"/>`;
      svg += `<rect x="${x + w - wall}" y="${y1}" width="${wall}" height="${y2 - y1}" fill="${COLOUR[item.type]}"/>`;
      if (item.type !== 'ct') svg += `<polygon points="${x - 4},${y2} ${x + w + 4},${y2} ${CENTRE},${y2 + 9}" fill="${COLOUR[item.type]}"/>`;
      svg += `</g>`;
    }

    // Packers and perforations.
    for (const item of items) {
      const sel = item.id === this.selected ? ' wb-selected' : '';
      const y1 = this.y(item.top);
      const y2 = Math.max(this.y(item.bottom), y1 + 8);
      if (item.type === 'packer') {
        const w = widthOf(item.od);
        svg += `<g data-id="${item.id}" class="wb-item${sel}"><rect x="${CENTRE - w / 2}" y="${y1}" width="${w}" height="${y2 - y1}" fill="${COLOUR.packer}" rx="2"/></g>`;
      } else if (item.type === 'perforation') {
        const edge = widest / 2;
        svg += `<g data-id="${item.id}" class="wb-item${sel}">`;
        for (const side of [-1, 1]) {
          const x = CENTRE + side * edge;
          svg += `<rect x="${side < 0 ? x - 12 : x}" y="${y1}" width="12" height="${y2 - y1}" fill="${COLOUR.perforation}" opacity="0.85"/>`;
        }
        svg += `</g>`;
      }
    }

    // Labels on the right: the size and the depth, kept apart.
    const labels = items
      .filter((i) => i.type !== 'perforation' || true)
      .map((i) => ({
        y: this.y(i.type === 'packer' || i.type === 'perforation' ? i.top : i.bottom),
        text: `${this.copy.types[i.type]} ${itemSize(i)} @ ${fmt(i.type === 'packer' || i.type === 'perforation' ? i.top : i.bottom)}`.trim(),
        id: i.id,
      }))
      .sort((a, b) => a.y - b.y);
    let last = -Infinity;
    for (const label of labels) {
      const y = Math.max(label.y, last + 13);
      last = y;
      const sel = label.id === this.selected ? ' wb-label-selected' : '';
      svg += `<text x="${CENTRE + widest / 2 + 20}" y="${y + 4}" class="wb-label${sel}">${esc(label.text)}</text>`;
    }

    // Handles on the selected item.
    const selected = this.item(this.selected);
    if (selected) {
      for (const which of ['top', 'bottom'] as const) {
        const cy = this.y(selected[which]);
        svg += `<circle data-handle="${which}" data-id="${selected.id}" cx="${CENTRE}" cy="${cy}" r="7" class="wb-handle"/>`;
      }
    }

    this.svg.setAttribute('viewBox', `0 0 ${VIEW_W} ${TOP + PLOT_H + 24}`);
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
    }
    if (item.type === 'packer') {
      html += field('top', c.depth, input('top', item.top));
    } else {
      html += field('top', c.top, input('top', item.top));
      html += field('bottom', c.bottom, input('bottom', item.bottom));
    }
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
