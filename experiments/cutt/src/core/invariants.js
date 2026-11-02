// Runtime assertions for §7 properties (used by the in-app guard and tests).
import { EPS } from './box.js';

export function checkInvariants({ table: T, obs, theories }) {
  const v = [];
  for (let i = 0; i < T.N; i++) {
    let s = 0;
    for (let f = T.start[i]; f < T.start[i + 1]; f++) {
      s += T.pi[f];
      if (!(T.pi[f] > 0)) v.push(`zero-mass fragment ${f} (obs ${i})`);
    }
    if (Math.abs(s - 1) > 1e-9) v.push(`pi does not sum to 1 for obs ${i}`);
    const o = obs[i];
    for (let j = 0; j < o.lo.length; j++) {
      if (o.lo[j] < o.lo0[j] - EPS || o.hi[j] > o.hi0[j] + EPS) v.push(`support grew for obs ${i}`);
      if (o.lo[j] > o.hi[j] + EPS) v.push(`empty support for obs ${i}`);
    }
  }
  for (const th of theories || []) {
    for (let i = 0; i < T.N; i++) {
      let s = 0;
      for (let f = T.start[i]; f < T.start[i + 1]; f++) s += th.w[f];
      if (Math.abs(s - 1) > 1e-6) { v.push(`mass not conserved for obs ${i}`); break; }
    }
  }
  return v;
}