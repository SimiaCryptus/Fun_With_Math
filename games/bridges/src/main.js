import { DEFAULTS, normalize, fromHash, toHash } from './config.js';
import { tilings, tilingIds, tilingList } from './tilings/registry.js';
import { generateBoard } from './tilings/Tiling.js';
import { Game } from './engine/Game.js';
import { Renderer } from './render/Renderer.js';
import { THEMES } from './render/Themes.js';
import { HUD } from './ui/HUD.js';

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new Renderer(canvas, DEFAULTS.theme);
} catch (err) {
  document.body.insertAdjacentHTML('beforeend', '<p class="nojs">WebGL is unavailable in this browser.</p>');
  throw err;
}

let config, board, game;

const hud = new HUD({
  hudEl: document.getElementById('hud'),
  setupEl: document.getElementById('setup'),
  toastEl: document.getElementById('toasts'),
  tilings: tilingList,
  theme: THEMES[DEFAULTS.theme],
  onConfig: partial => start(normalize({ ...config, ...partial }, tilingIds), []),
  onUndo: () => game.undo(),
  onSwap: () => game.canSwap() && game.swap(),
  onNew: () => start(config, []),
  onCopy: () => navigator.clipboard?.writeText(location.href).then(() => hud.toast('Link copied')),
});

function updateURL() {
  history.replaceState(null, '', toHash(config, game.moves));
}

function start(cfg, moves) {
  let b;
  try {
    b = generateBoard(tilings[cfg.tiling], cfg);
  } catch (err) {
    console.error(err);
    hud.toast(`Board failed (${err.message}) — falling back to Hex`);
    cfg = normalize({ ...DEFAULTS }, tilingIds);
    b = generateBoard(tilings.hex, cfg);
    moves = [];
  }
  config = cfg;
  board = b;
  game = new Game(board, config);
  game.on('move', res => {
    if (!res.swap) renderer.applyMove(game, res);
    hud.update(game, config, board);
    updateURL();
  });
  game.on('sync', () => {
    renderer.sync(game);
    hud.update(game, config, board);
    updateURL();
  });
  game.on('end', ({ phase, winner }) => {
    hud.toast(phase === 'won' ? `Player ${game.seatOf(winner) + 1} connected!` : 'Draw — board full');
  });
  hud.setConfig(config);
  renderer.setBoard(board);
  game.replay(moves); // emits sync
}

renderer.onPick = id => { if (id >= 0 && game.isLegal(id)) game.play(id); };

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'u') game.undo();
  if (e.key === 'n') start(config, []);
});

const { config: c0, moves: m0 } = fromHash(location.hash, tilingIds);
start(c0, m0);