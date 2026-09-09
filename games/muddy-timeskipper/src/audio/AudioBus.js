/** Coerce anything to a finite number in [lo,hi]; never returns NaN/Infinity. */
const num = (v, fallback = 0, lo = -1e6, hi = 1e6) => {
   const n = typeof v === 'number' ? v : Number(v);
   if (!Number.isFinite(n)) return fallback;
   return n < lo ? lo : n > hi ? hi : n;
};

/** Fully procedural WebAudio SFX — ships with zero audio assets. */
export class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engine = null;
     this._warned = false;
  }

  resume() {
    if (this.ctx) return this.ctx.resume();
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain();
    this.master.gain.value = 0.75;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 8;
    this.master.connect(comp).connect(ctx.destination);
    this._buildEngine();
    return ctx.resume();
  }

  _buildEngine() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = 70;
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = 35;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    osc.connect(lp); sub.connect(lp); lp.connect(gain).connect(this.master);
    osc.start(); sub.start();
    this.engine = { osc, sub, lp, gain };
  }

  /** Call each frame with player body state. */
  updateEngine(body) {
     if (!this.engine || !body) return;
     const e = this.engine, t = this.ctx.currentTime;

     const speed    = num(body.forwardSpeed, 0, -500, 500);
     const throttle = num(body.input?.throttle, 0, 0, 1);
     const mudLoad  = num(body.mudLoad, 0, 0, 1);

     if (!this._warned &&
         (!Number.isFinite(body.forwardSpeed) ||
          !Number.isFinite(body.input?.throttle) ||
          !Number.isFinite(body.mudLoad))) {
       this._warned = true;
       console.warn('[AudioBus] non-finite body state, clamping:', {
         forwardSpeed: body.forwardSpeed,
         throttle: body.input?.throttle,
         mudLoad: body.mudLoad
       });
     }

     const rpm = Math.abs(speed) * 9 + throttle * 120;
     // AudioParam values must be finite AND (for frequency) inside the Nyquist range.
     const nyq = this.ctx.sampleRate * 0.5;
     e.osc.frequency.setTargetAtTime(num(60 + rpm * 0.9, 60, 10, nyq), t, 0.05);
     e.sub.frequency.setTargetAtTime(num(30 + rpm * 0.45, 30, 10, nyq), t, 0.05);
     e.lp.frequency.setTargetAtTime(num(500 + 1800 * (1 - mudLoad), 500, 20, nyq), t, 0.1);
     e.gain.gain.setTargetAtTime(num(0.05 + 0.14 * throttle, 0.05, 0, 1), t, 0.08);
  }

  _noise(dur) {
    const ctx = this.ctx, n = ctx.sampleRate * dur;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    return src;
  }

  play(name, gainMul = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = gainMul; out.connect(this.master);

    if (name === 'boink') {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(180, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
    } else if (name === 'blorp') {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(55, t + 0.26);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2200, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 0.3);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.45);
      this.play('splorch', 0.6 * gainMul);
    } else if (name === 'skree') {
      for (const det of [-8, 7]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(1200 + det * 10, t);
        o.frequency.linearRampToValueAtTime(1600 + det * 10, t + 0.9);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
        const lg = ctx.createGain(); lg.gain.value = 90;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.95);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0, t);
        g.gain.linearRampToValueAtTime(0.35, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
        o.connect(g).connect(out); o.start(t); o.stop(t + 1.0);
      }
      this.play('splorch', gainMul);
    } else if (name === 'splorch') {
      const src = this._noise(0.25);
      const bp = ctx.createBiquadFilter(); bp.type = 'lowpass';
      bp.frequency.setValueAtTime(1200, t);
      bp.frequency.exponentialRampToValueAtTime(300, t + 0.2);
      bp.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0, t);
      g.gain.linearRampToValueAtTime(0.8, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(bp).connect(g).connect(out); src.start(t);
    }
  }
}