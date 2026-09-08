import { Connectivity } from './Connectivity.js';
import { ChordState } from './Chords.js';
import { checkGoal } from './Goals.js';
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
    this.phase = 'playing'; // playing | won | draw
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
    return { cell, player, moveNumber, unions, bridges };
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
    this.emit('sync');
  }
}