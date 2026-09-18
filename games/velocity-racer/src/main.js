import { Game } from './core/Game.js';

const canvas = document.getElementById('viewport');
const game = new Game({ canvas });

game
  .init()
  .then(() => game.start())
  .catch((err) => {
    console.error(err);
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="card">
      <h1>Stalled</h1>
      <h2>at rest, sadly</h2>
      <p>Velocity Racer failed to boot. Serve this folder over HTTP
      (ES modules cannot load from <code>file://</code>).</p>
      <p class="error">${String(err && err.stack ? err.stack : err)}</p>
    </div>`;
  });

// Handy for tinkering in the console.
window.velocityRacer = game;
