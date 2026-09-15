import * as THREE from 'three';
import { EventBus } from './core/EventBus.js';
import { Store } from './core/Store.js';
import { cellWorld, setLevelGap, DEFAULT_LEVEL_GAP } from './core/constants.js';
import { tween } from './core/tween.js';
import { RED, BLACK } from './engine/Board.js';
import { CZ, LEVELS, N, configureBoard } from './engine/geometry.js';
import { GameController } from './game/GameController.js';
import { SceneManager } from './render/SceneManager.js';
import { LatticeView } from './render/LatticeView.js';
import { PieceView } from './render/PieceView.js';
import { HighlightLayer } from './render/HighlightLayer.js';
import { AnimationSystem } from './render/AnimationSystem.js';
import { Picker } from './render/Picker.js';
import { initMenu } from './ui/Menu.js';
import { initSidePanel } from './ui/SidePanel.js';
import { initViewControls } from './ui/ViewControls.js';
import { toast } from './ui/Toast.js';
import { showGameOver, confirmDialog } from './ui/Modals.js';

const DEFAULTS = {
  mode: 'cpu', humanSide: 0, difficulty: 'medium', setup: 'standard',
  forcedCapture: true, menSideways: false, drawMoves: 40, flipBoard: false,
   animSpeed: 1, xrayAuto: true, explode: 1, size: 8, levels: 8, levelGap: DEFAULT_LEVEL_GAP,
   redName: 'Red', blackName: 'Black',
   // 0-player (CPU vs CPU) autoplay
   redDifficulty: 'medium', blackDifficulty: 'medium', autoDelay: 500,
};

const bus = new EventBus();
const store = new Store('checkers3d.settings', DEFAULTS);
setLevelGap(store.get('levelGap') ?? DEFAULT_LEVEL_GAP);
configureBoard(+store.get('size') || 8, +store.get('levels') || 8);
const game = new GameController(bus, store);

const canvas = document.getElementById('scene');
const scene = new SceneManager(canvas);
const lattice = new LatticeView(scene.scene);
const pieces = new PieceView(scene.scene);
const highlights = new HighlightLayer(scene.scene);

// ---- View state (compact / exploded / slice / x-ray) -------------------------------
const view = {
  explode: +store.get('explode'), focusLevel: -1, xrayOn: !!store.get('xrayAuto'),
  xray: null, dests: null, selected: -1, hover: -1, dirty: true,
};
const posOf = (idx, out = new THREE.Vector3()) => cellWorld(idx, view.explode, out);
const anim = new AnimationSystem(scene.scene, pieces, bus, () => +store.get('animSpeed') || 1, posOf);

let current = null; // { cands, step } currently highlighted candidates
let lastMove = null;

scene.onFrame(() => {
  if (view.dirty || pieces.dirty) {
    lattice.update(view);
    pieces.update(view);
    view.dirty = false;
  }
});

function refreshHighlights() {
  if (current) highlights.showCandidates(current.cands, current.step, posOf);
  if (lastMove) highlights.setLastMove(lastMove, posOf);
}
function onViewChanged() { view.dirty = true; refreshHighlights(); controls.sync(); }

function setExplode(target, animate = true) {
  store.set('explode', target);
  if (!animate) { view.explode = target; onViewChanged(); return; }
  const from = view.explode;
  tween({ duration: 550, onUpdate: (k) => { view.explode = from + (target - from) * k; onViewChanged(); } });
}
function setFocusLevel(level) { view.focusLevel = level; onViewChanged(); }
function setGap(gap) {
   store.set('levelGap', gap);
   setLevelGap(gap);
   onViewChanged();
}
function setXray(on) {
  view.xrayOn = on;
  store.set('xrayAuto', on);
  view.xray = on && current ? buildXraySet(current.cands) : null;
  onViewChanged();
}
function buildXraySet(cands) {
  const set = new Set();
  for (const c of cands) { c.path.forEach((i) => set.add(i)); c.captured.forEach((i) => set.add(i)); }
  return set;
}
function setCandidates(cands, chain) {
  const step = chain.length;
  current = { cands, step };
  view.dests = new Map();
  for (const c of cands) {
    const kind = c.captured.length ? 'capture' : 'move';
    if (!view.dests.has(c.path[step])) view.dests.set(c.path[step], kind);
    if (c.to !== c.path[step] && !view.dests.has(c.to)) view.dests.set(c.to, 'final');
  }
  view.xray = view.xrayOn ? buildXraySet(cands) : null;
  highlights.showCandidates(cands, step, posOf);
  view.dirty = true;
}
function clearCandidates() {
  current = null;
  view.selected = -1;
  view.dests = null;
  view.xray = null;
  highlights.clear();
  view.dirty = true;
}

// ---- Game events ---------------------------------------------------------------------
const ILLEGAL = {
  mustCapture: 'You must capture!',
  noMoves: 'That piece has no legal moves.',
  notYours: "That's not your piece.",
  continueChain: 'Continue jumping — pick a highlighted cell.',
  badTarget: 'Pick a highlighted destination (for branching chains, click the next jump).',
};
bus.on('illegal', ({ reason }) => toast(ILLEGAL[reason] ?? 'Illegal move'));
bus.on('pieceSelected', ({ from, candidates, chain }) => { view.selected = from; setCandidates(candidates, chain); });
bus.on('chainContinued', ({ candidates, chain }) => { setCandidates(candidates, chain); toast('Continue jumping'); });
bus.on('selectionCleared', clearCandidates);

bus.on('newGame', ({ state, config }) => {
  clearCandidates();
  lastMove = null;
  highlights.clearAll();
   if (view.focusLevel >= LEVELS) view.focusLevel = -1;
   view.dirty = true;
   controls.sync();
  anim.then(() => { pieces.setBoard(state.board, new Set()); });
  scene.setBoardScale(Math.max(N, 5) / 8);
  const facing = config.mode === 'auto'
    ? 'iso' // nobody is sitting behind a side in a 0-player game
    : (config.mode === 'cpu' && config.humanSide === BLACK ? 'black' : 'red');
  scene.setPreset(facing);
});

bus.on('moveMade', (ev) => {
  clearCandidates();
  lastMove = ev.move;
  highlights.setLastMove(ev.move, posOf);
  anim.play(ev);
});

bus.on('undone', ({ state }) => {
  clearCandidates();
  lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  highlights.clearAll();
  anim.then(() => { pieces.setBoard(state.board, new Set()); refreshHighlights(); });
});

let lastFlipTurn = -1;
bus.on('turnChanged', ({ state, legal, status }) => {
  if (status !== 'playing') return;
  if (game.config.mode === 'h2h' && store.get('flipBoard') && lastFlipTurn !== state.turn) {
    anim.then(() => scene.setPreset(state.turn === RED ? 'red' : 'black'));
  }
  lastFlipTurn = state.turn;
  if (game.isHumanTurn() && legal.length && legal[0].captured.length) anim.then(() => toast('You must capture!'));
});
bus.on('autoplay', ({ running }) => toast(running ? 'Autoplay running' : 'Autoplay paused'));


const STATUS_TEXT = {
  noPieces: 'All enemy pieces captured.', noMoves: 'The opponent has no legal move.',
  resign: 'By resignation.', agreed: 'Draw by agreement.',
  quietMoves: 'No capture or man move for too long.', repetition: 'Threefold repetition.',
};
bus.on('gameOver', ({ status, reason }) => {
  anim.then(() => {
    const names = { red_wins: `${store.get('redName')} wins!`, black_wins: `${store.get('blackName')} wins!`, draw: 'Draw' };
    showGameOver({ title: names[status], text: STATUS_TEXT[reason] ?? '' }, { onNew: () => menu.show(), onClose: () => {} });
  });
});

// ---- Picking -------------------------------------------------------------------------
// Only pieces and destination markers are pickable. The lattice voxels are NOT: they
// occlude each other far too much in the compact view to be useful click targets.
new Picker(canvas, scene.camera, {
  pickables: () => [...pieces.pickables, ...highlights.pickables],
  resolve: (obj, id) => (highlights.pickables.includes(obj)
    ? { idx: highlights.cellOf(obj, id), isPiece: false }
    : { idx: pieces.cellOf(obj, id), isPiece: true }),
  // Destination markers are always clickable; pieces only when on the focused level.
  accept: (idx, isPiece) => !isPiece || view.focusLevel < 0 || CZ[idx] === view.focusLevel,
  onHover: (idx) => {
    if (view.hover === idx) return;
    view.hover = idx;
    view.dirty = true;
    canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
  },
  onClick: (idx) => { if (idx < 0) game.clearSelection(); else game.clickCell(idx); },
});

// ---- UI ------------------------------------------------------------------------------
const controls = initViewControls({ view, scene, setExplode, setFocusLevel, setXray, setGap });
const menu = initMenu({ store, onStart: (config) => { menu.canCancel = true; game.newGame(config); } });

initSidePanel({
  bus, game, store,
  onPreview: (i) => {
    game.setPreview(true);
    const st = i + 1 < game.history.length ? game.history[i + 1].prev : game.state;
    clearCandidates();
    anim.then(() => { pieces.setBoard(st.board, new Set()); highlights.setLastMove(game.history[i].move, posOf); });
  },
  onLive: () => {
    game.setPreview(false);
    anim.then(() => { pieces.setBoard(game.state.board, new Set()); highlights.setLastMove(lastMove, posOf); });
  },
  onUndo: () => game.undo(),
  onToggleAuto: () => game.toggleAutoplay(),
  onStep: () => game.stepMove(),
  onResign: async () => { if (game.status === 'playing' && await confirmDialog('Resign this game?')) game.resign(); },
  onDraw: async () => {
    if (game.status !== 'playing') return;
    const q = game.config.mode === 'cpu' ? 'Agree a draw with the CPU?' : 'Does the opponent accept the draw offer?';
    if (await confirmDialog(q)) game.agreeDraw();
  },
  onMenu: () => menu.show(),
});

addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  switch (e.key) {
    case 'e': case 'E': setExplode(view.explode > 0.5 ? 0 : 1); break;
    case 'x': case 'X': setXray(!view.xrayOn); break;
     case '[': setFocusLevel(view.focusLevel < 0 ? LEVELS - 1 : view.focusLevel - 1); break;
     case ']': setFocusLevel(view.focusLevel >= LEVELS - 1 ? -1 : view.focusLevel + 1); break;
    case 'u': case 'U': game.undo(); break;
    case 'p': case 'P': game.toggleAutoplay(); break;
    case '.': game.stepMove(); break;
    case 'f': case 'F': scene.flip(); break;
    case 'Escape': if (game.selection) game.clearSelection(); else if (menu.isOpen() && menu.canCancel) menu.hide(); else menu.show(); break;
    case '1': scene.setPreset('red'); break;
    case '2': scene.setPreset('black'); break;
    case '3': scene.setPreset('top'); break;
    case '4': scene.setPreset('iso'); break;
    case '5': scene.setPreset('side'); break;
    default: return;
  }
  e.preventDefault();
});

menu.show();