import { World } from './world.js';
import { generateAsteroid } from './gen/asteroid.js';
import { MAT, L } from './voxels.js';
import { key, worldPos } from './clusters.js';
import { add, sub, scale, norm, len, mtv, quatToMat, PI } from './math.js';

let world = null, survey = null, paused = false, warp = 1, timer = null, engine = null;
const WARPS = [1, 10, 100]; // ≥1000× needs quiescence detection (M5)
const sentOrder = new Map();

function largest() { let b = null; for (const c of world.clusters.values()) if (!b || c.M > b.M) b = c; return b; }
self.onerror = (e) => { self.postMessage({ type: 'error', message: String(e.message || e) }); };


self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    world = new World({ seed: 1, G: 6.674e-11 * (m.gmul || 1) });
    survey = generateAsteroid(world, { seed: m.seed, cls: m.cls, radius: m.radius });
    sentOrder.clear(); engine = null;
    for (const c of world.clusters.values()) c.dirty = true;
    self.postMessage({ type: 'survey', survey, gmul: m.gmul || 1 });
    if (!timer) timer = setInterval(loop, 16);
  } else if (m.type === 'pause') paused = !paused;
  else if (m.type === 'warp') { const i = Math.max(0, Math.min(WARPS.length - 1, WARPS.indexOf(warp) + m.dir)); warp = WARPS[i]; }
  else if (m.type === 'cmd' && world) command(m.cmd);
};

function surfaceVoxel(c, dir) {
  const v = world.vox; let best = -1, bd = -1e9;
  for (const id of c.voxels) {
    const d = (v.x[id] * L - c.com[0]) * dir[0] + (v.y[id] * L - c.com[1]) * dir[1] + (v.z[id] * L - c.com[2]) * dir[2];
    if (d > bd) { bd = d; best = id; }
  }
  return best;
}

function command(cmd) {
   if (!world) return;
   const c = largest(); if (!c) return;
  if (cmd === 'engine') {
    const id = surfaceVoxel(c, [1, 0, 0]);
    world.addForce(id, [-50000, 0, 0]); engine = id;
    world.emit('engine', { voxel: id, mat: world.vox.mat[id] });
  } else if (cmd === 'engineOff') { world.extForces = []; engine = null; }
  else if (cmd === 'spin') { c.w = scale(c.w, 1.25); c.stressActive = true; world.emit('spin', { cluster: c.id }); }
  else if (cmd === 'throw') {
    const nc = world.newCluster();
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) world.addVoxel(nc, x, y, z, MAT.SIL, 1);
    for (const id of nc.voxels) world.bondNeighbors(nc, id);
    nc.X = add(c.X, [0, c.rad + 20, 0]); nc.V = add(c.V, [0, -0.3, 0]);
    world.emit('throw', { cluster: nc.id });
  } else if (cmd === 'dust') {
    const R = quatToMat(c.q), id = surfaceVoxel(c, [0, 0, 1]);
    const p = worldPos(world.vox, c, id, R);
    for (let i = 0; i < 300; i++) {
      const d = norm([world.rng() - 0.5, world.rng() - 0.5, world.rng() + 0.2]);
      world.particles.spawn(add(p, scale(d, 2.5)), add(c.V, scale(d, 0.005 + 0.1 * world.rng())), 5, MAT.REG);
    }
  }
}

function loop() {
  if (!world) return;
  const t0 = performance.now();
  let steps = 0;
  if (!paused) while (steps < warp && performance.now() - t0 < 12) { world.step(); steps++; }
  post(steps);
}

function post(steps) {
  const clusters = [], transfer = [];
  const sendStress = world.tick % 10 === 0;
  const main = largest();
  for (const c of world.clusters.values()) {
    const rec = { id: c.id, X: c.X, q: c.q, V: c.V, w: c.w, M: c.M, n: c.voxels.size, rad: c.rad };
    const v = world.vox;
    if (c.dirty || !sentOrder.has(c.id)) {
      const ids = [...c.voxels]; sentOrder.set(c.id, ids);
      const n = ids.length, pos = new Int16Array(n * 3), mat = new Uint8Array(n);
      ids.forEach((id, i) => { pos[i * 3] = v.x[id]; pos[i * 3 + 1] = v.y[id]; pos[i * 3 + 2] = v.z[id]; mat[i] = v.mat[id]; });
      rec.voxels = { pos, mat, com: c.com }; transfer.push(pos.buffer, mat.buffer);
      c.dirty = false;
    }
    if (sendStress || rec.voxels) {
      const ids = sentOrder.get(c.id), s = new Float32Array(ids.length);
      ids.forEach((id, i) => { s[i] = v.alive[id] ? v.stress[id] : 0; });
      rec.stress = s; transfer.push(s.buffer);
    }
    clusters.push(rec);
  }
  for (const id of [...sentOrder.keys()]) if (!world.clusters.has(id)) sentOrder.delete(id);
  const P = world.particles, pp = new Float32Array(P.count * 3);
  let k = 0;
  for (let i = 0; i < P.top; i++) if (P.alive[i]) { pp[k++] = P.p[i * 3]; pp[k++] = P.p[i * 3 + 1]; pp[k++] = P.p[i * 3 + 2]; }
  transfer.push(pp.buffer);
  let hud = null;
  if (main) {
    const wl = len(main.w);
    hud = {
      id: main.id, M: main.M, n: main.voxels.size, rad: main.rad,
      period: wl > 0 ? 2 * PI / wl : Infinity, w: main.w, wb: mtv(quatToMat(main.q), main.w),
      vesc: Math.sqrt(2 * world.G * main.M / main.rad), clusters: world.clusters.size,
      particles: P.count, grid: !!main.grid, gridBuilding: !!main.gridJob,
      L: world.totals().L, dv: world.dvBooked,
    };
  }
  self.postMessage({ type: 'snap', tick: world.tick, time: world.time, warp, paused, steps, clusters, particles: pp, hud, events: world.events }, transfer);
  world.events = [];
}