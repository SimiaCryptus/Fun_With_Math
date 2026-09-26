import { L } from './voxels.js';
import { key, DIRS, worldInvInertia } from './clusters.js';
import { add, sub, scale, cross, dot, len, norm, mv, mtv, quatToMat } from './math.js';

const E = 0.2, MU = 0.6, SLOP = 0.02;

export function solveContacts(world, list) {
  const dt = world.dt, vox = world.vox;
  const sorted = list.slice().sort((a, b) => (a.X[0] - a.rad) - (b.X[0] - b.rad) || a.id - b.id);
  const seen = new Set();
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (b.X[0] - b.rad > a.X[0] + a.rad) break;
      const d = len(sub(a.X, b.X));
      if (d > a.rad + b.rad) continue;
      const big = a.voxels.size >= b.voxels.size ? a : b, small = big === a ? b : a;
      const pk = Math.min(a.id, b.id) + ':' + Math.max(a.id, b.id);
      seen.add(pk);
      const Rb = quatToMat(big.q), Rs = quatToMat(small.q);
      let cnt = 0, pSum = [0, 0, 0], nSum = [0, 0, 0], pen = 0, vS = -1, vB = -1;
      for (const id of small.voxels) {
        const x = vox.x[id], y = vox.y[id], z = vox.z[id];
        let interior = true;
        for (const dd of DIRS) if (!small.occ.has(key(x + dd[0], y + dd[1], z + dd[2]))) { interior = false; break; }
        if (interior) continue;
        const pw = add(small.X, mv(Rs, [x * L - small.com[0], y * L - small.com[1], z * L - small.com[2]]));
        const pl = add(mtv(Rb, sub(pw, big.X)), big.com);
        const cx = Math.round(pl[0] / L), cy = Math.round(pl[1] / L), cz = Math.round(pl[2] / L);
        for (let t = -1; t < 6; t++) {
          const ox = t < 0 ? 0 : DIRS[t][0], oy = t < 0 ? 0 : DIRS[t][1], oz = t < 0 ? 0 : DIRS[t][2];
          const hit = big.occ.get(key(cx + ox, cy + oy, cz + oz));
          if (hit === undefined) continue;
          const dl = [pl[0] - (cx + ox) * L, pl[1] - (cy + oy) * L, pl[2] - (cz + oz) * L];
          const dist = len(dl);
          if (dist >= L) continue;
          const nb = dist > 1e-9 ? scale(dl, 1 / dist) : [0, 0, 1];
          nSum = add(nSum, mv(Rb, nb)); pSum = add(pSum, pw); cnt++;
          if (L - dist > pen) { pen = L - dist; vS = id; vB = hit; }
        }
      }
      if (!cnt) { world.contactTimers.delete(pk); continue; }
      const n = norm(nSum), pt = scale(pSum, 1 / cnt);
      const A = small, B = big;
      const rA = sub(pt, A.X), rB = sub(pt, B.X);
      const IA = worldInvInertia(A), IB = worldInvInertia(B);
      const vel = () => sub(add(A.V, cross(A.w, rA)), add(B.V, cross(B.w, rB)));
      const kOf = (dir) => 1 / A.M + 1 / B.M + dot(dir, cross(mv(IA, cross(rA, dir)), rA)) + dot(dir, cross(mv(IB, cross(rB, dir)), rB));
      const apply = (J) => {
        A.V = add(A.V, scale(J, 1 / A.M)); A.w = add(A.w, mv(IA, cross(rA, J)));
        B.V = sub(B.V, scale(J, 1 / B.M)); B.w = sub(B.w, mv(IB, cross(rB, J)));
      };
      let vr = vel(); const vn = dot(vr, n);
      let Jtot = [0, 0, 0];
      if (vn < 0) {
        const e = vn < -0.01 ? E : 0;
        const jn = -(1 + e) * vn / kOf(n);
        const Jn = scale(n, jn); apply(Jn); Jtot = add(Jtot, Jn);
        vr = vel();
        const vt = sub(vr, scale(n, dot(vr, n))); const tl = len(vt);
        if (tl > 1e-9) {
          const t = scale(vt, 1 / tl);
          const jt = Math.min(tl / kOf(t), MU * jn);
          const Jt = scale(t, -jt); apply(Jt); Jtot = add(Jtot, Jt);
        }
      }
      const corr = Math.max(pen - SLOP, 0) * 0.2, mt = A.M + B.M;
      A.X = add(A.X, scale(n, corr * B.M / mt)); B.X = sub(B.X, scale(n, corr * A.M / mt));
      if (vS >= 0) {
        const F = scale(Jtot, 1 / dt);
        A.contactF.push([vS, F]); B.contactF.push([vB, scale(F, -1)]);
        A.stressActive = B.stressActive = true;
        A.sleeping = B.sleeping = false;
      }
      // resting-contact merge timer
      const rel = len(vel());
      if (rel < 1e-3) {
        const t = (world.contactTimers.get(pk) || 0) + dt;
        world.contactTimers.set(pk, t);
        if (t > 2) world.pendingMerges.push([a.id, b.id]);
      } else world.contactTimers.delete(pk);
    }
  }
  for (const k of [...world.contactTimers.keys()]) if (!seen.has(k)) world.contactTimers.delete(k);
}