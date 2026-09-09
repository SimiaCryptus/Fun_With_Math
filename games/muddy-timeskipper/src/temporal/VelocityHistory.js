import { RingBuffer } from '../core/RingBuffer.js';
import { HISTORY_DT, HISTORY_HZ, MAX_OFFSET_S } from '../core/constants.js';
import { lerp, lerpAngle } from '../core/MathX.js';

const STRIDE = 6; // vx, vy, vz, yaw, yawRate, speed

/**
 * Per-vehicle velocity recorder. Records at HISTORY_HZ regardless of sim rate.
 * `sample(age)` interpolates between neighbouring ticks and reports clamping.
 */
export class VelocityHistory {
  constructor(maxSeconds = MAX_OFFSET_S) {
    this.capacity = Math.ceil(maxSeconds * HISTORY_HZ) + 2;
    this.buf = new RingBuffer(this.capacity, STRIDE);
    this._acc = 0;
    this._a = new Float32Array(STRIDE);
    this._b = new Float32Array(STRIDE);
    // Reused result object: never allocate in the hot path.
    this.out = { vx: 0, vy: 0, vz: 0, yaw: 0, yawRate: 0, speed: 0, clamped: false, age: 0 };
  }

  reset() { this.buf.clear(); this._acc = 0; }

  /** Call every fixed step; writes a record every HISTORY_DT of sim time. */
  advance(dt, body) {
    this._acc += dt;
    while (this._acc >= HISTORY_DT) {
      this._acc -= HISTORY_DT;
      this.record(body);
    }
  }

  record(body) {
    const a = this._a;
    a[0] = body.vel.x; a[1] = body.vel.y; a[2] = body.vel.z;
    a[3] = body.yaw;   a[4] = body.yawRate;
    a[5] = Math.hypot(body.vel.x, body.vel.z);
    this.buf.push(a);
  }

  get seconds() { return this.buf.maxTicksAgo * HISTORY_DT; }

  /**
   * Sample the state `ageSeconds` in the past.
   * Clamps to the oldest available record and flags `clamped` when history is short.
   */
  sample(ageSeconds) {
    const o = this.out;
    if (this.buf.count === 0) {
      o.vx = o.vy = o.vz = o.yaw = o.yawRate = o.speed = 0;
      o.clamped = true; o.age = 0;
      return o;
    }
    const wantTicks = ageSeconds / HISTORY_DT;
    const maxTicks = this.buf.maxTicksAgo;
    const clamped = wantTicks > maxTicks;
    const ticks = clamped ? maxTicks : wantTicks;

    const i0 = Math.floor(ticks);
    const i1 = Math.min(i0 + 1, maxTicks);
    const t = ticks - i0;

    const A = this.buf.read(i0, this._a);
    const B = this.buf.read(i1, this._b);

    o.vx = lerp(A[0], B[0], t);
    o.vy = lerp(A[1], B[1], t);
    o.vz = lerp(A[2], B[2], t);
    o.yaw = lerpAngle(A[3], B[3], t);
    o.yawRate = lerp(A[4], B[4], t);
    o.speed = lerp(A[5], B[5], t);
    o.clamped = clamped;
    o.age = ticks * HISTORY_DT;
    return o;
  }

  /** Speed (m/s) at `ageSeconds` ago — used by the HUD velocity ribbon. */
  speedAt(ageSeconds) { return this.sample(ageSeconds).speed; }
}