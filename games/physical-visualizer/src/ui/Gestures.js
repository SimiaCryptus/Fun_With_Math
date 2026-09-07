/**
 * Pointer gestures on the vis canvas: swipe l/r (preset), swipe up (fullscreen),
 * long press (info), double tap (shuffle), pinch (feedback intensity). Also writes touch signals.
 */
export class Gestures {
  constructor(el, signals, events) {
    this.el = el; this.S = signals; this.E = events;
    this.pointers = new Map();
    this._start = null; this._lastTap = 0; this._pressTimer = 0; this._pinchDist = 0;
    this._down = false; this._age = 0;
    signals.define('touchX', { min: 0, max: 1 });
    signals.define('touchY', { min: 0, max: 1 });
    signals.define('touchDown', { min: 0, max: 1 });
    signals.define('touchAge', { min: 0, max: 10 });

    el.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.isPrimary) {
        this._start = { x: e.clientX, y: e.clientY, t: performance.now() };
        this._down = true; this._age = 0;
        this._setPos(e);
        clearTimeout(this._pressTimer);
        this._pressTimer = setTimeout(() => { if (this._down && this.pointers.size === 1) events.emit('gesture:longpress'); }, 600);
      }
      if (this.pointers.size === 2) this._pinchDist = this._dist();
    });
    el.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (p) { p.x = e.clientX; p.y = e.clientY; }
      if (e.isPrimary) {
        this._setPos(e);
        if (this._start && Math.hypot(e.clientX - this._start.x, e.clientY - this._start.y) > 12) clearTimeout(this._pressTimer);
      }
      if (this.pointers.size === 2) {
        const d = this._dist();
        if (this._pinchDist > 0) events.emit('gesture:pinch', d / this._pinchDist);
        this._pinchDist = d;
      }
    });
    const up = (e) => {
      this.pointers.delete(e.pointerId);
      if (!e.isPrimary) return;
      clearTimeout(this._pressTimer);
      this._down = false;
      const s = this._start; this._start = null;
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y, dt = performance.now() - s.t;
      if (dt < 350 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) events.emit('gesture:swipe', dx < 0 ? 'left' : 'right');
      else if (dt < 350 && dy < -80 && Math.abs(dy) > Math.abs(dx)) events.emit('gesture:swipe', 'up');
      else if (dt < 250 && Math.hypot(dx, dy) < 10) {
        const now = performance.now();
        if (now - this._lastTap < 300) { events.emit('gesture:doubletap'); this._lastTap = 0; }
        else this._lastTap = now;
      }
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  _dist() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  _setPos(e) {
    const r = this.el.getBoundingClientRect();
    this.S.set('touchX', (e.clientX - r.left) / r.width);
    this.S.set('touchY', 1 - (e.clientY - r.top) / r.height);   // GL y-up
  }

  update(dt) {
    if (this._down) this._age += dt; else this._age = 0;
    this.S.set('touchDown', this._down ? 1 : 0);
    this.S.set('touchAge', this._age);
  }
}