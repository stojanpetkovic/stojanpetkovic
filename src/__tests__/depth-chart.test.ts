import { describe, expect, it } from 'vitest';
import { niceTicks, renderDepthChart } from '../lib/tools/depth-chart';

describe('depth chart', () => {
  it('chooses round ticks', () => {
    expect(niceTicks(0, 10000, 5)).toEqual([0, 2000, 4000, 6000, 8000, 10000]);
    expect(niceTicks(-3200, 8100, 5)).toEqual([-2000, 0, 2000, 4000, 6000, 8000]);
  });

  const options = {
    series: [
      { className: 'dc-rih', points: [[0, 0], [1000, 5000], [2000, 10000]] as [number, number][] },
      { className: 'dc-pooh', points: [[-500, 0], [500, 10000]] as [number, number][] },
    ],
    xLabel: 'Force',
    yLabel: 'Depth',
    formatX: (v: number) => String(v),
    formatY: (v: number) => String(v),
    marker: { depth: 7000, label: 'BHA' },
  };

  it('draws every series, the marker and the zero line, with depth running down', () => {
    const svg = renderDepthChart(options);
    expect(svg).toContain('dc-rih');
    expect(svg).toContain('dc-pooh');
    expect(svg).toContain('dc-marker');
    expect(svg).toContain('dc-zero');
    // The deeper point of a series is lower on the page (larger y).
    const pts = /class="dc-line dc-rih" points="([^"]+)"/.exec(svg)![1].split(' ').map((p) => Number(p.split(',')[1]));
    expect(pts[2]).toBeGreaterThan(pts[0]);
  });

  it('survives empty and non-finite data', () => {
    expect(renderDepthChart({ ...options, series: [] })).toContain('<svg');
    const bad = renderDepthChart({ ...options, series: [{ className: 'dc-rih', points: [[NaN, 1], [1, 2], [2, 3]] }] });
    expect(bad).toContain('dc-rih');
  });

  it('escapes labels', () => {
    expect(renderDepthChart({ ...options, xLabel: '<b>' })).not.toContain('<b>');
  });
});
