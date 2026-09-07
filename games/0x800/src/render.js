// render.js — absolutely-positioned DOM nodes + CSS transforms.
//
// Every cell and tile carries unitless `--tx` / `--ty` factors; the CSS
// multiplies them by `--hex-size`, so a resize is a single variable change
// and sliding is just a transition on `transform`.

import { cells, toPixel, SQRT3 } from './hex.js';
import { hex } from './game.js';

export const TIMING = Object.freeze({ slide: 90, pop: 110, spawn: 120, spawnDelay: 100 });
export const MOVE_DURATION =
  Math.max(TIMING.slide + TIMING.pop, TIMING.spawnDelay + TIMING.spawn) + 10;

const el = (cls) => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};

function place(node, q, r) {
  const { x, y } = toPixel(q, r, 1);
  node.style.setProperty('--tx', x.toFixed(4));
  node.style.setProperty('--ty', y.toFixed(4));
}

function restart(node, cls) {
  node.classList.remove(cls);
  void node.offsetWidth; // flush so the animation restarts
  node.classList.add(cls);
}

export class Renderer {
  constructor(boardEl) {
    this.board = boardEl;
    this.cellLayer = el('cells');
    this.tileLayer = el('tiles');
    boardEl.append(this.cellLayer, this.tileLayer);
    this.tiles = new Map(); // id -> element
    this.radius = -1;
    this.timers = new Set();
    boardEl.addEventListener('animationend', (e) => {
      if (e.target === boardEl) boardEl.classList.remove('nudge');
    });
  }

  setRadius(radius) {
    if (radius === this.radius) return;
    this.radius = radius;
    this.cancel();
    this.cellLayer.replaceChildren();
    for (const c of cells(radius)) {
      const node = el('cell');
      place(node, c.q, c.r);
      node.textContent = '··';
      this.cellLayer.append(node);
    }
    this.board.style.setProperty('--bw', (SQRT3 * (2 * radius + 1)).toFixed(4));
    this.board.style.setProperty('--bh', String(3 * radius + 2));
    this.tileLayer.replaceChildren();
    this.tiles.clear();
  }

  /** Pick the largest hex size that fits the given box; sets --hex-size. */
  fit(width, height, { min = 18, max = 64 } = {}) {
    const n = Math.max(0, this.radius);
    const s = Math.min(width / (SQRT3 * (2 * n + 1)), height / (3 * n + 2));
    const size = Math.max(min, Math.min(max, Math.floor(s * 2) / 2));
    document.documentElement.style.setProperty('--hex-size', `${size}px`);
    return size;
  }

  after(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  cancel() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }

  makeTile(t, spawn = false) {
    const node = el('tile');
    node.append(el('face'));
    node.dataset.id = String(t.id);
    node.setAttribute('aria-hidden', 'true');
    if (spawn) node.classList.add('spawn');
    place(node, t.q, t.r);
    this.setValue(node, t.value);
    this.tileLayer.append(node);
    this.tiles.set(t.id, node);
    return node;
  }

  setValue(node, value) {
    const label = hex(value);
    if (node.dataset.label === label) return;
    node.dataset.label = label;
    node.dataset.v = value >= 0x8000 ? '8000' : label;
    node.dataset.len = String(label.length);
    node.firstChild.textContent = label;
  }

  /** Make the DOM match `state` exactly, with no timeline. */
  reconcile(state) {
    const live = new Set();
    for (const t of state.tiles) {
      live.add(t.id);
      let node = this.tiles.get(t.id);
      if (!node) node = this.makeTile(t);
      else {
        place(node, t.q, t.r);
        this.setValue(node, t.value);
      }
      node.classList.remove('absorbed', 'spawn');
      node.firstChild.classList.remove('pop');
    }
    for (const [id, node] of this.tiles) {
      if (!live.has(id)) {
        node.remove();
        this.tiles.delete(id);
      }
    }
  }

  /** Full draw (boot, undo, new game). Existing tiles glide to their spots. */
  render(state) {
    this.setRadius(state.radius);
    this.cancel();
    this.reconcile(state);
  }

  /**
   * Animation timeline for one move (~220ms):
   *   t=0    slide every moving tile (incl. the ones about to be absorbed)
   *   t=90   drop absorbed tiles, pop + relabel the survivors
   *   t=100  spawned tile scales in (CSS animation-delay does the waiting)
   * Resolves when the DOM is reconciled with `state`.
   */
  animate(state, events, { reduced = false } = {}) {
    this.cancel();
    this.setRadius(state.radius);
    if (reduced) {
      this.reconcile(state);
      return Promise.resolve();
    }

    const merges = events.filter((e) => e.type === 'merge');
    const absorbed = new Set(merges.map((m) => m.id));

    for (const e of events) {
      if (e.type === 'slide') {
        const node = this.tiles.get(e.id);
        if (!node) continue;
        place(node, e.to.q, e.to.r);
        if (absorbed.has(e.id)) node.classList.add('absorbed');
      } else if (e.type === 'spawn') {
        if (!this.tiles.has(e.id))
          this.makeTile({ id: e.id, value: e.value, q: e.to.q, r: e.to.r }, true);
      }
    }

    return new Promise((resolve) => {
      this.after(TIMING.slide, () => {
        for (const m of merges) {
          const a = this.tiles.get(m.id);
          if (a) {
            a.remove();
            this.tiles.delete(m.id);
          }
          const s = this.tiles.get(m.into);
          if (s) {
            this.setValue(s, m.value);
            restart(s.firstChild, 'pop');
          }
        }
      });
      this.after(MOVE_DURATION, () => {
        this.reconcile(state);
        resolve();
      });
    });
  }

  /** Short shake toward `d` for an illegal move. */
  nudge(d) {
    const a = (d.angle * Math.PI) / 180;
    this.board.style.setProperty('--nx', Math.cos(a).toFixed(3));
    this.board.style.setProperty('--ny', Math.sin(a).toFixed(3));
    restart(this.board, 'nudge');
  }
}
