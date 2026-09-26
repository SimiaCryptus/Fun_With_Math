import { L } from './voxels.js';
import { sub, add, scale, cross, dot, mv, mtv, quatToMat } from './math.js';
import { latticePos } from './clusters.js';

// Acceleration at world point p due to cluster src.
export function gAccel(world, src, p) {
  const d = sub(p, src.X);
  const g = src.grid;
  if (g) {
    const R = quatToMat(src.q);
    const pl = add(mtv(R, d), src.com);
    const s = sampleGrid(g, pl);
    if (s) return mv(R, scale(s, world.G));
  }
  const r2 = dot(d, d), r = Math.sqrt(r2);
  if (r < src.rad) return scale(d, -world.G * src.M / (src.rad * src.rad * src.rad));
  return scale(d, -world.G * src.M / (r2 * r));
}

// Pairwise mutual gravity (monopole or grid). Barnes–Hut/quadrupole: TODO (v1 simplification).
export function clusterGravity(world, list) {
  for (const c of list) { c.F = [0, 0, 0]; c.T = [0, 0, 0]; }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    // use the grid of the larger body if it has one
    let src = b, tgt = a;
    if (a.grid && a.voxels.size >= b.voxels.size) { src = a; tgt = b; }
    const F = scale(gAccel(world, src, tgt.X), tgt.M);
    tgt.F = add(tgt.F, F); src.F = sub(src.F, F);
    src.T = add(src.T, cross(sub(tgt.X, src.X), scale(F, -1)));
  }
  for (const c of list) c.gExt = scale(c.F, 1 / c.M);
}

// ---- body-frame grid (values stored without G; lattice-meter coordinates) ----
export function startGridJob(world, c) {
  const v = world.vox, h = 2 * L;
  const [a0, a1, a2, b0, b1, b2] = c.aabb;
  const ext = [(b0 - a0) * L, (b1 - a1) * L, (b2 - a2) * L];
  const pad = ext.map((e) => e * 0.25 + 2 * h);
  const origin = [a0 * L - pad[0], a1 * L - pad[1], a2 * L - pad[2]];
  const n = ext.map((e, i) => Math.ceil((e + 2 * pad[i]) / h) + 1);
  // block lumping (4^3 voxel blocks)
  const blocks = new Map();
  for (const id of c.voxels) {
    const k = ((v.x[id] >> 2) + 8192) * 16384 * 16384 + ((v.y[id] >> 2) + 8192) * 16384 + ((v.z[id] >> 2) + 8192);
    let b = blocks.get(k);
    if (!b) { b = { m: 0, c: [0, 0, 0], ids: [] }; blocks.set(k, b); }
    const m = v.mass[id], p = latticePos(v, id);
    b.m += m; b.c[0] += m * p[0]; b.c[1] += m * p[1]; b.c[2] += m * p[2]; b.ids.push(id);
  }
  const bl = [...blocks.values()].map((b) => ({
    m: b.m, c: scale(b.c, 1 / b.m),
    pts: b.ids.map((id) => [...latticePos(v, id), v.mass[id]]),
  }));
  c.gridJob = { origin, h, n, data: new Float64Array(n[0] * n[1] * n[2] * 3), cursor: 0, blocks: bl, M: c.M };
}

export function stepGridJob(c, budgetCells) {
  const j = c.gridJob; if (!j) return true;
  const total = j.n[0] * j.n[1] * j.n[2];
  const eps2 = (0.6 * L) * (0.6 * L), far2 = (6 * L * 4) * (6 * L * 4) / 4;
  const end = Math.min(total, j.cursor + budgetCells);
  for (let idx = j.cursor; idx < end; idx++) {
    const k = idx % j.n[2], jj = ((idx / j.n[2]) | 0) % j.n[1], i = (idx / (j.n[1] * j.n[2])) | 0;
    const px = j.origin[0] + i * j.h, py = j.origin[1] + jj * j.h, pz = j.origin[2] + k * j.h;
    let gx = 0, gy = 0, gz = 0;
    for (const b of j.blocks) {
      let dx = b.c[0] - px, dy = b.c[1] - py, dz = b.c[2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far2) {
        const inv = b.m / (d2 * Math.sqrt(d2)); gx += dx * inv; gy += dy * inv; gz += dz * inv;
      } else {
        for (const q of b.pts) {
          dx = q[0] - px; dy = q[1] - py; dz = q[2] - pz;
          const r2 = dx * dx + dy * dy + dz * dz + eps2;
          const inv = q[3] / (r2 * Math.sqrt(r2)); gx += dx * inv; gy += dy * inv; gz += dz * inv;
        }
      }
    }
    j.data[idx * 3] = gx; j.data[idx * 3 + 1] = gy; j.data[idx * 3 + 2] = gz;
  }
  j.cursor = end;
  if (end >= total) {
    c.grid = { origin: j.origin, h: j.h, n: j.n, data: j.data };
    c.gridM = j.M; c.gridJob = null;
    return true;
  }
  return false;
}

export function sampleGrid(g, p) {
  const fx = (p[0] - g.origin[0]) / g.h, fy = (p[1] - g.origin[1]) / g.h, fz = (p[2] - g.origin[2]) / g.h;
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= g.n[0] - 1 || j >= g.n[1] - 1 || k >= g.n[2] - 1) return null;
  const tx = fx - i, ty = fy - j, tz = fz - k;
  const out = [0, 0, 0];
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) {
    const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty) * (c ? tz : 1 - tz);
    const idx = (((i + a) * g.n[1] + (j + b)) * g.n[2] + (k + c)) * 3;
    out[0] += w * g.data[idx]; out[1] += w * g.data[idx + 1]; out[2] += w * g.data[idx + 2];
  }
  return out;
}