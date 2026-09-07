import { Analyser } from './Analyser.js';
import { BeatDetector } from './BeatDetector.js';

const EQ_FREQS = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

/**
 * Owns the AudioContext graph:
 * source → preamp → eq[0..9] → analyser(smoothed) → monitor → destination
 *                              ↘ analyser(raw, smoothing 0) for onset detection
 */
export class AudioEngine {
  constructor(signals, events, cap) {
    this.S = signals; this.E = events; this.cap = cap;
    this.ctx = null; this.source = null; this.analyser = null; this.beat = null;
  }

  get ready() { return !!this.ctx; }

  /** Must be called from a user gesture the first time. */
  async wake() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this._build();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  _build() {
    const ctx = this.ctx;
    this.preamp = ctx.createGain();
    this.eq = EQ_FREQS.map((f, i) => {
      const b = ctx.createBiquadFilter();
      b.type = i === 0 ? 'lowshelf' : i === EQ_FREQS.length - 1 ? 'highshelf' : 'peaking';
      b.frequency.value = f; b.Q.value = 1.2; b.gain.value = 0;
      return b;
    });
    this.analyserNode = ctx.createAnalyser();
    this.analyserNode.fftSize = this.cap.fftSize;
    this.analyserNode.smoothingTimeConstant = 0.65;
    this.rawNode = ctx.createAnalyser();
    this.rawNode.fftSize = this.cap.fftSize;
    this.rawNode.smoothingTimeConstant = 0;
    this.monitor = ctx.createGain();

    let n = this.preamp;
    for (const b of this.eq) { n.connect(b); n = b; }
    n.connect(this.analyserNode);
    n.connect(this.rawNode);
    this.analyserNode.connect(this.monitor);
    this.monitor.connect(ctx.destination);

    this.analyser = new Analyser(ctx, this.analyserNode, this.rawNode, this.S);
    this.beat = new BeatDetector(this.S, this.analyserNode.frequencyBinCount);
  }

  setSource(src) {
    if (this.source && this.source !== src) { try { this.source.disconnect(); } catch { /* already gone */ } }
    this.source = src;
    src.connect(this.preamp);
    this.monitor.gain.value = src.monitor ? 1 : 0;   // never monitor the mic → feedback
    this.E.emit('audio:source', src);
  }

  setEq(i, db) { if (this.eq?.[i]) this.eq[i].gain.value = db; }
  setPreamp(db) { if (this.preamp) this.preamp.gain.value = Math.pow(10, db / 20); }
  setVolume(v) { if (this.monitor && this.source?.monitor) this.monitor.gain.value = v; }

  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.analyser.update(dt);
    this.beat.update(this.analyser.rawFreq, dt);
  }

  suspend() { return this.ctx?.state === 'running' ? this.ctx.suspend() : Promise.resolve(); }
  resume() { return this.ctx?.state === 'suspended' ? this.ctx.resume() : Promise.resolve(); }
}