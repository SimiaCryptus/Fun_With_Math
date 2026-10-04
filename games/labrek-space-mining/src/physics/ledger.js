// Diagnostics ledger (physics.md §A.10). Inertial K, P, L from frame state.
// W_grav and heat terms join when gravity/ and thermal.js land.
import { v3, m3, quat } from './math.js';

const _W = v3.create(), _Lb = v3.create(), _t = v3.create();

export function measure(world, out = {}) {
  const f = world.frame, Om = f.Om;
  const P = out.P || (out.P = v3.create()), L = out.L || (out.L = v3.create());
  const PI = out.PI || (out.PI = v3.create()), LI = out.LI || (out.LI = v3.create());
  v3.zero(P); v3.zero(L);
  let K = 0, M = 0;
  for (const c of world.clusters) {
    if (!c.alive || !(c.M > 0)) continue;
    v3.cross(_W, Om, c.X); v3.add(_W, _W, c.U);
    K += 0.5 * c.M * v3.dot(_W, _W);
    m3.mulV(_Lb, c.Ib, c.wb);
    K += 0.5 * v3.dot(c.wb, _Lb);
    quat.rotate(_t, c.q, _Lb); v3.add(L, L, _t);
    v3.cross(_t, c.X, _W); v3.addScaled(L, L, _t, c.M);
    v3.addScaled(P, P, _W, c.M);
    M += c.M;
  }
  const Pp = world.particles;
  if (Pp) {
    const x = v3.create(), u = v3.create();
    for (let i = 0; i < Pp.hi; i++) {
      if (!Pp.alive[i]) continue;
      const m = Pp.m[i];
      v3.set(x, Pp.x[3 * i], Pp.x[3 * i + 1], Pp.x[3 * i + 2]);
      v3.set(u, Pp.u[3 * i], Pp.u[3 * i + 1], Pp.u[3 * i + 2]);
      v3.cross(_W, Om, x); v3.add(_W, _W, u);
      K += 0.5 * m * v3.dot(_W, _W);
      v3.cross(_t, x, _W); v3.addScaled(L, L, _t, m);
      v3.addScaled(P, P, _W, m);
      M += m;
    }
  }
  quat.rotate(PI, f.qf, P);
  quat.rotate(LI, f.qf, L);
  out.K = K; out.M = M;
  out.Eheat = world.Eheat || 0;
  out.escapedM = world.escapedM || 0;
  out.escapedE = world.escapedE || 0;
  return out;
}