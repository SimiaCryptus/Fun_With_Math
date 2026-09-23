import { CONFIG } from '../config.js';

export const CELL = { FLOOR: 0, WALL: 1, CRACKED: 2, RUBBLE: 3 };
export const ITEM = { NONE: 0, COIN: 1, PILE: 2 };
export const PICKUP = { NONE: 0, BOMB: 1, INCENDIARY: 2, SHAPED: 3, MULT2: 4, MULT3: 5, ANKH: 6 };
export const isWalkableType = (t) => t === CELL.FLOOR || t === CELL.RUBBLE;

const S = CONFIG.CHUNK_SIZE;

// A chunk keeps a small diff of mutations layered over its deterministic base.
// The base arrays can be dropped (unload) and regenerated later (load).
export class Chunk {
  constructor(cq, cr) {
    this.cq = cq;
    this.cr = cr;
    this.key = cq + ',' + cr;
    this.oq = cq * S;
    this.or = cr * S;
    this.data = null;
    this.diff = new Map();
    this.killedSpawns = new Set();
    this.spawns = [];
    this.tier = 0;
    this.typeVersion = 0;
    this.changes = [];
    this.viewActive = false;
  }

  load(base) {
    this.data = { type: base.type, item: base.item, pickup: base.pickup };
    this.spawns = base.spawns;
    this.tier = base.tier;
    for (const [i, d] of this.diff) {
      if (d.type !== undefined) this.data.type[i] = d.type;
      if (d.item !== undefined) this.data.item[i] = d.item;
      if (d.pickup !== undefined) this.data.pickup[i] = d.pickup;
    }
    this.typeVersion++;
  }

  unload() { this.data = null; }

  localIndex(q, r) { return (r - this.or) * S + (q - this.oq); }

  _record(i, field, v) {
    let d = this.diff.get(i);
    if (!d) { d = {}; this.diff.set(i, d); }
    d[field] = v;
  }

  setType(i, t) {
    this.data.type[i] = t;
    this._record(i, 'type', t);
    this.typeVersion++;
  }

  setItem(i, v) {
    this.data.item[i] = v;
    this._record(i, 'item', v);
    if (this.viewActive) this.changes.push(i);
  }

  setPickup(i, v) {
    this.data.pickup[i] = v;
    this._record(i, 'pickup', v);
    if (this.viewActive) this.changes.push(i);
  }
}