import { MUD } from '../core/constants.js';
import { clamp, clamp01, lerp } from '../core/MathX.js';

/**
 * 2D field over the track AABB storing terrain height, mud depth, wetness and rut flow.
 * Sim-layer only: `MudTerrain.js` reads `.dirty` and mirrors it into a DataTexture.
 */
export class MudField {
  constructor({ minX, minZ, size, res = 256 }) {
    this.minX = minX; this.minZ = minZ;
    this.size = size; this.res = res;
    this.cell = size / res;

    const n = res * res;
    this.height = new Float32Array(n);
    this.depth = new Float32Array(n);
    this.wetness = new Float32Array(n);
    this.rutU = new Float32Array(n);
    this.rutV = new Float32Array(n);

    this.dirty = { x0: 0, y0: 0, x1: res - 1, y1: res - 1, any: true };
    // reused sample result (no allocation in hot loop)
    this.s = { height: 0, depth: 0, wetness: 0, rutX: 0, rutZ: 0, grip: 1 };
  }

  idx(ix, iy) { return iy * this.res + ix; }
  toGridX(x) { return (x - this.minX) / this.cell; }
  toGridZ(z) { return (z - this.minZ) / this.cell; }

  /** Paint initial mud zones / terrain from track data. */
  bake(track, noise = () => 0) {
    const { res } = this;
    for (let iy = 0; iy < res; iy++) {
      const wz = this.minZ + (iy + 0.5) * this.cell;
      for (let ix = 0; ix < res; ix++) {
        const wx = this.minX + (ix + 0.5) * this.cell;
        const i = this.idx(ix, iy);
        this.height[i] = noise(wx, wz);
        let d = 0.12, w = 0.2;
        for (const z of track.mudZones || []) {
          const dx = wx - z.x, dz = wz - z.z;
          const t = 1 - clamp01(Math.hypot(dx, dz) / z.r);
          if (t > 0) { d = Math.max(d, z.depth * t * t); w = Math.max(w, (z.wetness ?? 0.6) * t); }
        }
        this.depth[i] = d;
        this.wetness[i] = w;
      }
    }
    this.markAll();
  }

  markAll() { this.dirty = { x0: 0, y0: 0, x1: this.res - 1, y1: this.res - 1, any: true }; }

  _mark(x0, y0, x1, y1) {
    const d = this.dirty;
    if (!d.any) { d.x0 = x0; d.y0 = y0; d.x1 = x1; d.y1 = y1; d.any = true; return; }
    if (x0 < d.x0) d.x0 = x0; if (y0 < d.y0) d.y0 = y0;
    if (x1 > d.x1) d.x1 = x1; if (y1 > d.y1) d.y1 = y1;
  }

  /** Bilinear sample; result is a reused object. */
  sample(x, z) {
    const gx = clamp(this.toGridX(x) - 0.5, 0, this.res - 1.001);
    const gz = clamp(this.toGridZ(z) - 0.5, 0, this.res - 1.001);
    const ix = gx | 0, iy = gz | 0, fx = gx - ix, fy = gz - iy;
    const i00 = this.idx(ix, iy), i10 = this.idx(ix + 1, iy);
    const i01 = this.idx(ix, iy + 1), i11 = this.idx(ix + 1, iy + 1);
    const bl = (a) => lerp(lerp(a[i00], a[i10], fx), lerp(a[i01], a[i11], fx), fy);

    const s = this.s;
    s.height = bl(this.height);
    s.depth = bl(this.depth);
    s.wetness = bl(this.wetness);
    s.rutX = bl(this.rutU);
    s.rutZ = bl(this.rutV);
    s.grip = 1 / (1 + s.depth * MUD.GRIP_K * (0.6 + 0.8 * s.wetness));
    return s;
  }

  /** Carve a rut. Called per wheel contact per fixed step. */
  deform(x, z, radius, amount, dirX, dirZ) {
    const r = Math.max(1, Math.ceil(radius / this.cell));
    const cx = Math.round(this.toGridX(x)), cy = Math.round(this.toGridZ(z));
    const x0 = clamp(cx - r, 0, this.res - 1), x1 = clamp(cx + r, 0, this.res - 1);
    const y0 = clamp(cy - r, 0, this.res - 1), y1 = clamp(cy + r, 0, this.res - 1);
    for (let iy = y0; iy <= y1; iy++) {
      for (let ix = x0; ix <= x1; ix++) {
        const dx = (ix - cx) / r, dy = (iy - cy) / r;
        const f = 1 - Math.min(1, dx * dx + dy * dy);
        if (f <= 0) continue;
        const i = this.idx(ix, iy);
        this.depth[i] = clamp01(this.depth[i] + amount * f);
        this.height[i] -= amount * f * 0.25;
        this.rutU[i] = lerp(this.rutU[i], dirX, MUD.RUT_EMA * f);
        this.rutV[i] = lerp(this.rutV[i], dirZ, MUD.RUT_EMA * f);
      }
    }
    this._mark(x0, y0, x1, y1);
  }

  /** Rain / drying pass — call a few times a second, not every step. */
  weather(dt, rain = 0) {
    if (rain === 0) return;
    const k = rain * dt * 0.05;
    for (let i = 0; i < this.wetness.length; i++) {
      this.wetness[i] = clamp01(this.wetness[i] + k);
    }
    this.markAll();
  }
}