export const ROW_DEPTH = { verge: 3.0, shoulder: 2.0, lane: 3.5, median: 3.0, curb: 0.5 };

/** Rows stacked along -Z from z = 0 (start verge) toward the goal. Lanes carry traffic along X. */
export class Road {
  constructor(rowDefs, tuning, speedScale = 1) {
    this.rows = [];
    this.lanes = [];
    let z = 0;
    rowDefs.forEach((def, i) => {
      const depth = def.depth ?? ROW_DEPTH[def.type];
      const row = {
        index: i, type: def.type, zMax: z, zMin: z - depth, zCenter: z - depth / 2, depth,
        safe: def.type !== 'lane', goal: !!def.goal, hollows: def.hollows ?? 0, lane: null,
      };
      if (def.type === 'lane') {
        const lane = {
          index: this.lanes.length, row, zCenter: row.zCenter, width: depth, dir: def.dir,
          speedLimit: def.speedLimit * speedScale, density: def.density,
          anchor: !!def.anchor, chaos: !!def.chaos,
          xMin: tuning.xMin, xMax: tuning.xMax, neighbors: [],
        };
        row.lane = lane;
        this.lanes.push(lane);
      }
      this.rows.push(row);
      z -= depth;
    });
    this.zMax = 0;
    this.zMin = z;
    this.depth = -z;
    this.laneZMax = this.lanes.length ? this.lanes[0].row.zMax : 0;
    this.laneZMin = this.lanes.length ? this.lanes[this.lanes.length - 1].row.zMin : 0;
    for (const lane of this.lanes) {
      const r = lane.row.index;
      for (const j of [r - 1, r + 1]) {
        const other = this.rows[j]?.lane;
        if (other && other.dir === lane.dir) lane.neighbors.push(other);
      }
    }
    // O(1) row lookup at 0.25 m resolution
    this.res = 0.25;
    const n = Math.ceil(this.depth / this.res) + 1;
    this.lut = new Int16Array(n);
    let ri = 0;
    for (let k = 0; k < n; k++) {
      const zz = -k * this.res;
      while (ri < this.rows.length - 1 && zz <= this.rows[ri].zMin) ri++;
      this.lut[k] = ri;
    }
    this.startRow = this.rows[0];
    this.goalRow = this.rows.find((r) => r.goal) ?? this.rows[this.rows.length - 1];
  }

  rowAt(z) {
    if (z > this.zMax || z < this.zMin) return null;
    const k = Math.min(this.lut.length - 1, Math.floor(-z / this.res));
    return this.rows[this.lut[k]] ?? null;
  }

  laneAt(z) {
    return this.rowAt(z)?.lane ?? null;
  }

  laneNearest(z, dir) {
    let best = null, bd = Infinity;
    for (const l of this.lanes) {
      if (l.dir !== dir) continue;
      const d = Math.abs(l.zCenter - z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }
}