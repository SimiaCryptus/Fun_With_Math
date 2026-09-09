/**
 * Fixed-capacity strided history buffer backed by one Float32Array.
 * Zero allocation after construction.
 */
export class RingBuffer {
  constructor(capacity, stride) {
    this.capacity = capacity | 0;
    this.stride = stride | 0;
    this.data = new Float32Array(this.capacity * this.stride);
    this.head = -1;    // index of the most recent record
    this.count = 0;    // records written, saturating at capacity
    this.total = 0;    // monotonic write counter (never resets)
  }

  /** Append a record. `values` must have length >= stride. */
  push(values) {
    this.head = (this.head + 1) % this.capacity;
    const o = this.head * this.stride;
    for (let i = 0; i < this.stride; i++) this.data[o + i] = values[i];
    if (this.count < this.capacity) this.count++;
    this.total++;
    return this.head;
  }

  /** Byte offset of the record `n` ticks before the newest. Returns -1 if unavailable. */
  offsetTicksAgo(n) {
    if (this.count === 0) return -1;
    const clamped = n < 0 ? 0 : n > this.count - 1 ? this.count - 1 : n;
    let idx = this.head - clamped;
    if (idx < 0) idx += this.capacity;
    return idx * this.stride;
  }

  /** True when `n` ticks of history actually exist. */
  has(n) { return this.count > n; }

  /** Oldest available age in ticks. */
  get maxTicksAgo() { return Math.max(0, this.count - 1); }

  read(n, out) {
    const o = this.offsetTicksAgo(n);
    if (o < 0) return null;
    for (let i = 0; i < this.stride; i++) out[i] = this.data[o + i];
    return out;
  }

  clear() { this.head = -1; this.count = 0; this.total = 0; this.data.fill(0); }
}