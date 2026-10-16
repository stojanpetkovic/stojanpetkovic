import { describe, expect, it } from 'vitest';
import { renderStringSvg, sectionHeights } from '../lib/tools/ct-string-drawing';

const label = {
  reel: 'Reel',
  string: 'CT',
  bha: 'BHA',
  empty: 'Enter the string',
  formatLength: (ft: number) => `${ft} ft`,
  formatDiameter: (i: number) => `${i} in`,
  formatWall: (i: number) => `${i} wall`,
};

describe('section heights', () => {
  it('are proportional to the length above the minimum and add up to the total', () => {
    const h = sectionHeights([1000, 3000], 210, 34);
    expect(h[1] - 34).toBeCloseTo(3 * (h[0] - 34), 9);
    expect(h[0] + h[1]).toBeCloseTo(210, 9);
  });
  it('never go below the minimum', () => {
    expect(Math.min(...sectionHeights([1, 100000, 5], 210, 34))).toBeGreaterThanOrEqual(34);
  });
});

describe('string drawing', () => {
  const base = { od: 1.75, reelDiameter: 72, sections: [{ length: 3000, wall: 0.156 }, { length: 12000, wall: 0.134 }], bha: { length: 10, od: 2.25, tools: 10 }, label };

  it('draws the reel, each wall section and the BHA', () => {
    const svg = renderStringSvg(base);
    expect(svg).toContain('cs-reel');
    expect((svg.match(/data-section=/g) ?? []).length).toBe(2);
    expect(svg).toContain('cs-bha');
    expect(svg).toContain('72 in');
    expect(svg).toContain('15000 ft');
  });

  it('the thicker wall is drawn with the thicker stroke', () => {
    const svg = renderStringSvg(base);
    const widths = [...svg.matchAll(/data-section="\d"[^>]*stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths[0]).toBeGreaterThan(widths[1]);
  });

  it('leaves the BHA out when there is none and says so when there is nothing to draw', () => {
    expect(renderStringSvg({ ...base, bha: null })).not.toContain('cs-bha"');
    expect(renderStringSvg({ ...base, sections: [] })).toContain('Enter the string');
    expect(renderStringSvg({ ...base, od: 0 })).toContain('Enter the string');
  });

  it('escapes the labels and copes with a missing reel diameter', () => {
    const svg = renderStringSvg({ ...base, reelDiameter: null, label: { ...label, reel: '<b>' } });
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('–');
  });
});
