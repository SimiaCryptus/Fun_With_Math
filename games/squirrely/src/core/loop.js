/** Fixed-timestep accumulator loop with interpolation alpha and spiral-of-death guard. */
export function createLoop({ dt, maxSubsteps = 6, step, render }) {
  let acc = 0, last = 0, running = false, timeScale = 1, raf = 0, dropped = 0;

  function frame(now) {
    if (!running) return;
    const frameTime = Math.min((now - last) / 1000, 0.25);
    last = now;
    acc += frameTime * timeScale;
    let n = 0;
    while (acc >= dt && n < maxSubsteps) {
      step(dt);
      acc -= dt;
      n++;
    }
    if (acc >= dt) { dropped += acc; acc = 0; }
    render(acc / dt, frameTime);
    raf = requestAnimationFrame(frame);
  }

  return {
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setTimeScale(s) { timeScale = s; },
    get timeScale() { return timeScale; },
    get dropped() { return dropped; },
  };
}