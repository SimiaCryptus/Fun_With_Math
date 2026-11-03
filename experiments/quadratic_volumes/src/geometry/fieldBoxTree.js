// One box tree per (node region, candidate field). Built once; a single
// sorted sweep then answers every threshold and slab (idea.md §9).

import { MaxHeap } from '../core/heap.js';
import { bisect, boxMaxWidth, boxVolume } from './box.js';
import { IN, UNKNOWN, OUT } from './region.js';
import { classify } from './oracle.js';

const DEFAULTS = { maxBoxes: 20000, minWidth: 1 / 1024 };

export class FieldBoxTree {
  constructor(region, field, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.region = region;
    this.field = field;
    this.leaves = []; // { box, status, active, vol, fmin, fmax, dead }
    this.created = 0;
    this._dirty = true;
    this._build();
  }

  _leaf(box, status, active) {
    const r = this.field.range(box);
    return {
      box, status, active, vol: boxVolume(box), fmin: r.lo, fmax: r.hi, dead: false,
    };
  }

  _build() {
    const cons = this.region.constraints;
    const heap = new MaxHeap();
    const seed = classify(cons, cons.map((_, i) => i), this.region.box);
    this.created = 1;
    if (seed.status === OUT) return;
    if (seed.status === IN) {
      this.leaves.push(this._leaf(this.region.box, IN, []));
      return;
    }
    heap.push(boxVolume(this.region.box), { box: this.region.box, active: seed.active });
    while (heap.size && this.created < this.o.maxBoxes) {
      const n = heap.pop();
      if (boxMaxWidth(n.box) <= this.o.minWidth) {
        this.leaves.push(this._leaf(n.box, UNKNOWN, n.active));
        continue;
      }
      for (const child of bisect(n.box)) {
        this.created++;
        const c = classify(cons, n.active, child);
        if (c.status === OUT) continue;
        if (c.status === IN) this.leaves.push(this._leaf(child, IN, []));
        else heap.push(boxVolume(child), { box: child, active: c.active });
      }
    }
    while (heap.size) {
      const n = heap.pop();
      this.leaves.push(this._leaf(n.box, UNKNOWN, n.active));
    }
    this._dirty = true;
  }

  /** Parent measure interval of the node region. */
  parentMeasure() {
    let lo = 0, hi = 0;
    for (const L of this.leaves) {
      if (L.dead) continue;
      hi += L.vol;
      if (L.status === IN) lo += L.vol;
    }
    return { lo, hi, kind: 'certified' };
  }

  /**
   * Refine boxes that are region-UNKNOWN or whose field range straddles a
   * contested threshold. Largest volume first (measure × sensitivity proxy).
   */
  refine(thresholds, budget = 2000) {
    const ts = Array.from(thresholds).sort((a, b) => a - b);
    const straddles = (L) => {
      if (L.status === UNKNOWN) return true;
      for (const t of ts) if (L.fmin < t && L.fmax >= t) return true;
      return false;
    };
    const heap = new MaxHeap();
    this.leaves.forEach((L, i) => {
      if (!L.dead && straddles(L) && boxMaxWidth(L.box) > this.o.minWidth) {
        heap.push(L.vol, i);
      }
    });
    let used = 0;
    const cons = this.region.constraints;
    while (heap.size && used < budget && this.created < this.o.maxBoxes) {
      const i = heap.pop();
      const L = this.leaves[i];
      if (L.dead) continue;
      if (boxMaxWidth(L.box) <= this.o.minWidth) continue;
      L.dead = true;
      used++;
      for (const child of bisect(L.box)) {
        this.created++;
        const c = classify(cons, L.active, child);
        if (c.status === OUT) continue;
        const nl = this._leaf(child, c.status === IN ? IN : UNKNOWN, c.active || []);
        const j = this.leaves.push(nl) - 1;
        if (straddles(nl) && boxMaxWidth(child) > this.o.minWidth) {
          heap.push(nl.vol, j);
        }
      }
    }
    this._dirty = true;
    return used;
  }

  _index() {
    if (!this._dirty) return;
    const live = this.leaves.filter((L) => !L.dead);
    const ins = live.filter((L) => L.status === IN);
    const mk = (arr, key) => {
      const s = arr.slice().sort((a, b) => a[key] - b[key]);
      const keys = new Float64Array(s.length);
      const pre = new Float64Array(s.length + 1);
      for (let i = 0; i < s.length; i++) {
        keys[i] = s[i][key];
        pre[i + 1] = pre[i] + s[i].vol;
      }
      return { keys, pre, total: pre[s.length] };
    };
    this._live = live;
    this._inByFmax = mk(ins, 'fmax');
    this._inByFmin = mk(ins, 'fmin');
    this._allByFmin = mk(live, 'fmin');
    this._allByFmax = mk(live, 'fmax');
    this._dirty = false;
  }

  // total volume with key strictly less than t
  static _sumLT(ix, t) {
    let lo = 0, hi = ix.keys.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ix.keys[m] < t) lo = m + 1; else hi = m;
    }
    return ix.pre[lo];
  }

  /** Certified bounds on (VL, VR) for the one-sided split f < t. */
  bounds(t) {
    this._index();
    const S = FieldBoxTree._sumLT;
    const VLlo = S(this._inByFmax, t);                      // IN boxes, fmax < t
    const VLhi = S(this._allByFmin, t);                     // any box with fmin < t
    const VRlo = this._inByFmin.total - S(this._inByFmin, t);
    const VRhi = this._allByFmax.total - S(this._allByFmax, t);
    return {
      VL: { lo: VLlo, hi: Math.max(VLhi, VLlo), kind: 'certified' },
      VR: { lo: VRlo, hi: Math.max(VRhi, VRlo), kind: 'certified' },
    };
  }

  /** Certified bounds for the slab t1 <= f < t2 against its complement. */
  slabBounds(t1, t2) {
    this._index();
    let lo = 0, hi = 0, total = 0;
    for (const L of this._live) {
      total += L.vol;
      const inside = L.fmin >= t1 && L.fmax < t2;
      const disjoint = L.fmax < t1 || L.fmin >= t2;
      if (inside && L.status === IN) lo += L.vol;
      if (!disjoint) hi += L.vol;
    }
    const outLo = Math.max(0, this.parentMeasure().lo - hi);
    return {
      VL: { lo, hi, kind: 'certified' },
      VR: { lo: outLo, hi: Math.max(total - lo, outLo), kind: 'certified' },
    };
  }

  /** Live boxes, for visualization. */
  liveBoxes() {
    this._index();
    return this._live;
  }
}