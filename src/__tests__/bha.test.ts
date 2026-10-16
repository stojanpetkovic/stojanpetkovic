import { describe, expect, it } from 'vitest';
import {
  EXAMPLES,
  KINDS,
  exampleItems,
  fromFile,
  layoutRows,
  newItem,
  renderSvg,
  toFile,
  totals,
  validateItem,
  type BhaItem,
} from '../lib/tools/bha';

const draw = (items: BhaItem[]) =>
  renderSvg(items, {
    formatLength: (ft) => `${ft.toFixed(2)} ft`,
    formatDiameter: (i) => `${i}"`,
    totalLabel: 'Total',
    empty: 'Nothing yet',
  });

describe('BHA totals', () => {
  it('the workbook example is 9.96 ft, 3.04 m', () => {
    const t = totals(exampleItems('sheet'));
    expect(t.length).toBeCloseTo(9.96, 9);
    expect(t.length * 0.3048).toBeCloseTo(3.0357, 3);
    expect(t.count).toBe(10);
    expect(t.maxOd).toBe(2.25);
  });

  it('the smallest bore ignores tools that have none', () => {
    expect(totals(exampleItems('sheet')).minBore).toBe(0.75);
    const closed: BhaItem[] = exampleItems('sheet').filter((i) => i.bore === null);
    expect(totals(closed).minBore).toBeNull();
  });

  it('every example is drawable', () => {
    for (const key of Object.keys(EXAMPLES) as (keyof typeof EXAMPLES)[]) {
      const items = exampleItems(key);
      expect(items.length).toBeGreaterThan(3);
      for (const item of items) expect(validateItem(item), `${key}: ${item.description}`).toEqual([]);
    }
  });
});

describe('validation', () => {
  const ok = newItem('swivel', 'Swivel');
  it('accepts a new item', () => expect(validateItem(ok)).toEqual([]));
  it('names the unusable fields', () => {
    expect(validateItem({ ...ok, od: 0 })).toContain('od');
    expect(validateItem({ ...ok, bore: ok.od })).toContain('bore');
    expect(validateItem({ ...ok, length: NaN })).toContain('length');
    expect(validateItem({ ...ok, description: ' ' })).toContain('description');
    expect(validateItem({ ...ok, bore: null })).toEqual([]);
  });
  it('a new item never has a bore as large as its body', () => {
    const small = newItem('swivel', 'x', { ...ok, od: 0.5 });
    expect(small.bore === null || small.bore < small.od).toBe(true);
  });
});

describe('drawing', () => {
  it('draws every tool, widths follow the outside diameter and lengths the heights', () => {
    const items = exampleItems('sheet');
    const { rows } = layoutRows(items);
    expect(rows).toHaveLength(10);
    const widest = rows.find((r) => r.item.od === 2.25)!;
    const narrow = rows.find((r) => r.item.od === 1.925)!;
    expect(widest.width).toBeGreaterThan(narrow.width);
    expect(widest.width / narrow.width).toBeCloseTo(2.25 / 1.925, 6);
    const long = rows.find((r) => r.item.length === 1.27)!;
    const short = rows.find((r) => r.item.length === 0.55)!;
    expect(long.height).toBeGreaterThan(short.height);
    // Rows stack without gaps.
    for (let i = 1; i < rows.length; i++) expect(rows[i].y).toBeCloseTo(rows[i - 1].y + rows[i - 1].height, 9);
    const svg = draw(items);
    expect((svg.match(/data-index=/g) ?? []).length).toBe(10);
    expect(svg).toContain('Total 9.96 ft');
  });

  it('every kind of tool draws', () => {
    for (const kind of KINDS) {
      const svg = draw([newItem(kind, kind)]);
      expect(svg).toContain('class="bha-body"');
      expect(svg).toContain('bha-deco');
    }
  });

  it('a tool without a bore has no bore drawn', () => {
    expect(draw([newItem('checkValve', 'BPV')])).not.toContain('class="bha-bore"');
    expect(draw([newItem('swivel', 'Swivel')])).toContain('class="bha-bore"');
  });

  it('escapes text and draws an empty BHA as a message', () => {
    const item = { ...newItem('generic', '<b>"x"</b>') };
    expect(draw([item])).not.toContain('<b>');
    expect(draw([])).toContain('Nothing yet');
  });
});

describe('saving', () => {
  it('round-trips a BHA', () => {
    const items = exampleItems('motorhead2_3_8');
    const meta = { bhaNo: '12', runNo: '3', preparedBy: 'S. P.' };
    const back = fromFile(JSON.parse(JSON.stringify(toFile(items, meta))));
    expect(back?.meta).toEqual(meta);
    expect(back?.items.map(({ id: _id, ...rest }) => rest)).toEqual(items.map(({ id: _id, ...rest }) => rest));
  });
  it('refuses anything else', () => {
    expect(fromFile(null)).toBeNull();
    expect(fromFile({ format: 'well', version: 1, items: [] })).toBeNull();
    expect(fromFile({ format: 'bha-builder', version: 1, items: [{ kind: 'nope', description: 'x', od: 1, bore: null, length: 1 }] })).toBeNull();
    expect(fromFile({ format: 'bha-builder', version: 1, items: [{ kind: 'swivel', description: 'x', od: '1', bore: null, length: 1 }] })).toBeNull();
  });
});
