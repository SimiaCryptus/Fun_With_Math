const KEYS = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'dash', KeyT: 'taunt', ShiftLeft: 'crouch', ShiftRight: 'crouch',
  KeyE: 'drop', KeyQ: 'drop',
  Escape: 'pause', KeyP: 'pause', Backquote: 'debug',
};
const EDGE = ['up', 'down', 'left', 'right', 'dash', 'taunt', 'drop'];

/** Keyboard / gamepad / touch → PlayerIntent, sampled once per sim step (SPEC §17.3). Hops are edge-triggered. */
export class Input {
  constructor(canvas, { onPause, onDebug } = {}) {
    this.onPause = onPause; this.onDebug = onDebug;
    this.held = new Set(); this.pressed = new Set();
    this.touchCrouch = false; this.padCrouch = false; this.padPrev = {};
    this.intent = { up: false, down: false, left: false, right: false, dash: false, taunt: false, crouch: false, drop: false };

    window.addEventListener('keydown', (e) => {
      const a = KEYS[e.code];
      if (!a) return;
      e.preventDefault();
      if (e.repeat) return;
      if (a === 'pause') { this.onPause?.(); return; }
      if (a === 'debug') { this.onDebug?.(); return; }
      this.held.add(a); this.pressed.add(a);
    });
    window.addEventListener('keyup', (e) => { const a = KEYS[e.code]; if (a) this.held.delete(a); });
    window.addEventListener('blur', () => this.held.clear());

    let t0 = null, lastTap = 0, tDown = 0;
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length >= 2) { this.touchCrouch = true; t0 = null; return; }
      const t = e.changedTouches[0];
      t0 = { x: t.clientX, y: t.clientY }; tDown = performance.now();
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (e.touches.length < 2) this.touchCrouch = false;
      if (!t0) return;
      const t = e.changedTouches[0], dx = t.clientX - t0.x, dy = t.clientY - t0.y, now = performance.now();
      t0 = null;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        if (now - tDown > 400) { this.pressed.add('drop'); lastTap = 0; }      // long press = drop smoke bomb / acorn
        else if (now - lastTap < 300) { this.pressed.add('dash'); lastTap = 0; }   // double-tap = dash
        else { this.pressed.add('taunt'); lastTap = now; }                    // tap = taunt
        return;
      }
      this.pressed.add(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down'));
    }, { passive: false });
    canvas.addEventListener('touchcancel', () => { this.touchCrouch = false; t0 = null; });
  }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : null;
    const gp = pads && Array.from(pads).find(Boolean);
    if (!gp) { this.padCrouch = false; return; }
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
    const now = {
      up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
      dash: b(0), taunt: b(1), drop: b(2), pause: b(9),
    };
    for (const k in now) {
      if (now[k] && !this.padPrev[k]) { if (k === 'pause') this.onPause?.(); else this.pressed.add(k); }
    }
    this.padPrev = now;
    this.padCrouch = b(6);
  }

  /** Consume edge-triggered actions; hold actions are read live. */
  sample() {
    this.pollPad();
    const i = this.intent;
    for (const k of EDGE) i[k] = this.pressed.has(k);
    this.pressed.clear();
    i.crouch = this.held.has('crouch') || this.touchCrouch || this.padCrouch;
    return i;
  }

  reset() { this.pressed.clear(); this.held.clear(); this.touchCrouch = false; }
}