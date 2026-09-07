/** rAF-paced clock with clamped dt and a fixed-step accumulator. */
export class Clock {
  constructor({ maxDt = 0.1, fixedStep = 1 / 60 } = {}) {
    this.maxDt = maxDt;
    this.fixedStep = fixedStep;
    this.t = 0; this.dt = 0; this.frame = 0; this.now = 0; this.steps = 0;
    this._acc = 0; this._last = 0; this._raf = 0; this._cb = null;
    this.running = false;
  }

  start(cb) {
    if (this.running) return;
    this._cb = cb; this.running = true; this._last = 0;
    const loop = (ms) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      this.tick(ms);
      this._cb(this);
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  tick(ms) {
    this.now = ms;
    if (!this._last) this._last = ms;
    let dt = (ms - this._last) / 1000;
    this._last = ms;
    if (dt > this.maxDt) dt = this.maxDt;
    if (dt < 0) dt = 0;
    this.dt = dt; this.t += dt; this.frame++;
    this._acc += dt; this.steps = 0;
    while (this._acc >= this.fixedStep && this.steps < 4) { this._acc -= this.fixedStep; this.steps++; }
  }
}