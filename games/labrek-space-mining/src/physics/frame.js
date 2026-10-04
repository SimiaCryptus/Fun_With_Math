// Rotating simulation frame 𝓕 (physics.md §A.2).
// Ω is piecewise constant; q_f and the sun vector advance by Cayley maps (no trig).
import { v3, m3, quat, cayleyRotate } from './math.js';
import { primaryCluster } from './clusters.js';

const _d = v3.create(), _t = v3.create(), _w = v3.create(), _Lb = v3.create(), _L = v3.create();
const _tg = v3.create(), _q = new Float64Array(4);

export function createFrame(params) {
  const f = {
    dt: params.dt,
    Om: v3.create(), b: v3.create(),       // Ω and b = ½·dt·Ω
    qstep: quat.create(), qf: quat.create(),
    sun: v3.create(),                       // sun direction seen from 𝓕
    lastRebase: -Infinity, rebases: 0,
  };
  v3.normalize(f.sun, params.sunDir);
  if (params.Omega !== null) setOmega(f, params.Omega);
  return f;
}

export function setOmega(f, Om) {
  v3.copy(f.Om, Om);
  v3.scale(f.b, f.Om, 0.5 * f.dt);
  _q[0] = 1; _q[1] = f.b[0]; _q[2] = f.b[1]; _q[3] = f.b[2];
  quat.normalize(f.qstep, _q);
}

// §A.2.4: q_f ← normalize(q_f ⊗ q_step);  ŝ ← C(b) ŝ  (= R_stepᵀ ŝ)
export function advanceFrame(f) {
  quat.mul(f.qf, f.qf, f.qstep);
  quat.normalize(f.qf, f.qf);
  cayleyRotate(f.sun, f.b, f.sun);
  v3.normalize(f.sun, f.sun);
}

export function toInertial(out, f, v) { return quat.rotate(out, f.qf, v); }
export function toFrame(out, f, v) { return quat.rotateInv(out, f.qf, v); }
// inertial velocity expressed in frame axes: u + Ω × x
export function inertialVelocity(out, f, x, u) {
  v3.cross(_t, f.Om, x);
  return v3.add(out, u, _t);
}

// §A.2.3: instantaneous change of observer. Physical state is unchanged.
export function rebase(world, OmNew) {
  const f = world.frame;
  v3.sub(_d, f.Om, OmNew);
  for (const c of world.clusters) {
    if (!c.alive) continue;
    v3.cross(_t, _d, c.X);
    v3.add(c.U, c.U, _t);
  }
  const P = world.particles;
  if (P) {
    const d0 = _d[0], d1 = _d[1], d2 = _d[2];
    for (let i = 0; i < P.hi; i++) {
      if (!P.alive[i]) continue;
      const x0 = P.x[3 * i], x1 = P.x[3 * i + 1], x2 = P.x[3 * i + 2];
      P.u[3 * i] += d1 * x2 - d2 * x1;
      P.u[3 * i + 1] += d2 * x0 - d0 * x2;
      P.u[3 * i + 2] += d0 * x1 - d1 * x0;
    }
  }
  setOmega(f, OmNew);
  f.lastRebase = world.time; f.rebases++;
  if (world.events) world.events.push({ tick: world.tick, type: 'rebase', Om: [f.Om[0], f.Om[1], f.Om[2]] });
}

// Re-base Ω to the primary's spin when it has drifted (B.10 Q4: invisible to the player;
// the renderer composes q_f so the view is continuous).
export function maybeRebase(world) {
  const f = world.frame, p = world.params;
  const c = primaryCluster(world);
  if (!c || !(c.M > 0)) return false;
  quat.rotate(_w, c.q, c.wb);                       // absolute spin, frame coords
  m3.mulV(_Lb, c.Ib, c.wb); quat.rotate(_L, c.q, _Lb);
  const wl = v3.len(_w), Ll = v3.len(_L);
  let tumbling = false;
  if (wl > 0 && Ll > 0) {
    v3.cross(_t, _w, _L);
    tumbling = v3.len(_t) / (wl * Ll) > p.tumbleTol;
  }
  if (tumbling) {
    if (world.time - f.lastRebase < p.tRebase) return false;
    v3.scale(_tg, _L, v3.dot(_w, _L) / (Ll * Ll)); // mean spin: component of ω along L
  } else v3.copy(_tg, _w);
  v3.sub(_t, _tg, f.Om);
  if (v3.len(_t) * c.rad <= p.uRebase) return false;
  rebase(world, _tg);
  return true;
}