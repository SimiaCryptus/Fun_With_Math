import { ChordState } from '../engine/Chords.js';
import { Connectivity } from '../engine/Connectivity.js';

/**
 * Lean playout simulator: a clone of a Game's position (owners, live chords,
 * union-find forests) that can be reset and played to the end thousands of
 * times without touching the real game or its listeners.
 */
export class Position {
  constructor(game) {
    this.game = game;
    this.board = game.board;
    this.players = game.players;
    this.goal = game.config.goal;
    this.n = this.board.cells.length;
    this.owner = new Int8Array(this.n);
    this.chords = new ChordState(this.board, game.config.crossingMode);
    this.conn = new Connectivity(this.board, this.players);
    this.sentinels = Array.from({ length: this.players }, (_, p) =>
      this.board.arcs.filter(a => a.owner === p).map(a => this.conn.sentinel(a.id)));
    this.empty = [];
    this.claims = 0;
    this.move = 0;
  }

  _reset() {
    const g = this.game;
    this.owner.set(g.owner);
    this.chords.live.set(g.chords.live);
    this.chords.birth.set(g.chords.birth);
    for (let p = 0; p < this.players; p++) {
      const src = g.conn.sets[p], dst = this.conn.sets[p];
      dst.parent.set(src.parent);
      dst.size.set(src.size);
    }
    this.empty.length = 0;
    for (let i = 0; i < this.n; i++) if (this.owner[i] === -1) this.empty.push(i);
    this.claims = g.claims;
    this.move = g.moves.length;
  }

  _claim(cell, player) {
    this.owner[cell] = player;
    const { unions } = this.chords.activate(cell, player, this.move++, this.owner);
    this.conn.claim(cell, player, this.owner, unions);
    this.claims++;
    return this._won(player);
  }

  _won(p) {
    const s = this.sentinels[p];
    if (s.length < 2) return false;
    if (this.goal === 'fork') return s.every(x => this.conn.same(p, s[0], x));
    return this.conn.same(p, s[0], s[1]);
  }

  /** Play `first` for `me`, then uniformly random moves to the end. 1 win / 0.5 draw / 0 loss. */
  playout(first, me, rand) {
    this._reset();
    const e = this.empty;
    const k0 = e.indexOf(first);
    if (k0 >= 0) { e[k0] = e[e.length - 1]; e.pop(); }
    if (this._claim(first, me)) return 1;
    let turn = this.claims % this.players;
    while (e.length) {
      const k = Math.floor(rand() * e.length);
      const c = e[k];
      e[k] = e[e.length - 1]; e.pop();
      if (this._claim(c, turn)) return turn === me ? 1 : 0;
      turn = (turn + 1) % this.players;
    }
    return 0.5;
  }
}