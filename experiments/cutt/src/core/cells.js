// Mapping fragment boxes onto a fixed evaluation grid over [0,1]^d
// (piecewise-uniform-within-fragment reading). Pure geometry.
import { EPS } from './box.js';

export function dimCells(a, b, G) {
  if (b - a <= EPS) {
    const c = Math.min(G - 1, Math.max(0, Math.floor(a * G)));
    return [[c, 1]];
  }
  const out = [];
  const c0 = Math.max(0, Math.floor(a * G)), c1 = Math.min(G - 1, Math.ceil(b * G) - 1);
  for (let c = c0; c <= c1; c++) {
    const ov = Math.min(b, (c + 1) / G) - Math.max(a, c / G);
    if (ov > 0) out.push([c, ov / (b - a)]);
  }
  return out;
}

// Calls cb(cellIndex, mass*fraction) for every grid cell the box overlaps.
export function spreadBox(lo, hi, mass, G, d, cb) {
  const per = [];
  for (let j = 0; j < d; j++) per.push(dimCells(lo[j], hi[j], G));
  const rec = (j, idx, mul, frac) => {
    if (j === d) { cb(idx, mass * frac); return; }
    for (const [c, fr] of per[j]) rec(j + 1, idx + c * mul, mul * G, frac * fr);
  };
  rec(0, 0, 1, 1);
}

export function cellIndexOf(x, G) {
  let idx = 0, mul = 1;
  for (let j = 0; j < x.length; j++) {
    const c = Math.min(G - 1, Math.max(0, Math.floor(x[j] * G)));
    idx += c * mul; mul *= G;
  }
  return idx;
}