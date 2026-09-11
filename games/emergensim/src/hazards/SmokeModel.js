import { permeability } from '../spatial/Tile.js';

/** Smoke buoyancy (up through stairwells), lateral dispersion through permeable boundaries, escape at exits, slow decay. */
export class SmokeModel {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  tick() {
    const { grid } = this.state;
    const smoke = this.state.hazards.smokeCells;
    const fire = this.state.hazards.fireCells;

    for (const [key, cell] of fire) {
      const c = smoke.get(key) || { density: 0 };
      c.density = Math.min(1, c.density + 0.35 * cell.intensity);
      smoke.set(key, c);
    }

    const next = new Map();
    const add = (key, d) => next.set(key, (next.get(key) || 0) + d);

    for (const [key, cell] of smoke) {
      const tile = grid.getByKey(key);
      if (!tile) continue;
      let remaining = cell.density;

      if (tile.type === 'STAIR') {
        const up = grid.get(tile.coord.x, tile.coord.y, tile.coord.z + 1);
        if (up && up.type === 'STAIR') { const rise = remaining * 0.45; add(up.key, rise); remaining -= rise; }
      }

      const ns = grid.neighbors(tile.coord, { diagonal: false, vertical: false }).filter((n) => n.tile.type !== 'WALL');
      let totalPerm = 0;
      const perms = ns.map((n) => { const p = permeability(n.tile); totalPerm += p; return p; });
      if (totalPerm > 0) {
        const share = remaining * 0.28;
        ns.forEach((n, i) => { if (perms[i] > 0) add(n.tile.key, share * (perms[i] / totalPerm)); });
        remaining -= share;
      }
      if (tile.type === 'EXIT' || (tile.type === 'WINDOW' && tile.shattered)) remaining *= 0.5;
      add(key, remaining * 0.97);
    }

    smoke.clear();
    for (const [k, d] of next) if (d >= 0.02) smoke.set(k, { density: Math.min(1, d) });
  }
}