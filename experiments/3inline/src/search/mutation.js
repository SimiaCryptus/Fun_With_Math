import { pickSublattice, extractSubmatrix, sumPreservingPerm } from './sublattice.js';

// Attempt one mutation. Returns { config, accepted, sub, delta } or null.
// Strategy: try a sum-preserving sublattice swap; also opportunistically try
// to add a free frontier cell to grow the configuration.
export function mutate(config, opts = {}) {
  const size = opts.size || 3;
  const biasFrontier = opts.biasFrontier !== false;

  // First: greedy growth — try to add a safe frontier cell.
  if (opts.allowGrow !== false) {
    const grown = tryGrow(config);
    if (grown) return { config: grown.config, accepted: true, sub: null, delta: +1, grew: true };
  }
  // Saturated? Try a relocation: remove one point, then attempt to add two
  // safe frontier cells. This is the classic local-search escape for the
  // no-three-in-line problem and can produce net growth.
  if (opts.allowRelocate !== false) {
    const relocated = tryRelocate(config);
    if (relocated) {
      return {
        config: relocated.config,
        accepted: true,
        sub: null,
        delta: relocated.delta,
        relocated: true,
      };
    }
  }

  const sub = pickSublattice(config, size, biasFrontier);
  if (!sub) return null;
  const m = extractSubmatrix(config, sub);
  const nm = sumPreservingPerm(m);
  if (!nm) return null;

  // Apply: rebuild the sublattice cells in a clone.
  const next = config.clone();
  applySubmatrix(next, sub, m, nm);

  // Global validity: ensure no 3-in-line introduced.
  if (!next.isValid()) {
    return { config, accepted: false, sub, delta: 0 };
  }
  return { config: next, accepted: true, sub, delta: 0 };
}

function tryGrow(config) {
  const cells = config.frontier.frontierCells(config.selected);
  if (cells.length === 0) return null;
  const cell = cells[Math.floor(Math.random() * cells.length)];
  const next = config.clone();
  if (next.add(cell[0], cell[1])) return { config: next };
  return null;
}
// Remove a random selected point, then greedily re-grow as many safe
// frontier cells as possible. Returns the resulting config with its delta
// relative to the input point count (may be negative, zero, or positive).
function tryRelocate(config) {
  const ids = [...config.selected];
  if (ids.length === 0) return null;
  const startCount = config.pointCount;
  const next = config.clone();
  const n = config.n;
  const victim = ids[Math.floor(Math.random() * ids.length)];
  const vx = victim % n,
    vy = Math.floor(victim / n);
  next.remove(vx, vy);
  // Greedily fill — but avoid immediately re-adding the same victim.
  let added = 0;
  let guard = 0;
  while (guard++ < 8) {
    const cells = next.frontier
      .frontierCells(next.selected)
      .filter((c) => !(c[0] === vx && c[1] === vy) || added > 0);
    if (cells.length === 0) break;
    const cell = cells[Math.floor(Math.random() * cells.length)];
    if (next.add(cell[0], cell[1])) added++;
    else break;
  }
  const delta = next.pointCount - startCount;
  // Only surface relocations that don't strictly lose ground.
  if (delta < 0) return null;
  return { config: next, delta };
}

function applySubmatrix(config, sub, oldM, newM) {
  // Remove cells that changed 1->0, add cells that changed 0->1.
  for (let i = 0; i < sub.size; i++)
    for (let j = 0; j < sub.size; j++) {
      const x = sub.c + j * sub.t;
      const y = sub.r + i * sub.s;
      if (oldM[i][j] === 1 && newM[i][j] === 0) config.remove(x, y);
    }
  for (let i = 0; i < sub.size; i++)
    for (let j = 0; j < sub.size; j++) {
      const x = sub.c + j * sub.t;
      const y = sub.r + i * sub.s;
      if (oldM[i][j] === 0 && newM[i][j] === 1) config.forceAdd(x, y);
    }
}
