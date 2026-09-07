const RANGE = 140;   // px of drag for full deflection
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Touch-drag stand-in for the gyro: dragging tips the world, springs back on release. */
export class VirtualTilt {
  constructor(el, signals) {
    this.el = el; this.S = signals;
    this.enabled = false; this.down = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this._sx = 0; this._sy = 0;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || !e.isPrimary) return;
      this.down = true;
      this._sx = e.clientX - this.x * RANGE; this._sy = e.clientY - this.y * RANGE;
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.enabled || !this.down || !e.isPrimary) return;
      this.x = clamp((e.clientX - this._sx) / RANGE, -1, 1);
      this.y = clamp((e.clientY - this._sy) / RANGE, -1, 1);
    });
    const up = () => { this.down = false; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }

  update(dt) {
    if (!this.enabled) return;
    if (this.down) {
      this.vx = this.vy = 0;
    } else {
      const k = 60, c = 8;
      this.vx += (-k * this.x - c * this.vx) * dt; this.x += this.vx * dt;
      this.vy += (-k * this.y - c * this.vy) * dt; this.y += this.vy * dt;
    }
    const S = this.S;
    S.set('tiltX', this.x);
    S.set('tiltY', this.y);
    S.set('gravX', this.x);
    S.set('gravY', clamp(-1 - 2 * this.y, -1, 1));   // drag up → gravity flips upward
    S.set('gravZ', 0);
    S.set('flat', 0);
    S.set('jerk', Math.min(1, Math.hypot(this.vx, this.vy) * 0.15));
  }
}