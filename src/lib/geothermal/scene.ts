/**
 * The interactive 3D model of the Vojvodina wells: a ground surface on top,
 * translucent vertical sections below it coloured by modelled temperature, and
 * the wells themselves with their tested intervals coloured by measured
 * temperature. Green is cool, yellow warm, red hot.
 *
 * Scene units are kilometres. x runs east, z runs south (so north is up when
 * looking down), and y is up; depth is drawn downward and multiplied by the
 * vertical exaggeration, because the area is ~180 km across and the wells reach
 * only 2.5 km.
 *
 * The page loads this module only when the model scrolls into view; the markup
 * and the strings come from `GeothermalModel.astro`.
 */

import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  LineLoop,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OUTLINE, elevationAt, insideOutline, outlineBounds, reliefAt } from './terrain';
import { bearingDeg, distanceKm, type Rect } from './print';
import {
  COLOR_MAX,
  ORIGIN,
  buildField,
  columnAt,
  depthFromColumn,
  gaussKruger,
  gradientFromColumn,
  tempColor,
  tempFromColumn,
  testGradient,
  type Column,
} from './field';
import {
  SETTLEMENTS,
  WELLS,
  hasInterval,
  project,
  testDepth,
  unproject,
  type Well,
  type WellStatus,
} from './wells';

export interface GeoStrings {
  locale: string;
  status: Record<WellStatus, string>;
  /** Templates; `{name}` placeholders are filled by `fmt`. */
  tipWell: string;
  tipInterval: string;
  tipNoInterval: string;
  tipSection: string;
  detailEmpty: string;
  mapLoading: string;
  mapError: string;
  detailTest: string;
  detailNoInterval: string;
  detailLowerBound: string;
  fields: Record<'place' | 'status' | 'year' | 'depth', string>;
  units: Record<'m' | 'km' | 'degC' | 'gradient' | 'flow' | 'minerals', string>;
}

/** A point on the ground under the pointer, with what the atlas and the terrain say about it. */
export interface GroundHit {
  /** Local kilometres east and north of the model origin. */
  x: number;
  y: number;
  lat: number;
  lon: number;
  /** Gauss–Krüger zone 7, km. */
  e: number;
  n: number;
  /** Ground elevation above sea level, m. */
  elevation: number;
  /** Atlas temperatures at 500, 1,000 and 2,000 m below the point. */
  column: Column;
}

/** Callbacks the workspace sets to follow the pointer and the clicks. */
export interface GeoHooks {
  hover?: (hit: GroundHit | null) => void;
  ground?: (hit: GroundHit) => void;
  well?: (id: string) => void;
}

/** The settings a printed sheet reports. */
export interface GeoState {
  ve: number;
  relief: number;
  groundOpacity: number;
  layers: { on: boolean; step: number; opacity: number };
  contours: { on: boolean; temp: number };
  basemap: boolean;
  walls: boolean;
  labels: boolean;
  wells: boolean;
  statuses: Record<WellStatus, boolean>;
  selected: string | null;
}

/** What the workspace around the model can ask of it. */
export interface GeoController {
  hooks: GeoHooks;
  stageSize(): { w: number; h: number };
  setView(name: string): void;
  requestRender(): void;
  /** Wheel and pinch zoom always on, as in a full-screen window where the page does not scroll. */
  setZoomAlways(on: boolean): void;
  /** Whether a click on a well selects it; off, every click lands on the ground. */
  setWellsClickable(on: boolean): void;
  groundAt(clientX: number, clientY: number): GroundHit | null;
  setMeasure(points: [GroundHit, GroundHit] | null): void;
  setProbe(hit: GroundHit | null): void;
  selectWell(id: string): void;
  focusWell(id: string): void;
  state(): GeoState;
  /** Direction the camera looks: degrees clockwise from north, and below the horizon. */
  cameraInfo(): { azimuth: number; tilt: number };
  /** Where a rectangle of the stage lies on the ground. */
  frameInfo(region: Rect): {
    center: { lat: number; lon: number } | null;
    widthKm: number | null;
    heightKm: number | null;
  };
  wellsInRegion(region: Rect): Well[];
  /** The model as it is now, over a rectangle of the stage, drawn at a size, with settlement names. */
  snapshot(region: Rect, outW: number, outH: number): HTMLCanvasElement;
}

export interface GeoHandle {
  dispose(): void;
  controller: GeoController;
}

/** Settlements whose names are kept first when names would overlap on a sheet. */
const LABEL_PRIORITY = [
  'Novi Sad',
  'Subotica',
  'Zrenjanin',
  'Kikinda',
  'Bečej',
  'Vrbas',
  'Kula',
  'Srbobran',
  'Kanjiža',
  'Inđija',
  'Temerin',
  'Bačka Topola',
  'Sonta',
  'Kupinovo',
  'Alibunar',
  'Melenci',
  'Šajkaš',
  'Bački Petrovac',
  'Banatski Karlovac',
  'Janošik',
  'Žitište',
  'Mokrin',
  'Srpska Crnja',
  'Prigrevica',
  'Kupusina',
  'Čelarevo',
  'Zobnatica',
  'Vrbica',
  'Palić',
  'Bačko Dobro Polje',
  'Bačko Karađorđevo',
  'Banatsko Veliko Selo',
];

const fmt = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** Depth of the block below the ground, km. The deepest well reaches 2.52 km. */
const BLOCK_DEPTH_KM = 2.8;
/** Alpha of the side walls, the ground and the horizontal layers when first shown. */
const WALL_OPACITY = 0.6;
const GROUND_OPACITY = 0.4;
const LAYER_OPACITY = 0.3;
/**
 * Basemap: OpenTopoMap, free to use with the attribution shown over the model.
 * The pictures come from the visitor's browser straight to opentopomap.org.
 */
const MAP_ZOOM = 9;
const tileUrl = (z: number, x: number, y: number) =>
  `https://tile.opentopomap.org/${z}/${x}/${y}.png`;

const field = buildField();

/** Local positions of the wells in km, with wells of one settlement spread on a small ring so their lines do not overlap. */
function wellPositions(): Map<string, { x: number; y: number }> {
  const byPlace = new Map<string, Well[]>();
  for (const w of WELLS) byPlace.set(w.place, [...(byPlace.get(w.place) ?? []), w]);
  const out = new Map<string, { x: number; y: number }>();
  for (const [place, wells] of byPlace) {
    const s = SETTLEMENTS[place];
    const c = project(s.lat, s.lon, ORIGIN.lat, ORIGIN.lon);
    wells.forEach((w, i) => {
      const a = (2 * Math.PI * i) / wells.length;
      const r = wells.length > 1 ? 1.8 : 0;
      out.set(w.id, { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) });
    });
  }
  return out;
}

/** Resolve a CSS colour (any syntax the browser understands) to 0–1 sRGB by painting one pixel. */
function cssColor(el: HTMLElement, token: string, fallback: [number, number, number]): Color {
  try {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    el.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no 2d context');
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
  } catch {
    return new Color().setRGB(fallback[0], fallback[1], fallback[2], SRGBColorSpace);
  }
}

const dataColor = (temp: number) => {
  const [r, g, b] = tempColor(temp);
  return new Color().setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
};

export function mountGeoModel(root: HTMLElement, s: GeoStrings): GeoHandle {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const stage = q<HTMLElement>('[data-geo-stage]')!;
  const labelLayer = q<HTMLElement>('[data-geo-labels]')!;
  const tip = q<HTMLElement>('[data-geo-tip]')!;
  const detail = q<HTMLElement>('[data-geo-detail]')!;
  const num = new Intl.NumberFormat(s.locale, { maximumFractionDigits: 1 });
  const int = new Intl.NumberFormat(s.locale, { maximumFractionDigits: 0 });
  const fmt2 = new Intl.NumberFormat(s.locale, { maximumFractionDigits: 3 });

  // ── Renderer, camera, controls ────────────────────────────────────────────
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1));
  const camera = new PerspectiveCamera(38, 1, 1, 3000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = true;
  controls.minDistance = 30;
  controls.maxDistance = 900;
  // The wheel scrolls the page until the visitor has clicked into the model.
  controls.enableZoom = false;

  // ── Extent of the block ───────────────────────────────────────────────────
  const positions = wellPositions();
  const bounds = outlineBounds();
  const X0 = Math.floor(bounds.x0) - 1;
  const X1 = Math.ceil(bounds.x1) + 1;
  const Y0 = Math.floor(bounds.y0) - 1;
  const Y1 = Math.ceil(bounds.y1) + 1;
  const cx = (X0 + X1) / 2;
  const cy = (Y0 + Y1) / 2;

  // ── State ─────────────────────────────────────────────────────────────────
  let ve = 20;
  // Exaggeration of the relief, the same as that of depth until the visitor changes it.
  let relief = 20;
  let groundOpacity = GROUND_OPACITY;
  const shown = { ground: true, wells: true, labels: true, walls: true } as Record<string, boolean>;
  const layers = { on: true, step: 0.5, opacity: LAYER_OPACITY };
  const contours = { on: true, temp: 50 };
  const basemap = { on: true };
  const statusShown: Record<WellStatus, boolean> = {
    producing: true,
    idle: true,
    untapped: true,
  };
  let selected: string | null = null;

  // ── Theme colours ─────────────────────────────────────────────────────────
  let ink = new Color();
  let muted = new Color();
  let ground = new Color();
  let paper = new Color();
  const readTheme = () => {
    ink = cssColor(root, '--color-foreground', [0.1, 0.1, 0.1]);
    muted = cssColor(root, '--color-border-strong', [0.6, 0.6, 0.6]);
    ground = cssColor(root, '--color-background-secondary', [0.93, 0.93, 0.93]);
    paper = cssColor(root, '--color-background', [1, 1, 1]);
  };
  readTheme();

  /** Height of the ground above the datum at a point, in scene units. */
  const height = (x: number, y: number) => reliefAt(x, y) * relief;

  /** White where the province is and black outside it: clips flat planes to the outline. */
  const masks: CanvasTexture[] = [];
  function outlineMask(channel: 0 | 1): CanvasTexture {
    if (masks[channel]) return masks[channel];
    const W = 1024;
    const H = Math.round(W * ((Y1 - Y0) / (X1 - X0)));
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff';
    for (const ring of OUTLINE) {
      ctx.beginPath();
      ring.forEach(([x, y], k) => {
        const px = ((x - X0) / (X1 - X0)) * W;
        const py = ((Y1 - y) / (Y1 - Y0)) * H;
        if (k) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
    const tex = new CanvasTexture(canvas);
    tex.channel = channel;
    masks[channel] = tex;
    return tex;
  }

  // ── Groups that are rebuilt when a setting changes ────────────────────────
  const world = new Group();
  scene.add(world);
  const groundGroup = new Group();
  const wellGroup = new Group();
  const sectionGroup = new Group();
  const highlightGroup = new Group();
  const contourGroup = new Group();
  const toolGroup = new Group();
  world.add(groundGroup, sectionGroup, wellGroup, highlightGroup, contourGroup, toolGroup);

  const disposeGroup = (g: Group) => {
    for (const child of [...g.children]) {
      g.remove(child);
      child.traverse((o: Object3D) => {
        const m = o as Mesh;
        m.geometry?.dispose();
        const mat = m.material as MeshBasicMaterial | MeshBasicMaterial[] | undefined;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) {
          x.map?.dispose();
          x.dispose();
        }
      });
    }
  };

  // Ground: a translucent slab top with a graticule every half degree.
  // Basemap: Web Mercator tiles stitched on a canvas, laid on the ground with
  // per-vertex texture coordinates so the projection matches the local map.
  type MapTexture = {
    texture: CanvasTexture;
    px0: number;
    py0: number;
    width: number;
    height: number;
  };
  let mapCache: MapTexture | null = null;
  const mapStatus = q<HTMLElement>('[data-geo-map-status]');
  const mapAttribution = q<HTMLElement>('[data-geo-attribution]');
  let mapRequest = 0;

  const mercatorX = (lon: number) => ((lon + 180) / 360) * 256 * 2 ** MAP_ZOOM;
  const mercatorY = (lat: number) => {
    const r = (lat * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 256 * 2 ** MAP_ZOOM;
  };

  function setMapStatus(text: string) {
    if (mapStatus) mapStatus.textContent = text;
  }

  async function loadMap(): Promise<MapTexture | null> {
    if (mapCache) return mapCache;
    const corners = [
      unproject(X0, Y0, ORIGIN.lat, ORIGIN.lon),
      unproject(X1, Y1, ORIGIN.lat, ORIGIN.lon),
    ];
    const lons = corners.map((c) => c.lon);
    const lats = corners.map((c) => c.lat);
    const tx0 = Math.floor(mercatorX(Math.min(...lons)) / 256);
    const tx1 = Math.floor(mercatorX(Math.max(...lons)) / 256);
    const ty0 = Math.floor(mercatorY(Math.max(...lats)) / 256);
    const ty1 = Math.floor(mercatorY(Math.min(...lats)) / 256);
    const canvas = document.createElement('canvas');
    canvas.width = (tx1 - tx0 + 1) * 256;
    canvas.height = (ty1 - ty0 + 1) * 256;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = ground.getStyle();
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    let loaded = 0;
    const jobs: Promise<void>[] = [];
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        jobs.push(
          new Promise<void>((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              ctx.drawImage(img, (tx - tx0) * 256, (ty - ty0) * 256);
              loaded++;
              resolve();
            };
            img.onerror = () => resolve();
            img.src = tileUrl(MAP_ZOOM, tx, ty);
          }),
        );
      }
    }
    await Promise.all(jobs);
    if (!loaded) return null;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return (mapCache = {
      texture,
      px0: tx0 * 256,
      py0: ty0 * 256,
      width: canvas.width,
      height: canvas.height,
    });
  }

  /**
   * The ground: a grid over the block raised by the relief. With a basemap its first set of
   * texture coordinates follows Mercator; the second, `uv1`, spans the block and serves the
   * outline mask. Wider than the province: the mask cuts it to the outline.
   */
  function terrainGeometry(map: MapTexture | null, lift = 0) {
    const geometry = new PlaneGeometry(
      X1 - X0,
      Y1 - Y0,
      Math.round((X1 - X0) / 1.5),
      Math.round((Y1 - Y0) / 1.5),
    );
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    geometry.setAttribute('uv1', uv.clone());
    for (let i = 0; i < pos.count; i++) {
      const x = cx + pos.getX(i);
      const y = cy + pos.getY(i);
      pos.setZ(i, height(x, y) + lift);
      if (map) {
        const { lat, lon } = unproject(x, y, ORIGIN.lat, ORIGIN.lon);
        uv.setXY(
          i,
          (mercatorX(lon) - map.px0) / map.width,
          1 - (mercatorY(lat) - map.py0) / map.height,
        );
      }
    }
    return geometry;
  }

  async function applyMap() {
    const request = ++mapRequest;
    if (mapAttribution) mapAttribution.hidden = !basemap.on;
    if (!basemap.on) {
      setMapStatus('');
      buildGround();
      requestRender();
      return;
    }
    setMapStatus(s.mapLoading);
    const map = await loadMap();
    if (request !== mapRequest) return;
    setMapStatus(map ? '' : s.mapError);
    if (!map) {
      basemap.on = false;
      const box = q<HTMLInputElement>('[data-geo-ctl="map"]');
      if (box) box.checked = false;
    }
    if (mapAttribution) mapAttribution.hidden = !map;
    buildGround();
    requestRender();
  }

  function buildGround() {
    disposeGroup(groundGroup);
    const map = basemap.on ? mapCache : null;
    const plane = new Mesh(
      terrainGeometry(map),
      new MeshBasicMaterial({
        color: map ? 0xffffff : ground,
        map: map?.texture ?? null,
        alphaMap: outlineMask(1),
        transparent: true,
        opacity: groundOpacity,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, 0, -cy);
    plane.renderOrder = 3;
    groundGroup.add(plane);

    // Outline of the block: along the ground and along the bottom.
    const edge = new LineBasicMaterial({ color: muted });
    for (const ring of OUTLINE) {
      for (const top of [true, false]) {
        const pts = ring.flatMap(([x, y]) => [
          x,
          top ? height(x, y) + 0.03 : -BLOCK_DEPTH_KM * ve,
          -y,
        ]);
        const g = new BufferGeometry();
        g.setAttribute('position', new Float32BufferAttribute(pts, 3));
        groundGroup.add(new LineLoop(g, edge));
      }
    }
    groundGroup.visible = shown.ground;
  }

  // Wells: a line to total depth, a marker per tested interval, a wellhead
  // symbol by status, and an invisible fat cylinder to make hovering easy.
  let hitTargets: Mesh[] = [];
  function buildWells() {
    disposeGroup(wellGroup);
    hitTargets = [];
    const linePts: number[] = [];
    for (const w of WELLS) {
      if (!statusShown[w.status]) continue;
      const p = positions.get(w.id)!;
      const depthUnits = (w.depth / 1000) * ve;
      const top = height(p.x, p.y);
      linePts.push(p.x, top, -p.y, p.x, -depthUnits, -p.y);

      for (const t of w.tests) {
        const color = dataColor(t.temp);
        const mat = new MeshBasicMaterial({ color });
        if (hasInterval(t)) {
          const h = Math.max(((t.bottom! - t.top!) / 1000) * ve, 1.5);
          const m = new Mesh(new CylinderGeometry(1.9, 1.9, h, 14), mat);
          m.position.set(p.x, -((t.top! + t.bottom!) / 2 / 1000) * ve, -p.y);
          wellGroup.add(m);
        } else {
          // No interval in the annex: a wireframe (hollow) marker at the total depth.
          const m = new Mesh(
            new SphereGeometry(2.4, 12, 8),
            new MeshBasicMaterial({ color, wireframe: true }),
          );
          m.position.set(p.x, -depthUnits, -p.y);
          wellGroup.add(m);
        }
      }

      // Wellhead: filled when producing, grey when idle, ring when never tapped.
      const head =
        w.status === 'untapped'
          ? new Mesh(
              new RingGeometry(1.3, 2.4, 20),
              new MeshBasicMaterial({ color: ink, side: DoubleSide }),
            )
          : new Mesh(
              new CircleGeometry(2.2, 20),
              new MeshBasicMaterial({
                color: w.status === 'producing' ? ink : muted,
                side: DoubleSide,
              }),
            );
      head.rotation.x = -Math.PI / 2;
      head.position.set(p.x, top + 0.05, -p.y);
      head.renderOrder = 5;
      wellGroup.add(head);

      const hit = new Mesh(
        new CylinderGeometry(2.6, 2.6, depthUnits + 2, 8),
        new MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      hit.position.set(p.x, -depthUnits / 2, -p.y);
      hit.userData.well = w;
      wellGroup.add(hit);
      hitTargets.push(hit);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(linePts, 3));
    wellGroup.add(new LineSegments(g, new LineBasicMaterial({ color: ink })));
    wellGroup.visible = shown.wells;
    buildHighlight();
  }

  function buildHighlight() {
    disposeGroup(highlightGroup);
    if (!selected) return;
    const w = WELLS.find((x) => x.id === selected);
    const p = w && positions.get(w.id);
    if (!w || !p || !statusShown[w.status]) return;
    const depthUnits = (w.depth / 1000) * ve;
    const ring = new Mesh(
      new CylinderGeometry(3.6, 3.6, depthUnits + 3, 20, 1, true),
      new MeshBasicMaterial({
        color: ink,
        transparent: true,
        opacity: 0.18,
        side: DoubleSide,
        depthWrite: false,
      }),
    );
    ring.position.set(p.x, -depthUnits / 2, -p.y);
    ring.renderOrder = 6;
    highlightGroup.add(ring);
  }

  // The side walls and the horizontal layers are painted from the temperature
  // field; the walls carry a line at every 10 °C.
  const sectionMeshes: { id: string; mesh: Mesh }[] = [];
  const ROWS = 224;

  type Pos = { x: number; y: number };

  /** A strip of wall along a line of map positions, painted with temperature against depth. */
  function paintColumns(points: Pos[]): CanvasTexture {
    const COLS = points.length;
    const canvas = document.createElement('canvas');
    canvas.width = COLS;
    canvas.height = ROWS;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(COLS, ROWS);
    const cols: Column[] = [];
    for (let c = 0; c < COLS; c++) {
      cols[c] = columnAt(field, points[c].x, points[c].y);
      for (let r = 0; r < ROWS; r++) {
        const depthKm = (r / (ROWS - 1)) * BLOCK_DEPTH_KM;
        const [R, G, B] = tempColor(tempFromColumn(cols[c], depthKm));
        const i = (r * COLS + c) * 4;
        img.data[i] = R;
        img.data[i + 1] = G;
        img.data[i + 2] = B;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    for (let T = 20; T <= COLOR_MAX - 5; T += 10) {
      ctx.beginPath();
      let started = false;
      for (let c = 0; c < COLS; c++) {
        const depthKm = depthFromColumn(cols[c], T);
        if (depthKm > BLOCK_DEPTH_KM) {
          started = false;
          continue;
        }
        const y = (depthKm / BLOCK_DEPTH_KM) * (ROWS - 1);
        if (started) ctx.lineTo(c, y);
        else ctx.moveTo(c, y);
        started = true;
      }
      ctx.stroke();
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }

  function faceMaterial(map: CanvasTexture, opacity: number, clip = false) {
    return new MeshBasicMaterial({
      map,
      alphaMap: clip ? outlineMask(0) : null,
      transparent: true,
      opacity,
      side: DoubleSide,
      depthWrite: false,
    });
  }

  // The walls follow the outline of the province, from the ground down to the bottom of the
  // block. Their paint does not depend on the relief or the exaggeration, so it is kept.
  const WALL_SPACING_KM = 0.5;
  let wallSamples: Pos[][] | null = null;
  let wallTextures: CanvasTexture[] | null = null;

  function resample(ring: [number, number][]): Pos[] {
    const out: Pos[] = [];
    for (let k = 0; k < ring.length; k++) {
      const [xa, ya] = ring[k];
      const [xb, yb] = ring[(k + 1) % ring.length];
      const n = Math.max(1, Math.ceil(Math.hypot(xb - xa, yb - ya) / WALL_SPACING_KM));
      for (let m = 0; m < n; m++)
        out.push({ x: xa + ((xb - xa) * m) / n, y: ya + ((yb - ya) * m) / n });
    }
    out.push({ ...out[0] });
    return out;
  }

  function addWalls() {
    wallSamples ??= OUTLINE.map(resample);
    wallTextures ??= wallSamples.map(paintColumns);
    wallSamples.forEach((pts, r) => {
      const n = pts.length;
      const position = new Float32Array(n * 6);
      const uv = new Float32Array(n * 4);
      const index: number[] = [];
      pts.forEach(({ x, y }, k) => {
        position.set([x, height(x, y), -y, x, -BLOCK_DEPTH_KM * ve, -y], k * 6);
        uv.set([k / (n - 1), 1, k / (n - 1), 0], k * 4);
        if (k < n - 1) index.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
      geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      geometry.setIndex(index);
      const mesh = new Mesh(geometry, faceMaterial(wallTextures![r], WALL_OPACITY));
      mesh.renderOrder = 2;
      sectionGroup.add(mesh);
      sectionMeshes.push({ id: `wall-${r}`, mesh });
    });
  }

  // Horizontal layers: one plane every `step` km of depth, each painted with the
  // temperature at that depth.
  const LAYER_N = 160;
  let layerColumns: Float32Array | null = null;

  function addLayers() {
    if (!layers.on) return;
    if (!layerColumns) {
      layerColumns = new Float32Array(LAYER_N * LAYER_N * 3);
      for (let r = 0; r < LAYER_N; r++) {
        for (let c = 0; c < LAYER_N; c++) {
          const x = X0 + (c / (LAYER_N - 1)) * (X1 - X0);
          const y = Y1 - (r / (LAYER_N - 1)) * (Y1 - Y0); // row 0 is the north edge
          layerColumns.set(columnAt(field, x, y), (r * LAYER_N + c) * 3);
        }
      }
    }
    for (let depth = layers.step; depth <= BLOCK_DEPTH_KM + 1e-9; depth += layers.step) {
      const canvas = document.createElement('canvas');
      canvas.width = LAYER_N;
      canvas.height = LAYER_N;
      const ctx = canvas.getContext('2d')!;
      const img = ctx.createImageData(LAYER_N, LAYER_N);
      for (let i = 0; i < LAYER_N * LAYER_N; i++) {
        const col = layerColumns.subarray(i * 3, i * 3 + 3) as unknown as Column;
        const [R, G, B] = tempColor(tempFromColumn(col, depth));
        img.data[i * 4] = R;
        img.data[i * 4 + 1] = G;
        img.data[i * 4 + 2] = B;
        img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      const mesh = new Mesh(
        new PlaneGeometry(X1 - X0, Y1 - Y0),
        faceMaterial(tex, layers.opacity, true),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(cx, -depth * ve, -cy);
      mesh.renderOrder = 2;
      sectionGroup.add(mesh);
      sectionMeshes.push({ id: `layer-${depth.toFixed(2)}`, mesh });
    }
  }

  function buildSections() {
    disposeGroup(sectionGroup);
    sectionMeshes.length = 0;
    if (shown.walls) addWalls();
    addLayers();
  }

  // Contours on the ground: the depth at which a chosen temperature is reached.
  // Where the gradient is high that depth is shallow, so the lines close into
  // rings around the warm wells and widen away from them. The interval is picked
  // from the range of depths so there are about a dozen lines, not one or two.
  const CONTOUR_W = 900;
  const CONTOUR_COLS = 225;
  let contourRows = 0;
  let contourColumns: Float32Array | null = null;

  /** Line segments of one contour level by marching squares, in canvas pixels. */
  function contourSegments(depths: Float32Array, cols: number, rows: number, level: number) {
    const sx = CONTOUR_W / (cols - 1);
    const sy = (CONTOUR_W * ((Y1 - Y0) / (X1 - X0))) / (rows - 1);
    const out: [number, number, number, number][] = [];
    const at = (c: number, r: number) => depths[r * cols + c];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = at(c, r);
        const b = at(c + 1, r);
        const cc = at(c + 1, r + 1);
        const d = at(c, r + 1);
        const idx =
          (a > level ? 8 : 0) | (b > level ? 4 : 0) | (cc > level ? 2 : 0) | (d > level ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const t = (v1: number, v2: number) => (level - v1) / (v2 - v1);
        const top: [number, number] = [(c + t(a, b)) * sx, r * sy];
        const right: [number, number] = [(c + 1) * sx, (r + t(b, cc)) * sy];
        const bottom: [number, number] = [(c + t(d, cc)) * sx, (r + 1) * sy];
        const left: [number, number] = [c * sx, (r + t(a, d)) * sy];
        const seg = (p: [number, number], q2: [number, number]) =>
          out.push([p[0], p[1], q2[0], q2[1]]);
        switch (idx) {
          case 1:
          case 14:
            seg(left, bottom);
            break;
          case 2:
          case 13:
            seg(bottom, right);
            break;
          case 3:
          case 12:
            seg(left, right);
            break;
          case 4:
          case 11:
            seg(top, right);
            break;
          case 5:
            seg(left, top);
            seg(bottom, right);
            break;
          case 6:
          case 9:
            seg(top, bottom);
            break;
          case 7:
          case 8:
            seg(left, top);
            break;
          case 10:
            seg(top, right);
            seg(left, bottom);
            break;
        }
      }
    }
    return out;
  }

  function buildContours() {
    disposeGroup(contourGroup);
    if (!contours.on) return;
    const rows = Math.round(CONTOUR_COLS * ((Y1 - Y0) / (X1 - X0)));
    if (!contourColumns || rows !== contourRows) {
      contourRows = rows;
      contourColumns = new Float32Array(CONTOUR_COLS * rows * 3);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < CONTOUR_COLS; c++) {
          const x = X0 + (c / (CONTOUR_COLS - 1)) * (X1 - X0);
          const y = Y1 - (r / (rows - 1)) * (Y1 - Y0); // row 0 is the north edge
          contourColumns.set(columnAt(field, x, y), (r * CONTOUR_COLS + c) * 3);
        }
      }
    }
    const depths = new Float32Array(CONTOUR_COLS * rows);
    for (let i = 0; i < depths.length; i++) {
      const col = contourColumns.subarray(i * 3, i * 3 + 3) as unknown as Column;
      depths[i] = depthFromColumn(col, contours.temp);
    }

    const canvas = document.createElement('canvas');
    canvas.width = CONTOUR_W;
    canvas.height = Math.round(CONTOUR_W * ((Y1 - Y0) / (X1 - X0)));
    const ctx = canvas.getContext('2d')!;
    const lineColor = ink.getStyle();
    const haloColor = paper.getStyle();
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.font = '600 15px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const placed: [number, number][] = [];
    const levels: number[] = [];
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of depths) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const step = [0.01, 0.025, 0.05, 0.1, 0.25].find((x) => (hi - lo) / x <= 14) ?? 0.25;
    for (let d = Math.ceil(lo / step) * step; d < hi; d += step)
      levels.push(Math.round(d * 1000) / 1000);
    for (const level of levels) {
      const segs = contourSegments(depths, CONTOUR_COLS, contourRows, level);
      if (!segs.length) continue;
      ctx.strokeStyle = lineColor;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segs) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      // A depth label where no other label is within 150 px.
      ctx.globalAlpha = 1;
      for (const [x1, y1, x2, y2] of segs) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        if (placed.some(([px, py]) => Math.hypot(px - mx, py - my) < 150)) continue;
        placed.push([mx, my]);
        const text = fmt2.format(level);
        ctx.lineWidth = 5;
        ctx.strokeStyle = haloColor;
        ctx.strokeText(text, mx, my);
        ctx.fillStyle = lineColor;
        ctx.fillText(text, mx, my);
        ctx.lineWidth = 2;
      }
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      terrainGeometry(null, 0.08),
      new MeshBasicMaterial({
        map: tex,
        alphaMap: outlineMask(0),
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0, -cy);
    mesh.renderOrder = 6;
    contourGroup.add(mesh);
  }

  // ── HTML labels ───────────────────────────────────────────────────────────
  type Label = { el: HTMLElement; pos: Vector3; kind: 'place' | 'depth' | 'tool'; at?: Pos };
  const labels: Label[] = [];
  function buildLabels() {
    labelLayer.replaceChildren();
    labels.length = 0;
    const add = (text: string, pos: Vector3, kind: Label['kind'], at?: Pos) => {
      const el = document.createElement('span');
      el.className = `geo-label geo-label-${kind}`;
      el.textContent = text;
      labelLayer.appendChild(el);
      labels.push({ el, pos, kind, at });
    };
    const used = new Set(WELLS.map((w) => w.place));
    for (const key of used) {
      const place = SETTLEMENTS[key];
      const p = project(place.lat, place.lon, ORIGIN.lat, ORIGIN.lon);
      add(place.name, new Vector3(p.x, height(p.x, p.y), -p.y), 'place', p);
    }
    // The depth scale hangs from the westernmost point of the outline.
    const west = OUTLINE.flat().reduce((a, b) => (b[0] < a[0] ? b : a));
    for (let d = 0.5; d <= 2.5; d += 0.5) {
      add(`${num.format(d)} ${s.units.km}`, new Vector3(west[0], -d * ve, -west[1]), 'depth');
    }
  }

  function placeLabels() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const v = new Vector3();
    // Looking straight down, the depth scale collapses onto one point.
    const lookingDown =
      Math.abs(camera.position.y - controls.target.y) >
      0.96 * camera.position.distanceTo(controls.target);
    for (const l of labels) {
      const visible = l.kind === 'place' ? shown.labels : l.kind === 'tool' ? true : !lookingDown;
      v.copy(l.pos).project(camera);
      const onScreen = visible && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      l.el.style.display = onScreen ? '' : 'none';
      if (onScreen)
        l.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -120%)`;
    }
  }

  // ── Rendering on demand ───────────────────────────────────────────────────
  let queued = false;
  function render() {
    queued = false;
    renderer.render(scene, camera);
    placeLabels();
  }
  const requestRender = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  };
  controls.addEventListener('change', requestRender);

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    requestRender();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stage);

  // ── Camera presets ────────────────────────────────────────────────────────
  function setView(name: string) {
    const mid = new Vector3(cx, (-BLOCK_DEPTH_KM * ve) / 2, -cy);
    const width = X1 - X0;
    const length = Y1 - Y0;
    const depth = BLOCK_DEPTH_KM * ve;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    const tanH = tanV * camera.aspect;
    // Distance at which a flat face of this half-width and half-height fills the view.
    const fitFace = (halfW: number, halfH: number) => Math.max(halfW / tanH, halfH / tanV) * 1.08;
    // Distance at which a sphere of this radius fits the narrower field of view.
    const fit = (radius: number) => radius / Math.sin(Math.atan(Math.min(tanV, tanH)));
    camera.up.set(0, 1, 0);
    controls.target.copy(mid);
    if (name === 'top') {
      camera.up.set(0, 0, -1);
      controls.target.set(cx, 0, -cy);
      camera.position.set(cx, fitFace(width / 2, length / 2), -cy + 0.001);
    } else if (name === 'south') {
      camera.position.set(cx, mid.y, -cy + fitFace(width / 2, depth / 2) + length / 2);
    } else if (name === 'west') {
      camera.position.set(cx - fitFace(length / 2, depth / 2) - width / 2, mid.y, -cy);
    } else {
      const dir = new Vector3(0.42, 0.72, 0.55).normalize();
      // Fitting the whole bounding sphere keeps the block inside the frame, with a margin.
      const distance = fit(Math.hypot(width, length, depth) / 2) * 0.82;
      camera.position.copy(mid).addScaledVector(dir, distance);
      // Slide camera and target down together so the block sits higher in the frame.
      const lift = 0.1 * distance * tanV;
      camera.position.y -= lift;
      controls.target.y -= lift;
    }
    controls.update();
    requestRender();
  }

  // ── Hover and click ───────────────────────────────────────────────────────
  const raycaster = new Raycaster();
  const pointer = new Vector2();

  const placeOf = (w: Well) => SETTLEMENTS[w.place].name;

  function wellTip(w: Well): string {
    const t = w.tests[0];
    const interval = hasInterval(t)
      ? fmt(s.tipInterval, {
          top: int.format(t.top!),
          bottom: int.format(t.bottom!),
          unit: s.units.m,
        })
      : s.tipNoInterval;
    return fmt(s.tipWell, {
      id: w.id,
      place: placeOf(w),
      status: s.status[w.status],
      depth: int.format(w.depth),
      unit: s.units.m,
      interval,
      temp: num.format(Math.max(...w.tests.map((x) => x.temp))),
      degC: s.units.degC,
    });
  }

  function showTip(html: string, e: PointerEvent) {
    tip.innerHTML = html;
    tip.hidden = false;
    const r = stage.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    tip.style.transform = `translate(${Math.min(x + 14, r.width - tip.offsetWidth - 4)}px, ${Math.max(y - tip.offsetHeight - 10, 4)}px)`;
  }
  const hideTip = () => {
    tip.hidden = true;
  };

  function pick(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (shown.wells) {
      const hit = raycaster.intersectObjects(hitTargets, false)[0];
      if (hit)
        return {
          kind: 'well' as const,
          well: hit.object.userData.well as Well,
        };
    }
    const planes = raycaster.intersectObjects(
      sectionMeshes.map((m) => m.mesh),
      false,
    );
    for (const h of planes) {
      const id = sectionMeshes.find((m) => m.mesh === h.object)?.id ?? '';
      // A layer is a rectangle cut to the outline by its mask, so ignore hits outside it.
      if (id.startsWith('wall') || insideOutline(h.point.x, -h.point.z))
        return { kind: 'section' as const, point: h.point.clone() };
    }
    return null;
  }

  let lastHover = 0;
  function onMove(e: PointerEvent) {
    if (hooks.hover && !e.buttons) {
      const now = performance.now();
      if (now - lastHover > 40) {
        lastHover = now;
        hooks.hover(groundAt(e.clientX, e.clientY));
      }
    }
    if (e.buttons) return hideTip();
    const hit = pick(e);
    if (!hit) return hideTip();
    if (hit.kind === 'well') {
      showTip(wellTip(hit.well), e);
    } else {
      const x = hit.point.x;
      const y = -hit.point.z;
      const depthKm = -hit.point.y / ve;
      const col = columnAt(field, x, y);
      const temp = tempFromColumn(col, depthKm);
      const where = unproject(x, y, ORIGIN.lat, ORIGIN.lon);
      showTip(
        fmt(s.tipSection, {
          temp: num.format(temp),
          degC: s.units.degC,
          depth: int.format(depthKm * 1000),
          unit: s.units.m,
          lat: where.lat.toFixed(2),
          lon: where.lon.toFixed(2),
          gradient: num.format(gradientFromColumn(col, depthKm)),
          gunit: s.units.gradient,
        }),
        e,
      );
    }
  }

  /** Off while measuring, so a click near a well measures from the ground instead of selecting it. */
  let wellsClickable = true;

  function onClick(e: PointerEvent) {
    const hit = wellsClickable ? pick(e) : null;
    selected = hit?.kind === 'well' ? hit.well.id : selected;
    if (hit?.kind === 'well') {
      renderDetail(hit.well);
      buildHighlight();
      requestRender();
      hooks.well?.(hit.well.id);
    } else {
      const ground = groundAt(e.clientX, e.clientY);
      if (ground) hooks.ground?.(ground);
    }
  }

  function renderDetail(w: Well) {
    const rows = w.tests
      .map((t) => {
        const interval = hasInterval(t)
          ? fmt(s.detailTest, {
              top: int.format(t.top!),
              bottom: int.format(t.bottom!),
              unit: s.units.m,
            })
          : s.detailNoInterval;
        const g = testGradient(t.temp, testDepth(w, t));
        return `<li><span class="geo-chip" style="background:${cssRgb(t.temp)}"></span>${interval}: <strong>${num.format(t.temp)} ${s.units.degC}</strong>, ${num.format(g)} ${s.units.gradient}${hasInterval(t) ? '' : ` (${s.detailLowerBound})`}, ${num.format(t.flow)} ${s.units.flow}${t.minerals !== undefined ? `, ${num.format(t.minerals)} ${s.units.minerals}` : ''}</li>`;
      })
      .join('');
    detail.innerHTML = `<h4>${w.id}</h4><dl><dt>${s.fields.place}</dt><dd>${placeOf(w)}</dd><dt>${s.fields.status}</dt><dd>${s.status[w.status]}</dd><dt>${s.fields.year}</dt><dd>${w.year}</dd><dt>${s.fields.depth}</dt><dd>${int.format(w.depth)} ${s.units.m}</dd></dl><ul>${rows}</ul>`;
  }

  const cssRgb = (temp: number) => {
    const [r, g, b] = tempColor(temp);
    return `rgb(${r} ${g} ${b})`;
  };

  // ── Controls panel ────────────────────────────────────────────────────────
  const on = <K extends keyof HTMLElementEventMap>(
    el: Element | null,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
  ) => el?.addEventListener(type, fn as EventListener);
  const val = (el: Event) => (el.target as HTMLInputElement).value;
  const checked = (el: Event) => (el.target as HTMLInputElement).checked;

  for (const btn of root.querySelectorAll<HTMLElement>('[data-geo-view]'))
    on(btn, 'click', () => setView(btn.dataset.geoView!));
  on(q('[data-geo-ctl="ve"]'), 'input', (e) => {
    ve = Number(val(e));
    q('[data-geo-out="ve"]')!.textContent = `×${ve}`;
    buildGround();
    buildWells();
    buildSections();
    labelsDepthRefresh();
    requestRender();
  });
  on(q('[data-geo-ctl="relief"]'), 'input', (e) => {
    relief = Number(val(e));
    q('[data-geo-out="relief"]')!.textContent = `×${relief}`;
    buildGround();
    buildWells();
    buildSections();
    buildContours();
    labelsDepthRefresh();
    requestRender();
  });
  on(q('[data-geo-ctl="ground"]'), 'input', (e) => {
    groundOpacity = Number(val(e)) / 100;
    buildGround();
    requestRender();
  });
  on(q('[data-geo-ctl="show-wells"]'), 'change', (e) => {
    shown.wells = checked(e);
    wellGroup.visible = shown.wells;
    if (!shown.wells) hideTip();
    requestRender();
  });
  on(q('[data-geo-ctl="show-labels"]'), 'change', (e) => {
    shown.labels = checked(e);
    requestRender();
  });
  on(q('[data-geo-ctl="walls"]'), 'change', (e) => {
    shown.walls = checked(e);
    buildSections();
    requestRender();
  });
  on(q('[data-geo-ctl="map"]'), 'change', (e) => {
    basemap.on = checked(e);
    void applyMap();
  });
  on(q('[data-geo-ctl="contours"]'), 'change', (e) => {
    contours.on = checked(e);
    buildContours();
    requestRender();
  });
  on(q('[data-geo-ctl="contour-temp"]'), 'input', (e) => {
    contours.temp = Number(val(e));
    q('[data-geo-out="contour-temp"]')!.textContent = String(contours.temp);
    buildContours();
    requestRender();
  });
  on(q('[data-geo-ctl="layers"]'), 'change', (e) => {
    layers.on = checked(e);
    buildSections();
    requestRender();
  });
  on(q('[data-geo-ctl="layer-step"]'), 'input', (e) => {
    layers.step = Number(val(e));
    q('[data-geo-out="layer-step"]')!.textContent = num.format(layers.step);
    buildSections();
    requestRender();
  });
  on(q('[data-geo-ctl="layer-opacity"]'), 'input', (e) => {
    layers.opacity = Number(val(e)) / 100;
    buildSections();
    requestRender();
  });
  for (const st of ['producing', 'idle', 'untapped'] as WellStatus[]) {
    on(q(`[data-geo-status="${st}"]`), 'change', (e) => {
      statusShown[st] = checked(e);
      buildWells();
      requestRender();
    });
  }
  // Labels follow the exaggerations: depth labels sit at the depth times `ve`, settlement
  // labels on the ground.
  function labelsDepthRefresh() {
    rebuildTools();
    let d = 0.5;
    for (const l of labels) {
      if (l.kind === 'place' && l.at) {
        l.pos.y = height(l.at.x, l.at.y);
        continue;
      }
      if (l.kind !== 'depth') continue;
      l.pos.y = -d * ve;
      d += 0.5;
    }
  }

  // Zoom with the wheel only after the visitor has clicked into the model.
  on(renderer.domElement, 'pointerdown', () => {
    controls.enableZoom = true;
  });
  on(stage, 'pointerleave', () => {
    controls.enableZoom = zoomAlways;
    hooks.hover?.(null);
    hideTip();
  });
  on(renderer.domElement, 'pointermove', onMove);
  let downAt: { x: number; y: number } | null = null;
  on(renderer.domElement, 'pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
  on(renderer.domElement, 'pointerup', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 5) onClick(e);
    downAt = null;
  });
  for (const btn of root.querySelectorAll<HTMLElement>('[data-geo-zoom]')) {
    on(btn, 'click', () => {
      const f = btn.dataset.geoZoom === 'in' ? 0.8 : 1.25;
      camera.position.sub(controls.target).multiplyScalar(f).add(controls.target);
      controls.update();
      requestRender();
    });
  }

  // Keep the scene in step with a change of colour theme.
  const themeObserver = new MutationObserver(() => {
    readTheme();
    buildGround();
    buildWells();
    buildContours();
    requestRender();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme'],
  });

  // ── What the workspace can ask of the model ───────────────────────────────
  const hooks: GeoHooks = {};
  let zoomAlways = false;
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  const toolState: { measure: [GroundHit, GroundHit] | null; probe: GroundHit | null } = {
    measure: null,
    probe: null,
  };
  const toolLabels = new Map<string, Label>();

  function toolLabel(id: string, text: string | null, pos?: Vector3) {
    let label = toolLabels.get(id);
    if (text === null) {
      if (label) {
        label.el.remove();
        labels.splice(labels.indexOf(label), 1);
        toolLabels.delete(id);
      }
      return;
    }
    if (!label) {
      const el = document.createElement('span');
      el.className = 'geo-label geo-label-tool';
      labelLayer.appendChild(el);
      label = { el, pos: new Vector3(), kind: 'tool' };
      labels.push(label);
      toolLabels.set(id, label);
    }
    label.el.textContent = text;
    if (pos) label.pos.copy(pos);
  }

  function groundHit(x: number, y: number): GroundHit {
    const { lat, lon } = unproject(x, y, ORIGIN.lat, ORIGIN.lon);
    const { e, n } = gaussKruger(lat, lon);
    return { x, y, lat, lon, e, n, elevation: elevationAt(x, y), column: columnAt(field, x, y) };
  }

  function groundAt(clientX: number, clientY: number): GroundHit | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const mesh = groundGroup.children[0] as Mesh | undefined;
    const hit = mesh ? raycaster.intersectObject(mesh, false)[0] : undefined;
    if (!hit) return null;
    const x = hit.point.x;
    const y = -hit.point.z;
    return insideOutline(x, y) ? groundHit(x, y) : null;
  }

  /** The measuring line and the probe, drawn over everything else; rebuilt when the exaggerations change. */
  function rebuildTools() {
    disposeGroup(toolGroup);
    const line = new LineBasicMaterial({ color: ink, depthTest: false });
    const mark = (p: Vector3, color: Color, radius = 1.3) => {
      const m = new Mesh(
        new SphereGeometry(radius, 12, 8),
        new MeshBasicMaterial({ color, depthTest: false }),
      );
      m.position.copy(p);
      m.renderOrder = 9;
      toolGroup.add(m);
    };
    if (toolState.measure) {
      const [a, b] = toolState.measure;
      const pa = new Vector3(a.x, height(a.x, a.y) + 0.2, -a.y);
      const pb = new Vector3(b.x, height(b.x, b.y) + 0.2, -b.y);
      const l = new Line(new BufferGeometry().setFromPoints([pa, pb]), line);
      l.renderOrder = 9;
      toolGroup.add(l);
      mark(pa, ink);
      mark(pb, ink);
      toolLabel(
        'measure',
        `${num.format(distanceKm(a, b))} ${s.units.km} · ${int.format(bearingDeg(a, b))}°`,
        pa.clone().lerp(pb, 0.5),
      );
    } else {
      toolLabel('measure', null);
    }
    if (toolState.probe) {
      const p = toolState.probe;
      const top = height(p.x, p.y);
      const l = new Line(
        new BufferGeometry().setFromPoints([
          new Vector3(p.x, top, -p.y),
          new Vector3(p.x, -BLOCK_DEPTH_KM * ve, -p.y),
        ]),
        line,
      );
      l.renderOrder = 9;
      toolGroup.add(l);
      mark(new Vector3(p.x, top + 0.2, -p.y), ink, 1.6);
      [0.5, 1, 2].forEach((d, i) =>
        mark(new Vector3(p.x, -d * ve, -p.y), dataColor(p.column[i]), 1.5),
      );
    }
    requestRender();
  }

  /** Draw the settlement names, and the measurement, over a snapshot. */
  function drawLabels(ctx: CanvasRenderingContext2D, W: number, H: number, k: number) {
    const size = Math.max(11, 9.5 * k);
    ctx.font = `600 ${size}px ui-monospace, "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const v = new Vector3();
    const order = [...labels]
      .filter((l) => l.kind === 'tool' || (l.kind === 'place' && shown.labels))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'tool' ? -1 : 1;
        const pa = LABEL_PRIORITY.indexOf(a.el.textContent ?? '');
        const pb = LABEL_PRIORITY.indexOf(b.el.textContent ?? '');
        return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
      });
    const taken: number[][] = [];
    for (const l of order) {
      v.copy(l.pos).project(camera);
      if (v.z >= 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      const text = l.el.textContent ?? '';
      const x = ((v.x + 1) / 2) * W;
      const y = ((1 - v.y) / 2) * H - 6 * k;
      const half = ctx.measureText(text).width / 2 + 3 * k;
      const box = [x - half, y - size, x + half, y + 4 * k];
      if (taken.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]))
        continue;
      taken.push(box);
      ctx.lineWidth = Math.max(3, 3.2 * k);
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = '#111';
      ctx.fillText(text, x, y);
    }
  }

  const stageRay = (px: number, py: number): Vector3 | null => {
    pointer.set((px / stage.clientWidth) * 2 - 1, -(py / stage.clientHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(groundPlane, new Vector3());
  };

  const controller: GeoController = {
    hooks,
    stageSize: () => ({ w: stage.clientWidth, h: stage.clientHeight }),
    setView,
    requestRender,
    setWellsClickable(on) {
      wellsClickable = on;
    },
    setZoomAlways(on) {
      zoomAlways = on;
      controls.enableZoom = on;
    },
    groundAt,
    setMeasure(points) {
      toolState.measure = points;
      rebuildTools();
    },
    setProbe(hit) {
      toolState.probe = hit;
      rebuildTools();
    },
    selectWell(id) {
      const w = WELLS.find((x) => x.id === id);
      if (!w) return;
      selected = id;
      renderDetail(w);
      buildHighlight();
      requestRender();
    },
    focusWell(id) {
      const w = WELLS.find((x) => x.id === id);
      const p = positions.get(id);
      if (!w || !p) return;
      controller.selectWell(id);
      const target = new Vector3(p.x, (-(w.depth / 1000) * ve) / 2, -p.y);
      const away = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(away, 85);
      controls.update();
      requestRender();
    },
    state: () => ({
      ve,
      relief,
      groundOpacity,
      layers: { ...layers },
      contours: { ...contours },
      basemap: basemap.on,
      walls: shown.walls,
      labels: shown.labels,
      wells: shown.wells,
      statuses: { ...statusShown },
      selected,
    }),
    cameraInfo() {
      const d = controls.target.clone().sub(camera.position);
      return {
        azimuth: ((Math.atan2(d.x, -d.z) * 180) / Math.PI + 360) % 360,
        tilt: (Math.atan2(-d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI,
      };
    },
    frameInfo(region) {
      const mx = region.x + region.w / 2;
      const my = region.y + region.h / 2;
      const c = stageRay(mx, my);
      const l = stageRay(region.x, my);
      const r = stageRay(region.x + region.w, my);
      const t = stageRay(mx, region.y);
      const b = stageRay(mx, region.y + region.h);
      return {
        center: c ? unproject(c.x, -c.z, ORIGIN.lat, ORIGIN.lon) : null,
        widthKm: l && r ? l.distanceTo(r) : null,
        heightKm: t && b ? t.distanceTo(b) : null,
      };
    },
    wellsInRegion(region) {
      if (!shown.wells) return [];
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const v = new Vector3();
      return WELLS.filter((well) => {
        if (!statusShown[well.status]) return false;
        const p = positions.get(well.id)!;
        v.set(p.x, height(p.x, p.y), -p.y).project(camera);
        const sx = ((v.x + 1) / 2) * w;
        const sy = ((1 - v.y) / 2) * h;
        return (
          v.z < 1 &&
          sx >= region.x &&
          sx <= region.x + region.w &&
          sy >= region.y &&
          sy <= region.y + region.h
        );
      });
    },
    snapshot(region, outW, outH) {
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const ratio = renderer.getPixelRatio();
      renderer.setPixelRatio(1);
      renderer.setSize(outW, outH, false);
      camera.setViewOffset(w, h, region.x, region.y, region.w, region.h);
      renderer.render(scene, camera);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, outW, outH);
      ctx.drawImage(renderer.domElement, 0, 0);
      drawLabels(ctx, outW, outH, outW / region.w);
      camera.clearViewOffset();
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      camera.updateProjectionMatrix();
      requestRender();
      return out;
    },
  };

  // ── First build ───────────────────────────────────────────────────────────
  detail.textContent = s.detailEmpty;
  buildGround();
  buildWells();
  buildSections();
  buildContours();
  buildLabels();
  labelsDepthRefresh();
  resize();
  setView('perspective');
  void applyMap();
  root.dataset.ready = 'true';

  const dispose = () => {
    resizeObserver.disconnect();
    themeObserver.disconnect();
    controls.dispose();
    for (const g of [groundGroup, wellGroup, sectionGroup, highlightGroup, contourGroup, toolGroup])
      disposeGroup(g);
    for (const m of masks) m?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  return { dispose, controller };
}
