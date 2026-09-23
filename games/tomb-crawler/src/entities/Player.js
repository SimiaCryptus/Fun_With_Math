import { CONFIG } from '../config.js';
import { neighbor, opposite } from '../hex/Hex.js';

export class Player {
  constructor(q, r) {
    this.cq = q; this.cr = r;     // cell being left / currently in
    this.nq = q; this.nr = r;     // target cell while moving
    this.t = 0;
    this.moving = false;
    this.dir = -1;
    this.facing = 0;
    this.buffered = -1;
    this.bufferTimer = 0;
    this.lives = CONFIG.START_LIVES;
    this.invuln = 0;
    this.speed = CONFIG.PLAYER_SPEED;
  }

  queue(d) {
    this.buffered = d;
    this.bufferTimer = CONFIG.TURN_BUFFER;
    if (!this.moving) this.facing = d;
  }

  update(dt, world, onEnter) {
    if (this.invuln > 0) this.invuln = Math.max(0, this.invuln - dt);
    if (this.bufferTimer > 0) {
      this.bufferTimer -= dt;
      if (this.bufferTimer <= 0) this.buffered = -1;
    }
    // Instant reversal mid-step.
    if (this.moving && this.buffered >= 0 && this.buffered === opposite(this.dir)) {
      const q = this.cq, r = this.cr;
      this.cq = this.nq; this.cr = this.nr;
      this.nq = q; this.nr = r;
      this.t = 1 - this.t;
      this.dir = this.buffered;
      this.facing = this.dir;
      this.buffered = -1;
    }
    if (!this.moving) this._tryStart(world);
    if (!this.moving) return;
    this.t += this.speed * dt;
    while (this.t >= 1) {
      this.t -= 1;
      this.cq = this.nq; this.cr = this.nr;
      this.moving = false;
      onEnter(this.cq, this.cr);
      if (!this._tryStart(world)) { this.t = 0; break; }
    }
  }

  _tryStart(world) {
    let d = -1;
    if (this.buffered >= 0) {
      const [q, r] = neighbor(this.cq, this.cr, this.buffered);
      if (world.isWalkable(q, r)) { d = this.buffered; this.buffered = -1; this.bufferTimer = 0; }
    }
    if (d < 0 && this.dir >= 0) {
      const [q, r] = neighbor(this.cq, this.cr, this.dir);
      if (world.isWalkable(q, r)) d = this.dir;
    }
    if (d < 0) { this.dir = -1; return false; }
    this.dir = d;
    this.facing = d;
    const [q, r] = neighbor(this.cq, this.cr, d);
    this.nq = q; this.nr = r;
    this.moving = true;
    return true;
  }

  logicalCell() {
    return this.moving && this.t >= 0.5 ? [this.nq, this.nr] : [this.cq, this.cr];
  }

  floatPos() {
    if (!this.moving) return [this.cq, this.cr];
    return [this.cq + (this.nq - this.cq) * this.t, this.cr + (this.nr - this.cr) * this.t];
  }

  hurt() {
    if (this.invuln > 0 || this.lives <= 0) return false;
    this.lives--;
    this.invuln = CONFIG.INVULN_TIME;
    return true;
  }
}