// SVG-projected 3D viewport: camera, grid, axes, points, glyphs, picking,
// seed dragging (camera plane + axis handles) and turntable orbit / pan /
// zoom-to-cursor controls for mouse, touch and keyboard.
import * as V from "./vec3.js";
import { fmt } from "./dom.js";
import { defaultView } from "../core/model.js";

const SVG_NS = "http://www.w3.org/2000/svg";
export function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}

const AXES = [
  { name: "X", dir: [1, 0, 0], cls: "x", view: "right" },
  { name: "Y", dir: [0, 1, 0], cls: "y", view: "back" },
  { name: "Z", dir: [0, 0, 1], cls: "z", view: "top" },
];
const GRID_PLANES = { xy: [[1, 0, 0], [0, 1, 0]], xz: [[1, 0, 0], [0, 0, 1]], yz: [[0, 1, 0], [0, 0, 1]] };
const NEAR = 1e-2;
const MAX_ELEVATION = (89.5 * Math.PI) / 180;
const ISO = 1 / Math.sqrt(3);

/** Named camera directions (unit vector from target to camera). */
export const VIEWS = {
  top: [0, 0, 1], bottom: [0, 0, -1],
  front: [0, -1, 0], back: [0, 1, 0],
  right: [1, 0, 0], left: [-1, 0, 0],
  iso: [ISO, ISO, ISO],
};
const OPPOSITE = { top: "bottom", bottom: "top", front: "back", back: "front", right: "left", left: "right", iso: "iso" };
const DIGIT_VIEWS = { 1: "front", 3: "right", 7: "top", 0: "iso" };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mid2 = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

export class Viewport {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.createElement("div");
    this.el.className = "pc-viewport";
    this.el.tabIndex = 0;
    this.svg = svgEl("svg", { class: "pc-svg" });
    this.hud = document.createElement("div");
    this.hud.className = "pc-hud";
    this.el.append(this.svg, this.hud);
    this._drag = null;
    this._pointers = new Map();
    this._cameraTimer = 0;
    this._bind();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(() => this.render());
      this._ro.observe(this.el);
    }
  }

  // ---- camera ----------------------------------------------------------
  frame() {
    const W = this.el.clientWidth || 640;
    const H = this.el.clientHeight || 480;
    const cam = this.ctx.sketch.view.camera;
    const pos = cam.position;
    const target = cam.target;
    let f = V.normalize(V.sub(target, pos));
    if (V.norm(f) === 0) f = [0, 0, -1];
    let up = cam.up ?? [0, 0, 1];
    let r = V.cross(f, up);
    if (V.norm(r) < 1e-6) {
      up = Math.abs(f[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
      r = V.cross(f, up);
    }
    r = V.normalize(r);
    const u = V.cross(r, f);
    const fov = ((cam.fov ?? 45) * Math.PI) / 180;
    const focal = H / 2 / Math.tan(fov / 2);
    const dist = Math.max(V.norm(V.sub(target, pos)), 1e-6);
    return { W, H, pos, target, up, f, r, u, focal, dist, scale: focal / dist, projection: cam.projection ?? "perspective" };
  }

  view(p, fr) {
    const d = V.sub(p, fr.pos);
    return [V.dot(d, fr.r), V.dot(d, fr.u), V.dot(d, fr.f)];
  }

  toScreen(v, fr) {
    const s = fr.projection === "perspective" ? fr.focal / v[2] : fr.scale;
    return { x: fr.W / 2 + v[0] * s, y: fr.H / 2 - v[1] * s, depth: v[2] };
  }

  project(p, fr) {
    const v = this.view(p, fr);
    if (fr.projection === "perspective" && v[2] < NEAR) return null;
    return this.toScreen(v, fr);
  }

  /** Project a segment, clipping against the near plane in perspective. */
  segment(a, b, fr) {
    let va = this.view(a, fr);
    let vb = this.view(b, fr);
    if (fr.projection === "perspective") {
      if (va[2] < NEAR && vb[2] < NEAR) return null;
      if (va[2] < NEAR) va = V.lerp(va, vb, (NEAR - va[2]) / (vb[2] - va[2]));
      else if (vb[2] < NEAR) vb = V.lerp(vb, va, (NEAR - vb[2]) / (va[2] - vb[2]));
    }
    return [this.toScreen(va, fr), this.toScreen(vb, fr)];
  }

  ray(sx, sy, fr) {
    const px = sx - fr.W / 2;
    const py = -(sy - fr.H / 2);
    if (fr.projection === "perspective") {
      const d = V.normalize(V.add(fr.f, V.add(V.scale(fr.r, px / fr.focal), V.scale(fr.u, py / fr.focal))));
      return { o: fr.pos, d };
    }
    const o = V.add(fr.pos, V.add(V.scale(fr.r, px / fr.scale), V.scale(fr.u, py / fr.scale)));
    return { o, d: fr.f };
  }

  planeHit(ray, point, normal) {
    const den = V.dot(ray.d, normal);
    if (Math.abs(den) < 1e-9) return null;
    const t = V.dot(V.sub(point, ray.o), normal) / den;
    return V.add(ray.o, V.scale(ray.d, t));
  }

  /** Parameter s of the point on line P + s·e closest to the ray. */
  lineParam(P, e, ray) {
    const w = V.sub(P, ray.o);
    const a = V.dot(e, e);
    const b = V.dot(e, ray.d);
    const c = V.dot(ray.d, ray.d);
    const d = V.dot(e, w);
    const f = V.dot(ray.d, w);
    const den = a * c - b * b;
    if (Math.abs(den) < 1e-9) return 0;
    return (b * f - c * d) / den;
  }

  // ---- camera controls -------------------------------------------------
  /**
   * Turntable orbit about the target: `dAz` rotates around the world up axis,
   * `dEl` changes the elevation (both radians). Elevation is clamped just
   * short of the poles so the camera never flips.
   */
  orbit(dAz, dEl) {
    const cam = this.ctx.sketch.view.camera;
    const fr = this.frame();
    const worldUp = V.normalize(cam.up ?? [0, 0, 1]);
    let off = V.sub(cam.position, cam.target);
    const dist = V.norm(off);
    if (dist === 0) return;
    off = V.rotate(off, worldUp, dAz);
    const el = Math.asin(clamp(V.dot(off, worldUp) / dist, -1, 1));
    const target = clamp(el + dEl, -MAX_ELEVATION, MAX_ELEVATION);
    let axis = V.cross(off, worldUp);
    if (V.norm(axis) < 1e-9 * dist) axis = V.scale(fr.r, -1);
    off = V.rotate(off, axis, target - el);
    cam.position = V.add(cam.target, off);
  }

  /** Pan by screen pixels; the plane through the target moves with the cursor. */
  pan(dx, dy) {
    const cam = this.ctx.sketch.view.camera;
    const fr = this.frame();
    const delta = V.add(V.scale(fr.r, -dx / fr.scale), V.scale(fr.u, dy / fr.scale));
    cam.position = V.add(cam.position, delta);
    cam.target = V.add(cam.target, delta);
  }

  /**
   * Dolly by `factor` (> 1 zooms out). The world point under (sx, sy) on the
   * target plane stays fixed on screen; without a cursor the target is used.
   */
  zoomAt(factor, sx, sy) {
    const cam = this.ctx.sketch.view.camera;
    const fr = this.frame();
    const dist = V.norm(V.sub(cam.position, cam.target)) * factor;
    if (!(dist > 1e-3 && dist < 1e7)) return;
    let hit = null;
    if (sx != null && sy != null) hit = this.planeHit(this.ray(sx, sy, fr), cam.target, fr.f);
    hit = hit ?? cam.target;
    cam.target = V.add(hit, V.scale(V.sub(cam.target, hit), factor));
    cam.position = V.add(hit, V.scale(V.sub(cam.position, hit), factor));
  }

  /** Look at the target from a named direction (see VIEWS), keeping the distance. */
  setView(name) {
    const dir = VIEWS[name];
    if (!dir) return;
    const cam = this.ctx.sketch.view.camera;
    const dist = Math.max(V.norm(V.sub(cam.position, cam.target)), 1e-3);
    cam.position = V.add(cam.target, V.scale(dir, dist));
    cam.up = [0, 0, 1];
    this.ctx.commit("camera");
  }

  /** Snap to a named view; if already there, look from the opposite side. */
  snapView(name) {
    const dir = VIEWS[name];
    if (!dir) return;
    const cam = this.ctx.sketch.view.camera;
    const e = V.normalize(V.sub(cam.position, cam.target));
    this.setView(V.dot(e, dir) > 0.999 ? OPPOSITE[name] : name);
  }

  toggleProjection() {
    const cam = this.ctx.sketch.view.camera;
    cam.projection = cam.projection === "perspective" ? "orthographic" : "perspective";
    this.ctx.commit("camera");
  }

  /** Make a point the orbit centre without changing the viewing direction. */
  focusOn(id) {
    const p = this._pointDisplay(id);
    if (!p) return;
    const cam = this.ctx.sketch.view.camera;
    const off = V.sub(cam.position, cam.target);
    cam.target = p;
    cam.position = V.add(p, off);
    this.ctx.commit("camera");
  }

  /** Restore the default camera and frame all points. */
  resetView() {
    Object.assign(this.ctx.sketch.view.camera, defaultView().camera);
    this.fitAll();
  }

  /** Re-frame the camera around all points, keeping the viewing direction. */
  fitAll() {
    const sk = this.ctx.sketch;
    const cam = sk.view.camera;
    const space = this.ctx.getSpace();
    const pts = sk.points.map((p) => space.toDisplay(p.solved ?? p.seed));
    if (!pts.length) {
      this.ctx.commit("camera");
      return;
    }
    const c = pts.reduce((acc, p) => V.add(acc, p), [0, 0, 0]).map((x) => x / pts.length);
    let radius = 1;
    for (const p of pts) radius = Math.max(radius, V.norm(V.sub(p, c)));
    let dir = V.normalize(V.sub(cam.position, cam.target));
    if (V.norm(dir) === 0) dir = VIEWS.iso;
    const fov = ((cam.fov ?? 45) * Math.PI) / 180;
    const dist = (radius * 1.2) / Math.sin(fov / 2);
    cam.target = c;
    cam.position = V.add(c, V.scale(dir, dist));
    this.ctx.commit("camera");
  }

  /** Redraw now; commit the camera to the model after a short quiet period. */
  _cameraChanged(immediate = false) {
    this.render();
    clearTimeout(this._cameraTimer);
    if (immediate) this.ctx.commit("camera");
    else this._cameraTimer = setTimeout(() => this.ctx.commit("camera"), 250);
  }

  // ---- rendering -------------------------------------------------------
  render() {
    const sk = this.ctx.sketch;
    const space = this.ctx.getSpace();
    const fr = this.frame();
    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute("viewBox", `0 0 ${fr.W} ${fr.H}`);

    const disp = new Map();
    const seeds = new Map();
    for (const p of sk.points) {
      disp.set(p.id, space.toDisplay(p.solved ?? p.seed));
      seeds.set(p.id, space.toDisplay(p.seed));
    }
    let extent = 10;
    for (const c of disp.values()) for (const x of c) extent = Math.max(extent, Math.abs(x));
    for (const c of seeds.values()) for (const x of c) extent = Math.max(extent, Math.abs(x));
    this._extent = extent;

    const gGrid = svgEl("g", { class: "pc-layer-grid" });
    const gGlyph = svgEl("g", { class: "pc-layer-glyphs" });
    const gPts = svgEl("g", { class: "pc-layer-points" });
    const gUi = svgEl("g", { class: "pc-gizmo" });
    svg.append(gGrid, gGlyph, gPts, gUi);

    if (sk.view.grid && sk.view.grid !== "none") this.drawGrid(gGrid, fr, sk.view.grid, extent);
    if (sk.view.showAxes) this.drawAxes(gGrid, fr, extent);

    const evals = new Map(this.ctx.evaluate().map((e) => [e.id, e]));
    for (const c of sk.constraints) {
      const coords = c.points.map((id) => disp.get(id));
      if (coords.some((x) => !x)) continue;
      const ev = evals.get(c.id);
      const cls = `pc-status-${ev?.status ?? "none"}${c.enabled === false ? " pc-disabled" : ""}`;
      const kind = this.ctx.registry.hasConstraintKind(c.type) ? this.ctx.registry.getConstraintKind(c.type) : null;
      const label = ev?.measure != null ? fmt(ev.measure, 2) : "";
      if (kind?.glyph) {
        kind.glyph({ g: gGlyph, coords, constraint: c, evaluation: ev, viewport: this, frame: fr, svgEl, cls });
      } else if (coords.length === 2) this.drawDistance(gGlyph, fr, coords, label, cls);
      else if (coords.length === 3) this.drawAngle(gGlyph, fr, coords, label, cls);
    }

    const sel = this.ctx.selection;
    for (const p of sk.points) {
      const pos = disp.get(p.id);
      const seed = seeds.get(p.id);
      const s = this.project(pos, fr);
      if (sk.view.showSeeds && p.solved && !sameVec(pos, seed)) {
        const seg = this.segment(seed, pos, fr);
        if (seg) gPts.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: "pc-seed-link" }));
        const sp = this.project(seed, fr);
        if (sp) gPts.append(svgEl("circle", { cx: sp.x, cy: sp.y, r: 4, class: "pc-seed" }));
      }
      if (!s) continue;
      const selected = sel.has(p.id);
      const cls = `pc-point${p.fixed ? " pc-fixed" : ""}${selected ? " pc-selected" : ""}${p.macro ? " pc-macro" : ""}`;
      if (selected) gPts.append(svgEl("circle", { cx: s.x, cy: s.y, r: 10, class: "pc-selection-ring" }));
      const marker = p.fixed
        ? svgEl("rect", { x: s.x - 5, y: s.y - 5, width: 10, height: 10, class: cls })
        : svgEl("circle", { cx: s.x, cy: s.y, r: 5.5, class: cls });
      marker.dataset.point = p.id;
      gPts.append(marker);
      if (sk.view.showLabels) gPts.append(svgEl("text", { x: s.x + 8, y: s.y - 8, class: `pc-label${p.macro ? " pc-macro" : ""}` }, p.label));
      if (selected && !this.ctx.readonly && !this.ctx.pick) this.drawHandles(gPts, fr, p.id, pos, extent);
    }

    this.drawGizmo(gUi, fr);

    const pick = this.ctx.pick;
    this.hud.textContent = pick ? `Select ${pick.needed} point${pick.needed > 1 ? "s" : ""} (${pick.ids.length}/${pick.needed}) — Esc to cancel` : "";
    this.hud.classList.toggle("pc-hud-active", !!pick);
    this.svg.classList.toggle("pc-picking", !!pick);
  }

  drawGrid(g, fr, plane, extent) {
    const [a, b] = GRID_PLANES[plane] ?? GRID_PLANES.xy;
    const step = niceStep((extent * 2) / 8);
    const k = 6;
    for (let i = -k; i <= k; i++) {
      const off = i * step;
      const cls = i === 0 ? "pc-grid pc-grid-major" : "pc-grid";
      const p1 = V.add(V.scale(a, off), V.scale(b, -k * step));
      const p2 = V.add(V.scale(a, off), V.scale(b, k * step));
      const q1 = V.add(V.scale(b, off), V.scale(a, -k * step));
      const q2 = V.add(V.scale(b, off), V.scale(a, k * step));
      for (const [s, e] of [[p1, p2], [q1, q2]]) {
        const seg = this.segment(s, e, fr);
        if (seg) g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: cls }));
      }
    }
  }

  drawAxes(g, fr, extent) {
    const L = niceStep(extent * 0.5);
    for (const ax of AXES) {
      const seg = this.segment([0, 0, 0], V.scale(ax.dir, L), fr);
      if (!seg) continue;
      g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: `pc-axis pc-axis-${ax.cls}` }));
      g.append(svgEl("text", { x: seg[1].x + 4, y: seg[1].y - 4, class: `pc-axis-label pc-axis-${ax.cls}` }, ax.name));
    }
  }

  /** Orientation gizmo in the bottom-left corner; knobs snap to axis views. */
  drawGizmo(g, fr) {
    const R = 28;
    const cx = 46;
    const cy = fr.H - 46;
    g.append(svgEl("circle", { cx, cy, r: R + 10, class: "pc-gizmo-bg" }));
    const items = AXES.map((ax) => ({ ax, x: V.dot(ax.dir, fr.r), y: V.dot(ax.dir, fr.u), z: V.dot(ax.dir, fr.f) }))
      .sort((a, b) => b.z - a.z); // axes pointing away first, toward the camera last
    for (const it of items) {
      const ex = cx + it.x * R;
      const ey = cy - it.y * R;
      const away = it.z > 0;
      g.append(svgEl("line", { x1: cx, y1: cy, x2: ex, y2: ey, class: `pc-gizmo-axis pc-axis-${it.ax.cls}`, opacity: away ? 0.4 : 1 }));
      g.append(svgEl("circle", {
        cx: ex, cy: ey, r: 7.5, class: `pc-gizmo-knob pc-axis-${it.ax.cls}`, opacity: away ? 0.55 : 1,
        "data-view": it.ax.view,
      }));
      g.append(svgEl("title", {}, `Look along ${it.ax.name} (click again for the opposite side)`));
      g.append(svgEl("text", { x: ex, y: ey + 3.5, "text-anchor": "middle", class: "pc-gizmo-text" }, it.ax.name));
    }
  }

  drawDistance(g, fr, [A, B], label, cls) {
    const seg = this.segment(A, B, fr);
    if (!seg) return;
    g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: `pc-glyph pc-distance ${cls}` }));
    const mid = this.project(V.lerp(A, B, 0.5), fr);
    if (mid && label) g.append(svgEl("text", { x: mid.x + 4, y: mid.y - 4, class: `pc-glyph-label ${cls}` }, label));
  }

  drawAngle(g, fr, [A, B, C], label, cls) {
    const a = V.sub(A, B);
    const c = V.sub(C, B);
    const la = V.norm(a);
    const lc = V.norm(c);
    if (la < 1e-9 || lc < 1e-9) return;
    const r = 0.25 * Math.min(la, lc);
    const an = V.scale(a, 1 / la);
    const cn = V.scale(c, 1 / lc);
    for (const d of [an, cn]) {
      const seg = this.segment(B, V.add(B, V.scale(d, r * 1.3)), fr);
      if (seg) g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: `pc-glyph pc-leg ${cls}` }));
    }
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const p = this.project(V.add(B, V.scale(V.slerp(an, cn, i / N), r)), fr);
      if (!p) return;
      pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    g.append(svgEl("polyline", { points: pts.join(" "), class: `pc-glyph pc-arc ${cls}` }));
    const mid = this.project(V.add(B, V.scale(V.slerp(an, cn, 0.5), r * 1.6)), fr);
    if (mid && label) g.append(svgEl("text", { x: mid.x, y: mid.y, class: `pc-glyph-label ${cls}` }, `${label}°`));
  }

  drawHandles(g, fr, id, pos, extent) {
    const L = extent * 0.18;
    AXES.forEach((ax, idx) => {
      const end = V.add(pos, V.scale(ax.dir, L));
      const seg = this.segment(pos, end, fr);
      const e = this.project(end, fr);
      if (!seg || !e) return;
      g.append(svgEl("line", { x1: seg[0].x, y1: seg[0].y, x2: seg[1].x, y2: seg[1].y, class: `pc-handle-line pc-axis-${ax.cls}` }));
      const knob = svgEl("circle", { cx: e.x, cy: e.y, r: 6, class: `pc-handle pc-axis-${ax.cls}` });
      knob.dataset.handle = String(idx);
      knob.dataset.point = id;
      g.append(knob);
    });
  }

  // ---- interaction -----------------------------------------------------
  _bind() {
    this.svg.addEventListener("pointerdown", (e) => this._onDown(e));
    this.svg.addEventListener("pointermove", (e) => this._onMove(e));
    this.svg.addEventListener("pointerup", (e) => this._onUp(e));
    this.svg.addEventListener("pointercancel", (e) => this._onUp(e));
    this.svg.addEventListener("dblclick", (e) => this._onDblClick(e));
    this.svg.addEventListener("contextmenu", (e) => e.preventDefault());
    this.svg.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    this.el.addEventListener("keydown", (e) => this._onKey(e));
  }

  _local(e) {
    const rect = this.svg.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _pointDisplay(id) {
    const p = this.ctx.sketch.points.find((q) => q.id === id);
    return p ? this.ctx.getSpace().toDisplay(p.solved ?? p.seed) : null;
  }

  _onDown(e) {
    const fr = this.frame();
    const [sx, sy] = this._local(e);
    this._pointers.set(e.pointerId, [sx, sy]);
    this.el.focus({ preventScroll: true });
    try { this.svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }

    if (this._pointers.size === 2) {
      // second finger: finish any point drag, then pinch to pan/zoom
      const d = this._drag;
      if (d && (d.mode === "point" || d.mode === "axis") && d.moved) this.ctx.commit("drag");
      const [a, b] = [...this._pointers.values()];
      this._drag = { mode: "pinch", center: mid2(a, b), dist: dist2(a, b), moved: false };
      return;
    }
    if (this._pointers.size > 2) return;

    const target = e.target instanceof Element ? e.target : null;
    const gizmo = target?.closest("[data-view]");
    if (gizmo) {
      this._drag = null;
      this.snapView(gizmo.getAttribute("data-view"));
      return;
    }
    const handle = target?.closest("[data-handle]");
    const ptEl = target?.closest("[data-point]");

    if (handle && !this.ctx.readonly) {
      const id = handle.dataset.point;
      const axis = AXES[Number(handle.dataset.handle)].dir;
      const startPos = this._pointDisplay(id);
      if (!startPos) return;
      const s0 = this.lineParam(startPos, axis, this.ray(sx, sy, fr));
      this._drag = { mode: "axis", id, axis, startPos, s0, moved: false };
      return;
    }
    if (ptEl) {
      const id = ptEl.dataset.point;
      if (this.ctx.pick) {
        this.ctx.pickPoint(id);
        this._drag = null;
        return;
      }
      this.ctx.select([id], e.shiftKey);
      if (this.ctx.readonly) return;
      const startPos = this._pointDisplay(id);
      const hit0 = this.planeHit(this.ray(sx, sy, fr), startPos, fr.f);
      this._drag = { mode: "point", id, startPos, hit0, moved: false };
      return;
    }
    const pan = e.button === 1 || e.button === 2 || e.shiftKey;
    const dolly = e.button === 0 && !e.shiftKey && (e.ctrlKey || e.metaKey);
    this._drag = { mode: dolly ? "dolly" : pan ? "pan" : "orbit", lastX: sx, lastY: sy, moved: false };
  }

  _onMove(e) {
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, this._local(e));
    const d = this._drag;
    if (!d) return;
    const fr = this.frame();
    const [sx, sy] = this._local(e);

    if (d.mode === "pinch") {
      if (this._pointers.size < 2) return;
      const [a, b] = [...this._pointers.values()];
      const c = mid2(a, b);
      const dist = dist2(a, b);
      this.pan(c[0] - d.center[0], c[1] - d.center[1]);
      if (dist > 1 && d.dist > 1) this.zoomAt(d.dist / dist, c[0], c[1]);
      d.center = c;
      d.dist = dist;
      d.moved = true;
      this.render();
      return;
    }
    if (d.mode === "orbit" || d.mode === "pan" || d.mode === "dolly") {
      const dx = sx - d.lastX;
      const dy = sy - d.lastY;
      d.lastX = sx;
      d.lastY = sy;
      if (dx === 0 && dy === 0) return;
      d.moved = true;
      if (d.mode === "orbit") this.orbit((-dx * 2 * Math.PI) / fr.W, (dy * Math.PI) / fr.H);
      else if (d.mode === "pan") this.pan(dx, dy);
      else this.zoomAt(Math.exp(dy * 0.005), fr.W / 2, fr.H / 2);
      this.render();
      return;
    }

    const p = this.ctx.sketch.points.find((q) => q.id === d.id);
    if (!p) return;
    let newPos;
    if (d.mode === "point") {
      const hit = this.planeHit(this.ray(sx, sy, fr), d.startPos, fr.f);
      if (!hit || !d.hit0) return;
      newPos = V.add(d.startPos, V.sub(hit, d.hit0));
    } else {
      const s = this.lineParam(d.startPos, d.axis, this.ray(sx, sy, fr));
      newPos = V.add(d.startPos, V.scale(d.axis, s - d.s0));
    }
    d.moved = true;
    p.seed = this.ctx.getSpace().fromDisplay(newPos);
    delete p.solved;
    this.render();
  }

  _onUp(e) {
    this._pointers.delete(e.pointerId);
    try { this.svg.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    const d = this._drag;
    if (!d) return;
    if (d.mode === "pinch") {
      if (this._pointers.size >= 2) return;
      this._drag = null;
      if (d.moved) this.ctx.commit("camera");
      return;
    }
    this._drag = null;
    if ((d.mode === "point" || d.mode === "axis") && d.moved) this.ctx.commit("drag");
    else if ((d.mode === "orbit" || d.mode === "pan" || d.mode === "dolly") && d.moved) this.ctx.commit("camera");
    else if (d.mode === "orbit" && !d.moved && !this.ctx.pick) this.ctx.select([], false);
  }

  _onDblClick(e) {
    const target = e.target instanceof Element ? e.target : null;
    if (target?.closest("[data-view]")) return;
    const ptEl = target?.closest("[data-point]");
    if (ptEl) this.focusOn(ptEl.dataset.point);
    else this.fitAll();
  }

  _onWheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1;
    const dy = clamp(e.deltaY * unit, -120, 120);
    const dx = clamp(e.deltaX * unit, -120, 120);
    if (e.shiftKey) {
      // shift+wheel (or horizontal trackpad scroll) pans
      this.pan(-dx, -dy);
    } else {
      const [sx, sy] = this._local(e);
      this.zoomAt(Math.exp(dy * 0.0015), sx, sy);
      if (dx !== 0) this.pan(-dx, 0);
    }
    this._cameraChanged();
  }

  _onKey(e) {
    if (e.target !== this.el || e.altKey) return;
    const fr = this.frame();
    const step = Math.PI / 12; // 15°
    const panPx = Math.max(20, fr.W * 0.05);
    const move = e.shiftKey || e.ctrlKey || e.metaKey;
    const digit = /^(Digit|Numpad)(\d)$/.exec(e.code ?? "")?.[2];
    if (digit !== undefined) {
      const name = DIGIT_VIEWS[digit];
      if (digit === "5") {
        e.preventDefault();
        this.toggleProjection();
      } else if (name) {
        e.preventDefault();
        this.setView(e.shiftKey && name !== "iso" ? OPPOSITE[name] : name);
      }
      return;
    }
    switch (e.key) {
      case "ArrowLeft": if (move) this.pan(-panPx, 0); else this.orbit(step, 0); break;
      case "ArrowRight": if (move) this.pan(panPx, 0); else this.orbit(-step, 0); break;
      case "ArrowUp": if (move) this.pan(0, -panPx); else this.orbit(0, step); break;
      case "ArrowDown": if (move) this.pan(0, panPx); else this.orbit(0, -step); break;
      case "+": case "=": this.zoomAt(1 / 1.25, fr.W / 2, fr.H / 2); break;
      case "-": case "_": this.zoomAt(1.25, fr.W / 2, fr.H / 2); break;
      case "f": case "F": case "Home": e.preventDefault(); this.fitAll(); return;
      case "r": case "R": e.preventDefault(); this.resetView(); return;
      default: return;
    }
    e.preventDefault();
    this._cameraChanged();
  }
}

function sameVec(a, b) {
  return a.length === b.length && a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
}