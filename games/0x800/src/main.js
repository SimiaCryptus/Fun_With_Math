// main.js — wiring: load state → render → input loop. The only module that
// knows about all the others.

import { createGame, move, keepGoing, hex } from './game.js';
import { dir } from './hex.js';
import { Renderer } from './render.js';
import { attachInput, buildPad } from './input.js';
import * as store from './storage.js';
import { UI, THEMES, RADII } from './ui.js';

const UNDO_DEPTH = 10;

const prefs = store.loadPrefs();
const ui = new UI({ hexMode: prefs.hexScore !== false });
ui.applyTheme(THEMES.includes(prefs.theme) ? prefs.theme : 'auto');

const stageEl = document.getElementById('stage');
const boardEl = document.getElementById('board');
const renderer = new Renderer(boardEl);
const pad = buildPad(document.getElementById('pad'), { onMove: requestMove, onUndo: () => undo() });

let state = null;
let history = []; // ring buffer of previous states (states are immutable)
let animating = false;
let pending = null; // at most one buffered move
let saveTimer = 0;

const reducedMotion = () =>
  prefs.reduceMotion === true || matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- persistence ---------------- */

function persist(immediate = false) {
  clearTimeout(saveTimer);
  const save = () => {
    if (!state) return;
    store.saveState(state);
    store.saveBest(state.radius, state.best);
  };
  if (immediate) save();
  else saveTimer = setTimeout(save, 250);
}

function refresh() {
  ui.update(state);
  pad.setUndoEnabled(history.length > 0);
}

/* ---------------- lifecycle ---------------- */

function boot(radius) {
  renderer.cancel();
  history = [];
  pending = null;
  animating = false;

  const best = store.loadBest(radius);
  const saved = store.loadState(radius);
  state = saved ?? createGame({ radius, best });
  if (state.best < best) state = { ...state, best };

  ui.hideOverlay();
  renderer.render(state);
  fit();
  refresh();
  ui.setSeed(state.seed);
  ui.log(
    saved
      ? `> resume r${radius} · ${state.tiles.length} tiles · seed 0x${hex(state.seed)}`
      : `> new game r${radius} · seed 0x${hex(state.seed)}`
  );

  if (state.over) showGameOver();
  else if (state.won && !state.keptGoing) showWin();
}

function startNew() {
  renderer.cancel();
  animating = false;
  pending = null;
  history = [];
  state = createGame({ radius: state.radius, best: state.best });
  ui.hideOverlay();
  renderer.render(state);
  refresh();
  ui.setSeed(state.seed);
  ui.log(`> new game · seed 0x${hex(state.seed)}`);
  ui.announce('new game');
  persist(true);
}

function newGame() {
  if (animating) return;
  if (ui.overlayKind() === 'confirm') {
    startNew();
    return;
  }
  if (ui.isOverlayOpen() && ui.overlayKind() !== 'over' && ui.overlayKind() !== 'win') return;
  if (state.score > 0 && !state.over) {
    ui.showOverlay({
      kind: 'confirm',
      kicker: 'new game',
      title: 'abandon this run?',
      sub: `score ${ui.fmt(state.score)} · ${ui.fmt(state.moves)} moves`,
      buttons: [
        { label: 'new game', key: 'R', primary: true, onClick: startNew },
        { label: 'cancel', key: 'Esc', onClick: () => ui.hideOverlay() },
      ],
    });
    return;
  }
  startNew();
}

function switchRadius(radius) {
  if (!RADII.includes(radius)) return;
  if (radius === state.radius) {
    ui.hideOverlay();
    return;
  }
  persist(true);
  prefs.radius = radius;
  store.savePrefs(prefs);
  boot(radius);
}

/* ---------------- moves ---------------- */

function requestMove(dirName) {
  if (!state || ui.isOverlayOpen()) return;
  if (animating) {
    pending = dirName;
    return;
  }

  const d = dir(dirName);
  pad.flash(dirName);
  const res = move(state, dirName);

  if (!res.moved) {
    renderer.nudge(d);
    ui.log(`> no move: ${dirName}`);
    ui.announce(`no move ${d.label}`);
    return;
  }

  history.push(state);
  if (history.length > UNDO_DEPTH) history.shift();
  state = res.state;

  logEvents(d, res);
  refresh();
  if (res.gained > 0) ui.flashGain(res.gained);

  animating = true;
  renderer.animate(state, res.events, { reduced: reducedMotion() }).then(() => {
    animating = false;
    persist();
    if (res.events.some((e) => e.type === 'win')) showWin();
    else if (state.over) showGameOver();
    if (pending) {
      const p = pending;
      pending = null;
      requestMove(p);
    }
  });
}

function logEvents(d, res) {
  const merges = res.events.filter((e) => e.type === 'merge');
  for (const m of merges.slice(-3))
    ui.log(`> merged 0x${hex(m.from)} + 0x${hex(m.from)} = 0x${hex(m.value)}`);
  const sp = res.events.find((e) => e.type === 'spawn');
  if (sp) ui.log(`> spawn 0x${hex(sp.value)} @ (${sp.to.q},${sp.to.r})`);
  const mergedText = merges.length
    ? ', merged ' +
      merges.map((m) => `${hex(m.from)} and ${hex(m.from)} into ${hex(m.value)}`).join(', ')
    : '';
  ui.announce(`moved ${d.label}${mergedText}, score ${ui.fmt(res.state.score)}`);
}

function undo(force = false) {
  if (animating || history.length === 0) return;
  if (ui.isOverlayOpen() && !force) return;
  const prev = history.pop();
  state = {
    ...prev,
    elapsedMs: state.elapsedMs,
    undos: state.undos + 1,
    best: state.best,
    over: false,
  };
  ui.hideOverlay();
  renderer.render(state);
  refresh();
  ui.log('> undo');
  ui.announce(`undo, score ${ui.fmt(state.score)}`);
  persist();
}

/* ---------------- overlays ---------------- */

function showWin() {
  ui.log('> 0x800 REACHED');
  ui.announce('you built 0x800. 2048. you win.');
  const proceed = () => {
    state = keepGoing(state);
    persist();
    ui.log('> continuing past 0x800');
  };
  ui.showOverlay({
    kind: 'win',
    kicker: 'you win',
    title: '0x800 REACHED',
    sub: `2048 · ${ui.fmt(state.moves)} moves · ${ui.formatTime(state.elapsedMs)}`,
    body: `score ${ui.fmt(state.score)}${state.undos === 0 ? ' ★' : ''}\nnext stop: 0x1000 … 0x8000`,
    buttons: [
      {
        label: 'keep going',
        key: 'Esc',
        primary: true,
        onClick: () => {
          ui.hideOverlay();
          proceed();
        },
      },
      { label: 'new game', key: 'R', onClick: startNew },
    ],
    onDismiss: proceed,
  });
}

function showGameOver() {
  ui.log('> SEGMENTATION FAULT — board full');
  ui.announce(`game over. board full. score ${ui.fmt(state.score)}`);
  const star = state.undos === 0 ? ' ★' : '';
  const buttons = [{ label: 'new game', key: 'R', primary: true, onClick: startNew }];
  if (history.length)
    buttons.push({ label: 'undo last move', key: 'U', onClick: () => undo(true) });
  ui.showOverlay({
    kind: 'over',
    kicker: 'game over',
    title: 'SEGMENTATION FAULT',
    sub: 'board full — no legal move',
    body:
      `score ${ui.fmt(state.score)}${star}\n` +
      `best  ${ui.fmt(state.best)}\n` +
      `moves ${ui.fmt(state.moves)}\n` +
      `undos ${ui.fmt(state.undos)}\n` +
      `time  ${ui.formatTime(state.elapsedMs)}`,
    buttons,
    onDismiss: false,
  });
}

function showHelp() {
  if (ui.overlayKind() === 'help') {
    ui.hideOverlay();
    return;
  }
  if (ui.isOverlayOpen()) return;
  ui.showOverlay({
    kind: 'help',
    kicker: 'manual',
    title: 'how to play',
    body: ui.helpContent({
      radius: state.radius,
      theme: ui.theme,
      onRadius: switchRadius,
      onTheme: setTheme,
    }),
    buttons: [{ label: 'close', key: 'Esc', primary: true, onClick: () => ui.hideOverlay() }],
  });
}

/* ---------------- theme ---------------- */

function setTheme(theme) {
  prefs.theme = theme;
  store.savePrefs(prefs);
  ui.applyTheme(theme);
  ui.log(`> theme: ${theme}`);
}

function cycleTheme() {
  setTheme(THEMES[(THEMES.indexOf(ui.theme) + 1) % THEMES.length]);
}

/* ---------------- layout ---------------- */

function fit() {
  const r = stageEl.getBoundingClientRect();
  if (r.width > 0 && r.height > 0) renderer.fit(r.width - 8, r.height - 8);
}

if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stageEl);
else window.addEventListener('resize', fit);

/* ---------------- wiring ---------------- */

attachInput(
  {
    onMove: requestMove,
    onUndo: () => undo(ui.overlayKind() === 'over'),
    onNew: newGame,
    onHelp: showHelp,
    onEscape: () => ui.dismiss(),
  },
  { swipeEl: stageEl }
);

document.getElementById('score-panel').addEventListener('click', () => {
  ui.setHexMode(!ui.hexMode);
  prefs.hexScore = ui.hexMode;
  store.savePrefs(prefs);
  refresh();
  ui.log(`> display: ${ui.hexMode ? 'HEX' : 'DEC'}`);
});
document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-help').addEventListener('click', showHelp);
document.getElementById('btn-theme').addEventListener('click', cycleTheme);

// elapsed time ticks only while a live game is in front of the player
setInterval(() => {
  if (!state || state.over || state.moves === 0 || document.hidden || ui.isOverlayOpen()) return;
  state.elapsedMs += 1000;
  ui.updateTime(state);
}, 1000);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist(true);
});
window.addEventListener('pagehide', () => persist(true));

boot(RADII.includes(prefs.radius) ? prefs.radius : 2);
