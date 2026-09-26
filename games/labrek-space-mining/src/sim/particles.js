import { L } from './voxels.js';
import { key, applyImpulse } from './clusters.js';
import { gAccel } from './gravity.js';
import { add, sub, scale, cross, dot, len, mv, mtv, quatToMat } from './math.js';

export class ParticlePool {
  constructor(cap = 20000) {
    this.cap = cap;
    this.p = new Float64Array(cap * 3); this.v = new Float64Array(cap * 3);
    this.m = new Float32Array(cap); this.mat = new Uint8Array(cap);
    this.alive = new Uint8Array(cap); this.age = new Float32Array(cap);
    this.count = 0; this.free = []; this.top = 0;
  }
  spawn(p, v, m, mat) {
    let id;
    if (this.free.length) id = this.free.pop();
    else if (this.top < this.cap) id = this.top++;
    else return -1; // TODO: aggregate oldest/slowest into coarser particles
    this.p.set(p, id * 3); this.v.set(v, id * 3);
    this.m[id] = m; this.mat[id] = mat; this.alive[id] = 1; this.age[id] = 0; this.count++;
    return id;
  }
  kill(id) { this.alive[id] = 0; this.free.push(id); this.count--; }

  step(world, list) {
    const dt = world.dt, vox = world.vox, bound = world.escapeBound;
    const Rs = list.map((c) => quatToMat(c.q));
    for (let i = 0; i < this.top; i++) {
      if (!this.alive[i]) continue;
      let p = [this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]];
      let v = [this.v[i * 3], this.v[i * 3 + 1], this.v[i * 3 + 2]];
      let a = [0, 0, 0];
      for (const c of list) a = add(a, gAccel(world, c, p));
      v = add(v, scale(a, dt)); p = add(p, scale(v, dt));
      this.age[i] += dt;
      const m = this.m[i];
      let dead = false;
      for (let k = 0; k < list.length && !dead; k++) {
        const c = list[k];
        const d = sub(p, c.X);
        if (dot(d, d) > c.rad * c.rad) continue;
        const R = Rs[k];
        const pl = add(mtv(R, d), c.com);
        const cx = Math.round(pl[0] / L), cy = Math.round(pl[1] / L), cz = Math.round(pl[2] / L);
        const hit = c.occ.get(key(cx, cy, cz));
        if (hit === undefined) continue;
        const vs = add(c.V, cross(c.w, d));
        const vrel = sub(v, vs);
        const vesc = Math.sqrt(2 * world.G * c.M / c.rad);
        if (len(vrel) < 0.3 * vesc || this.age[i] > 600) {
          // re-deposit: mass + momentum into the hit voxel / cluster
          applyImpulse(c, p, scale(vrel, m * c.M / (c.M + m)));
          vox.mass[hit] += m; vox.fill[hit] = Math.min(1, vox.fill[hit] + m / (vox.mass[hit] / Math.max(vox.fill[hit], 1e-3)));
          c.massDirty = true;
          this.kill(i); dead = true; break;
        }
        const dl = [pl[0] - cx * L, pl[1] - cy * L, pl[2] - cz * L];
        const dn = len(dl);
        const n = mv(R, dn > 1e-9 ? scale(dl, 1 / dn) : [0, 0, 1]);
        const vn = dot(vrel, n);
        if (vn < 0) {
          const vt = sub(vrel, scale(n, vn));
          const nv = add(scale(n, -0.2 * vn), scale(vt, 0.5));
          const dv = sub(nv, vrel);
          applyImpulse(c, p, scale(dv, -m));
          v = add(vs, nv);
        }
        p = add(add(c.X, mv(R, sub([cx * L, cy * L, cz * L], c.com))), scale(n, 0.75 * L));
      }
      if (dead) continue;
      if (len(p) > bound) {
        world.bookEscape(scale(v, m)); this.kill(i); continue;
      }
      this.p.set(p, i * 3); this.v.set(v, i * 3);
    }
  }
}