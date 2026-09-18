import { formatTime } from '../core/Clock.js';

const CONTROLS = [
  ['Throttle', 'W / ↑ / RT'],
  ['Brake', 'S / ↓ / LT'],
  ['Steer', 'A · D / ← → / stick'],
  ['Boost', 'Shift / Space / A'],
  ['Look back', 'Q / B'],
  ['Pause', 'Esc / Start'],
  ['Restart', 'R'],
  ['FX intensity', '[ · ] · O toggles'],
  ['Mute', 'M'],
];

export class Menu {
  constructor(root = document.getElementById('overlay')) {
    this.root = root;
  }

  hide() {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  _show(html) {
    this.root.innerHTML = `<div class="card">${html}</div>`;
    this.root.classList.remove('hidden');
  }

  showStart({ best = Infinity, effect = 1, trackName = 'Photon Circuit', laps = 3 } = {}) {
    const controls = CONTROLS.map(([k, v]) => `<div><span>${k}</span>${v}</div>`).join('');
    this._show(`
      <h1>Velocity Racer</h1>
      <h2>c = 88 mph</h2>
      <p><strong>${trackName}</strong> — ${laps} laps. The speed of light is
      39.34 m/s, so the faster you go the more the universe lies to you:
      the road contracts, the world bunches into a forward cone, colours
      blueshift ahead and redshift behind, and your cockpit clock falls
      behind the track clock.</p>
      <div class="grid">${controls}</div>
      <p class="note">Best lap (track time): ${formatTime(best)} &nbsp;·&nbsp; FX ${Math.round(effect * 100)}%</p>
      <div class="cta">Press SPACE or ENTER to launch</div>
    `);
  }

  showPause({ effect = 1 } = {}) {
    this._show(`
      <h1>Paused</h1>
      <h2>proper time suspended</h2>
      <p>ESC or ENTER to resume · R to restart the race.</p>
      <p class="note">FX intensity ${Math.round(effect * 100)}% — use [ and ] to change it.</p>
    `);
  }

  showResults({ lapTimes = [], coord = 0, proper = 0, best = Infinity, isNewBest = false }) {
    const rows = lapTimes
      .map(
        (l, i) => `
      <tr>
        <td>Lap ${i + 1}</td>
        <td>${formatTime(l.coord)}</td>
        <td>${formatTime(l.proper)}</td>
        <td>${(l.coord / Math.max(l.proper, 1e-6)).toFixed(3)}</td>
      </tr>`
      )
      .join('');

    this._show(`
      <h1>Finish</h1>
      <h2>${isNewBest ? 'new best lap' : 'race complete'}</h2>
      <table class="results">
        <tr><th>&nbsp;</th><th>Track t</th><th>Cockpit &tau;</th><th>&gamma;&#773;</th></tr>
        ${rows}
        <tr class="total"><td>Total</td><td>${formatTime(coord)}</td><td>${formatTime(proper)}</td>
          <td>${(coord / Math.max(proper, 1e-6)).toFixed(3)}</td></tr>
      </table>
      <p>You aged <strong>${formatTime(proper)}</strong> while the circuit aged
      <strong>${formatTime(coord)}</strong> — ${(coord - proper).toFixed(3)} s of
      borrowed time.</p>
      <p class="note">Best lap: ${formatTime(best)}</p>
      <div class="cta">Press SPACE / ENTER / R to race again</div>
    `);
  }
}
