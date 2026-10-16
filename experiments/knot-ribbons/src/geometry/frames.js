// Small vector helpers + Bishop (parallel transport) frames with closure holonomy correction.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a) => { const l = norm(a) || 1; return scale(a, 1 / l); };

export function rotateAbout(v, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

export function coreCurve(N, R) {
  const P = [];
  for (let k = 0; k < N; k++) {
    const t = (2 * Math.PI * k) / N;
    P.push([R * Math.cos(t), R * Math.sin(t), 0]);
  }
  return P;
}

/** Closed polyline P (no duplicated endpoint) → { T, Nn, B } per vertex. */
export function bishopFrames(P) {
  const N = P.length;
  const T = P.map((_, k) => normalize(sub(P[(k + 1) % N], P[(k - 1 + N) % N])));
  const c = scale(P.reduce((a, b) => add(a, b), [0, 0, 0]), 1 / N);
  let r = sub(P[0], c);
  r = sub(r, scale(T[0], dot(r, T[0])));
  if (norm(r) < 1e-9) r = Math.abs(T[0][2]) < 0.9 ? cross(T[0], [0, 0, 1]) : cross(T[0], [1, 0, 0]);
  const Nn = [normalize(r)];
  for (let k = 1; k < N; k++) {
    const v = Nn[k - 1];
    Nn.push(normalize(sub(v, scale(T[k], dot(v, T[k])))));
  }
  const vEnd = Nn[N - 1];
  const end = normalize(sub(vEnd, scale(T[0], dot(vEnd, T[0]))));
  const phi = Math.atan2(dot(cross(end, Nn[0]), T[0]), dot(end, Nn[0]));
  for (let k = 1; k < N; k++) Nn[k] = rotateAbout(Nn[k], T[k], (phi * k) / N);
  const B = T.map((t, k) => cross(t, Nn[k]));
  return { T, Nn, B };
}