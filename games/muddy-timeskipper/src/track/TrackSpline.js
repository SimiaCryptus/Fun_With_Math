import { clamp, clamp01, lerp } from '../core/MathX.js';

/**
 * Closed Catmull-Rom centerline with per-point width, arc-length reparameterisation,
 * baked curvature/target-speed and a nearest-point query for AI + lap progress.
 * Engine-free: emits plain {x,y,z} points that render code can convert to THREE.
 */
export class TrackSpline {
  constructor(points, widths, { samples = 1024, latAcc = 16 } = {}) {
    this.cp = points.map(([x, y, z]) => ({ x, y: y || 0, z }));
    this.widths = widths && widths.length === points.length ? widths.slice() : points.map(() => 12);
    this.n = this.cp.length;
    this.samples = samples;

    this.px = new Float32Array(samples);
    this.py = new Float32Array(samples);
    this.pz = new Float32Array(samples);
    this.tx = new Float32Array(samples);
    this.tz = new Float32Array(samples);
    this.w = new Float32Array(samples);
    this.curv = new Float32Array(samples);
    this.vTarget = new Float32Array(samples);
    this.s = new Float32Array(samples + 1);

    this._bake(latAcc);
  }

  _cr(i, t, axis) {
    const n = this.n;
    const p0 = this.cp[(i - 1 + n) % n][axis], p1 = this.cp[i % n][axis];
    const p2 = this.cp[(i + 1) % n][axis], p3 = this.cp[(i + 2) % n][axis];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                  (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  }

  _bake(latAcc) {
    const N = this.samples;
    for (let k = 0; k < N; k++) {
      const u = (k / N) * this.n;
      const i = Math.floor(u), t = u - i;
      this.px[k] = this._cr(i, t, 'x');
      this.py[k] = this._cr(i, t, 'y');
      this.pz[k] = this._cr(i, t, 'z');
      this.w[k] = lerp(this.widths[i % this.n], this.widths[(i + 1) % this.n], t);
    }
    // tangents + arc length
    let acc = 0;
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N, b = (k + 1) % N;
      let dx = this.px[b] - this.px[a], dz = this.pz[b] - this.pz[a];
      const m = Math.hypot(dx, dz) || 1;
      this.tx[k] = dx / m; this.tz[k] = dz / m;
      const nx = this.px[(k + 1) % N] - this.px[k], nz = this.pz[(k + 1) % N] - this.pz[k];
      this.s[k] = acc; acc += Math.hypot(nx, nz);
    }
    this.s[N] = acc;
    this.length = acc;
    // curvature from tangent turn rate, then physics-limited target speed
    for (let k = 0; k < N; k++) {
      const b = (k + 1) % N;
      const cross = this.tx[k] * this.tz[b] - this.tz[k] * this.tx[b];
      const ds = Math.max(0.001, this.s[k + 1] - this.s[k]);
      this.curv[k] = Math.abs(cross) / ds;
      const c = Math.max(this.curv[k], 1e-4);
      this.vTarget[k] = clamp(Math.sqrt(latAcc / c), 6, 46);
    }
    // smooth target speed backwards so AI brake *before* the corner
    for (let pass = 0; pass < 24; pass++) {
      for (let k = N - 1; k >= 0; k--) {
        const b = (k + 1) % N;
        const ds = Math.max(0.001, this.s[k + 1] - this.s[k]);
        const limit = Math.sqrt(this.vTarget[b] * this.vTarget[b] + 2 * 12 * ds);
        if (this.vTarget[k] > limit) this.vTarget[k] = limit;
      }
    }
  }

  /** @returns {{x,y,z,tx,tz,width,vTarget,curv,index}} reused object */
  at(k) {
    const N = this.samples;
    const i = ((k % N) + N) % N;
    return {
      index: i, x: this.px[i], y: this.py[i], z: this.pz[i],
      tx: this.tx[i], tz: this.tz[i],
      width: this.w[i], vTarget: this.vTarget[i], curv: this.curv[i]
    };
  }

  /** Index of the point `metres` further along from index k. */
  ahead(k, metres) {
    const step = this.length / this.samples;
    return Math.round(k + metres / step);
  }

  /**
   * Nearest sample index (coarse-then-fine). `hint` = previous index for O(1) tracking.
   * @returns {{index:number, dist:number, lateral:number, progress:number}}
   */
  nearest(x, z, hint = -1) {
    const N = this.samples;
    let best = -1, bestD = Infinity;
    if (hint >= 0) {
      for (let d = -24; d <= 48; d++) {
        const i = ((hint + d) % N + N) % N;
        const dx = x - this.px[i], dz = z - this.pz[i];
        const dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      // Hint window lost the vehicle: fall back to a global search. bestD MUST be
      // reset, otherwise the coarse pass can find nothing closer than the rejected
      // candidate and we return index -1 (=> tx[-1] => NaN lateral).
      if (Math.sqrt(bestD) > this.w[best] * 3) { best = -1; bestD = Infinity; }
    }
    if (best < 0) {
      for (let i = 0; i < N; i += 4) {
        const dx = x - this.px[i], dz = z - this.pz[i];
        const dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      for (let d = -4; d <= 4; d++) {
        const i = ((best + d) % N + N) % N;
        const dx = x - this.px[i], dz = z - this.pz[i];
        const dd = dx * dx + dz * dz;
        if (dd < bestD) { bestD = dd; best = i; }
      }
    }
    const nx = -this.tz[best], nz = this.tx[best];
    const lateral = (x - this.px[best]) * nx + (z - this.pz[best]) * nz;
    return { index: best, dist: Math.sqrt(bestD), lateral, progress: best / N };
  }

  /** Track AABB padded by max width — used to size the MudField. */
  bounds(pad = 20) {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.samples; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
    }
    minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
    const size = Math.max(maxX - minX, maxZ - minZ);
    return { minX, minZ, maxX, maxZ, size };
  }

  /** Hard track-edge containment: push a body back inside and scrub speed. */
  contain(body, hint = -1) {
    const n = this.nearest(body.pos.x, body.pos.z, hint);
    const half = this.w[n.index] * 0.5;
    if (Math.abs(n.lateral) > half) {
      const nx = -this.tz[n.index], nz = this.tx[n.index];
      const over = Math.abs(n.lateral) - half;
      const s = n.lateral > 0 ? -1 : 1;
      body.pos.x += nx * over * s;
      body.pos.z += nz * over * s;
      const vn = body.vel.x * nx + body.vel.z * nz;
      body.vel.x -= nx * vn * 1.2;
      body.vel.z -= nz * vn * 1.2;
      body.mudLoad = clamp01(body.mudLoad + 0.02);
    }
    return n;
  }
}