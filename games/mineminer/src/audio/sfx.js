/**
 * Synthesised one-shots via WebAudio — no sample files needed.
 * Four distinct timbres (mark / clear / defuse / boom) so the game can be played by ear.
 */
export class Sfx {
  constructor(volume = 0.6) {
    this.volume = volume;
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  tone(freq, dur = 0.15, { type = 'sine', gain = 0.25, when = 0, slide = 1 } = {}) {
    const ctx = this.ensure();
    if (!ctx || this.volume <= 0) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur = 0.15, { freq = 800, q = 0.8, gain = 0.4, when = 0, type = 'bandpass' } = {}) {
    const ctx = this.ensure();
    if (!ctx || this.volume <= 0) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.master);
    src.start(ctx.currentTime + when);
  }

  crunch(when = 0) {
    this.noise(0.14, { freq: 350 + Math.random() * 250, q: 0.6, gain: 0.5, when });
    this.tone(90 + Math.random() * 30, 0.08, { type: 'triangle', gain: 0.2, when, slide: 0.5 });
  }

  clink(on = true) {
    this.tone(on ? 1900 : 1200, 0.07, { type: 'square', gain: 0.07 });
    this.tone(on ? 2850 : 1800, 0.05, { type: 'sine', gain: 0.1, when: 0.01 });
  }

  /** Ascending pentatonic arpeggio — longer for bigger cascades. */
  cascade(shells) {
    const scale = [0, 2, 4, 7, 9];
    const n = Math.min(Math.max(2, shells), 14);
    for (let i = 0; i < n; i++) {
      const semis = scale[i % 5] + 12 * Math.floor(i / 5);
      this.tone(330 * Math.pow(2, semis / 12), 0.18, { type: 'triangle', gain: 0.12, when: 0.04 + i * 0.055 });
    }
  }

  defuse() {
    [880, 660, 440].forEach((f, i) => this.tone(f, 0.25, { gain: 0.15, when: i * 0.09 }));
    this.noise(0.2, { freq: 4000, q: 2, gain: 0.12 });
  }

  misfire() {
    this.tone(160, 0.3, { type: 'sawtooth', gain: 0.18, slide: 0.4 });
    this.noise(0.25, { freq: 250, gain: 0.3 });
  }

  boom() {
    this.noise(0.9, { freq: 180, q: 0.4, gain: 0.9, type: 'lowpass' });
    this.tone(60, 0.9, { type: 'sine', gain: 0.5, slide: 0.3 });
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.35, { gain: 0.15, when: i * 0.12 }));
  }
}