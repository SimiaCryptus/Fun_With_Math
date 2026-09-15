import { think } from './search.js';
import { DIFFICULTY } from './difficulty.js';
import { configureBoard, N, MAX_LEVELS } from '../engine/geometry.js';

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type !== 'think') return;
  // Match the main thread's board geometry before generating moves.
  configureBoard(msg.size ?? N, msg.levels ?? MAX_LEVELS);
  const s = msg.state;
  const state = {
    board: new Uint8Array(s.board), turn: s.turn, halfmoveClock: s.halfmoveClock,
    ply: s.ply, hash: s.hash, reps: {},
  };
  const cfg = DIFFICULTY[msg.difficulty] ?? DIFFICULTY.medium;
  const result = think(state, cfg, msg.rules, (p) => self.postMessage({ type: 'progress', id: msg.id, ...p }));
  self.postMessage({ type: 'move', id: msg.id, move: result?.move ?? null, stats: result?.stats ?? null });
};