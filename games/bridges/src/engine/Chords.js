/**
 * Per-vertex non-crossing chord bookkeeping — the Bridge Rule.
 *
 *  strict : diagonals never connect.
 *  bridge : a chord goes live when its second endpoint is claimed, unless a
 *           conflicting (crossing) chord is already live — then the older one
 *           "bridges over" and the new one is severed.  Live chords are never
 *           revoked, so union-find stays valid (undo = replay).
 *  open   : every same-owner diagonal connects.
 */
export class ChordState {
  constructor(board, mode = 'bridge') {
    this.board = board;
    this.mode = mode;
    this.live = new Uint8Array(board.chords.length);
    this.birth = new Int32Array(board.chords.length).fill(-1);
  }

  isLive(id) { return this.live[id] === 1; }

  activate(cell, player, moveNumber, owner) {
    const unions = [], severed = [];
    if (this.mode === 'strict') return { unions, severed };
    const chords = this.board.chords;
    for (const id of this.board.cells[cell].chords) {
      const ch = chords[id];
      const other = ch.a === cell ? ch.b : ch.a;
      if (owner[other] !== player) continue;
      if (this.mode === 'bridge') {
        let blocker = -1;
        for (const c of ch.conflicts) {
          if (this.live[c] && (blocker < 0 || this.birth[c] < this.birth[blocker])) blocker = c;
        }
        if (blocker >= 0) {
          severed.push({ vertexId: ch.vertexId, over: blocker, under: id });
          continue;
        }
      }
      this.live[id] = 1;
      this.birth[id] = moveNumber;
      unions.push([ch.a, ch.b]);
    }
    return { unions, severed };
  }

  /** Invariant check (tests): no two live chords may cross. */
  nonCrossing() {
    for (const ch of this.board.chords) {
      if (!this.live[ch.id]) continue;
      for (const c of ch.conflicts) if (this.live[c]) return false;
    }
    return true;
  }
}