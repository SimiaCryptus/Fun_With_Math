/**
 * keyboard.js — keyboard-only play (§4.5).
 *
 * WASD / arrows move a 3D cursor inside the current layer, Q/E change layer,
 * Space selects, Backspace backtracks, Enter submits. Active only when the
 * word field does not have focus, so typing still works.
 */

const MOVE = {
  ArrowLeft: [-1, 0, 0], a: [-1, 0, 0], A: [-1, 0, 0],
  ArrowRight: [1, 0, 0], d: [1, 0, 0], D: [1, 0, 0],
  ArrowUp: [0, -1, 0], w: [0, -1, 0], W: [0, -1, 0],
  ArrowDown: [0, 1, 0], s: [0, 1, 0], S: [0, 1, 0],
  q: [0, 0, -1], Q: [0, 0, -1],
  e: [0, 0, 1], E: [0, 0, 1],
};

export class KeyboardPlay {
  constructor(view, selection, { announce = () => {}, submit = () => {} } = {}) {
    this.view = view;
    this.selection = selection;
    this.grid = selection.grid;
    this.announce = announce;
    this.submit = submit;
    this.active = false;
    this.cursor = { x: 0, y: 0, z: 0 };

    this._onKey = (e) => this._handle(e);
    window.addEventListener('keydown', this._onKey);
  }

  get index() {
    return this.grid.index(this.cursor.x, this.cursor.y, this.cursor.z);
  }

  _typing() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  _handle(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = this._typing();

    if (e.key === 'Backspace' && !typing) {
      e.preventDefault();
      this.selection.pop();
      this._say('removed');
      return;
    }
    if (e.key === ' ' && !typing) {
      e.preventDefault();
      this._activate();
      this.selection.tap(this.index);
      this._say('selected');
      return;
    }
    const delta = MOVE[e.key];
    if (!delta) return;
    // Letters are for typing when the field is focused.
    if (typing && /^[a-zA-Z]$/.test(e.key)) return;
    e.preventDefault();
    this._activate();
    this._move(delta);
  }

  _activate() {
    if (this.active) return;
    this.active = true;
    document.activeElement?.blur?.();
    this.view.setCursor(this.index);
  }

  _move([dx, dy, dz]) {
    const n = this.grid.size;
    const c = this.cursor;
    c.x = Math.max(0, Math.min(n - 1, c.x + dx));
    c.y = Math.max(0, Math.min(n - 1, c.y + dy));
    c.z = Math.max(0, Math.min(n - 1, c.z + dz));
    this.view.setCursor(this.index);
    this._say();
  }

  _say(suffix = '') {
    const c = this.cursor;
    const letter = this.grid.letterAt(this.index);
    this.announce(
      `Layer ${c.z + 1}, row ${c.y + 1}, column ${c.x + 1}, letter ${letter}${suffix ? `, ${suffix}` : ''}.`,
    );
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.view.setCursor(-1);
  }
}

export default KeyboardPlay;