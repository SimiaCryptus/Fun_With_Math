import { key } from '../hex/Hex.js';

export class FireGrid {
  constructor() { this.cells = new Map(); }
  ignite(cells, now, dur) {
    for (const [q, r] of cells) this.cells.set(key(q, r), { q, r, start: now, expire: now + dur, dur });
  }
  isBurning(q, r) { return this.cells.has(key(q, r)); }
  update(now) {
    for (const [k, c] of this.cells) if (now >= c.expire) this.cells.delete(k);
  }
  intensity(c, now) { return Math.max(0, Math.min(1, (c.expire - now) / c.dur)); }
}

export class Multiplier {
  constructor() { this.value = 1; this.remaining = 0; this.total = 0; }

  add(v, dur) {
    if (this.remaining <= 0 || this.value <= 1) {
      this.value = v; this.remaining = dur; this.total = dur;
    } else if (v === this.value) {
      this.remaining = Math.max(this.remaining, dur);
      this.total = Math.max(this.total, this.remaining);
    } else if (v > this.value) {
      this.value = v; this.remaining = dur; this.total = dur;
    } else {
      this.remaining += dur / 2;
      this.total = Math.max(this.total, this.remaining);
    }
  }

  update(dt) {
    if (this.remaining > 0) {
      this.remaining -= dt;
      if (this.remaining <= 0) { this.remaining = 0; this.value = 1; this.total = 0; }
    }
  }

  get current() { return this.remaining > 0 ? this.value : 1; }
  get fraction() { return this.total > 0 ? this.remaining / this.total : 0; }
}