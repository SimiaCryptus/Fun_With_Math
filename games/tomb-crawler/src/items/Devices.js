import { CONFIG } from '../config.js';
import { cellsInRadius, line, toWorld, dirAngle, neighbor, key } from '../hex/Hex.js';

function losClear(world, q1, r1, q2, r2) {
  for (const nudge of [1e-6, -1e-6]) {
    const pts = line(q1, r1, q2, r2, nudge);
    let ok = true;
    for (let i = 1; i < pts.length - 1; i++) {
      if (!world.isWalkable(pts[i][0], pts[i][1])) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Radial blast occluded by walls. If facing >= 0, the forward sector is excluded.
export function blastShape(world, q, r, radius, facing = -1, halfAngleDeg = 0) {
  const out = [[q, r]];
  const fa = facing >= 0 ? dirAngle(facing) : 0;
  const half = (halfAngleDeg * Math.PI) / 180;
  const [cx, cz] = toWorld(q, r);
  for (const [tq, tr] of cellsInRadius(q, r, radius)) {
    if (tq === q && tr === r) continue;
    if (facing >= 0) {
      const [x, z] = toWorld(tq, tr);
      let da = Math.atan2(z - cz, x - cx) - fa;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < half) continue;
    }
    if (losClear(world, q, r, tq, tr)) out.push([tq, tr]);
  }
  return out;
}

// Radius-1 burst, then a budgeted flood fill along open corridors.
export function fireShape(world, q, r, cfg) {
  const res = new Map([[key(q, r), [q, r]]]);
  const frontier = [];
  for (let d = 0; d < 6; d++) {
    const [nq, nr] = neighbor(q, r, d);
    if (!world.isWalkable(nq, nr)) continue;
    res.set(key(nq, nr), [nq, nr]);
    frontier.push([nq, nr, 0]);
  }
  let head = 0;
  while (head < frontier.length && res.size < cfg.budget) {
    const [cq, cr, depth] = frontier[head++];
    if (depth >= cfg.spread) continue;
    for (let d = 0; d < 6; d++) {
      const [nq, nr] = neighbor(cq, cr, d);
      const k = key(nq, nr);
      if (res.has(k) || !world.isWalkable(nq, nr)) continue;
      res.set(k, [nq, nr]);
      frontier.push([nq, nr, depth + 1]);
      if (res.size >= cfg.budget) break;
    }
  }
  return [...res.values()];
}

export class DeviceManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.nextId = 1;
  }

  occupied(q, r) { return this.list.some((d) => d.q === q && d.r === r); }

  place(type, q, r, facing) {
    if (this.occupied(q, r)) return null;
    const cfg = CONFIG.DEVICES[type];
    const d = { id: this.nextId++, type, q, r, facing, fuse: cfg.fuse, maxFuse: cfg.fuse, tick: 0, done: false };
    this.list.push(d);
    this.game.events.emit('devicePlaced', d);
    return d;
  }

  shapeFor(d) {
    const w = this.game.world;
    const C = CONFIG.DEVICES;
    if (d.type === 'bomb') return blastShape(w, d.q, d.r, C.bomb.radius);
    if (d.type === 'shapedCharge') return blastShape(w, d.q, d.r, C.shapedCharge.radius, d.facing, C.shapedCharge.forwardHalfAngle);
    return fireShape(w, d.q, d.r, C.incendiary);
  }

  update(dt) {
    const due = [];
    for (const d of this.list) {
      d.fuse -= dt;
      d.tick -= dt;
      if (d.tick <= 0) {
        d.tick = d.fuse < 0.5 ? 0.12 : 0.25;
        this.game.events.emit('fuseTick', d);
      }
      if (d.fuse <= 0) due.push(d);
    }
    for (const d of due) this.detonate(d);
  }

  detonate(first) {
    const queue = [first];
    while (queue.length) {
      const d = queue.shift();
      if (d.done) continue;
      d.done = true;
      this.list = this.list.filter((x) => x !== d);
      const cells = this.shapeFor(d);
      if (d.type === 'incendiary') {
        this.game.applyFire(cells, d);
      } else {
        this.game.applyBlast(cells, d);
        const hit = new Set(cells.map(([q, r]) => key(q, r)));
        for (const o of this.list) if (!o.done && hit.has(key(o.q, o.r))) queue.push(o); // chain reaction
      }
    }
  }
}