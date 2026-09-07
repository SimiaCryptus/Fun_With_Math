// ui.js — score panels, meta line, status log, overlays, themes, a11y text.

import { hex } from './game.js';
import { cellCount } from './hex.js';

export const THEMES = ['auto', 'light', 'dark', 'contrast'];
export const RADII = [1, 2, 3, 4];

const $ = (id) => document.getElementById(id);

export class UI {
  constructor({ hexMode = true } = {}) {
    this.hexMode = hexMode;
    this.el = {
      score: $('score'),
      best: $('best'),
      gain: $('gain'),
      moves: $('moves'),
      time: $('time'),
      undos: $('undos'),
      seed: $('seed'),
      log: $('log'),
      live: $('live'),
      board: $('board'),
      overlay: $('overlay'),
      kicker: $('ov-kicker'),
      title: $('ov-title'),
      sub: $('ov-sub'),
      body: $('ov-body'),
      actions: $('ov-actions'),
      scorePanel: $('score-panel'),
      themeBtn: $('btn-theme'),
    };
    this.lines = [];
    this.overlay = null; // { kind, onDismiss }
    this.lastFocus = null;
    this.theme = 'auto';
    this.darkMQ = matchMedia('(prefers-color-scheme: dark)');
    this.darkMQ.addEventListener?.('change', () => {
      if (this.theme === 'auto') this.applyTheme('auto');
    });
    this.el.overlay.addEventListener('click', (e) => {
      if (e.target === this.el.overlay) this.dismiss();
    });
  }

  /* ---- formatting ---- */

  fmt(n) {
    return this.hexMode ? `0x${hex(n)}` : String(n);
  }

  setHexMode(on) {
    this.hexMode = on;
  }

  formatTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }

  /* ---- panels ---- */

  update(state) {
    this.el.score.textContent = this.fmt(state.score);
    this.el.best.textContent = this.fmt(state.best);
    this.el.moves.textContent = `moves ${this.fmt(state.moves)}`;
    const star = state.undos === 0 && state.moves > 0 ? ' ★' : '';
    this.el.undos.textContent = `undos ${this.fmt(state.undos)}${star}`;
    this.updateTime(state);
    this.el.scorePanel.title = `${this.hexMode ? 'HEX' : 'DEC'} — click to toggle`;
    this.describe(state);
  }

  updateTime(state) {
    this.el.time.textContent = this.formatTime(state.elapsedMs);
  }

  setSeed(seed) {
    this.el.seed.textContent = `seed 0x${hex(seed)}`;
  }

  flashGain(n) {
    const g = this.el.gain;
    g.textContent = `+${this.fmt(n)}`;
    g.classList.remove('show');
    void g.offsetWidth;
    g.classList.add('show');
  }

  /* ---- status log & a11y ---- */

  log(text) {
    this.lines.push(text.startsWith('>') ? text : `> ${text}`);
    if (this.lines.length > 6) this.lines.shift();
    this.el.log.replaceChildren(
      ...this.lines.map((l) => {
        const s = document.createElement('span');
        s.textContent = l;
        return s;
      })
    );
  }

  announce(text) {
    this.el.live.textContent = '';
    requestAnimationFrame(() => {
      this.el.live.textContent = text;
    });
  }

  describe(state) {
    const parts = state.tiles
      .slice()
      .sort((a, b) => b.value - a.value)
      .map((t) => `0x${hex(t.value)} at ${t.q},${t.r}`);
    this.el.board.setAttribute(
      'aria-label',
      `hex board radius ${state.radius}, ${state.tiles.length} of ${cellCount(state.radius)} cells filled. ${parts.join('; ')}`
    );
  }

  /* ---- overlays ---- */

  isOverlayOpen() {
    return this.overlay !== null;
  }

  overlayKind() {
    return this.overlay?.kind ?? null;
  }

  /**
   * @param {object} o
   * @param {string} o.kind
   * @param {string} [o.kicker]
   * @param {string} o.title
   * @param {string} [o.sub]
   * @param {string|Node|null} [o.body]  string → <pre>
   * @param {{label:string,key?:string,primary?:boolean,onClick:Function}[]} [o.buttons]
   * @param {Function|null|false} [o.onDismiss]  false = not dismissible
   */
  showOverlay({ kind, kicker = '', title, sub = '', body = null, buttons = [], onDismiss = null }) {
    const { overlay, kicker: k, title: t, sub: s, body: b, actions } = this.el;
    if (!this.overlay) this.lastFocus = document.activeElement;
    overlay.dataset.kind = kind;
    k.textContent = kicker;
    t.textContent = title;
    s.textContent = sub;
    b.replaceChildren();
    if (typeof body === 'string') {
      const pre = document.createElement('pre');
      pre.textContent = body;
      b.append(pre);
    } else if (body) {
      b.append(body);
    }
    actions.replaceChildren(
      ...buttons.map(({ label, key, primary, onClick }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn${primary ? ' primary' : ''}`;
        btn.append(document.createTextNode(label));
        if (key) {
          const kb = document.createElement('kbd');
          kb.textContent = key;
          btn.append(kb);
        }
        btn.addEventListener('click', onClick);
        return btn;
      })
    );
    overlay.hidden = false;
    this.overlay = { kind, onDismiss };
    const focusTarget = actions.querySelector('.primary') || actions.querySelector('button');
    focusTarget?.focus({ preventScroll: true });
  }

  hideOverlay() {
    if (!this.overlay) return;
    this.overlay = null;
    this.el.overlay.hidden = true;
    this.el.overlay.dataset.kind = '';
    const f = this.lastFocus;
    this.lastFocus = null;
    if (f && typeof f.focus === 'function' && f !== document.body) f.focus({ preventScroll: true });
  }

  /** Esc / backdrop click. Runs the overlay's onDismiss unless it's false. */
  dismiss() {
    if (!this.overlay) return;
    const cb = this.overlay.onDismiss;
    if (cb === false) return;
    this.hideOverlay();
    if (typeof cb === 'function') cb();
  }

  /* ---- theme ---- */

  applyTheme(theme) {
    this.theme = THEMES.includes(theme) ? theme : 'auto';
    const resolved = this.theme === 'auto' ? (this.darkMQ.matches ? 'dark' : 'light') : this.theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = this.theme;
    this.el.themeBtn.textContent = `theme: ${this.theme}`;
  }

  /* ---- help overlay content ---- */

  helpContent({ radius, theme, onRadius, onTheme }) {
    const frag = document.createDocumentFragment();
    const h3 = (txt) => {
      const h = document.createElement('h3');
      h.textContent = txt;
      return h;
    };
    const p = (html) => {
      const e = document.createElement('p');
      e.innerHTML = html;
      return e;
    };

    frag.append(
      p(
        'Slide tiles in <b>six</b> directions. Equal tiles touching along the slide merge and double. ' +
          'Values are written in <b>hexadecimal</b>: <code>1 2 4 8 10 20 40 80 100 200 400 800</code>. ' +
          'Build <b class="gold">0x800</b> (2048) to win. Every move spawns a <code>1</code> (90%) or a <code>2</code> (10%).'
      )
    );

    frag.append(h3('keys'));
    const keys = document.createElement('pre');
    keys.textContent =
      '   W   E          NW   NE\n' +
      ' A   S   D   →   W        E\n' +
      '   Z   C          SW   SE\n' +
      '\n' +
      ' arrows  ← → ↑ ↓   shift+↑ = NE, shift+↓ = SW\n' +
      ' numpad  7 9 / 4 6 / 1 3\n' +
      ' U       undo (also ctrl+Z)\n' +
      ' R       new game        ?  this help\n' +
      ' swipe the board or tap the pad on touch';
    frag.append(keys);

    frag.append(h3('board size'));
    const sizes = document.createElement('div');
    sizes.className = 'chips';
    sizes.setAttribute('role', 'group');
    sizes.setAttribute('aria-label', 'board size');
    for (const r of RADII) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.textContent = `r${r} · ${cellCount(r)} cells`;
      c.setAttribute('aria-pressed', String(r === radius));
      c.addEventListener('click', () => onRadius(r));
      sizes.append(c);
    }
    frag.append(sizes);

    frag.append(h3('theme'));
    const themes = document.createElement('div');
    themes.className = 'chips';
    themes.setAttribute('role', 'group');
    themes.setAttribute('aria-label', 'theme');
    for (const t of THEMES) {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip';
      c.textContent = t;
      c.setAttribute('aria-pressed', String(t === theme));
      c.addEventListener('click', () => {
        onTheme(t);
        for (const other of themes.children)
          other.setAttribute('aria-pressed', String(other === c));
      });
      themes.append(c);
    }
    frag.append(themes);

    frag.append(
      p(
        '<small>Click the SCORE panel to switch between HEX and DEC. Undo is free but counted; a run with zero undos earns a ★.</small>'
      )
    );
    return frag;
  }
}
