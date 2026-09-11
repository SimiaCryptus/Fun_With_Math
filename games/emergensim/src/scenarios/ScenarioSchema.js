import { createTile, coordKey, keyOf, isTilePassable, MATERIALS } from '../spatial/Tile.js';

export const TILE_TYPES = ['FLOOR', 'WALL', 'DOOR', 'WINDOW', 'STAIR', 'EXIT', 'CONTAINMENT'];
export const HAZARD_TYPES = ['FIRE', 'SMOKE', 'STRUCTURAL_WEAKNESS', 'THREAT'];
export const ROLES = ['STUDENT', 'TEACHER', 'RESPONDER', 'BYSTANDER'];
export const WIN_TYPES = ['EVACUATE_MINIMUM_PERCENT', 'CONTAIN_HAZARD', 'SURVIVE_TURNS', 'PREVENT_CASUALTIES'];
export const MODES = ['EVACUATE', 'LOCKDOWN', 'SHELTER'];
export const EVENT_TYPES = ['AFTERSHOCK', 'WIND_GUST', 'ALARM', 'FIRE', 'SMOKE'];
export const DEFAULT_TRAITS = { fear: 0.3, greed: 0.3, trust: 0.5, rage: 0.2, cohesion: 0.5 };

/** ASCII map legend used by the `floors` shorthand. A space is void (no tile). */
export const LEGEND = {
  '#': { type: 'WALL' },
  '.': { type: 'FLOOR' },
  ',': { type: 'FLOOR', material: 'CARPET' },
  'C': { type: 'CONTAINMENT' },
  'W': { type: 'WINDOW' },
  'S': { type: 'STAIR' },
  'E': { type: 'EXIT' },
  '+': { type: 'DOOR' },
  '/': { type: 'DOOR', doorState: { isOpen: true } },
  'L': { type: 'DOOR', doorState: { isLocked: true } },
};

/** Draft-07 JSON schema (documentation / external tooling). Runtime validation is done by validateScenario(). */
export const SCENARIO_JSON_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'ProtocolScenarioDefinition',
  type: 'object',
  required: ['id', 'title', 'gridSize', 'initialHazards', 'agents', 'winConditions'],
  properties: {
    id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' },
    mode: { type: 'string', enum: MODES }, seed: { type: 'integer' },
    responderEtaTurns: { type: 'integer', minimum: 1 }, maxTurns: { type: 'integer', minimum: 1 },
    groupCohesion: { type: 'number', minimum: 0, maximum: 1 }, alarmActive: { type: 'boolean' },
    gridSize: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' } } },
    floors: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    mapLayout: { type: 'array', items: { type: 'object', properties: { x: { type: 'integer' }, y: { type: 'integer' }, z: { type: 'integer' }, type: { type: 'string', enum: TILE_TYPES }, material: { type: 'string' }, flammability: { type: 'number' }, fuelCapacity: { type: 'number' }, label: { type: 'string' }, doorState: { type: 'object' } } } },
    tileOverrides: { type: 'array' },
    player: { type: 'object', required: ['position'], properties: { position: { type: 'object' }, inventory: { type: 'array', items: { type: 'string' } } } },
    initialHazards: { type: 'array', items: { type: 'object', properties: { type: { type: 'string', enum: HAZARD_TYPES }, position: { type: 'object' }, intensity: { type: 'number' }, facing: { type: 'object' }, patrolRoute: { type: 'array' } } } },
    agents: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, role: { type: 'string', enum: ROLES }, socialRank: { type: 'integer' }, position: { type: 'object' }, traits: { type: 'object' } } } },
    winConditions: { type: 'array', items: { type: 'object', required: ['type', 'targetValue'], properties: { type: { type: 'string', enum: WIN_TYPES }, targetValue: { type: 'number' } } } },
    events: { type: 'array', items: { type: 'object', required: ['turn', 'type'], properties: { turn: { type: 'integer' }, type: { type: 'string', enum: EVENT_TYPES }, magnitude: { type: 'number' }, intensity: { type: 'number' }, position: { type: 'object' }, message: { type: 'string' } } } },
  },
};

const isInt = (v) => Number.isInteger(v);
const hasIntXYZ = (p) => !!p && ['x', 'y', 'z'].every((k) => isInt(p[k]));
const withZ = (p) => (p && typeof p === 'object' ? { ...p, z: p.z ?? 0 } : p);
const clone = (v) => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** Expands ASCII floor plans (array index = z, row index = y, column = x) into mapLayout entries. */
export function layoutFromFloors(floors, legend = LEGEND) {
  const layout = [];
  floors.forEach((rows, z) => {
    if (!Array.isArray(rows)) throw new Error(`floors[${z}] must be an array of strings`);
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        if (ch === ' ') continue;
        const entry = legend[ch];
        if (!entry) throw new Error(`Unknown map glyph "${ch}" at ${x},${y},${z}`);
        layout.push({ x, y, z, ...clone(entry) });
      }
    });
  });
  return layout;
}

/** Merges partial tile definitions (labels, flammability, doorState...) into the layout by coordinate. */
export function applyTileOverrides(layout, overrides) {
  const index = new Map(layout.map((d) => [coordKey(d.x, d.y, d.z ?? 0), d]));
  for (const o of overrides) {
    const ov = withZ(o);
    const key = coordKey(ov.x, ov.y, ov.z);
    const existing = index.get(key);
     if (!existing) { const created = { type: 'FLOOR', ...ov }; layout.push(created); index.set(key, created); continue; }
    const { doorState, ...rest } = ov;
    Object.assign(existing, rest);
    if (doorState) existing.doorState = { ...(existing.doorState || {}), ...doorState };
  }
  return layout;
}

export function inferGridSize(layout) {
  const gs = { x: 0, y: 0, z: 0 };
  for (const d of layout) { gs.x = Math.max(gs.x, d.x + 1); gs.y = Math.max(gs.y, d.y + 1); gs.z = Math.max(gs.z, (d.z ?? 0) + 1); }
  return gs;
}

/**
 * Structural + semantic validation. Returns an array of human-readable problems (empty = valid).
 * Uses Tile.js (createTile / isTilePassable) so spawn checks match engine rules exactly.
 */
export function validateScenario(s) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!s || typeof s !== 'object') return ['scenario must be an object'];
  if (typeof s.id !== 'string' || !s.id) err('id must be a non-empty string');
  if (typeof s.title !== 'string' || !s.title) err('title must be a non-empty string');
  if (!MODES.includes(s.mode)) err(`mode must be one of ${MODES.join(' | ')}`);
  if (s.seed !== undefined && !Number.isFinite(s.seed)) err('seed must be a number');
  if (!(isInt(s.responderEtaTurns) && s.responderEtaTurns > 0)) err('responderEtaTurns must be a positive integer');
  if (!(isInt(s.maxTurns) && s.maxTurns > 0)) err('maxTurns must be a positive integer');
  if (typeof s.groupCohesion === 'number' && (s.groupCohesion < 0 || s.groupCohesion > 1)) err('groupCohesion must be in [0,1]');

  const gs = s.gridSize;
  const gsOk = !!gs && ['x', 'y', 'z'].every((k) => isInt(gs[k]) && gs[k] > 0);
  if (!gsOk) err('gridSize must have positive integer x, y, z');
  if (!Array.isArray(s.mapLayout) || !s.mapLayout.length) { err('mapLayout must be a non-empty array (or provide `floors`)'); return errors; }

  // ---- tiles
  const tiles = new Map();
  s.mapLayout.forEach((d, i) => {
    if (!hasIntXYZ(d)) { err(`mapLayout[${i}] has non-integer coordinates`); return; }
    if (gsOk && (d.x < 0 || d.y < 0 || d.z < 0 || d.x >= gs.x || d.y >= gs.y || d.z >= gs.z)) err(`mapLayout[${i}] (${d.x},${d.y},${d.z}) lies outside gridSize`);
    if (!TILE_TYPES.includes(d.type)) err(`mapLayout[${i}] has unknown type "${d.type}"`);
    if (d.material && !MATERIALS[d.material]) err(`mapLayout[${i}] has unknown material "${d.material}"`);
    if (d.flammability !== undefined && (typeof d.flammability !== 'number' || d.flammability < 0 || d.flammability > 1)) err(`mapLayout[${i}] flammability must be in [0,1]`);
    const tile = createTile(d);
    if (tiles.has(tile.key)) err(`duplicate tile at ${tile.key}`);
    tiles.set(tile.key, tile);
  });
  for (const t of tiles.values()) {
    if (t.type !== 'STAIR') continue;
    const up = tiles.get(coordKey(t.coord.x, t.coord.y, t.coord.z + 1));
    const down = tiles.get(coordKey(t.coord.x, t.coord.y, t.coord.z - 1));
    if (gs && gs.z > 1 && !(up && up.type === 'STAIR') && !(down && down.type === 'STAIR')) err(`STAIR at ${t.key} has no STAIR directly above or below`);
  }

  const tileAt = (p) => (hasIntXYZ(p) ? tiles.get(coordKey(p.x, p.y, p.z)) || null : null);
  const checkPos = (p, label, agentOpts = null) => {
    if (!hasIntXYZ(p)) { err(`${label}: position must have integer x, y, z`); return null; }
    const t = tileAt(p);
    if (!t) { err(`${label}: no tile at ${keyOf(p)}`); return null; }
    if (agentOpts && !isTilePassable(t, agentOpts)) err(`${label}: tile ${t.key} (${t.type}) is not a valid standing position`);
    return t;
  };

  // ---- player & agents
  const occupied = new Map();
  const occupy = (p, who) => {
    if (!hasIntXYZ(p)) return;
    const k = keyOf(p);
    if (occupied.has(k)) err(`${who} starts on the same tile (${k}) as ${occupied.get(k)}`);
    else occupied.set(k, who);
  };
  if (!s.player || typeof s.player !== 'object') err('player is required');
  else {
    checkPos(s.player.position, 'player', { canOpenDoors: false });
    occupy(s.player.position, 'player');
    if (s.player.inventory !== undefined && !Array.isArray(s.player.inventory)) err('player.inventory must be an array');
  }
  if (!Array.isArray(s.agents)) err('agents must be an array');
  else {
    const ids = new Set();
    s.agents.forEach((a, i) => {
      const label = `agents[${i}]${a?.id ? ` (${a.id})` : ''}`;
      if (!a || typeof a !== 'object') { err(`${label} must be an object`); return; }
      if (typeof a.id !== 'string' || !a.id) err(`${label}: id must be a non-empty string`);
      else if (ids.has(a.id)) err(`${label}: duplicate id`); else ids.add(a.id);
      if (a.id === 'PLAYER') err(`${label}: "PLAYER" is a reserved id`);
      if (!ROLES.includes(a.role)) err(`${label}: role must be one of ${ROLES.join(' | ')}`);
      if (a.socialRank !== undefined && !isInt(a.socialRank)) err(`${label}: socialRank must be an integer`);
      for (const [k, v] of Object.entries(a.traits || {})) {
        if (!(k in DEFAULT_TRAITS)) err(`${label}: unknown trait "${k}"`);
        else if (typeof v !== 'number' || v < 0 || v > 1) err(`${label}: trait ${k} must be a number in [0,1]`);
      }
      checkPos(a.position, label, { canOpenDoors: false });
      occupy(a.position, label);
    });
  }

  // ---- hazards
  if (!Array.isArray(s.initialHazards)) err('initialHazards must be an array');
  else s.initialHazards.forEach((h, i) => {
    const label = `initialHazards[${i}]`;
    if (!h || !HAZARD_TYPES.includes(h.type)) { err(`${label}: type must be one of ${HAZARD_TYPES.join(' | ')}`); return; }
    if (h.intensity !== undefined && (typeof h.intensity !== 'number' || h.intensity < 0 || h.intensity > 1)) err(`${label}: intensity must be in [0,1]`);
    if (h.type === 'THREAT') {
      checkPos(h.position, label, { canOpenDoors: true, canForce: true });
      occupy(h.position, label);
      (h.patrolRoute || []).forEach((p, j) => checkPos(p, `${label}.patrolRoute[${j}]`, { canOpenDoors: true, canForce: true }));
      if (h.facing && (typeof h.facing.dx !== 'number' || typeof h.facing.dy !== 'number')) err(`${label}: facing must be { dx, dy }`);
    } else {
      const t = checkPos(h.position, label);
      if (t && h.type === 'FIRE' && t.material.flammability <= 0 && t.type !== 'CONTAINMENT') err(`${label}: FIRE placed on non-flammable ${t.type} at ${t.key}`);
    }
  });

  // ---- objectives
  if (!Array.isArray(s.winConditions) || !s.winConditions.length) err('winConditions must be a non-empty array');
  else s.winConditions.forEach((w, i) => {
    if (!w || !WIN_TYPES.includes(w.type)) { err(`winConditions[${i}]: type must be one of ${WIN_TYPES.join(' | ')}`); return; }
    if (typeof w.targetValue !== 'number') err(`winConditions[${i}]: targetValue must be a number`);
    else if (w.type === 'EVACUATE_MINIMUM_PERCENT' && (w.targetValue < 0 || w.targetValue > 1)) err(`winConditions[${i}]: EVACUATE_MINIMUM_PERCENT targetValue is a fraction in [0,1]`);
    else if (w.targetValue < 0) err(`winConditions[${i}]: targetValue must be >= 0`);
  });
  const needsExit = s.mode === 'EVACUATE' || (s.winConditions || []).some((w) => w?.type === 'EVACUATE_MINIMUM_PERCENT');
  if (needsExit && ![...tiles.values()].some((t) => t.type === 'EXIT')) err('an EVACUATE scenario needs at least one EXIT tile');

  // ---- scheduled events
  if (s.events !== undefined && !Array.isArray(s.events)) err('events must be an array');
  else (s.events || []).forEach((ev, i) => {
    const label = `events[${i}]`;
    if (!ev || !EVENT_TYPES.includes(ev.type)) { err(`${label}: type must be one of ${EVENT_TYPES.join(' | ')}`); return; }
    if (!(isInt(ev.turn) && ev.turn >= 1)) err(`${label}: turn must be an integer >= 1`);
    if (ev.type === 'AFTERSHOCK' && ev.magnitude !== undefined && (typeof ev.magnitude !== 'number' || ev.magnitude < 0 || ev.magnitude > 1)) err(`${label}: magnitude must be in [0,1]`);
    if ((ev.type === 'FIRE' || ev.type === 'SMOKE') && !checkPos(ev.position, label)) { /* reported by checkPos */ }
  });

  return errors;
}

/**
 * Expands shorthand, fills defaults, validates, and returns a self-contained scenario object
 * ready for `new GameState(scenario)`. Throws with all problems listed if invalid.
 */
export function normalizeScenario(def) {
  if (!def || typeof def !== 'object') throw new Error('Scenario definition must be an object');
  const s = clone(def);
  const legend = { ...LEGEND, ...(s.legend || {}) };

  if (!Array.isArray(s.mapLayout) || !s.mapLayout.length) {
    if (!Array.isArray(s.floors)) throw new Error(`Scenario "${s.id}": provide either mapLayout or floors`);
    s.mapLayout = layoutFromFloors(s.floors, legend);
  } else {
    s.mapLayout = s.mapLayout.map(withZ);
  }
  if (Array.isArray(s.tileOverrides)) applyTileOverrides(s.mapLayout, s.tileOverrides);
  if (!s.gridSize) s.gridSize = inferGridSize(s.mapLayout);

  s.description = s.description || '';
  s.mode = s.mode || 'EVACUATE';
  s.seed = Number.isFinite(s.seed) ? s.seed : 1337;
  s.responderEtaTurns = s.responderEtaTurns ?? 12;
  s.maxTurns = s.maxTurns ?? s.responderEtaTurns + 6;
  s.groupCohesion = s.groupCohesion ?? 0.5;
  s.alarmActive = !!s.alarmActive;

  s.player = { inventory: ['BARRICADE_KIT'], ...(s.player || {}), position: withZ(s.player?.position) };
  s.agents = (s.agents || []).map((a, i) => ({
    ...a,
    id: a.id || `npc-${i + 1}`,
    name: a.name || a.id || `NPC ${i + 1}`,
    role: a.role || 'STUDENT',
    position: withZ(a.position),
    traits: { ...DEFAULT_TRAITS, ...(a.traits || {}) },
  }));
  s.initialHazards = (s.initialHazards || []).map((h) => ({
    ...h,
    position: withZ(h.position),
    ...(h.type === 'THREAT' ? { patrolRoute: (h.patrolRoute || []).map(withZ), facing: h.facing || { dx: 1, dy: 0 } } : {}),
  }));
  s.winConditions = s.winConditions || [];
  s.events = [...(s.events || [])].map((e) => (e && e.position ? { ...e, position: withZ(e.position) } : e)).sort((a, b) => (a?.turn ?? 0) - (b?.turn ?? 0));

  const errors = validateScenario(s);
  if (errors.length) throw new Error(`Scenario "${s.id}" is invalid:\n - ${errors.join('\n - ')}`);
  return s;
}