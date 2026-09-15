import test from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, NDIRS, STEP, JUMP, isPlayable, toIdx, fromIdx, CX, CY, CZ, configureBoard, N, LEVELS } from '../../src/engine/geometry.js';
import { createState, applyMove, RED, BLACK, RED_MAN, BLACK_MAN, RED_KING, makeMove, unmakeMove } from '../../src/engine/Board.js';
import { getLegalMoves, DEFAULT_RULES } from '../../src/engine/moves.js';
import { createSetup, piecesPerSide } from '../../src/engine/setups.js';
import { toNotation, parseCell, fromNotation, cellName } from '../../src/engine/notation.js';
import { getGameResult, countPieces } from '../../src/engine/status.js';
import { think } from '../../src/ai/search.js';

test('parity colouring gives 256 playable cells with a bijective packed index', () => {
  let count = 0;
  const seen = new Set();
  for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 8; z++) {
    if (!isPlayable(x, y, z)) continue;
    count++;
    const idx = toIdx(x, y, z);
    assert.deepEqual(fromIdx(idx), [x, y, z]);
    seen.add(idx);
  }
  assert.equal(count, CELLS);
  assert.equal(seen.size, CELLS);
});

test('STEP/JUMP tables land on playable cells and are symmetric', () => {
  for (let idx = 0; idx < CELLS; idx++) {
    for (let d = 0; d < NDIRS; d++) {
      const s = STEP[idx * NDIRS + d];
      if (s >= 0) {
        assert.ok(isPlayable(CX[s], CY[s], CZ[s]));
        const back = d ^ 3 === d ? d : (d < 4 ? 3 - d : d < 8 ? 11 - d : 19 - d); // opposite direction
        assert.equal(STEP[s * NDIRS + back], idx);
      }
      const j = JUMP[idx * NDIRS + d];
      if (j >= 0) assert.ok(s >= 0 && isPlayable(CX[j], CY[j], CZ[j]));
    }
  }
});

test('standard setup: 96 men per side and 112 opening moves for Red', () => {
  const state = createState(createSetup('standard'));
  const c = countPieces(state);
  assert.equal(c.red.total, 96);
  assert.equal(c.black.total, 96);
  const moves = getLegalMoves(state, RED);
  assert.equal(moves.length, 112);
  assert.ok(moves.every((m) => m.captured.length === 0 && CY[m.to] === 3));
});

test('multi-jump chain weaving through two level changes is forced and complete', () => {
  const board = new Uint8Array(CELLS);
  board[toIdx(2, 0, 3)] = RED_MAN;         // c14
  board[toIdx(2, 1, 4)] = BLACK_MAN;       // jumped 1
  board[toIdx(3, 3, 5)] = BLACK_MAN;       // jumped 2
  board[toIdx(4, 5, 4)] = BLACK_MAN;       // jumped 3
  board[toIdx(0, 7, 7)] = BLACK_MAN;       // bystander
  const state = createState(board, RED);
  const moves = getLegalMoves(state);
  assert.equal(moves.length, 1);
  const m = moves[0];
  assert.equal(m.captured.length, 3);
  assert.equal(toNotation(m), 'c14xc36xe55xe74');
  assert.equal(m.becomesKing, false);
  const next = applyMove(state, m);
  assert.equal(next.board[toIdx(4, 6, 3)], RED_MAN);
  assert.equal(countPieces(next).black.total, 1);
  assert.equal(next.turn, BLACK);
});

test('kinging ends the move even when a further capture would be available', () => {
  const board = new Uint8Array(CELLS);
  board[toIdx(2, 5, 2)] = RED_MAN;
  board[toIdx(3, 6, 2)] = BLACK_MAN;       // jumped → lands on rank 8 (kinging)
  board[toIdx(5, 6, 2)] = BLACK_MAN;       // would be capturable by the new king
  const state = createState(board, RED);
  const moves = getLegalMoves(state);
  assert.equal(moves.length, 1);
  assert.equal(moves[0].captured.length, 1);
  assert.equal(moves[0].becomesKing, true);
  const next = applyMove(state, moves[0]);
  assert.equal(next.board[toIdx(4, 7, 2)], RED_KING);
});

test('kings move in all 12 directions; forced capture can be disabled', () => {
  const board = new Uint8Array(CELLS);
  const centre = toIdx(3, 3, 3);
  board[centre] = RED_KING;
  const state = createState(board, RED);
  assert.equal(getLegalMoves(state).length, 12);
  board[toIdx(4, 4, 3)] = BLACK_MAN;
  assert.equal(getLegalMoves(state).length, 1);
  const relaxed = getLegalMoves(state, RED, { ...DEFAULT_RULES, forcedCapture: false });
  assert.equal(relaxed.length, 12); // 1 capture + 11 quiet steps
});

test('make/unmake round-trips the state and the hash', () => {
  const state = createState(createSetup('light'));
  const snapshot = new Uint8Array(state.board);
  const hash = state.hash;
  for (const m of getLegalMoves(state)) {
    const undo = makeMove(state, m);
    assert.notEqual(state.hash, hash);
    unmakeMove(state, undo);
    assert.equal(state.hash, hash);
    assert.deepEqual(state.board, snapshot);
    assert.equal(state.turn, RED);
  }
});

test('notation round trip and status detection', () => {
  const state = createState(createSetup('skirmish'));
  const moves = getLegalMoves(state);
  for (const m of moves) assert.equal(fromNotation(toNotation(m), state).from, m.from);
  assert.equal(parseCell('c14'), toIdx(2, 0, 3));
  assert.equal(cellName(toIdx(2, 0, 3)), 'c14');
  assert.equal(parseCell('d25'), -1); // not a dark cell
  assert.equal(getGameResult(state).status, 'playing');

  const board = new Uint8Array(CELLS);
  board[toIdx(0, 7, 0)] = RED_MAN; // lone red man; black to move with no pieces
  const lost = createState(board, BLACK);
  assert.equal(getGameResult(lost).status, 'red_wins');
  assert.equal(getGameResult(lost).reason, 'noPieces');
});

test('AI finds the capturing move and returns a legal move', () => {
  const board = new Uint8Array(CELLS);
  board[toIdx(2, 0, 3)] = RED_MAN;
  board[toIdx(2, 1, 4)] = BLACK_MAN;
  board[toIdx(6, 7, 7)] = BLACK_MAN;
  const state = createState(board, RED);
  const legal = getLegalMoves(state);
  const r = think(state, { maxDepth: 3, timeMs: 1000 }, DEFAULT_RULES);
  assert.ok(legal.some((m) => toNotation(m) === toNotation(r.move)));
  assert.equal(r.move.captured.length, 1);

  const open = createState(createSetup('skirmish'));
  const r2 = think(open, { maxDepth: 2, timeMs: 1000 }, DEFAULT_RULES);
  assert.ok(getLegalMoves(open).some((m) => toNotation(m) === toNotation(r2.move)));
  assert.ok(r2.stats.depth >= 1);
});
test('board size and level count are configurable (6×6×2, 8×8×1) and tables rebuild', () => {
  try {
    configureBoard(6, 2);
    assert.equal(N, 6);
    assert.equal(LEVELS, 2);
    assert.equal(CELLS, 36);
    const seen = new Set();
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 2; z++) {
      if (!isPlayable(x, y, z)) continue;
      const idx = toIdx(x, y, z);
      assert.deepEqual(fromIdx(idx), [x, y, z]);
      seen.add(idx);
    }
    assert.equal(seen.size, 36);
    assert.ok(!isPlayable(6, 1, 0)); // off the 6-wide board
    assert.ok(!isPlayable(1, 0, 2)); // above the 2 levels
    for (let idx = 0; idx < CELLS; idx++) for (let d = 0; d < NDIRS; d++) {
      const s = STEP[idx * NDIRS + d];
      if (s >= 0) assert.ok(s < CELLS && isPlayable(CX[s], CY[s], CZ[s]));
    }
    // "standard" clamps to 2 ranks on a 6-wide board: 2 ranks × 3 cells × 2 levels.
    const state = createState(createSetup('standard'));
    assert.equal(countPieces(state).red.total, piecesPerSide('standard', 6, 2));
    assert.equal(countPieces(state).red.total, 12);
    assert.equal(cellName(toIdx(5, 5, 1)), 'f62');
    assert.equal(parseCell('f62'), toIdx(5, 5, 1));
    // A single level is classic 2D draughts: 32 dark squares, 12 men a side, 7 opening moves.
    configureBoard(8, 1);
    assert.equal(CELLS, 32);
    const flat = createState(createSetup('standard'));
    assert.equal(countPieces(flat).red.total, 12);
    assert.equal(getLegalMoves(flat, RED).length, 7);
  } finally {
    configureBoard(8, 8);
  }
});