/**
 * Named float registry. Everything (audio bands, gyro, touch) becomes a signal here.
 * Presets bind to names, never to sources.
 */
export class SignalBus {
  constructor(historyLen = 256) {
    this.historyLen = historyLen;
    this._s = new Map();
  }

  define(name, { smooth = 0, min = -1, max = 1, impulse = false } = {}) {
    if (this._s.has(name)) return this._s.get(name);
    const sig = { name, value: 0, target: 0, smooth, min, max, impulse, hist: new Float32Array(this.historyLen), head: 0 };
    this._s.set(name, sig);
    return sig;
  }

  set(name, v, opts) {
    const s = this._s.get(name) ?? this.define(name, opts);
    if (!Number.isFinite(v)) v = 0;
    v = v < s.min ? s.min : v > s.max ? s.max : v;
    s.target = v;
    if (s.smooth <= 0) s.value = v;
  }

  /** One-frame 0/1 impulse (beat, shake). Reset in endFrame(). */
  impulse(name) {
    const s = this._s.get(name) ?? this.define(name, { min: 0, max: 1, impulse: true });
    s.value = s.target = 1;
  }

  get(name) { return this._s.get(name)?.value ?? 0; }
  has(name) { return this._s.has(name); }

  update(dt) {
    for (const s of this._s.values()) {
      if (s.smooth > 0) s.value += (s.target - s.value) * (1 - Math.exp(-dt / s.smooth));
    }
  }

  endFrame() {
    for (const s of this._s.values()) {
      s.hist[s.head] = s.value;
      s.head = (s.head + 1) % this.historyLen;
      if (s.impulse) s.value = s.target = 0;
    }
  }

  history(name) { return this._s.get(name); }
  names() { return [...this._s.keys()]; }
  snapshot() { const o = {}; for (const [k, s] of this._s) o[k] = s.value; return o; }
}