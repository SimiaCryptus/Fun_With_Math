import { permeability, ignitionTemp, AMBIENT_TEMP } from '../spatial/Tile.js';

const K_COND = 0.25;
const COOLING = 0.12;

/**
 * Deterministic thermodynamic cellular automaton:
 *   ΔT_i = Σ_j K·(T_j − T_i)·perm(j)·oxygen + Q_combustion − Q_loss
 * Open doors/exits within 2 tiles feed oxygen (burn-rate multiplier) and conduct heat through the doorway.
 */
export class FireModel {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  tick() {
    const { grid } = this.state;
    const fire = this.state.hazards.fireCells;
    const heat = new Map();
    const addHeat = (key, v) => heat.set(key, (heat.get(key) || 0) + v);

    for (const [key, cell] of [...fire.entries()]) {
      const tile = grid.getByKey(key);
      if (!tile) { fire.delete(key); continue; }
      const oxygen = 1 + 0.35 * this._openings(tile);
      cell.oxygen = oxygen;
      if (cell.fuel > cell.fuelMax * 0.15) cell.intensity = Math.min(1, cell.intensity + 0.12 * oxygen);
      else cell.intensity *= 0.7;
      cell.fuel -= cell.burnRate * Math.max(cell.intensity, 0.2) * oxygen;
      tile.temperature = 200 + 700 * cell.intensity;

      if (cell.fuel <= 0 || cell.intensity < 0.03) {
        fire.delete(key);
        tile.burnt = true;
        tile.material.flammability = 0;
        tile.temperature = 250;
        this.state.log({ type: 'FIRE_BURNOUT', key });
        continue;
      }

      for (const n of grid.neighbors(tile.coord, { vertical: false })) {
        const perm = permeability(n.tile);
        if (perm <= 0) continue;
        const factor = (n.diagonal ? 0.6 : 1) * perm * oxygen;
        addHeat(n.tile.key, K_COND * (tile.temperature - n.tile.temperature) * factor);
        if (!n.diagonal && n.tile.type === 'DOOR' && n.tile.doorState.isOpen) {
          for (const m of grid.neighbors(n.tile.coord, { diagonal: false, vertical: false })) {
            if (m.tile.key === tile.key || fire.has(m.tile.key)) continue;
            addHeat(m.tile.key, K_COND * (tile.temperature - m.tile.temperature) * 0.5 * permeability(m.tile));
          }
        }
      }
    }

    for (const [key, tile] of grid.tiles) {
      if (fire.has(key)) continue;
      let T = tile.temperature + (heat.get(key) || 0);
      T += (AMBIENT_TEMP - T) * COOLING;
      tile.temperature = T;
      if (tile.doorState) tile.doorState.temperature = T;
      const f = tile.material.flammability;
      if (f > 0.05 && !tile.burnt && tile.type !== 'WALL' && tile.type !== 'WINDOW' && T >= ignitionTemp(f)) {
        this.ignite(key, 'SPREAD');
      }
    }
  }

  _openings(tile) {
    const { x, y, z } = tile.coord;
    let n = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2 || (dx === 0 && dy === 0)) continue;
        const t = this.state.grid.get(x + dx, y + dy, z);
        if (!t) continue;
        if ((t.type === 'DOOR' && t.doorState.isOpen) || t.type === 'EXIT' || (t.type === 'WINDOW' && t.shattered)) n++;
      }
    }
    return n;
  }

  ignite(key, source = 'SPREAD', intensity = 0.3) {
    const fire = this.state.hazards.fireCells;
    const tile = this.state.grid.getByKey(key);
    if (!tile || fire.has(key)) return null;
    const fuelMax = tile.material.fuelCapacity || 40;
    fire.set(key, { intensity, fuel: fuelMax, fuelMax, burnRate: 6 + 10 * tile.material.flammability, oxygen: 1 });
    tile.temperature = Math.max(tile.temperature, 200 + 700 * intensity);
    const viaDoor = source === 'SPREAD' ? this._conduit(tile) : null;
    const causes = [];
    if (viaDoor && this.state.hazards.doorHistory[viaDoor]) causes.push(this.state.hazards.doorHistory[viaDoor]);
    const rec = this.state.log({ type: 'FIRE_SPREAD', key, viaDoor, source, causes });
    this.bus.emit('HAZARD_SPAWNED', { type: 'FIRE', key, viaDoor, source });
    return rec;
  }

  /** Finds an open door acting as the oxygen/thermal conduit for this ignition, if any. */
  _conduit(tile) {
    const grid = this.state.grid;
    const fire = this.state.hazards.fireCells;
    if (tile.type === 'DOOR' && tile.doorState.isOpen) return tile.key;
    for (const n of grid.neighbors(tile.coord, { diagonal: false, vertical: false })) {
      const d = n.tile;
      if (d.type !== 'DOOR' || !d.doorState.isOpen) continue;
      for (const m of grid.neighbors(d.coord, { diagonal: false, vertical: false })) {
        if (m.tile.key !== tile.key && fire.has(m.tile.key)) return d.key;
      }
    }
    return null;
  }
}