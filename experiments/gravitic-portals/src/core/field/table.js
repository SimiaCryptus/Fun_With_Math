// @ts-check
// Tabulated configuration space: σ per (config, mode, panel), int16 + per-(config,mode) scale.
// Binary: 'GPFT' u32 | u32 headerLen | JSON meta | pad4 | Float32 scales | Int16 data
// (typed arrays are little-endian on every supported platform).
import { DEFAULT_LAYOUT, panelCount } from './panels.js';
import { MODES } from './canonical.js';
import { solveModes } from './solve.js';

const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => (n === 1 ? a : a + ((b - a) * i) / (n - 1)));

export const DEFAULT_AXES = Object.freeze({
  d: [0.5, 1, 1.5, 2, 3, 4.5, 6.5],
  psi: linspace(0, Math.PI, 6),
  theta: linspace(0, Math.PI / 2, 4),
  phiN: 8,
  lambda: [0.25, 0.35, 0.5, 0.7, 1],
});

export const QUICK_AXES = Object.freeze({
  d: [1, 2, 3, 4.5],
  psi: linspace(0, Math.PI, 3),
  theta: [0, Math.PI / 2],
  phiN: 4,
  lambda: [0.5, 1],
});

const MAGIC = 0x54465047;
const phiAt = (N, k) => -Math.PI + (2 * Math.PI * k) / N;

export function makeMeta({ axes = DEFAULT_AXES, layout = DEFAULT_LAYOUT } = {}) {
  const ax = { d: [...axes.d], psi: [...axes.psi], theta: [...axes.theta], phiN: axes.phiN, lambda: [...axes.lambda] };
  if (ax.lambda.some((l) => l > 1 || l <= 0)) throw new Error('lambda axis must lie in (0, 1]');
  const dims = [ax.d.length, ax.psi.length, ax.theta.length, ax.phiN, ax.lambda.length];
  return {
    version: 1,
    layout: { ...layout },
    axes: ax,
    dims,
    configs: dims.reduce((a, b) => a * b, 1),
    modes: MODES,
    n: 2 * panelCount(layout),
  };
}

export function configParams(meta, index) {
  const [, Np, Nt, Nf, Nl] = meta.dims;
  const ax = meta.axes;
  let r = index;
  const il = r % Nl; r = (r - il) / Nl;
  const iF = r % Nf; r = (r - iF) / Nf;
  const it = r % Nt; r = (r - it) / Nt;
  const ip = r % Np; const id = (r - ip) / Np;
  return { d: ax.d[id], psi: ax.psi[ip], theta: ax.theta[it], phi: phiAt(Nf, iF), lambda: ax.lambda[il] };
}

/** Solve and quantize configs [start, end). Pure; safe to run in worker threads. */
export function tabulateRange(meta, start, end) {
  const M = meta.modes, n = meta.n, count = end - start;
  const scales = new Float32Array(count * M);
  const data = new Int16Array(count * M * n);
  for (let c = start; c < end; c++) {
    const { sigma } = solveModes(configParams(meta, c), meta.layout);
    const k = c - start;
    for (let m = 0; m < M; m++) {
      let max = 0;
      for (let j = 0; j < n; j++) max = Math.max(max, Math.abs(sigma[m * n + j]));
      const s = max > 0 ? Math.fround(max / 32767) : 1;
      scales[k * M + m] = s;
      const base = (k * M + m) * n;
      for (let j = 0; j < n; j++) data[base + j] = Math.max(-32767, Math.min(32767, Math.round(sigma[m * n + j] / s)));
    }
  }
  return { scales, data };
}

/** In-process build (tests / small tables). */
export function buildTable(meta) {
  const r = tabulateRange(meta, 0, meta.configs);
  return createTable(meta, r.scales, r.data);
}

function bracket(arr, v) {
  const L = arr.length;
  if (L === 1 || v <= arr[0]) return [0, 0, 0];
  if (v >= arr[L - 1]) return [L - 1, L - 1, 0];
  let i = 0;
  while (arr[i + 1] < v) i++;
  return [i, i + 1, (v - arr[i]) / (arr[i + 1] - arr[i])];
}

function bracketPhi(N, v) {
  let u = ((v + Math.PI) / (2 * Math.PI)) * N;
  u = ((u % N) + N) % N;
  const fl = Math.floor(u);
  const i0 = fl % N;
  return [i0, (i0 + 1) % N, u - fl];
}

export function createTable(meta, scales, data) {
  const { n, modes: M, axes: ax } = meta;
  const [, Np, Nt, Nf, Nl] = meta.dims;
  const tol = 1e-9;
  const inRange = (p) =>
    p.d >= ax.d[0] - tol && p.d <= ax.d[ax.d.length - 1] + tol &&
    p.lambda >= ax.lambda[0] - tol && p.lambda <= ax.lambda[ax.lambda.length - 1] + tol;

  return {
    meta,
    inRange,
    /** Multilinear (φ periodic) interpolation of Σ_m coef_m σ_m. null if out of range. */
    interpolate(p, coef) {
      if (!inRange(p)) return null;
      const br = [bracket(ax.d, p.d), bracket(ax.psi, p.psi), bracket(ax.theta, p.theta), bracketPhi(Nf, p.phi), bracket(ax.lambda, p.lambda)];
      const out = new Float64Array(n);
      const idx = [0, 0, 0, 0, 0];
      for (let mask = 0; mask < 32; mask++) {
        let w = 1;
        for (let a = 0; a < 5; a++) {
          const [i0, i1, f] = br[a];
          const hi = (mask >> a) & 1;
          w *= hi ? f : 1 - f;
          idx[a] = hi ? i1 : i0;
        }
        if (w === 0) continue;
        const cfg = (((idx[0] * Np + idx[1]) * Nt + idx[2]) * Nf + idx[3]) * Nl + idx[4];
        for (let m = 0; m < M; m++) {
          const k = w * coef[m] * scales[cfg * M + m];
          if (k === 0) continue;
          const base = (cfg * M + m) * n;
          for (let j = 0; j < n; j++) out[j] += k * data[base + j];
        }
      }
      return out;
    },
  };
}

export function encodeTable(meta, scales, data) {
  const head = new TextEncoder().encode(JSON.stringify(meta));
  const off = (8 + head.length + 3) & ~3;
  const buf = new ArrayBuffer(off + scales.byteLength + data.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, head.length, true);
  new Uint8Array(buf, 8, head.length).set(head);
  new Float32Array(buf, off, scales.length).set(scales);
  new Int16Array(buf, off + scales.byteLength, data.length).set(data);
  return new Uint8Array(buf);
}

export function decodeTable(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a field table');
  const hl = dv.getUint32(4, true);
  const meta = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
  if (meta.version !== 1) throw new Error(`unsupported field table version ${meta.version}`);
  const off = (8 + hl + 3) & ~3;
  const ns = meta.configs * meta.modes;
  const scales = new Float32Array(u8.slice(off, off + 4 * ns).buffer);
  const data = new Int16Array(u8.slice(off + 4 * ns, off + 4 * ns + 2 * ns * meta.n).buffer);
  return createTable(meta, scales, data);
}