/**
 * hud.js — every piece of chrome around the canvas (§7).
 * Reads nothing from the game directly; main.js feeds it.
 */

import { STATE } from '../core/game.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.timer = $('timer');
    this.title = $('title');
    this.score = $('score');
    this.chips = $('chips');
    this.input = $('word-input');
    this.foundList = $('found-list');
    this.foundCount = $('found-count');
    this.foundPoints = $('found-points');
    this.found = $('found');
    this.loading = $('overlay-loading');
    this.countdown = $('overlay-countdown');
    this.wordbar = $('wordbar');
    this.announcer = $('announcer');
    this.srBoard = $('sr-board');
    this.peelSlider = $('peel-slider');
    this.peelLabel = $('peel-label');
    this.mic = $('btn-mic');
    this.hintLine = $('hint-line');

    this._points = 0;
    this._count = 0;
  }

  // -------------------------------------------------------------- binding

  bind(on) {
    this.on = on;
    $('btn-submit').addEventListener('click', () => on.onSubmit?.());
    $('btn-clear').addEventListener('click', () => on.onClear?.());
    this.mic.addEventListener('click', () => on.onMic?.());
    $('btn-menu').addEventListener('click', () => on.onMenu?.());
    $('btn-front').addEventListener('click', () => on.onSnap?.('front'));
    $('btn-top').addEventListener('click', () => on.onSnap?.('top'));
    $('btn-iso').addEventListener('click', () => on.onSnap?.('iso'));

    this.peelSlider.addEventListener('input', () => {
      const v = Number(this.peelSlider.value) / 100;
      this.setPeel(v);
      on.onPeel?.(v);
    });

    this.input.addEventListener('input', () => on.onType?.(this.input.value));
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); on.onSubmit?.(); }
    });

    $('found-summary').addEventListener('click', () => {
      const collapsed = this.found.dataset.collapsed === 'true';
      this.found.dataset.collapsed = String(!collapsed);
      $('found-summary').setAttribute('aria-expanded', String(collapsed));
    });
  }

  // ---------------------------------------------------------------- board

  setBoard(board) {
    this.title.textContent = `Troggle ${board.size}³`;
    this.setPeel(0);
    this.hintLine.textContent =
      `${board.minWordLength}+ letters · tap letters to spell · peel to see inside`;
  }

  reset() {
    this._points = 0;
    this._count = 0;
    this.foundList.innerHTML = '';
    this.foundCount.textContent = '0';
    this.foundPoints.textContent = '0';
    this.setScore(0);
    this.setChips([]);
    this.setInput('');
    this.setInputStatus(null);
  }

  setSrMirror(grid) {
    const n = grid.size;
    let html = '';
    for (let z = 0; z < n; z++) {
      html += `<table><caption>Layer ${z + 1}</caption><tbody>`;
      for (let y = 0; y < n; y++) {
        html += '<tr>';
        for (let x = 0; x < n; x++) html += `<td>${grid.letterAt(grid.index(x, y, z))}</td>`;
        html += '</tr>';
      }
      html += '</tbody></table>';
    }
    this.srBoard.innerHTML = html;
  }

  // ----------------------------------------------------------------- hud

  setState(state) {
    const playing = state === STATE.PLAYING;
    this.input.disabled = !playing;
    if (state === STATE.RESULTS) this.setChips([]);
  }

  setTimer(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    const mm = Math.floor(s / 60);
    const ss = String(s % 60).padStart(2, '0');
    this.timer.textContent = `${mm}:${ss}`;
    this.timer.classList.toggle('low', s <= 15);
  }

  setCountdown(n) {
    if (n == null) {
      this.countdown.classList.add('hidden');
      return;
    }
    this.countdown.classList.remove('hidden');
    this.countdown.firstElementChild.textContent = String(Math.max(1, n));
  }

  setLoading(on, text) {
    this.loading.classList.toggle('hidden', !on);
    if (text) this.loading.querySelector('p').textContent = text;
  }

  setScore(value, bump = false) {
    this.score.textContent = `★ ${value}`;
    this.foundPoints.textContent = String(value);
    if (bump) {
      this.score.classList.remove('bump');
      void this.score.offsetWidth;
      this.score.classList.add('bump');
    }
  }

  setChips(letters) {
    this.chips.innerHTML = '';
    for (const l of letters) {
      const el = document.createElement('span');
      el.className = 'chip';
      el.textContent = l === 'QU' ? 'Qu' : l;
      this.chips.appendChild(el);
    }
  }

  addFound(entry) {
    this._count++;
    this.foundCount.textContent = String(this._count);
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = `${entry.word.toUpperCase()}<b>${entry.score.total}</b>`;
    btn.title = 'Replay this path';
    btn.addEventListener('click', () => this.on?.onReplay?.(entry));
    li.appendChild(btn);
    this.foundList.prepend(li);
  }

  // ---------------------------------------------------------------- input

  inputValue() { return this.input.value; }
  setInput(v) { this.input.value = v; }
  focusInput() { if (!this.input.disabled) this.input.focus(); }
  selectInput() { this.input.select?.(); }

  setInputStatus(cls) {
    this.input.classList.remove('is-word', 'is-path', 'is-none');
    if (cls) this.input.classList.add(cls);
  }

  shake() {
    this.wordbar.classList.remove('shake');
    void this.wordbar.offsetWidth;
    this.wordbar.classList.add('shake');
    setTimeout(() => this.wordbar.classList.remove('shake'), 420);
  }

  announce(message) {
    this.announcer.textContent = message;
  }

  // ------------------------------------------------------------ view tools



  setPeel(v) {
    const pct = Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100);
    this.peelLabel.textContent = `peel ${pct}%`;
    this.peelSlider.value = String(pct);
  }

  setMic(state) {
    this.mic.dataset.state = state;
  }

  hideMic() {
    this.mic.hidden = true;
  }
}

export default Hud;