import { effectiveDimension } from './EffectiveDimension.js';
const _tw = new Map();
function twiddle(n) { if (_tw.has(n)) return _tw.get(n); const c = new Float64Array(n / 2), s = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) { c[i] = Math.cos(-2 * Math.PI * i / n); s[i] = Math.sin(-2 * Math.PI * i / n); } const t = { c, s }; _tw.set(n, t); return t; }
/** In-place radix-2 FFT on a strided view. */
export function fft1d(re, im, off, stride, n, inverse = false) {
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const a = off + i * stride, b = off + j * stride; let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t; } }
  const { c, s } = twiddle(n), sg = inverse ? -1 : 1;
  for (let len = 2; len <= n; len <<= 1) { const half = len >> 1, step = n / len; for (let i = 0; i < n; i += len) for (let k = 0; k < half; k++) {
    const wr = c[k * step], wi = sg * s[k * step], a = off + (i + k) * stride, b = off + (i + k + half) * stride;
    const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
  } }
  if (inverse) for (let i = 0; i < n; i++) { re[off + i * stride] /= n; im[off + i * stride] /= n; }
}
export function fft2d(re, im, nx, ny, inverse = false) { for (let j = 0; j < ny; j++) fft1d(re, im, j * nx, 1, nx, inverse); for (let i = 0; i < nx; i++) fft1d(re, im, i, nx, ny, inverse); }

/**
 * Horizontal spectra per z-slice (§6.2): E(k), barotropic E₀(k), flux Π(k) by the
 * transfer-sum method (T(k) = −Re⟨û*·N̂⟩, Π(k) = −Σ_{k'≤k} T), and d_eff(k).
 */
export function computeSpectra(solver, win) {
  const g = solver.grid, Nx = g.Nx, Ny = g.Ny, Nz = g.Nz, sy = Nx, sz = Nx * Ny, hx = g.hx, hy = g.hy, hz = g.hz;
  const { i0, j0, nx, ny } = win, n2 = nx * ny;
  const dk = 2 * Math.PI / (ny * hy), dkx = 2 * Math.PI / (nx * hx), nk = (Math.min(nx, ny) >> 1) + 1;
  const bin = new Int16Array(n2);
  for (let my = 0; my < ny; my++) { const qy = my < ny / 2 ? my : my - ny; for (let mx = 0; mx < nx; mx++) { const qx = mx < nx / 2 ? mx : mx - nx; const b = Math.round(Math.hypot(qx * dkx, qy * dk) / dk); bin[mx + my * nx] = b < nk ? b : -1; } }
  const E = new Float64Array(nk), E0 = new Float64Array(nk), T = new Float64Array(nk);
  const F = []; for (let m = 0; m < 12; m++) F.push(new Float64Array(n2));
  const Zu = new Float64Array(n2), Zv = new Float64Array(n2), Zw = new Float64Array(n2), Zi = new Float64Array(n2);
  const { u, v, w, solid } = solver, per = solver.periodicY, zs = solver.zsT, norm = 1 / (n2 * n2);
  let idx = 0, j = 0, k = 0;
  const gx = (f) => (f[idx + 1] - f[idx - 1]) / (2 * hx);
  const gy = (f, s) => { const a = j === Ny - 1 ? (per ? f[idx - (Ny - 1) * sy] : s * f[idx]) : f[idx + sy]; const b = j === 0 ? (per ? f[idx + (Ny - 1) * sy] : s * f[idx]) : f[idx - sy]; return (a - b) / (2 * hy); };
  const gz = (f, s) => { const a = k === Nz - 1 ? s * f[idx] : f[idx + sz]; const b = k === 0 ? s * f[idx] : f[idx - sz]; return (a - b) / (2 * hz); };
  for (k = 0; k < Nz; k++) {
    for (const f of F) f.fill(0);
    for (let jj = 0; jj < ny; jj++) { j = j0 + jj; for (let ii = 0; ii < nx; ii++) {
      idx = (i0 + ii) + j * sy + k * sz; const q = ii + jj * nx; if (solid[idx]) continue;
      const uc = u[idx], vc = v[idx], wc = w[idx];
      F[0][q] = uc; F[2][q] = vc; F[4][q] = wc; Zu[q] += uc / Nz; Zv[q] += vc / Nz; Zw[q] += wc / Nz;
      F[6][q] = uc * gx(u) + vc * gy(u, 1) + wc * gz(u, zs);
      F[8][q] = uc * gx(v) + vc * gy(v, -1) + wc * gz(v, zs);
      F[10][q] = uc * gx(w) + vc * gy(w, 1) + wc * gz(w, -1);
    } }
    for (let m = 0; m < 12; m += 2) fft2d(F[m], F[m + 1], nx, ny);
    for (let q = 0; q < n2; q++) { const b = bin[q]; if (b < 0) continue;
      E[b] += 0.5 * (F[0][q] ** 2 + F[1][q] ** 2 + F[2][q] ** 2 + F[3][q] ** 2 + F[4][q] ** 2 + F[5][q] ** 2) * norm / Nz;
      T[b] -= (F[0][q] * F[6][q] + F[1][q] * F[7][q] + F[2][q] * F[8][q] + F[3][q] * F[9][q] + F[4][q] * F[10][q] + F[5][q] * F[11][q]) * norm / Nz;
    }
  }
  fft2d(Zu, Zi, nx, ny); const Zi2 = new Float64Array(n2); fft2d(Zv, Zi2, nx, ny); const Zi3 = new Float64Array(n2); fft2d(Zw, Zi3, nx, ny);
  for (let q = 0; q < n2; q++) { const b = bin[q]; if (b < 0) continue; E0[b] += 0.5 * (Zu[q] ** 2 + Zi[q] ** 2 + Zv[q] ** 2 + Zi2[q] ** 2 + Zw[q] ** 2 + Zi3[q] ** 2) * norm; }
  const Pi = new Float64Array(nk), kArr = new Float64Array(nk); let c = 0;
  for (let b = 0; b < nk; b++) { c += T[b]; Pi[b] = -c; kArr[b] = b * dk; }
  const Eb = new Float64Array(nk); for (let b = 0; b < nk; b++) Eb[b] = Math.max(0, E[b] - E0[b]);
  const dEff = effectiveDimension(E, E0);
  for (let b = 0; b < nk; b++) { E[b] /= dk; E0[b] /= dk; Eb[b] /= dk; }
  return { k: kArr, E, E0, Eb, Pi, T, dEff, nk, dk };
}

/** Band-pass a 2D field (Scope mode). k1,k2 in physical wavenumber units. */
export function bandpass2d(field, nx, ny, hx, hy, k1, k2) {
  const re = Float64Array.from(field), im = new Float64Array(nx * ny);
  fft2d(re, im, nx, ny);
  const dkx = 2 * Math.PI / (nx * hx), dky = 2 * Math.PI / (ny * hy);
  for (let my = 0; my < ny; my++) { const qy = my < ny / 2 ? my : my - ny; for (let mx = 0; mx < nx; mx++) { const qx = mx < nx / 2 ? mx : mx - nx; const kk = Math.hypot(qx * dkx, qy * dky); if (kk < k1 || kk > k2) { re[mx + my * nx] = 0; im[mx + my * nx] = 0; } } }
  fft2d(re, im, nx, ny, true);
  return re;
}