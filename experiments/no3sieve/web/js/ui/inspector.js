// inspector.js — exact integers for the cell under the cursor (§5.4, R13):
// (x,y), in-set?, blocked-by pair, D_s, c_s, L∞ ring index, generated?
import { linfIndex, primdir, key2 } from '../lattice.js';

export class Inspector {
  constructor(el) {
    if (!el) throw new TypeError('Inspector: target element is required');
    this.el = el;
  }

  render(cell, ps, opts) {
    if (!cell || !ps || !opts) {
      this.el.textContent = '';
      return;
    }
    if (
      !Array.isArray(cell) ||
      cell.length !== 2 ||
      !Number.isInteger(cell[0]) ||
      !Number.isInteger(cell[1]) ||
      Math.abs(cell[0]) >= 1 << 21 ||
      Math.abs(cell[1]) >= 1 << 21
    ) {
      this.el.textContent = 'cell       out of representable range';
      return;
    }
    const [x, y] = cell;
    const ring = linfIndex(x, y);
    const generated = ps.rGen >= 0 && ring <= ps.rGen;
    const inSet = ps.has ? ps.has(x, y) : false;
    const lines = [
      `cell       (${x}, ${y})`,
      `L∞ ring    ${ring}   ${generated ? 'generated' : 'UNKNOWN (ungenerated)'}`,
      `in set     ${inSet ? 'yes' : 'no'}`,
    ];
    if (generated && !inSet) {
      const pair = blockers(x, y, ps.points, ps.k);
      lines.push(
        pair
          ? `blocked by (${pair[0][0]},${pair[0][1]}) & (${pair[1][0]},${pair[1][1]})`
          : `blocked by — (free: skipped only if traversal not yet reached)`
      );
    }
    if (opts.density) {
      const D = windowPop(ps, x, y, opts.s);
      lines.push(`D_${opts.s}       ${D}`);
      lines.push(
        `c_${opts.s}       ${(D / opts.s).toFixed(4)}   (D/2s = ${(D / (2 * opts.s)).toFixed(4)})`
      );
      const conv = opts.s % 2 ? 'exact L∞ ball' : 'even s: centre biased low';
      lines.push(`window     ${conv}`);
    }
    this.el.textContent = lines.join('\n');
  }
}

function blockers(cx, cy, P, k) {
  const seen = new Map();
  for (let i = 0; i < k; i++) {
    const px = P[2 * i],
      py = P[2 * i + 1];
    if (px === cx && py === cy) continue;
    const d = primdir(cx - px, cy - py);
    const kk = key2(d[0], d[1]);
    const prev = seen.get(kk);
    if (prev !== undefined)
      return [
        [P[2 * prev], P[2 * prev + 1]],
        [px, py],
      ];
    seen.set(kk, i);
  }
  return null;
}

// Exact (unaggregated) centered-window count for the hovered cell.
function windowPop(ps, x, y, s) {
  const lo = Math.floor((s - 1) / 2),
    hi = Math.ceil((s - 1) / 2);
  let n = 0;
  for (let i = 0; i < ps.k; i++) {
    const px = ps.points[2 * i],
      py = ps.points[2 * i + 1];
    if (px >= x - lo && px <= x + hi && py >= y - lo && py <= y + hi) n++;
  }
  return n;
}
