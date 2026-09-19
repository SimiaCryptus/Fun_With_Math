import { C_MS, MAX_BETA, MPH_TO_MS, clamp } from '../relativity/constants.js';
import { gamma, gammaFromCelerity, speedFromCelerity } from '../relativity/lorentz.js';

/** Design targets for the *driver's* speedometer (celerity, in mph). */
export const DRIVER_TOP_MPH = 120; // throttle alone
export const DRIVER_BOOST_MPH = 145; // + boost
export const DRIVER_MAX_MPH = 160; // + boost + pad

/**
 * Track-space car model. State is (s, d, w, heading):
 *   s       arc length along the spline (m, track frame)
 *   d       lateral offset from centre line (m)
 *   w       celerity γv (m/s): track distance per tick of the *driver's*
 *           clock. This is what the cockpit speedometer shows; it has no
 *           upper bound, so 88 mph is not a wall from the seat.
 *   v       coordinate speed (derived from w, always < c); moves the car
 *           along the track in track time.
 *   heading yaw relative to the track tangent (rad, + = toward +lateral/right)
 *
 * Thrust is proper acceleration and is integrated over proper time:
 *   dw/dτ = thrust − drag(w) − brake,   dτ = dt / γ
 * Because d(γv)/dt = γ³ dv/dt this is exactly the a = F/(γ³ m) asymptote of
 * idea.md §2.3, just written in the frame the driver actually feels. Drag is
 * quadratic in w, so the driver speedo settles at sqrt(thrust / dragK).
 */
export class Car {
  constructor(opts = {}) {
    const wTop = DRIVER_TOP_MPH * MPH_TO_MS;
    const wBoost = DRIVER_BOOST_MPH * MPH_TO_MS;
    const wMax = DRIVER_MAX_MPH * MPH_TO_MS;

    this.baseAccel = opts.baseAccel ?? 18; // m/s² of proper thrust
    // drag chosen so throttle alone tops out at DRIVER_TOP_MPH...
    this.dragK = opts.dragK ?? this.baseAccel / (wTop * wTop);
    // ...boost lifts that to DRIVER_BOOST_MPH and a pad on top to DRIVER_MAX_MPH.
    this.boostAccel = opts.boostAccel ?? this.dragK * wBoost * wBoost - this.baseAccel;
    this.padAccel = opts.padAccel ?? this.dragK * wMax * wMax - this.baseAccel - this.boostAccel;
    this.brakeAccel = opts.brakeAccel ?? 40;

    this.steerRate = opts.steerRate ?? 1.25; // rad/s at low speed
    this.maxHeading = opts.maxHeading ?? 0.55;
    this.boostDrain = opts.boostDrain ?? 0.3;
    this.boostRegen = opts.boostRegen ?? 0.07;
    this.reset();
  }

  reset(s = 0, d = 0) {
    this.s = s;
    this.d = d;
    this.w = 0;
    this.v = 0;
    this.heading = 0;
    this.boost = 1;
    this.boosting = false;
    this.padTimer = 0;
    this.scrape = 0;
  }

  /** Track-frame β. */
  get beta() {
    return clamp(this.v / C_MS, 0, MAX_BETA);
  }
  get gamma() {
    return gammaFromCelerity(this.w);
  }
  /** Track-frame speed in mph (< 88). */
  get mph() {
    return this.v / MPH_TO_MS;
  }
  /** Driver-frame speed in mph (γv; tops out ≈160). */
  get properMph() {
    return this.w / MPH_TO_MS;
  }
  get celerity() {
    return this.w;
  }

  addBoost(amount) {
    this.boost = clamp(this.boost + amount, 0, 1);
  }

  hitBoostPad(duration = 1.0) {
    this.padTimer = Math.max(this.padTimer, duration);
  }

  update(dt, input) {
    const g = this.gamma;
    const b = this.beta;

    // ---- longitudinal (driver frame) ----
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
    // Launch ramp: soften the first metres so a standing start isn't a kick.
    thrust *= 0.45 + 0.55 * Math.min(1, this.w / 10);

    let a = thrust; // proper acceleration
    a -= this.brakeAccel * clamp(input.brake, 0, 1);
    a -= this.dragK * this.w * this.w; // aero drag, quadratic in celerity
    a -= this.scrape * 18; // wall rub

    // Integrate over the driver's proper time: dτ = dt / γ.
    this.w = Math.max(0, this.w + a * (dt / g));
    const wMax = C_MS * MAX_BETA * gamma(MAX_BETA); // keeps β < MAX_BETA
    if (this.w > wMax) this.w = wMax;
    this.v = speedFromCelerity(this.w);
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