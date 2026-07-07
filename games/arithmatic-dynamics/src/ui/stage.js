// Renders the live expression as a flat row of tiles, keyed by node id,
// and highlights the current selection. Uses FLIP to animate position
// changes between renders when motion is allowed.

import { el, clear, prefersReducedMotion } from '../util/dom.js';
import { isNum, isOp, isGroup } from '../core/expression.js';
import { numberTile, operatorTile, parenTile } from './tile.js';

export class Stage {
  constructor(root, { onSelect } = {}) {
    this.root = root;
    this.onSelect = onSelect;
    this.selection = null;
    this._lastRects = new Map();
  }

  setSelection(id) {
    this.selection = id;
  }

  render(expr) {
    this._capturePositions();
    clear(this.root);
    const row = el('div', { class: 'expr-row' });
    for (const tile of this._tilesFor(expr)) row.appendChild(tile);
    this.root.appendChild(row);
    this._playFlip();
  }

  // Flatten the AST into an ordered list of tile elements.
  _tilesFor(node) {
    const opts = { onSelect: this.onSelect };
    const sel = this.selection;
    if (isNum(node)) {
      return [numberTile(node, { ...opts, selected: node.id === sel })];
    }
    if (isGroup(node)) {
      return [
        parenTile(node.id, 'open', { ...opts, selected: node.id === sel }),
        ...this._tilesFor(node.child),
        parenTile(node.id, 'close', { ...opts, selected: node.id === sel }),
      ];
    }
    if (isOp(node)) {
      return [
        ...this._tilesFor(node.left),
        operatorTile(node, { ...opts, selected: node.id === sel }),
        ...this._tilesFor(node.right),
      ];
    }
    return [];
  }

  _capturePositions() {
    this._lastRects.clear();
    const tiles = this.root.querySelectorAll('.tile');
    for (const t of tiles) {
      this._lastRects.set(t.dataset.key, t.getBoundingClientRect());
    }
  }

  _playFlip() {
    if (prefersReducedMotion()) return;
    const tiles = this.root.querySelectorAll('.tile');
    for (const t of tiles) {
      const prev = this._lastRects.get(t.dataset.key);
      if (!prev) continue;
      const next = t.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (dx === 0 && dy === 0) continue;
      t.style.transform = `translate(${dx}px, ${dy}px)`;
      t.style.transition = 'none';
      requestAnimationFrame(() => {
        t.style.transform = '';
        t.style.transition = 'transform 220ms ease';
      });
    }
  }
}
