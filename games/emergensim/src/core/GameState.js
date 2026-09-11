import { Grid3D } from '../spatial/Grid3D.js';
import { keyOf } from '../spatial/Tile.js';

const ROLE_RANK = { STUDENT: 1, BYSTANDER: 1, TEACHER: 3, RESPONDER: 4 };

/** Single deterministic state tree. Everything here is structuredClone-able for snapshots and replays. */
export class GameState {
  constructor(scenario) {
    this.scenario = scenario;
    this.reset();
  }

  reset() {
    const s = this.scenario;
    this.meta = {
      turnNumber: 1,
      activePhase: 'PLAYER_INPUT',
      scenarioId: s.id,
      title: s.title,
      description: s.description || '',
      seed: s.seed ?? 1337,
      mode: s.mode || 'EVACUATE',
      maxTurns: s.maxTurns || s.responderEtaTurns || 30,
      scenarioGoal: s.winConditions,
    };
    this.rngState = this.meta.seed >>> 0;
    this.grid = new Grid3D(s.gridSize, s.mapLayout);

    const pStart = s.player.position;
    this.player = {
      id: 'PLAYER',
      position: { ...pStart },
      actionPoints: { max: 4, current: 4 },
      physicalState: { status: 'ACTIVE', lungIrritation: 0, exposure: 'NONE', slowed: false, disoriented: false, injured: false, carrying: null },
      inventory: [...(s.player.inventory || ['BARRICADE_KIT'])],
      lineOfSight: [],
      visible: new Set(),
      explored: new Set(),
    };

    this.npcs = new Map();
    (s.agents || []).forEach((a, i) => { const npc = this._createNPC(a, i); this.npcs.set(npc.id, npc); });

    this.hazards = { fireCells: new Map(), smokeCells: new Map(), structuralIntegrity: new Map(), threatEntities: [], doorHistory: {} };
    for (const key of this.grid.tiles.keys()) this.hazards.structuralIntegrity.set(key, 1.0);
    (s.initialHazards || []).forEach((h, i) => this._placeHazard(h, i));

    this.social = {
      rumors: [],
      groupCohesion: s.groupCohesion ?? 0.5,
      alarmActive: !!s.alarmActive,
      responderEtaTurns: s.responderEtaTurns ?? 12,
      noiseEvents: [],
      socialLog: [],
    };
    this.telemetryLog = [];
    this.snapshots = [];
    this.outcome = null;
    this._eventSeq = 0;
  }

  _createNPC(agent, index) {
    const role = agent.role || 'STUDENT';
    const key = keyOf(agent.position);
    return {
      id: agent.id || `npc-${index + 1}`,
      name: agent.name || agent.id || `NPC ${index + 1}`,
      role,
      position: { ...agent.position },
      traits: { fear: 0.3, greed: 0.3, trust: 0.5, rage: 0.2, cohesion: 0.5, ...(agent.traits || {}) },
      derived: { stress: 0, confidence: 0, aggression: 0, empathy: 0, riskTolerance: 0 },
      status: 'ACTIVE',
      socialRank: agent.socialRank ?? ROLE_RANK[role] ?? 1,
      physicalState: { lungIrritation: 0, exposure: 'NONE', slowed: false, disoriented: false },
      freezeTurns: 0,
      carriedBy: null,
      beliefs: { blockedExits: new Set(), lastKnownThreat: null },
      visited: new Set([key]),
      lastAction: null,
      lastDialogKey: null,
      lastDialogTurn: -9,
      blockedTurns: 0,
    };
  }

  _placeHazard(h, i) {
    if (h.type === 'THREAT') {
      this.hazards.threatEntities.push({
        id: h.id || `threat-${i + 1}`,
        position: { ...h.position },
        facing: { dx: h.facing?.dx ?? 1, dy: h.facing?.dy ?? 0 },
        state: 'PATROL',
        patrolRoute: (h.patrolRoute || []).map((p) => ({ ...p })),
        patrolIndex: 0,
        targetId: null,
        lastSeen: null,
        lostTurns: 0,
        investigateTarget: null,
        neutralized: false,
      });
      return;
    }
    const key = keyOf(h.position);
    const tile = this.grid.getByKey(key);
    if (!tile) return;
    const intensity = h.intensity ?? 0.6;
    if (h.type === 'FIRE') {
      const fuelMax = tile.material.fuelCapacity || 80;
      this.hazards.fireCells.set(key, { intensity, fuel: fuelMax, fuelMax, burnRate: 6 + 10 * tile.material.flammability, oxygen: 1 });
      tile.temperature = 200 + 700 * intensity;
    } else if (h.type === 'SMOKE') {
      this.hazards.smokeCells.set(key, { density: Math.min(1, intensity) });
    } else if (h.type === 'STRUCTURAL_WEAKNESS') {
      this.hazards.structuralIntegrity.set(key, Math.max(0.05, 1 - intensity));
    }
  }

  /** Deterministic mulberry32 PRNG advanced on the state so replays are exact. */
  random() {
    this.rngState = (this.rngState + 0x6D2B79F5) >>> 0;
    let t = this.rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  log(record) {
    record.id = ++this._eventSeq;
    record.turn = this.meta.turnNumber;
    this.telemetryLog.push(record);
    return record;
  }

  snapshot() {
    return structuredClone({
      meta: this.meta, rngState: this.rngState, tiles: this.grid.tiles, player: this.player, npcs: this.npcs,
      hazards: this.hazards, social: this.social, telemetryLog: this.telemetryLog, outcome: this.outcome, eventSeq: this._eventSeq,
    });
  }

  restore(snap) {
    const c = structuredClone(snap);
    this.meta = c.meta; this.rngState = c.rngState; this.grid.tiles = c.tiles; this.player = c.player;
    this.npcs = c.npcs; this.hazards = c.hazards; this.social = c.social; this.telemetryLog = c.telemetryLog;
    this.outcome = c.outcome; this._eventSeq = c.eventSeq;
  }

  npcAt(key, { includeIncapacitated = true } = {}) {
    for (const npc of this.npcs.values()) {
      if (npc.carriedBy) continue;
      if (npc.status === 'ACTIVE' || (includeIncapacitated && npc.status === 'INCAPACITATED')) {
        if (keyOf(npc.position) === key) return npc;
      }
    }
    return null;
  }

  threatAt(key) {
    return this.hazards.threatEntities.find((t) => !t.neutralized && keyOf(t.position) === key) || null;
  }

  counts() {
    const c = { total: this.npcs.size, active: 0, evacuated: 0, incapacitated: 0, tagged: 0 };
    for (const npc of this.npcs.values()) {
      if (npc.status === 'ACTIVE') c.active++;
      else if (npc.status === 'EVACUATED') c.evacuated++;
      else if (npc.status === 'INCAPACITATED') c.incapacitated++;
      else if (npc.status === 'TAGGED') c.tagged++;
    }
    c.casualties = c.incapacitated + c.tagged;
    return c;
  }
}