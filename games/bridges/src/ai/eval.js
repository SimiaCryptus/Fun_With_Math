/**
 * Static evaluation shared by every bot level.  Pure: no DOM, no three.js.
 *
 * The AI reasons on the adjacency graph *plus* chord partners (cells that only
 * touch at a pinched vertex), because in `bridge` / `open` modes those are
 * real connections most of the time.  `strict` uses edge adjacency only.
 */
export const INF = 0x3fffffff;

export function extendedAdjacency(board, crossingMode) {
  if (crossingMode === 'strict') return board.cells.map(c => c.neighbors);
  return board.cells.map(c => {
    const set = new Set(c.neighbors);
    for (const id of c.chords) {
      const ch = board.chords[id];
      set.add(ch.a === c.id ? ch.b : ch.a);
    }
    return [...set];
  });
}

export class Evaluator {
  constructor(board, crossingMode, players) {
    this.board = board;
    this.players = players;
    this.n = board.cells.length;
    this.adj = extendedAdjacency(board, crossingMode);
    this.arcs = Array.from({ length: players }, (_, p) =>
      board.arcs.filter(a => a.owner === p).map(a => a.cells));
    this.DA = new Int32Array(this.n);
    this.DB = new Int32Array(this.n);
  }

  /** Bucketed Dijkstra: 1 to enter an empty cell, 0 for own cells, enemies block. */
  _dijkstra(owner, player, sources, D) {
    D.fill(INF);
    const buckets = [];
    const push = (id, d) => { if (d < D[id]) { D[id] = d; (buckets[d] ??= []).push(id); } };
    for (const id of sources) {
      const o = owner[id];
      if (o === -1 || o === player) push(id, o === player ? 0 : 1);
    }
    for (let d = 0; d < buckets.length; d++) {
      const b = buckets[d];
      if (!b) continue;
      for (let k = 0; k < b.length; k++) {
        const id = b[k];
        if (D[id] !== d) continue;
        for (const nb of this.adj[id]) {
          const o = owner[nb];
          if (o !== -1 && o !== player) continue;
          push(nb, d + (o === player ? 0 : 1));
        }
      }
    }
  }

  /**
   * Shortest arc-to-arc path for `player` (in empty cells still needed), how
   * many cells lie on *some* shortest path (`width`), and the empty ones (`cells`).
   */
  pathInfo(owner, player) {
    const arcs = this.arcs[player];
    if (!arcs || arcs.length < 2) return { d: INF, width: 0, cells: [] };
    this._dijkstra(owner, player, arcs[0], this.DA);
    this._dijkstra(owner, player, arcs[1], this.DB);
    const { DA, DB, n } = this;
    let d = INF;
    for (let i = 0; i < n; i++) {
      if (DA[i] >= INF || DB[i] >= INF) continue;
      const t = DA[i] + DB[i] - (owner[i] === player ? 0 : 1);
      if (t < d) d = t;
    }
    const cells = [];
    let width = 0;
    if (d < INF) {
      for (let i = 0; i < n; i++) {
        if (DA[i] >= INF || DB[i] >= INF) continue;
        if (DA[i] + DB[i] - (owner[i] === player ? 0 : 1) !== d) continue;
        width++;
        if (owner[i] === -1) cells.push(i);
      }
    }
    return { d, width, cells };
  }

  /** Position value from `player`'s point of view.  ±1e6 = decided. */
  score(owner, player) {
    const me = this.pathInfo(owner, player);
    if (me.d === 0) return 1e6;
    let opp = null;
    for (let p = 0; p < this.players; p++) {
      if (p === player) continue;
      const o = this.pathInfo(owner, p);
      if (!opp || o.d < opp.d) opp = o;
    }
    if (!opp) return -Math.min(me.d, 60) * 100;
    if (opp.d === 0) return -1e6;
    let s = (Math.min(opp.d, 60) - Math.min(me.d, 60)) * 100 + (me.width - opp.width);
    if (opp.d === 1) s -= 10000; // they win next move unless this is a block
    return s;
  }
}