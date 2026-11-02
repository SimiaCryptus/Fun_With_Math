// Axis-aligned box utilities. Volumes are only ever handled in log space.
export const EPS = 1e-12;

export function isDegenerate(lo, hi, j) { return hi[j] - lo[j] <= EPS; }

export function logVolume(lo, hi) {
  let s = 0;
  for (let j = 0; j < lo.length; j++) if (hi[j] - lo[j] > EPS) s += Math.log(hi[j] - lo[j]);
  return s;
}

export function containsPoint(lo, hi, x, tol = 1e-9) {
  for (let j = 0; j < lo.length; j++) if (x[j] < lo[j] - tol || x[j] > hi[j] + tol) return false;
  return true;
}

export function isSubBox(lo, hi, lo2, hi2, tol = 1e-12) {
  for (let j = 0; j < lo.length; j++) if (lo[j] < lo2[j] - tol || hi[j] > hi2[j] + tol) return false;
  return true;
}