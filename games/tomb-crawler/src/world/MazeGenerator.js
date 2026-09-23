// Deterministic "lattice rooms + carved corridors" generation.
//
// Cells with even (lq, lr) are lattice nodes (always floor). Every other cell is a
// connector between two nodes one lattice step (2 cells) apart. A randomized Prim's
// spanning tree over the nodes carves connectors. Each chunk owns its east and south
// border connectors, randomly opens some and always opens at least one per border,
// so the infinite world is fully connected without chunks consulting each other.
import { CONFIG } from '../config.js';
import { Rng, hash32 } from '../core/Rng.js';
import { DIRS, distance } from '../hex/Hex.js';
import { CELL } from './Chunk.js';

const S = CONFIG.CHUNK_SIZE;
export const localIndex = (lq, lr) => lr * S + lq;
export const inChunk = (lq, lr) => lq >= 0 && lq < S && lr >= 0 && lr < S;

export function chunkTier(cq, cr) {
  const d = distance(cq * S + S / 2, cr * S + S / 2, 0, 0);
  return Math.floor(d / CONFIG.DIFFICULTY.tierDistance);
}

function connectorEnds(lq, lr) {
  const oddQ = lq & 1, oddR = lr & 1;
  if (oddQ && !oddR) return [lq - 1, lr, lq + 1, lr];     // E-W axis
  if (!oddQ && oddR) return [lq, lr - 1, lq, lr + 1];     // SE-NW axis
  return [lq - 1, lr + 1, lq + 1, lr - 1];                // SW-NE axis
}

export function generateMaze(worldSeed, cq, cr) {
  const G = CONFIG.GEN;
  const rng = new Rng(hash32(worldSeed, cq, cr, 0x51ed));
  const tier = chunkTier(cq, cr);
  const N = S * S;
  const type = new Uint8Array(N).fill(CELL.WALL);
  const isNode = new Uint8Array(N);
  const reserved = new Uint8Array(N);
  const portal = new Uint8Array(N);
  const pockets = [];
  const isOriginChunk = cq === 0 && cr === 0;

  // 1-2. Fill with wall, nodes are floor.
  const nodes = [];
  for (let lr = 0; lr < S; lr += 2) {
    for (let lq = 0; lq < S; lq += 2) {
      const i = localIndex(lq, lr);
      isNode[i] = 1;
      type[i] = CELL.FLOOR;
      nodes.push(i);
    }
  }

  // Treasure pocket: an interior node excluded from the tree, sealed by cracked walls.
  if (!isOriginChunk && rng.chance(G.pocketChance)) {
    const lq = 2 + 2 * rng.int(0, 5), lr = 2 + 2 * rng.int(0, 5);
    const i = localIndex(lq, lr);
    pockets.push(i);
    reserved[i] = 1;
    for (const [dq, dr] of DIRS) reserved[localIndex(lq + dq, lr + dr)] = 1;
  }

  // 3. Randomized Prim's spanning tree over the node lattice.
  const visited = new Uint8Array(N);
  const start = rng.pick(nodes.filter((i) => !reserved[i]));
  visited[start] = 1;
  const frontier = [];
  const addEdges = (i) => {
    const lq = i % S, lr = (i / S) | 0;
    for (let d = 0; d < 6; d++) frontier.push([lq, lr, d]);
  };
  addEdges(start);
  while (frontier.length) {
    const k = rng.int(0, frontier.length - 1);
    const [lq, lr, d] = frontier[k];
    frontier[k] = frontier[frontier.length - 1];
    frontier.pop();
    const [dq, dr] = DIRS[d];
    const nq = lq + 2 * dq, nr = lr + 2 * dr;
    if (!inChunk(nq, nr)) continue;
    const ni = localIndex(nq, nr);
    if (visited[ni] || reserved[ni]) continue;
    visited[ni] = 1;
    type[localIndex(lq + dq, lr + dr)] = CELL.FLOOR;
    addEdges(ni);
  }

  // Portals: border connectors owned by this chunk (east and south edges).
  const internal = [], boundary = [], east = [], south = [];
  for (let i = 0; i < N; i++) {
    if (isNode[i]) continue;
    const lq = i % S, lr = (i / S) | 0;
    const [aq, ar, bq, br] = connectorEnds(lq, lr);
    const ia = inChunk(aq, ar), ib = inChunk(bq, br);
    if (ia && ib) { internal.push(i); continue; }
    boundary.push(i);
    if (lq === S - 1 && (ia || ib)) east.push(i);
    else if (lr === S - 1 && (ia || ib)) south.push(i);
    if (rng.chance(G.portalChance)) type[i] = CELL.FLOOR;
  }
  if (east.length) type[rng.pick(east)] = CELL.FLOOR;
  if (south.length) type[rng.pick(south)] = CELL.FLOOR;
  for (const i of boundary) if (type[i] === CELL.FLOOR) portal[i] = 1;

  // 4. Loops.
  for (const i of internal) {
    if (type[i] === CELL.WALL && !reserved[i] && rng.chance(G.loopRatio)) type[i] = CELL.FLOOR;
  }

  // 5. Crypt chambers.
  const chamberCells = [];
  const nCh = rng.int(G.chambers[0], G.chambers[1]);
  for (let c = 0; c < nCh; c++) {
    const lq = 2 + 2 * rng.int(0, 5), lr = 2 + 2 * rng.int(0, 5);
    const rad = rng.chance(G.bigChamberChance) ? 2 : 1;
    if (pockets.some((p) => distance(lq, lr, p % S, (p / S) | 0) <= rad + 1)) continue;
    for (let dq = -rad; dq <= rad; dq++) {
      const lo = Math.max(-rad, -dq - rad), hi = Math.min(rad, -dq + rad);
      for (let dr = lo; dr <= hi; dr++) {
        const i = localIndex(lq + dq, lr + dr);
        type[i] = CELL.FLOOR;
        chamberCells.push(i);
      }
    }
  }

  // 6. Cracked walls (scale with distance).
  const crackRatio = Math.min(G.crackedMax, G.crackedBase + G.crackedPerTier * tier);
  for (let i = 0; i < N; i++) {
    if (type[i] !== CELL.WALL || reserved[i]) continue;
    const lq = i % S, lr = (i / S) | 0;
    let adj = false;
    for (const [dq, dr] of DIRS) {
      const q = lq + dq, r = lr + dr;
      if (inChunk(q, r) && type[localIndex(q, r)] === CELL.FLOOR) { adj = true; break; }
    }
    if (adj && rng.chance(crackRatio)) type[i] = CELL.CRACKED;
  }

  // Seal pockets: 1-2 cracked walls, rest solid.
  for (const p of pockets) {
    const lq = p % S, lr = (p / S) | 0;
    const order = rng.shuffle([0, 1, 2, 3, 4, 5]);
    const n = rng.int(1, 2);
    for (let k = 0; k < 6; k++) {
      const [dq, dr] = DIRS[order[k]];
      type[localIndex(lq + dq, lr + dr)] = k < n ? CELL.CRACKED : CELL.WALL;
    }
  }

  // Guaranteed open start chamber around the origin (spans several chunks).
  if (Math.abs(cq) <= 1 && Math.abs(cr) <= 1) {
    for (let i = 0; i < N; i++) {
      const gq = cq * S + (i % S), gr = cr * S + ((i / S) | 0);
      if (distance(gq, gr, 0, 0) <= G.originChamberRadius) type[i] = CELL.FLOOR;
    }
  }

  // 7. Connectivity holds by construction (spanning tree + always-floor nodes);
  // collect dead ends for coin piles.
  const deadEnds = [];
  for (let i = 0; i < N; i++) {
    if (type[i] !== CELL.FLOOR) continue;
    const lq = i % S, lr = (i / S) | 0;
    if (lq === 0 || lr === 0 || lq === S - 1 || lr === S - 1) continue;
    let n = 0;
    for (const [dq, dr] of DIRS) if (type[localIndex(lq + dq, lr + dr)] === CELL.FLOOR) n++;
    if (n === 1) deadEnds.push(i);
  }

  return { type, rng, tier, pockets, chamberCells, deadEnds, portal };
}