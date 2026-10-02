// Material table (idea.md §5.1, range midpoints) and pair rules.
// E is a modulus-like stiffness weight for the stress solver (§A.7.2.2).

export const MAT = Object.freeze({ REG: 0, SIN: 1, SIL: 2, NFE: 3, ICE: 4, CAR: 5, CMP: 6, SAL: 7 });

const BASE = [
  { name: 'REG', rho: 1500, ten: 262, shear: 525, mu: 0.6, E: 1e7, kth: 0.02, cp: 800, alpha: 0.9, eps: 0.9, vol: 25, Tsub: 0, kfat: 1.0 },
  { name: 'SIN', rho: 2200, ten: 6e6, shear: 9e6, mu: 0.7, E: 2e10, kth: 1.0, cp: 850, alpha: 0.9, eps: 0.9, vol: 0, Tsub: 0, kfat: 3.0 },
  { name: 'SIL', rho: 3000, ten: 1e7, shear: 2e7, mu: 0.7, E: 5e10, kth: 2.0, cp: 800, alpha: 0.85, eps: 0.9, vol: 2.5, Tsub: 0, kfat: 1.0 },
  { name: 'NFE', rho: 7800, ten: 4e8, shear: 2.75e8, mu: 0.4, E: 2e11, kth: 40, cp: 450, alpha: 0.6, eps: 0.3, vol: 0, Tsub: 0, kfat: 0.2 },
  { name: 'ICE', rho: 1250, ten: 1e6, shear: 7.5e5, mu: 0.2, E: 9e9, kth: 2.2, cp: 2000, alpha: 0.5, eps: 0.95, vol: 700, Tsub: 180, kfat: 1.0 },
  { name: 'CAR', rho: 1700, ten: 5.5e5, shear: 8.5e5, mu: 0.6, E: 5e9, kth: 0.5, cp: 1000, alpha: 0.95, eps: 0.9, vol: 200, Tsub: 300, kfat: 1.0 },
  { name: 'CMP', rho: 1600, ten: 5e8, shear: 3e8, mu: 0.5, E: 7e10, kth: 1.0, cp: 1000, alpha: 0.7, eps: 0.8, vol: 0, Tsub: 0, kfat: 0.3 },
  { name: 'SAL', rho: 4500, ten: 8e8, shear: 5e8, mu: 0.4, E: 1.1e11, kth: 10, cp: 500, alpha: 0.6, eps: 0.4, vol: 0, Tsub: 0, kfat: 0.1 },
];

// overrides: { REG: { rho: ... }, ... } (e.g. from data/materials.json, injected as an object)
export function createMaterials(overrides = {}) {
  return BASE.map((m) => ({ ...m, ...(overrides[m.name] || {}) }));
}

function harm(x, y) { return x > 0 && y > 0 ? (2 * x * y) / (x + y) : 0; }

export function compatibility(a, b) {
  if (a === b && a !== MAT.ICE) return 1.0; // same-material interfaces are intact rock
  if (a === MAT.ICE || b === MAT.ICE) return 0.5;
  if (a === MAT.REG && b === MAT.REG) return 1.0;
  if ((a === MAT.NFE && b === MAT.CMP) || (a === MAT.CMP && b === MAT.NFE)) return 1.0;
  return 0.8;
}

export function pairProps(mats, ma, mb, out) {
  const A = mats[ma], B = mats[mb], k = compatibility(ma, mb);
  out.coh = harm(A.shear, B.shear) * k;
  out.ten = harm(A.ten, B.ten) * k;
  out.mus = 0.5 * (A.mu + B.mu);
  out.E = harm(A.E, B.E);
  out.kth = harm(A.kth, B.kth);
  out.kfat = 0.5 * (A.kfat + B.kfat);
  return out;
}