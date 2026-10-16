/**
 * The charts of a forces result, shared by the CT Forces page and the CT
 * Simulator: the weight indicator against depth, and the axial force along
 * the string at the analysed depth with the critical buckling force.
 */
import type { ForcesResult } from './ct-forces';
import { renderDepthChart } from './depth-chart';
import { convert, type UnitSystem } from './units';

export interface ChartCopy {
  ctwiAxis: string;
  forceAxis: string;
  depthAxis: string;
  bha: string;
}

export function forceCharts(
  result: ForcesResult,
  sys: UnitSystem,
  copy: ChartCopy,
  number: (value: number, digits?: number) => string
): { ctwi: string; force: string } {
  const ft = (v: number) => convert('length', 'us', sys, v);
  const force = (v: number) => convert('force', 'us', sys, v);
  const forceUnit = sys === 'us' ? 'lbf' : 't';
  const depthLabel = `${copy.depthAxis} (${sys === 'us' ? 'ft' : 'm'})`;
  const fmtForce = (v: number) => number(v, sys === 'us' ? 0 : 2);
  const rih = result.rih.profile;
  const pooh = result.pooh.profile;
  const ctwi = renderDepthChart({
    series: [
      { className: 'dc-rih', points: result.curve.map((p) => [force(p.rih), ft(p.depth)]) },
      { className: 'dc-pooh', points: result.curve.map((p) => [force(p.pooh), ft(p.depth)]) },
      { className: 'dc-limit', points: result.curve.map((p) => [force(p.limit), ft(p.depth)]) },
    ],
    xLabel: `${copy.ctwiAxis} (${forceUnit})`,
    yLabel: depthLabel,
    formatX: fmtForce,
    formatY: (v) => number(v, 0),
    marker: { depth: ft(result.depth), label: copy.bha },
  });
  const profile = renderDepthChart({
    series: [
      { className: 'dc-rih', points: rih.map((p) => [force(p.force), ft(p.md)]) },
      { className: 'dc-pooh', points: pooh.map((p) => [force(p.force), ft(p.md)]) },
      {
        className: 'dc-critical',
        points: rih.filter((p) => p.critical !== null && p.force < 0).map((p) => [force(-(p.critical as number)), ft(p.md)]),
      },
    ],
    xLabel: `${copy.forceAxis} (${forceUnit})`,
    yLabel: depthLabel,
    formatX: fmtForce,
    formatY: (v) => number(v, 0),
  });
  return { ctwi, force: profile };
}
