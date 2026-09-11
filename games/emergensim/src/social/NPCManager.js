import { NPCSpine } from './NPCSpine.js';
import { BehaviorTree } from './BehaviorTree.js';
import { DialogEngine } from './DialogEngine.js';
import { RumorNetwork } from './RumorNetwork.js';
import { EscalationModel } from './EscalationModel.js';
import { Grid3D } from '../spatial/Grid3D.js';
import { findPath, findNearest } from '../spatial/Pathfinding.js';
import { hasLineOfSight, smokeDensityAt } from '../spatial/LineOfSight.js';
import { keyOf, parseKey, isTilePassable } from '../spatial/Tile.js';
import { evacuateNPC, pushNoise, clamp01 } from '../core/AgentOps.js';

/** NPC phase coordinator: context -> derived state -> arbitration -> execution -> rumor/dialog -> psychological drift. */
export class NPCManager {
  constructor(state, bus) {
    this.state = state;
    this.bus = bus;
    this.rumors = new RumorNetwork(state, bus);
    this.dialog = new DialogEngine(state, bus);
  }

  processTick() {
    const s = this.state;
    const npcs = [...s.npcs.values()].filter((n) => n.status === 'ACTIVE').sort((a, b) => a.id.localeCompare(b.id));
    for (const npc of npcs) {
      if (npc.carriedBy) { npc.position = { ...s.player.position }; continue; }
      const ctx = this.buildContext(npc);
      npc.derived = NPCSpine.evaluateDerivedState(npc.traits, ctx);
      let action;
      if (npc.freezeTurns > 0) { npc.freezeTurns -= 1; action = { type: 'WAIT', reason: 'frozen' }; }
      else action = BehaviorTree.arbitrate(npc, ctx, s.meta.mode);
      this.execute(npc, action, ctx);
      npc.lastAction = action.type;
      if (npc.status !== 'ACTIVE') continue;
      this.rumors.observe(npc, ctx);
      const key = NPCSpine.selectDiagnosticDialog(npc, { ...ctx, lastAction: action.type, hasSocialFriction: action.type === 'ESCALATE_CONFLICT' });
      const stale = s.meta.turnNumber - npc.lastDialogTurn >= 3;
      if (key !== npc.lastDialogKey || stale) {
        if (!(key === 'STATUS_IDLE' && !stale)) this.dialog.utter(npc, npc.lastDialogKey === 'RUMOR' || npc.lastDialogKey === 'RUMOR_THREAT' ? npc.lastDialogKey : key);
        npc.lastDialogKey = key;
        npc.lastDialogTurn = s.meta.turnNumber;
      }
      this.applyDrift(npc, ctx);
    }
    this.rumors.propagate();
  }

  buildContext(npc) {
    const s = this.state;
    const { grid, hazards, player } = s;
    const pos = npc.position;
    const points = [];
    for (const key of hazards.fireCells.keys()) { const c = parseKey(key); if (c.z === pos.z) points.push({ ...c, kind: 'FIRE' }); }
    for (const [key, sm] of hazards.smokeCells) if (sm.density > 0.5) { const c = parseKey(key); if (c.z === pos.z) points.push({ ...c, kind: 'SMOKE' }); }
    for (const t of hazards.threatEntities) if (!t.neutralized && t.position.z === pos.z) points.push({ ...t.position, kind: 'THREAT' });
    for (const tile of grid.tiles.values()) if (tile.debris && tile.coord.z === pos.z) points.push({ ...tile.coord, kind: 'DEBRIS' });

    let nearest = null, nearestDist = 99;
    for (const h of points) { const d = Grid3D.distance(pos, h); if (d < nearestDist) { nearestDist = d; nearest = h; } }
    const hazardVisible = !!nearest && nearestDist <= 10 && hasLineOfSight(s, pos, nearest);

    let threatVisible = false;
    for (const t of hazards.threatEntities) {
      if (!t.neutralized && t.position.z === pos.z && Grid3D.distance(pos, t.position) <= 12 && hasLineOfSight(s, pos, t.position)) {
        threatVisible = true; npc.beliefs.lastKnownThreat = { ...t.position };
      }
    }
    const playerActive = player.physicalState.status === 'ACTIVE';
    const playerDist = Grid3D.distance(pos, player.position);
    const playerVisible = playerActive && player.position.z === pos.z && playerDist <= 8 && hasLineOfSight(s, pos, player.position);
    const nearbyAgents = [...s.npcs.values()].filter((o) => o.id !== npc.id && o.status === 'ACTIVE' && !o.carriedBy && o.position.z === pos.z && Grid3D.distance(pos, o.position) <= 3);
    const smokeHere = smokeDensityAt(s, keyOf(pos));
    const costFn = this.costFnFor(npc);
    const nearestStandardExit = findNearest(grid, pos, (t) => t.type === 'EXIT' && !npc.beliefs.blockedExits.has(t.key) && !hazards.fireCells.has(t.key), { agent: { canOpenDoors: true }, costFn });

    return {
      nearestHazardDistance: nearest ? nearestDist : 99,
      nearestHazardLocation: nearest,
      hazardVisible, threatVisible,
      lastKnownThreat: npc.beliefs.lastKnownThreat,
      playerVisible, playerDist, nearbyAgents, smokeHere,
      isLowImmediateDanger: nearestDist > 5 && !threatVisible && smokeHere < 0.2,
      activeAlarm: s.social.alarmActive,
      nearestStandardExit,
    };
  }

  costFnFor(npc) {
    const s = this.state;
    return (tile) => {
      if (s.hazards.fireCells.has(tile.key) || tile.debris) return Infinity;
      if (tile.type === 'EXIT' && npc.beliefs.blockedExits.has(tile.key)) return Infinity;
      let c = smokeDensityAt(s, tile.key) * 4;
      if (tile.temperature > 100) c += 3;
      if ((s.hazards.structuralIntegrity.get(tile.key) ?? 1) < 0.5) c += 2;
      if (s.meta.mode === 'SHELTER' && this._nearWindow(tile)) c += 2;
      return c;
    };
  }

  execute(npc, action, ctx) {
    const speed = npc.physicalState.slowed ? 1 : 2;
    switch (action.type) {
      case 'WAIT': return;
      case 'FREEZE':
        npc.freezeTurns = Math.max(npc.freezeTurns, action.duration ?? 1);
        this.state.log({ type: 'NPC_FROZE', npcId: npc.id, name: npc.name, reason: action.reason });
        return;
      case 'ESCALATE_CONFLICT': {
        const target = this.state.npcs.get(action.targetId);
        if (!target || target.status !== 'ACTIVE') return;
        if (Grid3D.distance(npc.position, target.position) <= 1.5) EscalationModel.bully(this.state, this.bus, npc, target);
        else this.moveToward(npc, target.position, 1, 1);
        return;
      }
      case 'EXECUTE_DRILL_PROTOCOL': {
        const ex = ctx.nearestStandardExit;
        if (!ex) { npc.blockedTurns++; return; }
        this.moveAlong(npc, ex.path, speed, { closeBehind: npc.traits.cohesion > 0.7 });
        return;
      }
      case 'FLEE_FROM': this.flee(npc, action.threatOrigin || ctx.nearestHazardLocation, speed); return;
      case 'FOLLOW_PLAYER': this.moveToward(npc, this.state.player.position, speed, 1); return;
      case 'SHELTER': this.shelter(npc, ctx, speed); return;
      case 'GATHER_BELONGINGS': this.state.log({ type: 'GREED_DELAY', npcId: npc.id, name: npc.name }); return;
      case 'SEEK_INFORMATION':
      default: this.wander(npc);
    }
  }

  moveAlong(npc, path, steps, opts = {}) {
    const s = this.state;
    let prev = s.grid.getByKey(keyOf(npc.position));
    for (let i = 0; i < steps && i < path.length; i++) {
      const tile = path[i];
      if (s.hazards.fireCells.has(tile.key) || tile.debris) { npc.blockedTurns++; return false; }
      if (tile.type !== 'EXIT' && this._occupied(tile.key, npc)) { npc.blockedTurns++; return false; }
      if (tile.type === 'DOOR' && !tile.doorState.isOpen) {
        if (tile.doorState.isLocked || tile.doorState.isBarricaded) { npc.blockedTurns++; return false; }
        this._setDoor(tile, true, npc);
      }
      npc.position = { ...tile.coord };
      npc.visited.add(tile.key);
      npc.blockedTurns = 0;
      if (opts.closeBehind && prev.type === 'DOOR' && prev.doorState.isOpen && !this._occupied(prev.key, null)) this._setDoor(prev, false, npc);
      if (npc.derived.stress > 0.6) pushNoise(s, npc.position, 5, npc.id);
      if (tile.type === 'EXIT') { evacuateNPC(s, this.bus, npc, 'reached exit'); return true; }
      prev = tile;
    }
    return true;
  }

  moveToward(npc, target, steps, stopDistance = 0) {
    const path = findPath(this.state.grid, npc.position, target, { agent: { canOpenDoors: true }, costFn: this.costFnFor(npc) });
    if (!path) { npc.blockedTurns++; return false; }
    const trimmed = stopDistance > 0 ? path.slice(0, Math.max(0, path.length - stopDistance)) : path;
    return this.moveAlong(npc, trimmed, steps);
  }

  flee(npc, origin, speed) {
    const s = this.state;
    if (!origin) { this.wander(npc); return; }
    for (let step = 0; step < speed; step++) {
      const here = s.grid.getByKey(keyOf(npc.position));
      let best = null;
      let bestScore = Grid3D.distance(here.coord, origin) - 4 * smokeDensityAt(s, here.key);
      for (const n of s.grid.neighbors(here.coord)) {
        const t = n.tile;
        if (!isTilePassable(t, { canOpenDoors: true }) || s.hazards.fireCells.has(t.key)) continue;
        if (t.type !== 'EXIT' && this._occupied(t.key, npc)) continue;
        if (t.type === 'EXIT' && npc.beliefs.blockedExits.has(t.key)) continue;
        let score = Grid3D.distance(t.coord, origin) - 4 * smokeDensityAt(s, t.key) + (t.type === 'EXIT' ? 6 : 0) - (t.temperature > 100 ? 3 : 0);
        if (npc.physicalState.disoriented) score += s.random() * 3;
        if (score > bestScore) { bestScore = score; best = t; }
      }
      if (!best) { npc.blockedTurns++; npc.traits.rage = clamp01(npc.traits.rage + 0.05); return; }
      if (best.type === 'DOOR' && !best.doorState.isOpen) this._setDoor(best, true, npc);
      npc.position = { ...best.coord };
      npc.visited.add(best.key);
      pushNoise(s, npc.position, 5, npc.id);
      if (best.type === 'EXIT') { evacuateNPC(s, this.bus, npc, 'fled to exit'); return; }
    }
  }

  wander(npc) {
    const s = this.state;
    const here = s.grid.getByKey(keyOf(npc.position));
    const options = s.grid.neighbors(here.coord, { diagonal: false }).map((n) => n.tile)
      .filter((t) => isTilePassable(t, { canOpenDoors: false }) && !s.hazards.fireCells.has(t.key) && !this._occupied(t.key, npc));
    if (!options.length) return;
    const fresh = options.filter((t) => !npc.visited.has(t.key));
    const pool = fresh.length ? fresh : options;
    const pick = pool[Math.floor(s.random() * pool.length)];
    npc.position = { ...pick.coord };
    npc.visited.add(pick.key);
    if (pick.type === 'EXIT') evacuateNPC(s, this.bus, npc, 'wandered to exit');
  }

  shelter(npc, ctx, speed) {
    const s = this.state;
    const here = s.grid.getByKey(keyOf(npc.position));
    for (const n of s.grid.neighbors(here.coord, { diagonal: false })) {
      const t = n.tile;
      if (t.type === 'DOOR' && t.doorState.isOpen && npc.traits.trust > 0.4 && !this._occupied(t.key, null) && !s.threatAt(t.key)) {
        this._setDoor(t, false, npc);
        s.log({ type: 'NPC_SECURED_DOOR', npcId: npc.id, name: npc.name, key: t.key });
      }
    }
    if (here.type === 'DOOR' || this._nearWindow(here) || this._adjacentToDoor(here) || ctx.threatVisible) {
      const found = findNearest(s.grid, here.coord, (t) => t.type === 'FLOOR' && t.key !== here.key && !this._nearWindow(t) && !this._adjacentToDoor(t) && !this._occupied(t.key, npc), { agent: { canOpenDoors: false }, costFn: this.costFnFor(npc) });
      if (found) this.moveAlong(npc, found.path, speed);
    }
  }

  applyDrift(npc, ctx) {
    const t = npc.traits;
    const prox = Math.max(0, 1 - ctx.nearestHazardDistance / 10);
    t.fear = clamp01(t.fear + 0.08 * prox + ctx.smokeHere * 0.1 - (ctx.hazardVisible || ctx.threatVisible ? 0 : 0.03));
    if (ctx.playerVisible && t.trust > 0.5 && ctx.playerDist <= 3) t.fear = clamp01(t.fear - 0.04);
    if (ctx.activeAlarm) t.fear = clamp01(t.fear - 0.02 * t.cohesion);
    t.rage = clamp01(t.rage + (npc.blockedTurns > 0 ? 0.05 : -0.03));
    if (npc.lastAction === 'FOLLOW_PLAYER') t.trust = clamp01(t.trust + 0.02);
  }

  _setDoor(tile, open, npc) {
    tile.doorState.isOpen = open;
    const rec = this.state.log({ type: open ? 'DOOR_OPENED' : 'DOOR_CLOSED', key: tile.key, actor: npc.id });
    if (open) this.state.hazards.doorHistory[tile.key] = rec.id;
    pushNoise(this.state, tile.coord, 3, npc.id);
    this.bus.emit('DOOR_STATE_CHANGED', { key: tile.key, isOpen: open, actor: npc.id });
  }

  _occupied(key, self) {
    const s = this.state;
    if (s.player.physicalState.status === 'ACTIVE' && keyOf(s.player.position) === key) return true;
    if (s.threatAt(key)) return true;
    for (const o of s.npcs.values()) {
      if (o !== self && !o.carriedBy && (o.status === 'ACTIVE' || o.status === 'INCAPACITATED') && keyOf(o.position) === key) return true;
    }
    return false;
  }

  _nearWindow(tile) {
    return this.state.grid.neighbors(tile.coord, { vertical: false }).some((n) => n.tile.type === 'WINDOW');
  }

  _adjacentToDoor(tile) {
    return this.state.grid.neighbors(tile.coord, { diagonal: false, vertical: false }).some((n) => n.tile.type === 'DOOR');
  }
}