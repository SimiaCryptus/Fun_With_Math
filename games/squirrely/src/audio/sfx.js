/** Tiny synthesized cue table over WebAudio (SPEC §18). No assets; created lazily on first user gesture. */
export class Sfx {
  constructor() { this.ctx = null; this.master = null; this.voices = 0; }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.4;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ctx = null; }
  }

  _out(at, dur, gain, pan) {
    const c = this.ctx, g = c.createGain(), t = c.currentTime + at;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    node.connect(this.master);
    return g;
  }

  tone(f0, dur, { type = 'square', gain = 0.12, f1 = f0, pan = 0, at = 0 } = {}) {
    if (!this.ctx || this.voices > 20) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    o.connect(this._out(at, dur, gain, pan));
    o.start(t); o.stop(t + dur + 0.02);
    this.voices++; o.onended = () => { this.voices--; };
  }

  noise(dur, { gain = 0.3, pan = 0, cutoff = 900 } = {}) {
    if (!this.ctx || this.voices > 20) return;
    const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(); s.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    s.connect(f); f.connect(this._out(0, dur, gain, pan));
    s.start();
    this.voices++; s.onended = () => { this.voices--; };
  }

  hop() { this.tone(480, 0.07, { type: 'triangle', gain: 0.07, f1: 720 }); }
  dash() { this.tone(300, 0.18, { type: 'triangle', gain: 0.09, f1: 900 }); }

  bind(events, world) {
    const pan = (v) => Math.max(-1, Math.min(1, (v.x - world.player.x) / 40));
    const near = (v) => Math.abs(v.x - world.player.x) < 60;
    events.on('horn', ({ vehicle: v }) => {
      if (!near(v)) return;
      const red = v.driverId === 'red', green = v.driverId === 'green';
      this.tone(red ? 180 : 260, red ? 0.7 : 0.25, { type: 'sawtooth', gain: 0.07, pan: pan(v) });
      if (green) this.tone(260, 0.2, { type: 'sawtooth', gain: 0.07, pan: pan(v), at: 0.3 });
    });
    events.on('bump', ({ a }) => { if (near(a)) this.noise(0.12, { gain: 0.15, pan: pan(a), cutoff: 600 }); });
    events.on('crash', ({ a, severity }) => {
      if (!near(a)) return;
      this.noise(severity === 'wreck' ? 0.7 : 0.45, { gain: severity === 'wreck' ? 0.5 : 0.35, pan: pan(a) });
      this.tone(90, 0.3, { type: 'sine', gain: 0.2, f1: 30, pan: pan(a) });
    });
    events.on('nearmiss', () => this.tone(1200, 0.18, { type: 'sine', gain: 0.1, f1: 300 }));
    events.on('taunt', () => { for (let i = 0; i < 4; i++) this.tone(1800, 0.04, { type: 'square', gain: 0.06, f1: 2600, at: i * 0.06 }); });
    events.on('player:nudge', () => this.tone(200, 0.15, { type: 'triangle', gain: 0.12, f1: 120 }));
    events.on('item:pickup', ({ kind }) => {
       if (kind === 'smoke') this.tone(700, 0.12, { type: 'triangle', gain: 0.09, f1: 420 });   // heavy "thunk"
      else this.tone(900, 0.08, { type: 'triangle', gain: 0.09, f1: 1500 });
    });
    events.on('item:drop', () => this.tone(500, 0.06, { type: 'triangle', gain: 0.06, f1: 300 }));
    events.on('smoke:lit', () => { this.noise(0.7, { gain: 0.25, cutoff: 1600 }); this.tone(1400, 0.5, { type: 'sine', gain: 0.05, f1: 200 }); });
     events.on('acorn:bank', ({ acorns }) => {
       const n = Math.max(1, acorns);
      for (let i = 0; i < n; i++) this.tone(660 + i * 130, 0.12, { type: 'triangle', gain: 0.1, at: i * 0.1 });
    });
    events.on('player:death', ({ cause }) => {
      if (cause === 'timer') { this.tone(300, 0.4, { type: 'square', gain: 0.1, f1: 80 }); return; }
      this.noise(0.25, { gain: 0.35, cutoff: 500 });
      this.tone(140, 0.4, { type: 'sawtooth', gain: 0.12, f1: 40 });
    });
    events.on('hollow', () => [523, 659, 784].forEach((f, i) => this.tone(f, 0.15, { type: 'triangle', gain: 0.1, at: i * 0.09 })));
    events.on('level:complete', () => [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.12, at: 0.4 + i * 0.12 })));
    events.on('game:over', () => [400, 300, 200].forEach((f, i) => this.tone(f, 0.3, { type: 'square', gain: 0.08, at: i * 0.25 })));
  }
}