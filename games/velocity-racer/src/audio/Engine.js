import { forwardPitch } from './Doppler.js';

/**
 * WebAudio engine: two detuned oscillators through a moving low-pass,
 * plus band-passed noise whose centre frequency tracks the relativistic
 * Doppler factor of the oncoming world (the "wind" goes blue).
 */
export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.22;
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 700;
    this.filter.Q.value = 0.8;
    this.filter.connect(this.master);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'square';
    const gA = ctx.createGain();
    gA.gain.value = 0.55;
    const gB = ctx.createGain();
    gB.gain.value = 0.16;
    this.oscA.connect(gA).connect(this.filter);
    this.oscB.connect(gB).connect(this.filter);
    this.oscA.start();
    this.oscB.start();

    // wind
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buf;
    this.noise.loop = true;
    this.noiseFilter = ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 500;
    this.noiseFilter.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noise.connect(this.noiseFilter).connect(this.noiseGain).connect(this.master);
    this.noise.start();
  }

  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const beta = car.beta;

    const rev = 0.14 + 0.86 * beta;
    const f = 44 + 330 * Math.pow(rev, 1.25) * (car.boosting ? 1.09 : 1);
    this.oscA.frequency.setTargetAtTime(f, t, 0.05);
    this.oscB.frequency.setTargetAtTime(f * 1.503, t, 0.05);
    this.filter.frequency.setTargetAtTime(520 + 3400 * beta, t, 0.08);

    const D = forwardPitch(Math.min(beta, 0.96));
    this.noiseFilter.frequency.setTargetAtTime(Math.min(11000, 420 * D), t, 0.1);
    this.noiseGain.gain.setTargetAtTime(Math.min(0.42, beta * beta * 0.45), t, 0.15);

    const vol = active && !this.muted ? this.volume : 0;
    this.master.gain.setTargetAtTime(vol, t, 0.18);
  }

  chime(freq = 1240, dur = 0.16) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g).connect(this.master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}
