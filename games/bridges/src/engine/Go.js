/**
 * Go on an arbitrary tiling.
 *
 *  - Liberties run along shared *edges* only; the crossing rule (chords) plays
 *    no part, so every tiling — clean or pinched — is a legal Go board.
 *  - Any number of colours: a group with no liberties is captured whoever
 *    surrounds it.  Suicide is forbidden.  Simple ko: a lone stone that took
 *    exactly one stone may not be retaken immediately.
 *  - Passing is always allowed; the game is over when every colour has
 *    passed in turn.  Area scoring: stones + empty regions bordered by only
 *    one colour.  Dead stones are not removed — play them out.
 *
 * Pure and allocation-light (stamp-marked flood fills, no per-move Sets), so
 * bots can `copyFrom` a position and run thousands of playouts on it.
 */
export class GoState {
  constructor(board, players) {
    this.board = board;
    this.players = players;
    const n = this.n = board.cells.length;
    this.owner = new Int8Array(n).fill(-1);
    this.captures = new Int32Array(players); // stones taken BY each colour
    this.turn = 0;
    this.plies = 0;
    this.passes = 0;      // consecutive passes
    this.koCell = -1;     // point that may not be retaken right now ...
    this.koStone = -1;    // ... if doing so would capture exactly this stone
    this.over = false;
    this._mark = new Int32Array(n);
    this._lib = new Int32Array(n);
    this._stamp = 0;
    this.members = [];    // cells of the group found by the last `group()` call
    this._caps = [];      // captures found by the last `isLegal()` call
  }

  copyFrom(o) {
    this.owner.set(o.owner);
    this.captures.set(o.captures);
    this.turn = o.turn; this.plies = o.plies; this.passes = o.passes;
    this.koCell = o.koCell; this.koStone = o.koStone; this.over = o.over;
  }

  /** Flood-fill the group containing `start` into `members`; returns its liberty count. */
  group(start) {
    const { owner, board, _mark: mark, _lib: lib } = this;
    const stamp = ++this._stamp;
    const colour = owner[start];
    const m = this.members;
    m.length = 0;
    m.push(start);
    mark[start] = stamp;
    let libs = 0;
    for (let k = 0; k < m.length; k++) {
      for (const nb of board.cells[m[k]].neighbors) {
        const o = owner[nb];
        if (o === -1) { if (lib[nb] !== stamp) { lib[nb] = stamp; libs++; } }
        else if (o === colour && mark[nb] !== stamp) { mark[nb] = stamp; m.push(nb); }
      }
    }
    return libs;
  }

  /** Enemy stones that a stone of `player` on the empty `cell` would capture. */
  capturesAt(cell, player, out = []) {
    out.length = 0;
    const { owner, board } = this;
    for (const nb of board.cells[cell].neighbors) {
      const o = owner[nb];
      if (o === -1 || o === player || out.includes(nb)) continue;
      // an adjacent group with a single liberty: that liberty is `cell`
      if (this.group(nb) === 1) for (const m of this.members) out.push(m);
    }
    return out;
  }

  isLegal(cell, player = this.turn) {
    const { owner } = this;
    if (this.over || !(cell >= 0 && cell < this.n) || owner[cell] !== -1) return false;
    const caps = this.capturesAt(cell, player, this._caps);
    if (caps.length) return !(cell === this.koCell && caps.length === 1 && caps[0] === this.koStone);
    for (const nb of this.board.cells[cell].neighbors) {
      const o = owner[nb];
      if (o === -1) return true;                              // keeps a liberty
      if (o === player && this.group(nb) >= 2) return true;   // joins a group that keeps one
    }
    return false;                                             // suicide
  }

  legalCells(player = this.turn) {
    const out = [];
    if (this.over) return out;
    for (let i = 0; i < this.n; i++) if (this.owner[i] === -1 && this.isLegal(i, player)) out.push(i);
    return out;
  }

  play(cell) {
    const player = this.turn;
    if (!this.isLegal(cell, player)) throw new Error(`illegal move ${cell}`);
    return this._place(cell, player);
  }

  /** Assumes `isLegal(cell, player)` was the last legality query (it fills `_caps`). */
  _place(cell, player) {
    const captured = this._caps.slice();
    this.owner[cell] = player;
    for (const c of captured) this.owner[c] = -1;
    this.captures[player] += captured.length;
    if (captured.length === 1 && this.group(cell) === 1 && this.members.length === 1) {
      this.koCell = captured[0];
      this.koStone = cell;
    } else {
      this.koCell = -1;
      this.koStone = -1;
    }
    this.passes = 0;
    this._advance();
    return { cell, player, captured };
  }

  pass() {
    const player = this.turn;
    this.passes++;
    this.koCell = -1;
    this.koStone = -1;
    this._advance();
    if (this.passes >= this.players) this.over = true;
    return { pass: true, player };
  }

  _advance() {
    this.plies++;
    this.turn = (this.turn + 1) % this.players;
  }

  /** Area scoring: stones + empty regions touching stones of exactly one colour. */
  score() {
    const P = this.players, n = this.n;
    const { owner, board, _mark: mark } = this;
    const stones = new Int32Array(P), territory = new Int32Array(P), area = new Int32Array(P);
    const stamp = ++this._stamp;
    const m = this.members;
    for (let i = 0; i < n; i++) {
      const o = owner[i];
      if (o >= 0) { stones[o]++; continue; }
      if (mark[i] === stamp) continue;
      m.length = 0;
      m.push(i);
      mark[i] = stamp;
      let colours = 0;
      for (let k = 0; k < m.length; k++) {
        for (const nb of board.cells[m[k]].neighbors) {
          const q = owner[nb];
          if (q === -1) { if (mark[nb] !== stamp) { mark[nb] = stamp; m.push(nb); } }
          else colours |= 1 << q;
        }
      }
      if (colours && !(colours & (colours - 1))) territory[31 - Math.clz32(colours)] += m.length;
    }
    for (let p = 0; p < P; p++) area[p] = stones[p] + territory[p];
    return { stones, territory, area, captures: Int32Array.from(this.captures) };
  }
}