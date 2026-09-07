// rng.js — mulberry32, seedable and replayable.
//
// mulberry32's internal state advances by a constant addition, so the state
// after n calls is simply seed + n * INC (mod 2^32). That lets `nth(seed, n)`
// reproduce any element of the stream in O(1), which keeps game.js pure:
// a game state only needs to remember `seed` and `rngCalls`.

const INC = 0x6d2b79f5;

function hash(s) {
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Classic stateful mulberry32 generator. */
export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + INC) | 0;
    return hash(seed);
  };
}

/** The n-th (0-based) value of the mulberry32 stream started at `seed`. */
export function nth(seed, n) {
  const s = ((seed | 0) + Math.imul(n + 1, INC)) | 0;
  return hash(s);
}

/** A counted generator: `calls` says how far into the stream we are. */
export function counted(seed, calls = 0) {
  const g = {
    seed: seed >>> 0,
    calls,
    next() {
      return nth(g.seed, g.calls++);
    },
  };
  return g;
}

/** A fresh 32-bit seed from Math.random (only used to start a new game). */
export function randomSeed() {
  return (Math.random() * 0x100000000) >>> 0;
}
