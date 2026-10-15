/**
 * Browser side of an engineering tool page: a form whose fields are typed in
 * oilfield or metric units, and result elements that show the outcome.
 *
 * The page marks up the pieces with data attributes and supplies `compute`,
 * which receives the inputs in oilfield units and returns either the names of
 * unusable fields or the output values (in oilfield units). The rest is shared:
 * unit switching that converts the typed values from their exact oilfield value,
 * validation marks, the example button and number formatting for the page
 * language.
 *
 * Markup contract, inside the element passed as `root`:
 * - `form` with `input[data-quantity]` fields named after the inputs, each with
 *   a `[data-unit-for="<name>"]` unit label next to it;
 * - `[data-system="us|metric"]` buttons for the unit switch;
 * - `[data-tool-example]` button; `data-example` and `data-defaults` JSON on root;
 * - `[data-tool-invalid]` and `[data-tool-output]` panels;
 * - `[data-out="<key>"]` for each output, with `data-quantity` to convert it and
 *   `[data-unit-out="<quantity>"]` for unit labels.
 */
import { fromUs, toUs, UNITS, type Quantity, type UnitSystem } from './units';

export type Outcome =
  | { errors: string[]; values?: undefined }
  | { errors?: undefined; values: Record<string, number | string | null> };

export function initToolForm(root: HTMLElement, compute: (input: Record<string, number>) => Outcome) {
  const form = root.querySelector<HTMLFormElement>('form');
  if (!form || root.dataset.init) return;
  root.dataset.init = 'true';

  const example: Record<string, number> = JSON.parse(root.dataset.example ?? '{}');
  const defaults: Record<string, number> = JSON.parse(root.dataset.defaults ?? '{}');
  const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[data-quantity]'));
  const lang = document.documentElement.lang || 'en';
  let system: UnitSystem = 'us';

  const parse = (raw: string) => Number(raw.trim().replace(',', '.'));
  /** Plain number for an input field: no grouping, so it parses back unchanged. */
  const plain = (value: number) => String(Number(value.toPrecision(6)));
  const show = (value: number, decimals?: number) => {
    const digits =
      decimals ?? (Math.abs(value) >= 1000 ? 0 : Math.abs(value) >= 10 ? 1 : Math.abs(value) >= 1 ? 2 : 3);
    return new Intl.NumberFormat(lang, { maximumFractionDigits: digits }).format(value);
  };

  function setUnits() {
    for (const input of inputs) {
      const unit = form!.querySelector(`[data-unit-for="${input.name}"]`);
      if (unit) unit.textContent = UNITS[input.dataset.quantity as Quantity].label[system];
    }
    root.querySelectorAll<HTMLElement>('[data-unit-out]').forEach((el) => {
      el.textContent = UNITS[el.dataset.unitOut as Quantity].label[system];
    });
    root
      .querySelectorAll<HTMLButtonElement>('[data-system]')
      .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.system === system)));
  }

  function calculate() {
    const input: Record<string, number> = {};
    for (const el of inputs) {
      input[el.name] = el.value.trim() === '' ? NaN : toUs(el.dataset.quantity as Quantity, system, parse(el.value));
    }
    const outcome = compute(input);
    const errors = outcome.errors ?? [];
    for (const el of inputs) {
      const bad = errors.includes(el.name);
      el.closest('.tool-input')?.toggleAttribute('data-invalid', bad);
      el.setAttribute('aria-invalid', String(bad));
    }
    const invalid = errors.length > 0;
    root.querySelector<HTMLElement>('[data-tool-invalid]')!.hidden = !invalid;
    root.querySelector<HTMLElement>('[data-tool-output]')!.hidden = invalid;
    if (invalid || !outcome.values) return;

    root.querySelectorAll<HTMLElement>('[data-out]').forEach((el) => {
      const value = outcome.values![el.dataset.out!];
      if (value === null || value === undefined) {
        el.textContent = '–';
      } else if (typeof value === 'string') {
        el.textContent = value;
      } else {
        const quantity = el.dataset.quantity as Quantity | undefined;
        const decimals = el.dataset.decimals === undefined ? undefined : Number(el.dataset.decimals);
        el.textContent = show(quantity ? fromUs(quantity, system, value) : value, decimals);
      }
    });
  }

  function fill(values: Record<string, number>) {
    for (const el of inputs) {
      el.dataset.us = String(values[el.name]);
      el.value = plain(fromUs(el.dataset.quantity as Quantity, system, values[el.name]));
    }
    calculate();
  }

  function switchSystem(next: UnitSystem) {
    if (next === system) return;
    for (const el of inputs) {
      const quantity = el.dataset.quantity as Quantity;
      const v = parse(el.value);
      if (el.value.trim() === '' || !Number.isFinite(v)) continue;
      // Convert from the exact oilfield value while the field is untouched, so switching back and
      // forth does not accumulate rounding.
      const us = el.dataset.us ? Number(el.dataset.us) : toUs(quantity, system, v);
      el.dataset.us = String(us);
      el.value = plain(fromUs(quantity, next, us));
    }
    system = next;
    setUnits();
    calculate();
  }

  root
    .querySelectorAll<HTMLButtonElement>('[data-system]')
    .forEach((b) => b.addEventListener('click', () => switchSystem(b.dataset.system as UnitSystem)));
  root.querySelector('[data-tool-example]')?.addEventListener('click', () => fill(example));
  form.addEventListener('input', (e) => {
    delete (e.target as HTMLInputElement).dataset.us;
    calculate();
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  setUnits();
  fill(defaults);
}
