/**
 * Spectral-flux onset detection + autocorrelation tempo estimate.
 * Signals: flux, beat (impulse), beatEnv (punch), bpm, phase.
 */
export class BeatDetector {
  constructor(signals, bins, { sensitivity = 1.5, refractory = 0.12, medianLen = 43, ring = 256 } = {}) {
    this.S = signals;
    this.prev = new Uint8Array(bins);
    this.sens = sensitivity;
    this.refractory = refractory;
    this.fluxHist = new Float32Array(medianLen); this.fluxHead = 0;
    this.sorted = new Float32Array(medianLen);
    this.ring = new Float32Array(ring); this.ringHead = 0;
    this.dtAvg = 1 / 60;
    this.time = 0; this.lastBeat = -1; this.lastBpmCalc = 0;
    this.beatEnv = 0; this.bpm = 120;
    signals.define('flux', { min: 0, max: 1 });
    signals.define('beat', { min: 0, max: 1, impulse: true });
    signals.define('beatEnv', { min: 0, max: 1 });
    signals.define('bpm', { min: 0, max: 300 });
    signals.define('phase', { min: 0, max: 1 });
  }

  update(freq, dt) {
    this.time += dt;
    this.dtAvg += (dt - this.dtAvg) * 0.05;

    let flux = 0;
    const n = freq.length;
    for (let i = 0; i < n; i++) { const d = freq[i] - this.prev[i]; if (d > 0) flux += d; }
    this.prev.set(freq);
    flux /= n * 32;

    this.fluxHist[this.fluxHead] = flux; this.fluxHead = (this.fluxHead + 1) % this.fluxHist.length;
    this.ring[this.ringHead] = flux; this.ringHead = (this.ringHead + 1) % this.ring.length;
    this.sorted.set(this.fluxHist); this.sorted.sort();
    const med = this.sorted[this.sorted.length >> 1];

    let beat = false;
    if (flux > med * this.sens + 0.02 && this.time - this.lastBeat > this.refractory) {
      beat = true; this.lastBeat = this.time; this.beatEnv = 1;
    } else {
      this.beatEnv *= Math.exp(-dt / 0.08);      // ~250ms to silence
    }

    if (this.time - this.lastBpmCalc > 1) { this.lastBpmCalc = this.time; this._estimateBpm(); }

    const S = this.S;
    S.set('flux', Math.min(1, flux));
    if (beat) S.impulse('beat');
    S.set('beatEnv', this.beatEnv);
    S.set('bpm', this.bpm);
    S.set('phase', this.lastBeat < 0 ? 0 : ((this.time - this.lastBeat) * this.bpm / 60) % 1);
    return beat;
  }

  _estimateBpm() {
    const r = this.ring, N = r.length, fps = 1 / this.dtAvg;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += r[i];
    mean /= N;
    const minLag = Math.max(2, Math.floor(fps * 60 / 200));
    const maxLag = Math.min(N >> 1, Math.ceil(fps * 60 / 60));
    let best = -Infinity, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let acc = 0;
      for (let i = 0; i < N - lag; i++) acc += (r[i] - mean) * (r[i + lag] - mean);
      acc /= N - lag;
      if (acc > best) { best = acc; bestLag = lag; }
    }
    if (bestLag > 0 && best > 0) {
      const bpm = Math.min(200, Math.max(60, 60 * fps / bestLag));
      this.bpm += (bpm - this.bpm) * 0.3;
    }
  }
}