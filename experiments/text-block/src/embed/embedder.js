import { seedVector } from './rng.js';
import { invSqrtSym, jacobiEig } from './linalg.js';
import { DEFAULT_PARAMS } from './params.js';

/**
 * Id-keyed embedding storage plus two optimizers (embeddings.md §2.2):
 *   - 'diffuse':     lazy random-walk subspace iteration + D-whitening (Laplacian eigenmap)
 *   - 'contrastive': alignment + uniformity on the unit sphere (Riemannian SGD w/ momentum)
 *
 * X is kept in position order (n×d). Vectors survive edits by id (warm start).
 * The optimizers use a sparse (CSR) copy of the effective graph W (+ optional glyph tying).
 */
export class Embedder {
  constructor({ dim = DEFAULT_PARAMS.dim, seed = DEFAULT_PARAMS.seed } = {}) {
    this.params = { ...DEFAULT_PARAMS, dim, seed };
    this.dim = dim;
    this.seed = seed;
    this.store = new Map();
    this.ids = [];
    this.codes = null;
    this.chars = null;
    this.index = new Map();
    this.X = new Float32Array(0);
    this.V = new Float32Array(0);
    this._G = new Float64Array(0);
    this._E = new Float64Array(0);
    this.graph = null;
    this.csr = null;
    this.iter = 0;
    this.loss = NaN;
  }

  get n() { return this.ids.length; }

  _unit() { return this.params.optimizer === 'contrastive'; }

  _seed(id) { return seedVector(id, this.seed, this.dim, { normalize: this._unit() }); }

  _flush() {
    const d = this.dim;
    for (let p = 0; p < this.ids.length; p++) this.store.set(this.ids[p], this.X.slice(p * d, p * d + d));
  }

  /** Set the node list (position order). Surviving ids keep their vectors. */
  sync(ids, codes = null, chars = null) {
    this._flush();
    const keep = new Set(ids);
    for (const id of [...this.store.keys()]) if (!keep.has(id)) this.store.delete(id);

    const d = this.dim;
    const n = ids.length;
    this.ids = Array.from(ids);
    this.codes = codes;
    this.chars = chars;
    this.index = new Map(this.ids.map((id, i) => [id, i]));
    this.X = new Float32Array(n * d);
    this.V = new Float32Array(n * d);
    this._G = new Float64Array(n * d);
    this._E = new Float64Array(n * n);
    for (let p = 0; p < n; p++) {
      const id = this.ids[p];
      let v = this.store.get(id);
      if (!v || v.length !== d) {
        v = this._seed(id);
        this.store.set(id, v);
      }
      this.X.set(v, p * d);
    }
    this.graph = null;
    this.csr = null;
  }

  setGraph(graph) {
    if (graph && graph.n !== this.n) throw new Error(`graph has ${graph.n} nodes, embedder has ${this.n}`);
    this.graph = graph;
    this.V.fill(0);
    this._buildCsr();
  }

  _buildCsr() {
    const g = this.graph;
    const n = this.n;
    if (!g || n === 0) {
      this.csr = null;
      return;
    }
    const mu = this.params.glyphTying || 0;
    const codes = this.codes;
    let groups = null;
    if (mu > 0 && codes) {
      groups = new Map();
      for (let p = 0; p < n; p++) groups.set(codes[p], (groups.get(codes[p]) ?? 0) + 1);
    }
    const rowPtr = new Int32Array(n + 1);
    const cols = [];
    const vals = [];
    const deg = new Float64Array(n);
    let total = 0;
    for (let p = 0; p < n; p++) {
      for (let q = 0; q < n; q++) {
        if (q === p) continue;
        let w = g.W[p * n + q];
        if (groups && codes[p] === codes[q]) w += mu / groups.get(codes[p]);
        if (w > 0) {
          cols.push(q);
          vals.push(w);
          deg[p] += w;
          if (q > p) total += w;
        }
      }
      rowPtr[p + 1] = cols.length;
    }
    this.csr = { rowPtr, col: Int32Array.from(cols), val: Float64Array.from(vals), deg, total };
  }

  setParams(patch) {
    const prev = this.params;
    this.params = { ...prev, ...patch };
    const p = this.params;
    if (p.glyphTying !== prev.glyphTying) this._buildCsr();
    if (p.dim !== this.dim || p.seed !== this.seed) {
      this.dim = p.dim;
      this.seed = p.seed;
      this.reseed();
      return;
    }
    if (p.optimizer !== prev.optimizer) {
      this.V.fill(0);
      if (this._unit()) this._normalizeRows();
    }
  }

  reseed() {
    const d = this.dim;
    const n = this.n;
    this.store.clear();
    this.X = new Float32Array(n * d);
    this.V = new Float32Array(n * d);
    this._G = new Float64Array(n * d);
    for (let p = 0; p < n; p++) {
      const v = this._seed(this.ids[p]);
      this.store.set(this.ids[p], v);
      this.X.set(v, p * d);
    }
    this.iter = 0;
    this.loss = NaN;
  }

  _normalizeRows() {
    const d = this.dim;
    const X = this.X;
    for (let p = 0; p < this.n; p++) {
      const o = p * d;
      let s = 0;
      for (let c = 0; c < d; c++) s += X[o + c] * X[o + c];
      if (s > 1e-24) {
        const k = 1 / Math.sqrt(s);
        for (let c = 0; c < d; c++) X[o + c] *= k;
      } else {
        X.set(seedVector(this.ids[p], this.seed, d, { normalize: true }), o);
      }
    }
  }

  step(k = 1) {
    if (!this.csr) return { loss: this.loss, iter: this.iter };
    if (this.n < 2) {
      this.loss = 0;
      return { loss: 0, iter: this.iter };
    }
    const diffuse = this.params.optimizer === 'diffuse';
    let loss = this.loss;
    for (let i = 0; i < k; i++) {
      loss = diffuse ? this._diffuseStep() : this._contrastiveStep();
      if (!Number.isFinite(loss)) break;
    }
    if (!Number.isFinite(loss) || !this.X.every(Number.isFinite)) {
      this.reseed();
      loss = NaN;
    } else {
      this.iter += k;
    }
    this.loss = loss;
    return { loss, iter: this.iter };
  }

  _contrastiveStep() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const V = this.V;
    const G = this._G;
    const E = this._E;
    const { rowPtr, col, val, total } = this.csr;
    const { lr, momentum, lambda, t } = this.params;
    G.fill(0);

    let align = 0;
    if (total > 0) {
      const ca = 2 / total;
      for (let p = 0; p < n; p++) {
        const po = p * d;
        for (let e = rowPtr[p]; e < rowPtr[p + 1]; e++) {
          const qo = col[e] * d;
          const w = val[e];
          let d2 = 0;
          for (let c = 0; c < d; c++) {
            const df = X[po + c] - X[qo + c];
            d2 += df * df;
            G[po + c] += ca * w * df;
          }
          align += w * d2;
        }
      }
      align /= 2 * total; // each pair was visited twice
    }

    let unif = 0;
    if (lambda !== 0) {
      let Z = 0;
      for (let p = 0; p < n; p++) {
        const po = p * d;
        for (let q = p + 1; q < n; q++) {
          const qo = q * d;
          let d2 = 0;
          for (let c = 0; c < d; c++) {
            const df = X[po + c] - X[qo + c];
            d2 += df * df;
          }
          const e = Math.exp(-t * d2);
          E[p * n + q] = e;
          Z += 2 * e;
        }
      }
      if (Z > 0) {
        unif = Math.log(Z / (n * (n - 1)));
        const cu = (-4 * t * lambda) / Z;
        for (let p = 0; p < n; p++) {
          const po = p * d;
          for (let q = p + 1; q < n; q++) {
            const coef = cu * E[p * n + q];
            if (!coef) continue;
            const qo = q * d;
            for (let c = 0; c < d; c++) {
              const df = X[po + c] - X[qo + c];
              G[po + c] += coef * df;
              G[qo + c] -= coef * df;
            }
          }
        }
      } else {
        unif = Math.log(Number.MIN_VALUE);
      }
    }

    // Riemannian step with momentum: project to the tangent space, step, renormalize.
    for (let p = 0; p < n; p++) {
      const o = p * d;
      let gx = 0;
      for (let c = 0; c < d; c++) gx += G[o + c] * X[o + c];
      let vx = 0;
      for (let c = 0; c < d; c++) {
        const g = G[o + c] - gx * X[o + c];
        const v = momentum * V[o + c] + g;
        V[o + c] = v;
        vx += v * X[o + c];
      }
      let s = 0;
      for (let c = 0; c < d; c++) {
        V[o + c] -= vx * X[o + c];
        const x = X[o + c] - lr * V[o + c];
        X[o + c] = x;
        s += x * x;
      }
      if (s > 1e-24) {
        const k = 1 / Math.sqrt(s);
        for (let c = 0; c < d; c++) X[o + c] *= k;
      } else {
        X.set(seedVector(this.ids[p], this.seed, d, { normalize: true }), o);
      }
    }
    return align + lambda * unif;
  }

  _diffuseStep() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const { rowPtr, col, val, deg, total } = this.csr;
    if (!(total > 0)) return 0;
    const eta = Math.min(1, Math.max(0.01, this.params.eta));
    const Y = this._G;

    // 1. lazy random-walk step
    for (let p = 0; p < n; p++) {
      const o = p * d;
      const dp = deg[p];
      if (dp > 0) {
        for (let c = 0; c < d; c++) Y[o + c] = 0;
        for (let e = rowPtr[p]; e < rowPtr[p + 1]; e++) {
          const w = val[e];
          const qo = col[e] * d;
          for (let c = 0; c < d; c++) Y[o + c] += w * X[qo + c];
        }
        for (let c = 0; c < d; c++) Y[o + c] = (1 - eta) * X[o + c] + (eta * Y[o + c]) / dp;
      } else {
        for (let c = 0; c < d; c++) Y[o + c] = X[o + c];
      }
    }

    // 2. remove the D-weighted mean (trivial direction)
    const mean = new Float64Array(d);
    let sd = 0;
    for (let p = 0; p < n; p++) {
      const dp = deg[p];
      sd += dp;
      for (let c = 0; c < d; c++) mean[c] += dp * Y[p * d + c];
    }
    for (let c = 0; c < d; c++) mean[c] /= sd;
    for (let p = 0; p < n; p++) for (let c = 0; c < d; c++) Y[p * d + c] -= mean[c];

    // 3. whiten: X = Y (Yᵀ D Y)^(-1/2)
    const M = new Float64Array(d * d);
    for (let p = 0; p < n; p++) {
      const dp = deg[p];
      if (!dp) continue;
      const o = p * d;
      for (let i = 0; i < d; i++) {
        const yi = dp * Y[o + i];
        if (!yi) continue;
        for (let j = i; j < d; j++) M[i * d + j] += yi * Y[o + j];
      }
    }
    for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) M[j * d + i] = M[i * d + j];
    const S = invSqrtSym(M, d);
    for (let p = 0; p < n; p++) {
      const o = p * d;
      for (let j = 0; j < d; j++) {
        let s = 0;
        for (let i = 0; i < d; i++) s += Y[o + i] * S[i * d + j];
        X[o + j] = s;
      }
    }
    return this._trace();
  }

  /** tr(Xᵀ L X) = Σ_{p<q} W_pq ‖x_p − x_q‖² */
  _trace() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const { rowPtr, col, val } = this.csr;
    let s = 0;
    for (let p = 0; p < n; p++) {
      for (let e = rowPtr[p]; e < rowPtr[p + 1]; e++) {
        const q = col[e];
        if (q <= p) continue;
        let d2 = 0;
        for (let c = 0; c < d; c++) {
          const df = X[p * d + c] - X[q * d + c];
          d2 += df * df;
        }
        s += val[e] * d2;
      }
    }
    return s;
  }

  _lx() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const { rowPtr, col, val, deg } = this.csr;
    const LX = new Float64Array(n * d);
    for (let p = 0; p < n; p++) {
      const o = p * d;
      for (let c = 0; c < d; c++) LX[o + c] = deg[p] * X[o + c];
      for (let e = rowPtr[p]; e < rowPtr[p + 1]; e++) {
        const w = val[e];
        const qo = col[e] * d;
        for (let c = 0; c < d; c++) LX[o + c] -= w * X[qo + c];
      }
    }
    return LX;
  }

  _xtA(A) {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const M = new Float64Array(d * d);
    for (let p = 0; p < n; p++) {
      for (let i = 0; i < d; i++) {
        const x = X[p * d + i];
        if (!x) continue;
        for (let j = 0; j < d; j++) M[i * d + j] += x * A[p * d + j];
      }
    }
    for (let i = 0; i < d; i++) {
      for (let j = i + 1; j < d; j++) {
        const m = (M[i * d + j] + M[j * d + i]) / 2;
        M[i * d + j] = m;
        M[j * d + i] = m;
      }
    }
    return M;
  }

  /** ‖L X − D X (XᵀLX)‖ / ‖D X‖, valid when XᵀDX = I. */
  _residual() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const { deg } = this.csr;
    const LX = this._lx();
    const A = this._xtA(LX);
    let num = 0;
    let den = 0;
    for (let p = 0; p < n; p++) {
      const o = p * d;
      for (let j = 0; j < d; j++) {
        let xa = 0;
        for (let i = 0; i < d; i++) xa += X[o + i] * A[i * d + j];
        const r = LX[o + j] - deg[p] * xa;
        num += r * r;
        const dx = deg[p] * X[o + j];
        den += dx * dx;
      }
    }
    return den > 0 ? Math.sqrt(num / den) : 0;
  }

  /** Rotate X within its span so the axes are ordered by eigenvalue (ascending). */
  _rayleighRitz() {
    const n = this.n;
    const d = this.dim;
    const X = this.X;
    const A = this._xtA(this._lx());
    const { vectors: Q } = jacobiEig(A, d);
    const row = new Float64Array(d);
    for (let p = 0; p < n; p++) {
      const o = p * d;
      for (let j = 0; j < d; j++) {
        let s = 0;
        for (let i = 0; i < d; i++) s += X[o + i] * Q[i * d + j];
        row[j] = s;
      }
      for (let j = 0; j < d; j++) X[o + j] = row[j];
    }
  }

  /** Run the diffuse iteration to tolerance, then Rayleigh–Ritz. */
  solve({ tol = 1e-6, maxIter = 5000 } = {}) {
    if (!this.csr || this.n < 2 || !(this.csr.total > 0)) {
      return { loss: this.loss, iter: 0, converged: false, residual: NaN };
    }
    let it = 0;
    let res = Infinity;
    while (it < maxIter) {
      this._diffuseStep();
      it++;
      if (it % 10 === 0 || it === maxIter) {
        res = this._residual();
        if (!(res >= tol)) break;
      }
    }
    this._rayleighRitz();
    const loss = this._trace();
    if (!this.X.every(Number.isFinite)) {
      this.reseed();
      return { loss: NaN, iter: it, converged: false, residual: NaN };
    }
    if (this._unit()) {
      this._normalizeRows();
      this.V.fill(0);
    }
    this.iter += it;
    this.loss = loss;
    return { loss, iter: it, converged: res < tol, residual: res };
  }

  matrix() { return this.X; }

  get(id) {
    const p = this.index.get(id);
    if (p === undefined) return this.store.get(id);
    return this.X.slice(p * this.dim, (p + 1) * this.dim);
  }

  export() {
    const d = this.dim;
    return {
      params: { ...this.params },
      dim: d,
      ids: [...this.ids],
      chars: this.chars ? [...this.chars] : null,
      X: this.ids.map((_, p) => Array.from(this.X.subarray(p * d, (p + 1) * d))),
    };
  }
}