/** 2D mask (Nx×Ny) → extruded solid cells; also distance-transform scale analysis. */
const BIG = 1e12;
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -BIG; z[1] = BIG;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = BIG;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
/** Squared Euclidean distance to nearest cell where pred(mask[n]) is true. */
export function edt2d(mask, w, h, pred) {
  const g = new Float64Array(w * h);
  for (let n = 0; n < w * h; n++) g[n] = pred(mask[n]) ? 0 : BIG;
  const m = Math.max(w, h), f = new Float64Array(m), d = new Float64Array(m), v = new Int32Array(m), z = new Float64Array(m + 1);
  for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) f[y] = g[x + y * w]; edt1d(f, h, d, v, z); for (let y = 0; y < h; y++) g[x + y * w] = d[y]; }
  for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) f[x] = g[x + y * w]; edt1d(f, w, d, v, z); for (let x = 0; x < w; x++) g[x + y * w] = d[x]; }
  return g;
}

export class BarrierField {
  constructor(Nx, Ny) { this.Nx = Nx; this.Ny = Ny; this.mask = new Uint8Array(Nx * Ny); this.version = 0; this.protectedCols = 3; }
  get(i, j) { return this.mask[i + j * this.Nx]; }
  set(i, j, v) { if (i < 0 || j < 0 || i >= this.Nx || j >= this.Ny) return; this.mask[i + j * this.Nx] = v ? 1 : 0; }
  paintable(i) { return i >= this.protectedCols && i < this.Nx - this.protectedCols; }
  bump() { this.version++; }
  clear() { this.mask.fill(0); this.bump(); }
  count() { let c = 0; for (let n = 0; n < this.mask.length; n++) c += this.mask[n]; return c; }
  fraction() { return this.count() / this.mask.length; }
  setMask(mask) { this.mask.set(mask); this.bump(); }
  resampleFrom(mask, w, h) {
    if (w === this.Nx && h === this.Ny) this.mask.set(mask);
    else for (let j = 0; j < this.Ny; j++) for (let i = 0; i < this.Nx; i++) {
      const si = Math.min(w - 1, Math.floor((i + 0.5) / this.Nx * w)), sj = Math.min(h - 1, Math.floor((j + 0.5) / this.Ny * h));
      this.mask[i + j * this.Nx] = mask[si + sj * w] ? 1 : 0;
    }
    this.bump();
  }
  /** Broadcast the 2D mask through all Nz slices (z-invariant by construction). */
  extrude(grid, out) {
    if (grid.Nx !== this.Nx || grid.Ny !== this.Ny) throw new Error('BarrierField/Grid mismatch');
    out = out || new Uint8Array(grid.N);
    for (let k = 0; k < grid.Nz; k++) out.set(this.mask, k * grid.sz);
    return out;
  }
  /**
   * Dominant geometric scales (in units of Ly) from distance transforms:
   * gaps = 2·EDT-ridge of fluid to solid, obstacles = 2·EDT-ridge of solid to fluid.
   */
  geometricScales(hy) {
    const w = this.Nx, h = this.Ny;
    if (this.count() === 0) return { gaps: [], obstacles: [] };
    const toSolid = edt2d(this.mask, w, h, (m) => m === 1), toFluid = edt2d(this.mask, w, h, (m) => m === 0);
    const ridge = (d, want) => {
      const vals = [];
      for (let j = 1; j < h - 1; j++) for (let i = this.protectedCols; i < w - this.protectedCols; i++) {
        const n = i + j * w; if ((this.mask[n] === 1) !== want) continue;
        const c = d[n]; if (c <= 0 || c >= BIG / 2) continue;
        if (c >= d[n - 1] && c >= d[n + 1] && c >= d[n - w] && c >= d[n + w]) { const l = 2 * Math.sqrt(c) * hy; if (l < 0.6) vals.push(l); }
      }
      return peaks(vals);
    };
    return { gaps: ridge(toSolid, false), obstacles: ridge(toFluid, true) };
  }
}
function peaks(vals, bins = 24, lo = 0.02, hi = 1) {
  if (!vals.length) return [];
  const hist = new Float64Array(bins), llo = Math.log(lo), lhi = Math.log(hi);
  for (const v of vals) { const b = Math.floor((Math.log(Math.max(lo, Math.min(hi, v))) - llo) / (lhi - llo) * (bins - 1)); hist[b]++; }
  const out = []; const max = Math.max(...hist);
  for (let b = 0; b < bins; b++) if (hist[b] >= 0.25 * max && hist[b] >= (b > 0 ? hist[b - 1] : 0) && hist[b] >= (b < bins - 1 ? hist[b + 1] : 0)) out.push({ scale: Math.exp(llo + (b + 0.5) / (bins - 1) * (lhi - llo)), weight: hist[b] / max });
  return out.sort((a, b) => b.weight - a.weight).slice(0, 3);
}