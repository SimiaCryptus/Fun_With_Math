import * as THREE from 'three';
import * as V from '../core/vec3.js';
import { fromLocal } from '../core/portal.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function heat(t) {
  t = clamp01(t);
  return [clamp01(1.5 - Math.abs(4 * t - 3)), clamp01(1.5 - Math.abs(4 * t - 2)), clamp01(1.5 - Math.abs(4 * t - 1))];
}

export function computeBounds(portals) {
  if (portals.length === 0) return { center: { x: 0, y: 1, z: 0 }, half: 4 };
  let c = { x: 0, y: 0, z: 0 };
  for (const p of portals) c = V.add(c, p.center);
  c = V.scale(c, 1 / portals.length);
  let half = 3;
  for (const p of portals) half = Math.max(half, V.distance(p.center, c) + 2 * p.radius);
  return { center: c, half };
}

function inBounds(p, b, f = 1.2) {
  const h = b.half * f;
  return Math.abs(p.x - b.center.x) < h && Math.abs(p.y - b.center.y) < h && Math.abs(p.z - b.center.z) < h;
}

function buildArrows(sampler, b, g) {
  const N = 9;
  const cell = (2 * b.half) / N;
  const pos = [], col = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const p = {
      x: b.center.x - b.half + (i + 0.5) * cell,
      y: b.center.y - b.half + (j + 0.5) * cell,
      z: b.center.z - b.half + (k + 0.5) * cell,
    };
    const e = sampler.field(p);
    const m = V.length(e);
    if (!(m > 1e-6)) continue;
    const t = m / (m + g);
    const tip = V.add(p, V.scale(e, (cell * 0.9 * t) / m));
    const c = heat(t);
    pos.push(p.x, p.y, p.z, tip.x, tip.y, tip.z);
    col.push(c[0] * 0.15, c[1] * 0.15, c[2] * 0.15, c[0], c[1], c[2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
}

function buildSlice(sampler, b, g, opts) {
  const res = 112;
  const size = 2 * b.half;
  const z0 = b.center.z + (opts.sliceOffset || 0);
  const vals = new Float64Array(res * res);
  let min = Infinity, max = -Infinity;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const p = { x: b.center.x - b.half + ((i + 0.5) / res) * size, y: b.center.y - b.half + ((j + 0.5) / res) * size, z: z0 };
    let v;
    if (opts.sliceMode === 'phi') v = sampler.potential(p);
    else if (opts.sliceMode === 'ecf') v = V.length(sampler.field(p));
    else v = V.length(sampler.geff(p));
    vals[j * res + i] = v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const data = new Uint8Array(res * res * 4);
  for (let k = 0; k < res * res; k++) {
    const t = opts.sliceMode === 'phi' ? (vals[k] - min) / (max - min || 1) : vals[k] / (2 * g);
    const c = heat(t);
    data[4 * k] = c[0] * 255; data[4 * k + 1] = c[1] * 255; data[4 * k + 2] = c[2] * 255; data[4 * k + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat);
  tex.needsUpdate = true;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.position.set(b.center.x, b.center.y, z0);
  return mesh;
}

function trace(sampler, seed, step, maxSteps, sign, b, out) {
  let p = seed;
  for (let s = 0; s < maxSteps; s++) {
    const e = sampler.field(p);
    const m = V.length(e);
    if (!(m > 1e-6)) return;
    const mid = V.addScaled(p, e, (sign * 0.5 * step) / m);
    const e2 = sampler.field(mid);
    const m2 = V.length(e2);
    if (!(m2 > 1e-6)) return;
    const next = V.addScaled(p, e2, (sign * step) / m2);
    out.push(p.x, p.y, p.z, next.x, next.y, next.z);
    p = next;
    if (!inBounds(p, b)) return;
  }
}

function buildStreams(sampler, portals, b) {
  const pos = [];
  let maxR = 0.5;
  for (const p of portals) maxR = Math.max(maxR, p.radius);
  const step = 0.04 * maxR;
  for (const p of portals) {
    for (let k = 0; k < 12; k++) {
      const th = (k / 12) * 2 * Math.PI;
      for (const zOff of [0.08, -0.08]) {
        const r = p.radius * 1.1;
        const seed = fromLocal(p, { x: r * Math.cos(th), y: r * Math.sin(th), z: zOff * p.radius });
        trace(sampler, seed, step, 120, +1, b, pos);
        trace(sampler, seed, step, 120, -1, b, pos);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb48ead, transparent: true, opacity: 0.6 }));
}

export class FieldViz {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.objects = [];
  }

  clear() {
    for (const o of this.objects) {
      this.group.remove(o);
      o.geometry.dispose();
      o.material.map?.dispose();
      o.material.dispose();
    }
    this.objects = [];
  }

  /** sampler: { field(x) → E_CF, potential(x) → Φ total, geff(x) }. */
  rebuild(sampler, fieldSystem, opts) {
    this.clear();
    const b = computeBounds(fieldSystem.portals);
    const g = fieldSystem.background.g;
    if (opts.arrows) this.objects.push(buildArrows(sampler, b, g));
    if (opts.slice) this.objects.push(buildSlice(sampler, b, g, opts));
    if (opts.streams) this.objects.push(buildStreams(sampler, fieldSystem.portals, b));
    for (const o of this.objects) this.group.add(o);
  }
}