import { VEHICLE as C, V88, V_MAX, MUD } from '../core/constants.js';
import { clamp, clamp01, damp, sign, smoothstep } from '../core/MathX.js';
import * as V from '../core/Vec3.js';

const _f = V.v3(), _r = V.v3();
/** Finite + clamped, or the fallback. Keeps a single bad writer from poisoning the sim. */
const fin = (v, lo, hi, fallback = 0) =>
  Number.isFinite(v) ? (v < lo ? lo : v > hi ? hi : v) : fallback;

/**
 * Arcade mud vehicle. Deterministic, allocation-free, engine-agnostic.
 * Inputs are set externally each step: throttle/brake/steer/handbrake.
 */
export class VehicleBody {
  constructor(opts = {}) {
    this.pos = V.v3(opts.x || 0, 0, opts.z || 0);
    this.vel = V.v3();
    this.yaw = opts.yaw || 0;
    this.yawRate = 0;

    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.tuning = { ...C, ...(opts.tuning || {}) };

    this.grounded = true;
    this.mudLoad = 0;          // 0..1 clinging mud: mass/drag penalty
    this.instability = 0;      // 0..1 high-speed twitchiness
    this.slip = 0;             // |lateral speed| normalised
    this.rollRisk = 0;
    this.rollTimer = 0;
    this.stuckTimer = 0;
    this.state = 'ok';         // 'ok' | 'rolled' | 'stuck'

    // cartoon-only channels consumed by the render rig; never read by physics
    this.fx = {
      snapImpulse: 0, snapDirX: 0, snapDirZ: 0, screamT: 0,
      deniedBoost: 0, wheelSpin: 0
    };
  }

  get speed() { return V.horizLen(this.vel); }
  get forwardSpeed() { V.forwardFromYaw(_f, this.yaw); return this.vel.x * _f.x + this.vel.z * _f.z; }

  reset(x, z, yaw) {
    V.set(this.pos, x, 0, z); V.set(this.vel, 0, 0, 0);
    this.yaw = yaw; this.yawRate = 0;
    this.state = 'ok'; this.rollTimer = 0; this.stuckTimer = 0; this.mudLoad = 0;
  }

  /** @param {MudField} mud */
  step(dt, mud) {
    const T = this.tuning;
    const inp = this.input;
    // Sanitize inputs at the point of consumption: the player wrapper AND the AI
    // driver both write here, so this is the only place that can guarantee range.
    inp.throttle = fin(inp.throttle, 0, 1);
    inp.brake = fin(inp.brake, 0, 1);
    inp.steer = fin(inp.steer, -1, 1);
    inp.handbrake = !!inp.handbrake;
    const vMax = Number.isFinite(T.V_MAX) && T.V_MAX > 0 ? T.V_MAX : V_MAX;

    const ground = mud ? mud.sample(this.pos.x, this.pos.z) : null;
    const gripMul = ground ? ground.grip : 1;
    const depth = ground ? ground.depth : 0;

    V.forwardFromYaw(_f, this.yaw);
    V.rightFromYaw(_r, this.yaw);
    let vF = this.vel.x * _f.x + this.vel.z * _f.z;
    let vL = this.vel.x * _r.x + this.vel.z * _r.z;

    // --- high-speed instability (approaching 88 mph is meant to hurt) ---
    this.instability = smoothstep(T.INSTABILITY_LO, T.INSTABILITY_HI, Math.abs(vF) / V88);
    const grip = T.BASE_GRIP * gripMul * (1 - 0.55 * this.instability) * (1 - 0.3 * this.mudLoad);

    // --- longitudinal ---
    const massPenalty = 1 / (1 + this.mudLoad * 0.6);
    let accel = 0;
    // BUG FIX: previously `Math.abs(vF) / T.V_MAX ?? 1` — T.V_MAX did not exist on the
    // tuning object, so this evaluated to NaN (`??` does not catch NaN) and poisoned
    // the whole body on the first throttled step.
    if (inp.throttle > 0) accel += inp.throttle * T.TORQUE * massPenalty * (1 - clamp01(Math.abs(vF) / vMax));
    if (inp.brake > 0) {
      if (vF > 0.5) accel -= inp.brake * T.BRAKE;
      else accel -= inp.brake * T.REVERSE;
    }
    accel -= sign(vF) * (T.ROLL_RES + T.MUD_DRAG * depth);
    accel -= T.AIR_DRAG * vF * Math.abs(vF);
    vF += accel * dt;

    // --- lateral (grip kills sideways velocity; handbrake removes it) ---
    const latGrip = inp.handbrake ? grip * 0.25 : grip;
    const latAccel = clamp(-vL * latGrip * T.LAT_K, -T.LAT_MAX, T.LAT_MAX);
    vL += latAccel * dt;
    this.slip = clamp01(Math.abs(vL) / 12);

    // --- steering / yaw ---
    const falloff = 1 / (1 + Math.abs(vF) / T.STEER_FALLOFF);
    const authority = (0.35 + 0.65 * grip) * (1 - 0.5 * this.instability);
    let yawTarget = inp.steer * T.STEER_MAX * falloff * authority;
    // oversteer / fishtail: lateral velocity feeds back into rotation when grip is low
    yawTarget += -vL * T.OVERSTEER_K * (1.2 - grip);
    // rut pull: ruts steer you whether you like it or not
    if (ground && depth > 0.2) {
      const rl = Math.hypot(ground.rutX, ground.rutZ);
      if (rl > 0.05) {
        const rx = ground.rutX / rl, rz = ground.rutZ / rl;
        const crossY = _f.z * rx - _f.x * rz;        // signed alignment error
        yawTarget += -crossY * MUD.RUT_PULL * depth * clamp01(Math.abs(vF) / 10);
      }
    }
    this.yawRate = damp(this.yawRate, yawTarget, T.YAW_DAMP, dt);
    this.yaw += this.yawRate * dt;

    // --- recompose world velocity ---
    V.forwardFromYaw(_f, this.yaw);
    V.rightFromYaw(_r, this.yaw);
    this.vel.x = _f.x * vF + _r.x * vL;
    this.vel.z = _f.z * vF + _r.z * vL;

    // --- vertical ---
    this.vel.y -= T.GRAVITY * dt;
    this.pos.y += this.vel.y * dt;
    const groundY = ground ? ground.height : 0;
    if (this.pos.y <= groundY) {
      if (this.vel.y < -6) this.fx.snapImpulse = Math.max(this.fx.snapImpulse, 0.4);
      this.pos.y = groundY;
      this.vel.y = this.vel.y < -1 ? -this.vel.y * T.BOUNCE : 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;

    // --- mud accumulation / shedding ---
    const shed = clamp01(Math.abs(vF) / 30) * 0.35;
    this.mudLoad = clamp01(this.mudLoad + (depth * 0.25 - shed) * dt);

    // --- carve ruts ---
    if (mud && this.grounded && Math.abs(vF) > 1) {
      const m = Math.hypot(this.vel.x, this.vel.z) || 1;
      mud.deform(this.pos.x, this.pos.z, 1.6,
        0.0022 * clamp01(Math.abs(vF) / 20) * (1 + this.slip),
        this.vel.x / m, this.vel.z / m);
    }

    // --- failure states ---
    this.rollRisk = clamp01((Math.abs(vL) * Math.abs(this.yawRate)) / T.ROLL_LIMIT / 10);
    this.rollTimer = this.rollRisk > 0.9 ? this.rollTimer + dt : Math.max(0, this.rollTimer - dt * 2);
    if (this.rollTimer > T.ROLL_TIME) this.state = 'rolled';

    if (this.speed < T.STUCK_SPEED && depth > T.STUCK_DEPTH) this.stuckTimer += dt;
    else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
    if (this.stuckTimer > T.STUCK_TIME) this.state = 'stuck';

    // --- decay cartoon channels ---
    this.fx.snapImpulse = Math.max(0, this.fx.snapImpulse - dt * 2.6);
    this.fx.screamT = Math.max(0, this.fx.screamT - dt);
    this.fx.wheelSpin += (Math.abs(vF) * 0.5 + inp.throttle * 12) * dt;
  }
}