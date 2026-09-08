import { OUTLINES, EDGE_MODES, CROSSING_MODES, GOALS } from '../config.js';
import { connectionDistance } from '../engine/Score.js';

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c != null) e.append(c);
  return e;
}

const CROSSING_HINT = {
  strict: 'Diagonals never connect. Games on pinched tilings can be drawn.',
  bridge: 'Diagonals connect, but crossings are resolved: the older link bridges over, the newer one is cut.',
  open: 'Every diagonal connects for everyone. Fast and chaotic.',
};

export class HUD {
  constructor({ hudEl, setupEl, toastEl, tilings, theme, onConfig, onUndo, onSwap, onNew, onCopy }) {
    this.toastEl = toastEl;
    this.theme = theme;
    this.onConfig = onConfig;

    this.status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.seats = el('div', { class: 'seats' });
    this.swapBtn = el('button', { text: 'Swap sides (pie rule)', onclick: onSwap });
    this.swapBtn.hidden = true;
    hudEl.append(
      el('h1', { text: 'Bridges' }),
      this.status,
      this.seats,
      el('div', { class: 'buttons' },
        el('button', { text: 'Undo', onclick: onUndo }),
        this.swapBtn,
        el('button', { text: 'New game', onclick: onNew }),
        el('button', { text: 'Copy link', onclick: onCopy }),
      ),
    );

    this.fields = {};
    const select = (key, label, options) => {
      const s = el('select', { onchange: () => this._changed() });
      for (const [v, l] of options) s.append(el('option', { value: v, text: l }));
      this.fields[key] = s;
      return el('label', {}, el('span', { text: label }), s);
    };
    this.sizeOut = el('output', { text: '11' });
    this.fields.size = el('input', {
      type: 'range', min: '3', max: '31', value: '11',
      oninput: () => { this.sizeOut.textContent = this.fields.size.value; },
      onchange: () => this._changed(),
    });
    this.fields.pie = el('input', { type: 'checkbox', onchange: () => this._changed() });
    this.badge = el('span', { class: 'badge' });
    this.hint = el('p', { class: 'hint' });

    setupEl.append(
      el('h2', { text: 'Board' }),
      select('tiling', 'Tiling', tilings.map(t => [t.id, `${t.name} (${t.vertexConfig})`])),
      select('outline', 'Outline', Object.entries(OUTLINES).map(([k, o]) => [k, `${o.label} — ${o.sides / 2}p`])),
      el('label', {}, el('span', { text: 'Size' }), this.fields.size, this.sizeOut),
      select('edgeMode', 'Edge', EDGE_MODES.map(m => [m, m])),
      select('crossingMode', 'Crossings', CROSSING_MODES.map(m => [m, m])),
      select('goal', 'Goal', GOALS.map(g => [g, g])),
      el('label', { class: 'check' }, this.fields.pie, el('span', { text: 'Pie rule (swap)' })),
      this.badge,
      this.hint,
    );
  }

  _changed() { this.onConfig(this.readConfig()); }

  readConfig() {
    const f = this.fields;
    return {
      tiling: f.tiling.value, outline: f.outline.value, size: Number(f.size.value),
      edgeMode: f.edgeMode.value, crossingMode: f.crossingMode.value, goal: f.goal.value,
      variants: f.pie.checked ? ['pie'] : [],
    };
  }

  setConfig(cfg) {
    const f = this.fields;
    f.tiling.value = cfg.tiling; f.outline.value = cfg.outline;
    f.size.value = String(cfg.size); this.sizeOut.textContent = String(cfg.size);
    f.edgeMode.value = cfg.edgeMode; f.crossingMode.value = cfg.crossingMode; f.goal.value = cfg.goal;
    f.pie.checked = cfg.variants.includes('pie');
  }

  update(game, config, board) {
    const pal = this.theme.players;
    this.seats.replaceChildren(...Array.from({ length: game.players }, (_, seat) => {
      const colour = game.colourOf(seat);
      const d = connectionDistance(board, game.owner, colour);
      const active = game.phase === 'playing' && game.turn === colour;
      return el('div', { class: 'seat' + (active ? ' active' : '') },
        el('span', { class: 'swatch', style: `background:${pal[colour]}` }),
        el('span', { text: `Player ${seat + 1}` }),
        el('span', { class: 'meter', text: Number.isFinite(d) ? `${d} to connect` : 'cut off' }),
      );
    }));
    if (game.phase === 'won') {
      this.status.textContent = `Player ${game.seatOf(game.winner) + 1} wins in ${game.claims} moves!`;
    } else if (game.phase === 'draw') {
      this.status.textContent = 'Board full — draw.';
    } else {
      this.status.textContent = `Player ${game.seatOf(game.turn) + 1} to move (move ${game.claims + 1})`;
    }
    this.swapBtn.hidden = !game.canSwap();

    const clean = board.clean;
    this.badge.textContent = clean ? 'clean — no draws' : `pinched — degree ${board.maxDegree}`;
    this.badge.className = 'badge ' + (clean ? 'clean' : 'pinched');
    this.hint.textContent = `${board.cells.length} cells · ${board.chords.length} chords · ` +
      (clean ? 'Every interior vertex touches 3 tiles, so a full board always has exactly one winner.'
             : CROSSING_HINT[config.crossingMode]);
  }

  toast(msg) {
    const t = el('div', { class: 'toast', text: msg });
    this.toastEl.append(t);
    setTimeout(() => t.remove(), 3200);
  }
}