// Deterministic Float64 math for the Labrek simulation (physics.md §B.1).
// Only +, −, ×, ÷ and Math.sqrt are used. IEEE-754 rounds these correctly, so
// results are bit-identical across engines. No transcendental Math.* here.

export function sqrtSafe(x) { return x > 0 ? Math.sqrt(x) : 0; }
export function hypot3(x, y, z) { return Math.sqrt(x * x + y * y + z * z); }
export function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
export function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

export const v3 = {
  create(x = 0, y = 0, z = 0) { const o = new Float64Array(3); o[0] = x; o[1] = y; o[2] = z; return o; },
  set(o, x, y, z) { o[0] = x; o[1] = y; o[2] = z; return o; },
  copy(o, a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; },
  zero(o) { o[0] = 0; o[1] = 0; o[2] = 0; return o; },
  add(o, a, b) { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub(o, a, b) { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale(o, a, s) { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  addScaled(o, a, b, s) { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  cross(o, a, b) {
    const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
    o[0] = x; o[1] = y; o[2] = z; return o;
  },
  len2(a) { return a[0] * a[0] + a[1] * a[1] + a[2] * a[2]; },
  len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); },
  normalize(o, a) {
    const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    if (l > 0) { const s = 1 / l; o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; } else { o[0] = 0; o[1] = 0; o[2] = 0; }
    return o;
  },
};

// 3×3 matrices, row-major Float64Array(9).
const _m = new Float64Array(9), _m2 = new Float64Array(9);
const _m3 = new Float64Array(9);
export const m3 = {
  create() { return new Float64Array(9); },
  identity(o) { o.fill(0); o[0] = 1; o[4] = 1; o[8] = 1; return o; },
  copy(o, a) { for (let i = 0; i < 9; i++) o[i] = a[i]; return o; },
  mulV(o, m, v) {
    const x = v[0], y = v[1], z = v[2];
    o[0] = m[0] * x + m[1] * y + m[2] * z;
    o[1] = m[3] * x + m[4] * y + m[5] * z;
    o[2] = m[6] * x + m[7] * y + m[8] * z;
    return o;
  },
  mulTV(o, m, v) {
    const x = v[0], y = v[1], z = v[2];
    o[0] = m[0] * x + m[3] * y + m[6] * z;
    o[1] = m[1] * x + m[4] * y + m[7] * z;
    o[2] = m[2] * x + m[5] * y + m[8] * z;
    return o;
  },
  mul(o, a, b) {
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      _m[3 * r + c] = a[3 * r] * b[c] + a[3 * r + 1] * b[3 + c] + a[3 * r + 2] * b[6 + c];
    }
    for (let i = 0; i < 9; i++) o[i] = _m[i];
    return o;
  },
  transpose(o, a) {
    const t1 = a[1], t2 = a[2], t5 = a[5];
    o[0] = a[0]; o[4] = a[4]; o[8] = a[8];
    o[1] = a[3]; o[3] = t1; o[2] = a[6]; o[6] = t2; o[5] = a[7]; o[7] = t5;
    return o;
  },
  fromQuat(o, q) {
    const w = q[0], x = q[1], y = q[2], z = q[3];
    o[0] = 1 - 2 * (y * y + z * z); o[1] = 2 * (x * y - w * z); o[2] = 2 * (x * z + w * y);
    o[3] = 2 * (x * y + w * z); o[4] = 1 - 2 * (x * x + z * z); o[5] = 2 * (y * z - w * x);
    o[6] = 2 * (x * z - w * y); o[7] = 2 * (y * z + w * x); o[8] = 1 - 2 * (x * x + y * y);
    return o;
  },
  invert(o, m) {
    const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C;
    if (!(det !== 0) || !Number.isFinite(det)) { m3.identity(o); return false; }
    const s = 1 / det;
    o[0] = A * s; o[1] = -(b * i - c * h) * s; o[2] = (b * f - c * e) * s;
    o[3] = B * s; o[4] = (a * i - c * g) * s; o[5] = -(a * f - c * d) * s;
    o[6] = C * s; o[7] = -(a * h - b * g) * s; o[8] = (a * e - b * d) * s;
    return true;
  },
  solve(o, m, v) { m3.invert(_m2, m); return m3.mulV(o, _m2, v); },
  // o = R S Rᵀ
  rotSym(o, R, S) {
     const T = _m3; // preallocated scratch (§B.1: allocation-free hot loops)
    m3.mul(T, R, S);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      _m[3 * r + c] = T[3 * r] * R[3 * c] + T[3 * r + 1] * R[3 * c + 1] + T[3 * r + 2] * R[3 * c + 2];
    }
    for (let k = 0; k < 9; k++) o[k] = _m[k];
    return o;
  },
  skew(o, a) {
    o[0] = 0; o[1] = -a[2]; o[2] = a[1];
    o[3] = a[2]; o[4] = 0; o[5] = -a[0];
    o[6] = -a[1]; o[7] = a[0]; o[8] = 0;
    return o;
  },
};

// Quaternions [w, x, y, z].
export const quat = {
  create() { return new Float64Array([1, 0, 0, 0]); },
  mul(o, a, b) {
    const aw = a[0], ax = a[1], ay = a[2], az = a[3], bw = b[0], bx = b[1], by = b[2], bz = b[3];
    o[0] = aw * bw - ax * bx - ay * by - az * bz;
    o[1] = aw * bx + ax * bw + ay * bz - az * by;
    o[2] = aw * by - ax * bz + ay * bw + az * bx;
    o[3] = aw * bz + ax * by - ay * bx + az * bw;
    return o;
  },
  normalize(o, a) {
    const l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2] + a[3] * a[3]);
    const s = l > 0 ? 1 / l : 0;
    o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; o[3] = a[3] * s;
    if (l === 0) o[0] = 1;
    return o;
  },
  conj(o, a) { o[0] = a[0]; o[1] = -a[1]; o[2] = -a[2]; o[3] = -a[3]; return o; },
  rotate(o, q, v) {
    const w = q[0], x = q[1], y = q[2], z = q[3], vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    o[0] = vx + w * tx + (y * tz - z * ty);
    o[1] = vy + w * ty + (z * tx - x * tz);
    o[2] = vz + w * tz + (x * ty - y * tx);
    return o;
  },
  rotateInv(o, q, v) {
    const w = q[0], x = -q[1], y = -q[2], z = -q[3], vx = v[0], vy = v[1], vz = v[2];
    const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
    o[0] = vx + w * tx + (y * tz - z * ty);
    o[1] = vy + w * ty + (z * tx - x * tz);
    o[2] = vz + w * tz + (x * ty - y * tx);
    return o;
  },
};

// Solve (𝟙 + [b]×) w = v in closed form:  w = (v − b×v + b(b·v)) / (1 + |b|²).
// out[o..o+2] = w. Aliasing out === v is safe.
export function cayleySolve(out, o, b, v) {
  const bx = b[0], by = b[1], bz = b[2], vx = v[0], vy = v[1], vz = v[2];
  const cx = by * vz - bz * vy, cy = bz * vx - bx * vz, cz = bx * vy - by * vx;
  const d = bx * vx + by * vy + bz * vz, s = 1 / (1 + bx * bx + by * by + bz * bz);
  out[o] = (vx - cx + bx * d) * s;
  out[o + 1] = (vy - cy + by * d) * s;
  out[o + 2] = (vz - cz + bz * d) * s;
}

const _cr = new Float64Array(3);
// Cayley rotation: w = (𝟙 + [b]×)⁻¹ (𝟙 − [b]×) v. This is the implicit-midpoint step of  v̇ = −2 b/dt × v.
export function cayleyRotate(out, b, v) {
  const bx = b[0], by = b[1], bz = b[2], vx = v[0], vy = v[1], vz = v[2];
  _cr[0] = vx - (by * vz - bz * vy);
  _cr[1] = vy - (bz * vx - bx * vz);
  _cr[2] = vz - (bx * vy - by * vx);
  cayleySolve(out, 0, b, _cr);
  return out;
}

// Clamp a 2-vector to a disk of radius r. Returns the scale factor applied.
export function clampDisk2(v, r) {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
  if (l > r && l > 0) { const s = r / l; v[0] *= s; v[1] *= s; return s; }
  return 1;
}