import { Connectivity } from './Connectivity.js';
import { ChordState } from './Chords.js';
import { checkGoal } from './Goals.js';
import { connectionDistance } from './Score.js';
import { SWAP } from '../config.js';

export { SWAP };

/**
 * State machine.  Moves are the truth: state = board + config + move list.
 * Undo replays the move list; nothing is ever rolled back in place.
 */
export class Game {
  constructor(board, config) {
    this.board = board;
    this.config = config;
    this.players = config.players;
    this.pie = (config.variants || []).includes('pie');
    this._listeners = new Map();
     this.flagged = -1; // colour that ran out of time; survives replay (no take-backs on the clock)
    this._init();
  }

  _init() {
    const n = this.board.cells.length;
    this.owner = new Int8Array(n).fill(-1);
    this.claimTime = new Int32Array(n).fill(-1);
    this.moves = [];
    this.claims = 0;
    this.swapped = false;
    this.winner = -1;
     this.phase = 'playing'; // playing | won | draw | timeout
    this.winningCells = [];
    this.bridges = [];
    this.chords = new ChordState(this.board, this.config.crossingMode);
    this.conn = new Connectivity(this.board, this.players);
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event).push(fn);
    return () => {
      const list = this._listeners.get(event);
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }
  emit(event, payload) { for (const fn of this._listeners.get(event) ?? []) fn(payload); }

  /** Colour whose turn it is. */
  get turn() { return this.claims % this.players; }
  /** Seat (human) controlling a colour — differs only after a pie-rule swap. */
  seatOf(colour) { return this.swapped && this.players === 2 ? 1 - colour : colour; }
  colourOf(seat) { return this.seatOf(seat); }

  canSwap() {
    return this.pie && this.phase === 'playing' && this.players === 2 && this.claims === 1 && !this.swapped;
  }
  isLegal(cell) {
    return this.phase === 'playing' && Number.isInteger(cell) && cell >= 0 &&
           cell < this.owner.length && this.owner[cell] === -1;
  }
  legalCells() {
    const out = [];
    if (this.phase !== 'playing') return out;
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === -1) out.push(i);
    return out;
  }

  swap() {
    if (!this.canSwap()) throw new Error('swap not allowed now');
    this._swap();
    this.emit('move', { swap: true });
  }
  _swap() { this.swapped = true; this.moves.push(SWAP); }

  play(cell) {
    if (!this.isLegal(cell)) throw new Error(`illegal move ${cell}`);
    const result = this._apply(cell);
    this.emit('move', result);
    if (this.phase !== 'playing') this.emit('end', { phase: this.phase, winner: this.winner });
    return result;
  }

  _apply(cell) {
    const player = this.turn;
    const moveNumber = this.moves.length;
    this.owner[cell] = player;
    this.claimTime[cell] = moveNumber;
    const { unions, severed } = this.chords.activate(cell, player, moveNumber, this.owner);
    this.conn.claim(cell, player, this.owner, unions);
    this.moves.push(cell);
    this.claims++;
    const links = [];
    for (const nb of this.board.cells[cell].neighbors) {
      if (this.owner[nb] === player) links.push([cell, nb, player]);
    }
    for (const [a, b] of unions) links.push([a, b, player]);
    const bridges = severed.map(s => ({
      ...s, moveNumber,
      owner: this.owner[this.board.chords[s.over].a],   // who bridges over
      underOwner: player,                                // who got cut
    }));
    this.bridges.push(...bridges);
    if (checkGoal(this.config.goal, player, this)) {
      this.winner = player;
      this.phase = 'won';
      const arc = this.board.arcs.find(a => a.owner === player);
      this.winningCells = this.conn.chain(player, arc.id, this.owner);
    } else if (this.claims === this.owner.length) {
      this.phase = 'draw';
    }
    return { cell, player, moveNumber, unions, bridges, links };
  }
  /**
   * For every cell: how many of its owner's border arcs its group actually
   * reaches (0 = floating, 1 = anchored to one side, 2 = spans both).
   */
  connectionCounts() {
    const n = this.owner.length;
    const out = new Uint8Array(n);
    for (let p = 0; p < this.players; p++) {
      const ds = this.conn.sets[p];
      const roots = this.board.arcs
        .filter(a => a.owner === p)
        .map(a => ds.find(this.conn.sentinel(a.id)));
      if (!roots.length) continue;
      for (let i = 0; i < n; i++) {
        if (this.owner[i] !== p) continue;
        const r = ds.find(i);
        let c = 0;
        for (const rt of roots) if (rt === r) c++;
        out[i] = c;
      }
    }
    return out;
  }
  /** Every realised link between two same-owner cells: [a, b, owner]. */
  links() {
    const out = [];
    for (const c of this.board.cells) {
      const o = this.owner[c.id];
      if (o < 0) continue;
      for (const nb of c.neighbors) if (nb > c.id && this.owner[nb] === o) out.push([c.id, nb, o]);
    }
    for (const ch of this.board.chords) {
      if (!this.chords.isLive(ch.id)) continue;
      const o = this.owner[ch.a];
      if (o >= 0 && this.owner[ch.b] === o) out.push([ch.a, ch.b, o]);
    }
    return out;
  }
   /** `colour` ran out of time.  The best-placed remaining colour wins. */
   timeout(colour) {
     if (this.phase !== 'playing') return false;
     this.flagged = colour;
     this._applyTimeout();
     this.emit('sync');
     this.emit('end', { phase: this.phase, winner: this.winner, loser: colour });
     return true;
   }
   _applyTimeout() {
     const loser = this.flagged;
     let winner = -1, best = Infinity;
     for (let p = 0; p < this.players; p++) {
       if (p === loser) continue;
       const d = connectionDistance(this.board, this.owner, p);
       if (winner < 0 || d < best) { winner = p; best = d; }
     }
     this.winner = winner;
     this.phase = 'timeout';
     this.winningCells = [];
     for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === winner) this.winningCells.push(i);
   }


  undo() {
    if (!this.moves.length) return false;
    this.replay(this.moves.slice(0, -1));
    return true;
  }

  reset() { this._init(); this.emit('sync'); }

  /** Rebuild from scratch; illegal entries are skipped silently. Emits `sync`. */
  replay(moves) {
    this._init();
    for (const m of moves) {
      if (m === SWAP) { if (this.canSwap()) this._swap(); }
      else if (this.isLegal(m)) this._apply(m);
    }
     if (this.flagged >= 0 && this.phase === 'playing') this._applyTimeout();
    this.emit('sync');
  }
}