import { pointId } from '../core/geometry.js';

// Pick a size×size sublattice base/strides, optionally biased to frontier.
export function pickSublattice(config, size, biasFrontier) {
  const n = config.n;
  const maxStride = Math.max(1, Math.floor((n - 1) / (size - 1)));
  let best = null;
  const tries = biasFrontier ? 12 : 1;
  for (let t = 0; t < tries; t++) {
    const s = 1 + Math.floor(Math.random() * maxStride);
    const tt = 1 + Math.floor(Math.random() * maxStride);
    const r = Math.floor(Math.random() * (n - (size - 1) * s));
    const c = Math.floor(Math.random() * (n - (size - 1) * tt));
    const sub = { r, c, s, t: tt, size };
    if (!biasFrontier) return sub;
    const score = scoreSublattice(config, sub);
    if (!best || score > best.score) best = { sub, score };
  }
  return best ? best.sub : null;
}

function scoreSublattice(config, sub) {
  // Reward sublattices overlapping frontier (safe) cells and occupied cells.
  let score = 0;
  for (let i = 0; i < sub.size; i++)
    for (let j = 0; j < sub.size; j++) {
      const x = sub.c + j * sub.t;
      const y = sub.r + i * sub.s;
      const id = pointId(x, y, config.n);
      if (config.selected.has(id)) score += 1;
      else if (config.frontier.blockCount(id) === 0) score += 2;
    }
  return score;
}

// Extract occupied 0/1 submatrix for a sublattice.
export function extractSubmatrix(config, sub) {
  const m = [];
  for (let i = 0; i < sub.size; i++) {
    const row = [];
    for (let j = 0; j < sub.size; j++) {
      const x = sub.c + j * sub.t;
      const y = sub.r + i * sub.s;
      row.push(config.has(x, y) ? 1 : 0);
    }
    m.push(row);
  }
  return m;
}

// Generate sum-preserving alternative submatrices via a random intercalate
// (2x2) swap that preserves row/column marginals position-wise, OR a whole
// row/column permutation that preserves the MULTISET of row/column sums
// (sums may be reordered among rows/columns — per the corrected definition:
// exchanging rows i and k is valid because row-sum(i) after equals
// row-sum(k) before, keeping the marginal multiset constant).
export function sumPreservingPerm(m) {
  const size = m.length;
  const moves = [];
  // Move type 1: whole-row swap (permutes the row-sum multiset trivially;
  // column sums are unchanged as a multiset since column contents are just
  // reordered vertically).
  moves.push(() => {
    const i1 = Math.floor(Math.random() * size);
    let i2 = Math.floor(Math.random() * size);
    if (i1 === i2) i2 = (i2 + 1) % size;
    if (i1 === i2) return null;
    const nm = m.map((r) => r.slice());
    [nm[i1], nm[i2]] = [nm[i2], nm[i1]];
    return sameAsInput(m, nm) ? null : nm;
  });
  // Move type 2: whole-column swap (symmetric to row swap).
  moves.push(() => {
    const j1 = Math.floor(Math.random() * size);
    let j2 = Math.floor(Math.random() * size);
    if (j1 === j2) j2 = (j2 + 1) % size;
    if (j1 === j2) return null;
    const nm = m.map((r) => r.slice());
    for (let i = 0; i < size; i++) {
      const tmp = nm[i][j1];
      nm[i][j1] = nm[i][j2];
      nm[i][j2] = tmp;
    }
    return sameAsInput(m, nm) ? null : nm;
  });
  // Move type 3: intercalate (2x2) swap — preserves marginals position-wise.
  moves.push(() => intercalate(m, size));
  // Try the move types in random order until one yields a distinct matrix.
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  for (const idx of order) {
    const nm = moves[idx]();
    if (nm) return nm;
  }
  return null;
}
function sameAsInput(a, b) {
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < a.length; j++) if (a[i][j] !== b[i][j]) return false;
  return true;
}
function intercalate(m, size) {
  // Find a 2x2 "swappable" pattern: rows i1,i2, cols j1,j2 with pattern
  // (1,0 / 0,1) or (0,1 / 1,0) -> flip it.
  const candidates = [];
  for (let i1 = 0; i1 < size; i1++)
    for (let i2 = i1 + 1; i2 < size; i2++)
      for (let j1 = 0; j1 < size; j1++)
        for (let j2 = j1 + 1; j2 < size; j2++) {
          const a = m[i1][j1],
            b = m[i1][j2];
          const c = m[i2][j1],
            d = m[i2][j2];
          if (a === 1 && b === 0 && c === 0 && d === 1) candidates.push([i1, i2, j1, j2, 'A']);
          else if (a === 0 && b === 1 && c === 1 && d === 0) candidates.push([i1, i2, j1, j2, 'B']);
        }
  if (candidates.length === 0) return null;
  const [i1, i2, j1, j2, type] = candidates[Math.floor(Math.random() * candidates.length)];
  const nm = m.map((r) => r.slice());
  if (type === 'A') {
    nm[i1][j1] = 0;
    nm[i1][j2] = 1;
    nm[i2][j1] = 1;
    nm[i2][j2] = 0;
  } else {
    nm[i1][j1] = 1;
    nm[i1][j2] = 0;
    nm[i2][j1] = 0;
    nm[i2][j2] = 1;
  }
  return nm;
}
