// Glue strands via τ into closed component curves; measure framing via the Gauss linking integral.
import { add, sub, scale, dot, cross, norm } from './frames.js';

export function closeComponents(layout, tau, cycles) {
  return cycles.map((cyc) => {
    const pts = [], Ws = [];
    let prevW = null;
    for (const st of cyc) {
      const S = layout.strands[st];
      const sgn = prevW && dot(prevW, S[0].W) < 0 ? -1 : 1;
      for (let k = 0; k < S.length - 1; k++) { pts.push(S[k].p); Ws.push(scale(S[k].W, sgn)); }
      prevW = scale(S[S.length - 1].W, sgn);
    }
    return { strands: cyc, pts, Ws, orientable: dot(prevW, Ws[0]) > 0 };
  });
}

export function linking(A, Bc) {
  let s = 0;
  const nA = A.length, nB = Bc.length;
  for (let i = 0; i < nA; i++) {
    const a0 = A[i], a1 = A[(i + 1) % nA];
    const da = sub(a1, a0), ma = scale(add(a0, a1), 0.5);
    for (let j = 0; j < nB; j++) {
      const b0 = Bc[j], b1 = Bc[(j + 1) % nB];
      const r = sub(ma, scale(add(b0, b1), 0.5));
      const d = norm(r);
      s += dot(r, cross(da, sub(b1, b0))) / (d * d * d);
    }
  }
  return s / (4 * Math.PI);
}

/**
 * Half-twist framing of a component ribbon = Lk(core, double-lap push-off).
 * The orientable case gives 2·Lk(core, edge); the Möbius case gives Lk(core, boundary).
 * Returns null when too expensive at adequate resolution.
 */
export function measureFraming(comp, eps, maxPairs = 4e6) {
  const M = comp.pts.length;
  let len = 0;
  for (let i = 0; i < M; i++) len += norm(sub(comp.pts[(i + 1) % M], comp.pts[i]));
  const cnt = Math.min(M, Math.ceil(len / (eps * 0.8)));
  if (cnt * cnt * 2 > maxPairs) return null;
  const idx = Array.from({ length: cnt }, (_, i) => Math.floor((i * M) / cnt));
  const C = idx.map((i) => comp.pts[i]);
  const E1 = idx.map((i) => add(comp.pts[i], scale(comp.Ws[i], eps)));
  const E2 = comp.orientable ? E1 : idx.map((i) => add(comp.pts[i], scale(comp.Ws[i], -eps)));
  return Math.round(linking(C, [...E1, ...E2]));
}