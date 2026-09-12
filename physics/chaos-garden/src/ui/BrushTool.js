import { PRESETS, applyPreset } from '../core/Presets.js';
/** Brush / erase / line / polygon / stamp tools with undo stack and ink accounting (§4.1, §6.8). */
export class BrushTool {
  constructor({ canvas, panel, barrier, params, bus, notify, view }) {
    Object.assign(this, { canvas, panel, barrier, params, bus, notify, view });
    this.tool = 'brush'; this.size = 3; this.stamp = 'disk'; this.enabled = true; this.drawing = false;
    this.last = null; this.anchor = null; this.poly = []; this.undo = []; this.redo = []; this.hover = null;
    this.caret = { i: Math.floor(barrier.Nx * 0.3), j: Math.floor(barrier.Ny / 2) };
    this.preview = new Uint8Array(barrier.Nx * barrier.Ny); view.preview = this.preview;
    this._exhaustedAt = 0;
    this._buildPanel(); this._bind();
  }
  get budgetCells() { return Math.floor(this.params.get('inkBudget') * this.barrier.mask.length); }
  _buildPanel() {
    this.panel.innerHTML = `<h3>Tools</h3>
      <div class="row tools">${['brush', 'erase', 'line', 'poly', 'stamp'].map((t) => `<button data-tool="${t}" title="${t[0].toUpperCase()}">${t}</button>`).join('')}</div>
      <label>Size <input type="range" min="1" max="12" value="3" data-k="size"><span data-v="size">3</span></label>
      <label>Stamp <select data-k="stamp"><option>disk</option><option>bar</option><option>chevron</option><option>ladder</option></select></label>
      <div class="ink"><div class="bar"><div class="fill"></div></div><span data-v="ink"></span></div>
      <div class="row"><button data-act="undo" title="Ctrl+Z">Undo</button><button data-act="redo" title="Ctrl+Shift+Z">Redo</button><button data-act="clear">Clear</button></div>
      <label>Preset <select data-k="preset"><option value="">—</option>${PRESETS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('')}</select></label>
      <h3>Layer</h3>
      <label>Field <select data-k="layer"><option value="vorticity">ω_z (depth-avg)</option><option value="dye">dye (16 inlet bands)</option><option value="speed">|u|</option></select></label>
      <label><input type="checkbox" data-k="lock"> lock color range</label>
      <div class="hint">Inlet is on the left, outlet on the right; the dimmed strips are protected. Keyboard painting: focus the canvas, arrows move the caret, Enter stamps, Backspace erases.</div>`;
    this.panel.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.tool) this.setTool(b.dataset.tool);
      else if (b.dataset.act === 'undo') this.undoAction(); else if (b.dataset.act === 'redo') this.redoAction(); else if (b.dataset.act === 'clear') this.clear();
    });
    this.panel.addEventListener('input', (e) => {
      const k = e.target.dataset.k; if (!k) return;
      if (k === 'size') { this.size = +e.target.value; this.panel.querySelector('[data-v=size]').textContent = this.size; this._updatePreview(); }
      else if (k === 'stamp') this.stamp = e.target.value;
      else if (k === 'preset' && e.target.value) { this.pushUndo(); applyPreset(this.barrier, e.target.value); this.commit(); e.target.value = ''; }
      else if (k === 'layer') { this.view.layer = e.target.value; this.bus.emit('view:layer', e.target.value); }
      else if (k === 'lock') { this.view.lockRange = e.target.checked; this.bus.emit('view:lock', e.target.checked); }
    });
    this.setTool('brush'); this.updateInk();
  }
  setTool(t) { this.tool = t; this.poly = []; this.anchor = null; for (const b of this.panel.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === t); this._updatePreview(); }
  setEnabled(v) { this.enabled = v; this.canvas.style.cursor = v ? 'crosshair' : 'default'; if (!v) { this.preview.fill(0); this.view.caret = null; } }
  cell(e) { const r = this.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * this.barrier.Nx, y: (1 - (e.clientY - r.top) / r.height) * this.barrier.Ny }; }
  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    c.addEventListener('pointerup', (e) => this._up(e));
    c.addEventListener('pointerleave', () => { this.hover = null; if (!this.drawing) this._updatePreview(); });
    c.addEventListener('dblclick', () => { if (this.tool === 'poly') this._closePoly(); });
    c.addEventListener('keydown', (e) => this._key(e));
    c.addEventListener('focus', () => { this.view.caret = this.caret; }); c.addEventListener('blur', () => { this.view.caret = null; });
  }
  _down(e) {
    if (!this.enabled || e.button !== 0) return; e.preventDefault(); this.canvas.setPointerCapture(e.pointerId); this.canvas.focus();
    const p = this.cell(e); this.hover = p;
    if (this.tool === 'brush' || this.tool === 'erase') { this.pushUndo(); this.drawing = true; this.last = p; this._paint(forDisk(p.x, p.y, this.size), this.tool === 'brush' ? 1 : 0); this.barrier.bump(); }
    else if (this.tool === 'line') { this.anchor = p; this.drawing = true; }
    else if (this.tool === 'poly') {
      if (this.poly.length >= 3 && Math.hypot(p.x - this.poly[0].x, p.y - this.poly[0].y) < 1.5) this._closePoly(); else this.poly.push(p);
    }
    else if (this.tool === 'stamp') { this.pushUndo(); this._paint(forStamp(this.stamp, p.x, p.y, this.size), 1); this.commit(); }
    this._updatePreview();
  }
  _move(e) {
    if (!this.enabled) return; const p = this.cell(e); this.hover = p;
    if (this.drawing && (this.tool === 'brush' || this.tool === 'erase')) { this._paint(forSegment(this.last, p, this.size), this.tool === 'brush' ? 1 : 0); this.last = p; this.barrier.bump(); }
    this._updatePreview();
  }
  _up(e) {
    if (!this.drawing) return; this.drawing = false; const p = this.cell(e);
    if (this.tool === 'line' && this.anchor) { this.pushUndo(); this._paint(forSegment(this.anchor, p, Math.max(1, this.size / 2)), 1); this.anchor = null; this.commit(); }
    else if (this.tool === 'brush' || this.tool === 'erase') this.commit();
    this._updatePreview();
  }
  _closePoly() { if (this.poly.length < 3) return; this.pushUndo(); this._paint(forPoly(this.poly, this.barrier.Nx, this.barrier.Ny), 1); this.poly = []; this.commit(); this._updatePreview(); }
  _key(e) {
    if (!this.enabled) return; const c = this.caret, B = this.barrier;
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (mv) { c.i = Math.max(0, Math.min(B.Nx - 1, c.i + mv[0] * (e.shiftKey ? 4 : 1))); c.j = Math.max(0, Math.min(B.Ny - 1, c.j + mv[1] * (e.shiftKey ? 4 : 1))); e.preventDefault(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.tool === 'poly') { this._closePoly(); return; } // _closePoly pushes its own undo entry
      this.pushUndo(); this._paint(forStamp(this.tool === 'stamp' ? this.stamp : 'disk', c.i + 0.5, c.j + 0.5, this.size), 1); this.commit();
    }
    else if (e.key === 'Backspace') { this.pushUndo(); this._paint(forDisk(c.i + 0.5, c.j + 0.5, this.size), 0); this.commit(); e.preventDefault(); }
    this.view.caret = c; this._updatePreview();
  }
  _paint(iter, value) {
    const B = this.barrier, mask = B.mask, Nx = B.Nx, Ny = B.Ny; let ink = this.budgetCells - B.count(), blocked = false;
    iter((i, j) => {
      if (i < 0 || j < 0 || i >= Nx || j >= Ny || !B.paintable(i)) return; const n = i + j * Nx;
      if (value) { if (mask[n]) return; if (ink <= 0) { blocked = true; return; } mask[n] = 1; ink--; } else mask[n] = 0;
    });
    if (blocked && performance.now() - this._exhaustedAt > 2000) { this._exhaustedAt = performance.now(); this.notify.show(`Ink budget reached (${(this.params.get('inkBudget') * 100).toFixed(0)}% solid). Erase or raise the budget.`, { kind: 'warn' }); }
  }
  _updatePreview() {
    const P = this.preview, Nx = this.barrier.Nx, Ny = this.barrier.Ny; P.fill(0);
    const put = (i, j) => { if (i >= 0 && j >= 0 && i < Nx && j < Ny) P[i + j * Nx] = 1; };
    const h = this.hover; if (!h || !this.enabled) return;
    if (this.tool === 'brush' || this.tool === 'erase') forDisk(h.x, h.y, this.size)(put);
    else if (this.tool === 'line' && this.anchor) forSegment(this.anchor, h, Math.max(1, this.size / 2))(put);
    else if (this.tool === 'poly') { const pts = [...this.poly, h]; for (let n = 0; n + 1 < pts.length; n++) forSegment(pts[n], pts[n + 1], 0.6)(put); }
    else if (this.tool === 'stamp') forStamp(this.stamp, h.x, h.y, this.size)(put);
  }
  pushUndo() { this.undo.push(Uint8Array.from(this.barrier.mask)); if (this.undo.length > 60) this.undo.shift(); this.redo.length = 0; }
  undoAction() { if (!this.undo.length) return; this.redo.push(Uint8Array.from(this.barrier.mask)); this.barrier.setMask(this.undo.pop()); this.commit(); }
  redoAction() { if (!this.redo.length) return; this.undo.push(Uint8Array.from(this.barrier.mask)); this.barrier.setMask(this.redo.pop()); this.commit(); }
  clear() { this.pushUndo(); this.barrier.clear(); this.commit(); }
  commit() { this.barrier.bump(); this.updateInk(); this.bus.emit('design:change', { source: 'brush' }); }
  updateInk() {
    const frac = this.barrier.fraction(), cap = this.params.get('inkBudget'), el = this.panel.querySelector('.ink');
    el.querySelector('.fill').style.width = `${Math.min(100, frac / cap * 100)}%`; el.classList.toggle('over', frac > cap + 1e-9);
    el.querySelector('[data-v=ink]').textContent = `ink ${(frac * 100).toFixed(1)} / ${(cap * 100).toFixed(0)}%`;
  }
}
/* ---- rasterizers: return iter(cb) ---- */
export function forDisk(cx, cy, r) { return (cb) => { const r2 = r * r; for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++) for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r2) cb(i, j); }; }
export function forSegment(a, b, r) { return (cb) => { const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / Math.max(0.5, r * 0.5))); for (let s = 0; s <= n; s++) { const t = s / n; forDisk(a.x + t * (b.x - a.x), a.y + t * (b.y - a.y), r)(cb); } }; }
export function forPoly(pts, Nx, Ny) {
  return (cb) => { for (let j = 0; j < Ny; j++) { const y = j + 0.5, xs = [];
    for (let n = 0; n < pts.length; n++) { const a = pts[n], b = pts[(n + 1) % pts.length]; if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x)); }
    xs.sort((p, q) => p - q); for (let m = 0; m + 1 < xs.length; m += 2) for (let i = Math.ceil(xs[m] - 0.5); i + 0.5 <= xs[m + 1]; i++) cb(i, j); } };
}
export function forStamp(kind, cx, cy, s) {
  return (cb) => {
    if (kind === 'disk') forDisk(cx, cy, s)(cb);
    else if (kind === 'bar') forSegment({ x: cx, y: cy - 3 * s }, { x: cx, y: cy + 3 * s }, Math.max(0.7, s / 2))(cb);
    else if (kind === 'chevron') { forSegment({ x: cx - 2 * s, y: cy + 2.5 * s }, { x: cx + s, y: cy }, Math.max(0.7, s / 2))(cb); forSegment({ x: cx - 2 * s, y: cy - 2.5 * s }, { x: cx + s, y: cy }, Math.max(0.7, s / 2))(cb); }
    else if (kind === 'ladder') { forDisk(cx - 2.5 * s, cy + 2 * s, s)(cb); forDisk(cx, cy - 2 * s, 0.7 * s)(cb); forDisk(cx + 2.5 * s, cy + 2 * s, 0.5 * s)(cb); }
  };
}