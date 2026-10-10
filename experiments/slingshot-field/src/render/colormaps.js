import { LABEL, isExitLabel } from '../core/conventions.js';
import { NF, F } from '../core/grid.js';

function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  const s = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(s)), f = s - i;
  const a = stops[i], b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
const DIV = [[33, 102, 172], [103, 169, 207], [247, 247, 247], [239, 138, 98], [178, 24, 43]];
const VIR = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
export const diverging = (t) => ramp(DIV, (t + 1) / 2);   // t ∈ [−1, 1]
export const viridis = (t) => ramp(VIR, t);
export const gray = (t) => { const v = 255 * Math.min(1, Math.max(0, t)); return [v, v, v]; };

export const LABEL_COLORS = {
  [LABEL.FORBIDDEN]: [28, 28, 34], [LABEL.EXIT]: [190, 190, 190], [LABEL.COLLISION]: [220, 40, 40],
  [LABEL.CAPTURED]: [120, 60, 170], [LABEL.MULTIPASS]: [240, 150, 30], [LABEL.PENDING]: [12, 12, 16],
};
const SIG_COLORS = [[70, 130, 220], [220, 70, 70], [80, 190, 110], [120, 120, 120]];

export const SCALAR_LAYERS = {
  outcome: { name: 'L3 outcome ℓ' },
  dE: { name: 'L4 ΔE (= Δh)', field: 'dE', map: 'div' },
  dE1: { name: 'ΔE₁ (Kepler about P1)', field: 'dE1', map: 'div' },
  sig: { name: 'L7 Hessian signature', post: 'sig' },
  detH: { name: 'det H (symlog)', post: 'detH', map: 'div', symlog: true },
  ftle: { name: 'L8 FTLE σ', field: 'ftle', map: 'gray' },
  deltaEff: { name: 'δ_eff', field: 'deltaEff', map: 'div' },
  tau: { name: 'time of flight τ', field: 'tau', map: 'seq' },
  rPeri: { name: 'periapsis r₂ (log)', field: 'rPeri', map: 'seq', log: true },
  kappaE: { name: 'κ_E (log)', field: 'kappaE', map: 'seq', log: true },
  s1: { name: 'stretch s₁ (log)', field: 's1', map: 'seq', log: true },
  errEH: { name: '|ΔE−Δh| (log, diagnostic)', field: 'errEH', map: 'seq', log: true },
  jacobiDrift: { name: 'Jacobi drift (log)', field: 'jacobiDrift', map: 'seq', log: true },
};

function getter(grid, L) {
  const tr = L.log ? (v) => Math.log10(Math.abs(v) + 1e-300)
    : L.symlog ? (v) => Math.sign(v) * Math.log10(1 + Math.abs(v)) : (v) => v;
  if (L.post) return (k) => (grid.post ? tr(grid.post[L.post][k]) : NaN);
  const c = F[L.field];
  return (k) => tr(grid.data[k * NF + c]);
}

function percentile(sorted, q) { return sorted.length ? sorted[Math.floor(q * (sorted.length - 1))] : 0; }

export function computeRange(grid, L) {
  const get = getter(grid, L), vals = [];
  for (let k = 0; k < grid.N * grid.N; k++) {
    if (!isExitLabel(grid.label[k])) continue;
    const v = get(k); if (Number.isFinite(v)) vals.push(L.map === 'div' ? Math.abs(v) : v);
  }
  vals.sort((a, b) => a - b);
  if (L.map === 'div') { const m = percentile(vals, 0.98) || 1; return [-m, m]; }
  const lo = percentile(vals, 0.02), hi = percentile(vals, 0.98);
  return [lo, hi > lo ? hi : lo + 1];
}

/** RGBA8 image (N×N, row j = β index, bottom to top). */
export function colorize(grid, key) {
  const L = SCALAR_LAYERS[key], N = grid.N, rgba = new Uint8Array(N * N * 4);
  let range = null;
  const put = (k, c) => { rgba[4 * k] = c[0]; rgba[4 * k + 1] = c[1]; rgba[4 * k + 2] = c[2]; rgba[4 * k + 3] = 255; };
  if (key === 'outcome') {
    for (let k = 0; k < N * N; k++) put(k, LABEL_COLORS[grid.label[k]]);
    return { rgba, range };
  }
  const dim = (l) => LABEL_COLORS[l].map((v) => v * 0.35);
  if (key === 'sig') {
    const det = grid.post?.detH;
    const ld = det ? Array.from(det).filter(Number.isFinite).map((v) => Math.log10(Math.abs(v) + 1e-300)).sort((a, b) => a - b) : [];
    const lo = percentile(ld, 0.02), hi = percentile(ld, 0.98) || lo + 1;
    for (let k = 0; k < N * N; k++) {
      const s = grid.post?.sig[k];
      if (!Number.isFinite(s)) { put(k, dim(grid.label[k])); continue; }
      const t = (Math.log10(Math.abs(det[k]) + 1e-300) - lo) / (hi - lo || 1);
      const f = 0.35 + 0.65 * Math.min(1, Math.max(0, t));
      put(k, SIG_COLORS[s].map((v) => v * f));
    }
    return { rgba, range: [lo, hi] };
  }
  range = computeRange(grid, L);
  const get = getter(grid, L);
  for (let k = 0; k < N * N; k++) {
    const l = grid.label[k], v = get(k);
    if (!isExitLabel(l) || !Number.isFinite(v)) { put(k, dim(l)); continue; }
    let c;
    if (L.map === 'div') c = diverging(v / range[1]);
    else { const t = (v - range[0]) / (range[1] - range[0]); c = L.map === 'gray' ? gray(t) : viridis(t); }
    put(k, c);
  }
  return { rgba, range };
}

/** ΔE reduced over β for each α column; returns RGB per α node. */
export function ringColors(grid, mode = 'mean') {
  const N = grid.N, out = new Uint8Array(N * 3);
  const range = computeRange(grid, SCALAR_LAYERS.dE);
  for (let i = 0; i < N; i++) {
    let acc = mode === 'max' ? -Infinity : mode === 'min' ? Infinity : 0, cnt = 0;
    for (let j = 0; j < N; j++) {
      const k = j * N + i;
      if (!isExitLabel(grid.label[k])) continue;
      const v = grid.data[k * NF + F.dE]; if (!Number.isFinite(v)) continue;
      cnt++;
      acc = mode === 'max' ? Math.max(acc, v) : mode === 'min' ? Math.min(acc, v) : acc + v;
    }
    const c = cnt ? diverging((mode === 'mean' ? acc / cnt : acc) / range[1]) : [40, 40, 40];
    out.set(c.map(Math.round), i * 3);
  }
  return out;
}