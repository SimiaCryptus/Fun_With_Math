// Rigid clusters (physics.md §A.6.1–2). Mass properties come from running moments about the
// lattice origin, so add/remove/re-weight is O(1). rebuildMoments() is the exact O(N) pass.
import { v3, m3, quat } from './math.js';
import { packKey, allocVoxel, freeVoxel } from './voxels.js';

const _ds = v3.create(), _dw = v3.create(), _wr = v3.create(), _t = v3.create(), _x = v3.create();

export function createCluster(world) {
  const c = {
    id: world.clusters.length, alive: true,
    X: v3.create(), U: v3.create(), q: quat.create(), wb: v3.create(),
    M: 0, Ib: m3.identity(m3.create()), IbInv: m3.identity(m3.create()),
    s: v3.create(),                          // COM in lattice-origin body coords
    mom0: 0, mom1: v3.create(), mom2: new Float64Array(6), // Σm, Σm p, Σm p pᵀ (xx yy zz xy xz yz)
    bmin: v3.create(Infinity, Infinity, Infinity), bmax: v3.create(-Infinity, -Infinity, -Infinity),
    rad: 0, voxels: [], occ: new Map(),
    F: v3.create(), T: v3.create(),          // real external force / torque about X (frame), per step
    A: v3.create(), alpha: v3.create(),      // last inertial COM accel / absolute angular accel (frame)
    init: false, massDirty: false, dMrel: 0,
  };
  world.clusters.push(c);
  return c;
}

function accumulate(c, P, v, sgn) {
  const m = sgn * P.mass[v], x = P.px[v], y = P.py[v], z = P.pz[v];
  c.mom0 += m;
  c.mom1[0] += m * x; c.mom1[1] += m * y; c.mom1[2] += m * z;
  const s = c.mom2;
  s[0] += m * x * x; s[1] += m * y * y; s[2] += m * z * z;
  s[3] += m * x * y; s[4] += m * x * z; s[5] += m * y * z;
}

function grow(c, P, v) {
  const x = P.px[v], y = P.py[v], z = P.pz[v];
  if (x < c.bmin[0]) c.bmin[0] = x; if (y < c.bmin[1]) c.bmin[1] = y; if (z < c.bmin[2]) c.bmin[2] = z;
  if (x > c.bmax[0]) c.bmax[0] = x; if (y > c.bmax[1]) c.bmax[1] = y; if (z > c.bmax[2]) c.bmax[2] = z;
}

export function addVoxel(world, c, kx, ky, kz, mat, fill = 1) {
  if (kx < -512 || kx > 511 || ky < -512 || ky > 511 || kz < -512 || kz > 511) throw new Error('lattice coordinate out of range');
  const key = packKey(kx, ky, kz);
  if (c.occ.has(key)) return -1;
  const P = world.voxels, h = world.params.h, m = world.mats[mat], h3 = h * h * h;
  const v = allocVoxel(P);
  P.cluster[v] = c.id;
  P.kx[v] = kx; P.ky[v] = ky; P.kz[v] = kz;
  P.px[v] = h * kx; P.py[v] = h * ky; P.pz[v] = h * kz;
  P.mat[v] = mat; P.fill[v] = fill;
  P.mass[v] = m.rho * fill * h3;
  P.vol[v] = m.vol * fill * h3;
  P.temp[v] = world.params.T0;
  P.slot[v] = c.voxels.length; c.voxels.push(v); c.occ.set(key, v);
  accumulate(c, P, v, 1); grow(c, P, v);
  c.massDirty = true; c.dMrel += P.mass[v];
  return v;
}

export function removeVoxel(world, v) {
  const P = world.voxels, c = world.clusters[P.cluster[v]];
  if (!c || !P.alive[v]) throw new Error('removeVoxel: voxel not in a cluster');
  accumulate(c, P, v, -1);
  c.dMrel += P.mass[v];
  c.occ.delete(packKey(P.kx[v], P.ky[v], P.kz[v]));
  const i = P.slot[v], last = c.voxels.pop();
  if (last !== v) { c.voxels[i] = last; P.slot[last] = i; }
  c.massDirty = true;
  freeVoxel(P, v);
}

export function setVoxelMass(world, v, m) {
  const P = world.voxels, c = world.clusters[P.cluster[v]];
  accumulate(c, P, v, -1);
  c.dMrel += m > P.mass[v] ? m - P.mass[v] : P.mass[v] - m;
  P.mass[v] = m;
  accumulate(c, P, v, 1);
  c.massDirty = true;
}

export function rebuildMoments(world, c) {
  const P = world.voxels;
  c.mom0 = 0; v3.zero(c.mom1); c.mom2.fill(0);
  v3.set(c.bmin, Infinity, Infinity, Infinity); v3.set(c.bmax, -Infinity, -Infinity, -Infinity);
  for (const v of c.voxels) { accumulate(c, P, v, 1); grow(c, P, v); }
}

// Recover M, COM, I_b from the moments. When the COM moves, X and U are shifted so every
// material point keeps its frame position and velocity (§A.6.2 steps 3–4).
export function recomputeMassProps(world, c, exact = false) {
  if (exact) rebuildMoments(world, c);
  c.massDirty = false;
  const M = c.mom0, h = world.params.h;
  if (c.voxels.length === 0 || !(M > 0)) {
    c.M = 0; m3.identity(c.Ib); m3.identity(c.IbInv); c.rad = 0;
    return;
  }
  const cx = c.mom1[0] / M, cy = c.mom1[1] / M, cz = c.mom1[2] / M, s = c.mom2;
  const Sxx = s[0] - M * cx * cx, Syy = s[1] - M * cy * cy, Szz = s[2] - M * cz * cz;
  const Sxy = s[3] - M * cx * cy, Sxz = s[4] - M * cx * cz, Syz = s[5] - M * cy * cz;
  const cube = M * h * h / 6;
  const I = c.Ib;
  I[0] = Syy + Szz + cube; I[4] = Sxx + Szz + cube; I[8] = Sxx + Syy + cube;
  I[1] = I[3] = -Sxy; I[2] = I[6] = -Sxz; I[5] = I[7] = -Syz;
  m3.invert(c.IbInv, I);
  if (c.init) {
    v3.set(_ds, cx - c.s[0], cy - c.s[1], cz - c.s[2]);
    if (_ds[0] !== 0 || _ds[1] !== 0 || _ds[2] !== 0) {
      quat.rotate(_dw, c.q, _ds);
      relSpin(world, c, _wr);
      v3.add(c.X, c.X, _dw);
      v3.cross(_t, _wr, _dw); v3.add(c.U, c.U, _t);
    }
  }
  v3.set(c.s, cx, cy, cz);
  c.M = M; c.init = true;
  // conservative bounding radius from the voxel-centre AABB padded by half a voxel
  let r2 = 0;
  const hh = 0.5 * h;
  for (let k = 0; k < 8; k++) {
    const dx = ((k & 1) ? c.bmax[0] + hh : c.bmin[0] - hh) - cx;
    const dy = ((k & 2) ? c.bmax[1] + hh : c.bmin[1] - hh) - cy;
    const dz = ((k & 4) ? c.bmax[2] + hh : c.bmin[2] - hh) - cz;
    const d2 = dx * dx + dy * dy + dz * dz; if (d2 > r2) r2 = d2;
  }
  c.rad = Math.sqrt(r2);
}

export function bodyOffset(world, c, v, out) {
  const P = world.voxels;
  return v3.set(out, P.px[v] - c.s[0], P.py[v] - c.s[1], P.pz[v] - c.s[2]);
}

// frame position x_i = X + R (p_i − s)
export function worldPos(world, c, v, out) {
  bodyOffset(world, c, v, _x);
  quat.rotate(out, c.q, _x);
  return v3.add(out, out, c.X);
}

// ω_r = R ω_b − Ω (frame coords)
export function relSpin(world, c, out) {
  quat.rotate(out, c.q, c.wb);
  return v3.sub(out, out, world.frame.Om);
}

// frame velocity of the material at voxel v: U + ω_r × (x − X)
export function voxelVelocity(world, c, v, out) {
  bodyOffset(world, c, v, _x);
  quat.rotate(_x, c.q, _x);
  relSpin(world, c, out);
  v3.cross(out, out, _x);
  return v3.add(out, out, c.U);
}

export function applyForce(c, point, F) {
  v3.add(c.F, c.F, F);
  v3.sub(_t, point, c.X);
  v3.cross(_t, _t, F);
  v3.add(c.T, c.T, _t);
}

// most massive live cluster; ties → lowest id (deterministic)
export function primaryCluster(world) {
  let best = null;
  for (const c of world.clusters) if (c.alive && (!best || c.M > best.M)) best = c;
  return best;
}