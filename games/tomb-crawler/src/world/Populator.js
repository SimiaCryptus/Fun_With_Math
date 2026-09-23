import { CONFIG } from '../config.js';
import { CELL, ITEM, PICKUP } from './Chunk.js';
import { generateMaze, localIndex, inChunk } from './MazeGenerator.js';
import { DIRS, distance } from '../hex/Hex.js';

const S = CONFIG.CHUNK_SIZE;

export function rollPickup(rng, tier) {
  const W = CONFIG.PICKUP_WEIGHTS;
  const w = (e) => Math.max(e.min ?? 0, e.base + e.perTier * tier);
  return rng.weighted([
    [PICKUP.BOMB, w(W.bomb)],
    [PICKUP.INCENDIARY, w(W.incendiary)],
    [PICKUP.SHAPED, w(W.shapedCharge)],
    [PICKUP.MULT2, w(W.mult2)],
    [PICKUP.MULT3, w(W.mult3)],
  ]);
}

function rollEnemy(rng, dist) {
  const entries = Object.entries(CONFIG.ENEMIES)
    .filter(([, c]) => dist >= c.minDist)
    .map(([name, c]) => [name, c.weight]);
  return rng.weighted(entries);
}

// Full deterministic base state of a chunk: layout + coins + pickups + spawn markers.
export function buildChunk(worldSeed, cq, cr) {
  const m = generateMaze(worldSeed, cq, cr);
  const { rng, type, tier } = m;
  const G = CONFIG.GEN;
  const N = S * S;
  const oq = cq * S, or = cr * S;
  const item = new Uint8Array(N);
  const pickup = new Uint8Array(N);
  const isPocket = new Uint8Array(N);
  for (const p of m.pockets) isPocket[p] = 1;
  const open = (i) => type[i] === CELL.FLOOR;

  // Coins.
  const density = rng.range(G.coinDensity[0], G.coinDensity[1]);
  const floorCells = [];
  for (let i = 0; i < N; i++) {
    if (!open(i) || isPocket[i]) continue;
    floorCells.push(i);
    if (rng.chance(density)) item[i] = ITEM.COIN;
  }

  // Coin piles, preferring chambers and dead ends.
  const pileCands = rng.shuffle(
    [...new Set([...m.chamberCells, ...m.deadEnds])].filter((i) => open(i) && !isPocket[i]),
  );
  const nPiles = rng.int(G.piles[0], G.piles[1]);
  for (let k = 0; k < nPiles && k < pileCands.length; k++) item[pileCands[k]] = ITEM.PILE;

  // Treasure pockets.
  for (const p of m.pockets) {
    if (rng.chance(0.55)) item[p] = ITEM.PILE;
    else pickup[p] = rollPickup(rng, tier);
  }

  // Pickups, never adjacent to a portal.
  const nearPortal = (i) => {
    if (m.portal[i]) return true;
    const lq = i % S, lr = (i / S) | 0;
    for (const [dq, dr] of DIRS) {
      const q = lq + dq, r = lr + dr;
      if (inChunk(q, r) && m.portal[localIndex(q, r)]) return true;
    }
    return false;
  };
  const pickCands = rng.shuffle(floorCells.filter((i) => {
    const lq = i % S, lr = (i / S) | 0;
    return lq > 0 && lr > 0 && lq < S - 1 && lr < S - 1 && !nearPortal(i);
  }));
  let nPick = rng.int(G.pickups[0], G.pickups[1]);
  if (rng.chance(Math.min(0.5, tier * G.extraPickupPerTier))) nPick++;
  let pc = 0;
  for (let k = 0; k < nPick && pc < pickCands.length; k++, pc++) {
    const i = pickCands[pc];
    pickup[i] = rollPickup(rng, tier);
    item[i] = ITEM.NONE;
  }
  if (rng.chance(G.ankhChance) && pc < pickCands.length) {
    const i = pickCands[pc++];
    pickup[i] = PICKUP.ANKH;
    item[i] = ITEM.NONE;
  }

  // Origin chunk: empty start cell, one free bomb.
  if (cq === 0 && cr === 0) {
    item[localIndex(0, 0)] = ITEM.NONE;
    const b = localIndex(2, 0);
    pickup[b] = PICKUP.BOMB;
    item[b] = ITEM.NONE;
  }

  // Enemy spawn markers.
  const D = CONFIG.DIFFICULTY;
  const spawns = [];
  const count = Math.min(D.maxEnemiesPerChunk, Math.floor(1 + tier * D.enemiesPerTier + rng.float()));
  for (const i of rng.shuffle(floorCells.slice())) {
    if (spawns.length >= count) break;
    if (pickup[i]) continue;
    const q = oq + (i % S), r = or + ((i / S) | 0);
    const d = distance(q, r, 0, 0);
    if (d < G.originSafeRadius) continue;
    spawns.push({ q, r, type: rollEnemy(rng, d) });
  }

  return { type, item, pickup, spawns, tier };
}