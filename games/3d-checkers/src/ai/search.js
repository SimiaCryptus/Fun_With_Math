import { getLegalMoves } from '../engine/moves.js';
import { makeMove, unmakeMove } from '../engine/Board.js';
import { evaluate } from './evaluate.js';

const INF = 1e9, WIN = 1e6;
const EXACT = 0, LOWER = 1, UPPER = 2;
const TIME_UP = Symbol('timeUp');
const now = () => (globalThis.performance ? performance.now() : Date.now());
const keyOf = (m) => m.path.join(',');

function pickEasy(moves) {
  const best = Math.max(...moves.map((m) => m.captured.length));
  const pool = moves.filter((m) => m.captured.length === best);
  return pool[Math.floor(Math.random() * pool.length)];
}

function orderMoves(moves, ttKey) {
  for (const m of moves) {
    m._s = m.captured.length * 1000 + (m.becomesKing ? 500 : 0) + (ttKey && keyOf(m) === ttKey ? 100000 : 0);
  }
  moves.sort((a, b) => b._s - a._s);
}

function negamax(state, depth, alpha, beta, ply, ctx) {
  ctx.nodes++;
  if ((ctx.nodes & 1023) === 0 && now() > ctx.deadline) throw TIME_UP;

  const moves = getLegalMoves(state, state.turn, ctx.rules);
  if (!moves.length) return -WIN + ply;
  const inCapture = moves[0].captured.length > 0;
  // Always extend through forced capture sequences (bounded by maxPly).
  if (depth <= 0 && (!inCapture || ply >= ctx.maxPly)) return evaluate(state);

  const alpha0 = alpha;
  const tt = ctx.tt.get(state.hash);
  if (tt && tt.depth >= depth) {
    if (tt.flag === EXACT) return tt.score;
    if (tt.flag === LOWER) alpha = Math.max(alpha, tt.score);
    else beta = Math.min(beta, tt.score);
    if (alpha >= beta) return tt.score;
  }
  orderMoves(moves, tt?.best);

  let best = -INF, bestKey = null;
  for (const m of moves) {
    const undo = makeMove(state, m);
    let score;
    try { score = -negamax(state, depth - 1, -beta, -alpha, ply + 1, ctx); }
    finally { unmakeMove(state, undo); }
    if (score > best) { best = score; bestKey = keyOf(m); }
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
  ctx.tt.set(state.hash, { depth, score: best, flag, best: bestKey });
  return best;
}

function searchRoot(state, moves, depth, ctx, prevBest) {
  orderMoves(moves, prevBest ? keyOf(prevBest) : null);
  let alpha = -INF, bestMove = moves[0], bestScore = -INF;
  for (const m of moves) {
    const undo = makeMove(state, m);
    let score;
    try { score = -negamax(state, depth - 1, -INF, -alpha, 1, ctx); }
    finally { unmakeMove(state, undo); }
    if (ctx.jitter) score += (Math.random() * 2 - 1) * ctx.jitter;
    if (score > bestScore) { bestScore = score; bestMove = m; if (score > alpha) alpha = score; }
  }
  return { move: bestMove, score: bestScore };
}

/**
 * Choose a move for `state.turn`.
 * @param cfg {{ random?: boolean, maxDepth?: number, timeMs?: number, jitter?: number }}
 */
export function think(state, cfg, rules, onProgress) {
  const moves = getLegalMoves(state, state.turn, rules);
  if (!moves.length) return null;
  if (moves.length === 1) return { move: moves[0], stats: { depth: 0, nodes: 0, score: 0 } };
  if (cfg.random) return { move: pickEasy(moves), stats: { depth: 0, nodes: moves.length, score: 0 } };

  const ctx = {
    rules, tt: new Map(), nodes: 0, maxPly: 48, jitter: cfg.jitter ?? 0,
    deadline: now() + (cfg.timeMs ?? Infinity),
  };
  let best = moves[0], bestScore = 0, depthReached = 0;
  for (let depth = 1; depth <= (cfg.maxDepth ?? 3); depth++) {
    try {
      const r = searchRoot(state, moves, depth, ctx, best);
      best = r.move; bestScore = r.score; depthReached = depth;
      onProgress?.({ depth, nodes: ctx.nodes, score: bestScore });
      if (Math.abs(bestScore) > WIN / 2) break;
    } catch (e) {
      if (e !== TIME_UP) throw e;
      break;
    }
  }
  return { move: best, stats: { depth: depthReached, nodes: ctx.nodes, score: bestScore } };
}