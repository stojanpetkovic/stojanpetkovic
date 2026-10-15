/**
 * A small 3D viewer of the well path on a 2D canvas: an orthographic projection
 * that the visitor turns by dragging, with a ground grid, a depth axis, the path
 * coloured by dogleg severity, its shadow on the ground and markers for the
 * casing shoes, the tubing end, the packer and the perforations. No library: the
 * path has a few hundred points at most.
 *
 * World axes: east (x), north (y) and up (z, so depth is negative). The view
 * turns about the vertical axis (yaw) and tilts from the horizon (elevation).
 */
import type { PathPoint } from './survey';

export interface Marker {
  md: number;
  label: string;
  kind: 'shoe' | 'tubing' | 'packer' | 'ct';
}

export interface Interval {
  from: number;
  to: number;
  label: string;
}

export interface ViewData {
  path: readonly PathPoint[];
  /** Position and angles at an MD; supplied so the viewer does not need the survey code's unit. */
  at: (md: number) => PathPoint;
  markers: readonly Marker[];
  intervals: readonly Interval[];
  unit: 'ft' | 'm';
}

export interface ViewLabels {
  north: string;
  east: string;
  depth: string;
  low: string;
  high: string;
}

type Vec = { x: number; y: number; z: number };

const toWorld = (p: PathPoint): Vec => ({ x: p.east, y: p.north, z: -p.tvd });

/** A step of 1, 2, 5 times a power of ten, for about n steps over a span. */
function niceStep(span: number, n: number): number {
  const raw = span / n;
  const power = 10 ** Math.floor(Math.log10(raw));
  const f = raw / power;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * power;
}

export class WellViewer {
  private ctx: CanvasRenderingContext2D;
  private data: ViewData | null = null;
  private yaw = 0.7;
  private elevation = 0.45;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private drag: { x: number; y: number; button: number } | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private labels: ViewLabels
  ) {
    this.ctx = canvas.getContext('2d')!;
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this.drag = { x: e.clientX, y: e.clientY, button: e.shiftKey ? 2 : e.button };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
      if (this.drag.button === 2) {
        this.panX += dx;
        this.panY += dy;
      } else {
        this.yaw -= dx * 0.008;
        this.elevation = Math.min(Math.PI / 2, Math.max(0, this.elevation + dy * 0.008));
      }
      this.draw();
    });
    const end = () => (this.drag = null);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.setZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
      },
      { passive: false }
    );
    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  setData(data: ViewData) {
    this.data = data;
    this.draw();
  }

  setZoom(zoom: number) {
    this.zoom = Math.min(8, Math.max(0.3, zoom));
    this.draw();
  }

  zoomBy(factor: number) {
    this.setZoom(this.zoom * factor);
  }

  preset(name: 'top' | 'side' | 'reset') {
    this.panX = this.panY = 0;
    this.zoom = 1;
    if (name === 'top') [this.yaw, this.elevation] = [0, Math.PI / 2];
    else if (name === 'side') [this.yaw, this.elevation] = [0, 0];
    else [this.yaw, this.elevation] = [0.7, 0.45];
    this.draw();
  }

  private colour(name: string, fallback: string): string {
    return getComputedStyle(this.canvas).getPropertyValue(name).trim() || fallback;
  }

  draw() {
    const { canvas, ctx, data } = this;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!data || data.path.length === 0) return;

    const ink = this.colour('--color-foreground-muted', '#555');
    const grid = this.colour('--color-border', '#ddd');
    const brand = this.colour('--color-brand-600', '#2563eb');
    const hot = this.colour('--cta', '#f59e0b');
    const text = this.colour('--color-foreground', '#111');

    const points = data.path.map(toWorld);
    const reach = Math.max(1, ...points.map((p) => Math.hypot(p.x, p.y)));
    const depth = Math.max(1, ...points.map((p) => -p.z));
    const extent = Math.max(reach * 1.15, depth * 0.35, depth * 0.1);
    const radius = Math.max(extent, 1);

    // Orthographic projection of the world into the canvas.
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const ce = Math.cos(this.elevation);
    const se = Math.sin(this.elevation);
    const project = (v: Vec) => {
      const x1 = v.x * cy - v.y * sy;
      const y1 = v.x * sy + v.y * cy;
      return { x: x1, y: v.z * ce + y1 * se };
    };
    // Fit the whole drawing, including the depth axis, to the canvas.
    const corners: Vec[] = [
      { x: -radius, y: -radius, z: 0 },
      { x: radius, y: -radius, z: 0 },
      { x: -radius, y: radius, z: 0 },
      { x: radius, y: radius, z: 0 },
      ...points,
    ];
    const xs = corners.map((c) => project(c).x);
    const ys = corners.map((c) => project(c).y);
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const scale = Math.min((w - 90) / spanX, (h - 60) / spanY) * this.zoom;
    const midX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const midY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const screen = (v: Vec) => {
      const p = project(v);
      return { x: w / 2 + (p.x - midX) * scale + this.panX, y: h / 2 - (p.y - midY) * scale + this.panY };
    };

    ctx.font = '11px system-ui, sans-serif';
    ctx.lineJoin = 'round';

    // Ground grid.
    const step = niceStep(radius * 2, 6);
    const lines = Math.ceil(radius / step);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    for (let i = -lines; i <= lines; i++) {
      const a = i * step;
      for (const [from, to] of [
        [{ x: a, y: -lines * step, z: 0 }, { x: a, y: lines * step, z: 0 }],
        [{ x: -lines * step, y: a, z: 0 }, { x: lines * step, y: a, z: 0 }],
      ] as [Vec, Vec][]) {
        const s = screen(from);
        const e = screen(to);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = ink;
    const n = screen({ x: 0, y: lines * step, z: 0 });
    const e = screen({ x: lines * step, y: 0, z: 0 });
    ctx.fillText(this.labels.north, n.x + 4, n.y - 4);
    ctx.fillText(this.labels.east, e.x + 4, e.y - 4);

    // Depth axis at the wellhead, with ticks.
    const axisStep = niceStep(depth, 5);
    ctx.strokeStyle = ink;
    ctx.beginPath();
    const top = screen({ x: 0, y: 0, z: 0 });
    const bottomAxis = screen({ x: 0, y: 0, z: -depth });
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottomAxis.x, bottomAxis.y);
    ctx.stroke();
    for (let tvd = axisStep; tvd <= depth; tvd += axisStep) {
      const t = screen({ x: 0, y: 0, z: -tvd });
      ctx.beginPath();
      ctx.moveTo(t.x - 4, t.y);
      ctx.lineTo(t.x + 4, t.y);
      ctx.stroke();
      ctx.fillText(`${tvd.toLocaleString()} ${data.unit}`, t.x + 8, t.y + 4);
    }
    ctx.fillText(this.labels.depth, top.x + 8, top.y - 6);

    // Shadow of the path on the ground.
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    points.forEach((p, i) => {
      const s = screen({ x: p.x, y: p.y, z: 0 });
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // The path, coloured by dogleg severity.
    const maxDls = Math.max(0.0001, ...data.path.map((p) => p.dls));
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let i = 1; i < points.length; i++) {
      const s = screen(points[i - 1]);
      const t = screen(points[i]);
      const f = Math.min(1, data.path[i].dls / maxDls);
      ctx.strokeStyle = f < 0.5 ? brand : hot;
      ctx.globalAlpha = 0.55 + 0.45 * f;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Perforated intervals as a thicker segment.
    for (const interval of data.intervals) {
      const a = data.at(interval.from);
      const b = data.at(interval.to);
      const sa = screen(toWorld(a));
      const sb = screen(toWorld(b));
      ctx.strokeStyle = this.colour('--destructive', '#c0392b');
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.fillText(interval.label, sb.x + 10, sb.y + 4);
    }

    // Markers, with their labels kept apart from each other.
    ctx.lineWidth = 1.5;
    const placed = data.markers
      .map((marker) => ({ marker, at: screen(toWorld(data.at(marker.md))) }))
      .sort((a, b) => a.at.y - b.at.y);
    let lastLabel = -Infinity;
    for (const { marker, at } of placed) {
      ctx.fillStyle = marker.kind === 'shoe' ? text : marker.kind === 'packer' ? hot : brand;
      ctx.strokeStyle = this.colour('--color-card', '#fff');
      ctx.beginPath();
      ctx.arc(at.x, at.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const labelY = Math.max(at.y + 4, lastLabel + 13);
      lastLabel = labelY;
      ctx.fillStyle = text;
      ctx.fillText(marker.label, at.x + 12, labelY);
    }

    // The surface location and the bottom.
    ctx.fillStyle = text;
    const surface = screen({ x: 0, y: 0, z: 0 });
    ctx.beginPath();
    ctx.arc(surface.x, surface.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
