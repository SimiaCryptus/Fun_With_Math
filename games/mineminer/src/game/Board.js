import { EMPTY, MINE, INTACT, MARKED, MINED, SCAR, NEIGHBOUR_STRIDE } from './Grid.js';
import { relocateMinesAwayFrom } from './MineGenerator.js';
import { rngFromSeed } from '../core/rng.js';

export const DEFAULT_BOARD_OPTS = Object.freeze({
  cascade: 'on', // 'on' | 'off' | 'single-layer'
  strictMarks: true,
  lives: 1, // number | Infinity
  safeFirstStrike: true,
  shellMs: 22, // reveal delay per cascade shell
  seed: 'mineminer',
});

export function countMines(grid) {
  let c = 0;
  for (let i = 0; i < grid.cellCount; i++) if (grid.content[i] === MINE) c++;
  return c;
}

/**
 * Rules engine. Deterministic given (grid, opts, action list).
 * Emits on the optional bus: board:started, board:action, cascade, mine:defused,
 * misfire, mine:detonated, board:won, board:lost, board:restored.
 */
export class Board {
  constructor(grid, opts = {}, bus = null) {
    this.grid = grid;
    this.opts = { ...DEFAULT_BOARD_OPTS, ...opts };
    this.bus = bus;
    this.rng = rngFromSeed(`${this.opts.seed}:relocate`);
    this.mineCount = countMines(grid);
    this.safeTotal = grid.cellCount - this.mineCount;
    this.lives = this.opts.lives === Infinity ? Infinity : Number(this.opts.lives) || 1;
    this.status = 'ready'; // 'ready' | 'playing' | 'won' | 'lost'
    this.started = false;
    this.marks = 0;
    this.defused = 0;
    this.scars = 0;
    this.misfires = 0;
    this.minedSafe = 0;
    this.largestCascade = 0;
    this.actionLog = [];
  }

  get isOver() {
    return this.status === 'won' || this.status === 'lost';
  }

  get minesRemaining() {
    return this.mineCount - this.marks - this.defused - this.scars;
  }

  get progress() {
    return this.safeTotal ? this.minedSafe / this.safeTotal : 1;
  }

  isWon() {
    return this.status !== 'lost' && this.minedSafe >= this.safeTotal;
  }

  emit(name, payload) {
    if (this.bus) this.bus.emit(name, payload);
  }

  result(kind, cell) {
    return { kind, cell, revealed: [], defused: [], changed: [], scar: -1, lives: this.lives, won: false, lost: false, reason: null };
  }

  validCell(cell) {
    return Number.isInteger(cell) && cell >= 0 && cell < this.grid.cellCount;
  }

  beginIfNeeded(cell) {
    if (this.started) return;
    this.started = true;
    if (this.opts.safeFirstStrike) relocateMinesAwayFrom(this.grid, cell, this.rng);
    this.status = 'playing';
    this.emit('board:started', { cell });
  }

  // ------------------------------------------------------------- actions

  strike(cell) {
    const r = this.result('noop', cell);
    if (this.isOver || !this.validCell(cell)) return r;
    const { state, content } = this.grid;
    const st = state[cell];
    if (st === MINED || st === SCAR) return r;

    this.beginIfNeeded(cell);
    this.actionLog.push({ type: 'strike', cell });

    if (st === MARKED) {
      this.marks--;
      if (content[cell] === MINE) {
        state[cell] = MINED;
        this.defused++;
        r.kind = 'defused';
        r.defused.push({ cell, delay: 0 });
        this.emit('mine:defused', { cell });
      } else {
        r.kind = 'misfire';
        this.misfires++;
        this.clear(cell, r);
        this.emit('misfire', { cell });
        this.loseLife(r);
      }
    } else if (content[cell] === MINE) {
      this.detonate(cell, r);
    } else {
      r.kind = 'cleared';
      this.clear(cell, r);
    }
    this.finish(r);
    return r;
  }

  toggleMark(cell) {
    const r = this.result('noop', cell);
    if (this.isOver || !this.validCell(cell)) return r;
    const { state } = this.grid;
    const st = state[cell];
    if (st === MINED || st === SCAR) return r;
    if (st === INTACT) {
      if (this.opts.strictMarks && this.minesRemaining <= 0) {
        r.reason = 'mark-limit';
        return r;
      }
      state[cell] = MARKED;
      this.marks++;
      r.kind = 'marked';
    } else {
      state[cell] = INTACT;
      this.marks--;
      r.kind = 'unmarked';
    }
    r.changed.push(cell);
    this.actionLog.push({ type: 'mark', cell });
    this.emit('board:action', r);
    return r;
  }

  /** Chord: if marks around a revealed number equal it, strike every INTACT neighbour. */
  probe(cell) {
    const r = this.result('noop', cell);
    if (this.isOver || !this.validCell(cell)) return r;
    const { state, counts } = this.grid;
    if (state[cell] !== MINED || counts[cell] === 0) {
      r.reason = 'not-a-number';
      return r;
    }
    let marked = 0;
    const targets = [];
    this.grid.forEachNeighbour(cell, (n) => {
      if (state[n] === MARKED) marked++;
      else if (state[n] === INTACT) targets.push(n);
    });
    if (marked !== counts[cell]) {
      r.reason = 'marks-mismatch';
      return r;
    }
    if (!targets.length) {
      r.reason = 'nothing-to-probe';
      return r;
    }
    r.kind = 'probe';
    for (const n of targets) {
      if (this.isOver) break;
      const sub = this.strike(n);
      r.revealed.push(...sub.revealed);
      r.defused.push(...sub.defused);
      r.changed.push(...sub.changed);
      if (sub.kind === 'boom') {
        r.kind = 'boom';
        r.scar = sub.scar;
      }
      r.won = r.won || sub.won;
      r.lost = r.lost || sub.lost;
    }
    r.lives = this.lives;
    return r;
  }

  applyAction(action) {
    if (action.type === 'strike') return this.strike(action.cell);
    if (action.type === 'mark') return this.toggleMark(action.cell);
    return this.result('noop', action.cell);
  }

  replay(log) {
    for (const a of log) this.applyAction(a);
  }

  // ----------------------------------------------------------- internals

  detonate(cell, r) {
    this.grid.state[cell] = SCAR;
    this.scars++;
    r.kind = 'boom';
    r.scar = cell;
    r.changed.push(cell);
    this.emit('mine:detonated', { cell });
    this.loseLife(r);
  }

  loseLife(r) {
    if (this.lives !== Infinity) this.lives--;
    r.lives = this.lives;
    if (this.lives <= 0) {
      this.status = 'lost';
      r.lost = true;
    }
  }

  clear(cell, r) {
    this.reveal(cell, r, 0);
    if (this.grid.counts[cell] === 0 && this.opts.cascade !== 'off') this.cascade(cell, r);
    if (r.revealed.length > this.largestCascade) this.largestCascade = r.revealed.length;
  }

  reveal(cell, r, delay) {
    this.grid.state[cell] = MINED;
    this.minedSafe++;
    r.revealed.push({ cell, delay });
  }

  /** BFS flood fill in expanding shells. Never touches MARKED cells. */
  cascade(start, r) {
    const { grid } = this;
    const { state, content, counts, neighbours } = grid;
    const sameLayer = this.opts.cascade === 'single-layer';
    const y0 = grid.y(start);
    let frontier = [start];
    let shell = 1;
    while (frontier.length) {
      const next = [];
      for (const c of frontier) {
        const base = c * NEIGHBOUR_STRIDE;
        for (let k = 0; k < NEIGHBOUR_STRIDE; k++) {
          const n = neighbours[base + k];
          if (n < 0 || state[n] !== INTACT) continue;
          if (content[n] === MINE) continue; // impossible when counts[c] === 0, defensive
          if (sameLayer && grid.y(n) !== y0) continue;
          this.reveal(n, r, shell * this.opts.shellMs);
          if (counts[n] === 0) next.push(n);
        }
      }
      frontier = next;
      shell++;
    }
    if (r.revealed.length > 1) this.emit('cascade', { origin: start, size: r.revealed.length, shells: shell - 1 });
  }

  finish(r) {
    if (this.status !== 'lost' && this.minedSafe >= this.safeTotal) {
      this.status = 'won';
      r.won = true;
      // Remaining mines are solved by elimination: auto-defuse them in a chain of pops.
      let delay = r.revealed.length ? r.revealed[r.revealed.length - 1].delay : 0;
      const { content, state } = this.grid;
      for (let i = 0; i < this.grid.cellCount; i++) {
        if (content[i] !== MINE || state[i] === MINED || state[i] === SCAR) continue;
        if (state[i] === MARKED) this.marks--;
        state[i] = MINED;
        this.defused++;
        delay += 45;
        r.defused.push({ cell: i, delay });
      }
    }
    r.lives = this.lives;
    this.emit('board:action', r);
    if (r.won) this.emit('board:won', { board: this });
    if (r.lost) this.emit('board:lost', { board: this, cell: r.scar });
  }

  // --------------------------------------------------------------- undo

  snapshot() {
    return {
      content: this.grid.content.slice(),
      state: this.grid.state.slice(),
      counts: this.grid.counts.slice(),
      status: this.status,
      started: this.started,
      lives: this.lives,
      marks: this.marks,
      defused: this.defused,
      scars: this.scars,
      misfires: this.misfires,
      minedSafe: this.minedSafe,
      largestCascade: this.largestCascade,
      actionLog: this.actionLog.slice(),
    };
  }

  restore(s) {
    this.grid.content.set(s.content);
    this.grid.state.set(s.state);
    this.grid.counts.set(s.counts);
    this.status = s.status;
    this.started = s.started;
    this.lives = s.lives;
    this.marks = s.marks;
    this.defused = s.defused;
    this.scars = s.scars;
    this.misfires = s.misfires;
    this.minedSafe = s.minedSafe;
    this.largestCascade = s.largestCascade;
    this.actionLog = s.actionLog.slice();
    this.emit('board:restored', { board: this });
  }
}

export { EMPTY, MINE, INTACT, MARKED, MINED, SCAR };