// test/helpers.js — deterministic RNG + brute-force oracles.
//
// Every randomised test is seeded: a failure that cannot be replayed is a rumour.
// (This file exports only; the runner may load it as a zero-test file.)

/** mulberry32 — small, fast, deterministic. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randInt = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

/** Random 0/1 occupancy grid (counts stay small so scanMax's histogram fits). */
export function randomGrid(rand, cw, ch, p = 0.25) {
  const g = new Int32Array(cw * ch);
  for (let i = 0; i < g.length; i++) g[i] = rand() < p ? 1 : 0;
  return g;
}

/** O(area) window population, clamped exactly like windowPop(). */
export function bruteWindowPop(grid, cw, ch, x0, y0, x1, y1) {
  x0 = Math.max(0, x0);
  y0 = Math.max(0, y0);
  x1 = Math.min(cw, x1);
  y1 = Math.min(ch, y1);
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += grid[y * cw + x];
  return n;
}

/** Same scan order (and therefore same tie-break) as sat.scanMax. */
export function bruteScanMax(grid, cw, ch, s) {
  let max = -1,
    ax = 0,
    ay = 0;
  for (let y = 0; y + s <= ch; y++) {
    for (let x = 0; x + s <= cw; x++) {
      const p = bruteWindowPop(grid, cw, ch, x, y, x + s, y + s);
      if (p > max) {
        max = p;
        ax = x;
        ay = y;
      }
    }
  }
  return { max, ax, ay };
}

/** C(k,3) cross-product oracle: returns the offending index triple or null. */
export function collinearTriple(points) {
  const k = points.length / 2;
  for (let a = 0; a < k; a++) {
    const ax = points[2 * a],
      ay = points[2 * a + 1];
    for (let b = a + 1; b < k; b++) {
      const bx = points[2 * b] - ax,
        by = points[2 * b + 1] - ay;
      for (let c = b + 1; c < k; c++) {
        const cx = points[2 * c] - ax,
          cy = points[2 * c + 1] - ay;
        if (bx * cy - by * cx === 0) return [a, b, c];
      }
    }
  }
  return null;
}

/** g(t) = ||p + t·d||_inf, duplicated here so the test does not trust sieve.js. */
export const gOf = (px, py, dx, dy, t) => Math.max(Math.abs(px + t * dx), Math.abs(py + t * dy));

export const toArr = (a) => Array.from(a);
