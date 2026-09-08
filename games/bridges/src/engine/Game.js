import { Connectivity } from './Connectivity.js';
import { ChordState } from './Chords.js';
import { checkGoal } from './Goals.js';
import { connectionDistance } from './Score.js';
import { GoState } from './Go.js';
import { SWAP, PASS } from '../config.js';

export { SWAP, PASS };

/**
 * State machine.  Moves are the truth: state = board + config + move list.
 * Undo replays the move list; nothing is ever rolled back in place.
 *
 * Two rule sets share the machine:
 *   connect (goal opposite | fork) — claims are permanent; win by linking arcs.
 *   go      (goal go)              — stones can be captured, passing is allowed,
 *                                    a full round of passes ends the game and
 *                                    area score decides it.
 */
export class Game {
  constructor(board, config) {
    this.board = board;
    this.config = config;
    this.players = config.players;
    this.rules = config.goal === 'go' ? 'go' : 'connect';
    this.pie = (config.variants || []).includes('pie');
    this._listeners = new Map();
    this.flagged = -1; // colour that ran out of time; survives replay (no take-backs on the clock)
    this._init();
  }

  _init() {
    const n = this.board.cells.length;
    this.go = this.rules === 'go' ? new GoState(this.board, this.players) : null;
    this.owner = this.go ? this.go.owner : new Int8Array(n).fill(-1);
    this.claimTime = new Int32Array(n).fill(-1);
    this.moves = [];
    this.claims = 0;   // stones placed
    this.plies = 0;    // turns taken (placements + passes)
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
  get turn() { return this.plies % this.players; }
  /** Seat (human) controlling a colour — differs only after a pie-rule swap. */
  seatOf(colour) { return this.swapped && this.players === 2 ? 1 - colour : colour; }
  colourOf(seat) { return this.seatOf(seat); }

  canSwap() {
    return this.pie && this.phase === 'playing' && this.players === 2 &&
           this.plies === 1 && this.claims === 1 && !this.swapped;
  }
  canPass() { return this.rules === 'go' && this.phase === 'playing'; }
  isLegal(cell) {
    if (this.phase !== 'playing' || !Number.isInteger(cell) || cell < 0 || cell >= this.owner.length) return false;
    return this.go ? this.go.isLegal(cell, this.turn) : this.owner[cell] === -1;
  }
  legalCells() {
    if (this.phase !== 'playing') return [];
    if (this.go) return this.go.legalCells(this.turn);
    const out = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === -1) out.push(i);
    return out;
  }

  swap() {
    if (!this.canSwap()) throw new Error('swap not allowed now');
    this._swap();
    this.emit('move', { swap: true });
  }
  _swap() { this.swapped = true; this.moves.push(SWAP); }

  pass() {
    if (!this.canPass()) throw new Error('pass not allowed now');
    const result = this._pass();
    this.emit('move', result);
    if (this.phase !== 'playing') this.emit('end', { phase: this.phase, winner: this.winner });
    return result;
  }
  _pass() {
    const moveNumber = this.moves.length;
    const { player } = this.go.pass();
    this.moves.push(PASS);
    this.plies++;
    if (this.go.over) this._finishGo();
    return { pass: true, player, moveNumber, unions: [], bridges: [], links: [], captured: [] };
  }

  play(cell) {
    if (!this.isLegal(cell)) throw new Error(`illegal move ${cell}`);
    const result = this._apply(cell);
    this.emit('move', result);
    if (this.phase !== 'playing') this.emit('end', { phase: this.phase, winner: this.winner });
    return result;
  }

  _apply(cell) { return this.go ? this._applyGo(cell) : this._applyConnect(cell); }

  _applyConnect(cell) {
    const player = this.turn;
    const moveNumber = this.moves.length;
    this.owner[cell] = player;
    this.claimTime[cell] = moveNumber;
    const { unions, severed } = this.chords.activate(cell, player, moveNumber, this.owner);
    this.conn.claim(cell, player, this.owner, unions);
    this.moves.push(cell);
    this.claims++;
    this.plies++;
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
    return { cell, player, moveNumber, unions, bridges, links, captured: [] };
  }

  _applyGo(cell) {
    const moveNumber = this.moves.length;
    const { player, captured } = this.go.play(cell);
    this.claimTime[cell] = moveNumber;
    for (const c of captured) this.claimTime[c] = -1;
    this.moves.push(cell);
    this.claims++;
    this.plies++;
    const links = [];
    for (const nb of this.board.cells[cell].neighbors) {
      if (this.owner[nb] === player) links.push([cell, nb, player]);
    }
    return { cell, player, moveNumber, unions: [], bridges: [], links, captured };
  }

  /** Every colour passed in turn: score the board. */
  _finishGo() {
    const { area } = this.go.score();
    let winner = -1, best = -1, tie = false;
    for (let p = 0; p < this.players; p++) {
      if (area[p] > best) { best = area[p]; winner = p; tie = false; }
      else if (area[p] === best) tie = true;
    }
    if (tie) { this.phase = 'draw'; this.winner = -1; return; }
    this.phase = 'won';
    this.winner = winner;
    this.winningCells = [];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === winner) this.winningCells.push(i);
  }

  /**
   * For every cell: how many of its owner's border arcs its group actually
   * reaches (0 = floating, 1 = anchored to one side, 2 = spans both).
   * Sides mean nothing in Go, so every cell reads 0 there.
   */
  connectionCounts() {
    const n = this.owner.length;
    const out = new Uint8Array(n);
    if (this.go) return out;
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
    const score = this.go ? this.go.score() : null;
    // connect: fewest cells still needed wins; go: largest area wins
    const standing = p => (score ? score.area[p] : -connectionDistance(this.board, this.owner, p));
    let winner = -1, best = -Infinity;
    for (let p = 0; p < this.players; p++) {
      if (p === loser) continue;
      const v = standing(p);
      if (winner < 0 || v > best) { winner = p; best = v; }
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
      else if (m === PASS) { if (this.canPass()) this._pass(); }
      else if (this.isLegal(m)) this._apply(m);
    }
    if (this.flagged >= 0 && this.phase === 'playing') this._applyTimeout();
    this.emit('sync');
  }
}