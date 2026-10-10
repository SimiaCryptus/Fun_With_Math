import { NF, F } from './grid.js';
import { isExitLabel } from './conventions.js';

/**
 * Hessian of ΔE by centred differences of the analytic gradient (§8.3 method a).
 * Stencils that touch a different label or an orientation flip are masked (NaN).
 * Signature classes: 0 = (+,+), 1 = (−,−), 2 = (+,−), 3 = degenerate.
 */
export function postprocess(grid) {
  const { N, label, data } = grid;
  const n = N * N, da = (2 * Math.PI) / N, db = Math.PI / N;
  const H00 = new Float64Array(n).fill(NaN), H01 = H00.slice(), H11 = H00.slice();
  const detH = H00.slice(), sig = H00.slice(), asym = H00.slice();
  const ok = (k, l) => label[k] === l && data[k * NF + F.flip] === 0 && Number.isFinite(data[k * NF + F.gA]);
  const g = (k, c) => data[k * NF + c];

  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, l = label[k];
    if (!isExitLabel(l) || !ok(k, l)) continue;
    const kL = j * N + ((i - 1 + N) % N), kR = j * N + ((i + 1) % N);
    if (!ok(kL, l) || !ok(kR, l)) continue;
    const dAa = (g(kR, F.gA) - g(kL, F.gA)) / (2 * da);
    const dBa = (g(kR, F.gB) - g(kL, F.gB)) / (2 * da);
    let dAb, dBb;
    const kD = (j - 1) * N + i, kU = (j + 1) * N + i;
    if (j > 0 && j < N - 1 && ok(kD, l) && ok(kU, l)) {
      dAb = (g(kU, F.gA) - g(kD, F.gA)) / (2 * db); dBb = (g(kU, F.gB) - g(kD, F.gB)) / (2 * db);
    } else if (j < N - 1 && ok(kU, l)) {
      dAb = (g(kU, F.gA) - g(k, F.gA)) / db; dBb = (g(kU, F.gB) - g(k, F.gB)) / db;
    } else if (j > 0 && ok(kD, l)) {
      dAb = (g(k, F.gA) - g(kD, F.gA)) / db; dBb = (g(k, F.gB) - g(kD, F.gB)) / db;
    } else continue;
    const h00 = dAa, h11 = dBb, h01 = 0.5 * (dAb + dBa);
    H00[k] = h00; H11[k] = h11; H01[k] = h01; asym[k] = Math.abs(dAb - dBa);
    const det = h00 * h11 - h01 * h01; detH[k] = det;
    const tol = 1e-8 * (h00 * h00 + h11 * h11 + 2 * h01 * h01);
    sig[k] = Math.abs(det) <= tol ? 3 : det > 0 ? (h00 > 0 ? 0 : 1) : 2;
  }
  grid.post = { H00, H01, H11, detH, sig, asym };
  return grid.post;
}