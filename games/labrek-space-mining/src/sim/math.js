// Float64 vector / quaternion / mat3 helpers. Arithmetic + sqrt only (deterministic).
export const PI = 3.141592653589793;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.sqrt(dot(a, a));
export const norm = (a) => { const l = len(a); return l > 0 ? scale(a, 1 / l) : [0, 0, 0]; };
export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const mv = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
export const mtv = (m, v) => [m[0] * v[0] + m[3] * v[1] + m[6] * v[2], m[1] * v[0] + m[4] * v[1] + m[7] * v[2], m[2] * v[0] + m[5] * v[1] + m[8] * v[2]];
export function mm(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
export const mt = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const madd = (a, b) => a.map((x, i) => x + b[i]);
export const msub = (a, b) => a.map((x, i) => x - b[i]);
export const mscale = (a, s) => a.map((x) => x * s);
export const skew = (v) => [0, -v[2], v[1], v[2], 0, -v[0], -v[1], v[0], 0];
export function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (det === 0) return I3();
  const s = 1 / det;
  return [A * s, -(b * i - c * h) * s, (b * f - c * e) * s,
    B * s, (a * i - c * g) * s, -(a * f - c * d) * s,
    C * s, -(a * h - b * g) * s, (a * e - b * d) * s];
}
// quaternion [w,x,y,z]
export const qmul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qnorm = (q) => { const l = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]); return q.map((x) => x / l); };
export function quatToMat(q) {
  const [w, x, y, z] = q;
  return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
}
// Symmetric Jacobi eigen-decomposition (sqrt only). Returns vals and column eigenvectors.
export function jacobiEigen(m) {
  const a = m.slice(); let v = I3();
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = a[1] * a[1] + a[2] * a[2] + a[5] * a[5];
    if (off < 1e-30 * (a[0] * a[0] + a[4] * a[4] + a[8] * a[8] + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = a[p * 3 + q]; if (apq === 0) continue;
      const theta = (a[q * 3 + q] - a[p * 3 + p]) / (2 * apq);
      const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      const J = I3(); J[p * 3 + p] = c; J[q * 3 + q] = c; J[p * 3 + q] = s; J[q * 3 + p] = -s;
      const r = mm(mm(mt(J), a), J); for (let k = 0; k < 9; k++) a[k] = r[k];
      v = mm(v, J);
    }
  }
  return { vals: [a[0], a[4], a[8]], vecs: v };
}