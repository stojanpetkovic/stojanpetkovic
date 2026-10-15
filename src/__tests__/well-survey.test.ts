import { describe, expect, it } from 'vitest';
import { minimumCurvature, parseSurvey, pointAt, summarise } from '../lib/tools/well/survey';

describe('minimum curvature', () => {
  it('keeps a vertical well vertical', () => {
    const path = minimumCurvature([{ md: 1000, inclination: 0, azimuth: 0 }, { md: 2000, inclination: 0, azimuth: 0 }], 'ft');
    expect(path.at(-1)!.tvd).toBeCloseTo(2000, 9);
    expect(path.at(-1)!.north).toBeCloseTo(0, 9);
    expect(path.at(-1)!.dls).toBe(0);
  });
  it('builds a circular arc from vertical to horizontal', () => {
    // 90 degrees over 1000 ft: radius 1000 / (pi/2).
    const path = minimumCurvature([{ md: 0, inclination: 0, azimuth: 0 }, { md: 1000, inclination: 90, azimuth: 0 }], 'ft');
    const radius = 1000 / (Math.PI / 2);
    expect(path.at(-1)!.tvd).toBeCloseTo(radius, 6);
    expect(path.at(-1)!.north).toBeCloseTo(radius, 6);
    expect(path.at(-1)!.east).toBeCloseTo(0, 6);
    expect(path.at(-1)!.dls).toBeCloseTo(9, 9); // 90 deg per 1000 ft = 9 deg per 100 ft
  });
  it('uses 30 m for the dogleg base in metres', () => {
    const path = minimumCurvature([{ md: 0, inclination: 0, azimuth: 0 }, { md: 300, inclination: 30, azimuth: 0 }], 'm');
    expect(path.at(-1)!.dls).toBeCloseTo(3, 9); // 30 deg per 300 m = 3 deg per 30 m
  });
  it('goes east at azimuth 90 and keeps a straight tangent straight', () => {
    const path = minimumCurvature([{ md: 0, inclination: 60, azimuth: 90 }, { md: 500, inclination: 60, azimuth: 90 }], 'ft');
    expect(path.at(-1)!.east).toBeCloseTo(500 * Math.sin((60 * Math.PI) / 180), 9);
    expect(path.at(-1)!.north).toBeCloseTo(0, 9);
    expect(path.at(-1)!.tvd).toBeCloseTo(250, 9);
  });
  it('runs vertically from the surface to a first station below it', () => {
    const path = minimumCurvature([{ md: 500, inclination: 0, azimuth: 0 }], 'ft');
    expect(path).toHaveLength(2);
    expect(path[1].tvd).toBeCloseTo(500, 9);
  });
  it('matches a hand-worked two-station turn', () => {
    // Inclination 10 to 20 and azimuth 30 to 60 over 100 ft: dogleg and arc computed from the definitions.
    const [, p] = minimumCurvature([{ md: 0, inclination: 10, azimuth: 30 }, { md: 100, inclination: 20, azimuth: 60 }], 'ft');
    const r = Math.PI / 180;
    const beta = Math.acos(Math.cos(10 * r) - Math.sin(10 * r) * Math.sin(20 * r) * (1 - Math.cos(30 * r)));
    const rf = (2 / beta) * Math.tan(beta / 2);
    expect(p.tvd).toBeCloseTo(50 * (Math.cos(10 * r) + Math.cos(20 * r)) * rf, 9);
    expect(p.dls).toBeCloseTo(((beta / r) / 100) * 100, 9);
  });
  it('interpolates a point along the path and continues below the last station', () => {
    const path = minimumCurvature([{ md: 0, inclination: 0, azimuth: 0 }, { md: 1000, inclination: 90, azimuth: 0 }], 'ft');
    const mid = pointAt(path, 500, 'ft');
    expect(mid.md).toBe(500);
    expect(mid.inclination).toBeCloseTo(45, 9);
    expect(pointAt(path, 1500, 'ft').north).toBeCloseTo(path.at(-1)!.north + 500, 6);
  });
  it('summarises the path', () => {
    const s = summarise(minimumCurvature([{ md: 0, inclination: 0, azimuth: 0 }, { md: 1000, inclination: 90, azimuth: 90 }], 'ft'));
    expect(s.md).toBe(1000);
    expect(s.maxInclination).toBe(90);
    expect(s.closureAzimuth).toBeGreaterThan(0);
  });
});

describe('survey parsing', () => {
  it('reads separators, a header, comments and decimal commas', () => {
    const csv = 'MD,Inc,Azi\n0,0,0\n1000.5,10.25,45\n# note\n2000,20,90';
    expect(parseSurvey(csv).stations).toHaveLength(3);
    expect(parseSurvey('MD;INC;AZI\n0;0;0\n1000,5;10,25;45').stations![1]).toEqual({ md: 1000.5, inclination: 10.25, azimuth: 45 });
    expect(parseSurvey('0\t0\t0\n100\t5\t10').stations).toHaveLength(2);
    expect(parseSurvey('0 0 0\n100 5 10').stations).toHaveLength(2);
    expect(parseSurvey('0,0,0\r\n100,5,10\r\n').stations).toHaveLength(2);
  });
  it('reports the line of a problem', () => {
    expect(parseSurvey('')).toEqual({ error: { code: 'empty' } });
    expect(parseSurvey('0,0,0\n100,5')).toEqual({ error: { code: 'columns', line: 2 } });
    expect(parseSurvey('0,0,0\n100,x,5')).toEqual({ error: { code: 'number', line: 2 } });
    expect(parseSurvey('0,0,0\n100,200,5')).toEqual({ error: { code: 'range', line: 2 } });
    expect(parseSurvey('0,0,0\n100,5,10\n100,6,10')).toEqual({ error: { code: 'order', line: 3 } });
    expect(parseSurvey('0,0,0\n100,5,400')).toEqual({ error: { code: 'range', line: 2 } });
  });
});
