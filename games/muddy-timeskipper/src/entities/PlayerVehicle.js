import { VehicleBody } from '../physics/VehicleBody.js';
import { VelocityHistory } from '../temporal/VelocityHistory.js';
import { maxGearOffset } from '../temporal/gears.js';
import { clamp } from '../core/MathX.js';

export class PlayerVehicle {
  constructor({ id = 'player', x = 0, z = 0, yaw = 0, tuning } = {}) {
    this.id = id;
    this.body = new VehicleBody({ x, z, yaw, tuning });
    this.history = new VelocityHistory(maxGearOffset());
    this.lap = 0;
    this.checkpoint = 0;
    this.progress = 0;
    this.splineHint = -1;
    this.finishedMs = null;
  }

  /** Map raw input state (keyboard/gamepad) onto body inputs. */
  applyInput(raw) {
    const i = this.body.input;
    i.throttle = clamp(raw.throttle, 0, 1);
    i.brake = clamp(raw.brake, 0, 1);
    i.steer = clamp(raw.steer, -1, 1);
    i.handbrake = !!raw.handbrake;
  }

  fixedUpdate(dt, mud, spline) {
    this.body.step(dt, mud);
    if (spline) {
      const n = spline.contain(this.body, this.splineHint);
      this.splineHint = n.index;
      this.progress = this.lap + n.progress;
    }
    this.history.advance(dt, this.body);
  }
}