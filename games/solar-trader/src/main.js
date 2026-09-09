import { Game } from './sim/game.js';
import { SceneView } from './render/scene.js';
import { initHUD } from './ui/hud.js';
import { initNav } from './ui/nav.js';
import { initTrade } from './ui/trade.js';
import { STATION_BY_ID } from './data/stations.js';

const game = new Game();
const view = new SceneView(
  document.getElementById('gl'),
  document.getElementById('labels'),
  game,
);

const renderHUD = initHUD(game);
const tickNav = initNav(game, view);
const tickTrade = initTrade(game);

// Keyboard: space = pause toggle, F = focus target, 1-5 = warp rates.
const RATES = [0, 1, 4, 16, 64];
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); game.setRate(game.rate ? 0 : 4); }
  if (e.key.toLowerCase() === 'f') view.focus(STATION_BY_ID[game.target].body);
  const n = Number(e.key);
  if (n >= 1 && n <= 5) game.setRate(RATES[n - 1]);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  game.update(dt);
  view.update(game);
  renderHUD();
  tickNav(now);
  tickTrade(now);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for console poking during development.
window.ST = { game, view };