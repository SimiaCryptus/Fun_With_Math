import { VehicleBody } from '../physics/VehicleBody.js';
import { VelocityHistory } from '../temporal/VelocityHistory.js';
import { AIDriver } from './AIDriver.js';
import { maxGearOffset } from '../temporal/gears.js';

export class AIVehicle {
  constructor({ id, x, z, yaw, spline, personality, rng, difficulty = 1, tuning }) {
    this.id = id;
    this.personality = personality;
    this.body = new VehicleBody({ x, z, yaw, tuning });
    this.history = new VelocityHistory(maxGearOffset());
    this.driver = new AIDriver({ body: this.body, spline, personality, rng, difficulty });
    this.lap = 0;
    this.checkpoint = 0;
    this.progress = 0;
    this.splineHint = -1;
    this.finishedMs = null;
  }

  fixedUpdate(dt, mud, spline) {
    this.driver.fixedUpdate(dt);
    this.body.step(dt, mud);
    const n = spline.contain(this.body, this.splineHint);
    this.splineHint = n.index;
    this.progress = this.lap + n.progress;
    this.history.advance(dt, this.body);
  }
}