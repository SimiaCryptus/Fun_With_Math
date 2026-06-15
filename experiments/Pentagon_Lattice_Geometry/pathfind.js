// pathfind.js
// Shortest-path tools over the lattice adjacency graph.
//
// Tiles are nodes; an edge exists between a tile and each of its
// non-null neighbors. Edges are weighted by the Euclidean distance
// between adjacent tile centroids, so the reported "shortest path"
// is the geometrically shortest route — not merely the one with the
// fewest hops. This avoids the BFS artifact where many equal-hop but
// geometrically wasteful (zig-zag) routes are all considered optimal.
//
// We still report the hop count (number of edges) of the chosen path,
// the number of distinct geometric shortest paths, the net sheet shift,
// and the straight-line (Euclidean) distance between the endpoints.

// Relative/absolute tolerance for treating two path lengths as "equal".
// Needed because floating-point centroid coordinates accumulate rounding
// error along a path, and because symmetric routes can be exactly tied
// in exact arithmetic but differ by ~1e-12 in floats.
const EPS = 1e-7;

function edgeLen(lattice, a, b) {
  const ca = lattice.tiles[a].centroidF;
  const cb = lattice.tiles[b].centroidF;
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
}

// A tiny binary min-heap keyed by a numeric priority. Avoids an O(n^2)
// linear scan in Dijkstra for large lattices.
class MinHeap {
  constructor() {
    this.items = []; // { node, dist }
  }
  get size() {
    return this.items.length;
  }
  push(node, dist) {
    const it = this.items;
    it.push({ node, dist });
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (it[p].dist <= it[i].dist) break;
      [it[p], it[i]] = [it[i], it[p]];
      i = p;
    }
  }
  pop() {
    const it = this.items;
    const top = it[0];
    const last = it.pop();
    if (it.length > 0) {
      it[0] = last;
      let i = 0;
      const n = it.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let m = i;
        if (l < n && it[l].dist < it[m].dist) m = l;
        if (r < n && it[r].dist < it[m].dist) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        i = m;
      }
    }
    return top;
  }
}

// Dijkstra from `start` using Euclidean edge weights.
// Returns:
//   dist:  Float64Array of shortest geometric distance to each node
//          (Infinity if unreachable).
//   hops:  Int32Array of the hop count along a shortest geometric path
//          (the minimal hop count among all geometrically-shortest paths).
//   preds: Array<number[]> of predecessor nodes that lie on SOME
//          geometrically-shortest path (within EPS tolerance).
function dijkstraAllShortest(lattice, start) {
  const tiles = lattice.tiles;
  const n = tiles.length;
  const dist = new Float64Array(n).fill(Infinity);
  const hops = new Int32Array(n).fill(0);
  const preds = new Array(n);
  for (let i = 0; i < n; i++) preds[i] = [];

  dist[start] = 0;
  hops[start] = 0;
  const heap = new MinHeap();
  heap.push(start, 0);
  const finalized = new Uint8Array(n);

  while (heap.size > 0) {
    const { node: u, dist: du } = heap.pop();
    if (finalized[u]) continue;
    // Stale entry guard: only proceed for the best-known distance.
    if (du > dist[u] + EPS) continue;
    finalized[u] = 1;

    const nbrs = tiles[u].neighbors;
    for (let k = 0; k < nbrs.length; k++) {
      const v = nbrs[k];
      if (v === null) continue;
      const w = edgeLen(lattice, u, v);
      const nd = dist[u] + w;
      if (nd < dist[v] - EPS) {
        // Strictly shorter route found: reset predecessors.
        dist[v] = nd;
        hops[v] = hops[u] + 1;
        preds[v] = [u];
        heap.push(v, nd);
      } else if (Math.abs(nd - dist[v]) <= EPS) {
        // Tied route (within tolerance): record as an alternative.
        if (!preds[v].includes(u)) preds[v].push(u);
        // Prefer the smaller hop count for the representative path.
        if (hops[u] + 1 < hops[v]) hops[v] = hops[u] + 1;
      }
    }
  }
  return { dist, hops, preds };
}

// Reconstruct all geometrically-shortest paths from start to end as arrays
// of tile indices. Capped at `maxPaths` to avoid combinatorial explosion.
function reconstructAll(preds, start, end, maxPaths = 64) {
  if (end === start) return [[start]];
  const paths = [];
  const stack = [[end]];
  while (stack.length > 0 && paths.length < maxPaths) {
    const path = stack.pop();
    const node = path[path.length - 1];
    if (node === start) {
      paths.push([...path].reverse());
      continue;
    }
    for (const p of preds[node]) {
      stack.push([...path, p]);
    }
  }
  return paths;
}

// Count the number of distinct geometrically-shortest paths to `end`.
function countShortest(preds, start, end) {
  const memo = new Map();
  function count(node) {
    if (node === start) return 1;
    if (memo.has(node)) return memo.get(node);
    let total = 0;
    for (const p of preds[node]) total += count(p);
    memo.set(node, total);
    return total;
  }
  if (end === start) return 1;
  if (preds[end].length === 0) return 0;
  return count(end);
}

// Set of all tile indices that lie on SOME geometrically-shortest path.
function shortestPathTiles(preds, start, end) {
  const onPath = new Set();
  if (end === start) {
    onPath.add(start);
    return onPath;
  }
  const stack = [end];
  onPath.add(end);
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === start) continue;
    for (const p of preds[node]) {
      if (!onPath.has(p)) {
        onPath.add(p);
        stack.push(p);
      }
    }
  }
  return onPath;
}

// Net sheet shift along a path (sum of neighborSheetDeltas), mod group.
function pathSheetShift(lattice, path) {
  let shift = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const t = lattice.tiles[path[i]];
    const next = path[i + 1];
    for (let k = 0; k < t.neighbors.length; k++) {
      if (t.neighbors[k] === next) {
        shift += t.neighborSheetDeltas[k] | 0;
        break;
      }
    }
  }
  const g = Math.max(lattice.groupOrder, 1);
  return ((shift % g) + g) % g;
}

function euclidean(lattice, a, b) {
  const ca = lattice.tiles[a].centroidF;
  const cb = lattice.tiles[b].centroidF;
  return Math.hypot(ca[0] - cb[0], ca[1] - cb[1]);
}

// Total geometric length of a path.
function pathLength(lattice, path) {
  let len = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    len += edgeLen(lattice, path[i], path[i + 1]);
  }
  return len;
}

// Top-level: compute everything needed for the UI + rendering.
// Returns null if inputs are invalid.
export function computePath(lattice, start, end) {
  if (
    start == null ||
    end == null ||
    start < 0 ||
    end < 0 ||
    start >= lattice.tiles.length ||
    end >= lattice.tiles.length
  ) {
    return null;
  }
  const { dist, hops, preds } = dijkstraAllShortest(lattice, start);
  if (!isFinite(dist[end])) {
    return {
      start,
      end,
      reachable: false,
      euclid: euclidean(lattice, start, end),
    };
  }
  const onPath = shortestPathTiles(preds, start, end);
  const samplePaths = reconstructAll(preds, start, end, 64);
  const numPaths = countShortest(preds, start, end);
  // Use a representative (first) path for sheet shift + hop reporting.
  const rep = samplePaths.length ? samplePaths[0] : [start];
  const sheetShift = pathSheetShift(lattice, rep);
  return {
    start,
    end,
    reachable: true,
    hops: hops[end],
    pathLength: dist[end], // geometric length of the shortest route
    numPaths,
    onPath, // Set<index>
    samplePaths, // up to 64 explicit geometrically-shortest paths
    sheetShift,
    euclid: euclidean(lattice, start, end),
  };
}
