const active = new Set();

export const Easing = {
  linear: (t) => t,
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
};

export function tween({ duration = 300, ease = Easing.inOutQuad, onUpdate, onComplete }) {
  return new Promise((resolve) => {
    const tw = {
      start: performance.now(), duration, ease, onUpdate,
      done() { active.delete(tw); onComplete?.(); resolve(); },
    };
    if (duration <= 0) { onUpdate?.(1, 1); tw.done(); return; }
    active.add(tw);
  });
}

export function updateTweens(now) {
  for (const tw of active) {
    const t = Math.min(1, (now - tw.start) / tw.duration);
    tw.onUpdate?.(tw.ease(t), t);
    if (t >= 1) tw.done();
  }
}

export function cancelAllTweens() { active.clear(); }