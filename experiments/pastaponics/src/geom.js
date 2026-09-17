// Vector / polyline toolkit. Points are plain [x, y, z] arrays in mm.

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function norm(a) {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 1];
}

/** Closest points between segments p1‑q1 and p2‑q2 (Ericson, Real‑Time Collision Detection 5.1.9). */
export function segSegClosest(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  const EPS = 1e-12;
  let s = 0, t = 0;
  if (a <= EPS && e <= EPS) return { d: len(r), p: p1, q: p2 };
  if (a <= EPS) {
    t = clamp(f / e, 0, 1);
  } else {
    const c = dot(d1, r);
    if (e <= EPS) {
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  const p = add(p1, scale(d1, s)), q = add(p2, scale(d2, t));
  return { d: dist(p, q), p, q };
}

export function pointSegDist(p, a, b) {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-12), 0, 1);
  return dist(p, add(a, scale(ab, t)));
}
/** Radius of the circle through a, b, c (∞ if collinear). */
export function circumradius(a, b, c) {
  const area2 = len(cross(sub(b, a), sub(c, a)));
  if (area2 < 1e-9) return Infinity;
  return (dist(a, b) * dist(b, c) * dist(c, a)) / (2 * area2);
}
export function aabbOf(pts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; }
  return { min, max };
}


export function polylineLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i], pts[i - 1]);
  return L;
}

export function cumulativeLength(pts) {
  const out = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) out[i] = out[i - 1] + dist(pts[i], pts[i - 1]);
  return out;
}

/** Resample a polyline at (roughly) uniform arclength spacing ds, keeping both endpoints. */
export function resample(pts, ds) {
  if (pts.length < 2) return pts.map((p) => p.slice());
  const out = [pts[0].slice()];
  let carry = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = dist(a, b);
    if (L < 1e-9) continue;
    let s = ds - carry;
    while (s <= L) { out.push(lerp(a, b, s / L)); s += ds; }
    carry = L - (s - ds);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > ds * 0.25) out.push(last.slice());
  else out[out.length - 1] = last.slice();
  return out;
}

/** Chaikin corner cutting with fixed endpoints. */
export function chaikin(pts, iterations, ratio = 0.25) {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    if (cur.length < 3) break;
    const out = [cur[0]];
    for (let i = 0; i + 1 < cur.length; i++) {
      const a = cur[i], b = cur[i + 1];
      const q = lerp(a, b, ratio), r = lerp(a, b, 1 - ratio);
      if (i === 0) out.push(r);
      else if (i === cur.length - 2) out.push(q);
      else out.push(q, r);
    }
    out.push(cur[cur.length - 1]);
    cur = out;
  }
  return cur;
}

/** Uniform‑grid spatial hash for AABB queries. */
export class SpatialHash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  _range(min, max) {
    const c = this.cell;
    return [
      Math.floor(min[0] / c), Math.floor(min[1] / c), Math.floor(min[2] / c),
      Math.floor(max[0] / c), Math.floor(max[1] / c), Math.floor(max[2] / c),
    ];
  }
  insert(item, min, max) {
    const [x0, y0, z0, x1, y1, z1] = this._range(min, max);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const key = `${x},${y},${z}`;
      let b = this.map.get(key);
      if (!b) { b = []; this.map.set(key, b); }
      b.push(item);
    }
  }
  query(min, max, visit) {
    const [x0, y0, z0, x1, y1, z1] = this._range(min, max);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const b = this.map.get(`${x},${y},${z}`);
      if (b) for (const it of b) visit(it);
    }
  }
}