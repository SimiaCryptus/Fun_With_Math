// Fixed-timestep simulation with variable-rate rendering.
export class Loop {
  constructor(update, render, hz = 60) {
    this.update = update;
    this.render = render;
    this.step = 1 / hz;
    this.acc = 0;
    this.last = 0;
    this._frame = this._frame.bind(this);
  }
  start() {
    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }
  _frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
     if (dt < 0) dt = 0; // rAF timestamp can precede performance.now() on the first frame
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= this.step && steps < 20) {
      this.update(this.step);
      this.acc -= this.step;
      steps++;
    }
    this.render(dt);
    requestAnimationFrame(this._frame);
  }
}