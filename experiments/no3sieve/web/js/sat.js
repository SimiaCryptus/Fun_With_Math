// sat.js — summed-area analytics (§4.3). NOT in the placement hot loop.
// One definition, three consumers: density curve, overlay (§5.4), top-K (§5.5).
// NOTE: this module *logs* (even-window notice, I2 overflow, skipped sizes); the
// logger has to be imported or those paths throw ReferenceError instead of warning.
import { createLogger } from './util/log.js';

const log = createLogger('sat');

/** Occupancy raster over the box [x0, x0+w) x [y0, y0+h), aggregated by `stride`. */
export function rasterize(points, x0, y0, w, h, stride = 1) {
  const cw = Math.ceil(w / stride),
    ch = Math.ceil(h / stride);
  const g = new Int32Array(cw * ch);
  const k = points.length / 2;
  for (let i = 0; i < k; i++) {
    const x = points[2 * i] - x0,
      y = points[2 * i + 1] - y0;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    g[((y / stride) | 0) * cw + ((x / stride) | 0)]++;
  }
  return { grid: g, cw, ch, stride, x0, y0 };
}

/** SAT with a zero row/col: S[(r)*(cw+1) + c] = sum of grid[<r, <c]. */
export function buildSAT(grid, cw, ch) {
  const S = new Int32Array((cw + 1) * (ch + 1));
  for (let y = 0; y < ch; y++) {
    let row = 0;
    const o = (y + 1) * (cw + 1),
      p = y * (cw + 1);
    for (let x = 0; x < cw; x++) {
      row += grid[y * cw + x];
      S[o + x + 1] = S[p + x + 1] + row;
    }
  }
  return S;
}

/** 4-term inclusion–exclusion population of [cx0,cx1) x [cy0,cy1) in grid coords. */
export function windowPop(S, cw, ch, cx0, cy0, cx1, cy1) {
  if (!S || S.length < (cw + 1) * (ch + 1))
    throw new RangeError(`windowPop: SAT too small for ${cw}x${ch}`);
  if (
    !Number.isInteger(cx0) ||
    !Number.isInteger(cy0) ||
    !Number.isInteger(cx1) ||
    !Number.isInteger(cy1)
  )
    throw new TypeError(`windowPop: non-integer window (${cx0},${cy0})-(${cx1},${cy1})`);
  if (cx0 < 0) cx0 = 0;
  if (cy0 < 0) cy0 = 0;
  if (cx1 > cw) cx1 = cw;
  if (cy1 > ch) cy1 = ch;
  if (cx1 <= cx0 || cy1 <= cy0) return 0;
  const W = cw + 1;
  return S[cy1 * W + cx1] - S[cy0 * W + cx1] - S[cy1 * W + cx0] + S[cy0 * W + cx0];
}

/**
 * Centered s×s window (§5.4). For odd s this is exactly the L∞ ball of radius
 * (s-1)/2 around the cell; for even s the centre is biased low (state it in the
 * legend — R13). Returns {D, cw, ch} of D_s sampled at every grid cell.
 */
export function centeredDensityMap(sat, cw, ch, sCells) {
  if (!Number.isInteger(sCells) || sCells < 1)
    throw new RangeError(`centeredDensityMap: sCells must be a positive integer (got ${sCells})`);
  if (sCells % 2 === 0)
    log.once(
      `even-window-${sCells}`,
      'info',
      `centered window s=${sCells} is even: the centre is biased LOW (documented in the legend, R13)`
    );
  const lo = Math.floor((sCells - 1) / 2),
    hi = Math.ceil((sCells - 1) / 2);
  const D = new Int32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      D[y * cw + x] = windowPop(sat, cw, ch, x - lo, y - lo, x + hi + 1, y + hi + 1);
    }
  }
  return D;
}

/** Scan all s×s placements of a raster: max population, argmax, histogram. */
export function scanMax(sat, cw, ch, s) {
  if (!Number.isInteger(s) || s < 1)
    throw new RangeError(`scanMax: s must be a positive integer (got ${s})`);
  let best = -1,
    ax = 0,
    ay = 0;
  const hist = new Int32Array(2 * s + 2);
  let overflow = 0;
  for (let y = 0; y + s <= ch; y++) {
    for (let x = 0; x + s <= cw; x++) {
      const p = windowPop(sat, cw, ch, x, y, x + s, y + s);
      if (p < hist.length) hist[p]++;
      else overflow++; // p > 2s ⇒ the *input set* violates I2
      if (p > best) {
        best = p;
        ax = x;
        ay = y;
      }
    }
  }
  if (overflow)
    log.error(
      `scanMax(s=${s}): ${overflow} window(s) hold more than 2s points — the point set is NOT valid`
    );
  // `overflow` is part of the contract: hist only has room for p <= 2s+1, so
  // sum(hist) alone does NOT account for every window when the input is not a
  // valid no-three-in-line set (e.g. a random raster in a test).
  return { s, max: best, ax, ay, hist, overflow };
}

/**
 * c(s) density curve over the generated L∞ ball B_∞(r) (§4.3). Any sub-window of a
 * valid set is valid, so max_pop(s) is a *certified lower bound* for the classical
 * s×s no-three-in-line problem.
 */
export function densityCurve(points, r, sizes) {
  if (!Number.isInteger(r) || r < 0)
    throw new RangeError(`densityCurve: r must be a non-negative integer (got ${r})`);
  if (!Array.isArray(sizes) && !ArrayBuffer.isView(sizes))
    throw new TypeError('densityCurve: `sizes` must be an array of window sizes');
  const N = 2 * r + 1;
  const { grid, cw, ch } = rasterize(points, -r, -r, N, N, 1);
  const S = buildSAT(grid, cw, ch);
  const rows = [];
  for (const s of sizes) {
    if (!Number.isInteger(s) || s < 1) {
      log.warn(`densityCurve: ignoring invalid size ${s}`);
      continue;
    }
    if (s > N) {
      log.debug(`densityCurve: size ${s} exceeds the generated box (${N}); skipped`);
      continue;
    }
    const m = scanMax(S, cw, ch, s);
    rows.push({ s, maxPop: m.max, c: m.max / s, argmaxX: m.ax - r, argmaxY: m.ay - r });
  }
  return rows;
}
