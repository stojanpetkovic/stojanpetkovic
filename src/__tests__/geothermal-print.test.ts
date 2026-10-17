import { describe, expect, it } from 'vitest';
import { SURFACE_TEMP, type Column } from '../lib/geothermal/field';
import {
  FRAME_ASPECT,
  SHEET_MARGIN_MM,
  LEGEND_TICKS,
  bearingDeg,
  buildSheet,
  defaultFrame,
  distanceKm,
  legendStops,
  moveFrame,
  pageCss,
  pictureMm,
  pictureSize,
  profilePoints,
  profileSvg,
  resizeFrame,
  scaleDenominator,
  sheetMm,
  type SheetData,
} from '../lib/geothermal/print';

describe('paper', () => {
  it('knows the sheet sizes in both orientations', () => {
    expect(sheetMm('a4', 'landscape')).toEqual({ w: 297, h: 210 });
    expect(sheetMm('a4', 'portrait')).toEqual({ w: 210, h: 297 });
    expect(sheetMm('a3', 'landscape')).toEqual({ w: 420, h: 297 });
  });

  it('gives the picture the aspect of the frame and keeps it on the sheet', () => {
    for (const paper of ['a4', 'a3'] as const) {
      for (const orientation of ['landscape', 'portrait'] as const) {
        const sheet = sheetMm(paper, orientation);
        const pic = pictureMm(paper, orientation);
        expect(pic.w / pic.h, `${paper} ${orientation}`).toBeCloseTo(FRAME_ASPECT, 1);
        expect(pic.w).toBeLessThanOrEqual(sheet.w - 2 * SHEET_MARGIN_MM);
        // room for the title above it
        expect(pic.h).toBeLessThanOrEqual(sheet.h - 2 * SHEET_MARGIN_MM - 16);
      }
    }
  });

  it('puts the picture beside the data on a landscape sheet and above them on a portrait one', () => {
    expect(pictureMm('a4', 'landscape').w).toBeLessThan(0.7 * (297 - 2 * SHEET_MARGIN_MM));
    expect(pictureMm('a4', 'portrait').w).toBe(210 - 2 * SHEET_MARGIN_MM);
  });

  it('turns the picture into pixels for a print resolution, capped', () => {
    const px = pictureSize('a4', 'landscape', 200);
    expect(px.w).toBeCloseTo((pictureMm('a4', 'landscape').w / 25.4) * 200, -1);
    const capped = pictureSize('a3', 'portrait', 1200, 4096);
    expect(Math.max(capped.w, capped.h)).toBeLessThanOrEqual(4096);
    expect(capped.w / capped.h).toBeCloseTo(FRAME_ASPECT, 1);
  });

  it('writes the page rule for the print dialog', () => {
    expect(pageCss('a3', 'portrait')).toBe('@page { size: A3 portrait; margin: 10mm; }');
  });
});

describe('frame', () => {
  const stage = { w: 900, h: 600 };

  it('starts centred, with the right aspect, inside the stage', () => {
    const f = defaultFrame(stage.w, stage.h);
    expect(f.w / f.h).toBeCloseTo(FRAME_ASPECT, 6);
    expect(f.x + f.w / 2).toBeCloseTo(stage.w / 2, 6);
    expect(f.y + f.h / 2).toBeCloseTo(stage.h / 2, 6);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y + f.h).toBeLessThanOrEqual(stage.h);
  });

  it('fits a tall narrow stage by its width, not its height', () => {
    const f = defaultFrame(300, 900);
    expect(f.w).toBeLessThanOrEqual(300);
    expect(f.h).toBeLessThanOrEqual(900);
  });

  it('is moved by a drag but kept inside the stage', () => {
    const f = defaultFrame(stage.w, stage.h);
    const moved = moveFrame(f, 40, -25, stage);
    expect(moved.x).toBeCloseTo(f.x + 40, 6);
    expect(moved.y).toBeCloseTo(f.y - 25, 6);
    const far = moveFrame(f, 5000, 5000, stage);
    expect(far.x + far.w).toBeCloseTo(stage.w, 6);
    expect(far.y + far.h).toBeCloseTo(stage.h, 6);
    const back = moveFrame(f, -5000, -5000, stage);
    expect(back.x).toBe(0);
    expect(back.y).toBe(0);
  });

  it('is resized from a corner with the opposite corner fixed and the aspect kept', () => {
    const f = { x: 200, y: 150, w: 300, h: 300 / FRAME_ASPECT };
    for (const handle of ['nw', 'ne', 'sw', 'se'] as const) {
      const r = resizeFrame(
        f,
        handle,
        handle.includes('e') ? 60 : -60,
        handle.includes('s') ? 40 : -40,
        stage,
      );
      expect(r.w / r.h, handle).toBeCloseTo(FRAME_ASPECT, 6);
      expect(r.w, handle).toBeGreaterThan(f.w);
      const fixedX = handle.includes('e') ? f.x : f.x + f.w;
      const fixedY = handle.includes('s') ? f.y : f.y + f.h;
      expect(handle.includes('e') ? r.x : r.x + r.w, handle).toBeCloseTo(fixedX, 6);
      expect(handle.includes('s') ? r.y : r.y + r.h, handle).toBeCloseTo(fixedY, 6);
    }
  });

  it('never grows past the stage or shrinks below the minimum', () => {
    const f = defaultFrame(stage.w, stage.h, 0.5);
    const big = resizeFrame(f, 'se', 4000, 4000, stage);
    expect(big.x + big.w).toBeLessThanOrEqual(stage.w + 1e-6);
    expect(big.y + big.h).toBeLessThanOrEqual(stage.h + 1e-6);
    const small = resizeFrame(f, 'se', -4000, -4000, stage, 140);
    expect(small.w).toBeCloseTo(140, 6);
  });
});

describe('measuring', () => {
  const o = { x: 0, y: 0 };

  it('measures the distance in kilometres', () => {
    expect(distanceKm(o, { x: 3, y: 4 })).toBe(5);
    expect(distanceKm({ x: -10, y: 2 }, { x: -10, y: 2 })).toBe(0);
  });

  it('gives the bearing clockwise from north', () => {
    expect(bearingDeg(o, { x: 0, y: 10 })).toBe(0);
    expect(bearingDeg(o, { x: 10, y: 0 })).toBe(90);
    expect(bearingDeg(o, { x: 0, y: -10 })).toBe(180);
    expect(bearingDeg(o, { x: -10, y: 0 })).toBe(270);
    expect(bearingDeg(o, { x: 10, y: 10 })).toBeCloseTo(45, 6);
  });
});

describe('profile', () => {
  const col: Column = [40, 66, 104];

  it('starts at the surface temperature and rises with depth', () => {
    const pts = profilePoints(col);
    expect(pts[0]).toEqual({ depth: 0, temp: SURFACE_TEMP });
    for (let i = 1; i < pts.length; i++) expect(pts[i].temp).toBeGreaterThan(pts[i - 1].temp);
    expect(pts.at(-1)!.depth).toBeCloseTo(2.8, 6);
  });

  it('passes through the three atlas temperatures', () => {
    const at = (d: number) =>
      profilePoints(col, 2.8, 0.1).find((p) => Math.abs(p.depth - d) < 1e-6)!.temp;
    expect(at(0.5)).toBeCloseTo(40, 6);
    expect(at(1)).toBeCloseTo(66, 6);
    expect(at(2)).toBeCloseTo(104, 6);
  });

  it('draws a path, three marks, and a contour line only when one is asked for', () => {
    const plain = profileSvg(col, { tempLabel: 'T', depthLabel: 'D' });
    expect(plain.match(/<circle/g)).toHaveLength(3);
    expect(plain).toContain('<path class="pf-line"');
    expect(plain).not.toContain('pf-contour');
    const withContour = profileSvg(col, { tempLabel: 'T', depthLabel: 'D', contourTemp: 50 });
    expect(withContour).toContain('pf-contour');
  });

  it('leaves out the contour when its depth is below the chart', () => {
    expect(
      profileSvg(col, { tempLabel: 'T', depthLabel: 'D', contourTemp: 120, maxDepthKm: 1 }),
    ).not.toContain('pf-contour');
  });

  it('escapes the labels', () => {
    const svg = profileSvg(col, { tempLabel: '<b>"T"</b>', depthLabel: 'D' });
    expect(svg).not.toContain('<b>');
    expect(svg).toContain('&lt;b&gt;');
  });
});

describe('sheet', () => {
  const base: SheetData = {
    paper: 'a4',
    orientation: 'landscape',
    title: 'Model <1>',
    subtitle: 'Vojvodina',
    date: '17 October 2026',
    image: 'data:image/png;base64,AAAA',
    imageAlt: 'Top view',
    credit: 'Map © OpenStreetMap',
    facts: [{ title: 'Frame', rows: [{ label: 'Centre', value: '45.4°N' }] }],
    legend: {
      title: 'Temperature',
      stops: 'rgb(0 0 0) 0%, rgb(255 0 0) 100%',
      ticks: [
        { value: 10, left: 0 },
        { value: 125, left: 100 },
      ],
      keys: ['Bar: measured'],
    },
    wells: {
      title: 'Wells',
      head: ['Well', 'Place'],
      rows: [
        ['Bč-2/H', 'Bečej'],
        ['Kl-1/H', 'Kula'],
      ],
      empty: 'None',
    },
    notes: { title: 'Notes', items: ['A model, not a measurement.'] },
    footer: 'stojanpetkovic.com',
  };

  it('carries the picture, the title and the data', () => {
    const html = buildSheet(base);
    expect(html).toContain('src="data:image/png;base64,AAAA"');
    expect(html).toContain('geo-sheet--landscape');
    expect(html).toContain('geo-sheet--a4');
    expect(html).toContain('Bč-2/H');
    expect(html).toContain('Bar: measured');
    expect(html.match(/<tr>/g)!.length).toBeGreaterThanOrEqual(3);
  });

  it('escapes everything a visitor or a locale could put in', () => {
    const html = buildSheet({
      ...base,
      wells: { ...base.wells, rows: [['<script>x</script>', 'a"b']] },
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Model &lt;1&gt;');
  });

  it('says so when no well is in the frame', () => {
    const html = buildSheet({ ...base, wells: { ...base.wells, rows: [] } });
    expect(html).toContain('gs-empty');
    expect(html).toContain('None');
    expect(html).not.toContain('gs-grid');
  });

  it('adds the probed point and the selected well only when there are some', () => {
    expect(buildSheet(base)).not.toContain('gs-selected');
    expect(buildSheet(base)).not.toContain('gs-chart');
    const html = buildSheet({
      ...base,
      point: { title: 'Point', rows: [{ label: 'T', value: '1' }], chart: '<svg></svg>' },
      selected: {
        title: 'Well',
        rows: [{ label: 'Depth', value: '1,020 m' }],
        tests: ['890–971 m: 65 °C'],
      },
    });
    expect(html).toContain('gs-chart');
    expect(html).toContain('gs-selected');
    expect(html).toContain('890–971 m: 65 °C');
  });

  it('sizes the picture on the sheet in millimetres', () => {
    expect(buildSheet(base)).toContain(`--gs-picture:${pictureMm('a4', 'landscape').w}mm`);
    expect(buildSheet({ ...base, paper: 'a3', orientation: 'portrait' })).toContain(
      `--gs-picture:${pictureMm('a3', 'portrait').w}mm`,
    );
  });
});

describe('scale and legend', () => {
  it('works the scale out from the ground width and the picture width, to two figures', () => {
    // 150 km across on 183 mm of paper: 1:819,672 -> 1:820,000
    expect(scaleDenominator(150, 183)).toBe(820000);
    // 12 km across on 190 mm: 1:63,157 -> 1:63,000
    expect(scaleDenominator(12, 190)).toBe(63000);
    expect(scaleDenominator(1, 100)).toBe(10000);
  });

  it('gives the colour bar the colours the model uses, from cool to hot', () => {
    const stops = legendStops(4).split(', ');
    expect(stops).toHaveLength(4);
    expect(stops[0]).toMatch(/^rgb\(\d+ \d+ \d+\) 0%$/);
    expect(stops[3]).toMatch(/ 100%$/);
    expect(LEGEND_TICKS[0].left).toBe(0);
    expect(LEGEND_TICKS.at(-1)!.left).toBe(100);
    expect(LEGEND_TICKS.map((t) => t.value)).toEqual([10, 40, 70, 100, 125]);
  });
});
