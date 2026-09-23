// Procedural Web Audio effects; the context is unlocked on first user input.
export class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this._noise = null;
    this._last = new Map();
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock);
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this._noise = buf;
        this._drone();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (err) {
      console.warn('Audio unavailable', err);
    }
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  _throttle(name, ms) {
    const now = performance.now();
    const last = this._last.get(name) || 0;
    if (now - last < ms) return false;
    this._last.set(name, now);
    return true;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1000, q = 1, type = 'lowpass', slide = 0, delay = 0 } = {}) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  _drone() {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = 0.04;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    f.connect(g);
    g.connect(this.master);
    for (const fr of [55, 55.6, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.connect(f);
      o.start();
    }
  }

  coin(mult = 1, pile = false) {
    if (!this._throttle('coin', 30)) return;
    const base = 1100 * (1 + (mult - 1) * 0.15) * (0.95 + Math.random() * 0.1);
    this.tone(base, 0.12, { type: 'triangle', vol: 0.12 });
    this.tone(base * 1.5, 0.12, { vol: 0.06, delay: 0.04 });
    if (pile) {
      this.tone(base * 2, 0.15, { type: 'triangle', vol: 0.08, delay: 0.09 });
      this.tone(base * 2.5, 0.2, { vol: 0.06, delay: 0.14 });
    }
  }
  pickup() { this.tone(500, 0.25, { type: 'triangle', vol: 0.18, slide: 1000 }); this.tone(750, 0.2, { vol: 0.08, delay: 0.08, slide: 1500 }); }
  place() { this.noise(0.06, { vol: 0.15, freq: 2500, type: 'highpass' }); this.tone(220, 0.08, { type: 'square', vol: 0.05 }); }
  tick(fast) { if (this._throttle('tick', 50)) this.tone(fast ? 1800 : 1400, 0.03, { type: 'square', vol: 0.04 }); }
  fail() { if (this._throttle('fail', 150)) this.tone(160, 0.12, { type: 'square', vol: 0.06 }); }
  boom() {
    this.noise(0.9, { vol: 0.6, freq: 900, slide: 60 });
    this.tone(95, 0.7, { vol: 0.5, slide: 30 });
  }
  crumble() {
    if (!this._throttle('crumble', 120)) return;
    this.noise(0.5, { vol: 0.25, freq: 400, type: 'bandpass', q: 0.8, delay: 0.05 });
  }
  fire() {
    this.noise(1.6, { vol: 0.2, freq: 1500, type: 'bandpass', q: 0.6, slide: 600 });
    for (let i = 0; i < 8; i++) this.noise(0.03, { vol: 0.15, freq: 3000, type: 'highpass', delay: Math.random() * 1.5 });
  }
  kill() { if (this._throttle('kill', 40)) this.tone(320, 0.25, { type: 'sawtooth', vol: 0.12, slide: 80 }); }
  hurt() { this.tone(230, 0.35, { type: 'square', vol: 0.15, slide: 100 }); }
  hiss() { if (this._throttle('hiss', 300)) this.noise(0.45, { vol: 0.15, freq: 4000, type: 'highpass' }); }
  growl() { if (this._throttle('growl', 800)) this.tone(75, 0.6, { type: 'sawtooth', vol: 0.12, slide: 55 }); }
  click() {
    this.noise(0.02, { vol: 0.08, freq: 3200, type: 'bandpass', q: 4 });
    this.noise(0.02, { vol: 0.06, freq: 2800, type: 'bandpass', q: 4, delay: 0.07 });
  }
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, { type: 'triangle', vol: 0.15, delay: i * 0.22 }));
  }
}