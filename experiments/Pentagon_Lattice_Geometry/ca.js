// ca.js
// Cellular automaton on the multi-sheeted pentagon lattice.
//
// Each tile has an integer state in [0, numStates). The transition rule
// is "outer-totalistic": the next state of a cell depends only on its
// current state and the multiset (here: count for binary, or sum for
// multi-state) of its 5 neighbors' states.
//
// We support several rule families:
//   - "life":   binary B/S rule, parameterized by birth & survival sets
//               over {0,1,2,3,4,5} (the count of live neighbors).
//   - "parity": next state = sum of neighbor states (mod numStates).
//               A linear rule; produces self-similar fractal patterns.
//   - "cyclic": Greenberg-Hastings / cyclic CA. A cell in state s
//               advances to (s+1) mod numStates iff at least `threshold`
//               neighbors are in state (s+1) mod numStates.
//   - "majority": next state = most common state among self+neighbors
//                 (ties broken toward current state).
//
// Boundary tiles (those with fewer than 5 in-lattice neighbors) treat
// missing neighbors as state 0.

export const RULE_FAMILIES = ['life', 'parity', 'cyclic', 'majority'];
// Extended families:
//   - "threshold":  binary; cell becomes 1 iff live-neighbor count >= k.
//   - "diffusion":  next state = round(mean(self + neighbors)).
//   - "sheetflow":  anyonic-style; uses (sheet index of neighbors) mod n.
//   - "xor":        binary; next state = XOR of all neighbor states.
//   - "langton":    Langton's Ant. One or more "ants" walk the lattice; at
//                   each step an ant turns based on the current cell state,
//                   flips that cell (cycling through numStates), then moves
//                   forward to a neighbor. On an n-neighbor tile, "turning"
//                   means choosing the next/previous edge slot relative to
//                   the ant's incoming heading.
export const ALL_RULE_FAMILIES = [
  ...RULE_FAMILIES,
  'threshold',
  'diffusion',
  'sheetflow',
  'xor',
  'langton',
];

// Parse a "B/S" string like "B3/S23" into two Sets. For pentagons the
// counts live in {0,1,2,3,4,5}.
export function parseLifeRule(str) {
  const birth = new Set();
  const survive = new Set();
  if (!str) return { birth, survive };
  const m = str.toUpperCase().match(/B([0-9]*)\/?S([0-9]*)/);
  if (!m) return { birth, survive };
  for (const ch of m[1]) {
    const n = parseInt(ch, 10);
    if (n >= 0 && n <= 5) birth.add(n);
  }
  for (const ch of m[2]) {
    const n = parseInt(ch, 10);
    if (n >= 0 && n <= 5) survive.add(n);
  }
  return { birth, survive };
}

export function lifeRuleToString(birth, survive) {
  const b = [...birth].sort((a, b) => a - b).join('');
  const s = [...survive].sort((a, b) => a - b).join('');
  return `B${b}/S${s}`;
}
// Distinct colours used to render multiple Langton ants.
export const ANT_COLORS = [
  '#ff4d6d',
  '#4dd2ff',
  '#ffd24d',
  '#7ee787',
  '#c792ea',
  '#ff9e64',
  '#56b6c2',
  '#e06c75',
];
// Parse a turn ruleset string like "RL", "LLRR", or "RNL" into an array of
// turn operations. Each character maps to a relative rotation and whether
// the ant moves forward this step:
//   R = turn right (+1)        L = turn left (-1)
//   U = reverse (≈180°)        N = no turn / straight (0)
//   S = stay (don't move)      digits 0-9 = explicit rotation amount
export function parseTurnString(str) {
  const ops = [];
  if (!str) str = 'RL';
  for (const ch of str.toUpperCase()) {
    switch (ch) {
      case 'R':
        ops.push({ turn: 1, move: true });
        break;
      case 'L':
        ops.push({ turn: -1, move: true });
        break;
      case 'U':
        ops.push({ turn: 'reverse', move: true });
        break;
      case 'N':
        ops.push({ turn: 0, move: true });
        break;
      case 'S':
        ops.push({ turn: 0, move: false });
        break;
      default: {
        const d = parseInt(ch, 10);
        if (!Number.isNaN(d)) ops.push({ turn: d, move: true });
      }
    }
  }
  if (ops.length === 0) ops.push({ turn: 1, move: true }, { turn: -1, move: true });
  return ops;
}

export class CA {
  constructor(lattice, opts = {}) {
    this.lattice = lattice;
    this.numStates = opts.numStates ?? 2;
    this.family = opts.family ?? 'life';
    // life rule defaults: B3/S23-ish adapted for 5-neighbor.
    // A reasonable starting point on pentagons: B2/S23.
    this.lifeRule = opts.lifeRule ?? parseLifeRule('B2/S23');
    this.cyclicThreshold = opts.cyclicThreshold ?? 1;
    this.threshold = opts.threshold ?? 2;
    const n = lattice.tiles.length;
    this.state = new Uint8Array(n);
    this.next = new Uint8Array(n);
    this.generation = 0;
    // Langton's Ant state. Each ant: { tile, edge } where `edge` is the
    // raw neighbor slot index the ant is currently heading toward (its
    // "facing" direction). Ants are seeded lazily on first step / seeding.
    this.ants = [];
    // Programmable turmite ruleset + chirality flag.
    this.turnOps = parseTurnString(opts.turnString ?? 'RL');
    this.antMirror = opts.antMirror ?? false;
  }

  setNumStates(n) {
    this.numStates = Math.max(2, Math.min(16, n | 0));
    // clamp existing state values
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] >= this.numStates) this.state[i] = this.numStates - 1;
    }
  }

  setFamily(f) {
    if (ALL_RULE_FAMILIES.includes(f)) this.family = f;
  }

  setLifeRule(str) {
    this.lifeRule = parseLifeRule(str);
  }

  setCyclicThreshold(t) {
    this.cyclicThreshold = Math.max(1, Math.min(5, t | 0));
  }
  setThreshold(t) {
    this.threshold = Math.max(0, Math.min(5, t | 0));
  }
  // Set the Langton/turmite turn ruleset. The number of colours the ant
  // cycles through is the length of the ruleset, so grow numStates to match
  // (so each colour has a defined turn op and the renderer shows them all).
  setTurnString(str) {
    this.turnOps = parseTurnString(str);
    const need = this.turnOps.length;
    if (need > this.numStates) this.setNumStates(need);
  }
  // Toggle chirality (mirror all turns left<->right).
  setAntMirror(on) {
    this.antMirror = !!on;
  }
  // Number of colours an ant cycles a cell through. Bound below by the
  // ruleset length (one op per colour) and by 2.
  antStateCount() {
    return Math.max(2, Math.max(this.turnOps.length, this.numStates));
  }

  clear() {
    this.state.fill(0);
    this.generation = 0;
    this.ants = [];
  }

  randomize(density = 0.3, seed = null) {
    let rand = Math.random;
    if (seed !== null) {
      // simple LCG for reproducibility
      let s = seed | 0 || 1;
      rand = () => {
        s = (s * 1664525 + 1013904223) | 0;
        return ((s >>> 0) % 1000000) / 1000000;
      };
    }
    for (let i = 0; i < this.state.length; i++) {
      if (rand() < density) {
        this.state[i] = 1 + Math.floor(rand() * (this.numStates - 1));
      } else {
        this.state[i] = 0;
      }
    }
    this.generation = 0;
  }

  // Seed only the origin tile (and optionally a small neighborhood) live.
  seedPoint(tileIdx = 0, value = 1) {
    this.clear();
    if (tileIdx >= 0 && tileIdx < this.state.length) {
      this.state[tileIdx] = value % this.numStates;
    }
    // For Langton's Ant, the "seed" is the ant's starting position rather
    // than a live cell. Place a single ant at tileIdx facing edge slot 0.
    this.placeAnt(tileIdx, 0);
  }
  // Seed a named shape centered on tileIdx (default origin).
  seedShape(shape, tileIdx = 0) {
    this.clear();
    const tiles = this.lattice.tiles;
    if (tileIdx < 0 || tileIdx >= tiles.length) return;
    const v = 1;
    const nb = tiles[tileIdx].neighbors;
    const nEdges = nb.length;
    switch (shape) {
      case 'single': {
        this.state[tileIdx] = v;
        break;
      }
      case 'pair': {
        this.state[tileIdx] = v;
        for (let k = 0; k < nEdges; k++) {
          if (nb[k] !== null) {
            this.state[nb[k]] = v;
            break;
          }
        }
        break;
      }
      case 'triple': {
        this.state[tileIdx] = v;
        let set = 0;
        for (let k = 0; k < nEdges && set < 2; k++) {
          if (nb[k] !== null) {
            this.state[nb[k]] = v;
            set++;
          }
        }
        break;
      }
      case 'petal': {
        for (let k = 0; k < nEdges; k++) {
          if (nb[k] !== null) this.state[nb[k]] = v;
        }
        break;
      }
      case 'all5': {
        this.state[tileIdx] = v;
        for (let k = 0; k < nEdges; k++) {
          if (nb[k] !== null) this.state[nb[k]] = v;
        }
        break;
      }
      case 'ring': {
        // depth-2 shell: neighbors-of-neighbors that aren't origin
        // or origin's direct neighbors
        const direct = new Set();
        direct.add(tileIdx);
        for (let k = 0; k < nEdges; k++) {
          if (nb[k] !== null) direct.add(nb[k]);
        }
        for (let k = 0; k < nEdges; k++) {
          const ni = nb[k];
          if (ni === null) continue;
          const nb2 = tiles[ni].neighbors;
          for (let j = 0; j < nb2.length; j++) {
            const nj = nb2[j];
            if (nj !== null && !direct.has(nj)) {
              this.state[nj] = v;
            }
          }
        }
        break;
      }
      case 'line': {
        // Walk in one direction (always edge 0) for n steps.
        this.state[tileIdx] = v;
        let cur = tileIdx;
        for (let step = 0; step < Math.max(nEdges - 1, 4); step++) {
          const next = tiles[cur].neighbors[0];
          if (next === null) break;
          this.state[next] = v;
          cur = next;
        }
        break;
      }
      default: {
        this.state[tileIdx] = v;
      }
    }
  }

  setCell(idx, value) {
    if (idx < 0 || idx >= this.state.length) return;
    this.state[idx] = ((value % this.numStates) + this.numStates) % this.numStates;
  }

  toggleCell(idx) {
    if (idx < 0 || idx >= this.state.length) return;
    // For binary-feeling editing: cycle through states 0..numStates-1.
    this.state[idx] = (this.state[idx] + 1) % this.numStates;
  }
  // ── Langton's Ant helpers ──────────────────────────────────────────────
  // Place (or replace) a single ant. Use addAnt() to keep multiple.
  placeAnt(tileIdx, edge = 0) {
    if (tileIdx < 0 || tileIdx >= this.state.length) {
      this.ants = [];
      return;
    }
    this.ants = [
      {
        tile: tileIdx,
        edge: this.firstValidEdge(tileIdx, edge),
        id: 0,
        color: ANT_COLORS[0],
        steps: 0,
      },
    ];
  }
  addAnt(tileIdx, edge = 0) {
    if (tileIdx < 0 || tileIdx >= this.state.length) return;
    const id = this.ants.length;
    this.ants.push({
      tile: tileIdx,
      edge: this.firstValidEdge(tileIdx, edge),
      id,
      color: ANT_COLORS[id % ANT_COLORS.length],
      steps: 0,
    });
  }
  // Seed a small swarm of ants arranged around a tile, each facing a
  // different edge so they fan out into distinct patterns.
  placeAntSwarm(tileIdx, count = 4) {
    this.clear();
    const t = this.lattice.tiles[tileIdx];
    if (!t) return;
    const nE = t.neighbors.length;
    this.ants = [];
    const k = Math.max(1, Math.min(count, 8));
    for (let i = 0; i < k; i++) {
      const id = i;
      this.ants.push({
        tile: tileIdx,
        edge: this.firstValidEdge(tileIdx, Math.round((i * nE) / k)),
        id,
        color: ANT_COLORS[id % ANT_COLORS.length],
        steps: 0,
      });
    }
  }
  // Return true if a Langton ant currently occupies this tile.
  antOn(tileIdx) {
    for (let i = 0; i < this.ants.length; i++) {
      if (this.ants[i].tile === tileIdx) return true;
    }
    return false;
  }
  // Find an edge slot at `tile` that has a real neighbor, starting the
  // search at `preferred` and wrapping around. Respects activeEdges
  // (e.g. pinwheel inactive hypotenuse) when present.
  firstValidEdge(tile, preferred = 0) {
    const t = this.lattice.tiles[tile];
    const nb = t.neighbors;
    const nE = nb.length;
    for (let s = 0; s < nE; s++) {
      const e = (((preferred + s) % nE) + nE) % nE;
      if (t.activeEdges && !t.activeEdges[e]) continue;
      if (nb[e] !== null) return e;
    }
    return preferred; // no valid edge; ant will be a no-op
  }

  step() {
    const tiles = this.lattice.tiles;
    const s = this.state;
    const out = this.next;
    const ns = this.numStates;
    // Number of edges/neighbours varies by polygon type.
    const nEdges = (i) => tiles[i].neighbors.length;
    // Langton's Ant is an agent-based rule: it mutates `state` in place and
    // advances ants, so it doesn't use the double-buffered totalistic path.
    if (this.family === 'langton') {
      this.stepLangton();
      this.generation++;
      return;
    }
    switch (this.family) {
      case 'life': {
        const { birth, survive } = this.lifeRule;
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let live = 0;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null && s[ni] !== 0) live++;
          }
          if (s[i] !== 0) {
            out[i] = survive.has(live) ? 1 : 0;
          } else {
            out[i] = birth.has(live) ? 1 : 0;
          }
        }
        break;
      }
      case 'parity': {
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let sum = 0;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null) sum += s[ni];
          }
          out[i] = sum % ns;
        }
        break;
      }
      case 'cyclic': {
        const thr = this.cyclicThreshold;
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          const target = (s[i] + 1) % ns;
          let count = 0;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null && s[ni] === target) count++;
          }
          out[i] = count >= thr ? target : s[i];
        }
        break;
      }
      case 'majority': {
        const counts = new Int32Array(ns);
        for (let i = 0; i < tiles.length; i++) {
          counts.fill(0);
          counts[s[i]]++;
          const nbrs = tiles[i].neighbors;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null) counts[s[ni]]++;
          }
          // pick max; ties favor current state
          let best = s[i];
          let bestC = counts[s[i]];
          for (let v = 0; v < ns; v++) {
            if (counts[v] > bestC) {
              bestC = counts[v];
              best = v;
            }
          }
          out[i] = best;
        }
        break;
      }
      case 'threshold': {
        const thr = this.threshold;
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let live = 0;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null && s[ni] !== 0) live++;
          }
          out[i] = live >= thr ? 1 : 0;
        }
        break;
      }
      case 'diffusion': {
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let sum = s[i];
          let cnt = 1;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null) {
              sum += s[ni];
              cnt++;
            }
          }
          out[i] = Math.round(sum / cnt) % ns;
        }
        break;
      }
      case 'sheetflow': {
        // Anyonic-style rule: cell adopts (self + sum of neighbor
        // sheet indices) mod numStates. Couples CA dynamics to the
        // multi-sheet topology of the lattice.
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let sum = s[i];
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null && s[ni] !== 0) {
              sum += tiles[ni].sheet;
            }
          }
          out[i] = ((sum % ns) + ns) % ns;
        }
        break;
      }
      case 'xor': {
        for (let i = 0; i < tiles.length; i++) {
          const nbrs = tiles[i].neighbors;
          let acc = 0;
          for (let k = 0; k < nbrs.length; k++) {
            const ni = nbrs[k];
            if (ni !== null) acc ^= s[ni];
          }
          out[i] = acc % ns;
        }
        break;
      }
      default: {
        for (let i = 0; i < tiles.length; i++) out[i] = s[i];
      }
    }
    // swap
    const tmp = this.state;
    this.state = out;
    this.next = tmp;
    this.generation++;
  }
  // One generation of Langton's Ant(s).
  //
  // Programmable turmite rule (generalised to n-neighbour tiles):
  //   1. Read the current cell colour `c` under the ant.
  //   2. Look up the turn op for colour `c` in the turn string. The op
  //      specifies a relative rotation (R=+1, L=-1, U=reverse, N=straight,
  //      S=stay, digits=explicit) and whether the ant moves this step.
  //   3. Flip the cell colour: c -> (c + 1) mod antStateCount().
  //   4. Move forward one tile along the new heading (unless op.move is
  //      false). If that edge has no neighbour, the ant rotates until it
  //      finds a valid edge (it never leaves the lattice).
  //
  // All ants are advanced from a snapshot of headings so order within a
  // single generation is consistent.
  stepLangton() {
    if (this.ants.length === 0) return;
    const tiles = this.lattice.tiles;
    const ops = this.turnOps;
    const cycle = this.antStateCount();
    const moves = [];
    for (let i = 0; i < this.ants.length; i++) {
      const ant = this.ants[i];
      const tile = ant.tile;
      const t = tiles[tile];
      const nb = t.neighbors;
      const nE = nb.length;
      const c = this.state[tile] | 0;
      // Look up the programmable op for this colour (wrap into range).
      const op = ops[((c % ops.length) + ops.length) % ops.length];
      // Resolve the relative turn into an integer edge rotation.
      let turn;
      if (op.turn === 'reverse') {
        turn = Math.floor(nE / 2);
      } else {
        turn = op.turn | 0;
      }
      if (this.antMirror) turn = -turn;
      // New heading = current edge rotated by `turn`, then snapped to the
      // nearest valid (in-lattice, active) edge.
      let heading = (((ant.edge + turn) % nE) + nE) % nE;
      heading = this.firstValidEdge(tile, heading);
      // Flip the cell colour through the rule's colour cycle.
      this.state[tile] = (c + 1) % cycle;
      ant.steps = (ant.steps || 0) + 1;
      // If this op says "stay", don't move — just keep the new heading.
      if (op.move === false) {
        moves.push({ ...ant, tile, edge: heading });
        continue;
      }
      // Move forward.
      const dest = nb[heading];
      if (dest === null || dest === undefined) {
        // Stuck: stay put but keep the new heading.
        moves.push({ ...ant, tile, edge: heading });
        continue;
      }
      // After arriving at `dest`, choose an incoming heading for the next
      // step. We pick the edge slot on `dest` that points back where we
      // came from, so "forward" continues roughly straight. Find the slot
      // on dest whose neighbour is the tile we just left, then that is the
      // ant's "behind"; facing is the opposite-ish slot. Simplest stable
      // choice: use the matching back-edge as the new edge baseline.
      const dt = tiles[dest];
      const dnb = dt.neighbors;
      let backEdge = 0;
      for (let k = 0; k < dnb.length; k++) {
        if (dnb[k] === tile) {
          backEdge = k;
          break;
        }
      }
      // Face roughly forward by stepping past the back-edge (opposite-ish
      // slot) so straight-ahead motion continues across the new tile.
      const dnE = dnb.length;
      const forwardEdge = this.firstValidEdge(
        dest,
        (((backEdge + Math.floor(dnE / 2)) % dnE) + dnE) % dnE
      );
      moves.push({ ...ant, tile: dest, edge: forwardEdge });
    }
    this.ants = moves;
  }

  // Diagnostics
  population() {
    let p = 0;
    for (let i = 0; i < this.state.length; i++) if (this.state[i] !== 0) p++;
    return p;
  }

  stateCounts() {
    const counts = new Array(this.numStates).fill(0);
    for (let i = 0; i < this.state.length; i++) counts[this.state[i]]++;
    return counts;
  }

  // Sheet-resolved live populations (handy for studying holonomy/transport).
  populationBySheet() {
    const by = new Map();
    const tiles = this.lattice.tiles;
    for (let i = 0; i < tiles.length; i++) {
      if (this.state[i] === 0) continue;
      const sh = tiles[i].sheet;
      by.set(sh, (by.get(sh) || 0) + 1);
    }
    return by;
  }
  // Expose the per-ant colour list (used by the renderer).
  antColors() {
    return ANT_COLORS;
  }
}
