/**
 * Block adjacency → weighted graph on ring positions (see embeddings.md §2.1).
 * Dense W (n×n Float32Array), symmetric, zero diagonal.
 */

const mod = (a, n) => ((a % n) + n) % n;

/** Normalize a column window: integers, ordered, and no wider than n. */
export function effectiveWindow(win, n) {
  let a = Math.round(win?.[0] ?? 0);
  let b = Math.round(win?.[1] ?? 0);
  if (b < a) [a, b] = [b, a];
  if (n > 0 && b - a + 1 > n) b = a + n - 1;
  return [a, b];
}

function kernelFn(name) {
  if (name === 'inverse') return (u, v) => 1 / (1 + Math.sqrt(u * u + v * v));
  if (name === 'box') return () => 1;
  return (u, v) => Math.exp(-(u * u + v * v) / 2);
}

function gateFn(params) {
  if (params.lcpGate === 'hard') {
    const min = params.lcpMin ?? 1;
    return (l) => (l >= min ? 1 : 0);
  }
  if (params.lcpGate === 'soft') {
    const cap = Math.max(1, params.lcpCap ?? 4);
    return (l) => Math.min(l, cap) / cap;
  }
  return null;
}

function rotationLcp(codes, a, b, n) {
  let h = 0;
  while (h < n && codes[(a + h) % n] === codes[(b + h) % n]) h++;
  return h;
}

export function buildGraph({ sa, lcp, n, shift = 0, params, window = null, codes = null }) {
  void shift; // the window already encodes the view; kept for API symmetry
  const W = new Float32Array(n * n);
  const deg = new Float32Array(n);
  const win = effectiveWindow(window ?? params.window, n);
  if (n < 2) return { n, W, deg, totalWeight: 0, edgeCount: 0, window: win };

  const [kMin, kMax] = win;
  const cyclic = !!params.cyclicRows;
  const Rk = Math.max(0, Math.floor(params.radius?.[1] ?? 0));
  let Rr = Math.max(0, Math.floor(params.radius?.[0] ?? 0));
  Rr = Math.min(Rr, cyclic ? Math.floor((n - 1) / 2) : n - 1);
  const sr = Math.max(1e-6, params.sigma?.[0] ?? 1);
  const sk = Math.max(1e-6, params.sigma?.[1] ?? 1);
  const f = kernelFn(params.kernel);
  const alpha = params.alpha ?? 0;
  const beta = params.beta ?? 0;

  // Offsets grouped by dr, with their kernel weights.
  const byDr = [];
  for (let dr = 0; dr <= Rr; dr++) {
    const a = dr === 0 ? alpha : beta;
    const list = [];
    if (a > 0) {
      for (let dk = -Rk; dk <= Rk; dk++) {
        if (dr === 0 && dk <= 0) continue;
        const w = a * f(dr / sr, dk / sk);
        if (w > 0) list.push({ dk, w });
      }
    }
    byDr.push(list);
  }

  const width = kMax - kMin + 1;
  const colW = new Float64Array(width).fill(1);
  if (params.columnFocus != null && Number.isFinite(params.columnFocus)) {
    const tau = Math.max(1e-6, params.columnTau ?? 4);
    for (let i = 0; i < width; i++) colW[i] = Math.exp(-Math.abs(kMin + i - params.columnFocus) / tau);
  }

  const gate = gateFn(params);
  const L = lcp ?? new Int32Array(n);
  const wrapLcp = cyclic && gate && codes ? rotationLcp(codes, sa[n - 1], sa[0], n) : 0;
  const lcpAt = (i) => (i < n ? L[i] : i === n ? wrapLcp : L[i - n]);

  for (let r = 0; r < n; r++) {
    let ell = Infinity;
    for (let dr = 0; dr <= Rr; dr++) {
      let r2 = r + dr;
      if (r2 >= n) {
        if (!cyclic) break;
        r2 -= n;
      }
      if (dr > 0 && gate) ell = Math.min(ell, lcpAt(r + dr));
      const list = byDr[dr];
      if (!list.length) continue;
      const g = dr > 0 && gate ? gate(ell) : 1;
      if (!(g > 0)) continue;
      const o1 = sa[r];
      const o2 = sa[r2];
      for (const { dk, w: kw } of list) {
        for (let k = kMin; k <= kMax; k++) {
          const k2 = k + dk;
          if (k2 < kMin || k2 > kMax) continue;
          const p = mod(o1 + k, n);
          const q = mod(o2 + k2, n);
          if (p === q) continue;
          const w = kw * Math.sqrt(colW[k - kMin] * colW[k2 - kMin]) * g;
          if (!(w > 0)) continue;
          W[p * n + q] += w;
          W[q * n + p] += w;
        }
      }
    }
  }
   return { n, W, ...summarize(W, n, deg), window: win };
}
function summarize(W, n, deg = new Float32Array(n)) {

  let total = 0;
  let edges = 0;
  for (let p = 0; p < n; p++) {
    for (let q = 0; q < n; q++) {
      const w = W[p * n + q];
      deg[p] += w;
      if (q > p && w > 0) {
        total += w;
        edges++;
      }
    }
  }
   return { deg, totalWeight: total, edgeCount: edges };
}

/**
  * Map from reversed-ring positions to forward-ring positions.
  * Reversed ring = reverse(chars) [+ sentinel]; the sentinel keeps its place at the end.
  */
export function reversePermutation(m, n) {
   const perm = new Int32Array(n);
   for (let i = 0; i < n; i++) perm[i] = i < m ? m - 1 - i : i;
   return perm;
}

/** base + weight · (other re-indexed through perm). Both graphs have n nodes. */
export function mergeGraphs(base, other, perm, weight = 1) {
   const n = base.n;
   const W = Float32Array.from(base.W);
   if (weight > 0 && other) {
     for (let i = 0; i < n; i++) {
       const p = perm[i];
       for (let j = 0; j < n; j++) {
         const w = other.W[i * n + j];
         if (w > 0) W[p * n + perm[j]] += weight * w;
       }
     }
   }
   return { n, W, ...summarize(W, n), window: base.window, reversed: true };
}

/** Top-k strongest edges per node, deduplicated: [[p, q, w/wmax], ...] with p < q. */
export function topEdges(graph, k = 3) {
  const { n, W } = graph;
  const seen = new Set();
  const out = [];
  let max = 0;
  for (let p = 0; p < n; p++) {
    const cand = [];
    for (let q = 0; q < n; q++) {
      const w = W[p * n + q];
      if (w > 0) cand.push([q, w]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    for (const [q, w] of cand.slice(0, k)) {
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      const key = a * n + b;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([a, b, w]);
      max = Math.max(max, w);
    }
  }
  for (const e of out) e[2] /= max || 1;
  return out;
}