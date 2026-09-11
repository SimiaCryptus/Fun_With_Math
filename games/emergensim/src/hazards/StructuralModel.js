import { keyOf } from '../spatial/Tile.js';
import { incapacitateNPC, incapacitatePlayer } from '../core/AgentOps.js';

const COLLAPSIBLE = new Set(['FLOOR', 'DOOR', 'STAIR', 'CONTAINMENT', 'EXIT']);

/** Structural integrity per tile: heat weakening, shock propagation, collapse -> debris blocking. */
export class StructuralModel {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  tick() {
    const { grid } = this.state;
    const integ = this.state.hazards.structuralIntegrity;
    const fire = this.state.hazards.fireCells;
    for (const [key, tile] of grid.tiles) {
      let v = integ.get(key) ?? 1;
      const cell = fire.get(key);
      if (cell) v -= 0.04 * cell.intensity;
      else if (tile.temperature > 300) v -= 0.015;
      else continue;
      integ.set(key, Math.max(0, v));
      if (v < 0.3 && !tile.debris && COLLAPSIBLE.has(tile.type)) this.collapse(key, 'heat-weakened structure', []);
    }
  }

  applyShock(magnitude, causeId) {
    const { grid } = this.state;
    const integ = this.state.hazards.structuralIntegrity;
    const collapsed = [];
    for (const [key, tile] of grid.tiles) {
      if (tile.type === 'WALL' || tile.type === 'WINDOW') continue;
      const v = integ.get(key) ?? 1;
      const nv = Math.max(0, v - magnitude * (1.25 - v) * 0.5);
      integ.set(key, nv);
      if (nv < 0.3 && !tile.debris && COLLAPSIBLE.has(tile.type)) collapsed.push(key);
    }
    for (const key of collapsed) this.collapse(key, `aftershock (M${magnitude})`, causeId ? [causeId] : []);
    for (const npc of this.state.npcs.values()) {
      if (npc.status === 'ACTIVE') npc.traits.fear = Math.min(1, npc.traits.fear + magnitude * 0.4);
    }
    if (magnitude >= 0.45) for (const t of grid.tilesOfType('WINDOW')) t.shattered = true;
    this.bus.emit('SHOCK', { magnitude, collapsed: collapsed.length });
  }

  windGust(causeId) {
    const { grid } = this.state;
    for (const t of grid.tilesOfType('WINDOW')) t.shattered = true;
    const nearWindow = (pos) => grid.neighbors(pos, { vertical: false }).some((n) => n.tile.type === 'WINDOW');
    for (const npc of this.state.npcs.values()) {
      if (npc.status === 'ACTIVE' && !npc.carriedBy && nearWindow(npc.position)) incapacitateNPC(this.state, this.bus, npc, 'window debris', causeId ? [causeId] : []);
    }
    const p = this.state.player;
    if (p.physicalState.status === 'ACTIVE' && nearWindow(p.position)) {
      p.physicalState.injured = true;
      this.state.log({ type: 'PLAYER_INJURED', reason: 'window debris', causes: causeId ? [causeId] : [] });
    }
  }

  collapse(key, reason, causes) {
    const tile = this.state.grid.getByKey(key);
    if (!tile || tile.debris) return;
    tile.debris = true;
    this.state.hazards.structuralIntegrity.set(key, 0);
    const rec = this.state.log({ type: 'COLLAPSE', key, reason, causes });
    for (const n of this.state.grid.neighbors(tile.coord, { diagonal: false, vertical: false })) {
      const v = this.state.hazards.structuralIntegrity.get(n.tile.key) ?? 1;
      this.state.hazards.structuralIntegrity.set(n.tile.key, Math.max(0, v - 0.12));
    }
    for (const npc of this.state.npcs.values()) {
      if (npc.status === 'ACTIVE' && !npc.carriedBy && keyOf(npc.position) === key) incapacitateNPC(this.state, this.bus, npc, 'structural collapse', [rec.id]);
    }
    if (keyOf(this.state.player.position) === key) incapacitatePlayer(this.state, this.bus, 'structural collapse', [rec.id]);
    this.bus.emit('HAZARD_SPAWNED', { type: 'DEBRIS', key });
    this.bus.emit('TILE_CHANGED', { key });
  }
}