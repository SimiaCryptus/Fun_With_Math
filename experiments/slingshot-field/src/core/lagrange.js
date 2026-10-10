import { gradOmega, hessOmega, omega } from './cr3bp.js';

/** L1..L5, each with its Jacobi value C_Li = 2Ω(L_i). */
export function lagrangePoints(mu) {
  const f = (x) => gradOmega(x, 0, mu)[0];
  const df = (x) => hessOmega(x, 0, mu)[0];
  const newton = (x) => {
    for (let i = 0; i < 100; i++) {
      const dx = f(x) / df(x); x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    return x;
  };
  const rh = Math.cbrt(mu / 3);
  const pts = [
    ['L1', newton(1 - mu - rh), 0],
    ['L2', newton(1 - mu + rh), 0],
    ['L3', newton(-1 - 5 * mu / 12), 0],
    ['L4', 0.5 - mu, Math.sqrt(3) / 2],
    ['L5', 0.5 - mu, -Math.sqrt(3) / 2],
  ];
  return pts.map(([name, x, y]) => ({ name, x, y, C: 2 * omega(x, y, mu) }));
}