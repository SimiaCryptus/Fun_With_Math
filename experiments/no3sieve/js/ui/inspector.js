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
     // I2 budget for the four lines through this cell. `2/2` means the cell can
     // NEVER be occupied, however far it is from the two points that closed the
     // line — this is what the 2-wide empty strips through the origin are.
     const L = lineLoad(x, y, ps.points, ps.k);
     const dead = [
       L.row >= 2 && `row y=${y}`,
       L.col >= 2 && `col x=${x}`,
       L.diag >= 2 && `diag x−y=${x - y}`,
       L.anti >= 2 && `anti x+y=${x + y}`,
     ].filter(Boolean);
     lines.push(`I2 load    row ${L.row}/2  col ${L.col}/2  diag ${L.diag}/2  anti ${L.anti}/2`);
     if (dead.length) lines.push(`DEAD lines ${dead.join(', ')} (saturated forever)`);
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
/** Points on the 4 axis/diagonal lines through (cx,cy), excluding the cell itself. */
function lineLoad(cx, cy, P, k) {
   const L = { row: 0, col: 0, diag: 0, anti: 0 };
   for (let i = 0; i < k; i++) {
     const x = P[2 * i],
       y = P[2 * i + 1];
     if (x === cx && y === cy) continue;
     if (y === cy) L.row++;
     if (x === cx) L.col++;
     if (x - y === cx - cy) L.diag++;
     if (x + y === cx + cy) L.anti++;
   }
   return L;
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