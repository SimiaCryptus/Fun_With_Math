import { Grid3D } from '../spatial/Grid3D.js';
import { findPath } from '../spatial/Pathfinding.js';
import { hasLineOfSight } from '../spatial/LineOfSight.js';
import { keyOf } from '../spatial/Tile.js';
import { pushNoise, tagNPC, tagPlayer } from '../core/AgentOps.js';

const VISION_RANGE = 12;
const COS_HALF_CONE = Math.cos((120 / 2) * Math.PI / 180);
const FORCE_PER_TURN = 20;

/** Rule-based PATROL -> INVESTIGATE -> PURSUIT entity with 120° cone, acoustic sensing, and door forcing. Resolution is a neutral "tag". */
export class ThreatEntityModel {
  constructor(state, bus) { this.state = state; this.bus = bus; }

  tick() {
    for (const t of this.state.hazards.threatEntities) {
      if (t.neutralized) continue;
      this._perceive(t);
      this._act(t);
      this._tag(t);
    }
  }

  _agents(z) {
    const out = [];
    const p = this.state.player;
    if (p.physicalState.status === 'ACTIVE' && p.position.z === z) out.push({ id: 'PLAYER', position: p.position });
    for (const npc of this.state.npcs.values()) {
      if (npc.status === 'ACTIVE' && !npc.carriedBy && npc.position.z === z) out.push({ id: npc.id, position: npc.position });
    }
    return out;
  }

  _inCone(t, pos) {
    const vx = pos.x - t.position.x, vy = pos.y - t.position.y;
    const len = Math.hypot(vx, vy);
    if (len === 0) return true;
    const flen = Math.hypot(t.facing.dx, t.facing.dy) || 1;
    return (vx * t.facing.dx + vy * t.facing.dy) / (len * flen) >= COS_HALF_CONE;
  }

  _perceive(t) {
    const seen = this._agents(t.position.z)
      .filter((a) => Grid3D.distance(t.position, a.position) <= VISION_RANGE && this._inCone(t, a.position) && hasLineOfSight(this.state, t.position, a.position, VISION_RANGE))
      .sort((a, b) => Grid3D.distance(t.position, a.position) - Grid3D.distance(t.position, b.position));
    if (seen.length) {
      const prev = t.state;
      t.state = 'PURSUIT'; t.targetId = seen[0].id; t.lastSeen = { ...seen[0].position }; t.lostTurns = 0;
      if (prev !== 'PURSUIT') this.state.log({ type: 'THREAT_STATE', threatId: t.id, state: 'PURSUIT', targetId: t.targetId });
      return;
    }
    if (t.state === 'PURSUIT') {
      t.lostTurns++;
      if (t.lostTurns > 2) { t.state = 'INVESTIGATE'; t.investigateTarget = t.lastSeen; t.targetId = null; }
      return;
    }
    const heard = this.state.social.noiseEvents
      .filter((n) => n.position.z === t.position.z && Grid3D.distance(t.position, n.position) <= n.loudness + 2)
      .sort((a, b) => Grid3D.distance(t.position, a.position) - Grid3D.distance(t.position, b.position));
    if (heard.length) {
      t.state = 'INVESTIGATE'; t.investigateTarget = { ...heard[0].position };
      this.state.log({ type: 'THREAT_STATE', threatId: t.id, state: 'INVESTIGATE', key: keyOf(t.investigateTarget), source: heard[0].source });
    }
  }

  _goal(t) {
    if (t.state === 'PURSUIT') {
      const target = t.targetId === 'PLAYER' ? this.state.player : this.state.npcs.get(t.targetId);
      if (target) return { goal: target.position, steps: 2 };
      t.state = 'INVESTIGATE'; t.investigateTarget = t.lastSeen;
    }
    if (t.state === 'INVESTIGATE') {
      if (t.investigateTarget && keyOf(t.investigateTarget) !== keyOf(t.position)) return { goal: t.investigateTarget, steps: 2 };
      t.state = 'PATROL'; t.investigateTarget = null;
    }
    if (t.patrolRoute.length) {
      let wp = t.patrolRoute[t.patrolIndex % t.patrolRoute.length];
      if (keyOf(wp) === keyOf(t.position)) { t.patrolIndex = (t.patrolIndex + 1) % t.patrolRoute.length; wp = t.patrolRoute[t.patrolIndex]; }
      return { goal: wp, steps: 1 };
    }
    return null;
  }

  _act(t) {
    const plan = this._goal(t);
    if (!plan) return;
    const s = this.state;
    const path = findPath(s.grid, t.position, plan.goal, {
      passable: (tile) => tile && !tile.debris && tile.type !== 'WALL' && tile.type !== 'WINDOW' && !s.hazards.fireCells.has(tile.key),
    });
    if (!path) return;
    for (let i = 0; i < plan.steps && i < path.length; i++) {
      const tile = path[i];
      if (tile.type === 'DOOR' && !tile.doorState.isOpen) {
        if (tile.doorState.isLocked || tile.doorState.isBarricaded) { this._force(t, tile); break; }
        tile.doorState.isOpen = true;
        const rec = s.log({ type: 'DOOR_OPENED', key: tile.key, actor: 'THREAT' });
        s.hazards.doorHistory[tile.key] = rec.id;
        this.bus.emit('DOOR_STATE_CHANGED', { key: tile.key, isOpen: true, actor: 'THREAT' });
      }
      if (this._agents(tile.coord.z).some((a) => keyOf(a.position) === tile.key)) break;
      t.facing = { dx: Math.sign(tile.coord.x - t.position.x), dy: Math.sign(tile.coord.y - t.position.y) };
      t.position = { ...tile.coord };
    }
  }

  _force(t, tile) {
    const ds = tile.doorState;
    ds.barricadeStrength -= FORCE_PER_TURN;
    pushNoise(this.state, tile.coord, 6, t.id);
    t.facing = { dx: Math.sign(tile.coord.x - t.position.x), dy: Math.sign(tile.coord.y - t.position.y) };
    if (ds.barricadeStrength <= 0) {
      ds.barricadeStrength = 0; ds.isLocked = false; ds.isBarricaded = false; ds.isOpen = true;
      const rec = this.state.log({ type: 'BARRICADE_BREACHED', key: tile.key, threatId: t.id });
      this.state.hazards.doorHistory[tile.key] = rec.id;
      this.bus.emit('BARRICADE_BREACHED', { key: tile.key });
      this.bus.emit('DOOR_STATE_CHANGED', { key: tile.key, isOpen: true, actor: 'THREAT' });
    } else {
      this.state.log({ type: 'BARRICADE_STRESSED', key: tile.key, remaining: ds.barricadeStrength, threatId: t.id });
      this.bus.emit('BARRICADE_STRESSED', { key: tile.key, remaining: ds.barricadeStrength });
    }
  }

  _tag(t) {
    for (const a of this._agents(t.position.z)) {
      if (Grid3D.chebyshev(t.position, a.position) > 1) continue;
      if (!hasLineOfSight(this.state, t.position, a.position, 2)) continue;
      if (a.id === 'PLAYER') tagPlayer(this.state, this.bus, t.id);
      else tagNPC(this.state, this.bus, this.state.npcs.get(a.id), t.id);
    }
  }
}