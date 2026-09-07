export function fmtTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Plain-DOM heads-up display layered over the canvas. */
export class Hud {
  constructor(root, handlers) {
    this.h = handlers;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud-tl">
        <div class="mines-ring"><div class="mines-count">0</div></div>
        <div class="hud-stack">
          <div class="timer">00:00.0</div>
          <div class="lives"></div>
          <div class="level-name"></div>
        </div>
      </div>
      <div class="hud-tr">
        <div class="layers"></div>
        <button class="btn cam" title="Toggle camera (V)">🎥 Orbit</button>
        <button class="btn menu" title="Levels">☰</button>
        <button class="btn gear" title="Pause / settings (Space)">⚙</button>
      </div>
      <div class="hud-bc">
        <button class="btn touch-mode hidden" title="Tap action">⛏</button>
        <div class="hint"></div>
      </div>
      <div class="flash"></div>
      <div class="crosshair"></div>
    `;
    root.appendChild(this.el);
    const q = (sel) => this.el.querySelector(sel);
    this.minesEl = q('.mines-count');
    this.ringEl = q('.mines-ring');
    this.timerEl = q('.timer');
    this.livesEl = q('.lives');
    this.levelEl = q('.level-name');
    this.layersEl = q('.layers');
    this.camBtn = q('.cam');
    this.touchBtn = q('.touch-mode');
    this.hintEl = q('.hint');
    this.flashEl = q('.flash');

    this.layersEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-layer]');
      if (btn) this.h.onLayer(Number(btn.dataset.layer));
    });
    this.camBtn.addEventListener('click', () => this.h.onCamera());
    q('.menu').addEventListener('click', () => this.h.onMenu());
    q('.gear').addEventListener('click', () => this.h.onSettings());
    this.touchBtn.addEventListener('click', () => this.h.onTouchMode());
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) this.touchBtn.classList.remove('hidden');
  }

  setLevel(name, seed) {
    this.levelEl.innerHTML = `${esc(name)} · <code>${esc(seed)}</code>`;
  }

  setMines(n) {
    this.minesEl.textContent = String(n);
  }

  setProgress(frac) {
    this.ringEl.style.setProperty('--p', String(Math.round(frac * 100)));
  }

  setLives(n) {
    this.livesEl.textContent = n === Infinity ? '⛏ ∞' : '⛏'.repeat(Math.max(0, n));
  }

  setTime(ms) {
    const text = fmtTime(ms);
    if (this.timerEl.textContent !== text) this.timerEl.textContent = text;
  }

  setLayers(count) {
    this.layersEl.classList.toggle('hidden', count <= 1);
    let html = `<button class="btn" data-layer="-1" title="All layers (0)">0</button>`;
    for (let y = 0; y < count; y++) {
      html += `<button class="btn" data-layer="${y}" title="Isolate layer ${y + 1}">${y + 1}</button>`;
    }
    this.layersEl.innerHTML = html;
  }

  setLayer(y) {
    for (const btn of this.layersEl.querySelectorAll('button')) {
      btn.classList.toggle('active', Number(btn.dataset.layer) === y);
    }
  }

  setCameraMode(mode) {
    this.camBtn.textContent = mode === 'miner' ? '⛏ Miner' : '🎥 Orbit';
  }

  setTouchMode(mode) {
    this.touchBtn.textContent = mode === 'mark' ? '🚩' : '⛏';
  }

  setHint(text) {
    this.hintEl.textContent = text;
  }

  flash(text, ms = 1800) {
    this.flashEl.textContent = text;
    this.flashEl.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => this.flashEl.classList.remove('show'), ms);
  }
}