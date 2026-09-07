/** Jerk-threshold gesture: high jerk for N consecutive samples with a refractory period. */
export class ShakeDetector {
  constructor({ threshold = 150, frames = 3, refractoryMs = 500 } = {}) {
    this.threshold = threshold; this.frames = frames; this.refractoryMs = refractoryMs;
    this._count = 0; this._last = -Infinity;
  }

  /** @returns true exactly once per shake */
  update(jerk, nowMs) {
    this._count = jerk > this.threshold ? this._count + 1 : 0;
    if (this._count >= this.frames && nowMs - this._last > this.refractoryMs) {
      this._last = nowMs; this._count = 0;
      return true;
    }
    return false;
  }
}