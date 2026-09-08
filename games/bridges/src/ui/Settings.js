import { OUTLINES, EDGE_MODES, CROSSING_MODES, GOALS, BORDER_MODES, BOTS, CLOCKS, clockLabel } from '../config.js';
import { el } from './dom.js';

const CROSSING_HINT = {
  strict: 'Diagonals never connect. Games on pinched tilings can be drawn.',
  bridge: 'Diagonals connect, but crossings are resolved: the older link bridges over, the newer one is cut.',
  open: 'Every diagonal connects for everyone. Fast and chaotic.',
};
const GOAL_LABEL = {
   opposite: 'opposite — connect your two sides',
   fork: 'fork — connect all of your sides',
   go: 'go — surround territory',
};
const GOAL_HINT = {
   opposite: 'Claim cells; link the two sides that carry your colour. Claims are permanent.',
   fork: 'Claim cells; link every side that carries your colour.',
   go: 'Go on this tiling: groups without liberties (along shared edges) are captured, suicide is forbidden, ' +
       'simple ko applies. Pass with the Pass button; when everyone has passed in turn the board is scored ' +
       'by area (stones + surrounded empty cells). Dead stones are not removed — play them out. ' +
       'The crossing rule is not used.',
};

const BORDER_LABEL = {
  off: 'off',
  anchored: 'anchored — reaches one of my sides',
  spanning: 'spanning — reaches both of my sides',
};
const BORDER_HINT = {
  off: 'Tile borders are never painted.',
  anchored: 'Tiles whose group really reaches one of its owner’s sides get a painted border; it turns striped once the group reaches both.',
  spanning: 'Only tiles in a group that reaches both of its owner’s sides are painted (striped).',
};
const BOT_LABEL = { human: 'Human', easy: 'Bot — easy', medium: 'Bot — medium', hard: 'Bot — hard' };
const clockText = (key, [time, inc]) =>
  key === 'none' ? 'none — untimed' : `${time / 60} min${inc ? ` + ${inc} s per move` : ''}`;

/**
 * Modal settings dialog.  Board + rules + players changes start a new game
 * (via `onConfig`); display changes apply live (via `onDisplay`).
 */
export class Settings {
  constructor({ dialogEl, tilings, themes, onConfig, onDisplay }) {
    this.dialog = dialogEl;
    this.onConfig = onConfig;
    this.onDisplay = onDisplay;
    this.fields = {};
    this.clockValues = { ...CLOCKS };

    const cfgChanged = () => this.onConfig(this.readConfig());
    const dispChanged = () => this.onDisplay(this.readDisplay());
    const select = (key, options, onchange) => {
      const s = el('select', { id: `set-${key}`, onchange });
      for (const [v, l] of options) s.append(el('option', { value: v, text: l }));
      this.fields[key] = s;
      return s;
    };
    const check = (key, onchange) => {
      const c = el('input', { type: 'checkbox', id: `set-${key}`, onchange });
      this.fields[key] = c;
      return c;
    };
    const row = (label, control, extra) => el('label', {}, el('span', { text: label }), control, extra);
    const checkRow = (control, label) => el('label', { class: 'check' }, control, el('span', { text: label }));

    this.sizeOut = el('output', { text: '11' });
    this.fields.size = el('input', {
      type: 'range', min: '3', max: '31', value: '11', id: 'set-size',
      oninput: () => { this.sizeOut.textContent = this.fields.size.value; },
      onchange: cfgChanged,
    });
    this.badge = el('span', { class: 'badge' });
    this.boardInfo = el('span', { class: 'hint' });
    this.crossingHint = el('p', { class: 'hint' });
     this.goalHint = el('p', { class: 'hint' });
    this.borderHint = el('p', { class: 'hint' });

    const board = el('fieldset', {},
      el('legend', { text: 'Board' }),
      row('Tiling', select('tiling', tilings.map(t => [t.id, `${t.name} (${t.vertexConfig})`]), cfgChanged)),
      row('Outline', select('outline',
        Object.entries(OUTLINES).map(([k, o]) => [k, `${o.label} — ${o.sides / 2} players`]), cfgChanged)),
      row('Size', this.fields.size, this.sizeOut),
      row('Edge', select('edgeMode', EDGE_MODES.map(m => [m, m]), cfgChanged)),
      el('div', { class: 'readout' }, this.badge, this.boardInfo),
    );
    const rules = el('fieldset', {},
      el('legend', { text: 'Rules' }),
      row('Crossings', select('crossingMode', CROSSING_MODES.map(m => [m, m]), cfgChanged)),
      this.crossingHint,
       row('Goal', select('goal', GOALS.map(g => [g, GOAL_LABEL[g] ?? g]), cfgChanged)),
       this.goalHint,
      checkRow(check('pie', cfgChanged), 'Pie rule — player 2 may swap colours instead of making their first move'),
    );
    this.seatRows = [0, 1, 2].map(seat =>
      row(`Player ${seat + 1}`, select(`bot${seat}`, BOTS.map(b => [b, BOT_LABEL[b]]), cfgChanged)));
    const players = el('fieldset', {},
      el('legend', { text: 'Players & clock' }),
      ...this.seatRows,
      row('Clock', select('clock', Object.entries(CLOCKS).map(([k, v]) => [k, clockText(k, v)]), cfgChanged)),
      el('p', { class: 'hint', text: 'Bots think in a background thread; difficulty is a time budget, not a handicap. ' +
        'Clocks are Fischer: main time per player plus an increment after each move. Running out of time loses.' }),
      el('p', { class: 'hint warn', text: 'Changing the board, the rules or the players starts a new game.' }),
    );
    const display = el('fieldset', {},
      el('legend', { text: 'Display' }),
      row('Theme', select('theme', themes.map(t => [t, t]), dispChanged)),
      row('Borders', select('borders', BORDER_MODES.map(m => [m, BORDER_LABEL[m] ?? m]), dispChanged)),
      this.borderHint,
      checkRow(check('links', dispChanged), 'Link bars between connected tiles'),
      checkRow(check('animations', dispChanged), 'Animations (claim rise, ripple, hover lift)'),
    );

    this.dialog.append(
      el('div', { class: 'settings-body' },
        el('header', {},
          el('h2', { id: 'settings-title', text: 'Settings' }),
          el('button', { class: 'close', 'aria-label': 'Close settings', text: '×', onclick: () => this.close() }),
        ),
        board, rules, players, display,
      ),
    );
    // click on the backdrop (the dialog element itself, which has no padding) closes
    this.dialog.addEventListener('click', e => { if (e.target === this.dialog) this.close(); });
  }

  get isOpen() { return this.dialog.open; }
  open() { if (!this.dialog.open) this.dialog.showModal(); }
  close() { if (this.dialog.open) this.dialog.close(); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  readConfig() {
    const f = this.fields;
    const [time, increment] = this.clockValues[f.clock.value] ?? [0, 0];
    return {
      tiling: f.tiling.value, outline: f.outline.value, size: Number(f.size.value),
      edgeMode: f.edgeMode.value, crossingMode: f.crossingMode.value, goal: f.goal.value,
      variants: f.pie.checked ? ['pie'] : [],
      bots: this.seatRows.map((_, i) => f[`bot${i}`].value),
      time, increment,
    };
  }

  setConfig(cfg) {
    const f = this.fields;
    f.tiling.value = cfg.tiling; f.outline.value = cfg.outline;
    f.size.value = String(cfg.size); this.sizeOut.textContent = String(cfg.size);
    f.edgeMode.value = cfg.edgeMode; f.crossingMode.value = cfg.crossingMode; f.goal.value = cfg.goal;
    f.pie.checked = cfg.variants.includes('pie');
    this.crossingHint.textContent = CROSSING_HINT[cfg.crossingMode] ?? '';
     this.goalHint.textContent = GOAL_HINT[cfg.goal] ?? '';
     f.crossingMode.disabled = cfg.goal === 'go'; // liberties are edge-only in Go
    this.seatRows.forEach((r, i) => {
      r.hidden = i >= cfg.players;
      f[`bot${i}`].value = cfg.bots?.[i] ?? 'human';
    });
    let key = Object.keys(this.clockValues)
      .find(k => this.clockValues[k][0] === cfg.time && this.clockValues[k][1] === cfg.increment);
    if (!key) { // a custom clock from a URL: add it as an option so the select can show it
      key = clockLabel(cfg.time, cfg.increment);
      this.clockValues[key] = [cfg.time, cfg.increment];
      f.clock.append(el('option', { value: key, text: clockText(key, this.clockValues[key]) }));
    }
    f.clock.value = key;
  }

  readDisplay() {
    const f = this.fields;
    return { theme: f.theme.value, borders: f.borders.value, links: f.links.checked, animations: f.animations.checked };
  }

  setDisplay(d) {
    const f = this.fields;
    f.theme.value = d.theme; f.borders.value = d.borders;
    f.links.checked = !!d.links; f.animations.checked = !!d.animations;
    this.borderHint.textContent = BORDER_HINT[d.borders] ?? '';
  }

  /** Live readout for the generated board (class badge, counts). */
  setBoard(board, config) {
    const clean = board.clean;
    this.badge.textContent = clean ? 'clean — no draws' : `pinched — degree ${board.maxDegree}`;
    this.badge.className = 'badge ' + (clean ? 'clean' : 'pinched');
     this.boardInfo.textContent = config.goal === 'go'
       ? `${board.cells.length} points · Go: liberties run along shared edges, so the vertex class does not matter.`
       : `${board.cells.length} cells · ${board.chords.length} chords · ` +
         (clean
           ? 'every interior vertex touches 3 tiles, so a full board always has exactly one winner.'
           : `diagonal contacts resolved by the "${config.crossingMode}" crossing rule.`);
  }
}