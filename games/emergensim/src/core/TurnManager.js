import { ActionEconomy } from './ActionEconomy.js';
import { GameState } from './GameState.js';
import { EventBus } from './EventBus.js';
import { computeVisibility, hasLineOfSight, smokeDensityAt } from '../spatial/LineOfSight.js';
import { keyOf, isTilePassable } from '../spatial/Tile.js';
import { Grid3D } from '../spatial/Grid3D.js';
import { HazardManager } from '../hazards/HazardManager.js';
import { NPCManager } from '../social/NPCManager.js';
import { EscalationModel } from '../social/EscalationModel.js';
import { evacuateNPC, incapacitateNPC, incapacitatePlayer, pushNoise } from './AgentOps.js';

/** Phase coordinator: PLAYER_INPUT -> HAZARD_TICK -> NPC_TICK -> ENVIRONMENT_TICK -> (AUTOPSY). */
export class TurnManager {
  constructor(state, eventBus, deps = {}) {
    this.state = state;
    this.bus = eventBus;
    this.economy = new ActionEconomy(state);
    this.hazardManager = deps.hazardManager || new HazardManager(state, eventBus);
    this.npcManager = deps.npcManager || new NPCManager(state, eventBus);
  }

  startScenario() {
    this.state.snapshots = [this.state.snapshot()];
    this.startTurn();
  }

  startTurn() {
    const s = this.state;
    s.meta.activePhase = 'PLAYER_INPUT';
    this.economy.resetForTurn();
    this._refreshVision();
    this.bus.emit('TURN_STARTED', { turn: s.meta.turnNumber });
    this.bus.emit('STATE_CHANGED', { reason: 'TURN_STARTED' });
  }

  // ---------------------------------------------------------------- Player actions
  processPlayerAction(action) {
    const s = this.state;
    if (s.outcome || s.meta.activePhase !== 'PLAYER_INPUT') return this._rejected(action, 'Not accepting input right now');
    if (s.player.physicalState.status !== 'ACTIVE') return this._rejected(action, 'You are no longer active');
    const handler = this[`_act${action.type}`];
    if (!handler) return this._rejected(action, `Unknown action ${action.type}`);
    const result = handler.call(this, action);
    if (!result.ok) return this._rejected(action, result.reason);
    this._refreshVision();
    this.bus.emit('PLAYER_ACTION_APPLIED', { action, cost: result.cost });
    this.bus.emit('STATE_CHANGED', { reason: 'PLAYER_ACTION' });
    return true;
  }

  _rejected(action, reason) {
    this.bus.emit('ACTION_REJECTED', { action, reason });
    return false;
  }

  _spend(type, ctx) {
    const cost = this.economy.cost(type, ctx);
    if (!this.economy.canAfford(cost)) return null;
    this.economy.spend(cost);
    return cost;
  }

  _resolveTile(action) {
    const p = this.state.player.position;
    if (action.target) return this.state.grid.getByKey(action.target) || null;
    if (typeof action.dx === 'number' || typeof action.dz === 'number') {
      return this.state.grid.get(p.x + (action.dx || 0), p.y + (action.dy || 0), p.z + (action.dz || 0)) || null;
    }
    return null;
  }

  _adjacentEntry(tile) {
    const here = this.state.grid.getByKey(keyOf(this.state.player.position));
    return this.state.grid.neighbors(here.coord).find((n) => n.tile.key === tile.key) || null;
  }

  _resolveNPC(action, maxDist = 1.5) {
    const s = this.state;
    let npc = action.npcId ? s.npcs.get(action.npcId) : null;
    if (!npc && action.target) npc = s.npcAt(action.target);
    if (!npc) return null;
    if (npc.status === 'EVACUATED' || npc.status === 'TAGGED') return null;
    if (Grid3D.distance(npc.position, s.player.position) > maxDist && npc.carriedBy !== 'PLAYER') return null;
    return npc;
  }

  _actMOVE(action) {
    const s = this.state;
    const tile = this._resolveTile(action);
    if (!tile) return { ok: false, reason: 'No such tile' };
    const entry = this._adjacentEntry(tile);
    if (!entry) return { ok: false, reason: 'Not adjacent' };
    if (!isTilePassable(tile, { canOpenDoors: false })) {
      if (tile.type === 'DOOR' && !tile.doorState.isOpen) return { ok: false, reason: 'Door is closed — open it first (1 AP)' };
      if (tile.debris) return { ok: false, reason: 'Blocked by debris — clear it (2 AP)' };
      return { ok: false, reason: 'Impassable' };
    }
    if (s.hazards.fireCells.has(tile.key)) return { ok: false, reason: 'That tile is burning' };
    if (s.npcAt(tile.key) && tile.type !== 'EXIT') return { ok: false, reason: 'Occupied' };
    if (s.threatAt(tile.key)) return { ok: false, reason: 'Occupied' };
    const cost = this._spend('MOVE', { diagonal: entry.diagonal, destKey: tile.key });
    if (cost === null) return { ok: false, reason: 'Not enough AP' };

    s.player.position = { ...tile.coord };
    const carrying = s.player.physicalState.carrying ? s.npcs.get(s.player.physicalState.carrying) : null;
    if (carrying) carrying.position = { ...tile.coord };
    if (tile.type === 'EXIT') {
      s.log({ type: 'PLAYER_AT_EXIT', key: tile.key });
      if (carrying) evacuateNPC(s, this.bus, carrying, 'carried to exit by player');
    }
    return { ok: true, cost };
  }

  _actTOGGLE_DOOR(action) { return this._doorAction(action, null); }
  _actOPEN_DOOR(action) { return this._doorAction(action, true); }
  _actCLOSE_DOOR(action) { return this._doorAction(action, false); }

  _doorAction(action, desired) {
    const s = this.state;
    const tile = this._resolveTile(action);
    if (!tile || tile.type !== 'DOOR') return { ok: false, reason: 'Target is not a door' };
    if (Grid3D.distance(tile.coord, s.player.position) > 1.5) return { ok: false, reason: 'Door is not adjacent' };
    const ds = tile.doorState;
    const open = desired === null ? !ds.isOpen : desired;
    if (open === ds.isOpen) return { ok: false, reason: `Door is already ${open ? 'open' : 'closed'}` };
    if (open && ds.isBarricaded) return { ok: false, reason: 'Door is barricaded' };
    if (open && ds.isLocked && !s.player.inventory.includes('MASTER_KEY')) return { ok: false, reason: 'Door is locked' };
    if (!open && (s.npcAt(tile.key) || s.threatAt(tile.key))) return { ok: false, reason: 'Someone is standing in the doorway' };
    const cost = this._spend('TOGGLE_DOOR');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    ds.isOpen = open;
    const rec = s.log({ type: open ? 'DOOR_OPENED' : 'DOOR_CLOSED', key: tile.key, actor: 'PLAYER', hot: ds.temperature > 55 });
    if (open) s.hazards.doorHistory[tile.key] = rec.id;
    pushNoise(s, tile.coord, 4, 'PLAYER_DOOR');
    this.bus.emit('DOOR_STATE_CHANGED', { key: tile.key, isOpen: open, actor: 'PLAYER' });
    return { ok: true, cost };
  }

  _actCHECK_DOOR(action) {
    const s = this.state;
    const tile = this._resolveTile(action);
    if (!tile || tile.type !== 'DOOR') return { ok: false, reason: 'Target is not a door' };
    if (Grid3D.distance(tile.coord, s.player.position) > 1.5) return { ok: false, reason: 'Door is not adjacent' };
    const cost = this._spend('CHECK_DOOR');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    const t = tile.doorState.temperature;
    tile.doorState.lastChecked = s.meta.turnNumber;
    s.log({ type: 'DOOR_CHECKED', key: tile.key, temperature: Math.round(t), hot: t > 55 });
    this.bus.emit('DOOR_CHECKED', { key: tile.key, temperature: Math.round(t), hot: t > 55 });
    return { ok: true, cost };
  }

  _actBARRICADE(action) {
    const s = this.state;
    const tile = this._resolveTile(action);
    if (!tile || tile.type !== 'DOOR') return { ok: false, reason: 'Target is not a door' };
    if (Grid3D.distance(tile.coord, s.player.position) > 1.5) return { ok: false, reason: 'Door is not adjacent' };
    if (tile.doorState.isOpen) return { ok: false, reason: 'Close the door first' };
    if (tile.doorState.isBarricaded) return { ok: false, reason: 'Already barricaded' };
    if (!s.player.inventory.includes('BARRICADE_KIT')) return { ok: false, reason: 'No barricade materials' };
    const cost = this._spend('BARRICADE');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    tile.doorState.isBarricaded = true;
    tile.doorState.barricadeStrength += 50;
    pushNoise(s, tile.coord, 3, 'PLAYER_BARRICADE');
    s.log({ type: 'BARRICADE', key: tile.key, strength: tile.doorState.barricadeStrength });
    this.bus.emit('BARRICADE_BUILT', { key: tile.key, strength: tile.doorState.barricadeStrength });
    this.bus.emit('DOOR_STATE_CHANGED', { key: tile.key, isOpen: false, actor: 'PLAYER' });
    return { ok: true, cost };
  }

  _actCLEAR_DEBRIS(action) {
    const s = this.state;
    const tile = this._resolveTile(action);
    if (!tile || !tile.debris) return { ok: false, reason: 'No debris there' };
    if (Grid3D.distance(tile.coord, s.player.position) > 1.5) return { ok: false, reason: 'Debris is not adjacent' };
    const cost = this._spend('CLEAR_DEBRIS');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    tile.debris = false;
    s.hazards.structuralIntegrity.set(tile.key, 0.5);
    s.log({ type: 'DEBRIS_CLEARED', key: tile.key });
    this.bus.emit('TILE_CHANGED', { key: tile.key });
    return { ok: true, cost };
  }

  _actDEESCALATE(action) {
    const s = this.state;
    const npc = this._resolveNPC(action, 2.5);
    if (!npc || npc.status !== 'ACTIVE') return { ok: false, reason: 'No one nearby to talk to' };
    if (npc.position.z !== s.player.position.z || !hasLineOfSight(s, s.player.position, npc.position)) return { ok: false, reason: 'They cannot see you' };
    const cost = this._spend('DEESCALATE');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    EscalationModel.deescalate(s, this.bus, npc);
    return { ok: true, cost };
  }

  _actASSIST(action) {
    const s = this.state;
    const ps = s.player.physicalState;
    if (ps.carrying) {
      const carried = s.npcs.get(ps.carrying);
      carried.carriedBy = null;
      carried.position = { ...s.player.position };
      ps.carrying = null;
      s.log({ type: 'ASSIST_RELEASED', npcId: carried.id });
      this.bus.emit('ASSIST_CHANGED', { npcId: carried.id, carrying: false });
      return { ok: true, cost: 0 };
    }
    const npc = this._resolveNPC(action, 1.5);
    if (!npc) return { ok: false, reason: 'No one adjacent to assist' };
    const cost = this._spend('ASSIST');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    npc.carriedBy = 'PLAYER';
    npc.position = { ...s.player.position };
    ps.carrying = npc.id;
    npc.traits.trust = Math.min(1, npc.traits.trust + 0.2);
    npc.traits.fear = Math.max(0, npc.traits.fear - 0.15);
    s.log({ type: 'ASSIST', npcId: npc.id, name: npc.name });
    this.bus.emit('ASSIST_CHANGED', { npcId: npc.id, carrying: true });
    return { ok: true, cost };
  }

  _actSOUND_ALARM() {
    const s = this.state;
    const cost = this._spend('SOUND_ALARM');
    if (cost === null) return { ok: false, reason: 'Not enough AP' };
    const first = !s.social.alarmActive;
    s.social.alarmActive = true;
    s.social.groupCohesion = Math.min(1, s.social.groupCohesion + (first ? 0.15 : 0.08));
    this.npcManager.rumors.clearFalseBeliefs(0.5);
    s.log({ type: 'ALARM', first, cohesion: s.social.groupCohesion });
    this.bus.emit('ALARM_SOUNDED', { first });
    return { ok: true, cost };
  }

  _actWAIT() { return { ok: true, cost: 0 }; }

  // ---------------------------------------------------------------- Turn resolution
  commitTurn() {
    const s = this.state;
    if (s.outcome || s.meta.activePhase !== 'PLAYER_INPUT') return false;
    const bus = this.bus;

    this._phase('HAZARD_TICK');
    this.hazardManager.processHazardTick();

    this._phase('NPC_TICK');
    this.npcManager.processTick();
    this.hazardManager.processThreatTick();

    this._phase('ENVIRONMENT_TICK');
    this.hazardManager.processEnvironmentTick();
    this._applyExposure();
    s.social.responderEtaTurns = Math.max(0, s.social.responderEtaTurns - 1);
    s.social.noiseEvents = [];

    s.outcome = this._evaluateOutcome();
    const c = s.counts();
    s.log({ type: 'TURN_SUMMARY', fire: s.hazards.fireCells.size, smoke: s.hazards.smokeCells.size, ...c });
    s.snapshots.push(s.snapshot());

    if (s.outcome) {
      s.meta.activePhase = 'AUTOPSY';
      bus.emit('SCENARIO_ENDED', { outcome: s.outcome });
      bus.emit('STATE_CHANGED', { reason: 'SCENARIO_ENDED' });
      return true;
    }
    s.meta.turnNumber += 1;
    this.startTurn();
    return true;
  }

  _phase(phase) {
    this.state.meta.activePhase = phase;
    this.bus.emit('PHASE_CHANGED', { phase });
  }

  rewindTo(turn) {
    const s = this.state;
    if (turn < 1 || turn - 1 >= s.snapshots.length) return false;
    const snap = s.snapshots[turn - 1];
    s.restore(snap);
    s.snapshots.length = turn;
    s.meta.turnNumber = turn;
    s.outcome = null;
    s.log({ type: 'REWIND', toTurn: turn });
    this.startTurn();
    this.bus.emit('REWOUND', { turn });
    return true;
  }

  _refreshVision() {
    const p = this.state.player;
    const vis = computeVisibility(this.state, p.position, 12);
    p.visible = vis;
    for (const k of vis) p.explored.add(k);
    p.lineOfSight = [...vis];
  }

  _applyExposure() {
    const s = this.state;
    const apply = (agentPs, key) => {
      const D = smokeDensityAt(s, key);
      if (D > 0.5) { agentPs.lungIrritation += 2; agentPs.exposure = 'HEAVY'; }
      else if (D >= 0.2) { agentPs.lungIrritation += 1; agentPs.exposure = 'MILD'; }
      else agentPs.exposure = agentPs.lungIrritation >= 4 ? 'MILD' : 'NONE';
      agentPs.disoriented = D > 0.5;
      agentPs.slowed = agentPs.exposure === 'HEAVY' || agentPs.lungIrritation >= 6;
      if (s.hazards.fireCells.has(key)) agentPs.lungIrritation += 4;
      return agentPs.lungIrritation >= 8 || s.hazards.fireCells.has(key);
    };
    const pKey = keyOf(s.player.position);
    if (s.player.physicalState.status === 'ACTIVE' && apply(s.player.physicalState, pKey)) {
      incapacitatePlayer(s, this.bus, s.hazards.fireCells.has(pKey) ? 'thermal exposure' : 'smoke inhalation', this._recentFireCauses(s.player.position));
    }
    for (const npc of s.npcs.values()) {
      if (npc.status !== 'ACTIVE') continue;
      const key = npc.carriedBy ? pKey : keyOf(npc.position);
      if (apply(npc.physicalState, key)) {
        incapacitateNPC(s, this.bus, npc, s.hazards.fireCells.has(key) ? 'thermal exposure' : 'smoke inhalation', this._recentFireCauses(npc.position));
      }
    }
  }

  _recentFireCauses(pos) {
    const log = this.state.telemetryLog;
    for (let i = log.length - 1; i >= 0; i--) {
      const r = log[i];
      if (r.type !== 'FIRE_SPREAD') continue;
      const [x, y, z] = r.key.split(',').map(Number);
      if (z === pos.z && Grid3D.distance({ x, y, z }, pos) <= 6) return [r.id];
    }
    return [];
  }

  _evaluateOutcome() {
    const s = this.state;
    const c = s.counts();
    const conds = s.meta.scenarioGoal || [];
    const ps = s.player.physicalState.status;
    if (ps !== 'ACTIVE') return { result: 'LOSS', reason: `You were ${ps.toLowerCase()}. The scenario cannot continue.`, counts: c };
    for (const cond of conds) {
      if (cond.type === 'PREVENT_CASUALTIES' && c.casualties > cond.targetValue) {
        return { result: 'LOSS', reason: `Casualty threshold exceeded (${c.casualties} > ${cond.targetValue}).`, counts: c };
      }
    }
    const final = s.social.responderEtaTurns <= 0 || c.active === 0 || s.meta.turnNumber >= s.meta.maxTurns;
    const checks = conds.filter((k) => k.type !== 'PREVENT_CASUALTIES').map((cond) => {
      let met = false;
      if (cond.type === 'EVACUATE_MINIMUM_PERCENT') met = c.total === 0 || c.evacuated / c.total >= cond.targetValue;
      else if (cond.type === 'SURVIVE_TURNS') met = s.meta.turnNumber >= cond.targetValue;
      else if (cond.type === 'CONTAIN_HAZARD') met = s.hazards.fireCells.size <= cond.targetValue && (final || s.hazards.fireCells.size === 0);
      return { cond, met };
    });
    const allMet = checks.every((k) => k.met);
    const earlyOk = checks.every((k) => k.cond.type === 'EVACUATE_MINIMUM_PERCENT');
    if (allMet && (final || earlyOk)) {
      return { result: 'WIN', reason: final ? 'Responders arrived with objectives met.' : 'Evacuation objective reached.', counts: c };
    }
    if (final) {
      const unmet = checks.filter((k) => !k.met).map((k) => `${k.cond.type} (${k.cond.targetValue})`).join(', ');
      return { result: 'LOSS', reason: `Responders arrived but objectives were unmet: ${unmet || 'none remaining active'}.`, counts: c };
    }
    return null;
  }

  /** Headless deterministic sub-simulation for counterfactual analysis. */
  static simulateFrom(scenario, snapshot, turns, mutateFn = null) {
    const state = new GameState(scenario);
    state.restore(snapshot);
    state.outcome = null;
    state.meta.activePhase = 'PLAYER_INPUT';
    const tm = new TurnManager(state, new EventBus());
    if (mutateFn) mutateFn(state);
    for (let i = 0; i < turns && !state.outcome; i++) tm.commitTurn();
    return state;
  }
}