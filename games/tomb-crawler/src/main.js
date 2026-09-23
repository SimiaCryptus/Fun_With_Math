import { Game } from './core/Game.js';

try {
  window.game = new Game();
} catch (err) {
  console.error(err);
  document.body.innerHTML = `<div style="padding:30px;color:#f3e2c0">Tomb Crawler failed to start: ${err.message}</div>`;
}