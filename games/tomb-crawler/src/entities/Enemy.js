import { CONFIG } from '../config.js';
import { neighbor, opposite, distance, axisTo, key } from '../hex/Hex.js';

let NEXT_ID = 1;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class Enemy {
  constructor(type, q, r, speed, opts = {}) {
    this.id = NEXT_ID++;
    this.type = type;
    this.cq = q; this.cr = r; this.nq = q; this.nr = r;
    this.t = 0;
    this.moving = false;
    this.dir = -1;
    this.baseSpeed = speed;
    this.speed = speed;
    this.state = 'wander';
    this.timer = 0;
    this.cooldown = 0;
    this.dashLeft = 0;
    this.wait = opts.wait ?? Math.random() * 0.5;
    this.alive = true;
    this.home = opts.home ?? null;
    this.spawnIdx = opts.spawnIdx ?? -1;
    this.small = !!opts.small;
  }

  logicalCell() { return this.moving && this.t >= 0.5 ? [this.nq, this.nr] : [this.cq, this.cr]; }
  floatPos() {
    if (!this.moving) return [this.cq, this.cr];
    return [this.cq + (this.nq - this.cq) * this.t, this.cr + (this.nr - this.cr) * this.t];
  }

  begin(d) {
    this.dir = d;
    const [q, r] = neighbor(this.cq, this.cr, d);
    this.nq = q; this.nr = r;
    this.moving = true;
  }

  update(dt, ctx) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.state === 'windup') {
      this.timer -= dt;
      if (this.timer > 0) return;
      const cfg = CONFIG.ENEMIES.cobra;
      const [q, r] = neighbor(this.cq, this.cr, this.dir);
      if (ctx.world.isWalkable(q, r) && !ctx.fire.isBurning(q, r)) {
        this.state = 'dash';
        this.speed = cfg.dashSpeed;
        this.dashLeft = cfg.sight + 1;
        this.begin(this.dir);
      } else {
        this.state = 'wander';
        this.cooldown = cfg.cooldown;
      }
    }
    if (!this.moving) {
      if (this.wait > 0) { this.wait -= dt; return; }
      const d = chooseDir(this, ctx);
      if (d < 0) { this.wait = 0.25; return; }
      this.begin(d);
    }
    this.t += this.speed * dt;
    if (this.t >= 1) {
      const over = this.t - 1;
      this.cq = this.nq; this.cr = this.nr;
      this.t = 0;
      this.moving = false;
      ctx.onEnemyEnter(this);
      if (!this.alive) return;
      const d = chooseDir(this, ctx);
      if (d >= 0) { this.begin(d); this.t = Math.min(over, 0.5); }
    }
  }
}

// ---------- behaviours ----------

function openDirs(e, ctx) {
  const open = [], burning = [];
  for (let d = 0; d < 6; d++) {
    const [q, r] = neighbor(e.cq, e.cr, d);
    if (!ctx.world.isWalkable(q, r)) continue;
    if (ctx.fire.isBurning(q, r)) burning.push(d); else open.push(d);
  }
  return { open, burning };
}

function wander(e, ctx, straightBias) {
  const { open, burning } = openDirs(e, ctx);
  if (!open.length) return burning.length ? pick(burning) : -1; // forced into fire
  const back = e.dir >= 0 ? opposite(e.dir) : -1;
  let opts = open.filter((d) => d !== back);
  if (!opts.length) opts = open;
  if (e.dir >= 0 && opts.includes(e.dir) && Math.random() < straightBias) return e.dir;
  return pick(opts);
}

function patrol(e, ctx) {
  const { open, burning } = openDirs(e, ctx);
  if (!open.length) return burning.length ? burning[0] : -1;
  const d0 = e.dir >= 0 ? e.dir : pick(open);
  for (const off of [0, 1, 5, 2, 4, 3]) {
    const d = (d0 + off) % 6;
    if (open.includes(d)) return d;
  }
  return -1;
}

function cobra(e, ctx) {
  const cfg = CONFIG.ENEMIES.cobra;
  if (e.state === 'dash') {
    e.dashLeft--;
    const [q, r] = neighbor(e.cq, e.cr, e.dir);
    if (e.dashLeft > 0 && ctx.world.isWalkable(q, r) && !ctx.fire.isBurning(q, r)) return e.dir;
    e.state = 'wander';
    e.speed = e.baseSpeed;
    e.cooldown = cfg.cooldown;
  }
  if (e.cooldown <= 0) {
    const [pq, pr] = ctx.player.logicalCell();
    const ax = axisTo(e.cq, e.cr, pq, pr);
    if (ax && ax.dist <= cfg.sight) {
      let clear = true, q = e.cq, r = e.cr;
      for (let s = 1; s < ax.dist; s++) {
        [q, r] = neighbor(q, r, ax.dir);
        if (!ctx.world.isWalkable(q, r)) { clear = false; break; }
      }
      if (clear) {
        e.dir = ax.dir;
        e.state = 'windup';
        e.timer = cfg.windup;
        ctx.emit('cobraHiss', { enemy: e });
        return -1;
      }
    }
  }
  return wander(e, ctx, 0.4);
}

export function bfsFirstStep(world, fire, sq, sr, tq, tr, budget) {
  if (sq === tq && sr === tr) return -1;
  const visited = new Set([key(sq, sr)]);
  const queue = [[sq, sr, -1]];
  let head = 0;
  while (head < queue.length && visited.size < budget) {
    const [q, r, fd] = queue[head++];
    for (let d = 0; d < 6; d++) {
      const [nq, nr] = neighbor(q, r, d);
      const k = key(nq, nr);
      if (visited.has(k)) continue;
      if (!world.isWalkable(nq, nr) || fire.isBurning(nq, nr)) continue;
      const f = fd < 0 ? d : fd;
      if (nq === tq && nr === tr) return f;
      visited.add(k);
      queue.push([nq, nr, f]);
    }
  }
  return -1;
}

function hound(e, ctx) {
  const cfg = CONFIG.ENEMIES.hound;
  const [pq, pr] = ctx.player.logicalCell();
  if (distance(e.cq, e.cr, pq, pr) <= cfg.huntRadius) {
    const step = bfsFirstStep(ctx.world, ctx.fire, e.cq, e.cr, pq, pr, cfg.bfsBudget);
    if (step >= 0) {
      if (e.state !== 'hunt') { e.state = 'hunt'; ctx.emit('houndGrowl', { enemy: e }); }
      return step;
    }
  }
  if (e.state === 'hunt') e.state = 'wander';
  return wander(e, ctx, 0.5);
}

function swarm(e, ctx) {
  const { open, burning } = openDirs(e, ctx);
  if (!open.length) return burning.length ? pick(burning) : -1;
  if (Math.random() < 0.25) return pick(open);
  const back = e.dir >= 0 ? opposite(e.dir) : -1;
  const opts = open.filter((d) => d !== back);
  return pick(opts.length ? opts : open);
}

export function chooseDir(e, ctx) {
  switch (e.type) {
    case 'scarab': return wander(e, ctx, 0.5);
    case 'sentinel': return patrol(e, ctx);
    case 'cobra': return cobra(e, ctx);
    case 'hound': return hound(e, ctx);
    case 'swarm': return swarm(e, ctx);
    default: return wander(e, ctx, 0.5);
  }
}