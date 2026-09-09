/**
 * Selection — the in-progress path (§4.1). Lives outside game.js because it is
 * transient input state, not round state; it emits 'change' with the new path.
 */

export class Selection extends EventTarget {
  constructor(grid) {
    super();
    this.grid = grid;
    /** @type {number[]} */
    this.path = [];
  }

  get word() {
    return this.grid.wordFromPath(this.path);
  }

  /** Indices that may legally extend the current path. */
  legal() {
    const set = new Set();
    if (this.path.length === 0) return set;
    const last = this.path[this.path.length - 1];
    for (const j of this.grid.neighbours(last)) {
      if (!this.path.includes(j)) set.add(j);
    }
    return set;
  }

  /** Tap semantics: append / backtrack (tap last) / clear (tap first). */
  tap(idx) {
    const n = this.path.length;
    if (n === 0) return this._commit([idx]);
    if (idx === this.path[n - 1]) return this._commit(this.path.slice(0, -1));
    if (idx === this.path[0]) return this._commit([]);
    if (this.path.includes(idx)) return this._reject(idx);
    if (!this.grid.isAdjacent(this.path[n - 1], idx)) return this._reject(idx);
    return this._commit([...this.path, idx]);
  }

  /** Trail semantics used while dragging: extend, or retreat one step. */
  trail(idx) {
    const n = this.path.length;
    if (n === 0) return this._commit([idx]);
    if (idx === this.path[n - 1]) return false;
    if (n > 1 && idx === this.path[n - 2]) return this._commit(this.path.slice(0, -1));
    if (this.path.includes(idx)) return false;
    if (!this.grid.isAdjacent(this.path[n - 1], idx)) return false;
    return this._commit([...this.path, idx]);
  }

  pop() {
    if (!this.path.length) return false;
    return this._commit(this.path.slice(0, -1));
  }

  clear({ silent = false } = {}) {
    if (!this.path.length) return false;
    this.path = [];
    if (!silent) this._emit(null);
    return true;
  }

  _commit(path) {
    this.path = path;
    this._emit(null);
    return true;
  }

  _reject(idx) {
    this._emit(idx);
    return false;
  }

  _emit(rejected) {
    const e = new Event('change');
    e.detail = { path: this.path.slice(), word: this.word, rejected };
    this.dispatchEvent(e);
  }
}

export default Selection;