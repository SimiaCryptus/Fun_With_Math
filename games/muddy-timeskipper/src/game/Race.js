import { MudField } from '../physics/MudField.js';
import { TrackSpline } from '../track/TrackSpline.js';
import { PlayerVehicle } from '../entities/PlayerVehicle.js';
import { AIVehicle } from '../entities/AIVehicle.js';
import { SnapbackController } from '../temporal/SnapbackController.js';
import { RNG } from '../core/RNG.js';
import { bus } from '../core/EventBus.js';
import { terrainNoise } from '../track/terrainNoise.js';

const FIELD = ['grittyGus', 'slickSally', 'boggyBill', 'turboTadpole'];

/**
 * Owns the whole simulation. Contains NO rendering code — `main.js` reads state out.
 */
export class Race {
  constructor(track, { difficulty = 1, aiCount = 4 } = {}) {
    this.track = track;
    this.bus = bus;
    this.rng = new RNG(track.seed || 1);
    this.spline = new TrackSpline(track.centerline, track.widths);

     // Generous pad so the mud floor visibly extends well past the barriers; res 320
     // keeps cells ~2.3 m so carved ruts still read on screen.
     const b = this.spline.bounds(50);
     this.mud = new MudField({ minX: b.minX, minZ: b.minZ, size: b.size, res: 320 });
     this.mud.bake(track, terrainNoise);

    const grid = track.spawn || this.spline.at(0);
    this.player = new PlayerVehicle({ ...spawnAt(this.spline, 0) });
    this.ais = [];
    for (let i = 0; i < aiCount; i++) {
      this.ais.push(new AIVehicle({
        id: FIELD[i % FIELD.length],
        personality: FIELD[i % FIELD.length],
        spline: this.spline, rng: this.rng, difficulty,
        ...spawnAt(this.spline, -(i + 1) * 8, i % 2 ? 4 : -4)
      }));
    }
    this.all = [this.player, ...this.ais];

    this.snapback = new SnapbackController({
      player: this.player, ais: this.ais, bus: this.bus, rng: this.rng
    });

    this.laps = track.laps || 3;
    this.timeMs = 0;
    this.phase = 'countdown';   // countdown | racing | finished
    this.countdown = 3.0;
    this.standings = this.all.slice();
    this.rainRate = track.rain || 0;
    this._weatherAcc = 0;
  }

  fixedUpdate(dt, tick) {
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) { this.phase = 'racing'; this.bus.emit('go', {}); }
      return;
    }
    if (this.phase === 'finished') return;

    this.timeMs += dt * 1000;
    this.snapback.fixedUpdate(dt);

    this.player.fixedUpdate(dt, this.mud, this.spline);
    for (const ai of this.ais) ai.fixedUpdate(dt, this.mud, this.spline);

    this._resolveCollisions();
    this._lapLogic(dt);
    this._recover(dt);

    this._weatherAcc += dt;
    if (this._weatherAcc > 0.25) { this.mud.weather(this._weatherAcc, this.rainRate); this._weatherAcc = 0; }

    this.standings.sort((a, b) => b.progress - a.progress);
  }

  requestSnapback(tick) { return this.snapback.activate(tick); }

  /** Circle pushout + velocity exchange. O(n^2) is fine for <= 8 vehicles. */
  _resolveCollisions() {
    const R = 2.0;
    for (let i = 0; i < this.all.length; i++) {
      for (let j = i + 1; j < this.all.length; j++) {
        const A = this.all[i].body, B = this.all[j].body;
        const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
        const d = Math.hypot(dx, dz);
        const min = R * 2;
        if (d > min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, pen = (min - d) * 0.5;
        A.pos.x -= nx * pen; A.pos.z -= nz * pen;
        B.pos.x += nx * pen; B.pos.z += nz * pen;
        const rel = (B.vel.x - A.vel.x) * nx + (B.vel.z - A.vel.z) * nz;
        if (rel < 0) {
          const imp = rel * 0.8;
          A.vel.x += nx * imp; A.vel.z += nz * imp;
          B.vel.x -= nx * imp; B.vel.z -= nz * imp;
          A.fx.snapImpulse = Math.max(A.fx.snapImpulse, Math.min(1, -rel / 20));
          B.fx.snapImpulse = Math.max(B.fx.snapImpulse, Math.min(1, -rel / 20));
        }
      }
    }
  }

  _lapLogic() {
    const cps = this.track.checkpoints || [0, 0.25, 0.5, 0.75];
    for (const v of this.all) {
      if (v.finishedMs != null) continue;
      const n = this.spline.nearest(v.body.pos.x, v.body.pos.z, v.splineHint);
      const t = n.index / this.spline.samples;
      const want = cps[v.checkpoint];
      if (Math.abs(t - want) < 0.03) {
        v.checkpoint++;
        this.bus.emit('checkpoint', { id: v.id, index: v.checkpoint });
        if (v.checkpoint >= cps.length) {
          v.checkpoint = 0;
          v.lap++;
          if (v === this.player) this.snapback.onLapComplete();
          this.bus.emit('lap', { id: v.id, lap: v.lap, timeMs: this.timeMs });
          if (v.lap >= this.laps) {
            v.finishedMs = this.timeMs;
            if (v === this.player) {
              this.phase = 'finished';
              this.bus.emit('finish', { standings: this.standings.map((s) => s.id) });
            }
          }
        }
      }
    }
  }

  /** Rolled or stuck: reposition on the line, zero velocity. Never a time rewind. */
  _recover(dt) {
    for (const v of this.all) {
      const b = v.body;
      if (b.state === 'ok') continue;
      this.bus.emit('crash', { id: v.id, kind: b.state });
      const p = this.spline.at(this.spline.ahead(v.splineHint, 6));
      b.reset(p.x, p.z, Math.atan2(p.tx, p.tz));
      v.history.reset();   // your past is gone: real cost for crashing
    }
  }
}

function spawnAt(spline, offsetM, lateral = 0) {
  const p = spline.at(spline.ahead(0, offsetM));
  const nx = -p.tz, nz = p.tx;
  return { x: p.x + nx * lateral, z: p.z + nz * lateral, yaw: Math.atan2(p.tx, p.tz) };
}