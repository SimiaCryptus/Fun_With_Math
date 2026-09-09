/**
 * Game — the single source of truth. See idea.md §2.4 and §8.
 *
 *   LOBBY → COUNTDOWN → PLAYING → RESULTS
 *
 * Emits (as EventTarget events with a `.detail` payload):
 *   'state'  { from, to }
 *   'tick'   { state, remaining, elapsed }
 *   'word'   SubmitResult  (a scored word)
 *   'miss'   SubmitResult  (rejected submission)
 *   'end'    Results
 *
 * Never touches the DOM or three.js. All input paths call submitWord().
 */

import { findAllPaths } from './solver.js';
import { bestScore, totalScore } from './scoring.js';

export const STATE = Object.freeze({
  LOBBY: 'lobby',
  COUNTDOWN: 'countdown',
  PLAYING: 'playing',
  RESULTS: 'results',
});

export const REASON = Object.freeze({
  OK: 'ok',
  NOT_PLAYING: 'not-playing',
  EMPTY: 'empty',
  TOO_SHORT: 'too-short',
  ALREADY_FOUND: 'already-found',
  NOT_A_WORD: 'not-a-word',
  NO_PATH: 'no-path',
  BAD_PATH: 'bad-path',
});

/** Lowercase, accent-fold, strip everything that is not a–z (§2.1 / §4.3). */
export function normaliseWord(raw) {
  return String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export class Game extends EventTarget {
  /**
   * @param {object} [opts]
   * @param {number} [opts.duration=180]     seconds of play
   * @param {number} [opts.countdown=3]      seconds before input unlocks
   * @param {number} [opts.minWordLength]    overrides board.minWordLength
   * @param {() => number} [opts.now]        clock in ms (injectable for tests)
   * @param {boolean} [opts.autoTick=true]   drive tick() from setInterval
   * @param {number} [opts.tickInterval=100] ms
   */
  constructor(opts = {}) {
    super();
    this.duration = opts.duration ?? 180;
    this.countdown = opts.countdown ?? 3;
    this._minWordLength = opts.minWordLength ?? null;
    this.now = opts.now ?? (() => Date.now());
    this.autoTick = opts.autoTick ?? true;
    this.tickInterval = opts.tickInterval ?? 100;

    this.state = STATE.LOBBY;
    this.board = null;
    /** @type {Map<string, {word:string, score:object, path:number[], at:number}>} */
    this.found = new Map();
    this.misses = 0;
    this.results = null;

    this._timer = null;
    this._phaseStart = 0;
    this._playStart = 0;
    this._endedAt = 0;
  }

  // ------------------------------------------------------------ accessors

  get minWordLength() {
    return this._minWordLength ?? this.board?.minWordLength ?? 3;
  }

  get grid() {
    return this.board?.grid ?? null;
  }

  get score() {
    return totalScore(this.found);
  }

  /** Seconds left in the current phase (countdown or play). */
  remaining(now = this.now()) {
    if (this.state === STATE.COUNTDOWN) {
      return Math.max(0, this.countdown - (now - this._phaseStart) / 1000);
    }
    if (this.state === STATE.PLAYING) {
      return Math.max(0, this.duration - (now - this._playStart) / 1000);
    }
    return 0;
  }

  /** Seconds of play elapsed. */
  elapsed(now = this.now()) {
    if (this.state === STATE.PLAYING) return (now - this._playStart) / 1000;
    if (this.state === STATE.RESULTS) return (this._endedAt - this._playStart) / 1000;
    return 0;
  }

  // ---------------------------------------------------------------- flow

  /**
   * Begin a round on `board` (from board.js generateBoard()).
   */
  start(board) {
    if (!board || !board.grid) throw new Error('start() needs a board with a grid');
    this._stopTimer();
    this.board = board;
    this.found = new Map();
    this.misses = 0;
    this.results = null;

    const now = this.now();
    this._phaseStart = now;
    if (this.countdown > 0) {
      this._setState(STATE.COUNTDOWN);
    } else {
      this._playStart = now;
      this._setState(STATE.PLAYING);
    }

    if (this.autoTick && typeof setInterval === 'function') {
      this._timer = setInterval(() => this.tick(), this.tickInterval);
    }
    this.tick(now);
  }

  /** Advance the clock. Safe to call from any driver (interval, rAF, tests). */
  tick(now = this.now()) {
    if (this.state === STATE.COUNTDOWN) {
      const elapsed = (now - this._phaseStart) / 1000;
      if (elapsed >= this.countdown) {
        this._playStart = this._phaseStart + this.countdown * 1000;
        this._setState(STATE.PLAYING);
      } else {
        this._emit('tick', { state: this.state, remaining: this.countdown - elapsed, elapsed: 0 });
        return;
      }
    }
    if (this.state === STATE.PLAYING) {
      const remaining = this.remaining(now);
      this._emit('tick', { state: this.state, remaining, elapsed: this.elapsed(now) });
      if (remaining <= 0) this.end(this._playStart + this.duration * 1000);
    }
  }

  /** Finish the round (timer expiry or user action). */
  end(now = this.now()) {
    if (this.state !== STATE.PLAYING && this.state !== STATE.COUNTDOWN) return this.results;
    this._stopTimer();
    this._endedAt = now;
    this.results = this._buildResults();
    this._setState(STATE.RESULTS);
    this._emit('end', this.results);
    return this.results;
  }

  /** Back to the lobby; keeps the board reference for "replay". */
  reset() {
    this._stopTimer();
    this._setState(STATE.LOBBY);
  }

  // -------------------------------------------------------------- submit

  /**
   * The one funnel for every input path (§4).
   *
   * @param {string} rawWord   typed / spoken word; may be '' when `path` is given
   * @param {number[]|null} [path]  cube indices from tap/drag selection
   * @returns {{ok:boolean, reason:string, word:string, score?:object, path?:number[]}}
   */
  submitWord(rawWord, path = null) {
    const grid = this.grid;
    let word = normaliseWord(rawWord);

    if (this.state !== STATE.PLAYING || !grid) {
      return this._reject(REASON.NOT_PLAYING, word, path, false);
    }

    if (path && path.length) {
      if (!grid.isValidPath(path)) return this._reject(REASON.BAD_PATH, word, path);
      const spelled = grid.wordFromPath(path).toLowerCase();
      if (!word) word = spelled;
      else if (word !== spelled) return this._reject(REASON.BAD_PATH, word, path);
    }

    if (!word) return this._reject(REASON.EMPTY, word, path, false);
    if (word.length < this.minWordLength) return this._reject(REASON.TOO_SHORT, word, path);
    if (this.found.has(word)) return this._reject(REASON.ALREADY_FOUND, word, path, false);

    const hit = this._lookup(word);
    if (!hit.ok) return this._reject(hit.reason, word, path);

    const entry = { word, score: hit.score, path: hit.path, at: this.elapsed() };
    this.found.set(word, entry);
    const result = { ok: true, reason: REASON.OK, word, score: hit.score, path: hit.path };
    this._emit('word', result);
    return result;
  }

  /**
   * Dictionary + path check. Prefers the pre-solved word map (authoritative,
   * O(1)); falls back to trie + live path search when only a trie is present.
   * @private
   */
  _lookup(word) {
    const { words, trie, grid } = this.board;
    if (words) {
      const e = words.get(word);
      if (e) return { ok: true, score: e.score, path: e.path };
      // Distinguish "not a word" from "not on this board" when we can.
      if (trie && trie.isWord(word)) return { ok: false, reason: REASON.NO_PATH };
      if (!trie && findAllPaths(grid, word, { limit: 1 }).length) {
        return { ok: false, reason: REASON.NOT_A_WORD };
      }
      return { ok: false, reason: trie ? REASON.NOT_A_WORD : REASON.NO_PATH };
    }
    if (trie) {
      if (!trie.isWord(word)) return { ok: false, reason: REASON.NOT_A_WORD };
      const paths = findAllPaths(grid, word);
      if (!paths.length) return { ok: false, reason: REASON.NO_PATH };
      const best = bestScore(word, paths, grid);
      return { ok: true, score: best.score, path: best.path };
    }
    // No dictionary at all: accept anything findable (dev / M1 fallback).
    const paths = findAllPaths(grid, word);
    if (!paths.length) return { ok: false, reason: REASON.NO_PATH };
    const best = bestScore(word, paths, grid);
    return { ok: true, score: best.score, path: best.path };
  }

  _reject(reason, word, path, countsAsMiss = true) {
    const result = { ok: false, reason, word, path: path ?? null };
    if (countsAsMiss && this.state === STATE.PLAYING) {
      this.misses++;
      this._emit('miss', result);
    }
    return result;
  }

  // ------------------------------------------------------------- results

  _buildResults() {
    const found = [...this.found.values()];
    const missed = [];
    if (this.board.words) {
      for (const [word, e] of this.board.words) {
        if (!this.found.has(word)) missed.push({ word, score: e.score, path: e.path });
      }
      missed.sort((a, b) => b.score.total - a.score.total || a.word.localeCompare(b.word));
    }
    const best = found.reduce((a, b) => (!a || b.score.total > a.score.total ? b : a), null);
    const minutes = Math.max(this.elapsed(this._endedAt), 1e-9) / 60;
    return {
      seedString: this.board.seedString ?? null,
      size: this.board.size,
      adjacency: this.board.adjacency,
      score: this.score,
      found,
      missed,
      misses: this.misses,
      best,
      wordsPerMinute: found.length / minutes,
      duration: this.elapsed(this._endedAt),
      possible: this.board.words ? this.board.words.size : null,
    };
  }

  // ------------------------------------------------------------ internals

  _setState(to) {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this._emit('state', { from, to });
  }

  _emit(type, detail) {
    const e = new Event(type);
    e.detail = detail;
    this.dispatchEvent(e);
  }

  _stopTimer() {
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

export default Game;