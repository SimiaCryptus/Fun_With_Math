// Point-mass particle pool (physics.md §A.9 step 6, §A.4.8 of idea.md).
// Same frame translation step as clusters. Gravity/contacts/re-deposition land with gravity/ and contacts.js.
import { quat } from './math.js';
import { translateAt } from './rigid.js';

export function createParticlePool(cap) {
  return {
    cap, hi: 0, count: 0, free: [],
    alive: new Uint8Array(cap),
    x: new Float64Array(3 * cap), u: new Float64Array(3 * cap),
    a: new Float64Array(3 * cap),   // acceleration accumulator (frame), cleared each step
    m: new Float64Array(cap), mat: new Uint8Array(cap), age: new Float64Array(cap),
  };
}

export function spawnParticle(P, x, u, m, mat) {
  let i;
  if (P.free.length) i = P.free.pop();
  else if (P.hi < P.cap) i = P.hi++;
  else return -1;
  P.alive[i] = 1; P.count++;
  for (let k = 0; k < 3; k++) { P.x[3 * i + k] = x[k]; P.u[3 * i + k] = u[k]; P.a[3 * i + k] = 0; }
  P.m[i] = m; P.mat[i] = mat; P.age[i] = 0;
  return i;
}

export function killParticle(P, i) {
  if (!P.alive[i]) return;
  P.alive[i] = 0; P.count--; P.free.push(i);
}

const _W = new Float64Array(3), _WI = new Float64Array(3);
// Escaped momentum is booked in 𝓘 (§A.9 step 11).
function bookEscape(world, i) {
  const P = world.particles, Om = world.frame.Om, o = 3 * i, m = P.m[i];
  const x0 = P.x[o], x1 = P.x[o + 1], x2 = P.x[o + 2];
  _W[0] = P.u[o] + Om[1] * x2 - Om[2] * x1;
  _W[1] = P.u[o + 1] + Om[2] * x0 - Om[0] * x2;
  _W[2] = P.u[o + 2] + Om[0] * x1 - Om[1] * x0;
  quat.rotate(_WI, world.frame.qf, _W);
  for (let k = 0; k < 3; k++) world.escapedP[k] += m * _WI[k];
  world.escapedM += m;
  world.escapedE += 0.5 * m * (_W[0] * _W[0] + _W[1] * _W[1] + _W[2] * _W[2]);
}

export function stepParticles(world) {
  const P = world.particles, f = world.frame, dt = world.params.dt;
  const bound2 = world.params.escapeBound * world.params.escapeBound;
  for (let i = 0; i < P.hi; i++) {
    if (!P.alive[i]) continue;
    const o = 3 * i;
    translateAt(P.x, o, P.u, o, P.a[o], P.a[o + 1], P.a[o + 2], f.Om, f.b, dt);
    P.a[o] = 0; P.a[o + 1] = 0; P.a[o + 2] = 0;
    P.age[i] += dt;
    const r2 = P.x[o] * P.x[o] + P.x[o + 1] * P.x[o + 1] + P.x[o + 2] * P.x[o + 2];
    if (r2 > bound2) { bookEscape(world, i); killParticle(P, i); }
  }
}