import { L, VoxelStore } from './voxels.js';
import { BondStore, BT, addCohesion } from './bonds.js';
import { makeCluster, updateMassProps, key, DIRS, worldPos, angMom, worldInertia } from './clusters.js';
import { clusterGravity, startGridJob, stepGridJob } from './gravity.js';
import { solveContacts } from './contacts.js';
import { evaluateStress } from './stress.js';
import { ParticlePool } from './particles.js';
import { mulberry32 } from './rng.js';
import { add, sub, scale, cross, len, mv, mtv, mm, mt, madd, msub, mscale, skew, inv3, qmul, qnorm, quatToMat } from './math.js';

export const N_BREAK = 256;

export class World {
  constructor({ seed = 1, G = 6.674e-11, gridThreshold = 2000 } = {}) {
    this.G = G; this.rng = mulberry32(seed);
    this.vox = new VoxelStore(); this.bonds = new BondStore(this.vox);
    this.clusters = new Map(); this.nextId = 1;
    this.particles = new ParticlePool();
    this.dt = 1 / 60; this.tick = 0; this.time = 0;
    this.gridThreshold = gridThreshold; this.gridCellsPerStep = 1500;
    this.stressEvery = 30; this.escapeBound = 20000;
    this.extForces = []; // {voxel, Fb (body frame), until}
    this.contactTimers = new Map(); this.pendingMerges = [];
    this.events = []; this.dvBooked = [0, 0, 0]; this.systemMass0 = 0;
  }
  newCluster() { const c = makeCluster(this.nextId++); this.clusters.set(c.id, c); return c; }
  scheduleGrid(c) { startGridJob(this, c); }
  buildGridSync(c) { if (!c.gridJob) startGridJob(this, c); while (!stepGridJob(c, 1e9)); }
  emit(type, data) { this.events.push({ tick: this.tick, type, ...data }); }

  addVoxel(c, x, y, z, mat, fill = 1, strengthScale = 1) {
    const k = key(x, y, z); if (c.occ.has(k)) return -1;
    const id = this.vox.alloc(x, y, z, mat, this.rng, fill, strengthScale);
    if (id < 0) return -1;
    this.vox.cluster[id] = c.id; c.voxels.add(id); c.occ.set(k, id);
    c.massDirty = true; c.dirty = true; c.topoChanged = true;
    return id;
  }
  bondNeighbors(c, id) {
    const v = this.vox;
    for (const d of DIRS) {
      if (d[0] + d[1] + d[2] < 0) continue; // each pair once when bonding a whole body
      const o = c.occ.get(key(v.x[id] + d[0], v.y[id] + d[1], v.z[id] + d[2]));
      if (o !== undefined) addCohesion(v, this.bonds, id, o);
    }
  }
  bondAllNeighbors(c, id) {
    const v = this.vox;
    for (const d of DIRS) {
      const o = c.occ.get(key(v.x[id] + d[0], v.y[id] + d[1], v.z[id] + d[2]));
      if (o === undefined) continue;
      if (v.adj[id].some((b) => this.bonds.other(b, id) === o)) continue;
      addCohesion(v, this.bonds, id, o);
    }
  }
  removeVoxel(id) {
    const v = this.vox, c = this.clusters.get(v.cluster[id]);
    for (const b of v.adj[id].slice()) this.bonds.kill(b);
    if (c) { c.voxels.delete(id); c.occ.delete(key(v.x[id], v.y[id], v.z[id])); c.massDirty = true; c.dirty = true; c.topoChanged = true; }
    v.release(id);
  }
  voxelToParticle(id, c, R) {
    const p = worldPos(this.vox, c, id, R);
    const vel = add(c.V, cross(c.w, sub(p, c.X)));
    this.particles.spawn(p, vel, this.vox.mass[id], this.vox.mat[id]);
    this.removeVoxel(id);
  }
  bookEscape(momentum) {
    const M = this.systemMass0 || 1;
    this.dvBooked = add(this.dvBooked, scale(momentum, 1 / M));
  }
  addForce(voxel, Fb, duration = Infinity) { this.extForces.push({ voxel, Fb, until: this.time + duration }); }

  step() {
    const dt = this.dt;
    for (const c of this.clusters.values()) if (c.massDirty) updateMassProps(this, c);
    for (const [id, c] of this.clusters) if (c.voxels.size === 0) this.clusters.delete(id);
    const list = [...this.clusters.values()];
    if (!this.systemMass0) this.systemMass0 = list.reduce((s, c) => s + c.M, 0);

    // grid time slicing (one job per step, lowest id first)
    for (const c of list) if (c.gridJob) { stepGridJob(c, this.gridCellsPerStep); break; }

    clusterGravity(this, list);
    const extMaps = new Map();
    this.extForces = this.extForces.filter((f) => f.until > this.time && this.vox.alive[f.voxel]);
    for (const f of this.extForces) {
      const c = this.clusters.get(this.vox.cluster[f.voxel]); if (!c) continue;
      const R = quatToMat(c.q), Fw = mv(R, f.Fb);
      c.F = add(c.F, Fw);
      c.T = add(c.T, cross(sub(worldPos(this.vox, c, f.voxel, R), c.X), Fw));
      if (!extMaps.has(c.id)) extMaps.set(c.id, new Map());
      const m = extMaps.get(c.id); m.set(f.voxel, add(m.get(f.voxel) || [0, 0, 0], Fw));
      c.stressActive = true;
    }
    for (const c of list) { c.V0 = c.V.slice(); c.w0 = c.w.slice(); c.contactF = []; }

    solveContacts(this, list);

    for (const c of list) this.integrate(c, dt);
    this.particles.step(this, list);

    // stress + fracture
    let cands = [];
    for (const c of list) {
      const due = (this.tick + c.id) % this.stressEvery === 0;
      if (!c.stressActive && !due) continue;
      const m = extMaps.get(c.id) || new Map();
      for (const [vid, F] of c.contactF) m.set(vid, add(m.get(vid) || [0, 0, 0], F));
      const since = c.lastStress < 0 ? dt : (this.tick - c.lastStress) * dt;
      c.lastStress = this.tick;
      cands = cands.concat(evaluateStress(this, c, m, since));
      c.stressActive = false;
    }
    if (cands.length) {
      cands.sort((a, b) => b.ratio - a.ratio || a.bond - b.bond);
      const affected = new Set();
      for (const { bond } of cands.slice(0, N_BREAK)) {
        affected.add(this.vox.cluster[this.bonds.a[bond]]);
        this.bonds.kill(bond);
      }
      this.emit('fracture', { bonds: Math.min(cands.length, N_BREAK) });
      for (const cid of [...affected].sort((a, b) => a - b)) {
        const c = this.clusters.get(cid); if (c) { c.stressActive = true; this.splitCluster(c); }
      }
    }

    // merges
    const merges = this.pendingMerges; this.pendingMerges = [];
    for (const [a, b] of merges) {
      const A = this.clusters.get(a), B = this.clusters.get(b);
      if (A && B) this.mergeClusters(A, B);
    }

    this.recenter();
    this.tick++; this.time += dt;
  }

  integrate(c, dt) {
    c.V = add(c.V, scale(c.F, dt / c.M));
    c.X = add(c.X, scale(c.V, dt));
    const R = quatToMat(c.q);
    // implicit gyroscopic (Catto), body frame
    let wb = mtv(R, c.w);
    const Ibw = mv(c.Ib, wb);
    const f = scale(cross(wb, Ibw), dt);
    const J = madd(c.Ib, mscale(msub(mm(skew(wb), c.Ib), skew(Ibw)), dt));
    wb = sub(wb, mv(inv3(J), f));
    wb = add(wb, mv(c.IbInv, scale(mtv(R, c.T), dt)));
    c.w = mv(R, wb);
    const dq = qmul([0, c.w[0], c.w[1], c.w[2]], c.q);
    c.q = qnorm(c.q.map((x, i) => x + 0.5 * dq[i] * dt));
    c.A = scale(sub(c.V, c.V0), 1 / dt);
    c.alpha = scale(sub(c.w, c.w0), 1 / dt);
  }

  splitCluster(c) {
    const vox = this.vox, bonds = this.bonds;
    const seen = new Set(), comps = [];
    for (const id of c.voxels) {
      if (seen.has(id)) continue;
      const comp = [id]; seen.add(id);
      for (let h = 0; h < comp.length; h++) {
        const u = comp[h];
        for (const b of vox.adj[u]) {
          if (bonds.type[b] === BT.CABLE) continue;
          const o = bonds.other(b, u);
          if (!seen.has(o) && vox.cluster[o] === c.id) { seen.add(o); comp.push(o); }
        }
      }
      comps.push(comp);
    }
    if (comps.length <= 1) return;
    comps.sort((a, b) => b.length - a.length || a[0] - b[0]);
    const R = quatToMat(c.q), X = c.X, V = c.V, w = c.w;
    const vesc = Math.sqrt(2 * this.G * c.M / c.rad);
    for (let k = 1; k < comps.length; k++) {
      const comp = comps[k];
      let m = 0, s = [0, 0, 0];
      for (const id of comp) { const p = worldPos(vox, c, id, R); m += vox.mass[id]; s = add(s, scale(p, vox.mass[id])); }
      const Xn = scale(s, 1 / m), Vn = add(V, cross(w, sub(Xn, X)));
      if (comp.length <= 4 && len(sub(Vn, V)) > vesc) {
        for (const id of comp) this.voxelToParticle(id, c, R);
        continue;
      }
      const nc = this.newCluster();
      for (const id of comp) {
        c.voxels.delete(id); c.occ.delete(key(vox.x[id], vox.y[id], vox.z[id]));
        nc.voxels.add(id); nc.occ.set(key(vox.x[id], vox.y[id], vox.z[id]), id); vox.cluster[id] = nc.id;
      }
      nc.q = c.q.slice(); nc.w = w.slice();
      updateMassProps(this, nc);
      nc.X = Xn; nc.V = Vn; nc.stressActive = true;
    }
    c.topoChanged = true;
    updateMassProps(this, c);
    this.emit('split', { cluster: c.id, parts: comps.length });
  }

  mergeClusters(A, B) {
    if (B.voxels.size > A.voxels.size) [A, B] = [B, A];
    const vox = this.vox;
    const P = add(scale(A.V, A.M), scale(B.V, B.M));
    const Lt = add(angMom(A), angMom(B));
    const Ra = quatToMat(A.q), Rb = quatToMat(B.q);
    const moved = [];
    for (const id of [...B.voxels]) {
      const pw = worldPos(vox, B, id, Rb);
      const pl = add(mtv(Ra, sub(pw, A.X)), A.com);
      const x = Math.round(pl[0] / L), y = Math.round(pl[1] / L), z = Math.round(pl[2] / L);
      const k = key(x, y, z);
      B.voxels.delete(id); B.occ.delete(key(vox.x[id], vox.y[id], vox.z[id]));
      if (A.occ.has(k)) { // collision on re-lattice: eject as particle (mass-conserving)
        this.particles.spawn(pw, add(B.V, cross(B.w, sub(pw, B.X))), vox.mass[id], vox.mat[id]);
        for (const b of vox.adj[id].slice()) this.bonds.kill(b);
        vox.release(id); continue;
      }
      vox.x[id] = x; vox.y[id] = y; vox.z[id] = z; vox.cluster[id] = A.id;
      A.voxels.add(id); A.occ.set(k, id); moved.push(id);
    }
    for (const id of moved) this.bondAllNeighbors(A, id);
    this.clusters.delete(B.id);
    A.topoChanged = true; updateMassProps(this, A);
    A.V = scale(P, 1 / A.M);
    A.w = mv(inv3(worldInertia(A)), sub(Lt, cross(A.X, scale(A.V, A.M))));
    this.emit('merge', { into: A.id, from: B.id });
  }

  recenter() {
    let M = 0, b = [0, 0, 0];
    for (const c of this.clusters.values()) { M += c.M; b = add(b, scale(c.X, c.M)); }
    if (!M) return; b = scale(b, 1 / M);
    if (len(b) < 1000) return;
    for (const c of this.clusters.values()) c.X = sub(c.X, b);
    const p = this.particles;
    for (let i = 0; i < p.top; i++) if (p.alive[i]) { p.p[i * 3] -= b[0]; p.p[i * 3 + 1] -= b[1]; p.p[i * 3 + 2] -= b[2]; }
  }

  totals() {
    let P = [0, 0, 0], Lm = [0, 0, 0], M = 0;
    for (const c of this.clusters.values()) { P = add(P, scale(c.V, c.M)); Lm = add(Lm, angMom(c)); M += c.M; }
    return { P, L: Lm, M };
  }

  stateHash() {
    let h = 2166136261 >>> 0;
    const buf = new Float64Array(1), u8 = new Uint8Array(buf.buffer);
    const mix = (x) => { buf[0] = x; for (let i = 0; i < 8; i++) h = Math.imul(h ^ u8[i], 16777619) >>> 0; };
    for (const c of [...this.clusters.values()].sort((a, b) => a.id - b.id)) {
      mix(c.id); mix(c.voxels.size); [...c.X, ...c.V, ...c.q, ...c.w].forEach(mix);
    }
    return h.toString(16);
  }
}