/**
 * Fixed-step accumulator. A frame yields 0..maxSteps steps; the step *sequence* is
 * identical regardless of frame rate. The spiral-of-death guard slows simulated
 * time instead of changing Δt (§10.3).
 */
export class Clock {
  constructor({ dt = 0.01, maxStepsPerFrame = 4 } = {}) {
    this.dt = dt; this.maxSteps = maxStepsPerFrame; this.running = false; this.speed = 1;
    this.acc = 0; this.pending = 0; this.stepsTotal = 0; this.slowdowns = 0; this._last = null;
  }
  setDt(dt) { this.dt = dt; this.acc = 0; }
  play() { this.running = true; this._last = null; }
  pause() { this.running = false; }
  toggle() { this.running ? this.pause() : this.play(); }
  requestSteps(n = 1) { this.pending += n; }
  /** @returns {number} steps to execute this frame */
  tick(nowMs) {
    let n = this.pending; this.pending = 0;
    if (this.running) {
      if (this._last == null) this._last = nowMs;
      let d = (nowMs - this._last) / 1000; this._last = nowMs;
      if (d > 0.25) d = 0.25;
      this.acc += d * this.speed;
      let m = Math.floor(this.acc / this.dt);
      if (m > this.maxSteps) { m = this.maxSteps; this.acc = m * this.dt; this.slowdowns++; }
      this.acc -= m * this.dt; n += m;
    }
    this.stepsTotal += n;
    return n;
  }
}