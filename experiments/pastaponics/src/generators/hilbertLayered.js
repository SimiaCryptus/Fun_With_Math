import { hilbertPath2D } from '../hilbert.js';
import { normaliseFractions, biasDirection } from './common.js';

/**
 * Layered Hilbert router ("2.5D", Eller‑style stacking; problem.md §4.1 + §4.2 table).
 *
 * NOTE on the parity‑sublattice idea (§4.1 option 4): running one Hilbert curve per parity
 * class of a 2×2×2 block is NOT clearance‑safe — every sub‑lattice step passes straight over
 * an intermediate fine cell that belongs to another class, so segments of different channels
 * become collinear. Everything here therefore uses unit steps on the fine grid: any two cells
 * owned by different channels are ≥ one pitch apart, so clearance = pitch − Ø exactly. An
 * occupancy assertion enforces this at generation time.
 *
 * Layout per horizontal layer z (grid coordinates before shifting, x→ right, y→ back):
 *   y ∈ [0, m·N)   one or two stacks of N×N Hilbert squares; path enters at (0,0), leaves at (W−1,0)
 *   y = m·N        cross‑over row between the stacks (or to the return column)
 *   y = −1         riser columns  L_c = (−1−c, −1) on the left,  R_c = (W+c, −1) on the right
 *   y = −2         outlet columns below the riser columns
 *   y = 0, x∉[0,W) stub rows from the square corners to the columns
 * Layers are dealt to channels by weighted round‑robin (volume fraction × top/bottom bias).
 * A channel alternates direction on consecutive layers so its risers alternate sides;
 * the inlet comes up the left column, the outlet goes down the y = −2 column on the side
 * where the last layer ends. All ports emerge on the bottom (manifold) face.
 */
export function generateHilbertLayered(spec) {
  const chans = spec.channels;
  const k = chans.length;
  const p = spec.grid.pitch;
  const { x: dx, y: dy, z: dz } = spec.cartridge.dims;
  const nxAvail = Math.floor(dx / p), nyAvail = Math.floor(dy / p), nz = Math.floor(dz / p);
  const warnings = [];

  // ---- choose square size N, stack count m, one or two stacks (largest N that fits)
  let N = 0, m = 0, two = false;
  for (let n = 64; n >= 2; n /= 2) {
    const mm = Math.floor((nyAvail - 3) / n);
    if (mm < 1) continue;
    if (2 * n + 2 * k <= nxAvail) { N = n; m = mm; two = true; break; }
    if (n + 1 + 2 * k <= nxAvail) { N = n; m = mm; two = false; break; }
  }
  if (!N) {
    throw new Error(`Cartridge too small for layered Hilbert with ${k} channels at pitch ${p} mm: ` +
      `need ≥ ${(3 + 2 * k) * p} × ${5 * p} mm in plan (reduce pitch, channels, or enlarge cartridge).`);
  }
  if (nz < k) warnings.push(`hilbert: only ${nz} layers for ${k} channels — some channels get no layer`);

  const layer = layerPath(N, m, two);
  const W = two ? 2 * N : N + 1;
  const nx = W + 2 * k, ny = m * N + 3;
  const origin = [-(nx * p) / 2, -(ny * p) / 2, 0];
  const occ = new Int16Array(nx * ny * nz).fill(-1);
  const toIdx = (x, y, z) => (z * ny + (y + 2)) * nx + (x + k);

  // ---- deal layers to channels (deficit round‑robin with mild bias weighting)
  const fr = normaliseFractions(chans);
  const assigned = new Array(k).fill(0), cum = new Array(k).fill(0);
  const layersOf = chans.map(() => []);
  for (let z = 0; z < nz; z++) {
    const t = (z + 0.5) / nz;
    const w = chans.map((c, i) => fr[i] * (1 + 0.8 * biasDirection(c.bias) * (t - 0.5)));
    const Wsum = w.reduce((a, b) => a + b, 0) || 1;
    let best = 0, bestScore = -Infinity;
    for (let i = 0; i < k; i++) {
      cum[i] += w[i] / Wsum;
      const s = cum[i] - assigned[i];
      if (s > bestScore) { bestScore = s; best = i; }
    }
    assigned[best]++;
    layersOf[best].push(z);
  }

  // ---- build cell paths
  const channels = chans.map((ch, c) => {
    const L = layersOf[c];
    const cells = [], notes = [];
    if (!L.length) {
      notes.push('no layer assigned (volume fraction too small for this grid)');
      return { id: ch.id, spec: ch, cells: null, centreline: [], deadEnd: true, notes };
    }
    const push = (x, y, z) => {
      const id = toIdx(x, y, z);
      if (occ[id] !== -1) throw new Error(`internal: cell collision at (${x},${y},${z}) between channels ${occ[id]} and ${c}`);
      occ[id] = c;
      cells.push([x + k, y + 2, z]);
    };
    const Lx = -1 - c, Rx = W + c;
    for (let z = 0; z <= L[0]; z++) push(Lx, -1, z);                 // inlet riser
    for (let j = 0; j < L.length; j++) {
      const z = L[j], forward = j % 2 === 0, last = j === L.length - 1;
      const fromX = forward ? Lx : Rx, toX = forward ? Rx : Lx;
      if (j > 0) for (let zz = L[j - 1] + 1; zz <= z; zz++) push(fromX, -1, zz);   // riser between layers
      if (forward) for (let x = Lx; x <= -1; x++) push(x, 0, z);
      else for (let x = Rx; x >= W; x--) push(x, 0, z);
      const seq = forward ? layer : [...layer].reverse();
      for (const [hx, hy] of seq) push(hx, hy, z);
      if (forward) for (let x = W; x <= Rx; x++) push(x, 0, z);
      else for (let x = -1; x >= Lx; x--) push(x, 0, z);
      push(toX, -1, z);
      if (last) {
        push(toX, -2, z);
        for (let zz = z - 1; zz >= 0; zz--) push(toX, -2, zz);        // outlet riser down to plate
      }
    }
    notes.push(`${L.length} layer(s), ${cells.length} cells`);
    return { id: ch.id, spec: ch, cells, deadEnd: false, notes };
  });

  let used = 0;
  for (let i = 0; i < occ.length; i++) if (occ[i] >= 0) used++;
  return {
    generator: 'hilbert',
    grid: { pitch: p, dims: [nx, ny, nz], origin },
    channels,
    warnings,
    stats: { cellsUsed: used, cellsTotal: occ.length, N, stacks: two ? 2 : 1, squaresPerStack: m },
  };
}

/** One layer: start (0,0) → end (W−1, 0); unit steps; W = 2N (two stacks) or N+1. */
function layerPath(N, m, twoStacks) {
  const up = hilbertPath2D(N).map(([x, y]) => [y, x]);      // transpose: (0,0) → (0,N−1)
  const pts = [];
  for (let s = 0; s < m; s++) for (const [x, y] of up) pts.push([x, y + s * N]);
  const W = twoStacks ? 2 * N : N + 1;
  for (let x = 0; x < W; x++) pts.push([x, m * N]);           // cross‑over row
  if (twoStacks) {
    const down = up.map(([x, y]) => [2 * N - 1 - x, y]).reverse();   // (2N−1,N−1) → (2N−1,0)
    for (let s = m - 1; s >= 0; s--) for (const [x, y] of down) pts.push([x, y + s * N]);
  } else {
    for (let y = m * N - 1; y >= 0; y--) pts.push([N, y]);   // return column
  }
  return pts;
}