import { SWAP } from '../config.js';
import { Evaluator } from './eval.js';
import { Position } from './Position.js';
import { chooseGoMove } from './go.js';

/**
 * Move selection for the three bot levels.  Pure; runs in a Worker or in Node.
 *
 *  easy   : plays on its own shortest path (or blocks / wins when it is one move away), else random.
 *  medium : one-ply greedy on the shortest-path evaluation.
 *  hard   : medium's shortlist, then flat Monte-Carlo playouts within the time budget.
 */
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const MAX_CANDIDATES = 160;
const SHORTLIST = 12;

export const rng = seed => {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
};
const pick = (list, rand) => list[Math.floor(rand() * list.length)];
const shuffle = (list, rand) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** Returns a cell id, `SWAP` (pie rule), or `null` when there is nothing to play. */
export function chooseMove(game, { level = 'medium', budgetMs = 300, seed = 1 } = {}) {
  const rand = rng(seed);
  const legal = game.legalCells();
  if (!legal.length) return null;
  const { board } = game;
  const me = game.turn;
  if (game.canSwap() && shouldSwap(board, game.moves[0])) return SWAP;
   if (game.rules === 'go') return chooseGoMove(game, { level, budgetMs, rand });

  const ev = new Evaluator(board, game.config.crossingMode, game.players);
  const owner = game.owner.slice();
  const mine = ev.pathInfo(owner, me);
  const threats = [];
  for (let p = 0; p < game.players; p++) if (p !== me) threats.push(ev.pathInfo(owner, p));

  if (level === 'easy') return easyMove(legal, mine, threats, rand);

  // candidates: cells on anybody's shortest paths, plus their empty neighbours
  const cand = new Set();
  for (const info of [mine, ...threats]) {
    for (const c of info.cells) {
      cand.add(c);
      for (const nb of ev.adj[c]) if (owner[nb] === -1) cand.add(nb);
    }
  }
  let list = cand.size ? [...cand] : legal;
  if (list.length > MAX_CANDIDATES) list = shuffle(list, rand).slice(0, MAX_CANDIDATES);

  const scored = list.map(c => {
    owner[c] = me;
    const s = ev.score(owner, me) + rand() * 0.5;
    owner[c] = -1;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  if (level !== 'hard' || scored[0].s >= 1e5 || budgetMs <= 0) return scored[0].c;

  // hard: flat Monte Carlo over the greedy shortlist, with the greedy rank as a prior
  const K = Math.min(scored.length, SHORTLIST);
  const cands = scored.slice(0, K).map(x => ({ ...x, w: 0, n: 0 }));
  const sMin = cands[K - 1].s, sMax = cands[0].s;
  const pos = new Position(game);
  const deadline = now() + budgetMs;
  for (let i = 0; now() < deadline && i < 40000; i++) {
    const cand = cands[i % K];
    cand.w += pos.playout(cand.c, me, rand);
    cand.n++;
  }
  let best = cands[0], bestV = -Infinity;
  for (const cand of cands) {
    const prior = sMax > sMin ? (cand.s - sMin) / (sMax - sMin) : 0.5;
    const v = (cand.w + 2 * prior) / (cand.n + 2);
    if (v > bestV) { bestV = v; best = cand; }
  }
  return best.c;
}

function easyMove(legal, mine, threats, rand) {
  if (mine.d === 1 && mine.cells.length && rand() < 0.9) return pick(mine.cells, rand);
  const urgent = threats.filter(t => t.d === 1).flatMap(t => t.cells);
  if (urgent.length && rand() < 0.85) return pick(urgent, rand);
  if (mine.cells.length && rand() < 0.65) return pick(mine.cells, rand);
  return pick(legal, rand);
}

/** Pie rule: a central opening is worth taking. */
function shouldSwap(board, first) {
  const c = board.cells[first];
  if (!c) return false;
  const b = board.bbox;
  const R = Math.max(b.maxX - b.minX, b.maxY - b.minY) / 2;
  const r = Math.hypot(c.centroid[0] - board.center[0], c.centroid[1] - board.center[1]);
  return r < 0.4 * R;
}