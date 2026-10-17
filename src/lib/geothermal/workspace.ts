/**
 * The workspace: the 3D model opened in a window over the whole screen, with the tools of
 * a drawing program around it. A tool bar at the top, the settings on the left, the data
 * on the right, a status line under the model that reads off the ground as the pointer
 * moves, a measuring tool, a probe that charts the temperature below a point, a finder
 * for the wells, and a print frame whose contents are printed with the data on screen.
 *
 * The markup is that of `GeothermalModel.astro`; this module only finds its parts by
 * their `data-ws-*` attributes and wires them to the model's controller.
 */

import { depthFromColumn, testGradient } from './field';
import type { GeoController, GeoStrings, GroundHit } from './scene';
import {
  LEGEND_TICKS,
  buildSheet,
  defaultFrame,
  legendStops,
  moveFrame,
  pageCss,
  pictureMm,
  pictureSize,
  profileSvg,
  resizeFrame,
  scaleDenominator,
  type Handle,
  type Orientation,
  type Paper,
  type Rect,
  type SheetData,
  type SheetRow,
} from './print';
import { SETTLEMENTS, WELLS, hasInterval, testDepth, type Well } from './wells';

export interface WorkspaceStrings {
  open: string;
  close: string;
  fullscreen: string;
  dockLeft: string;
  dockRight: string;
  fit: string;
  tool: Record<'navigate' | 'measure' | 'frame' | 'print' | 'png', string>;
  hint: Record<'navigate' | 'measureFirst' | 'measureSecond' | 'measureDone' | 'frame', string>;
  status: Record<'lat' | 'lon' | 'gk' | 'elevation' | 'temps' | 'none', string>;
  find: Record<'label' | 'placeholder' | 'none', string>;
  probe: {
    title: string;
    empty: string;
    clear: string;
    rows: Record<'position' | 'gk' | 'elevation' | 'at' | 'depthTo', string>;
  };
  chart: Record<'temp' | 'depth', string>;
  print: {
    title: string;
    paper: string;
    a4: string;
    a3: string;
    orientation: string;
    landscape: string;
    portrait: string;
    showFrame: string;
    print: string;
    save: string;
    placeFirst: string;
    busy: string;
    summary: string;
  };
  sheet: {
    subtitle: string;
    date: string;
    facts: Record<'frame' | 'settings', string>;
    rows: Record<
      | 'centre'
      | 'size'
      | 'view'
      | 'scale'
      | 'exaggeration'
      | 'relief'
      | 'layers'
      | 'contours'
      | 'map'
      | 'wells'
      | 'off',
      string
    >;
    viewTop: string;
    viewOblique: string;
    scaleValue: string;
    layersValue: string;
    contoursValue: string;
    mapValue: string;
    legendTitle: string;
    wells: string;
    wellsEmpty: string;
    wellsHead: string[];
    selected: string;
    point: string;
    notesTitle: string;
    notes: string[];
    keys: string[];
    credit: string;
  };
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

interface Format {
  num: (n: number) => string;
  int: (n: number) => string;
}

export function makeFormat(locale: string): Format {
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const int = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return { num: (n) => num.format(n), int: (n) => int.format(n) };
}

/** What the atlas and the terrain say about a point, as rows of a table. */
export function probeRows(
  hit: GroundHit,
  contourTemp: number | null,
  ws: WorkspaceStrings,
  f: Format,
  units: { m: string; degC: string },
): SheetRow[] {
  const rows: SheetRow[] = [
    {
      label: ws.probe.rows.position,
      value: `${hit.lat.toFixed(4)}°N, ${hit.lon.toFixed(4)}°E`,
    },
    {
      label: ws.probe.rows.gk,
      value: `${f.int(hit.e * 1000)} E, ${f.int(hit.n * 1000)} N`,
    },
    {
      label: ws.probe.rows.elevation,
      value: `${f.int(hit.elevation)} ${units.m}`,
    },
  ];
  [500, 1000, 2000].forEach((depth, i) => {
    rows.push({
      label: fill(ws.probe.rows.at, { depth: f.int(depth) }),
      value: `${f.num(hit.column[i])} ${units.degC}`,
    });
  });
  if (contourTemp !== null) {
    rows.push({
      label: fill(ws.probe.rows.depthTo, { temp: contourTemp }),
      value: `${f.int(depthFromColumn(hit.column, contourTemp) * 1000)} ${units.m}`,
    });
  }
  return rows;
}

/** One row of the table of wells in the frame. */
export function wellRow(w: Well, s: GeoStrings, f: Format): string[] {
  const interval = w.tests
    .map((t) => (hasInterval(t) ? `${f.int(t.top!)}–${f.int(t.bottom!)}` : '–'))
    .join(', ');
  return [
    w.id,
    SETTLEMENTS[w.place].name,
    s.status[w.status],
    f.int(w.depth),
    f.num(Math.max(...w.tests.map((t) => t.temp))),
    interval,
    String(w.year),
  ];
}

/** The selected well as rows and one line per tested interval. */
export function selectedWell(
  w: Well,
  s: GeoStrings,
  f: Format,
): { rows: SheetRow[]; tests: string[] } {
  const rows: SheetRow[] = [
    { label: s.fields.place, value: SETTLEMENTS[w.place].name },
    { label: s.fields.status, value: s.status[w.status] },
    { label: s.fields.year, value: String(w.year) },
    { label: s.fields.depth, value: `${f.int(w.depth)} ${s.units.m}` },
  ];
  const tests = w.tests.map((t) => {
    const interval = hasInterval(t)
      ? fill(s.detailTest, { top: f.int(t.top!), bottom: f.int(t.bottom!), unit: s.units.m })
      : s.detailNoInterval;
    const g = testGradient(t.temp, testDepth(w, t));
    const low = hasInterval(t) ? '' : ` (${s.detailLowerBound})`;
    const minerals = t.minerals !== undefined ? `, ${f.num(t.minerals)} ${s.units.minerals}` : '';
    return `${interval}: ${f.num(t.temp)} ${s.units.degC}, ${f.num(g)} ${s.units.gradient}${low}, ${f.num(t.flow)} ${s.units.flow}${minerals}`;
  });
  return { rows, tests };
}

export function mountWorkspace(
  root: HTMLElement,
  controller: GeoController,
  s: GeoStrings,
  ws: WorkspaceStrings,
): () => void {
  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = <T extends HTMLElement>(sel: string) => [...root.querySelectorAll<T>(sel)];
  const stage = q('[data-geo-stage]')!;
  const f = makeFormat(s.locale);

  const el = {
    hint: q('[data-ws-hint]'),
    coord: q('[data-ws-status-coord]'),
    gk: q('[data-ws-status-gk]'),
    elev: q('[data-ws-status-elev]'),
    temps: q('[data-ws-status-temps]'),
    probe: q('[data-ws-probe-body]'),
    summary: q('[data-ws-summary]'),
    msg: q('[data-ws-msg]'),
    find: q<HTMLInputElement>('[data-ws-find]'),
    findList: q<HTMLElement>('[data-ws-find-list]'),
    findMsg: q('[data-ws-find-msg]'),
    paper: q<HTMLSelectElement>('[data-ws-paper]'),
    orient: q<HTMLSelectElement>('[data-ws-orient]'),
    frame: q<HTMLElement>('[data-ws-frame]'),
    frameLabel: q('[data-ws-frame-label]'),
    frameMove: q<HTMLElement>('[data-ws-frame-move]'),
  };

  let open = false;
  let mode: 'navigate' | 'measure' = 'navigate';
  let measure: GroundHit[] = [];
  let probe: GroundHit | null = null;
  let frameOn = false;
  let frame: Rect = { x: 0, y: 0, w: 0, h: 0 };
  let paper: Paper = 'a4';
  let orientation: Orientation = 'landscape';
  let saved = { y: 0 };
  const placeholder = document.createComment('geo3d');

  const text = (node: Element | null, value: string) => {
    if (node) node.textContent = value;
  };

  // ── The window ─────────────────────────────────────────────────────────────
  function hint() {
    const hints = {
      navigate: ws.hint.navigate,
      measure:
        measure.length === 0
          ? ws.hint.measureFirst
          : measure.length === 1
            ? ws.hint.measureSecond
            : ws.hint.measureDone,
    };
    text(el.hint, frameOn && mode === 'navigate' ? ws.hint.frame : hints[mode]);
  }

  function openWorkspace() {
    if (open) return;
    open = true;
    saved = { y: window.scrollY };
    root.before(placeholder);
    document.body.appendChild(root);
    root.classList.add('is-workspace');
    root.classList.toggle('ws-hide-right', window.innerWidth < 1100);
    root.classList.toggle('ws-hide-left', window.innerWidth < 820);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    document.documentElement.classList.add('geo-ws-open');
    controller.setZoomAlways(true);
    controller.hooks.hover = onHover;
    document.addEventListener('keydown', onKey);
    hint();
    renderProbe();
    controller.requestRender();
    q<HTMLElement>('[data-ws-action="close"]')?.focus();
  }

  function closeWorkspace() {
    if (!open) return;
    open = false;
    setMode('navigate');
    setFrame(false);
    if (document.fullscreenElement) void document.exitFullscreen?.();
    document.removeEventListener('keydown', onKey);
    controller.hooks.hover = undefined;
    controller.setZoomAlways(false);
    document.documentElement.classList.remove('geo-ws-open');
    root.classList.remove('is-workspace');
    root.removeAttribute('role');
    root.removeAttribute('aria-modal');
    placeholder.replaceWith(root);
    window.scrollTo(0, saved.y);
    q<HTMLElement>('[data-ws-open]')?.focus({ preventScroll: true });
    controller.requestRender();
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement;
    if (target && /^(input|select|textarea)$/i.test(target.tagName)) {
      if (e.key === 'Escape') target.blur();
      return;
    }
    if (e.key === 'Escape') {
      if (measure.length) clearMeasure();
      else if (frameOn) setFrame(false);
      else closeWorkspace();
    } else if (e.key === 'f' || e.key === 'F') controller.setView('perspective');
    else if (e.key === '1') controller.setView('perspective');
    else if (e.key === '2') controller.setView('top');
    else if (e.key === '3') controller.setView('south');
    else if (e.key === '4') controller.setView('west');
    else if (e.key === 'm' || e.key === 'M') setMode(mode === 'measure' ? 'navigate' : 'measure');
    else if (e.key === 'p' || e.key === 'P') void printFrame();
  }

  // ── Tools ──────────────────────────────────────────────────────────────────
  function setMode(next: 'navigate' | 'measure') {
    mode = next;
    controller.setWellsClickable(next === 'navigate');
    if (next === 'navigate') clearMeasure();
    for (const b of qa('[data-ws-tool="navigate"],[data-ws-tool="measure"]')) {
      b.setAttribute('aria-pressed', String(b.dataset.wsTool === mode));
    }
    stage.classList.toggle('is-measuring', mode === 'measure');
    hint();
  }

  function clearMeasure() {
    measure = [];
    controller.setMeasure(null);
    hint();
  }

  function onGround(hit: GroundHit) {
    if (!open) return;
    if (mode === 'measure') {
      if (measure.length >= 2) measure = [];
      measure.push(hit);
      controller.setMeasure(measure.length === 2 ? [measure[0], measure[1]] : null);
      hint();
      return;
    }
    probe = hit;
    controller.setProbe(hit);
    renderProbe();
  }
  controller.hooks.ground = onGround;

  function onHover(hit: GroundHit | null) {
    if (!hit) {
      text(el.coord, ws.status.none);
      text(el.gk, '');
      text(el.elev, '');
      text(el.temps, '');
      return;
    }
    text(
      el.coord,
      `${ws.status.lat} ${hit.lat.toFixed(4)}°  ${ws.status.lon} ${hit.lon.toFixed(4)}°`,
    );
    text(el.gk, `${ws.status.gk} ${f.int(hit.e * 1000)} / ${f.int(hit.n * 1000)}`);
    text(el.elev, `${ws.status.elevation} ${f.int(hit.elevation)} ${s.units.m}`);
    text(
      el.temps,
      `${fill(ws.status.temps, { a: 500, b: '1 000', c: '2 000' })}: ${f.num(hit.column[0])} · ${f.num(hit.column[1])} · ${f.num(hit.column[2])} ${s.units.degC}`,
    );
  }

  function renderProbe() {
    if (!el.probe) return;
    if (!probe) {
      el.probe.innerHTML = `<p class="geo3d-muted">${esc(ws.probe.empty)}</p>`;
      return;
    }
    const st = controller.state();
    const contour = st.contours.on ? st.contours.temp : null;
    const rows = probeRows(probe, contour, ws, f, s.units);
    el.probe.innerHTML =
      `<dl class="geo3d-facts">${rows.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd>`).join('')}</dl>` +
      profileSvg(probe.column, {
        contourTemp: contour ?? undefined,
        tempLabel: ws.chart.temp,
        depthLabel: ws.chart.depth,
      }) +
      `<button type="button" class="geo3d-link" data-ws-probe-clear>${esc(ws.probe.clear)}</button>`;
    el.probe.querySelector('[data-ws-probe-clear]')?.addEventListener('click', () => {
      probe = null;
      controller.setProbe(null);
      renderProbe();
    });
  }

  // ── Finder ─────────────────────────────────────────────────────────────────
  if (el.findList) {
    el.findList.innerHTML = WELLS.map(
      (w) => `<option value="${esc(w.id)} · ${esc(SETTLEMENTS[w.place].name)}"></option>`,
    ).join('');
  }
  el.find?.addEventListener('change', () => {
    const query = el.find!.value.trim().toLowerCase();
    if (!query) return text(el.findMsg, '');
    const id = query.split(' · ')[0];
    const well =
      WELLS.find((w) => w.id.toLowerCase() === id) ??
      WELLS.find((w) => SETTLEMENTS[w.place].name.toLowerCase() === query) ??
      WELLS.find(
        (w) =>
          w.id.toLowerCase().includes(query) ||
          SETTLEMENTS[w.place].name.toLowerCase().includes(query),
      );
    if (well) {
      text(el.findMsg, '');
      controller.focusWell(well.id);
    } else {
      text(el.findMsg, ws.find.none);
    }
  });

  // ── Print frame ────────────────────────────────────────────────────────────
  function frameSummary() {
    const mm = pictureMm(paper, orientation);
    const label = paper === 'a4' ? ws.print.a4 : ws.print.a3;
    const orient = orientation === 'landscape' ? ws.print.landscape : ws.print.portrait;
    const line = fill(ws.print.summary, {
      paper: label,
      orientation: orient.toLowerCase(),
      w: mm.w,
      h: mm.h,
    });
    text(el.summary, line);
    text(el.frameLabel, `${label} · ${orient.toLowerCase()}`);
  }

  function placeFrame() {
    if (!el.frame) return;
    el.frame.style.left = `${frame.x}px`;
    el.frame.style.top = `${frame.y}px`;
    el.frame.style.width = `${frame.w}px`;
    el.frame.style.height = `${frame.h}px`;
  }

  function setFrame(on: boolean) {
    frameOn = on;
    if (!el.frame) return;
    el.frame.hidden = !on;
    if (on) {
      const { w, h } = controller.stageSize();
      frame = defaultFrame(w, h);
      placeFrame();
      frameSummary();
    }
    for (const b of qa('[data-ws-tool="frame"]')) b.setAttribute('aria-pressed', String(on));
    const box = q<HTMLInputElement>('[data-ws-frame-on]');
    if (box) box.checked = on;
    hint();
  }

  function drag(target: HTMLElement, apply: (dx: number, dy: number, start: Rect) => Rect) {
    target.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      target.setPointerCapture(e.pointerId);
      const start = { ...frame };
      const x0 = e.clientX;
      const y0 = e.clientY;
      const move = (ev: PointerEvent) => {
        frame = apply(ev.clientX - x0, ev.clientY - y0, start);
        placeFrame();
      };
      const up = () => {
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        target.removeEventListener('pointercancel', up);
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
      target.addEventListener('pointercancel', up);
    });
  }
  if (el.frameMove) {
    drag(el.frameMove, (dx, dy, start) => moveFrame(start, dx, dy, controller.stageSize()));
  }
  for (const h of qa<HTMLElement>('[data-handle]')) {
    drag(h, (dx, dy, start) =>
      resizeFrame(start, h.dataset.handle as Handle, dx, dy, controller.stageSize()),
    );
  }

  /** Keep the frame inside the stage when the window changes size. */
  const resizeObserver = new ResizeObserver(() => {
    if (!frameOn) return;
    const { w, h } = controller.stageSize();
    frame = moveFrame(frame, 0, 0, { w, h });
    if (frame.x + frame.w > w || frame.y + frame.h > h) frame = defaultFrame(w, h);
    placeFrame();
  });
  resizeObserver.observe(stage);

  el.paper?.addEventListener('change', () => {
    paper = el.paper!.value as Paper;
    frameSummary();
  });
  el.orient?.addEventListener('change', () => {
    orientation = el.orient!.value as Orientation;
    frameSummary();
  });
  q('[data-ws-frame-on]')?.addEventListener('change', (e) =>
    setFrame((e.target as HTMLInputElement).checked),
  );
  frameSummary();

  // ── The sheet ──────────────────────────────────────────────────────────────
  function sheetData(image: string, region: Rect): SheetData {
    const st = controller.state();
    const info = controller.frameInfo(region);
    const cam = controller.cameraInfo();
    const mm = pictureMm(paper, orientation);
    const fromAbove = cam.tilt >= 70;
    const frameRows: SheetRow[] = [];
    if (info.center) {
      frameRows.push({
        label: ws.sheet.rows.centre,
        value: `${info.center.lat.toFixed(3)}°N, ${info.center.lon.toFixed(3)}°E`,
      });
    }
    if (info.widthKm !== null && info.heightKm !== null) {
      frameRows.push({
        label: ws.sheet.rows.size,
        value: `${f.num(info.widthKm)} × ${f.num(info.heightKm)} ${s.units.km}`,
      });
    }
    frameRows.push({
      label: ws.sheet.rows.view,
      value: fromAbove
        ? ws.sheet.viewTop
        : fill(ws.sheet.viewOblique, { azimuth: f.int(cam.azimuth), tilt: f.int(cam.tilt) }),
    });
    if (fromAbove && info.widthKm !== null) {
      frameRows.push({
        label: ws.sheet.rows.scale,
        value: fill(ws.sheet.scaleValue, {
          n: f.int(scaleDenominator(info.widthKm, mm.w)),
        }),
      });
    }
    const shown = (['producing', 'idle', 'untapped'] as const)
      .filter((k) => st.statuses[k])
      .map((k) => s.status[k])
      .join(', ');
    const settings: SheetRow[] = [
      { label: ws.sheet.rows.exaggeration, value: `×${st.ve}` },
      { label: ws.sheet.rows.relief, value: `×${st.relief}` },
      {
        label: ws.sheet.rows.layers,
        value: st.layers.on
          ? fill(ws.sheet.layersValue, {
              step: f.num(st.layers.step),
              opacity: Math.round(st.layers.opacity * 100),
            })
          : ws.sheet.rows.off,
      },
      {
        label: ws.sheet.rows.contours,
        value: st.contours.on
          ? fill(ws.sheet.contoursValue, { temp: st.contours.temp })
          : ws.sheet.rows.off,
      },
      { label: ws.sheet.rows.map, value: st.basemap ? ws.sheet.mapValue : ws.sheet.rows.off },
      {
        label: ws.sheet.rows.wells,
        value: st.wells ? shown || ws.sheet.rows.off : ws.sheet.rows.off,
      },
    ];
    const inFrame = controller.wellsInRegion(region).sort((a, b) => a.id.localeCompare(b.id));
    const selected = st.selected ? WELLS.find((w) => w.id === st.selected) : undefined;
    const date = new Intl.DateTimeFormat(s.locale, { dateStyle: 'long' }).format(new Date());
    return {
      paper,
      orientation,
      title: document.title.replace(/\s+—.*$/, ''),
      subtitle: ws.sheet.subtitle,
      date: fill(ws.sheet.date, { date }),
      image,
      imageAlt: ws.sheet.subtitle,
      credit: st.basemap ? ws.sheet.credit : '',
      facts: [
        { title: ws.sheet.facts.frame, rows: frameRows },
        { title: ws.sheet.facts.settings, rows: settings },
      ],
      legend: {
        title: ws.sheet.legendTitle,
        stops: legendStops(),
        ticks: LEGEND_TICKS,
        keys: ws.sheet.keys,
      },
      point: probe
        ? {
            title: ws.sheet.point,
            rows: probeRows(probe, st.contours.on ? st.contours.temp : null, ws, f, s.units),
            chart: profileSvg(probe.column, {
              contourTemp: st.contours.on ? st.contours.temp : undefined,
              tempLabel: ws.chart.temp,
              depthLabel: ws.chart.depth,
            }),
          }
        : undefined,
      wells: {
        title: ws.sheet.wells,
        head: ws.sheet.wellsHead,
        rows: inFrame.map((w) => wellRow(w, s, f)),
        empty: ws.sheet.wellsEmpty,
      },
      selected: selected
        ? { title: `${ws.sheet.selected}: ${selected.id}`, ...selectedWell(selected, s, f) }
        : undefined,
      notes: { title: ws.sheet.notesTitle, items: ws.sheet.notes },
      footer: `${location.origin}${location.pathname}`,
    };
  }

  /** Print the contents of the frame, with the data on screen, through the browser's print dialog. */
  async function printFrame() {
    if (!open) return;
    if (!frameOn) {
      setFrame(true);
      text(el.msg, ws.print.placeFirst);
      return;
    }
    text(el.msg, ws.print.busy);
    // Let the message show before the render holds the page.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
    const region = { ...frame };
    const px = pictureSize(paper, orientation, 200);
    const canvas = controller.snapshot(region, px.w, px.h);
    const data = sheetData(canvas.toDataURL('image/jpeg', 0.92), region);

    document.querySelectorAll('.geo-sheet-root, style[data-geo-print]').forEach((n) => n.remove());
    const host = document.createElement('div');
    host.className = 'geo-sheet-root';
    host.innerHTML = buildSheet(data);
    const style = document.createElement('style');
    style.dataset.geoPrint = '';
    style.textContent = pageCss(paper, orientation);
    document.body.appendChild(host);
    document.head.appendChild(style);
    document.documentElement.classList.add('geo-printing');
    await host
      .querySelector('img')
      ?.decode()
      .catch(() => undefined);
    const done = () => {
      document.documentElement.classList.remove('geo-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    text(el.msg, '');
    window.print();
  }

  function saveImage() {
    if (!open) return;
    if (!frameOn) {
      setFrame(true);
      text(el.msg, ws.print.placeFirst);
      return;
    }
    const px = pictureSize(paper, orientation, 200);
    controller.snapshot({ ...frame }, px.w, px.h).toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'geotermalni-model-vojvodine.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, 'image/png');
  }

  // ── Buttons ────────────────────────────────────────────────────────────────
  const actions: Record<string, () => void> = {
    close: closeWorkspace,
    fit: () => controller.setView('perspective'),
    print: () => void printFrame(),
    png: saveImage,
    fullscreen: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void root.requestFullscreen?.().catch(() => undefined);
    },
  };
  for (const b of qa('[data-ws-action]')) {
    b.addEventListener('click', () => actions[b.dataset.wsAction!]?.());
  }
  q('[data-ws-open]')?.addEventListener('click', openWorkspace);
  for (const b of qa('[data-ws-tool]')) {
    b.addEventListener('click', () => {
      const tool = b.dataset.wsTool;
      if (tool === 'frame') setFrame(!frameOn);
      else if (tool === 'navigate' || tool === 'measure') setMode(tool);
    });
  }
  for (const b of qa('[data-ws-dock]')) {
    b.addEventListener('click', () => {
      const cls = b.dataset.wsDock === 'left' ? 'ws-hide-left' : 'ws-hide-right';
      b.setAttribute('aria-pressed', String(root.classList.toggle(cls) === false));
    });
  }
  if (!document.fullscreenEnabled) {
    for (const b of qa('[data-ws-action="fullscreen"]')) b.hidden = true;
  }

  // The width at which the total fits: tell the model to re-measure its stage after a dock changes.
  const dockObserver = new MutationObserver(() => controller.requestRender());
  dockObserver.observe(root, { attributes: true, attributeFilter: ['class'] });

  setMode('navigate');
  text(el.coord, ws.status.none);

  return () => {
    closeWorkspace();
    resizeObserver.disconnect();
    dockObserver.disconnect();
  };
}
