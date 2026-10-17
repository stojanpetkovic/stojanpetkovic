import { describe, expect, it } from 'vitest';
import {
  DATUM_M,
  OUTLINE,
  elevationAt,
  insideOutline,
  outlineBounds,
  reliefAt,
} from '../lib/geothermal/terrain';
import {
  ORIGIN,
  SURFACE_TEMP,
  atlasStats,
  buildField,
  colorFraction,
  columnAt,
  depthFromColumn,
  gaussKruger,
  gradientFromColumn,
  insideAtlas,
  tempAt,
  tempColor,
  tempFromColumn,
  testGradient,
  wellPoint,
  type Column,
} from '../lib/geothermal/field';
import {
  SETTLEMENTS,
  WELLS,
  hasInterval,
  project,
  testDepth,
  unproject,
} from '../lib/geothermal/wells';

describe('well data', () => {
  it('holds the 51 distinct wells of the three tables', () => {
    expect(WELLS).toHaveLength(51);
    expect(new Set(WELLS.map((w) => w.id)).size).toBe(51);
  });

  it('splits the wells as the annex does: 15 + 11 + 25, with Kž-2/H counted once', () => {
    const count = (s: string) => WELLS.filter((w) => w.status === s).length;
    expect(count('producing')).toBe(14);
    expect(count('idle')).toBe(12);
    expect(count('untapped')).toBe(25);
  });

  it('places every well in a settlement that has coordinates inside Vojvodina and Srem', () => {
    for (const w of WELLS) {
      const s = SETTLEMENTS[w.place];
      expect(s, `${w.id}: unknown settlement ${w.place}`).toBeDefined();
      expect(s.lat).toBeGreaterThan(44.6);
      expect(s.lat).toBeLessThan(46.2);
      expect(s.lon).toBeGreaterThan(18.8);
      expect(s.lon).toBeLessThan(21.6);
    }
  });

  it('keeps every interval inside the well and every temperature plausible', () => {
    for (const w of WELLS) {
      expect(w.tests.length, w.id).toBeGreaterThan(0);
      for (const t of w.tests) {
        if (hasInterval(t)) {
          expect(t.top!, `${w.id} top`).toBeLessThan(t.bottom!);
          expect(t.bottom!, `${w.id} bottom`).toBeLessThanOrEqual(w.depth);
        }
        expect(t.temp, `${w.id} temp`).toBeGreaterThan(SURFACE_TEMP);
        expect(t.temp, `${w.id} temp`).toBeLessThan(100);
      }
    }
  });

  it('reads the deepest well (Vbc-1/H) as three intervals, hotter with depth', () => {
    const w = WELLS.find((x) => x.id === 'Vbc-1/H')!;
    const byDepth = [...w.tests].sort((a, b) => testDepth(w, a) - testDepth(w, b));
    expect(byDepth.map((t) => t.temp)).toEqual([54, 68, 82]);
  });
});

const field = buildField();
const at = (name: string) => {
  const s = SETTLEMENTS[name];
  return project(s.lat, s.lon, ORIGIN.lat, ORIGIN.lon);
};

describe('atlas maps', () => {
  it('stays inside the ranges the atlas states for each map', () => {
    // Atlas text: 34.2 to 43.6 °C at 500 m (mean 38.2), 57.5 to 73.5 at 1,000 m, 95 to 120 at 2,000 m.
    const [a, b, c] = [0, 1, 2].map((i) => atlasStats(field, i));
    expect(a.min).toBeGreaterThanOrEqual(34);
    expect(a.max).toBeLessThanOrEqual(44);
    expect(a.mean).toBeGreaterThan(37.7);
    expect(a.mean).toBeLessThan(38.7);
    expect(b.min).toBeGreaterThanOrEqual(57);
    expect(b.max).toBeLessThanOrEqual(74);
    expect(c.min).toBeGreaterThanOrEqual(94);
    expect(c.max).toBeLessThanOrEqual(122);
  });

  it('gets warmer with depth over the whole province', () => {
    const [a, b, c] = [0, 1, 2].map((i) => atlasStats(field, i));
    expect(b.min).toBeGreaterThan(a.max);
    expect(c.min).toBeGreaterThan(b.max);
  });

  it('places the places the atlas names: hottest at 500 m around Subotica and Kupinovo, coolest in the east', () => {
    const t500 = (n: string) => tempAt(field, at(n).x, at(n).y, 0.5);
    expect(t500('kupinovo')).toBeGreaterThan(41);
    expect(t500('subotica')).toBeGreaterThan(40);
    // Alibunar and Janošik lie on the cool side of the Banat, near Uljma.
    expect(t500('janosik')).toBeLessThan(37);
  });

  it('has the lowest 2,000 m temperature, below 96 °C, around Inđija', () => {
    expect(tempAt(field, at('indjija').x, at('indjija').y, 2)).toBeLessThan(96.5);
  });
});

describe('Gauss–Krüger', () => {
  it('puts Novi Sad and Subotica where the atlas grid shows them', () => {
    const ns = SETTLEMENTS.noviSad;
    const sub = SETTLEMENTS.subotica;
    const a = gaussKruger(ns.lat, ns.lon);
    const b = gaussKruger(sub.lat, sub.lon);
    expect(Math.abs(a.e - 7408.3)).toBeLessThan(1);
    expect(Math.abs(a.n - 5014)).toBeLessThan(1.5);
    expect(Math.abs(b.e - 7396.8)).toBeLessThan(1);
    expect(Math.abs(b.n - 5107.1)).toBeLessThan(1.5);
  });
});

describe('temperature field', () => {
  const col: Column = [40, 66, 104];

  it('is the surface temperature at the surface, everywhere', () => {
    expect(tempFromColumn(col, 0)).toBe(SURFACE_TEMP);
    expect(tempAt(field, -40, 30, 0)).toBe(SURFACE_TEMP);
  });

  it('passes through the three atlas temperatures at their depths', () => {
    expect(tempFromColumn(col, 0.5)).toBeCloseTo(40, 9);
    expect(tempFromColumn(col, 1)).toBeCloseTo(66, 9);
    expect(tempFromColumn(col, 2)).toBeCloseTo(104, 9);
  });

  it('runs in straight lines between them', () => {
    expect(tempFromColumn(col, 0.25)).toBeCloseTo((SURFACE_TEMP + 40) / 2, 9);
    expect(tempFromColumn(col, 0.75)).toBeCloseTo(53, 9);
    expect(tempFromColumn(col, 1.5)).toBeCloseTo(85, 9);
  });

  it('carries on below 2,000 m at the slope between 1,000 and 2,000 m', () => {
    expect(tempFromColumn(col, 2.5)).toBeCloseTo(104 + 0.5 * (104 - 66), 9);
  });

  it('finds the depth of a temperature, the inverse of the temperature at a depth', () => {
    for (const d of [0.1, 0.5, 0.8, 1, 1.4, 2, 2.6]) {
      expect(depthFromColumn(col, tempFromColumn(col, d))).toBeCloseTo(d, 9);
    }
    expect(depthFromColumn(col, SURFACE_TEMP - 5)).toBe(0);
  });

  it('gives the slope of the segment a depth lies on', () => {
    expect(gradientFromColumn(col, 0.3)).toBeCloseTo((40 - SURFACE_TEMP) / 0.5, 9);
    expect(gradientFromColumn(col, 0.8)).toBeCloseTo((66 - 40) / 0.5, 9);
    expect(gradientFromColumn(col, 1.6)).toBeCloseTo(104 - 66, 9);
  });

  it('rises with depth below every place that has a well', () => {
    for (const key of Object.keys(SETTLEMENTS)) {
      const { x, y } = at(key);
      const c = columnAt(field, x, y);
      expect(c[0], key).toBeGreaterThan(SURFACE_TEMP);
      expect(c[1], key).toBeGreaterThan(c[0]);
      expect(c[2], key).toBeGreaterThan(c[1]);
    }
  });

  it('covers the settlements of the wells, and carries the border value past the outline', () => {
    expect(insideAtlas(field, at('noviSad').x, at('noviSad').y)).toBe(true);
    // Far south-west of the mapped area: outside the province, but still a finite value.
    expect(insideAtlas(field, -95, -95)).toBe(false);
    const c = columnAt(field, -95, -95);
    expect(Number.isFinite(c[0] + c[1] + c[2])).toBe(true);
    expect(c[1]).toBeGreaterThan(c[0]);
  });

  it('is warmer than the annex water at most wells, as rock is warmer than water at the wellhead', () => {
    let warmer = 0;
    let total = 0;
    let sum = 0;
    for (const w of WELLS) {
      const { x, y } = at(w.place);
      const c = columnAt(field, x, y);
      for (const t of w.tests) {
        const diff = tempFromColumn(c, testDepth(w, t) / 1000) - t.temp;
        total++;
        sum += diff;
        if (diff > 0) warmer++;
      }
    }
    expect(warmer / total).toBeGreaterThan(0.75);
    expect(sum / total).toBeGreaterThan(3);
    expect(sum / total).toBeLessThan(15);
  });

  it('averages the tests of a well with several intervals', () => {
    const p = wellPoint(WELLS.find((x) => x.id === 'Vbc-1/H')!);
    const expected =
      (testGradient(82, 1798.5) + testGradient(68, 1629) + testGradient(54, 1520.5)) / 3;
    expect(p.gradient).toBeCloseTo(expected, 6);
  });

  it('gives a gradient from temperature, surface temperature and depth', () => {
    expect(testGradient(65, 930.5)).toBeCloseTo((65 - SURFACE_TEMP) / 0.9305, 6);
    expect(testGradient(59, 1000)).toBeCloseTo(48, 6);
  });
});

describe('outline and relief', () => {
  const place = (lat: number, lon: number) => project(lat, lon, ORIGIN.lat, ORIGIN.lon);

  it('holds every settlement that has a well', () => {
    for (const [key, sett] of Object.entries(SETTLEMENTS)) {
      const { x, y } = place(sett.lat, sett.lon);
      expect(insideOutline(x, y), key).toBe(true);
    }
  });

  it('leaves out the cities across the border and south of the Danube and the Sava', () => {
    const outside: [string, number, number][] = [
      ['Belgrade', 44.8, 20.46],
      ['Osijek', 45.55, 18.69],
      ['Szeged', 46.25, 20.15],
      ['Timișoara', 45.75, 21.23],
      ['Požarevac', 44.62, 21.19],
    ];
    for (const [name, lat, lon] of outside) {
      const { x, y } = place(lat, lon);
      expect(insideOutline(x, y), name).toBe(false);
    }
  });

  it('spans about 215 km from west to east and 175 km from south to north', () => {
    const b = outlineBounds();
    expect(b.x1 - b.x0).toBeGreaterThan(200);
    expect(b.x1 - b.x0).toBeLessThan(230);
    expect(b.y1 - b.y0).toBeGreaterThan(165);
    expect(b.y1 - b.y0).toBeLessThan(185);
    expect(OUTLINE.length).toBeGreaterThan(0);
  });

  it('puts Fruška Gora high above the plain', () => {
    // Crveni Čot, the summit, is 539 m; the 1 km grid and the filter cut it a little.
    const peak = place(45.157, 19.717);
    expect(elevationAt(peak.x, peak.y)).toBeGreaterThan(380);
    expect(elevationAt(peak.x, peak.y)).toBeLessThan(560);
    // Novi Sad and Zrenjanin lie on the plain, close to the datum.
    for (const k of ['noviSad', 'zrenjanin', 'subotica', 'kikinda']) {
      const { x, y } = at(k);
      expect(elevationAt(x, y), k).toBeGreaterThan(55);
      expect(elevationAt(x, y), k).toBeLessThan(140);
    }
  });

  it('draws the ground relative to the median level of the province', () => {
    expect(DATUM_M).toBeGreaterThan(70);
    expect(DATUM_M).toBeLessThan(95);
    const peak = place(45.157, 19.717);
    expect(reliefAt(peak.x, peak.y)).toBeCloseTo((elevationAt(peak.x, peak.y) - DATUM_M) / 1000, 9);
  });
});

describe('colour scale', () => {
  it('runs green when cool, yellow in the middle, red when hot', () => {
    const [r0, g0, b0] = tempColor(0);
    const [r1, g1] = tempColor(67.5);
    const [r2, g2] = tempColor(200);
    expect(g0).toBeGreaterThan(r0);
    expect(b0).toBe(0);
    expect(r1).toBeGreaterThan(200);
    expect(g1).toBeGreaterThan(200);
    expect(r2).toBeGreaterThan(g2);
    expect(g2).toBe(0);
  });

  it('clamps outside the range', () => {
    expect(colorFraction(-5)).toBe(0);
    expect(colorFraction(500)).toBe(1);
  });
});

describe('projection', () => {
  it('measures 111 km to a degree of latitude and about 78 km to a degree of longitude at 45°N', () => {
    const p = project(46.4, 20.0, 45.4, 20.0);
    expect(p.y).toBeCloseTo(111.13, 1);
    const q = project(45.4, 21.0, 45.4, 20.0);
    expect(q.x).toBeGreaterThan(77);
    expect(q.x).toBeLessThan(79);
  });

  it('returns to the same latitude and longitude after a round trip', () => {
    const p = project(46.0111, 20.3128, 45.4, 20.0);
    const q = unproject(p.x, p.y, 45.4, 20.0);
    expect(q.lat).toBeCloseTo(46.0111, 8);
    expect(q.lon).toBeCloseTo(20.3128, 8);
  });
});
