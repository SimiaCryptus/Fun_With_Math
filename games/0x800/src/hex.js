// hex.js — pure hex-grid math for 0x800. No DOM, no state.
//
// Axial coordinates (q, r) on a pointy-top grid, with the implicit cube
// coordinate s = -q - r (so q + r + s === 0). The board is a hexagon of
// hexagons with radius N; cell count is 3N² + 3N + 1.

export const SQRT3 = Math.sqrt(3);

/**
 * The six move directions, ordered by screen angle (clockwise, y-down).
 * Each direction leaves exactly one cube coordinate constant, which is the
 * "line" grouping used by the move algorithm.
 */
export const DIRS = Object.freeze(
  [
    { name: 'E', q: 1, r: 0, angle: 0, key: 'KeyD', glyph: '→', label: 'east' },
    { name: 'SE', q: 0, r: 1, angle: 60, key: 'KeyC', glyph: '↘', label: 'south-east' },
    { name: 'SW', q: -1, r: 1, angle: 120, key: 'KeyZ', glyph: '↙', label: 'south-west' },
    { name: 'W', q: -1, r: 0, angle: 180, key: 'KeyA', glyph: '←', label: 'west' },
    { name: 'NW', q: 0, r: -1, angle: 240, key: 'KeyW', glyph: '↖', label: 'north-west' },
    { name: 'NE', q: 1, r: -1, angle: 300, key: 'KeyE', glyph: '↗', label: 'north-east' },
  ].map((d) => Object.freeze(d))
);

const BY_NAME = new Map(DIRS.map((d) => [d.name, d]));

/** Look up a direction by name; throws on unknown names. */
export function dir(name) {
  const d = BY_NAME.get(name);
  if (!d) throw new Error(`unknown direction: ${name}`);
  return d;
}

/** Canonical string key for a cell. */
export const key = (q, r) => `${q},${r}`;

export const cellCount = (radius) => 3 * radius * radius + 3 * radius + 1;

export const inBoard = (q, r, radius) =>
  Math.abs(q) <= radius && Math.abs(r) <= radius && Math.abs(q + r) <= radius;

export const distance = (a, b) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - (b.q + b.r))) / 2;

export const isRim = (cell, radius) =>
  Math.max(Math.abs(cell.q), Math.abs(cell.r), Math.abs(cell.q + cell.r)) === radius;

export const axialToCube = ({ q, r }) => ({ q, r, s: -q - r });
export const cubeToAxial = ({ q, r }) => ({ q, r });

const cellCache = new Map();

/**
 * All cells of a radius-N board in canonical order: row-major by r, then q.
 * The returned array (and its cells) are frozen and shared — do not mutate.
 */
export function cells(radius) {
  let list = cellCache.get(radius);
  if (!list) {
    list = [];
    for (let r = -radius; r <= radius; r++) {
      const qMin = Math.max(-radius, -r - radius);
      const qMax = Math.min(radius, -r + radius);
      for (let q = qMin; q <= qMax; q++) list.push(Object.freeze({ q, r }));
    }
    list = Object.freeze(list);
    cellCache.set(radius, list);
  }
  return list;
}

export function neighbor(cell, d) {
  return { q: cell.q + d.q, r: cell.r + d.r };
}

/** In-board neighbours of a cell. */
export function neighbors(cell, radius) {
  return DIRS.map((d) => neighbor(cell, d)).filter((c) => inBoard(c.q, c.r, radius));
}

/**
 * Cube dot product of a cell with a direction. Every step in direction d
 * increases it by exactly 2, so it is a monotone ordering along each line.
 */
export function dot(cell, d) {
  const s = -cell.q - cell.r;
  const ds = -d.q - d.r;
  return cell.q * d.q + cell.r * d.r + s * ds;
}

/** The cube coordinate that stays constant while moving in direction d. */
export function invariant(cell, d) {
  if (d.r === 0) return cell.r; // E / W
  if (d.q === 0) return cell.q; // NW / SE
  return -cell.q - cell.r; // NE / SW (s)
}

const lineCache = new Map();

/**
 * Partition the board into lines parallel to direction d. Each line is
 * ordered far-edge-first (the cell tiles slide *toward* comes first).
 * Result is frozen and shared — do not mutate.
 */
export function lines(radius, d) {
  const ck = `${radius}:${d.name}`;
  let result = lineCache.get(ck);
  if (result) return result;

  const groups = new Map();
  for (const c of cells(radius)) {
    const inv = invariant(c, d);
    if (!groups.has(inv)) groups.set(inv, []);
    groups.get(inv).push(c);
  }
  result = Object.freeze(
    [...groups.keys()]
      .sort((a, b) => a - b)
      .map((k) => Object.freeze(groups.get(k).sort((a, b) => dot(b, d) - dot(a, d))))
  );
  lineCache.set(ck, result);
  return result;
}

/** Cells exactly k steps from the origin, walking clockwise. */
export function ring(k) {
  if (k === 0) return [{ q: 0, r: 0 }];
  const out = [];
  let c = { q: DIRS[4].q * k, r: DIRS[4].r * k };
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < k; j++) {
      out.push(c);
      c = neighbor(c, DIRS[i]);
    }
  }
  return out;
}

/** Rings 0..radius concatenated — a spiral covering the whole board. */
export function spiral(radius) {
  const out = [];
  for (let k = 0; k <= radius; k++) out.push(...ring(k));
  return out;
}

/** Pixel centre of a cell for a pointy-top hex of circumradius `size`. */
export function toPixel(q, r, size) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/** Bounding box of a radius-N board drawn with hexes of circumradius `size`. */
export function boardSize(radius, size) {
  return { width: size * SQRT3 * (2 * radius + 1), height: size * (3 * radius + 2) };
}
