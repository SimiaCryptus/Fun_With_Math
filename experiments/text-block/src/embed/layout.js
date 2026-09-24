/**
 * 2-D layouts of an embedding X (n×d) for the scatter view.
 *   - 'pca'  : principal axes (linalg.pca)
 *   - 'raw'  : first two embedding dimensions, centred
 *   - 'tsne' : exact t-SNE (O(n²) per iteration; fine for n ≤ a few hundred)
 *   - 'mds'  : metric MDS via SMACOF (Guttman transform)
 *
 * The iterative layouts keep positions by id, so edits / optimizer progress warm-start
 * from the previous layout instead of starting over.
 */
import { pca } from './linalg.js';
import { mulberry32, hash } from './rng.js';

export const LAYOUTS = ['pca', 'tsne', 'mds', 'raw'];
export const LAYOUT_LABELS = { pca: 'PCA', tsne: 't-SNE', mds: 'metric MDS', raw: 'axes 1–2' };

export function sqDistances(X, n, d) {
  const D = new Float64Array(n * n);
  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) {
      let s = 0;
      for (let c = 0; c < d; c++) {
        const df = X[p * d + c] - X[q * d + c];
        s += df * df;
      }
      D[p * n + q] = s;
      D[q * n + p] = s;
    }
  }
  return D;
}

/** First two coordinates, centred. Missing axes (d < 2) are zero. */
export function rawAxes(X, n, d) {
  const Y = new Float32Array(2 * n);
  if (!n) return Y;
  for (let j = 0; j < Math.min(2, d); j++) {
    let m = 0;
    for (let p = 0; p < n; p++) m += X[p * d + j];
    m /= n;
    for (let p = 0; p < n; p++) Y[2 * p + j] = X[p * d + j] - m;
  }
  return Y;
}

/** t-SNE input affinities: per-point Gaussian calibrated to the perplexity, symmetrized. */
function affinities(D, n, perplexity) {
  const perp = Math.max(1.5, Math.min(perplexity, (n - 1) / 3));
  const target = Math.log(perp);
  const Pc = new Float64Array(n * n);
  const row = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let dmin = Infinity;
    for (let j = 0; j < n; j++) if (j !== i) dmin = Math.min(dmin, D[i * n + j]);
    let beta = 1;
    let lo = -Infinity;
    let hi = Infinity;
    let sum = 0;
    for (let t = 0; t < 64; t++) {
      sum = 0;
      for (let j = 0; j < n; j++) {
        row[j] = j === i ? 0 : Math.exp(-(D[i * n + j] - dmin) * beta);
        sum += row[j];
      }
      let H = 0;
      if (sum > 0) {
        for (let j = 0; j < n; j++) {
          const p = row[j] / sum;
          if (p > 1e-12) H -= p * Math.log(p);
        }
      }
      if (Math.abs(H - target) < 1e-5) break;
      if (H > target) {
        lo = beta;
        beta = hi === Infinity ? beta * 2 : (beta + hi) / 2;
      } else {
        hi = beta;
        beta = lo === -Infinity ? beta / 2 : (beta + lo) / 2;
      }
    }
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      Pc[i * n + j] = sum > 0 ? row[j] / sum : 1 / (n - 1);
    }
  }
  const P = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      P[i * n + j] = Math.max((Pc[i * n + j] + Pc[j * n + i]) / (2 * n), 1e-12);
    }
  }
  return P;
}

class IterativeLayout {
  constructor() {
    this.reset();
  }

  reset() {
    this.n = 0;
    this.ids = [];
    this.Y = new Float64Array(0);
    this.remaining = 0;
    this.iter = 0;
    this.value = NaN;
  }

  /**
   * Place points: warm start by id when most ids survive, otherwise from PCA.
   * `scale` = target RMS for a fresh start (null keeps the PCA scale). Returns true if fresh.
   */
  _place(ids, X, n, d, scale) {
    const old = new Map();
    for (let i = 0; i < this.n; i++) old.set(this.ids[i], i);
    let hits = 0;
    for (const id of ids) if (old.has(id)) hits++;
    const fresh = hits < Math.max(2, n / 2);
    const rand = mulberry32(hash('layout', n, hits));
    const Y = new Float64Array(2 * n);

    if (fresh) {
      const init = pca(X, n, d, 2);
      let ss = 0;
      for (let i = 0; i < init.length; i++) ss += init[i] * init[i];
      const rms = Math.sqrt(ss / Math.max(1, n));
      const k = scale == null ? 1 : rms > 1e-12 ? scale / rms : 0;
      const jitter = (scale ?? Math.max(rms, 1e-3)) * 1e-3;
      for (let i = 0; i < 2 * n; i++) Y[i] = init[i] * k + (rand() - 0.5) * jitter;
    } else {
      const placed = new Uint8Array(n);
      let ss = 0;
      for (let p = 0; p < n; p++) {
        const i = old.get(ids[p]);
        if (i === undefined) continue;
        Y[2 * p] = this.Y[2 * i];
        Y[2 * p + 1] = this.Y[2 * i + 1];
        ss += Y[2 * p] ** 2 + Y[2 * p + 1] ** 2;
        placed[p] = 1;
      }
      const jitter = Math.sqrt(ss / Math.max(1, hits)) * 0.05 || 1e-4;
      // New points go next to their nearest placed ring neighbour.
      for (let p = 0; p < n; p++) {
        if (placed[p]) continue;
        let src = -1;
        for (let o = 1; o < n && src < 0; o++) {
          const a = (p - o + n) % n;
          const b = (p + o) % n;
          if (placed[a]) src = a;
          else if (placed[b]) src = b;
        }
        const bx = src >= 0 ? Y[2 * src] : 0;
        const by = src >= 0 ? Y[2 * src + 1] : 0;
        Y[2 * p] = bx + (rand() - 0.5) * jitter;
        Y[2 * p + 1] = by + (rand() - 0.5) * jitter;
      }
    }
    this.ids = Array.from(ids);
    this.n = n;
    this.Y = Y;
    return fresh;
  }

  coords() {
    return Float32Array.from(this.Y);
  }
}

export class TSNE extends IterativeLayout {
  constructor({ perplexity = 15, lr = 10 } = {}) {
    super();
    this.perplexity = perplexity;
    this.lr = lr;
  }

  reset() {
    super.reset();
    this.P = null;
    this.gains = new Float64Array(0);
    this.upd = new Float64Array(0);
    this.exag = 0;
  }

  setPerplexity(v) {
    if (Number.isFinite(v) && v > 0) this.perplexity = v;
  }

  setInput(X, n, d, ids) {
    const fresh = this._place(ids, X, n, d, 1e-4);
    this.P = n >= 2 ? affinities(sqDistances(X, n, d), n, this.perplexity) : null;
    this.gains = new Float64Array(2 * n).fill(1);
    this.upd = new Float64Array(2 * n);
    if (fresh) {
      this.iter = 0;
      this.exag = 100;
      this.remaining = 1000;
    } else {
      this.remaining = Math.max(this.remaining, 300);
    }
  }

  step(k = 1) {
    const n = this.n;
    if (n < 2 || !this.P) {
      this.remaining = 0;
      return;
    }
    const Y = this.Y;
    const P = this.P;
    const G = new Float64Array(2 * n);
    const num = new Float64Array(n * n);
    const { gains, upd, lr } = this;

    for (let s = 0; s < k && this.remaining > 0; s++) {
      let Z = 0;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const dx = Y[2 * p] - Y[2 * q];
          const dy = Y[2 * p + 1] - Y[2 * q + 1];
          const v = 1 / (1 + dx * dx + dy * dy);
          num[p * n + q] = v;
          Z += 2 * v;
        }
      }
      const ex = this.exag > 0 ? 4 : 1;
      G.fill(0);
      let kl = 0;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const v = num[p * n + q];
          const qq = Math.max(v / Z, 1e-12);
          const pij = P[p * n + q];
          const m = 4 * (ex * pij - qq) * v;
          const dx = Y[2 * p] - Y[2 * q];
          const dy = Y[2 * p + 1] - Y[2 * q + 1];
          G[2 * p] += m * dx;
          G[2 * p + 1] += m * dy;
          G[2 * q] -= m * dx;
          G[2 * q + 1] -= m * dy;
          kl += 2 * pij * Math.log(pij / qq);
        }
      }
      const mom = this.iter < 250 ? 0.5 : 0.8;
      for (let i = 0; i < 2 * n; i++) {
        const g = G[i];
        const u = upd[i];
        let gain = Math.sign(g) === Math.sign(u) ? gains[i] * 0.8 : gains[i] + 0.2;
        if (gain < 0.01) gain = 0.01;
        gains[i] = gain;
        upd[i] = mom * u - lr * gain * g;
        Y[i] += upd[i];
      }
      let mx = 0;
      let my = 0;
      for (let p = 0; p < n; p++) {
        mx += Y[2 * p];
        my += Y[2 * p + 1];
      }
      mx /= n;
      my /= n;
      for (let p = 0; p < n; p++) {
        Y[2 * p] -= mx;
        Y[2 * p + 1] -= my;
      }
      if (!Y.every(Number.isFinite)) {
        this.reset();
        return;
      }
      this.value = kl;
      this.iter++;
      this.remaining--;
      if (this.exag > 0) this.exag--;
    }
  }
}

export class MDS extends IterativeLayout {
  reset() {
    super.reset();
    this.delta = null;
    this.denom = 1;
    this.prevStress = Infinity;
  }

  setInput(X, n, d, ids) {
    const D2 = sqDistances(X, n, d);
    const delta = new Float64Array(n * n);
    let denom = 0;
    for (let i = 0; i < D2.length; i++) {
      delta[i] = Math.sqrt(D2[i]);
      denom += D2[i];
    }
    this.delta = delta;
    this.denom = denom / 2 || 1;
    this.prevStress = Infinity;
    const fresh = this._place(ids, X, n, d, null);
    if (fresh) this.iter = 0;
    this.remaining = fresh ? 300 : Math.max(this.remaining, 100);
  }

  step(k = 1) {
    const n = this.n;
    if (n < 2 || !this.delta) {
      this.remaining = 0;
      return;
    }
    const Y = this.Y;
    const delta = this.delta;
    const Z = new Float64Array(2 * n);
    for (let s = 0; s < k && this.remaining > 0; s++) {
      Z.fill(0);
      let stress = 0;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          const dx = Y[2 * p] - Y[2 * q];
          const dy = Y[2 * p + 1] - Y[2 * q + 1];
          const dist = Math.hypot(dx, dy);
          const t = delta[p * n + q];
          stress += (dist - t) ** 2;
          const b = dist > 1e-12 ? t / dist : 0;
          Z[2 * p] += b * dx;
          Z[2 * p + 1] += b * dy;
          Z[2 * q] -= b * dx;
          Z[2 * q + 1] -= b * dy;
        }
      }
      for (let i = 0; i < 2 * n; i++) Y[i] = Z[i] / n;
      this.value = Math.sqrt(stress / this.denom);
      this.iter++;
      this.remaining--;
      if (Math.abs(this.prevStress - stress) <= 1e-9 * Math.max(stress, 1e-12)) {
        this.remaining = 0;
      }
      this.prevStress = stress;
    }
  }
}