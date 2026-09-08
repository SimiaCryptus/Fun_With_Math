import { PASS } from '../config.js';
import { GoState } from '../engine/Go.js';

/**
 * Move selection for Go on any tiling.  Pure; runs in the Worker or in Node.
 *
 *  easy   : random non-eye-filling legal move, greedy for captures.
 *  medium : one-ply heuristic (captures, ataris, saving own groups, no self-atari).
 *  hard   : medium's shortlist, then flat Monte-Carlo playouts within the budget.
 *
 * Every level passes once only eye-filling or illegal moves remain, which is
 * how bot games end: the opponent passes back and the board is scored.
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const SHORTLIST = 10;
const pick = (list, rand) => list[Math.floor(rand() * list.length)];

/** `cell` is completely surrounded by `player`'s stones: filling it only loses an eye. */
export function isEye(go, cell, player) {
  const nbs = go.board.cells[cell].neighbors;
  if (!nbs.length) return false;
  for (const nb of nbs) if (go.owner[nb] !== player) return false;
  return true;
}

function heuristic(go, cell, me) {
  const { board, owner } = go;
  let s = 0;
  s += go.capturesAt(cell, me).length * 12;
  let empties = 0, ownLibs = 0, contact = 0;
  for (const nb of board.cells[cell].neighbors) {
    const o = owner[nb];
    if (o === -1) { empties++; continue; }
    contact++;
    const libs = go.group(nb);
    if (o === me) {
      ownLibs += libs - 1;                                 // liberties the merged group keeps
      if (libs === 1) s += 6 + 2 * go.members.length;      // rescues a group in atari
    } else if (libs === 2) {
      s += 4;                                              // puts an enemy group in atari
    }
  }
  const after = empties + ownLibs;                         // rough liberty count afterwards
  if (after <= 1 && s < 12) s -= 15;                       // self-atari without a capture
  else if (after === 2) s -= 2;
  s += Math.min(contact, 2) * 1.5;                         // stay in touch with the fight
  const b = board.bbox;
  const R = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2 || 1;
  const c = board.cells[cell].centroid;
  s += 2 * (1 - Math.hypot(c[0] - board.center[0], c[1] - board.center[1]) / R);
  return s;
}

/** Random play to the end (or a ply cap); 1 = `me` has the largest area, 0.5 tie, 0 loss. */
export function playout(sim, me, rand, maxPlies) {
  const n = sim.n;
  while (!sim.over && sim.plies < maxPlies) {
    const p = sim.turn;
    const start = Math.floor(rand() * n);
    let played = false;
    for (let k = 0; k < n; k++) {
      const c = (start + k) % n;
      if (sim.owner[c] !== -1 || isEye(sim, c, p) || !sim.isLegal(c, p)) continue;
      sim._place(c, p);
      played = true;
      break;
    }
    if (!played) sim.pass();
  }
  const { area } = sim.score();
  let others = -1;
  for (let p = 0; p < sim.players; p++) if (p !== me && area[p] > others) others = area[p];
  return area[me] > others ? 1 : area[me] === others ? 0.5 : 0;
}

/** Returns a cell id or `PASS`. */
export function chooseGoMove(game, { level = 'medium', budgetMs = 300, rand = Math.random } = {}) {
  const go = game.go, me = game.turn;
  const cands = [];
  for (let c = 0; c < go.n; c++) {
    if (go.owner[c] === -1 && !isEye(go, c, me) && go.isLegal(c, me)) cands.push(c);
  }
  if (!cands.length) return PASS;

  if (level === 'easy') {
    const caps = cands.filter(c => go.capturesAt(c, me).length);
    if (caps.length && rand() < 0.8) return pick(caps, rand);
    return pick(cands, rand);
  }

  const scored = cands.map(c => ({ c, s: heuristic(go, c, me) + rand() * 0.5, w: 0, n: 0 }));
  scored.sort((a, b) => b.s - a.s);
  if (level !== 'hard' || budgetMs <= 0) return scored[0].c;

  // hard: flat Monte Carlo over the shortlist, heuristic rank as a prior
  const K = Math.min(scored.length, SHORTLIST);
  const short = scored.slice(0, K);
  const sMin = short[K - 1].s, sMax = short[0].s;
  const sim = new GoState(go.board, go.players);
  const maxPlies = go.plies + 3 * go.n;
  const deadline = now() + budgetMs;
  for (let i = 0; now() < deadline && i < 20000; i++) {
    const cand = short[i % K];
    sim.copyFrom(go);
    sim.play(cand.c);
    cand.w += playout(sim, me, rand, maxPlies);
    cand.n++;
  }
  let best = short[0], bestV = -Infinity;
  for (const cand of short) {
    const prior = sMax > sMin ? (cand.s - sMin) / (sMax - sMin) : 0.5;
    const v = (cand.w + 2 * prior) / (cand.n + 2);
    if (v > bestV) { bestV = v; best = cand; }
  }
  return best.c;
}