import { clamp, clamp01, sign } from '../core/MathX.js';
import * as V from '../core/Vec3.js';

const _f = V.v3();

export const PERSONALITIES = {
  grittyGus:     { skill: 0.86, aggro: 0.95, mudLove: 0.5, lookahead: 1.0, panicScale: 0.9,  torque: 1.06 },
  slickSally:    { skill: 0.94, aggro: 0.55, mudLove: 0.1, lookahead: 1.15, panicScale: 1.2, torque: 1.10 },
  boggyBill:     { skill: 0.70, aggro: 0.35, mudLove: 1.0, lookahead: 0.9, panicScale: 0.6,  torque: 0.92 },
  turboTadpole:  { skill: 0.90, aggro: 0.8,  mudLove: 0.3, lookahead: 1.3, panicScale: 1.6,  torque: 1.14 }
};

/**
 * Racing-line follower with a snapback recovery FSM.
 * AI have NO temporal awareness — that is the joke (spec §5).
 */
export class AIDriver {
  constructor({ body, spline, personality = 'boggyBill', rng, difficulty = 1 }) {
    this.body = body;
    this.spline = spline;
    this.p = { ...PERSONALITIES[personality] };
    this.rng = rng;
    this.difficulty = difficulty;
    this.hint = -1;
    this.state = 'RACE';
    this.timer = 0;
    this.panicAmount = 0;
    this.flailSign = 1;
    this.lateralBias = rng.range(-0.35, 0.35);   // preferred line offset
  }

  /** Called by SnapbackController when this AI is caught in the blast. */
  panic(amount, rng) {
    this.panicAmount = clamp01(amount * this.p.panicScale);
    this.state = 'FLAIL';
    this.timer = 0.4 + 0.8 * this.panicAmount;
    this.flailSign = rng.next() < 0.5 ? -1 : 1;
    this.body.fx.screamT = 0.6 * this.panicAmount + 0.2;
  }

  fixedUpdate(dt) {
    const b = this.body, inp = b.input;
    const near = this.spline.nearest(b.pos.x, b.pos.z, this.hint);
    this.hint = near.index;

    this.timer = Math.max(0, this.timer - dt);

    switch (this.state) {
      case 'FLAIL': {
        // exaggerated wrong-way counter-steer + throttle stabs: comedy, not competence
        const wobble = Math.sin(this.timer * 34) * this.panicAmount;
        inp.steer = clamp(this.flailSign * (0.8 * this.panicAmount) + wobble, -1, 1);
        inp.throttle = this.rng.next() < 0.35 ? 1 : 0;
        inp.brake = this.rng.next() < 0.2 ? 1 : 0;
        inp.handbrake = this.panicAmount > 0.8 && this.rng.next() < 0.1;
        if (this.timer <= 0) { this.state = 'STABILISE'; this.timer = 0.5 + this.panicAmount; }
        break;
      }
      case 'STABILISE': {
        // steer toward the actual velocity vector, no power
        const s = b.speed;
        if (s > 0.6) {
          const velYaw = Math.atan2(b.vel.x, b.vel.z);
          inp.steer = clamp(angleErr(b.yaw, velYaw) * 1.6, -1, 1);
        } else inp.steer = 0;
        inp.throttle = 0; inp.brake = 0.25; inp.handbrake = false;
        if (this.timer <= 0) { this.state = 'REACQUIRE'; this.timer = 1.2; }
        break;
      }
      case 'REACQUIRE': {
        this._pursue(dt, near, 0.7);
        if (this.timer <= 0 && Math.abs(near.lateral) < this.spline.w[near.index] * 0.4) {
          this.state = 'RACE';
          this.panicAmount = 0;
        }
        break;
      }
      default:
        this._pursue(dt, near, 1);
    }
  }


  /** Pure-pursuit steering + curvature speed target. */
  _pursue(dt, near, effort) {
    const b = this.body, inp = b.input, sp = this.spline;
    const speed = b.speed;
    const lookahead = (6 + 0.8 * speed) * this.p.lookahead;
    const tgt = sp.at(sp.ahead(near.index, lookahead));

    // aim at the target point, offset by the driver's preferred line
    const nx = -tgt.tz, nz = tgt.tx;
    const half = tgt.width * 0.5;
    const aimX = tgt.x + nx * this.lateralBias * half;
    const aimZ = tgt.z + nz * this.lateralBias * half;

    const desiredYaw = Math.atan2(aimX - b.pos.x, aimZ - b.pos.z);
    const err = angleErr(b.yaw, desiredYaw);
    inp.steer = clamp(err * 2.2 * this.p.skill, -1, 1);

    const mudTol = 1 - 0.35 * (1 - this.p.mudLove) * b.mudLoad;
    const vWant = tgt.vTarget * (0.82 + 0.18 * this.p.skill) * this.difficulty * effort * mudTol;
    // `torque` is a personality multiplier on how hard they lean on the pedal; the
    // command itself must stay in 0..1 (this is where throttle=1.06 came from).
    if (speed < vWant) { inp.throttle = clamp01(clamp01((vWant - speed) / 4) * this.p.torque); inp.brake = 0; }
    else { inp.throttle = 0; inp.brake = clamp01((speed - vWant) / 6); }

    inp.handbrake = false;
  }
}


function angleErr(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d / Math.PI;   // normalised -1..1
}