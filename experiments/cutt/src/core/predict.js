// §5.10 prediction for a query box, with envelope across accepted theories.
import { compileObs } from './compile.js';

export function predict(tree, theories, lo, hi, C) {
  const frs = compileObs(tree, lo, hi);
  const dists = theories.map(th => {
    const p = new Float64Array(C);
    for (const fr of frs) for (let c = 0; c < C; c++) p[c] += fr.pi * th.phi[fr.leaf * C + c];
    return p;
  });
  const pLo = Float64Array.from(dists[0]), pHi = Float64Array.from(dists[0]);
  for (const p of dists) for (let c = 0; c < C; c++) { pLo[c] = Math.min(pLo[c], p[c]); pHi[c] = Math.max(pHi[c], p[c]); }
  return { point: dists[0], lo: pLo, hi: pHi, weights: 'prior' };
}