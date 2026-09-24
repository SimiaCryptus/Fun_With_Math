import { NORM_MODE } from '../core/registry.js';
import { fail } from '../core/errors.js';
import { toF16, fromF16 } from '../core/f16.js';

// §11.1 / §11.2. The side-channel is not optional: normalisation is what makes
// quantisation viable across ten decades, and it is also what destroys absolute
// scale. Normalise AND transport the normaliser, or a whisper and a shout
// produce identical tokens.
//
// The side-channel is f16 (§11.2). We therefore normalise with the values that
// will actually be transported -- mean and log2(scale) rounded through f16 --
// so that decode is exact arithmetic on the side-channel rather than an
// approximation of what the encoder used.
function transportable(mean, scale) {
  const mean16 = fromF16(toF16(mean));
  const logScale16 = fromF16(toF16(Math.log2(scale)));
  return { mean: mean16, logScale: logScale16, scale: Math.pow(2, logScale16) };
}

export class NormState {
  constructor(eps) {
    this.eps = eps;
    this.mode = eps.norm.mode;
    this.lambda = eps.norm.lambda;
    this.alpha = 1 - Math.pow(2, -1 / this.lambda);
    const n = eps.L * eps.J * eps.C;
    this.mu = new Float64Array(n);
    this.var = new Float64Array(n).fill(1);
    this.seen = new Uint8Array(n);
  }

  _idx(coord, c) { return (coord.l * this.eps.J + coord.j) * this.eps.C + c; }

  // Raw (mean, scale) for a tile. State-only modes ignore `tile`.
  _stats(tile, coord) {
    switch (this.mode) {
      case NORM_MODE.NONE: return { mean: 0, scale: 1 };
      case NORM_MODE.PEAK: {
        let m = 0;
        for (const v of tile) m = Math.max(m, Math.abs(v));
        return { mean: 0, scale: m > 0 ? m : 1 };
      }
      case NORM_MODE.PATCH_Z: {
        let s = 0;
        for (const v of tile) s += v;
        const mean = s / tile.length;
        let q = 0;
        for (const v of tile) q += (v - mean) * (v - mean);
        let scale = Math.sqrt(q / tile.length);
        if (!(scale > 1e-12)) scale = 1;
        return { mean, scale };
      }
      case NORM_MODE.RUNNING_Z:
      case NORM_MODE.GLOBAL_Z: {
        const i0 = this._idx(coord, 0);
        return { mean: this.mu[i0], scale: Math.sqrt(Math.max(this.var[i0], 1e-24)) };
      }
      default: fail('FDDP_E_PARAM', `normalization mode 0x${this.mode.toString(16)} unsupported`);
    }
  }

  // The side-channel a decoder replaying this state PREDICTS for the next patch.
  // Defined for state-driven modes only; used by the causality test.
  predictSide(coord) {
    if (this.mode === NORM_MODE.PATCH_Z || this.mode === NORM_MODE.PEAK)
      fail('FDDP_E_PARAM', 'per-patch normalisation has no state-predicted side-channel');
    const t = transportable(...Object.values(this._stats(null, coord)));
    return { mean: t.mean, logScale: t.logScale, validFrac: 255, flags: 0, cohere: 0 };
  }

  // Pure with respect to state. Returns the normalised tile and the side-channel.
  apply(tile, coord) {
    const raw = this._stats(tile, coord);
    const t = transportable(raw.mean, raw.scale);
    const out = new Float64Array(tile.length);
    if (this.mode === NORM_MODE.NONE) out.set(tile);
    else for (let i = 0; i < tile.length; i++) out[i] = (tile[i] - t.mean) / t.scale;
    return { tile: out, side: { mean: t.mean, logScale: t.logScale, validFrac: 255, flags: 0, cohere: 0 } };
  }

  // §11.1: "MUST be applied *after* the patch is encoded, never before, so that
  // decode is causal and reproducible." `tile` is the RECONSTRUCTED patch (raw
  // domain, after dequantise + denormalise) -- the only thing both sides share.
  update(tile, coord) {
    if (this.mode !== NORM_MODE.RUNNING_Z) return;
    const i0 = this._idx(coord, 0);
    let s = 0;
    for (const v of tile) s += v;
    const xbar = s / tile.length;
    const d = xbar - this.mu[i0];
    this.mu[i0] += this.alpha * d;
    this.var[i0] += this.alpha * (d * d - this.var[i0]);
    this.seen[i0] = 1;
  }

  denormalize(u, side) {
    const out = new Float64Array(u.length);
    if (this.mode === NORM_MODE.NONE) { out.set(u); return out; }
    const scale = Math.pow(2, side.logScale);
    for (let i = 0; i < u.length; i++) out[i] = u[i] * scale + side.mean;
    return out;
  }
}