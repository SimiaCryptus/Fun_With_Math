/**
  * Acorns & smoke bombs (SPEC §11.7). Pure sim: items lie on lane rows on the squirrel's 2.5 m lateral grid,
  * one in five is a smoke bomb, the mouth holds `mouthCapacity` items, the goal row banks the acorns only
  * (smoke bombs cannot be banked — they can only be dropped), and a dropped smoke bomb lights itself into a
  * plume that occludes sight lines and slows gawking drivers.
 */
export class Items {
  constructor(world, rng) {
    this.world = world; this.rng = rng;
    this.list = [];          // { id, kind: 'acorn' | 'smoke', x, z, row, timer }
    this.smokes = [];        // { x, z, timer, total }
    this.nextId = 1;
    const tn = world.tuning;
    this.timer = rng.range(tn.itemSpawnMin, tn.itemSpawnMax);
  }

  step(dt) {
    const w = this.world, tn = w.tuning, p = w.player;
    let k = 0;
    for (const it of this.list) {
      it.timer -= dt;
      if (it.timer > 0) this.list[k++] = it;
      else w.events.emit('item:expire', { item: it });
    }
    this.list.length = k;
    k = 0;
    for (const s of this.smokes) { s.timer -= dt; if (s.timer > 0) this.smokes[k++] = s; }
    this.smokes.length = k;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.rng.range(tn.itemSpawnMin, tn.itemSpawnMax);
      if (this.list.length < tn.itemMax) this.spawn();
    }

    // pickup: standing (not mid-hop) on top of an item with a free mouth slot
    if (!w.warm && w.status === 'playing' && p.alive && !p.hopping && p.mouth.length < tn.mouthCapacity) {
      for (let i = 0; i < this.list.length; i++) {
        const it = this.list[i];
        if (Math.abs(it.x - p.x) < tn.pickupRadius && Math.abs(it.z - p.z) < tn.pickupRadius) {
          this.list.splice(i, 1);
          p.mouth.push(it.kind);
          w.events.emit('item:pickup', { kind: it.kind, x: it.x, z: it.z, held: p.mouth.length });
          break;
        }
      }
    }
  }

  spawn() {
    const w = this.world, tn = w.tuning, lanes = w.road.lanes;
    if (!lanes.length) return;
    const lane = this.rng.pick(lanes);
    const n = Math.floor(tn.itemXRange / tn.lateralHop);
    const x = (this.rng.int(2 * n + 1) - n) * tn.lateralHop;             // on the squirrel's lateral grid
     const kind = this.rng() < tn.smokeChance ? 'smoke' : 'acorn';
    for (const it of this.list) if (Math.abs(it.x - x) < 1 && Math.abs(it.z - lane.zCenter) < 1) return;
    const it = { id: this.nextId++, kind, x, z: lane.zCenter, row: lane.row.index, timer: tn.itemLifetime };
    this.list.push(it);
    w.events.emit('item:spawn', { item: it });
  }

  /** Player drop intent: light a smoke bomb if carrying one, otherwise put an acorn back on the road. */
  drop() {
    const w = this.world, p = w.player, tn = w.tuning;
    if (w.status !== 'playing' || !p.alive || p.hopping || !p.mouth.length) return false;
    const si = p.mouth.indexOf('smoke');
    if (si >= 0) {
      p.mouth.splice(si, 1);
      this.smokes.push({ x: p.x, z: p.z, timer: tn.smokeTime, total: tn.smokeTime });
      w.events.emit('smoke:lit', { x: p.x, z: p.z });
      return true;
    }
    const kind = p.mouth.pop();
    const row = w.road.rowAt(p.z);
    this.list.push({ id: this.nextId++, kind, x: p.x, z: p.z, row: row ? row.index : 0, timer: tn.itemLifetime });
    w.events.emit('item:drop', { kind, x: p.x, z: p.z });
    return true;
  }

   /** Landing on the goal row banks the acorns in the mouth; smoke bombs stay put (drop-only). */
  bank() {
    const w = this.world, p = w.player, tn = w.tuning;
    if (!p.mouth.length) return;
     let acorns = 0, k = 0;
     for (const kind of p.mouth) { if (kind === 'acorn') acorns++; else p.mouth[k++] = kind; }
     p.mouth.length = k;
     if (!acorns) return;
     const points = w.scoring.bank(acorns * tn.acornPoints);
     w.events.emit('acorn:bank', { acorns, points });
  }
}