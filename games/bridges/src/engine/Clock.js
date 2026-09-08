/**
 * Fischer game clock.  Clocks belong to *seats*, not colours: a pie-rule swap
 * moves colours between people, not time between clocks.  Pure — `now` is
 * injected so tests can drive it.
 */
export class Clock {
  constructor(seats, main, increment = 0, now = () => Date.now() / 1000) {
    this.now = now;
    this.main = main;
    this.increment = increment;
    this.remaining = new Float64Array(seats).fill(main);
    this.active = -1;      // seat whose clock runs; -1 before the first move
    this.last = 0;
    this.running = false;
    this.flagged = -1;     // seat that ran out of time
  }

  /** Run `seat`'s clock; `movedSeat` (who just completed a move) earns the increment. */
  switchTo(seat, movedSeat = -1) {
    if (this.flagged >= 0) return;
    this.tick();
    if (this.running && movedSeat >= 0) this.remaining[movedSeat] += this.increment;
    this.active = seat;
    this.last = this.now();
    this.running = true;
  }

  /** Charge elapsed time to the active seat.  Returns the seat that just flagged, or -1. */
  tick() {
    if (!this.running || this.active < 0) return -1;
    const t = this.now();
    this.remaining[this.active] -= t - this.last;
    this.last = t;
    if (this.remaining[this.active] <= 0) {
      this.remaining[this.active] = 0;
      this.running = false;
      this.flagged = this.active;
      return this.active;
    }
    return -1;
  }

  stop() { this.tick(); this.running = false; }

  remainingOf(seat) {
    const r = this.remaining[seat];
    if (seat === this.active && this.running) return Math.max(0, r - (this.now() - this.last));
    return r;
  }
}

/** m:ss, with tenths under ten seconds. */
export function formatClock(seconds) {
  const s = Math.max(0, seconds);
  if (s < 10) return s.toFixed(1);
  const m = Math.floor(s / 60), r = Math.floor(s - m * 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}