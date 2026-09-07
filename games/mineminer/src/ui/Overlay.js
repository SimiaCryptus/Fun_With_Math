import { fmtTime, esc } from './Hud.js';
const WEIGHT_OPTS = [['1', 'Counts as 1'], ['0.5', 'Counts as ½'], ['0', 'Ignored']];


function select(name, label, options, value) {
  const opts = options
    .map(([v, text]) => `<option value="${v}" ${String(v) === String(value) ? 'selected' : ''}>${text}</option>`)
    .join('');
  return `<label class="row"><span>${label}</span><select name="${name}">${opts}</select></label>`;
}

function check(name, label, value) {
  return `<label class="row"><span>${label}</span><input type="checkbox" name="${name}" ${value ? 'checked' : ''}></label>`;
}

function stars(n) {
  return `<span class="stars">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;
}

/** Pause/settings, level select and end-of-run panels. Emits (act, data) via handlers.onAction. */
export class Overlay {
  constructor(root, handlers) {
    this.h = handlers;
    this.mode = null;
    this.el = document.createElement('div');
    this.el.className = 'overlay hidden';
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    this.el.appendChild(this.panel);
    root.appendChild(this.el);

    this.el.addEventListener('click', (e) => {
      if (e.target === this.el && this.mode !== 'end') this.hide();
    });
    this.panel.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      const data = { ...btn.dataset };
      if (act === 'custom') {
        for (const input of this.panel.querySelectorAll('.custom [name]')) data[input.name] = input.value;
      }
      this.h.onAction(act, data);
    });
    this.panel.addEventListener('change', (e) => {
      const form = e.target.closest('form.settings');
      if (form) this.h.onSettingsChange(this.readSettings(form));
    });
    this.panel.addEventListener('input', (e) => {
      if (e.target.name === 'volume') this.h.onSettingsChange(this.readSettings(e.target.form));
    });
  }

  isOpen() {
    return !this.el.classList.contains('hidden');
  }

  open(mode, html) {
    this.mode = mode;
    this.panel.innerHTML = html;
    this.el.classList.remove('hidden');
  }

  hide() {
    if (!this.isOpen()) return;
    this.el.classList.add('hidden');
    this.mode = null;
    this.h.onClose?.();
  }

  readSettings(form) {
    const fd = new FormData(form);
    return {
      ...this.current,
      cascade: fd.get('cascade'),
       edgeWeight: Number(fd.get('edgeWeight')),
       cornerWeight: Number(fd.get('cornerWeight')),
      lives: fd.get('lives'),
      safeFirstStrike: form.safeFirstStrike.checked,
      strictMarks: form.strictMarks.checked,
      undo: form.undo.checked,
      colourblind: form.colourblind.checked,
      reducedMotion: form.reducedMotion.checked,
      effects: fd.get('effects'),
      volume: Number(fd.get('volume')),
    };
  }

  showSettings(settings, ctx) {
    this.current = settings;
    this.open('settings', `
      <h2>Paused · Settings</h2>
      <form class="settings">
        ${select('cascade', 'Cascade', [['on', 'On'], ['off', 'Off'], ['single-layer', 'Single layer']], settings.cascade)}
         ${select('edgeWeight', 'Edge neighbours (12)', WEIGHT_OPTS, settings.edgeWeight)}
         ${select('cornerWeight', 'Corner neighbours (8)', WEIGHT_OPTS, settings.cornerWeight)}
        ${select('lives', 'Lives', [['1', '1'], ['3', '3'], ['inf', '∞ (Zen)']], settings.lives)}
        ${check('safeFirstStrike', 'Safe first strike', settings.safeFirstStrike)}
        ${check('strictMarks', 'Strict marks (limited to mine count)', settings.strictMarks)}
        ${check('undo', 'Undo (Z)', settings.undo)}
        ${check('colourblind', 'Colourblind digits (underline 6 / 9)', settings.colourblind)}
        ${check('reducedMotion', 'Reduced motion', settings.reducedMotion)}
        ${select('effects', 'Effects', [['low', 'Low'], ['med', 'Medium'], ['high', 'High']], settings.effects)}
        <label class="row"><span>Volume</span>
          <input type="range" name="volume" min="0" max="1" step="0.05" value="${settings.volume}"></label>
      </form>
      <div class="row"><span>Seed <code>${esc(ctx.seed)}</code></span>
        <button class="btn small" data-act="copy">Copy link</button></div>
      <div class="actions">
        <button class="btn primary" data-act="resume">Resume</button>
        <button class="btn" data-act="restart">Restart (R)</button>
        <button class="btn" data-act="newseed">New seed (N)</button>
        <button class="btn" data-act="levels">Levels</button>
      </div>
       <p class="sub" style="margin-top:14px">
         The 6 face-touching neighbours always count as 1. Edge- and corner-touching neighbours
         can count as 1, ½ or nothing — half-weights show up as numbers like <code>3½</code>.
         Changing them (or lives) restarts the current board.
       </p>
    `);
  }

  showMenu(levels, progress, currentIndex) {
    const rows = levels
      .map((l, i) => {
        const p = progress[l.id];
        return `
          <button class="level ${currentIndex === i ? 'current' : ''}" data-act="level" data-index="${i}">
            <span class="num">${i + 1}</span>
            <span class="name">${esc(l.name)}<small>${l.w}×${l.d}×${l.h} · ${l.mines} mines · par ${fmtTime(l.par * 1000)}</small></span>
            ${stars(p?.stars || 0)}
            <span class="best">${p?.best != null ? fmtTime(p.best) : '—'}</span>
          </button>`;
      })
      .join('');
    this.open('menu', `
      <h1>MineMiner</h1>
      <p class="sub">Break every safe block. Mark every mineblock. Don't strike an unmarked one.</p>
      <div class="levels">${rows}</div>
      <div class="custom">
        <h2>Custom vault</h2>
        <div class="grid">
          <label class="row"><span>Width</span><input type="number" name="w" min="3" max="40" value="12"></label>
          <label class="row"><span>Depth</span><input type="number" name="d" min="3" max="40" value="12"></label>
          <label class="row"><span>Height</span><input type="number" name="h" min="1" max="40" value="2"></label>
          <label class="row"><span>Mines</span><input type="number" name="mines" min="1" value="30"></label>
        </div>
        <label class="row"><span>Seed</span><input type="text" name="seed" placeholder="random"></label>
        <div class="actions">
          <button class="btn primary" data-act="custom">Dig custom vault</button>
          <button class="btn" data-act="settings">Settings</button>
          <button class="btn" data-act="resume">Back</button>
        </div>
      </div>
    `);
  }

  showEnd(stats) {
    const cls = stats.won ? 'won' : 'lost';
    this.open('end', `
      <div class="end ${cls}">
        <h2>${stats.won ? 'Vault cleared!' : 'Detonation'}</h2>
        ${stats.won ? `<div class="stars big">${'★'.repeat(stats.stars)}${'☆'.repeat(3 - stats.stars)}</div>` : ''}
        <dl>
          <dt>Time</dt><dd>${fmtTime(stats.timeMs)}${stats.par ? ` <span class="sub">(par ${fmtTime(stats.par * 1000)})</span>` : ''}</dd>
          <dt>Misfires</dt><dd>${stats.misfires}</dd>
          <dt>Detonations</dt><dd>${stats.detonations}</dd>
          <dt>Largest cascade</dt><dd>${stats.largestCascade} blocks</dd>
          <dt>Seed</dt><dd><code>${esc(stats.seed)}</code></dd>
        </dl>
        <div class="actions">
          ${stats.won && stats.hasNext ? '<button class="btn primary" data-act="next">Next level</button>' : ''}
          <button class="btn ${stats.won && stats.hasNext ? '' : 'primary'}" data-act="newseed">New seed (N)</button>
          <button class="btn" data-act="restart">Retry seed (R)</button>
          <button class="btn" data-act="levels">Levels</button>
          <button class="btn" data-act="copy">Copy link</button>
        </div>
      </div>
    `);
  }
}