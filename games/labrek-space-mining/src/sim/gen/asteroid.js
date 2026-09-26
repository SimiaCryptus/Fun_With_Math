import { createNoise3D } from '../../../vendor/simplex-noise/simplex-noise.js';
import { mulberry32, hashString, range } from '../rng.js';
import { L, MAT, MATERIALS } from '../voxels.js';
import { updateMassProps } from '../clusters.js';
import { evaluateStress } from '../stress.js';
import { PI, jacobiEigen, mv, norm, len } from '../math.js';

const POROSITY = { rubble: 0.4, monolith: 0.05, stratified: 0.18, cometary: 0.55, metal: 0.03, binary: 0.25 };

export function breakupPeriod(G, M, R) { return 2 * PI * Math.sqrt(R * R * R / (G * M)); }

export function generateAsteroid(world, { seed = 'labrek', cls = 'rubble', radius = 24 } = {}) {
  const rng = mulberry32(hashString(seed + '|' + cls));
  const noise = createNoise3D(rng), noise2 = createNoise3D(rng);
  const R0 = radius / L;
  const ax = [R0, R0 * range(rng, 0.7, 1), R0 * range(rng, 0.55, 0.9)];
  const lobes = cls === 'binary'
    ? [{ c: [-R0 * 0.55, 0, 0], s: 0.6 }, { c: [R0 * 0.6, 0, 0], s: 0.5 }]
    : [{ c: [0, 0, 0], s: 1 }];
  const boulders = [];
  if (cls === 'rubble') {
    for (let t = 0; t < 400 && boulders.length < 40; t++) {
      const p = [range(rng, -1, 1) * ax[0], range(rng, -1, 1) * ax[1], range(rng, -1, 1) * ax[2]];
      const r = range(rng, 1.5, R0 * 0.3);
      if (boulders.every((b) => len([p[0] - b.p[0], p[1] - b.p[1], p[2] - b.p[2]]) > b.r + r)) boulders.push({ p, r });
    }
  }
  const craters = [];
  for (let i = 0; i < 4; i++) {
    const d = norm([range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)]);
    craters.push({ p: [d[0] * ax[0] * 1.05, d[1] * ax[1] * 1.05, d[2] * ax[2] * 1.05], r: range(rng, 0.15, 0.35) * R0 });
  }
  const strataN = norm([range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)]);
  const por = POROSITY[cls] ?? 0.2;
  const c = world.newCluster();
  const n = Math.ceil(R0 * 1.8) + 2;
  for (let x = -n; x <= n; x++) for (let y = -n; y <= n; y++) for (let z = -n; z <= n; z++) {
    let inside = false, lobeIdx = 0, rr = 1;
    for (let li = 0; li < lobes.length; li++) {
      const lb = lobes[li];
      const dx = (x - lb.c[0]) / (ax[0] * lb.s), dy = (y - lb.c[1]) / (ax[1] * lb.s), dz = (z - lb.c[2]) / (ax[2] * lb.s);
      const r2 = dx * dx + dy * dy + dz * dz + 0.22 * noise(x * 0.12, y * 0.12, z * 0.12) + 0.08 * noise(x * 0.35, y * 0.35, z * 0.35);
      if (r2 < 1) { inside = true; lobeIdx = li; rr = r2; break; }
    }
    if (!inside) continue;
    if (craters.some((cr) => (x - cr.p[0]) ** 2 + (y - cr.p[1]) ** 2 + (z - cr.p[2]) ** 2 < cr.r * cr.r)) continue;
    let mat = MAT.REG, fill = 1, ss = 1;
    const nz = noise2(x * 0.2, y * 0.2, z * 0.2);
    switch (cls) {
      case 'rubble': {
        const inB = boulders.some((b) => (x - b.p[0]) ** 2 + (y - b.p[1]) ** 2 + (z - b.p[2]) ** 2 < b.r * b.r);
        mat = inB ? (nz > 0.6 ? MAT.CAR : MAT.SIL) : MAT.REG; fill = inB ? 1 : 1 - por; break;
      }
      case 'monolith': mat = rr > 0.8 ? MAT.REG : MAT.SIL; break;
      case 'stratified': {
        const s = Math.floor((x * strataN[0] + y * strataN[1] + z * strataN[2]) / 2.5 + 100) % 3;
        mat = [MAT.SIL, MAT.REG, MAT.NFE][s]; if (mat === MAT.REG) fill = 1 - por; break;
      }
      case 'cometary': mat = rr < 0.55 ? MAT.ICE : (nz > 0.3 ? MAT.CAR : MAT.REG); fill = 1 - por * 0.6; break;
      case 'metal': mat = nz > 0.55 ? MAT.SIL : MAT.NFE; break;
      case 'binary': {
        mat = lobeIdx === 0 ? MAT.SIL : (nz > 0 ? MAT.SIL : MAT.REG);
        if (Math.abs(x - (lobes[0].c[0] + lobes[1].c[0]) / 2) < 2) { mat = MAT.REG; ss = 0.3; }
        if (rr > 0.85) mat = MAT.REG;
        break;
      }
    }
    world.addVoxel(c, x, y, z, mat, fill, ss);
  }
  for (const id of c.voxels) world.bondNeighbors(c, id);
  updateMassProps(world, c);
  if (c.gridJob) world.buildGridSync(c);

  // initial spin
  const { vals, vecs } = jacobiEigen(c.Ib);
  let k = 0; if (vals[1] > vals[k]) k = 1; if (vals[2] > vals[k]) k = 2;
  let axis = [vecs[k], vecs[3 + k], vecs[6 + k]];
  if (rng() < 0.2) axis = norm([range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)]);
  const Reff = radius;
  const Pb = breakupPeriod(world.G, c.M, Reff);
  const period = Math.max(range(rng, 3, 12) * 3600, 1.2 * Pb);
  c.w = mv([1, 0, 0, 0, 1, 0, 0, 0, 1], axis.map((a) => a * 2 * PI / period));

  settle(world, c);

  const counts = {};
  for (const id of c.voxels) { const m = MATERIALS[world.vox.mat[id]].id; counts[m] = (counts[m] || 0) + 1; }
  const [a0, a1, a2, b0, b1, b2] = c.aabb;
  return {
    seed, cls, mass: c.M, voxels: c.voxels.size,
    dims: [(b0 - a0 + 1) * L, (b1 - a1 + 1) * L, (b2 - a2 + 1) * L],
    period, breakup: breakupPeriod(world.G, c.M, Reff),
    escape: Math.sqrt(2 * world.G * c.M / Reff), materials: counts,
  };
}

// Break anything that fails under self-gravity + spin, keep the largest body.
export function settle(world, c) {
  for (let it = 0; it < 3; it++) {
    c.A = [0, 0, 0]; c.alpha = [0, 0, 0]; c.gExt = [0, 0, 0];
    const bad = evaluateStress(world, c, new Map(), 0);
    if (!bad.length) break;
    for (const { bond } of bad) world.bonds.kill(bond);
    const before = new Set(world.clusters.keys());
    world.splitCluster(c);
    for (const id of world.clusters.keys()) if (!before.has(id)) {
      const o = world.clusters.get(id);
      for (const v of [...o.voxels]) world.removeVoxel(v);
      world.clusters.delete(id);
    }
    // drop any particles created from demoted fragments
    const p = world.particles; for (let i = 0; i < p.top; i++) if (p.alive[i]) p.kill(i);
    updateMassProps(world, c);
    if (c.gridJob) world.buildGridSync(c);
  }
  for (let b = 0; b < world.bonds.top; b++) world.bonds.damage[b] = 0;
  world.events = [];
}