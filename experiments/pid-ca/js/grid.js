/**
 * grid.js — spatial structure of the automaton (§7.2).
 *
 * Owns:
 *  - the discrete state buffer (current + next, for double buffering)
 *  - the per-cell controller-state buffers e_(t-1) and I_(t-1)
 *  - diagnostic buffers (last u_t, last e_t) used only by the renderer
 *  - neighbour enumeration under the configured neighbourhood + boundary
 *  - initial-condition population and single-cell editing
 */

/** Deterministic, seedable PRNG (mulberry32). */
export function createRng(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapIndex(v, n) {
  return ((v % n) + n) % n;
}

function reflectIndex(v, n) {
  if (n === 1) return 0;
  const period = 2 * n - 2;
  const p = ((v % period) + period) % period;
  return p < n ? p : period - p;
}

/** Flat [dx, dy, dx, dy, ...] offsets for the configured neighbourhood. */
export function neighborOffsets(neighborhood, radius) {
  const offs = [];
  const r = Math.max(1, radius | 0);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (neighborhood === 'vonNeumann' && Math.abs(dx) + Math.abs(dy) > r) continue;
      offs.push(dx, dy);
    }
  }
  return Int16Array.from(offs);
}

/** The configurable "active" predicate over state values (§4). */
export function makeActivePredicate(name, cardinality) {
  const max = cardinality - 1;
  switch (name) {
    case 'ge2':
      return (s) => s >= 2;
    case 'eqMax':
      return (s) => s === max;
    case 'gt0':
    default:
      return (s) => s > 0;
  }
}

/**
 * N_t(c): number of active neighbours of (x, y) read from `states`.
 * `states` is passed explicitly so callers can guarantee a frozen snapshot.
 */
export function countActiveNeighbors(grid, states, x, y, offsets, boundary, isActive) {
  const w = grid.width;
  const h = grid.height;
  let count = 0;
  for (let k = 0; k < offsets.length; k += 2) {
    let nx = x + offsets[k];
    let ny = y + offsets[k + 1];
    if (boundary === 'toroidal') {
      nx = wrapIndex(nx, w);
      ny = wrapIndex(ny, h);
    } else if (boundary === 'reflective') {
      nx = reflectIndex(nx, w);
      ny = reflectIndex(ny, h);
    } else {
      // 'fixed' → outside cells are permanently inactive
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    }
    if (isActive(states[ny * w + nx])) count++;
  }
  return count;
}

export class Grid {
  constructor(width, height) {
    this.resize(width, height);
  }

  resize(width, height) {
    this.width = Math.max(1, width | 0);
    this.height = Math.max(1, height | 0);
    this.size = this.width * this.height;

    // expressed states
    this.states = new Int8Array(this.size);
    this.nextStates = new Int8Array(this.size);

    // per-cell controller state (the cell's memory)
    this.prevError = new Float32Array(this.size);
    this.nextPrevError = new Float32Array(this.size);
    this.integral = new Float32Array(this.size);
    this.nextIntegral = new Float32Array(this.size);

    // diagnostics (single-buffered; written during a step, read by the renderer)
    this.u = new Float32Array(this.size);
    this.error = new Float32Array(this.size);
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getState(x, y) {
    return this.inBounds(x, y) ? this.states[this.index(x, y)] : 0;
  }

  setState(x, y, value) {
    if (!this.inBounds(x, y)) return;
    this.states[this.index(x, y)] = value | 0;
  }

  /** Atomic swap of current/next buffers (synchronous update semantics, §8). */
  commit() {
    let tmp = this.states;
    this.states = this.nextStates;
    this.nextStates = tmp;
    tmp = this.prevError;
    this.prevError = this.nextPrevError;
    this.nextPrevError = tmp;
    tmp = this.integral;
    this.integral = this.nextIntegral;
    this.nextIntegral = tmp;
  }

  clearControllerState() {
    this.prevError.fill(0);
    this.nextPrevError.fill(0);
    this.integral.fill(0);
    this.nextIntegral.fill(0);
    this.u.fill(0);
    this.error.fill(0);
  }

  clearStates() {
    this.states.fill(0);
    this.nextStates.fill(0);
  }

  clampStates(cardinality) {
    const max = Math.max(0, cardinality - 1);
    for (let i = 0; i < this.size; i++) {
      if (this.states[i] > max) this.states[i] = max;
      if (this.states[i] < 0) this.states[i] = 0;
    }
  }
}

/** Initial-condition population routines (§7.2). */
export function populate(grid, cfg, rng) {
  const maxState = cfg.stateCardinality - 1;
  grid.clearStates();
  const { width, height, states } = grid;

  switch (cfg.initialCondition) {
    case 'empty':
      break;

    case 'singleCell':
      states[grid.index(width >> 1, height >> 1)] = maxState;
      break;

    case 'center': {
      const bw = Math.max(2, Math.floor(width / 6));
      const bh = Math.max(2, Math.floor(height / 6));
      const x0 = (width - bw) >> 1;
      const y0 = (height - bh) >> 1;
      const density = Math.max(0.05, cfg.initialDensity);
      for (let y = y0; y < y0 + bh; y++) {
        for (let x = x0; x < x0 + bw; x++) {
          if (rng() < density) states[grid.index(x, y)] = maxState;
        }
      }
      break;
    }

    case 'stripes':
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (((x >> 2) & 1) === 0) states[grid.index(x, y)] = 1;
        }
      }
      break;

    case 'random':
    default:
      for (let i = 0; i < grid.size; i++) {
        if (rng() < cfg.initialDensity) {
          states[i] = maxState > 1 && rng() < 0.35 ? 2 : 1;
        }
      }
      break;
  }
}
