import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { loadSettings, saveSettings, livesFromSetting, weightsFromSettings } from './settings.js';
import { rngFromSeed, randomSeedString } from './rng.js';
import { Grid, MINED, normaliseWeights } from '../game/Grid.js';
import { Board } from '../game/Board.js';
import { placeMines } from '../game/MineGenerator.js';
import { LEVELS, customLevel } from '../game/LevelDefs.js';
import { GameState, loadProgress, recordProgress } from '../game/GameState.js';
import { SceneRig } from '../render/Scene.js';
import { BoardView } from '../render/BoardView.js';
import { Highlighter } from '../render/Highlighter.js';
import { pick } from '../input/Picker.js';
import { InputRouter } from '../input/InputRouter.js';
import { MinerController } from '../input/MinerController.js';
import { Hud } from '../ui/Hud.js';
import { Overlay } from '../ui/Overlay.js';
import { Sfx } from '../audio/sfx.js';

const HINT =
  'LMB strike · RMB mark · MMB probe · drag to orbit · 1-3 isolate layer · Alt x-ray · V miner view · Space menu';

function parseWeights(p) {
   // Legacy links used adj=26 / adj=6; the modern form is we=<edge>&wc=<corner>.
   const legacy = Number(p.get('adj')) === 6 ? 0 : 1;
   const num = (key) => (p.has(key) ? Number(p.get(key)) : legacy);
   return normaliseWeights({ face: 1, edge: num('we'), corner: num('wc') });
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '');
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  if (!p.has('w')) return null;
  return {
    w: Number(p.get('w')),
    d: Number(p.get('d')) || Number(p.get('w')),
    h: Number(p.get('h')) || 1,
    mines: Number(p.get('m')) || 1,
    seed: p.get('seed') || randomSeedString(),
     weights: parseWeights(p),
    level: p.get('level'),
  };
}

function buildHash(spec, seed, weights) {
   const base =
     `w=${spec.w}&d=${spec.d}&h=${spec.h}&m=${spec.mines}` +
     `&seed=${encodeURIComponent(seed)}&we=${weights.edge}&wc=${weights.corner}`;
  return spec.custom ? base : `${base}&level=${spec.id}`;
}

export class App {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.bus = new EventBus();

    this.rig = new SceneRig(canvas);
    this.rig.setEffects(this.settings.effects);
    this.highlighter = new Highlighter(this.rig.scene);
    this.sfx = new Sfx(this.settings.volume);

    this.hud = new Hud(uiRoot, {
      onLayer: (y) => this.setLayerFocus(y),
      onCamera: () => this.toggleCameraMode(),
      onSettings: () => this.openSettings(),
      onMenu: () => this.openMenu(),
      onTouchMode: () => this.toggleTouchMode(),
    });
    this.overlay = new Overlay(uiRoot, {
      onSettingsChange: (s) => this.applySettings(s),
      onAction: (act, data) => this.overlayAction(act, data),
      onClose: () => this.gameState?.resume(),
    });
    this.input = new InputRouter(canvas, {
      onHover: (x, y) => this.hover(x, y),
      onIntent: (intent) => this.handleIntent(intent),
      onKey: (e) => this.handleKey(e),
      onXray: (on) => this.view?.setXray(on),
    });
    this.miner = new MinerController(this.rig.camera, canvas);
    this.miner.onExit = () => this.exitMiner();

    this.cameraMode = 'orbit';
    this.layerFocus = -1;
    this.touchMode = 'strike';
    this.revealQueue = [];
    this.undoStack = [];
    this.lastPointer = { x: -1, y: -1 };
    this.ndc = new THREE.Vector2();
    this.pickOut = {};
    this.runToken = 0;

    this.grid = null;
    this.board = null;
    this.view = null;
    this.gameState = null;
    this.spec = null;
    this.seed = null;

    this.bus.on('board:action', (r) => this.onAction(r));
    this.bus.on('board:started', () => this.hud.setHint(''));

    window.addEventListener('hashchange', () => this.startFromHash());
    if (!this.startFromHash()) this.startLevel(0);

    this.last = performance.now();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ boards

  startFromHash() {
    const p = parseHash();
    if (!p) return false;
     this.settings = { ...this.settings, edgeWeight: p.weights.edge, cornerWeight: p.weights.corner };
    const idx = LEVELS.findIndex(
      (l) => l.id === p.level && l.w === p.w && l.d === p.d && l.h === p.h && l.mines === p.mines,
    );
    const spec = idx >= 0 ? { ...LEVELS[idx], index: idx } : customLevel(p);
    this.startBoard(spec, p.seed);
    return true;
  }

  startLevel(index, seed = randomSeedString()) {
    const i = Math.max(0, Math.min(LEVELS.length - 1, index));
    this.startBoard({ ...LEVELS[i], index: i }, seed);
  }

  startBoard(spec, seed) {
    this.runToken++;
    this.spec = spec;
    this.seed = seed;
    this.disposeBoard();

    const s = this.settings;
     const grid = new Grid(spec.w, spec.d, spec.h, weightsFromSettings(s));
    placeMines(grid, spec.mines, rngFromSeed(seed));
    this.grid = grid;
    this.board = new Board(
      grid,
      {
        cascade: s.cascade,
        strictMarks: s.strictMarks,
        lives: livesFromSetting(s.lives),
        safeFirstStrike: s.safeFirstStrike,
        seed,
      },
      this.bus,
    );
    this.gameState = new GameState(this.bus, { level: spec });
     this.view = new BoardView(this.rig.scene, grid, {
       colourblind: s.colourblind,
       hideSatisfied: s.hideSatisfied,
     });
    this.view.syncAll();

    this.rig.buildVault(grid);
    if (this.cameraMode === 'miner') this.exitMiner(false);
    this.rig.frameBoard(grid, false);

    this.revealQueue.length = 0;
    this.undoStack.length = 0;
    this.layerFocus = -1;
    this.hud.setLayers(grid.height);
    this.setLayerFocus(-1);
    this.hud.setLevel(spec.name, seed);
    this.hud.setHint(HINT);
    this.updateHud();
    this.highlighter.hide();
    this.overlay.hide();

     history.replaceState(null, '', `#${buildHash(spec, seed, grid.weights)}`);
  }

  disposeBoard() {
    this.view?.dispose();
    this.gameState?.dispose();
    this.view = null;
    this.gameState = null;
    this.board = null;
  }

  // ------------------------------------------------------------------ input

  hover(x, y) {
    this.lastPointer.x = x;
    this.lastPointer.y = y;
    if (this.cameraMode === 'miner' || this.overlay.isOpen() || !this.grid) return;
    this.highlighter.set(this.grid, this.pickAt(x, y, 'solid'));
  }

  pickAt(x, y, mode = 'solid') {
    if (!this.grid) return -1;
    if (this.cameraMode === 'miner') {
      this.ndc.set(0, 0);
    } else {
      const rect = this.canvas.getBoundingClientRect();
      this.ndc.set(((x - rect.left) / rect.width) * 2 - 1, -(((y - rect.top) / rect.height) * 2 - 1));
    }
    const grid = this.grid;
    const focus = this.layerFocus;
    const onLayer = (i) => focus < 0 || grid.y(i) === focus;
    const predicate =
      mode === 'probe'
         ? (i) =>
             onLayer(i) &&
             (grid.isSolid(i) ||
               (grid.state[i] === MINED && grid.counts[i] > 0 && !this.view?.isSatisfied(i)))
        : (i) => onLayer(i) && grid.isSolid(i);
    const hit = pick(this.rig.camera, this.ndc, grid, predicate, this.pickOut);
    return hit ? hit.cell : -1;
  }

  handleIntent(intent) {
    if (!this.board || this.overlay.isOpen()) return;
    this.flushReveals();
    const cell = this.pickAt(intent.x, intent.y, intent.type === 'probe' ? 'probe' : 'solid');
    if (cell < 0) return;
    if (this.settings.undo) this.pushUndo();
    let r;
    if (intent.type === 'strike') r = this.board.strike(cell);
    else if (intent.type === 'mark') r = this.board.toggleMark(cell);
    else if (intent.type === 'probe') r = this.board.probe(cell);
    else return;
    if (r.kind === 'noop') {
      if (this.settings.undo) this.undoStack.pop();
      if (r.reason === 'mark-limit') this.hud.flash('No marks left — unmark something first');
      else if (r.reason === 'marks-mismatch') this.hud.flash('Marks around this number do not match it');
    }
    this.hover(this.lastPointer.x, this.lastPointer.y);
  }

  handleKey(e) {
    if (this.overlay.isOpen()) {
      if (e.code === 'Escape' || e.code === 'Space') {
        e.preventDefault();
        this.overlay.hide();
      }
      return;
    }
    switch (e.code) {
      case 'KeyV':
        this.toggleCameraMode();
        break;
      case 'Space':
        e.preventDefault();
        this.openSettings();
        break;
      case 'Escape':
        if (this.cameraMode === 'miner') this.exitMiner();
        break;
      case 'KeyR':
        this.startBoard(this.spec, this.seed);
        break;
      case 'KeyN':
        this.startBoard(this.spec, randomSeedString());
        break;
      case 'KeyZ':
        this.undo();
        break;
      default: {
        const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
        if (m) {
          const n = Number(m[2]);
          if (n === 0) this.setLayerFocus(-1);
          else if (n <= this.grid.height) this.setLayerFocus(n - 1);
        }
      }
    }
  }

  // ---------------------------------------------------------------- results

  onAction(r) {
    const now = performance.now();
    const instant = this.settings.reducedMotion;
     // Revealing / marking a cell can satisfy (or un-satisfy) up to 26 numbers
     // around it, so every touched cell dirties its whole neighbourhood.
     const dirty = new Set();
     for (const c of r.changed) this.view.markDirty(c, dirty);
    let maxDelay = 0;
    for (const item of r.revealed) {
      const d = instant ? 0 : item.delay;
      if (d > maxDelay) maxDelay = d;
       this.queueReveal(item.cell, now + d, now, dirty);
    }
    for (const item of r.defused) {
      const d = instant ? 0 : item.delay;
      if (d > maxDelay) maxDelay = d;
       this.queueReveal(item.cell, now + d, now, dirty);
    }
     this.view.syncDirty(dirty);
    switch (r.kind) {
      case 'cleared':
        this.sfx.crunch();
        if (r.revealed.length > 3) this.sfx.cascade(Math.ceil(maxDelay / this.board.opts.shellMs));
        break;
      case 'marked':
        this.sfx.clink(true);
        break;
      case 'unmarked':
        this.sfx.clink(false);
        break;
      case 'defused':
        this.sfx.defuse();
        break;
      case 'misfire':
        this.sfx.misfire();
        this.hud.flash('Misfire! That block was safe.');
        break;
      case 'boom':
        this.sfx.boom();
        this.rig.shake(instant ? 0 : 0.6);
        if (!r.lost) this.hud.flash(`Detonation! ${this.board.lives} ${this.board.lives === 1 ? 'life' : 'lives'} left.`);
        break;
    }
    this.updateHud();
    if (r.lost) this.onLost();
    else if (r.won) this.onWon(maxDelay);
  }

  onLost() {
    this.flushReveals();
    this.view.revealMines();
    const token = this.runToken;
    setTimeout(() => token === this.runToken && this.showEnd(), 1300);
  }

  onWon(maxDelay) {
    const token = this.runToken;
    setTimeout(() => token === this.runToken && this.sfx.win(), maxDelay);
    const stats = this.gameState.summary();
    if (!this.spec.custom) recordProgress(this.spec.id, { timeMs: stats.timeMs, stars: stats.stars });
    setTimeout(() => token === this.runToken && this.showEnd(), maxDelay + 900);
  }

  showEnd() {
    const stats = this.gameState.summary();
    this.overlay.showEnd({
      ...stats,
      seed: this.seed,
       lives: this.board?.lives,
      hasNext: !this.spec.custom && this.spec.index + 1 < LEVELS.length,
    });
  }

   queueReveal(cell, at, now, dirty = null) {
     if (at > now) {
       this.revealQueue.push({ cell, at });
       return;
     }
     if (dirty) this.view.markDirty(cell, dirty);
     else this.view.syncNeighbourhood(cell);
  }

  processReveals(now) {
    if (!this.revealQueue.length) return;
    let write = 0;
    let popped = 0;
     const dirty = new Set();
    for (let i = 0; i < this.revealQueue.length; i++) {
      const item = this.revealQueue[i];
      if (item.at <= now) {
         this.view.markDirty(item.cell, dirty);
        popped++;
      } else {
        this.revealQueue[write++] = item;
      }
    }
    this.revealQueue.length = write;
     this.view.syncDirty(dirty);
    if (popped && Math.random() < 0.25) this.sfx.crunch();
  }

  flushReveals() {
     if (!this.revealQueue.length) return;
     const dirty = new Set();
     for (const item of this.revealQueue) this.view.markDirty(item.cell, dirty);
    this.revealQueue.length = 0;
     this.view.syncDirty(dirty);
  }

  pushUndo() {
    this.undoStack.push(this.board.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
  }

  undo() {
    if (!this.settings.undo) {
      this.hud.flash('Undo is disabled in settings');
      return;
    }
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.flushReveals();
    this.board.restore(snap);
    this.view.minesRevealed = false;
    this.view.syncAll();
    this.updateHud();
    this.overlay.hide();
  }

  updateHud() {
    if (!this.board) return;
    this.hud.setMines(this.board.minesRemaining);
    this.hud.setLives(this.board.lives);
    this.hud.setProgress(this.board.progress);
  }

  // ------------------------------------------------------------- view modes

  setLayerFocus(y) {
    if (!this.grid) return;
    if (y >= this.grid.height) y = -1;
    this.layerFocus = y;
    this.view.setLayerFocus(y);
    this.hud.setLayer(y);
    this.bus.emit('layer:isolated', y);
  }

  toggleCameraMode() {
    if (this.cameraMode === 'miner') {
      this.exitMiner();
      return;
    }
    if (this.grid.height < 2) {
      this.hud.flash('Miner view needs a board at least 2 layers tall');
      return;
    }
    const spawn = this.miner.findSpawn(this.grid);
    if (!spawn) {
      this.hud.flash('Tunnel out a pocket first, then drop in');
      return;
    }
    this.cameraMode = 'miner';
    this.rig.controls.enabled = false;
    this.rig.tween = null;
    this.miner.enter(spawn, this.grid);
    this.highlighter.hide();
    document.body.classList.add('miner');
    this.hud.setCameraMode('miner');
    this.bus.emit('camera:mode', 'miner');
  }

  exitMiner(animate = true) {
    if (this.cameraMode !== 'miner') return;
    this.cameraMode = 'orbit';
    this.miner.exit();
    this.rig.controls.enabled = true;
    document.body.classList.remove('miner');
    this.hud.setCameraMode('orbit');
    this.highlighter.hide();
    if (animate) this.rig.frameBoard(this.grid, true);
    this.bus.emit('camera:mode', 'orbit');
  }

  toggleTouchMode() {
    this.touchMode = this.touchMode === 'strike' ? 'mark' : 'strike';
    this.input.setTouchMode(this.touchMode);
    this.hud.setTouchMode(this.touchMode);
  }

  // ---------------------------------------------------------------- overlay

  openSettings() {
    this.gameState?.pause();
    this.overlay.showSettings(this.settings, { seed: this.seed });
  }

  openMenu() {
    this.gameState?.pause();
    this.overlay.showMenu(LEVELS, loadProgress(), this.spec?.custom ? -1 : this.spec?.index);
  }

  overlayAction(act, data) {
    switch (act) {
      case 'resume':
        this.overlay.hide();
        break;
      case 'restart':
        this.startBoard(this.spec, this.seed);
        break;
      case 'newseed':
        this.startBoard(this.spec, randomSeedString());
        break;
      case 'levels':
        this.openMenu();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'level':
        this.startLevel(Number(data.index));
        break;
      case 'next':
        this.startLevel((this.spec.index ?? -1) + 1);
        break;
      case 'custom':
        this.startBoard(customLevel(data), data.seed || randomSeedString());
        break;
      case 'copy':
        navigator.clipboard?.writeText(location.href);
        this.hud.flash('Board link copied');
        break;
    }
  }

  applySettings(next) {
    const prev = this.settings;
    this.settings = next;
    saveSettings(next);
    this.sfx.setVolume(next.volume);
    if (prev.effects !== next.effects) this.rig.setEffects(next.effects);
    if (this.board) {
      this.board.opts.cascade = next.cascade;
      this.board.opts.strictMarks = next.strictMarks;
      this.board.opts.safeFirstStrike = next.safeFirstStrike;
    }
    if (prev.colourblind !== next.colourblind && this.grid) {
      this.flushReveals();
      this.view.dispose();
       this.view = new BoardView(this.rig.scene, this.grid, {
         colourblind: next.colourblind,
         hideSatisfied: next.hideSatisfied,
       });
      this.view.minesRevealed = this.board.status === 'lost';
      this.view.syncAll();
      this.view.setLayerFocus(this.layerFocus);
     } else if (prev.hideSatisfied !== next.hideSatisfied) {
       this.view?.setHideSatisfied(next.hideSatisfied);
    }
     if (
       prev.edgeWeight !== next.edgeWeight ||
       prev.cornerWeight !== next.cornerWeight ||
       prev.lives !== next.lives
     ) {
      this.startBoard(this.spec, this.seed);
      this.hud.flash('Board restarted to apply the new rules');
      this.openSettings();
    }
  }

  // ------------------------------------------------------------------- loop

  loop(t) {
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    this.processReveals(t);
    if (this.cameraMode === 'miner') {
      this.miner.update(dt);
      this.highlighter.set(this.grid, this.pickAt(0, 0, 'solid'));
    }
    this.rig.update(dt);
    if (this.gameState) this.hud.setTime(this.gameState.elapsedMs());
    this.rig.render();
    requestAnimationFrame(this.loop);
  }
}