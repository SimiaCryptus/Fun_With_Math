import { C_MS, MAX_BETA, clamp } from '../relativity/constants.js';
import { gamma, inertialFalloff } from '../relativity/lorentz.js';

/**
 * Track-space car model. State is (s, d, v, heading):
 *   s       arc length along the spline (m)
 *   d       lateral offset from centre line (m)
 *   v       speed (m/s)
 *   heading yaw relative to the track tangent (rad, + = toward +lateral/right)
 *
 * Acceleration falls off as 1/γ³, so c is an asymptote rather than a clamp.
 */
export class Car {
  constructor(opts = {}) {
    this.baseAccel = opts.baseAccel ?? 26;   // m/s² of proper thrust
    this.boostAccel = opts.boostAccel ?? 20;
    this.padAccel = opts.padAccel ?? 34;
    this.brakeAccel = opts.brakeAccel ?? 36;
    this.dragK = opts.dragK ?? 0.11;         // linear drag coefficient
    this.steerRate = opts.steerRate ?? 1.25; // rad/s at low speed
    this.maxHeading = opts.maxHeading ?? 0.55;
    this.boostDrain = opts.boostDrain ?? 0.40;
    this.boostRegen = opts.boostRegen ?? 0.05;
    this.reset();
  }

  reset(s = 0, d = 0) {
    this.s = s;
    this.d = d;
    this.v = 0;
    this.heading = 0;
    this.boost = 1;
    this.boosting = false;
    this.padTimer = 0;
    this.scrape = 0;
  }

  get beta() { return clamp(this.v / C_MS, 0, MAX_BETA); }
  get gamma() { return gamma(this.beta); }
  get mph() { return this.v / 0.44704; }

  addBoost(amount) {
    this.boost = clamp(this.boost + amount, 0, 1);
  }

  hitBoostPad(duration = 1.0) {
    this.padTimer = Math.max(this.padTimer, duration);
  }

  update(dt, input) {
    const g = this.gamma;
    const b = this.beta;

    // ---- longitudinal ----
    let thrust = this.baseAccel * clamp(input.throttle, 0, 1);

    this.boosting = false;
    if (input.boost && this.boost > 0.001 && input.throttle > 0.05) {
      thrust += this.boostAccel;
      this.boost = Math.max(0, this.boost - this.boostDrain * dt);
      this.boosting = true;
    } else {
      // Open question in idea.md §6: boost recharges on *track* time for now.
      this.boost = Math.min(1, this.boost + this.boostRegen * dt);
    }

    if (this.padTimer > 0) {
      thrust += this.padAccel;
      this.padTimer = Math.max(0, this.padTimer - dt);
    }

    let a = thrust * inertialFalloff(g);        // relativistic mass
    a -= this.brakeAccel * clamp(input.brake, 0, 1);
    a -= this.dragK * this.v;                   // aero/rolling drag
    a -= this.scrape * 18;                      // wall rub

    this.v = Math.max(0, this.v + a * dt);
    const vMax = C_MS * MAX_BETA;
    if (this.v > vMax) this.v = vMax;
    this.scrape = Math.max(0, this.scrape - dt * 4);

    // ---- steering ----
    // Authority collapses as β → 1: near c you barely get to change your mind.
    const authority = this.steerRate / (1 + 2.4 * b * b);
    const rolling = Math.min(1, this.v / 4);
    this.heading += clamp(input.steer, -1, 1) * authority * rolling * dt;
    // self-centering toward the tangent
    this.heading *= Math.exp(-dt * (1.1 + this.v * 0.06));
    this.heading = clamp(this.heading, -this.maxHeading, this.maxHeading);
  }
}