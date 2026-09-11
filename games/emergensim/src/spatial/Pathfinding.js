import { Grid3D } from './Grid3D.js';
import { isTilePassable, keyOf } from './Tile.js';

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

function reconstruct(came, endKey, startKey, grid) {
  const path = [];
  let k = endKey;
  while (k !== startKey) { path.push(grid.getByKey(k)); k = came.get(k); }
  return path.reverse();
}

/**
 * Weighted A* over the 3D grid.
 * @returns {Array|null} tiles from the first step to the goal (start excluded), or null.
 */
export function findPath(grid, start, goal, { costFn = null, agent = {}, passable = null, maxNodes = 6000 } = {}) {
  const startKey = keyOf(start), goalKey = keyOf(goal);
  if (!grid.has(startKey) || !grid.has(goalKey)) return null;
  if (startKey === goalKey) return [];
  const isPassable = passable || ((tile) => isTilePassable(tile, agent));
  const g = new Map([[startKey, 0]]);
  const came = new Map();
  const closed = new Set();
  const heap = new MinHeap();
  heap.push({ key: startKey, f: Grid3D.distance(start, goal) });
  while (heap.size) {
    const cur = heap.pop();
    if (closed.has(cur.key)) continue;
    if (cur.key === goalKey) return reconstruct(came, cur.key, startKey, grid);
    closed.add(cur.key);
    if (closed.size > maxNodes) break;
    const tile = grid.getByKey(cur.key);
    for (const n of grid.neighbors(tile.coord)) {
      const nk = n.tile.key;
      if (closed.has(nk) || !isPassable(n.tile)) continue;
      const extra = costFn ? costFn(n.tile, tile) : 0;
      if (!Number.isFinite(extra)) continue;
      const ng = g.get(cur.key) + n.cost + extra;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng); came.set(nk, cur.key);
        heap.push({ key: nk, f: ng + Grid3D.distance(n.tile.coord, goal) });
      }
    }
  }
  return null;
}

/** Dijkstra flood to the nearest tile satisfying `predicate`. */
export function findNearest(grid, start, predicate, { costFn = null, agent = {}, maxNodes = 5000 } = {}) {
  const startKey = keyOf(start);
  const startTile = grid.getByKey(startKey);
  if (!startTile) return null;
  if (predicate(startTile)) return { tile: startTile, path: [] };
  const dist = new Map([[startKey, 0]]);
  const came = new Map();
  const closed = new Set();
  const heap = new MinHeap();
  heap.push({ key: startKey, f: 0 });
  while (heap.size) {
    const cur = heap.pop();
    if (closed.has(cur.key)) continue;
    closed.add(cur.key);
    const tile = grid.getByKey(cur.key);
    if (cur.key !== startKey && predicate(tile)) return { tile, path: reconstruct(came, cur.key, startKey, grid), cost: dist.get(cur.key) };
    if (closed.size > maxNodes) break;
    for (const n of grid.neighbors(tile.coord)) {
      const nk = n.tile.key;
      if (closed.has(nk) || !isTilePassable(n.tile, agent)) continue;
      const extra = costFn ? costFn(n.tile, tile) : 0;
      if (!Number.isFinite(extra)) continue;
      const nd = dist.get(cur.key) + n.cost + extra;
      if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); came.set(nk, cur.key); heap.push({ key: nk, f: nd }); }
    }
  }
  return null;
}