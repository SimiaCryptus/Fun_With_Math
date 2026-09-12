import { World } from './world.js';
import { VOXEL_BY_NAME, VOXEL_TYPES } from './voxel.js';
import { GUARD_TYPES } from '../units/guard.js';

/** Fetch a level JSON file by URL and validate it. */
export async function loadLevel(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load level ${url} (${res.status})`);
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Level ${url} is not valid JSON`);
  }
  return normalizeLevel(json);
}

/** Parse level JSON text (pasted / read from a file) and validate it. */
export function parseLevel(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error(`Level is not valid JSON: ${e.message}`);
  }
  return normalizeLevel(obj);
}

const isInt = (v) => Number.isInteger(v);
const isVec = (v, n) => Array.isArray(v) && v.length === n && v.every(isInt);

/**
 * Deep-clones a raw level object, validates the required fields and fills in defaults so the
 * rest of the game can rely on the shape. Throws an Error with a human-readable message.
 */
export function normalizeLevel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Level must be a JSON object');
  const level = JSON.parse(JSON.stringify(raw));

  if (!isVec(level.size, 3) || level.size.some((n) => n < 1 || n > 256)) {
    throw new Error('"size" must be [width, height, depth] integers between 1 and 256');
  }
  level.name = typeof level.name === 'string' && level.name.trim() ? level.name : 'Untitled Level';
  level.description = typeof level.description === 'string' ? level.description : '';

  const sp = level.spawn;
  if (!sp || !isVec(sp.pos, 3)) throw new Error('"spawn.pos" must be [x, y, z]');
  if (!isVec(sp.dir, 2) || (sp.dir[0] === 0 && sp.dir[1] === 0)) sp.dir = [1, 0];
  sp.count = isInt(sp.count) && sp.count > 0 ? sp.count : 20;
  sp.rate = Number.isFinite(sp.rate) && sp.rate > 0 ? sp.rate : 1.5;

  const o = level.objective;
  if (!o || !isVec(o.from, 3) || !isVec(o.to, 3)) throw new Error('"objective" needs "from" and "to" cells');
  o.type = o.type || 'reach';
  if (o.type !== 'reach') throw new Error(`Unsupported objective type "${o.type}" (the MVP supports "reach")`);
  for (let i = 0; i < 3; i++) {
    const a = Math.min(o.from[i], o.to[i]), b = Math.max(o.from[i], o.to[i]);
    o.from[i] = a;
    o.to[i] = b;
  }
  o.required = isInt(o.required) && o.required > 0 ? o.required : 1;

  level.lethalFall = isInt(level.lethalFall) && level.lethalFall > 0 ? level.lethalFall : 4;
  level.timeLimit = Number.isFinite(level.timeLimit) && level.timeLimit >= 0 ? level.timeLimit : 0;
  level.budget = {
    crates: { ...(level.budget?.crates || {}) },
     signs: { ...(level.budget?.signs || {}) },
    roles: { ...(level.budget?.roles || {}) },
  };
  level.guards = Array.isArray(level.guards)
    ? level.guards
        .filter((g) => g && isVec(g.pos, 3))
         .map((g) => ({
           type: typeof g.type === 'string' && GUARD_TYPES[g.type] ? g.type : 'sentry',
           pos: g.pos,
           dir: isVec(g.dir, 2) ? g.dir : [-1, 0],
         }))
    : [];

  if (level.voxels !== undefined && !Array.isArray(level.voxels?.rle)) {
    throw new Error('"voxels.rle" must be an array of [type, count] pairs');
  }
  if (level.fills !== undefined && !Array.isArray(level.fills)) throw new Error('"fills" must be an array');
  return level;
}

/**
 * Level JSON -> World. Supports:
 *   "voxels": { "rle": [[type, count], ...] }   compact run-length blob (editor export)
 *   "fills":  [{ "type": "dirt", "from": [x,y,z], "to": [x,y,z] }, ...]   hand-authored boxes
 * Fills are applied after the RLE blob, in order, so "air" fills can carve openings.
 */
export function buildWorld(level) {
  const [w, h, d] = level.size;
  const world = new World(w, h, d);

  if (level.voxels && level.voxels.rle) {
    let i = 0;
    for (const run of level.voxels.rle) {
      if (!Array.isArray(run) || run.length !== 2) throw new Error('Malformed run in "voxels.rle"');
      const [type, count] = run;
      if (!VOXEL_TYPES[type]) throw new Error(`Unknown voxel type id ${type} in "voxels.rle"`);
      world.data.fill(type, i, Math.min(i + count, world.data.length));
      i += count;
    }
  }

  for (const f of level.fills || []) {
    const type = VOXEL_BY_NAME[f.type];
    if (type === undefined) throw new Error(`Unknown voxel type "${f.type}" in level "${level.name}"`);
    world.fill(f.from, f.to, type);
  }
  return world;
}

export function encodeWorld(world) {
  const rle = [];
  const data = world.data;
  let i = 0;
  while (i < data.length) {
    const type = data[i];
    let j = i;
    while (j < data.length && data[j] === type) j++;
    rle.push([type, j - i]);
    i = j;
  }
  return rle;
}

/** World -> level JSON (used by the editor / for saving edited terrain). */
export function exportLevel(level, world) {
  const out = { ...level, size: [world.w, world.h, world.d], voxels: { rle: encodeWorld(world) } };
  delete out.fills;
  return out;
}

/** Pretty JSON with the (long) voxel blob kept on a single line. */
export function stringifyLevel(level) {
  const { voxels, ...rest } = level;
  let text = JSON.stringify(rest, null, 2);
  if (voxels) text = text.replace(/\n}$/, `,\n  "voxels": ${JSON.stringify(voxels)}\n}`);
  return text;
}

/** A fresh flat map with a floor, a drop pod on the left and a vault on the right. */
export function newBlankLevel(w = 32, h = 12, d = 12) {
  const mid = Math.floor(d / 2);
  const ox = Math.max(1, w - 5);
  return normalizeLevel({
    name: 'New Level',
    description: '',
    size: [w, h, d],
    lethalFall: 4,
    timeLimit: 0,
    spawn: { pos: [Math.min(2, w - 1), 3, mid], dir: [1, 0], count: 20, rate: 1.5 },
    objective: {
      type: 'reach',
      from: [ox, 3, Math.max(0, mid - 1)],
      to: [Math.min(w - 1, ox + 2), 3, Math.min(d - 1, mid + 1)],
      required: 5,
    },
     budget: {
       crates: { rifle: 1, pickaxe: 1, ladder: 1 },
       signs: { blocker: 2, turnLeft: 1, turnRight: 1, fanOut: 1, divert: 1 },
       roles: { builder: 2 },
     },
    guards: [],
    fills: [
      { type: 'bedrock', from: [0, 0, 0], to: [w - 1, 0, d - 1] },
      { type: 'dirt', from: [0, 1, 0], to: [w - 1, Math.min(2, h - 1), d - 1] },
      { type: 'objective', from: [ox, 2, Math.max(0, mid - 1)], to: [Math.min(w - 1, ox + 2), 2, Math.min(d - 1, mid + 1)] },
    ],
  });
}

// ---- URL sharing (base64url of the UTF-8 JSON, lives in the location hash) ----------------

export function encodeLevelHash(level) {
  const bytes = new TextEncoder().encode(JSON.stringify(level));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLevelHash(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  let bin;
  try {
    bin = atob(padded);
  } catch {
    throw new Error('Shared level data in the URL is corrupt');
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return parseLevel(new TextDecoder().decode(bytes));
}