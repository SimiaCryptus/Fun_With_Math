import { OUTLINES } from '../config.js';
import { connectionDistance } from '../engine/Score.js';
import { formatClock } from '../engine/Clock.js';
import { el } from './dom.js';

/**
 * The in-game panel: whose turn, connection meters, clocks, undo / swap /
 * new / share, and a one-line board summary.  Everything configurable lives
 * in Settings.
 */
export class HUD {
   constructor({ hudEl, toastEl, theme, onUndo, onSwap, onPass, onNew, onCopy, onSettings }) {
    this.toastEl = toastEl;
    this.theme = theme;
    this.clock = null;
    this.thinking = -1;
    this.clockEls = [];

    this.status = el('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
    this.seats = el('div', { class: 'seats' });
    this.swapBtn = el('button', { text: 'Swap sides (pie rule)', onclick: onSwap });
    this.swapBtn.hidden = true;
     this.passBtn = el('button', { text: 'Pass', title: 'Pass (P) — the game ends when everyone passes in turn', onclick: onPass });
     this.passBtn.hidden = true;
    this.badge = el('span', { class: 'badge' });
    this.summaryText = el('span', { class: 'summary-text' });
    hudEl.append(
      el('h1', { text: 'Bridges' }),
      this.status,
      this.seats,
      el('div', { class: 'buttons' },
        el('button', { text: 'Undo', title: 'Undo (U)', onclick: onUndo }),
        this.swapBtn,
       this.passBtn,
        el('button', { text: 'New game', title: 'New game (N)', onclick: onNew }),
        el('button', { text: 'Copy link', onclick: onCopy }),
        el('button', { class: 'primary', text: '⚙ Settings', title: 'Settings (S)', onclick: onSettings }),
      ),
      el('p', { class: 'controls-hint',
        text: 'Drag to orbit · right‑drag or shift‑drag to pan · wheel or pinch to zoom · arrows pan · R resets the view · T top‑down' }),
      el('div', { class: 'summary' }, this.summaryText, this.badge),
    );
  }

  setTheme(theme) { this.theme = theme; }
  setClock(clock) { this.clock = clock; }
  setThinking(seat) { this.thinking = seat; }

  update(game, config, board, tiling) {
    const pal = this.theme.players;
    const bots = config.bots ?? [];
     const go = game.rules === 'go';
     const score = go ? game.go.score() : null;
    this.clockEls = [];
    this.seats.replaceChildren(...Array.from({ length: game.players }, (_, seat) => {
      const colour = game.colourOf(seat);
      const active = game.phase === 'playing' && game.turn === colour;
      const bot = bots[seat] ?? 'human';
      const clockEl = this.clock ? el('span', { class: 'clock' }) : null;
      if (clockEl) this.clockEls[seat] = clockEl;
       let meter;
       if (go) {
         meter = `${score.area[colour]} pts (${score.stones[colour]} + ${score.territory[colour]})`;
       } else {
         const d = connectionDistance(board, game.owner, colour);
         meter = Number.isFinite(d) ? `${d} to connect` : 'cut off';
       }
      return el('div', { class: 'seat' + (active ? ' active' : '') },
        el('span', { class: 'swatch', style: `background:${pal[colour]}` }),
        el('span', {},
          el('span', { text: `Player ${seat + 1}` }),
          bot !== 'human' ? el('span', { class: 'bot', text: `${bot} bot` }) : null),
        clockEl,
         el('span', { class: 'meter', text: meter }),
      );
    }));
    const seatName = colour => `Player ${game.seatOf(colour) + 1}`;
    if (game.phase === 'won') {
       if (go) {
         const margin = score.area[game.winner] -
           Math.max(...Array.from(score.area).filter((_, p) => p !== game.winner));
         this.status.textContent = `${seatName(game.winner)} wins by ${margin} point${margin === 1 ? '' : 's'}!`;
       } else {
         this.status.textContent = `${seatName(game.winner)} wins in ${game.claims} moves!`;
       }
    } else if (game.phase === 'timeout') {
      this.status.textContent = `${seatName(game.winner)} wins on time!`;
    } else if (game.phase === 'draw') {
       this.status.textContent = go ? 'Everyone passed — scores tied.' : 'Board full — draw.';
    } else if (this.thinking >= 0) {
      this.status.textContent = `Player ${this.thinking + 1} (${bots[this.thinking]} bot) is thinking…`;
    } else {
       const passes = go ? game.go.passes : 0;
       this.status.textContent = `${seatName(game.turn)} to move (move ${game.plies + 1})` +
         (passes ? ` · ${passes} pass${passes > 1 ? 'es' : ''} in a row` : '');
    }
     const humanTurn = (bots[game.seatOf(game.turn)] ?? 'human') === 'human';
     this.swapBtn.hidden = !game.canSwap() || !humanTurn;
     this.passBtn.hidden = !game.canPass() || !humanTurn;

    const clean = board.clean;
    this.badge.textContent = clean ? 'clean' : `pinched · deg ${board.maxDegree}`;
    this.badge.className = 'badge ' + (clean ? 'clean' : 'pinched');
    this.summaryText.textContent =
      `${tiling?.name ?? config.tiling} · ${OUTLINES[config.outline]?.label ?? config.outline} · size ${config.size}` +
       (config.goal !== 'opposite' ? ` · ${config.goal}` : '') +
      (config.variants.includes('pie') ? ' · pie' : '') +
      (config.time > 0 ? ` · ${config.time / 60 | 0}+${config.increment}` : '');
    this.updateClocks();
  }

  /** Cheap per-tick refresh of the clock readouts only. */
  updateClocks() {
    if (!this.clock) return;
    this.clockEls.forEach((c, seat) => {
      if (!c) return;
      const r = this.clock.remainingOf(seat);
      c.textContent = formatClock(r);
      c.classList.toggle('low', r < 10);
    });
  }

  toast(msg) {
    const t = el('div', { class: 'toast', text: msg });
    this.toastEl.append(t);
    setTimeout(() => t.remove(), 3200);
  }
}