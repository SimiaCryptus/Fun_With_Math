import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tilings, tilingIds } from '../src/tilings/registry.js';
import { generateBoard } from '../src/tilings/Tiling.js';
import { normalize } from '../src/config.js';
import { Game } from '../src/engine/Game.js';

const rng = seed => {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
};
const shuffled = (n, rand) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const setup = partial => {
  const cfg = normalize(partial, tilingIds);
  const board = generateBoard(tilings[cfg.tiling], cfg);
  return { cfg, board, game: new Game(board, cfg) };
};

/** Brute-force BFS over adjacency + live chords. */
function bfsConnected(game, player) {
  const { board, owner, chords } = game;
  const extra = Array.from({ length: board.cells.length }, () => []);
  for (const ch of board.chords) if (chords.isLive(ch.id)) { extra[ch.a].push(ch.b); extra[ch.b].push(ch.a); }
  const arcs = board.arcs.filter(a => a.owner === player);
  const target = new Set(arcs[1].cells);
  const seen = new Uint8Array(board.cells.length);
  const stack = arcs[0].cells.filter(c => owner[c] === player);
  for (const c of stack) seen[c] = 1;
  while (stack.length) {
    const c = stack.pop();
    if (target.has(c)) return true;
    for (const n of [...board.cells[c].neighbors, ...extra[c]]) {
      if (!seen[n] && owner[n] === player) { seen[n] = 1; stack.push(n); }
    }
  }
  return false;
}

function fillRandom(game, seed) {
  const rand = rng(seed);
  for (const c of shuffled(game.board.cells.length, rand)) {
    if (game.phase !== 'playing') break;
    game.play(c);
  }
}

test('hex: random fills always end with exactly one winner (no draws)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { game } = setup({ tiling: 'hex', outline: 'rhombus', size: 7 });
    fillRandom(game, seed);
    assert.equal(game.phase, 'won', `seed ${seed}`);
    assert.ok(bfsConnected(game, game.winner), 'union-find agrees with BFS');
    assert.ok(!bfsConnected(game, 1 - game.winner), 'loser is not connected');
    assert.ok(game.winningCells.length > 0);
  }
});

test('square + bridge rule: random fills never draw and match BFS', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const { game } = setup({ tiling: 'square', outline: 'square', size: 6, crossingMode: 'bridge' });
    fillRandom(game, seed);
    assert.equal(game.phase, 'won', `seed ${seed}`);
    assert.ok(bfsConnected(game, game.winner));
    assert.ok(game.chords.nonCrossing());
  }
});

test('square + strict: a checkerboard is a draw; bridge mode decides it', () => {
  const order = board => {
    const black = [], white = [];
    for (const c of board.cells) {
      const parity = (Math.round(c.centroid[0]) + Math.round(c.centroid[1])) & 1;
      (parity ? white : black).push(c.id);
    }
    const seq = [];
    for (let i = 0; i < Math.max(black.length, white.length); i++) {
      if (i < black.length) seq.push(black[i]);
      if (i < white.length) seq.push(white[i]);
    }
    return seq;
  };
  const strict = setup({ tiling: 'square', outline: 'square', size: 4, crossingMode: 'strict' });
  for (const c of order(strict.board)) if (strict.game.phase === 'playing') strict.game.play(c);
  assert.equal(strict.game.phase, 'draw');

  const bridge = setup({ tiling: 'square', outline: 'square', size: 4, crossingMode: 'bridge' });
  for (const c of order(bridge.board)) if (bridge.game.phase === 'playing') bridge.game.play(c);
  assert.equal(bridge.game.phase, 'won');
});

test('undo replays deterministically', () => {
  const { game } = setup({ tiling: 'triHex', outline: 'rhombus', size: 5 });
  fillRandom(game, 7);
  const moves = [...game.moves];
  const snapshot = Array.from(game.owner);
  game.undo(); game.undo();
  assert.equal(game.moves.length, moves.length - 2);
  game.play(moves[moves.length - 2]);
  game.play(moves[moves.length - 1]);
  assert.deepEqual(Array.from(game.owner), snapshot);
});