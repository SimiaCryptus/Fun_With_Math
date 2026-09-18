/**
 * Fixed-step physics (default 120 Hz) with a variable-rate render.
 */
export class Loop {
  constructor({ step = 1 / 120, maxSubSteps = 12, update, render }) {
    this.step = step;
    this.maxSubSteps = maxSubSteps;
    this.update = update;
    this.render = render;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
  }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);

    let frameDt = (now - this.last) / 1000;
    this.last = now;
    if (!(frameDt > 0)) frameDt = 0;
    if (frameDt > 0.25) frameDt = 0.25; // tab was backgrounded

    this.acc += frameDt;
    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSubSteps) {
      this.update(this.step);
      this.acc -= this.step;
      steps += 1;
    }
    if (steps === this.maxSubSteps) this.acc = 0;

    this.render(frameDt, this.acc / this.step);
  }
}
