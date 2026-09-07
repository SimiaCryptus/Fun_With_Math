import { Fusion } from './Fusion.js';
import { ShakeDetector } from './ShakeDetector.js';
import { VirtualTilt } from './VirtualTilt.js';

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Permission flow + listener lifecycle. Falls back to VirtualTilt transparently. */
export class MotionEngine {
  constructor(signals, events, canvas, cap) {
    this.S = signals; this.E = events; this.cap = cap;
    this.fusion = new Fusion();
    this.shake = new ShakeDetector();
    this.virtual = new VirtualTilt(canvas, signals);
    this.mode = 'none';
    this._gotEvent = false;
    this._neutral = null;
    this._flatSince = 0; this._table = false;
    for (const n of ['tiltX', 'tiltY', 'gravX', 'gravY']) signals.define(n, { smooth: 0.05 });
    signals.define('yaw', { smooth: 0.2 });
    signals.define('gravZ', { smooth: 0.05 });
    for (const n of ['accelX', 'accelY', 'accelZ']) signals.define(n, { smooth: 0.02 });
    signals.define('jerk', { min: 0, max: 1, smooth: 0.04 });
    signals.define('spinRate', { min: 0, max: 1, smooth: 0.05 });
    signals.define('flat', { min: 0, max: 1, smooth: 0.2 });
    signals.define('shake', { min: 0, max: 1, impulse: true });
    this._onMotion = this._onMotion.bind(this);
    this._onOrient = this._onOrient.bind(this);
  }

  /** Must be invoked synchronously from a click/touch handler (iOS). */
  static async requestPermission() {
    const reqs = [];
    if (typeof DeviceMotionEvent?.requestPermission === 'function') reqs.push(DeviceMotionEvent.requestPermission());
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') reqs.push(DeviceOrientationEvent.requestPermission());
    if (!reqs.length) return 'granted';
    try {
      const results = await Promise.all(reqs);
      return results.every((r) => r === 'granted') ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  async start() {
    if (!this.cap.motion || !('ondevicemotion' in window)) return this._useVirtual('unsupported');
    const perm = await MotionEngine.requestPermission();
    if (perm !== 'granted') return this._useVirtual('denied');
    window.addEventListener('devicemotion', this._onMotion);
    window.addEventListener('deviceorientation', this._onOrient);
    this.mode = 'pending';
    setTimeout(() => { if (!this._gotEvent) this._useVirtual('no events'); }, 1500);
  }

  stop() {
    window.removeEventListener('devicemotion', this._onMotion);
    window.removeEventListener('deviceorientation', this._onOrient);
    this.virtual.disable();
    this.mode = 'none';
  }

  _useVirtual(reason) {
    this.mode = 'virtual';
    this.virtual.enable();
    this.E.emit('motion:mode', { mode: 'virtual', reason });
  }

  _angle() { return screen.orientation?.angle ?? window.orientation ?? 0; }

  _onMotion(e) {
    if (!this._gotEvent) {
      this._gotEvent = true;
      this.mode = 'device';
      this.virtual.disable();
      this.E.emit('motion:mode', { mode: 'device' });
    }
    const dt = e.interval > 0 && e.interval < 1000 ? e.interval / 1000 : 1 / 60;
    const f = this.fusion;
    f.update(e.accelerationIncludingGravity, e.acceleration, e.rotationRate, dt, this._angle());
    const S = this.S;
    S.set('gravX', f.down[0]); S.set('gravY', f.down[1]); S.set('gravZ', f.down[2]);
    S.set('accelX', f.linScreen[0] / 20); S.set('accelY', f.linScreen[1] / 20); S.set('accelZ', f.linScreen[2] / 20);
    S.set('jerk', Math.min(1, f.jerk / 300));
    S.set('spinRate', Math.min(1, f.spinRate / 8));
    S.set('flat', f.flat);
    if (this.shake.update(f.jerk, performance.now())) {
      S.impulse('shake');
      this.E.emit('shake');
    }
  }

  _onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    this._neutral ??= { beta: e.beta, gamma: e.gamma };          // calibrate to how you hold it
    const a = -this._angle() * DEG, c = Math.cos(a), s = Math.sin(a);
    const gx = e.gamma - this._neutral.gamma, gy = e.beta - this._neutral.beta;
    const tx = gx * c - gy * s, ty = gx * s + gy * c;
    this.S.set('tiltX', clamp(tx / 45, -1, 1));
    this.S.set('tiltY', clamp(ty / 45, -1, 1));
    const yaw = e.webkitCompassHeading ?? e.alpha;
    if (yaw != null) this.S.set('yaw', (yaw / 180) - 1);
  }

  recalibrate() { this._neutral = null; }

  update(dt) {
    this.virtual.update(dt);
    // Table mode: flat for 3s → hide chrome; any motion brings it back.
    const flat = this.S.get('flat') > 0.9 && this.mode === 'device';
    const now = performance.now();
    if (flat) {
      if (!this._flatSince) this._flatSince = now;
      if (!this._table && now - this._flatSince > 3000) { this._table = true; this.E.emit('motion:table', true); }
    } else {
      this._flatSince = 0;
      if (this._table && this.S.get('jerk') > 0.05) { this._table = false; this.E.emit('motion:table', false); }
    }
  }
}