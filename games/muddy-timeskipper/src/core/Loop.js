import { SIM_DT } from './constants.js';

/**
 * Accumulator loop: fixed-step simulation, variable-step render.
 * `render(alpha)` receives the 0..1 interpolation factor between sim states.
 */
export class Loop {
  constructor({ fixedUpdate, render, maxSubSteps = 8 }) {
    this.fixedUpdate = fixedUpdate;
    this.render = render;
    this.maxSubSteps = maxSubSteps;
    this.acc = 0;
    this.last = 0;
    this.tick = 0;
    this.running = false;
    this.fps = 0;
    this._frames = 0;
    this._fpsT = 0;
    this._raf = 0;
    this._frame = this._frame.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this._raf = requestAnimationFrame(this._frame);
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  _frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
     if (!Number.isFinite(dt) || dt < 0) dt = 0;   // clock weirdness must not reach the sim
     if (dt > 0.25) dt = 0.25;                     // tab-out guard: never simulate a huge gap
    this.acc += dt;

    let steps = 0;
    while (this.acc >= SIM_DT && steps < this.maxSubSteps) {
      this.fixedUpdate(SIM_DT, this.tick++);
      this.acc -= SIM_DT;
      steps++;
       // fixedUpdate may call stop() (NaN tripwire, finish, teardown). Honour it
       // now instead of finishing the frame and re-arming rAF at the bottom.
       if (!this.running) return;
    }
    if (steps === this.maxSubSteps) this.acc = 0;   // drop the backlog, stay responsive

    this.render(this.acc / SIM_DT, dt);

    this._frames++; this._fpsT += dt;
    if (this._fpsT >= 0.5) { this.fps = this._frames / this._fpsT; this._frames = 0; this._fpsT = 0; }

    this._raf = requestAnimationFrame(this._frame);
  }
}