/**
 * Browser side of the BHA Builder page: the list of tools, the drawing, the
 * summary and the saved state. The page supplies the markup (see
 * `BhaBuilderView.astro`) and the copy; the BHA itself, its checks and the SVG
 * come from `bha.ts`.
 *
 * Values are kept in inches and feet and shown in the unit system the visitor
 * picked. The BHA is saved in the browser only; it can also be exported to a
 * file and imported back.
 */
import {
  estimateWeight,
  EXAMPLES,
  KINDS,
  exampleItems,
  fromFile,
  newItem,
  renderSvg,
  toFile,
  totals,
  validateItem,
  type BhaItem,
  type BhaMeta,
  type ExampleKey,
  type Kind,
} from './bha';

export interface BhaCopy {
  types: Record<Kind, string>;
  examples: Record<ExampleKey, string>;
  editor: Record<string, string>;
  summary: Record<string, string>;
  data: Record<string, string>;
  print: Record<string, string>;
}

type System = 'us' | 'metric';

const STORAGE_KEY = 'bha-builder:v1';
const IN_TO_MM = 25.4;
const FT_TO_M = 0.3048;

const qs = <T extends HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;

export class BhaBuilder {
  private items: BhaItem[] = [];
  private meta: BhaMeta = { bhaNo: '', runNo: '', preparedBy: '' };
  private system: System = 'us';
  private readonly lang = document.documentElement.lang || 'en';

  constructor(
    private readonly root: HTMLElement,
    private readonly copy: BhaCopy
  ) {
    this.load();
    this.bind();
    this.renderAll();
    // Store the BHA as shown, including the example a first visit opens with, for the CT Simulator to read.
    this.save();
  }

  // --- units -------------------------------------------------------------

  private diameterLabel = () => (this.system === 'us' ? 'in' : 'mm');
  private lengthLabel = () => (this.system === 'us' ? 'ft' : 'm');
  private showDiameter = (inches: number) => (this.system === 'us' ? inches : inches * IN_TO_MM);
  private weightLabel = () => (this.system === 'us' ? 'lb' : 'kg');
  private showWeight = (pounds: number) => (this.system === 'us' ? pounds : pounds * 0.45359237);
  private readWeight = (value: number) => (this.system === 'us' ? value : value / 0.45359237);
  private showLength = (feet: number) => (this.system === 'us' ? feet : feet * FT_TO_M);
  private readDiameter = (value: number) => (this.system === 'us' ? value : value / IN_TO_MM);
  private readLength = (value: number) => (this.system === 'us' ? value : value / FT_TO_M);

  private number(value: number, digits: number) {
    return new Intl.NumberFormat(this.lang, { maximumFractionDigits: digits, useGrouping: false }).format(value);
  }
  private formatDiameter = (inches: number) => `${this.number(this.showDiameter(inches), this.system === 'us' ? 3 : 1)} ${this.diameterLabel()}`;
  private formatLength = (feet: number) => `${this.number(this.showLength(feet), 2)} ${this.lengthLabel()}`;
  private field = (value: number, digits: number) => String(Number(value.toFixed(digits)));

  // --- state -------------------------------------------------------------

  private load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      const parsed = fromFile(saved?.file);
      if (parsed) {
        this.items = parsed.items;
        this.meta = parsed.meta;
      }
      if (saved?.system === 'metric') this.system = 'metric';
    } catch {
      // Storage can be unavailable or hold something else; start empty.
    }
    if (this.items.length === 0 && !localStorage.getItem(STORAGE_KEY)) this.items = exampleItems('sheet');
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ file: toFile(this.items, this.meta), system: this.system }));
    } catch {
      // Not saved; the page still works.
    }
    // The CT Simulator reads this BHA; tell it the BHA changed.
    window.dispatchEvent(new CustomEvent('ct-project-change', { detail: { part: 'bha' } }));
  }

  private changed() {
    this.save();
    this.renderDrawing();
  }

  // --- events ------------------------------------------------------------

  private bind() {
    const { root, copy } = this;

    root.querySelectorAll<HTMLElement>('[data-add]').forEach((tile) => {
      const add = () => {
        const kind = tile.dataset.add as Kind;
        this.items.push(newItem(kind, copy.types[kind], this.items[this.items.length - 1]));
        this.save();
        this.renderAll();
        root.querySelector<HTMLElement>('#bha-list [data-card]:last-child')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      tile.addEventListener('click', add);
      tile.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          add();
        }
      });
    });

    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach((button) =>
      button.addEventListener('click', () => {
        this.system = button.dataset.unit as System;
        this.save();
        this.renderAll();
      })
    );

    const example = qs<HTMLSelectElement>(root, '#bha-example');
    example.addEventListener('change', () => {
      const key = example.value as ExampleKey;
      example.value = '';
      if (!(key in EXAMPLES)) return;
      if (this.items.length > 0 && !confirm(copy.data.confirmExample)) return;
      this.items = exampleItems(key);
      this.save();
      this.renderAll();
    });

    qs(root, '#bha-reset').addEventListener('click', () => {
      if (this.items.length > 0 && !confirm(copy.data.confirmReset)) return;
      this.items = [];
      this.meta = { bhaNo: '', runNo: '', preparedBy: '' };
      this.save();
      this.renderAll();
    });

    qs(root, '#bha-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(toFile(this.items, this.meta), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'bha.json';
      a.click();
      URL.revokeObjectURL(a.href);
    });

    const file = qs<HTMLInputElement>(root, '#bha-import');
    file.addEventListener('change', async () => {
      const error = qs(root, '#bha-error');
      error.hidden = true;
      const text = await file.files?.[0]?.text();
      file.value = '';
      if (text === undefined) return;
      let parsed = null;
      try {
        parsed = fromFile(JSON.parse(text));
      } catch {
        parsed = null;
      }
      if (!parsed) {
        error.textContent = copy.data.importError;
        error.hidden = false;
        return;
      }
      this.items = parsed.items;
      this.meta = parsed.meta;
      this.save();
      this.renderAll();
    });

    for (const key of ['bhaNo', 'runNo', 'preparedBy'] as const) {
      const input = qs<HTMLInputElement>(root, `[data-meta="${key}"]`);
      input.addEventListener('input', () => {
        this.meta[key] = input.value;
        this.save();
        this.renderPrint();
      });
    }

    qs(root, '#bha-print').addEventListener('click', () => {
      this.renderPrint();
      window.print();
    });
    window.addEventListener('beforeprint', () => this.renderPrint());

    // Edits and actions on the tool cards.
    const list = qs(root, '#bha-list');
    list.addEventListener('input', (e) => this.onEdit(e.target as HTMLInputElement));
    list.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
      const card = button?.closest<HTMLElement>('[data-card]');
      if (!button || !card) return;
      const index = Number(card.dataset.card);
      const action = button.dataset.action;
      if (action === 'up' && index > 0) [this.items[index - 1], this.items[index]] = [this.items[index], this.items[index - 1]];
      else if (action === 'down' && index < this.items.length - 1) [this.items[index + 1], this.items[index]] = [this.items[index], this.items[index + 1]];
      else if (action === 'copy') this.items.splice(index + 1, 0, { ...this.items[index], id: newItem('generic', '').id });
      else if (action === 'remove') this.items.splice(index, 1);
      else return;
      this.save();
      this.renderAll();
    });
  }

  private onEdit(input: HTMLInputElement) {
    const card = input.closest<HTMLElement>('[data-card]');
    const name = input.dataset.field;
    if (!card || !name) return;
    const item = this.items[Number(card.dataset.card)];
    const raw = input.value.trim().replace(',', '.');
    if (name === 'description') item.description = input.value;
    else if (name === 'connection') item.connection = input.value;
    else if (name === 'od') item.od = raw === '' ? NaN : this.readDiameter(Number(raw));
    else if (name === 'bore') item.bore = raw === '' || /^n\/?a$/i.test(raw) ? null : this.readDiameter(Number(raw));
    else if (name === 'length') item.length = raw === '' ? NaN : this.readLength(Number(raw));
    else if (name === 'weight') item.weight = raw === '' ? undefined : this.readWeight(Number(raw));
    const bad = validateItem(item);
    card.querySelectorAll<HTMLInputElement>('[data-field]').forEach((el) => el.setAttribute('aria-invalid', String(bad.includes(el.dataset.field as never))));
    if (name === 'description') card.querySelector('[data-title]')!.textContent = item.description;
    this.changed();
    this.renderSummary();
  }

  // --- rendering ---------------------------------------------------------

  private renderAll() {
    const { root } = this;
    root.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === this.system)));
    for (const key of Object.keys(this.meta) as (keyof BhaMeta)[]) qs<HTMLInputElement>(root, `[data-meta="${key}"]`).value = this.meta[key];
    this.renderList();
    this.renderDrawing();
    this.renderSummary();
  }

  private renderList() {
    const list = qs(this.root, '#bha-list');
    const e = this.copy.editor;
    if (this.items.length === 0) {
      list.innerHTML = `<p class="wb-none">${e.empty}</p>`;
      return;
    }
    const d = this.diameterLabel();
    const l = this.lengthLabel();
    list.innerHTML = this.items
      .map((item, i) => {
        const invalid = validateItem(item);
        const input = (field: string, label: string, value: string, unit = '', wide = false, mode = 'decimal', placeholder = '') =>
          `<label class="wb-field${wide ? ' bha-wide' : ''}">${label}${unit ? ` <span class="bha-unit">${unit}</span>` : ''}<input data-field="${field}" inputmode="${mode}" autocomplete="off" placeholder="${placeholder}" aria-invalid="${invalid.includes(field as never)}" value="${value.replace(/"/g, '&quot;')}" /></label>`;
        return `<div class="bha-card" data-card="${i}">
          <div class="bha-card-head">
            <span class="bha-card-num">${i + 1}</span>
            <span class="bha-card-title" data-title>${item.description.replace(/</g, '&lt;')}</span>
            <span class="bha-card-actions">
              <button type="button" data-action="up" aria-label="${e.up}" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" data-action="down" aria-label="${e.down}" ${i === this.items.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" data-action="copy" aria-label="${e.copy}">⧉</button>
              <button type="button" data-action="remove" aria-label="${e.remove}">✕</button>
            </span>
          </div>
          <div class="bha-fields">
            ${input('description', e.description, item.description, '', true, 'text')}
            ${input('od', e.od, Number.isFinite(item.od) ? this.field(this.showDiameter(item.od), 3) : '', d)}
            ${input('bore', e.bore, item.bore === null ? '' : this.field(this.showDiameter(item.bore), 3), d)}
            ${input('length', e.length, Number.isFinite(item.length) ? this.field(this.showLength(item.length), 2) : '', l)}
            ${input('weight', e.weight, item.weight === undefined ? '' : this.field(this.showWeight(item.weight), 1), this.weightLabel(), false, 'decimal', this.field(this.showWeight(estimateWeight(item)), 1))}
            ${input('connection', e.connection, item.connection, '', true, 'text')}
          </div>
        </div>`;
      })
      .join('');
  }

  private renderDrawing() {
    qs(this.root, '#bha-svg').innerHTML = renderSvg(this.items, {
      formatLength: (ft) => this.number(this.showLength(ft), 2),
      formatDiameter: (inches) => this.number(this.showDiameter(inches), this.system === 'us' ? 3 : 1),
      totalLabel: `${this.copy.summary.length}, ${this.lengthLabel()}:`,
      empty: this.copy.editor.empty,
    });
    this.renderPrint();
  }

  private renderSummary() {
    const t = totals(this.items);
    const s = this.copy.summary;
    const rows: [string, string][] = [
      [s.length, this.formatLength(t.length)],
      [s.maxOd, t.maxOd > 0 ? this.formatDiameter(t.maxOd) : '–'],
      [s.minBore, t.minBore === null ? '–' : this.formatDiameter(t.minBore)],
      [s.count, String(t.count)],
      [s.weight, `${this.number(this.showWeight(t.weight), 0)} ${this.weightLabel()}`],
    ];
    qs(this.root, '#bha-summary').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  /** The table and header of the printed report. */
  private renderPrint() {
    const p = this.copy.print;
    const e = this.copy.editor;
    const head = qs(this.root, '#bha-print-head');
    const bits = [
      this.meta.bhaNo && `${p.bhaNo}: ${this.meta.bhaNo}`,
      this.meta.runNo && `${p.runNo}: ${this.meta.runNo}`,
      this.meta.preparedBy && `${p.preparedBy}: ${this.meta.preparedBy}`,
    ].filter(Boolean) as string[];
    head.textContent = bits.join('   ·   ');
    const t = totals(this.items);
    const cell = (text: string) => `<td>${text.replace(/</g, '&lt;')}</td>`;
    qs(this.root, '#bha-print-table').innerHTML = `<table>
      <thead><tr><th>#</th><th>${e.description}</th><th>${e.od} (${this.diameterLabel()})</th><th>${e.bore} (${this.diameterLabel()})</th><th>${e.length} (${this.lengthLabel()})</th><th>${e.connection}</th></tr></thead>
      <tbody>${this.items
        .map(
          (item, i) =>
            `<tr>${cell(String(i + 1))}${cell(item.description)}${cell(this.number(this.showDiameter(item.od), this.system === 'us' ? 3 : 1))}${cell(item.bore === null ? 'N/A' : this.number(this.showDiameter(item.bore), this.system === 'us' ? 3 : 1))}${cell(this.number(this.showLength(item.length), 2))}${cell(item.connection)}</tr>`
        )
        .join('')}</tbody>
      <tfoot><tr><td></td><td>${p.total}</td><td></td><td></td><td>${this.number(this.showLength(t.length), 2)}</td><td></td></tr></tfoot></table>`;
    const foot = qs(this.root, '#bha-print-foot');
    const url = `${location.host}${location.pathname}`;
    const date = new Intl.DateTimeFormat(this.lang, { dateStyle: 'long' }).format(new Date());
    foot.textContent = `${foot.dataset.note ?? ''}`.replace('{url}', url).replace('{date}', date);
  }
}

export { KINDS };
