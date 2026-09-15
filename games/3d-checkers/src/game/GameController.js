import { createState, applyMove, RED, opponent, colorOf } from '../engine/Board.js';
import { getLegalMoves } from '../engine/moves.js';
import { getGameResult, countPieces } from '../engine/status.js';
import { createSetup, piecesPerSide } from '../engine/setups.js';
import { toNotation } from '../engine/notation.js';
import { configureBoard, LEVELS, N } from '../engine/geometry.js';

const MIN_THINK_MS = 600;

export class GameController {
  constructor(bus, store) {
    this.bus = bus;
    this.store = store;
    this.state = null;
    this.legal = [];
    this.history = [];       // [{ prev, move, notation }]
    this.selection = null;   // { from, chain: [idx...] }
    this.config = null;
    this.status = 'idle';
    this.reason = '';
    this.locked = false;     // set while the renderer animates
    this.previewing = false;
    this.worker = null;
    this.reqId = 0;
    this.thinking = false;
    this.thinkStart = 0;
    this.autoPlay = true;    // 0-player mode: false while autoplay is paused
    bus.on('animating', (busy) => { this.locked = busy; });
  }

  get rules() {
    return {
      forcedCapture: this.store.get('forcedCapture') !== false,
      menSideways: !!this.store.get('menSideways'),
      drawMoves: +this.store.get('drawMoves') || 40,
    };
  }

  newGame(config) {
    this.cancelThinking();
    // Rebuild the board geometry first — everything below depends on it.
    const { size, levels } = configureBoard(config.size ?? N, config.levels ?? LEVELS);
    this.config = { ...config, size, levels };
    this.state = createState(createSetup(config.setup));
    this.startCount = piecesPerSide(config.setup, size, levels);
    this.history = [];
    this.selection = null;
    this.previewing = false;
    this.status = 'playing';
    // 0-player games start running unless the caller asks for a paused board.
    this.autoPlay = config.mode !== 'auto' || config.autoStart !== false;
    this.bus.emit('newGame', { state: this.state, config: this.config });
    this.startTurn();
  }

  get isAuto() { return this.config?.mode === 'auto'; }

  // In autoplay both sides are machine-driven, so no turn may ever match a human
  // side — 2 is deliberately out of the RED/BLACK range.
  cpuSide() {
    if (this.isAuto) return 2;
    return this.config?.mode === 'cpu' ? opponent(this.config.humanSide) : -1;
  }
  isHumanTurn() {
    return this.status === 'playing' && !this.isAuto && this.state.turn !== this.cpuSide();
  }

  /** Difficulty for the side about to move (0-player games may differ per side). */
  difficultyFor(turn) {
    const c = this.config ?? {};
    if (!this.isAuto) return c.difficulty;
    return (turn === RED ? c.redDifficulty : c.blackDifficulty) || c.difficulty || 'medium';
  }

  setAutoplay(on) {
    if (!this.isAuto) return;
    this.autoPlay = !!on;
    this.bus.emit('autoplay', { running: this.autoPlay });
    if (!this.autoPlay) { this.cancelThinking(); return; }
    if (this.status === 'playing' && !this.thinking) this.requestCpuMove();
  }
  toggleAutoplay() { this.setAutoplay(!this.autoPlay); }

  /** Play exactly one machine move while autoplay is paused. */
  stepMove() {
    if (!this.isAuto || this.autoPlay || this.thinking || this.locked) return;
    if (this.status !== 'playing' || this.previewing) return;
    this.requestCpuMove();
  }

  startTurn() {
    this.selection = null;
    this.legal = getLegalMoves(this.state, this.state.turn, this.rules);
    const result = getGameResult(this.state, this.rules);
    this.status = result.status;
    this.reason = result.reason;
    this.bus.emit('turnChanged', { state: this.state, legal: this.legal, status: this.status });
    if (this.status !== 'playing') {
      this.bus.emit('gameOver', { status: this.status, reason: this.reason });
      return;
    }
    if (this.isHumanTurn()) return;
    if (this.isAuto && !this.autoPlay) return; // paused — wait for play/step
    this.requestCpuMove();
  }

  clearSelection() {
    if (!this.selection) return;
    this.selection = null;
    this.bus.emit('selectionCleared');
  }

  candidates() {
    const sel = this.selection;
    if (!sel) return [];
    return this.legal.filter((m) => m.from === sel.from && sel.chain.every((c, i) => m.path[i] === c));
  }

  select(idx) {
    const own = this.legal.filter((m) => m.from === idx);
    if (!own.length) {
      const reason = this.legal.some((m) => m.captured.length) ? 'mustCapture' : 'noMoves';
      this.bus.emit('illegal', { reason });
      return;
    }
    this.selection = { from: idx, chain: [idx] };
    this.bus.emit('pieceSelected', { from: idx, chain: [idx], candidates: own });
  }

  clickCell(idx) {
    if (this.locked || this.previewing || !this.isHumanTurn()) return;
    const piece = this.state.board[idx];
    const mine = piece !== 0 && colorOf(piece) === this.state.turn;
    const sel = this.selection;

    if (sel) {
      const step = sel.chain.length;
      const cands = this.candidates();
      const through = cands.filter((m) => m.path[step] === idx);
      if (through.length) {
        const finished = through.find((m) => m.path.length === step + 1);
        if (finished) return this.commitMove(finished);
        if (through.length === 1) return this.commitMove(through[0]);
        sel.chain.push(idx);
        this.bus.emit('chainContinued', { from: sel.from, chain: sel.chain.slice(), candidates: this.candidates() });
        return;
      }
      const ending = cands.filter((m) => m.to === idx);
      if (ending.length === 1) return this.commitMove(ending[0]);
      if (step > 1) return this.bus.emit('illegal', { reason: 'continueChain' });
      if (idx === sel.from) return this.clearSelection();
      if (mine) return this.select(idx);
      this.bus.emit('illegal', { reason: 'badTarget' });
      return;
    }
    if (piece === 0) return;
    if (!mine) return this.bus.emit('illegal', { reason: 'notYours' });
    this.select(idx);
  }

  commitMove(move) {
    const prev = this.state;
    const piece = prev.board[move.from];
    this.state = applyMove(prev, move);
    const notation = toNotation(move);
    this.history.push({ prev, move, notation });
    this.selection = null;
    this.bus.emit('moveMade', {
      move, prev, state: this.state, piece, notation, player: prev.turn, moveNumber: this.history.length,
    });
    this.startTurn();
  }

  undo() {
    if (!this.history.length || this.previewing) return;
    this.cancelThinking();
    // Taking a move back implies the operator wants to look around: stop autoplay.
    if (this.isAuto && this.autoPlay) { this.autoPlay = false; this.bus.emit('autoplay', { running: false }); }
    let n = 1;
    if (this.config.mode === 'cpu') {
      const last = this.history[this.history.length - 1];
      // If the CPU moved last, also take back the human move before it.
      if (last.prev.turn === this.cpuSide() && this.history.length >= 2) n = 2;
    }
    for (let i = 0; i < n; i++) this.state = this.history.pop().prev;
    this.status = 'playing';
    this.bus.emit('undone', { state: this.state, count: n });
    this.startTurn();
  }

  resign() {
    if (this.status !== 'playing') return;
    this.cancelThinking();
    this.status = this.state.turn === RED ? 'black_wins' : 'red_wins';
    this.reason = 'resign';
    this.bus.emit('gameOver', { status: this.status, reason: this.reason });
  }

  agreeDraw() {
    if (this.status !== 'playing') return;
    this.cancelThinking();
    this.status = 'draw';
    this.reason = 'agreed';
    this.bus.emit('gameOver', { status: this.status, reason: this.reason });
  }

  setPreview(on) { this.previewing = on; if (on) this.clearSelection(); }

  counts() {
    const c = countPieces(this.state);
    c.red.captured = this.startCount - c.black.total;
    c.black.captured = this.startCount - c.red.total;
    return c;
  }

  ensureWorker() {
    if (this.worker) return;
    this.worker = new Worker(new URL('../ai/ai.worker.js', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e) => this.handleWorkerMessage(e.data);
    this.worker.onerror = (e) => console.error('AI worker error', e);
  }

  requestCpuMove() {
    this.ensureWorker();
    const id = ++this.reqId;
    const s = this.state;
    this.thinking = true;
    this.thinkStart = performance.now();
    this.worker.postMessage({
      type: 'think', id,
      state: { board: s.board, turn: s.turn, halfmoveClock: s.halfmoveClock, ply: s.ply, hash: s.hash },
      difficulty: this.difficultyFor(s.turn), rules: this.rules,
      size: this.config.size, levels: this.config.levels,
    });
    this.bus.emit('aiThinking', { player: s.turn });
  }

  handleWorkerMessage(msg) {
    if (msg.id !== this.reqId) return;
    if (msg.type === 'progress') { this.bus.emit('aiProgress', msg); return; }
    if (msg.type !== 'move') return;
    // 0-player games get an extra, configurable beat so moves stay watchable.
    const minThink = MIN_THINK_MS + (this.isAuto ? Math.max(0, +this.store.get('autoDelay') || 0) : 0);
    const wait = Math.max(0, minThink - (performance.now() - this.thinkStart));
    setTimeout(() => {
      if (msg.id !== this.reqId) return;
      this.thinking = false;
      this.bus.emit('aiDone', { stats: msg.stats });
      if (!msg.move) return;
      const target = toNotation(msg.move);
      const m = this.legal.find((x) => toNotation(x) === target);
      if (m) this.commitMove(m);
    }, wait);
  }

  cancelThinking() {
    this.reqId++;
    if (this.thinking) {
      this.thinking = false;
      this.worker?.terminate();
      this.worker = null;
      this.bus.emit('aiDone', { cancelled: true });
    }
  }
}