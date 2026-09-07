// game.js — pure game logic for 0x800. No DOM, no timers, no globals.
//
// `move` never mutates its input: it returns a new state plus an `events`
// array describing what happened, which the renderer turns into animation.

import { cells, cellCount, key, lines, dir } from './hex.js';
import { nth, randomSeed } from './rng.js';

export const VERSION = 1;
export const WIN_VALUE = 0x800;
export const SPAWN_TWO_CHANCE = 0.1;

/** Uppercase hex label without prefix: 2048 → "800". */
export const hex = (v) => v.toString(16).toUpperCase();

/** Draw the next number from the counted RNG stream (mutates a working copy). */
function rand(s) {
  return nth(s.seed, s.rngCalls++);
}

export function tileAt(state, q, r) {
  return state.tiles.find((t) => t.q === q && t.r === r) || null;
}

export function emptyCells(state) {
  const taken = new Set(state.tiles.map((t) => key(t.q, t.r)));
  return cells(state.radius).filter((c) => !taken.has(key(c.q, c.r)));
}

function spawn(s, events) {
  const empty = emptyCells(s);
  if (empty.length === 0) return null;
  const cell = empty[Math.floor(rand(s) * empty.length)];
  const value = rand(s) < SPAWN_TWO_CHANCE ? 2 : 1;
  const tile = { id: s.nextTileId++, value, q: cell.q, r: cell.r };
  s.tiles.push(tile);
  s.spawnedTotal += value;
  if (events) events.push({ type: 'spawn', id: tile.id, value, to: { q: cell.q, r: cell.r } });
  return tile;
}

/** @typedef {{ id:number, value:number, q:number, r:number }} Tile */

export function createGame({ radius = 2, seed, best = 0, now = Date.now() } = {}) {
  const state = {
    version: VERSION,
    radius,
    seed: (seed ?? randomSeed()) >>> 0,
    rngCalls: 0,
    tiles: /** @type {Tile[]} */ ([]),
    nextTileId: 1,
    score: 0,
    best,
    moves: 0,
    undos: 0,
    startedAt: now,
    elapsedMs: 0,
    won: false,
    keptGoing: false,
    over: false,
    spawnedTotal: 0,
  };
  spawn(state);
  spawn(state);
  return state;
}

export function clone(state) {
  return { ...state, tiles: state.tiles.map((t) => ({ ...t })) };
}

/**
 * Slide every tile in direction `dirName`, merging equal neighbours once.
 * Returns { state, moved, events, gained }. When nothing moves, the input
 * state is returned unchanged (same reference) and no tile spawns.
 */
export function move(state, dirName) {
  const d = dir(dirName);
  const noop = { state, moved: false, events: [], gained: 0 };
  if (state.over) return noop;

  const next = clone(state);
  const byKey = new Map(next.tiles.map((t) => [key(t.q, t.r), t]));
  const events = [];
  const removed = new Set();
  let moved = false;
  let gained = 0;

  for (const line of lines(next.radius, d)) {
    // Compact the line, far edge first. A slot holds the surviving tile and,
    // optionally, the one tile it absorbs (at most one merge per tile).
    const slots = [];
    for (const cell of line) {
      const tile = byKey.get(key(cell.q, cell.r));
      if (!tile) continue;
      const top = slots[slots.length - 1];
      if (top && !top.absorbed && top.tile.value === tile.value) top.absorbed = tile;
      else slots.push({ tile, absorbed: null });
    }

    slots.forEach(({ tile, absorbed }, i) => {
      const target = line[i];
      if (tile.q !== target.q || tile.r !== target.r) {
        moved = true;
        events.push({
          type: 'slide',
          id: tile.id,
          from: { q: tile.q, r: tile.r },
          to: { q: target.q, r: target.r },
        });
        tile.q = target.q;
        tile.r = target.r;
      }
      if (absorbed) {
        moved = true;
        events.push({
          type: 'slide',
          id: absorbed.id,
          from: { q: absorbed.q, r: absorbed.r },
          to: { q: target.q, r: target.r },
        });
        const value = tile.value * 2;
        events.push({
          type: 'merge',
          id: absorbed.id,
          into: tile.id,
          from: tile.value,
          value,
          at: { q: target.q, r: target.r },
        });
        tile.value = value;
        gained += value;
        removed.add(absorbed.id);
      }
    });
  }

  if (!moved) return noop;

  next.tiles = next.tiles.filter((t) => !removed.has(t.id));
  next.score += gained;
  next.moves += 1;
  if (next.score > next.best) next.best = next.score;

  if (!next.won && next.tiles.some((t) => t.value >= WIN_VALUE)) {
    next.won = true;
    events.push({ type: 'win' });
  }

  spawn(next, events);

  if (isOver(next)) {
    next.over = true;
    events.push({ type: 'over' });
  }

  return { state: next, moved: true, events, gained };
}

/** Game over: board full and no two adjacent cells hold equal values. */
export function isOver(state) {
  if (state.tiles.length < cellCount(state.radius)) return false;
  const byKey = new Map(state.tiles.map((t) => [key(t.q, t.r), t]));
  // adjacency is symmetric, so three of the six directions suffice
  const check = [dir('E'), dir('SE'), dir('SW')];
  for (const t of state.tiles) {
    for (const d of check) {
      const n = byKey.get(key(t.q + d.q, t.r + d.r));
      if (n && n.value === t.value) return false;
    }
  }
  return true;
}

export function keepGoing(state) {
  return { ...state, keptGoing: true };
}

export function serialize(state) {
  return JSON.stringify(state);
}

/** Parse a saved game; returns null for garbage or unknown versions. */
export function deserialize(json) {
  try {
    const s = typeof json === 'string' ? JSON.parse(json) : json;
    if (!s || typeof s !== 'object') return null;
    if (s.version !== VERSION) return null;
    if (!Number.isInteger(s.radius) || !Array.isArray(s.tiles)) return null;
    if (
      !s.tiles.every(
        (t) =>
          Number.isInteger(t.id) &&
          Number.isInteger(t.value) &&
          Number.isInteger(t.q) &&
          Number.isInteger(t.r)
      )
    )
      return null;
    return s;
  } catch {
    return null;
  }
}
