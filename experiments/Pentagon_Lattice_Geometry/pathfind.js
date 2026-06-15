// pathfind.js
  // Shortest-path tools over the lattice adjacency graph.
  //
  // Tiles are nodes; an edge exists between a tile and each of its
  // non-null neighbors. We compute BFS shortest distance (unweighted,
  // each edge = 1 hop) from a start tile, and reconstruct ALL shortest
  // paths to an end tile. We also report metrics: hop distance, the
  // number of distinct shortest paths, the net sheet shift along a path,
  // and the straight-line (Euclidean) distance between centroids.

  // Compute BFS layers + predecessor sets (for all shortest paths).
  // Returns { dist: Int32Array, preds: Array<number[]> }.
  function bfsAllShortest(lattice, start) {
    const tiles = lattice.tiles;
    const n = tiles.length;
    const dist = new Int32Array(n).fill(-1);
    const preds = new Array(n);
    for (let i = 0; i < n; i++) preds[i] = [];
    dist[start] = 0;
    const queue = [start];
    let head = 0;
    while (head < queue.length) {
      const u = queue[head++];
      const du = dist[u];
      const nbrs = tiles[u].neighbors;
      for (let k = 0; k < nbrs.length; k++) {
        const v = nbrs[k];
        if (v === null) continue;
        if (dist[v] === -1) {
          dist[v] = du + 1;
          preds[v].push(u);
          queue.push(v);
        } else if (dist[v] === du + 1) {
          preds[v].push(u);
        }
      }
    }
    return { dist, preds };
  }

  // Reconstruct all shortest paths from start to end as arrays of tile
  // indices. Capped at `maxPaths` to avoid combinatorial explosion.
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

  // Count the number of distinct shortest paths to `end` (may be large).
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

  // Set of all tile indices that lie on SOME shortest path start→end.
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

  // Top-level: compute everything needed for the UI + rendering.
  // Returns null if no path exists.
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
    const { dist, preds } = bfsAllShortest(lattice, start);
    if (dist[end] === -1) {
      return { start, end, reachable: false };
    }
    const onPath = shortestPathTiles(preds, start, end);
    const samplePaths = reconstructAll(preds, start, end, 64);
    const numPaths = countShortest(preds, start, end);
    // Use the first sample path for a representative sheet shift.
    const sheetShift = samplePaths.length ? pathSheetShift(lattice, samplePaths[0]) : 0;
    return {
      start,
      end,
      reachable: true,
      hops: dist[end],
      numPaths,
      onPath, // Set<index>
      samplePaths, // up to 64 explicit paths (edges to draw)
      sheetShift,
      euclid: euclidean(lattice, start, end),
    };
  }