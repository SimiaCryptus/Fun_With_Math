/**
 * FFT read → log band folding → headline signals with peak-hold auto-gain.
 * Also fills the CPU-side arrays that become u_spectrum / u_waveform / u_history.
 */
const PEAK_DECAY_DB_PER_S = 0.5;

export class Analyser {
  constructor(ctx, node, rawNode, signals, { bands = 32 } = {}) {
    this.ctx = ctx; this.node = node; this.raw = rawNode; this.S = signals;
    const bins = node.frequencyBinCount;
    this.freq = new Uint8Array(bins);
    this.time = new Uint8Array(node.fftSize);
    this.rawFreq = new Uint8Array(bins);
    this.spectrum = new Uint8Array(512);
    this.waveform = new Uint8Array(512).fill(128);
    this.history = new Uint8Array(256 * 64);
    this.bandCount = bands;
    this.bands = new Float32Array(bands);
    this.nyquist = ctx.sampleRate / 2;
    this.hzPerBin = this.nyquist / bins;
    this._buildTables(bins);
    this.peaks = { bass: 0.3, lowMid: 0.3, mid: 0.3, treb: 0.3, spec: 0.3 };
    this.energyAvg = 0;
    for (const n of ['bass', 'lowMid', 'mid', 'treb', 'energy']) signals.define(n, { min: 0, max: 1, smooth: 0.03 });
    signals.define('energyAvg', { min: 0, max: 1 });
  }

  _buildTables(bins) {
    const fLo = 20, fHi = Math.min(16000, this.nyquist);
    const binOf = (f) => Math.min(bins - 1, Math.max(0, Math.round(f / this.hzPerBin)));
    this.bandRanges = [];
    for (let i = 0; i < this.bandCount; i++) {
      const f0 = fLo * Math.pow(fHi / fLo, i / this.bandCount);
      const f1 = fLo * Math.pow(fHi / fLo, (i + 1) / this.bandCount);
      const a = binOf(f0);
      this.bandRanges.push([a, Math.max(a + 1, binOf(f1))]);
    }
    this.specBin = new Uint16Array(512);
    for (let x = 0; x < 512; x++) this.specBin[x] = binOf(fLo * Math.pow(fHi / fLo, x / 511));
    this.ranges = {
      bass: [binOf(20), Math.max(binOf(20) + 1, binOf(160))],
      lowMid: [binOf(160), binOf(600)],
      mid: [binOf(600), binOf(2500)],
      treb: [binOf(2500), binOf(12000)],
    };
  }

  _mean(a, b) {
    let s = 0;
    for (let i = a; i < b; i++) s += this.freq[i];
    return s / (((b - a) || 1) * 255);
  }

  /** Divide by a decaying peak-hold: quiet tracks still fill the screen. */
  _norm(name, v, dt) {
    const p = this.peaks;
    p[name] = Math.max(v, p[name] * Math.pow(10, -PEAK_DECAY_DB_PER_S * dt / 20), 0.05);
    return Math.min(1, v / p[name]);
  }

  update(dt) {
    this.node.getByteFrequencyData(this.freq);
    this.node.getByteTimeDomainData(this.time);
    this.raw.getByteFrequencyData(this.rawFreq);
    const S = this.S;

    for (const k in this.ranges) {
      const [a, b] = this.ranges[k];
      S.set(k, this._norm(k, this._mean(a, b), dt));
    }
    for (let i = 0; i < this.bandCount; i++) {
      const [a, b] = this.bandRanges[i];
      this.bands[i] = this._mean(a, b);
    }

    // RMS energy, short + long window
    const T = this.time;
    let sq = 0;
    for (let i = 0; i < T.length; i++) { const v = (T[i] - 128) / 128; sq += v * v; }
    const rms = Math.sqrt(sq / T.length);
    this.energyAvg += (rms - this.energyAvg) * Math.min(1, dt / 3);
    S.set('energy', Math.min(1, rms * 2.5));
    S.set('energyAvg', Math.min(1, this.energyAvg * 2.5));

    // Data textures
    let mx = 1;
    for (let x = 0; x < 512; x++) mx = Math.max(mx, this.freq[this.specBin[x]]);
    this.peaks.spec = Math.max(mx / 255, this.peaks.spec * Math.pow(10, -PEAK_DECAY_DB_PER_S * dt / 20), 0.1);
    const g = 1 / this.peaks.spec;
    for (let x = 0; x < 512; x++) this.spectrum[x] = Math.min(255, this.freq[this.specBin[x]] * g);
    const step = T.length / 512;
    for (let x = 0; x < 512; x++) this.waveform[x] = T[(x * step) | 0];
    this.history.copyWithin(256, 0, 256 * 63);        // scroll; row 0 is newest
    for (let x = 0; x < 256; x++) this.history[x] = this.spectrum[x * 2];
  }
}