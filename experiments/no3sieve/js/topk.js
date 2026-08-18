// topk.js — streaming top-K windows per size s (§5.5), with near-duplicate
// suppression: windows overlapping > 50% collapse to the best one.
import { rasterize, buildSAT, windowPop } from './sat.js';
import { createLogger } from './util/log.js';

const log = createLogger('topk');

function overlapFrac(a, b, s) {
  const ox = Math.min(a.x0 + s, b.x0 + s) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y0 + s, b.y0 + s) - Math.max(a.y0, b.y0);
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / (s * s);
}

export function topWindows(points, r, s, keep = 8) {
  if (!points || typeof points.length !== 'number' || points.length % 2)
    throw new TypeError('topWindows: `points` must be an array-like of interleaved x,y pairs');
  if (!Number.isInteger(r) || r < 0)
    throw new RangeError(`topWindows: r must be a non-negative integer (got ${r})`);
  if (!Number.isInteger(s) || s < 1)
    throw new RangeError(`topWindows: s must be a positive integer (got ${s})`);
  if (!Number.isInteger(keep) || keep < 1)
    throw new RangeError(`topWindows: keep must be >= 1 (got ${keep})`);
  const N = 2 * r + 1;
  if (s > N) {
    log.debug(`window s=${s} exceeds the generated box ${N}; nothing to scan`);
    return [];
  }
  const { grid, cw, ch } = rasterize(points, -r, -r, N, N, 1);
  const S = buildSAT(grid, cw, ch);
  const out = [];
  for (let y = 0; y + s <= ch; y++) {
    for (let x = 0; x + s <= cw; x++) {
      const pop = windowPop(S, cw, ch, x, y, x + s, y + s);
      if (pop === 0) continue;
      if (out.length >= keep && pop <= out[out.length - 1].pop) continue;
      const cand = { s, pop, c: pop / s, x0: x - r, y0: y - r };
      let dup = -1;
      for (let i = 0; i < out.length; i++) {
        if (overlapFrac(out[i], cand, s) > 0.5) {
          dup = i;
          break;
        }
      }
      if (dup >= 0) {
        if (out[dup].pop >= cand.pop) continue;
        out.splice(dup, 1);
      }
      out.push(cand);
      out.sort((a, b) => b.pop - a.pop);
      if (out.length > keep) out.length = keep;
    }
  }
  return out;
}

/** Extract the points of a window, translated into [0,s)^2 — an exportable solution. */
export function windowPoints(points, x0, y0, s) {
  if (!points || typeof points.length !== 'number' || points.length % 2)
    throw new TypeError('windowPoints: `points` must be an array-like of interleaved x,y pairs');
  if (!Number.isInteger(x0) || !Number.isInteger(y0))
    throw new TypeError(`windowPoints: origin must be integral (got ${x0},${y0})`);
  if (!Number.isInteger(s) || s < 1)
    throw new RangeError(`windowPoints: s must be a positive integer (got ${s})`);
  const out = [];
  const k = points.length / 2;
  for (let i = 0; i < k; i++) {
    const x = points[2 * i] - x0,
      y = points[2 * i + 1] - y0;
    if (x >= 0 && y >= 0 && x < s && y < s) out.push(x, y);
  }
  return Int32Array.from(out);
}
