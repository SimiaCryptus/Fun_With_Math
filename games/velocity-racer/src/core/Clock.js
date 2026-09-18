/**
 * Two clocks: coordinate time (track frame) and proper time (cockpit).
 * dτ = dt / γ
 */
export class Clock {
  constructor() {
    this.reset();
  }

  reset() {
    this.coordinate = 0;
    this.proper = 0;
  }

  advance(dt, g = 1) {
    this.coordinate += dt;
    this.proper += dt / g;
  }

  get dilation() {
    return this.proper > 0 ? this.coordinate / this.proper : 1;
  }
}

export function formatTime(t) {
  if (!isFinite(t) || t < 0) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(3)}`;
}
