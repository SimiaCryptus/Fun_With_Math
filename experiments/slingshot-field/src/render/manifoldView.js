import * as THREE from 'three';
import { OrthoView } from './renderer.js';
import { NF, F, xiAt, nearestIndex } from '../core/grid.js';
import { isExitLabel } from '../core/conventions.js';
import { viridis } from './colormaps.js';

const TWO_PI = 2 * Math.PI;

function segments(pos, col, color = 0xffffff, opacity = 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.LineBasicMaterial({ color: col ? 0xffffff : color, vertexColors: !!col,
    transparent: opacity < 1, opacity, depthTest: false });
  const l = new THREE.LineSegments(g, m); l.renderOrder = 3; return l;
}

export class ManifoldView extends OrthoView {
  constructor() {
    super();
    this.scene.background = new THREE.Color(0x07080b);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(TWO_PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.quad.position.set(Math.PI, 0, 0);
    this.overlays = new THREE.Group(); this.crossG = new THREE.Group();
    const frame = [0, -Math.PI / 2, 0, TWO_PI, -Math.PI / 2, 0, TWO_PI, -Math.PI / 2, 0, TWO_PI, Math.PI / 2, 0,
      TWO_PI, Math.PI / 2, 0, 0, Math.PI / 2, 0, 0, Math.PI / 2, 0, 0, -Math.PI / 2, 0, 0, 0, 0, TWO_PI, 0, 0];
    this.scene.add(this.quad, segments(frame, null, 0x445566), this.overlays, this.crossG);
    this.tex = null; this.fit();
  }
  fit() { this.cx = Math.PI; this.cy = 0; this.hh = Math.max(Math.PI / 2, Math.PI / this.aspect) * 1.06; this.updateCam(); }
  onResize() { this.fit(); }
  setImage(rgba, N) {
    if (!this.tex || this.texN !== N) {
      this.tex?.dispose();
      this.tex = new THREE.DataTexture(rgba, N, N, THREE.RGBAFormat);
      this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
      this.tex.colorSpace = THREE.SRGBColorSpace; this.texN = N;
      this.quad.material = new THREE.MeshBasicMaterial({ map: this.tex });
    } else this.tex.image.data = rgba;
    this.tex.needsUpdate = true;
  }
  setOverlays(grid, { quiver, stream, glyph }) {
    for (const c of [...this.overlays.children]) { this.overlays.remove(c); c.geometry.dispose(); }
    if (!grid) return;
    if (quiver) this.overlays.add(buildQuiver(grid));
    if (stream) this.overlays.add(buildStreamlines(grid));
    if (glyph) this.overlays.add(buildGlyphs(grid));
  }
  setCross(a, b) {
    for (const c of [...this.crossG.children]) this.crossG.remove(c);
    if (a == null) return;
    const s = 0.08;
    this.crossG.add(segments([a - s, b, 0, a + s, b, 0, a, b - s, 0, a, b + s, 0], null, 0x00ffff));
  }
}

const val = (g, k, f) => g.data[k * NF + F[f]];

function buildQuiver(g) {
  const N = g.N, st = Math.max(1, Math.round(N / 32)), cell = (st * Math.PI) / N;
  let max = 0;
  for (let j = 0; j < N; j += st) for (let i = 0; i < N; i += st) {
    const k = j * N + i; if (!isExitLabel(g.label[k])) continue;
    const m = Math.hypot(val(g, k, 'dvx'), val(g, k, 'dvy')); if (Number.isFinite(m)) max = Math.max(max, m);
  }
  const pos = [], col = [];
  for (let j = st >> 1; j < N; j += st) for (let i = st >> 1; i < N; i += st) {
    const k = j * N + i; if (!isExitLabel(g.label[k])) continue;
    const vx = val(g, k, 'dvx'), vy = val(g, k, 'dvy'), m = Math.hypot(vx, vy);
    if (!(m > 0)) continue;
    const [a, b] = xiAt(i, j, N), L = cell * 0.9 * Math.sqrt(m / max), ux = vx / m, uy = vy / m;
    const tx = a + ux * L, ty = b + uy * L, hl = L * 0.3;
    pos.push(a, b, 0, tx, ty, 0,
      tx, ty, 0, tx - hl * (ux * 0.87 - uy * 0.5), ty - hl * (uy * 0.87 + ux * 0.5), 0,
      tx, ty, 0, tx - hl * (ux * 0.87 + uy * 0.5), ty - hl * (uy * 0.87 - ux * 0.5), 0);
    const c = viridis(m / max).map((v) => v / 255);
    for (let q = 0; q < 6; q++) col.push(...c);
  }
  return segments(pos, col);
}

function buildStreamlines(g) {
  const N = g.N, h = (1.5 * Math.PI) / N, pos = [];
  const sample = (a, b) => {
    if (b <= -Math.PI / 2 || b >= Math.PI / 2) return null;
    const [i, j] = nearestIndex(((a % TWO_PI) + TWO_PI) % TWO_PI, b, N), k = j * N + i;
    if (!isExitLabel(g.label[k])) return null;
    const gx = val(g, k, 'gA'), gy = val(g, k, 'gB'), m = Math.hypot(gx, gy);
    return m > 0 && Number.isFinite(m) ? [gx / m, gy / m] : null;
  };
  for (let sj = 0; sj < 16; sj++) for (let si = 0; si < 32; si++) {
    let a = ((si + 0.5 + 0.3 * Math.sin(si * 7.1 + sj)) / 32) * TWO_PI;
    let b = -Math.PI / 2 + ((sj + 0.5 + 0.3 * Math.cos(sj * 3.7 + si)) / 16) * Math.PI;
    for (let n = 0; n < 120; n++) {
      const d1 = sample(a, b); if (!d1) break;
      const d2 = sample(a + 0.5 * h * d1[0], b + 0.5 * h * d1[1]); if (!d2) break;
      const na = a + h * d2[0], nb = b + h * d2[1];
      if (na >= 0 && na < TWO_PI) pos.push(a, b, 0, na, nb, 0);
      a = ((na % TWO_PI) + TWO_PI) % TWO_PI; b = nb;
    }
  }
  return segments(pos, null, 0xffffff, 0.55);
}

function buildGlyphs(g) {
  const N = g.N, st = Math.max(1, Math.round(N / 24)), cell = (st * Math.PI) / N, pos = [], col = [];
  for (let j = st >> 1; j < N; j += st) for (let i = st >> 1; i < N; i += st) {
    const k = j * N + i; if (!isExitLabel(g.label[k])) continue;
    const A = ['A00', 'A01', 'A10', 'A11'].map((f) => val(g, k, f));
    const smax = Math.max(Math.abs(val(g, k, 's1')), Math.abs(val(g, k, 's2')));
    if (!A.every(Number.isFinite) || !(smax > 0)) continue;
    const sc = (cell * 0.45) / smax, [a, b] = xiAt(i, j, N);
    const c = val(g, k, 'flip') ? [1, 0.3, 0.3] : [0.6, 0.9, 1];
    let px, py;
    for (let q = 0; q <= 24; q++) {
      const t = (q / 24) * TWO_PI, ct = Math.cos(t), s = Math.sin(t);
      const x = a + sc * (A[0] * ct + A[1] * s), y = b + sc * (A[2] * ct + A[3] * s);
      if (q) { pos.push(px, py, 0, x, y, 0); col.push(...c, ...c); }
      px = x; py = y;
    }
    const d = val(g, k, 'deltaEff');
    pos.push(a, b, 0, a + cell * 0.45 * Math.cos(d), b + cell * 0.45 * Math.sin(d), 0); col.push(1, 1, 0.3, 1, 1, 0.3);
  }
  return segments(pos, col);
}