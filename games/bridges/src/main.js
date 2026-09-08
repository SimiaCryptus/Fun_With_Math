import { DEFAULTS, SWAP, PASS, normalize, fromHash, toHash, normalizeDisplay } from './config.js';
import { tilings, tilingIds, tilingList } from './tilings/registry.js';
import { generateBoard } from './tilings/Tiling.js';
import { Game } from './engine/Game.js';
import { Clock } from './engine/Clock.js';
import { Renderer } from './render/Renderer.js';
import { THEMES } from './render/Themes.js';
import { HUD } from './ui/HUD.js';
import { Settings } from './ui/Settings.js';
import { Bot } from './ai/Bot.js';

const themeIds = Object.keys(THEMES);
const DISPLAY_KEY = 'bridges.display';

// Display settings are per device (localStorage); game config is per game (URL).
function loadDisplay() {
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(DISPLAY_KEY) || '{}'); } catch { /* ignore */ }
  return normalizeDisplay(stored, themeIds);
}
function saveDisplay(d) {
  try { localStorage.setItem(DISPLAY_KEY, JSON.stringify(d)); } catch { /* private mode etc. */ }
}

let display = loadDisplay();

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new Renderer(canvas, display);
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', '<p class="nojs">WebGL is unavailable in this browser.</p>');
  throw err;
}

let config, board, game;
let clock = null, clockTimer = 0;
const bot = new Bot();
let thinkToken = 0;   // bumped whenever the position changes; stale bot replies are dropped
let undoing = false;

const isBot = seat => (config?.bots?.[seat] ?? 'human') !== 'human';
const isBotTurn = () => game.phase === 'playing' && isBot(game.seatOf(game.turn));

const hud = new HUD({
  hudEl: document.getElementById('hud'),
  toastEl: document.getElementById('toasts'),
  theme: THEMES[display.theme],
  onUndo: () => undoMove(),
  onSwap: () => game.canSwap() && !isBotTurn() && game.swap(),
   onPass: () => game.canPass() && !isBotTurn() && game.pass(),
  onNew: () => start(config, []),
  onCopy: () => navigator.clipboard?.writeText(location.href).then(() => hud.toast('Link copied')),
  onSettings: () => settings.open(),
});

const settings = new Settings({
  dialogEl: document.getElementById('settings'),
  tilings: tilingList,
  themes: themeIds,
  onConfig: partial => start(normalize({ ...config, ...partial }, tilingIds), []),
  onDisplay: partial => applyDisplay(normalizeDisplay({ ...display, ...partial }, themeIds)),
});
settings.setDisplay(display);

function refresh() {
  hud.update(game, config, board, tilings[config.tiling]);
  history.replaceState(null, '', toHash(config, game.moves));
}

function applyDisplay(d) {
  display = d;
  saveDisplay(d);
  renderer.setDisplay(d, game);
  hud.setTheme(THEMES[d.theme]);
  settings.setDisplay(d);
  if (game) hud.update(game, config, board, tilings[config.tiling]);
}

// ---- clocks -------------------------------------------------------------
function setupClock() {
  clearInterval(clockTimer);
  clock = null;
  if (config.time > 0) {
    clock = new Clock(config.players, config.time, config.increment);
    clockTimer = setInterval(tickClock, 100);
  }
  hud.setClock(clock);
}
function tickClock() {
  if (!clock || game.phase !== 'playing') return;
  const flagged = clock.tick();
  if (flagged >= 0) game.timeout(game.colourOf(flagged));
  else hud.updateClocks();
}
/** After undo / replay: run whoever is on move now (only once the clock has started). */
function syncClock() {
  if (!clock || clock.active < 0 || clock.flagged >= 0) return;
  if (game.phase === 'playing') clock.switchTo(game.seatOf(game.turn));
  else clock.stop();
}

// ---- bots ---------------------------------------------------------------
function scheduleBot() {
  const token = ++thinkToken;
  hud.setThinking(-1);
  if (undoing || game.phase !== 'playing') return;
  const seat = game.seatOf(game.turn);
  if (!isBot(seat)) return;
  hud.setThinking(seat);
  hud.update(game, config, board, tilings[config.tiling]);
  const started = performance.now();
  bot.choose(game, config, config.bots[seat]).then(move => {
    if (token !== thinkToken || game.phase !== 'playing') return;
    const wait = Math.max(0, 350 - (performance.now() - started)); // a beat, so replies feel deliberate
    setTimeout(() => {
      if (token !== thinkToken || game.phase !== 'playing') return;
      hud.setThinking(-1);
      if (move === SWAP && game.canSwap()) game.swap();
       else if (move === PASS && game.canPass()) game.pass();
       else if (Number.isInteger(move) && move >= 0 && game.isLegal(move)) game.play(move);
       else {
         const legal = game.legalCells();
         if (legal.length) game.play(legal[0]);
         else if (game.canPass()) game.pass();
       }
    }, wait);
  }).catch(err => {
    console.error(err);
    hud.setThinking(-1);
    hud.toast(`Bot failed: ${err.message}`);
  });
}

function undoMove() {
  if (!game.moves.length) return;
  undoing = true;
  try {
    game.undo();
    // step back over bot replies so a human is on move again
    const humans = config.bots.some(b => b === 'human');
    let guard = 0;
    while (humans && game.moves.length && game.phase === 'playing' && isBotTurn() && guard++ < config.players) game.undo();
  } finally {
    undoing = false;
  }
  scheduleBot();
}

// ---- game lifecycle -----------------------------------------------------
function start(cfg, moves) {
  let b;
  try {
    b = generateBoard(tilings[cfg.tiling], cfg);
  } catch (err) {
    console.error(err);
    hud.toast(`Board failed (${err.message}) — falling back to Hex`);
    cfg = normalize({ ...DEFAULTS, tiling: 'hex' }, tilingIds);
    b = generateBoard(tilings[cfg.tiling], cfg);
    moves = [];
  }
  config = cfg;
  board = b;
  game = new Game(board, config);
  game.on('move', res => {
     if (!res.swap && !res.pass) renderer.applyMove(game, res);
    if (clock && clock.flagged < 0) {
      if (game.phase !== 'playing') clock.stop();
      else clock.switchTo(game.seatOf(game.turn), res.swap ? -1 : game.seatOf(res.player));
    }
    refresh();
    scheduleBot();
  });
  game.on('sync', () => {
    renderer.sync(game);
    syncClock();
    refresh();
    scheduleBot();
  });
  game.on('end', ({ phase, winner }) => {
     const name = winner >= 0 ? `Player ${game.seatOf(winner) + 1}` : '';
     const go = game.rules === 'go';
     hud.toast(phase === 'timeout' ? `${name} wins on time!`
       : phase === 'draw' ? (go ? 'Draw — scores tied' : 'Draw — board full')
       : go ? `${name} wins on points!` : `${name} connected!`);
  });
  settings.setConfig(config);
  settings.setBoard(board, config);
  renderer.setBoard(board);
  setupClock();
  game.replay(moves); // emits sync
}

renderer.onPick = id => { if (id >= 0 && game.isLegal(id) && !isBotTurn()) game.play(id); };

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (settings.isOpen) return; // Escape closes the dialog natively
  if (e.key === 'u') undoMove();
  if (e.key === 'n') start(config, []);
   if (e.key === 'p' && game.canPass() && !isBotTurn()) game.pass();
  if (e.key === 's') settings.open();
});

const { config: c0, moves: m0 } = fromHash(location.hash, tilingIds);
start(c0, m0);