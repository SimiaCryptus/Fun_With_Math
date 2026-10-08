// @ts-check
import * as V from '../vec3.js';
import { FieldSystem } from '../field/fieldSystem.js';
import { createParticle } from './particle.js';
import { stepVerlet } from './integrator.js';
import { crossPortals } from './crossing.js';

export class World {
   constructor({ background, portals = [], dt = 1 / 120, coef = {}, terms = {}, table = null, bounds = 80, energyCorrection = true }) {
     this.fieldSystem = new FieldSystem(background, portals, { coef, terms, table });
    this.dt = dt;
    this.bounds = bounds;
    this.energyCorrection = energyCorrection;
    this.particles = [];
    this.nextId = 1;
    this.stepCount = 0;
    this.time = 0;
  }

  get background() { return this.fieldSystem.background; }

  addParticle(pos, vel) {
    const p = createParticle(this.nextId++, pos, vel);
    p.e0 = this.energy(p);
    this.particles.push(p);
    return p;
  }

  /** E = ½mv² + mΦ (Φ = Φ₀ + Φ_c). */
  energy(p) {
    return 0.5 * p.mass * V.lengthSq(p.vel) + p.mass * this.fieldSystem.totalPotential(p.pos);
  }

  step() {
    const fs = this.fieldSystem;
    const entries = fs.crossingEntries;
    const accel = (x) => fs.geff(x);
    const potential = (x) => fs.totalPotential(x);
    const opts = { potential, energyCorrection: this.energyCorrection };
    const cross = (x0, x1, v) => crossPortals(x0, x1, v, entries, opts);
    for (const p of this.particles) {
      p.prevPos = p.pos;
      const r = stepVerlet(p, this.dt, accel, cross);
      if (r.count > 0) {
        p.crossings += r.count;
        p.lastCrossStep = this.stepCount + 1;
        p.seamError += r.seamError;
      }
     if (p.expireStep >= 0 && this.stepCount + 1 >= p.expireStep) p.alive = false;
      if (!V.isFiniteVec(p.pos) || V.length(p.pos) > this.bounds) p.alive = false;
    }
    this.particles = this.particles.filter((p) => p.alive);
    this.stepCount++;
    this.time = this.stepCount * this.dt;
  }

  clearParticles() { this.particles = []; }

  /** Byte-stable state dump for determinism tests. */
  dump() {
    return JSON.stringify({
      step: this.stepCount,
      particles: this.particles.map((p) => [p.id, p.pos.x, p.pos.y, p.pos.z, p.vel.x, p.vel.y, p.vel.z, p.crossings]),
    });
  }
}