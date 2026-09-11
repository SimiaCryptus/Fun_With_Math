// Level definitions (SPEC §13). Rows are stacked from the start verge toward the goal.
const V = () => ({ type: 'verge' });
const M = () => ({ type: 'median' });
const S = () => ({ type: 'shoulder' });
const G = () => ({ type: 'verge', goal: true, hollows: 4 });
const L = (dir, speedLimit, density, flags = {}) => ({ type: 'lane', dir, speedLimit, density, ...flags });
const A = { anchor: true };
const C = { chaos: true };

export const LEVELS = [
  { id: 'l01', name: 'Quiet Road', timeLimit: 60, platoonChance: 0.10,
    rows: [V(), L(1, 12, 18, A), L(1, 13, 16), M(), L(-1, 12, 18, A), G()],
    mix: { white: 1 } },
  { id: 'l02', name: 'Daydreamers', timeLimit: 55, platoonChance: 0.15,
    rows: [V(), L(1, 13, 20, A), L(1, 15, 18), M(), L(-1, 15, 18), L(-1, 13, 20, A), G()],
    mix: { white: 0.6, purple: 0.4 } },
  { id: 'l03', name: 'Nervous Traffic', timeLimit: 50, platoonChance: 0.20,
    rows: [V(), L(1, 13, 22, A), L(1, 15, 20), L(1, 17, 18, C), M(), L(-1, 15, 20, C), L(-1, 13, 22, A), G()],
    mix: { white: 0.45, purple: 0.3, yellow: 0.25 } },
  { id: 'l04', name: 'Rush Hour', timeLimit: 45, wreckLifetime: 14, platoonChance: 0.30,
    rows: [V(), L(1, 14, 26, A), L(1, 16, 30), L(1, 19, 22, C), M(), L(-1, 19, 24, C), L(-1, 16, 30), L(-1, 13, 34, A), G()],
    mix: { white: 0.35, purple: 0.25, yellow: 0.2, green: 0.2 } },
  { id: 'l05', name: 'Good Samaritans', timeLimit: 45, platoonChance: 0.25,
    rows: [V(), S(), L(1, 15, 24, A), L(1, 17, 26), L(1, 19, 22), M(), L(-1, 19, 22, C), L(-1, 17, 26), L(-1, 15, 24, A), S(), G()],
    mix: { white: 0.3, purple: 0.2, yellow: 0.18, green: 0.15, blue: 0.17 } },
  { id: 'l06', name: 'Red Alert', timeLimit: 45, platoonChance: 0.30,
    rows: [V(), L(1, 15, 24, A), L(1, 17, 24), L(1, 20, 20, C), M(), L(-1, 20, 20, C), L(-1, 18, 24), L(-1, 16, 24), L(-1, 14, 26, A), G()],
    mix: { white: 0.3, purple: 0.2, yellow: 0.15, green: 0.13, blue: 0.12, red: 0.10 } },
  { id: 'l07', name: 'Gridlock', timeLimit: 50, wreckLifetime: 20, platoonChance: 0.40,
    rows: [V(), L(1, 12, 34, A), L(1, 14, 36, C), L(1, 16, 30), M(), L(-1, 16, 30), L(-1, 14, 36, C), L(-1, 12, 34, A), G()],
    mix: { white: 0.28, purple: 0.18, yellow: 0.2, green: 0.2, blue: 0.08, red: 0.06 } },
  { id: 'l08', name: 'Freeway', timeLimit: 45, platoonChance: 0.25,
    rows: [V(), S(), L(1, 18, 20, A), L(1, 21, 20), L(1, 24, 18), L(1, 26, 16, C), M(), L(-1, 26, 16, C), L(-1, 24, 18), L(-1, 21, 20), L(-1, 18, 20, A), S(), G()],
    mix: { white: 0.3, purple: 0.2, yellow: 0.12, green: 0.15, blue: 0.11, red: 0.12 } },
  { id: 'l09', name: 'Night Shift', timeLimit: 45, platoonChance: 0.30, modifiers: { night: true },
    rows: [V(), L(1, 15, 24, A), L(1, 17, 24), L(1, 19, 22, C), L(1, 21, 18), M(), L(-1, 21, 18), L(-1, 19, 22, C), L(-1, 17, 24), L(-1, 15, 24, A), G()],
    mix: { white: 0.3, purple: 0.2, yellow: 0.15, green: 0.13, blue: 0.12, red: 0.10 } },
  { id: 'l10', name: 'Downpour', timeLimit: 45, wreckLifetime: 18, platoonChance: 0.30, modifiers: { rain: true },
    rows: [V(), L(1, 15, 26, A), L(1, 17, 26, C), L(1, 19, 22), L(1, 21, 20), M(), L(-1, 21, 20), L(-1, 19, 22), L(-1, 17, 26, C), L(-1, 15, 26, A), G()],
    mix: { white: 0.3, purple: 0.2, yellow: 0.18, green: 0.14, blue: 0.1, red: 0.08 } },
  { id: 'l11', name: 'Rush Hour Redux', timeLimit: 50, platoonChance: 0.35, modifiers: { rushHour: true },
    rows: [V(), L(1, 16, 26, A), L(1, 18, 28), L(1, 20, 24, C), L(1, 22, 20), M(), L(-1, 22, 20), L(-1, 20, 24, C), L(-1, 18, 28), L(-1, 16, 26, A), G()],
    mix: { white: 0.28, purple: 0.2, yellow: 0.16, green: 0.18, blue: 0.1, red: 0.08 } },
  { id: 'l12', name: 'Everything Everywhere', timeLimit: 45, platoonChance: 0.35, modifiers: { night: true, rain: true },
    rows: [V(), S(), L(1, 16, 26, A), L(1, 18, 26), L(1, 20, 24, C), L(1, 23, 20), M(), L(-1, 23, 20), L(-1, 20, 24, C), L(-1, 18, 26), L(-1, 16, 26), L(-1, 14, 28, A), S(), G()],
    mix: { white: 0.28, purple: 0.18, yellow: 0.16, green: 0.14, blue: 0.12, red: 0.12 } },
];

/** Endless mode: density ramps 2 % per crossing (SPEC §13.3). */
export function endlessLevel(n) {
  const lanes = Math.min(10, 6 + Math.floor(n / 3));
  const k = 1 + 0.02 * n;
  const half = Math.ceil(lanes / 2);
  const rows = [V()];
  for (let i = 0; i < half; i++) {
    rows.push(L(1, 14 + i * 2, Math.round((22 + i * 2) * k), i === 0 ? A : i === half - 1 ? C : {}));
  }
  rows.push(M());
  for (let i = lanes - half - 1; i >= 0; i--) {
    rows.push(L(-1, 14 + i * 2, Math.round((22 + i * 2) * k), i === 0 ? A : i === lanes - half - 1 ? C : {}));
  }
  rows.push(G());
  return {
    id: `endless-${n}`, name: `Endless · Crossing ${n}`, timeLimit: 45, platoonChance: 0.3, endless: true,
    rows, mix: { white: 0.28, purple: 0.2, yellow: 0.16, green: 0.14, blue: 0.12, red: 0.10 },
  };
}