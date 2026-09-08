import { DisjointSet } from './DisjointSet.js';

/** One union-find forest per player, plus one sentinel node per border arc. */
export class Connectivity {
  constructor(board, players) {
    this.board = board;
    this.n = board.cells.length;
    this.sets = Array.from({ length: players }, () => new DisjointSet(this.n + board.arcs.length));
  }

  sentinel(arcId) { return this.n + arcId; }

  /** `unions` are extra (chord) links already resolved by the crossing rule. */
  claim(cell, player, owner, unions = []) {
    const ds = this.sets[player];
    for (const nb of this.board.cells[cell].neighbors) if (owner[nb] === player) ds.union(cell, nb);
    for (const [a, b] of unions) ds.union(a, b);
    for (const arc of this.board.cells[cell].arcs) ds.union(cell, this.sentinel(arc));
  }

  same(player, x, y) { return this.sets[player].same(x, y); }

  /** All cells of `player` in the same component as border arc `arcId`. */
  chain(player, arcId, owner) {
    const ds = this.sets[player];
    const root = ds.find(this.sentinel(arcId));
    const out = [];
    for (let i = 0; i < this.n; i++) if (owner[i] === player && ds.find(i) === root) out.push(i);
    return out;
  }
}