import { normaliseFractions, biasScore, shuffle } from './common.js';

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/**
 * k‑colour competitive snake growth (problem.md §4.2).
 *  – each channel is a self‑avoiding walk on the fine grid starting at a bottom‑face inlet
 *  – growth is weighted by persistence (tortuosity), openness (avoid cul‑de‑sacs) and bias field
 *  – a channel stops at its cell budget (volume fraction × fill) and BFS‑routes back to a free
 *    bottom cell for the outlet; if none is reachable it becomes a dead end (reported)
 *  – stuck heads backtrack; abandoned cells become permanent voids (root space)
 * Unit steps ⇒ any two cells of different channels are ≥ pitch apart ⇒ clearance = pitch − Ø.
 */
export function generateMaze(spec, rng) {
  const chans = spec.channels, k = chans.length;
  const p = spec.grid.pitch;
  const { x: dx, y: dy, z: dz } = spec.cartridge.dims;
  const nx = Math.floor(dx / p), ny = Math.floor(dy / p), nz = Math.floor(dz / p);
  if (nx < 2 || ny < 2 || nz < 2) throw new Error('Grid too coarse: reduce pitch or enlarge cartridge');
  const total = nx * ny * nz;
  const origin = [-(nx * p) / 2, -(ny * p) / 2, 0];
  const state = new Int16Array(total).fill(-1);       // -1 free, -2 void, c ≥ 0 channel
  const idx = (i, j, kk) => (kk * ny + j) * nx + i;
  const inb = (i, j, kk) => i >= 0 && j >= 0 && kk >= 0 && i < nx && j < ny && kk < nz;
  const warnings = [];

  const fr = normaliseFractions(chans);
  const budgets = fr.map((f) => Math.max(3, Math.round(f * spec.fill * total)));

  // ---- inlet cells on the bottom face, spread out
  let cands = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) if (i % 2 === 0 && j % 2 === 0) cands.push([i, j]);
  shuffle(cands, rng);
  const inlets = [];
  for (const c of cands) {
    if (inlets.every((q) => Math.max(Math.abs(q[0] - c[0]), Math.abs(q[1] - c[1])) >= 2)) inlets.push(c);
    if (inlets.length === k) break;
  }
  if (inlets.length < k) {
    cands = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) cands.push([i, j]);
    shuffle(cands, rng);
    for (const c of cands) {
      if (inlets.length === k) break;
      if (!inlets.some((q) => q[0] === c[0] && q[1] === c[1])) inlets.push(c);
    }
  }
  if (inlets.length < k) throw new Error('Not enough bottom cells for the inlet ports');

  const paths = chans.map((ch, c) => {
    const cell = [inlets[c][0], inlets[c][1], 0];
    state[idx(...cell)] = c;
    return [cell];
  });
  const done = new Array(k).fill(false), deadEnd = new Array(k).fill(false);
  const notes = chans.map(() => []);
  const straightBonus = chans.map((ch) => 1 + 6 * (1 - ch.tortuosity));
  const BIAS_GAIN = 3;

  const freeNeighbours = (i, j, kk) => {
    let n = 0;
    for (const d of DIRS) { const a = i + d[0], b = j + d[1], c = kk + d[2]; if (inb(a, b, c) && state[idx(a, b, c)] === -1) n++; }
    return n;
  };

  const bfsToBottom = (start) => {
    const s0 = idx(...start);
    const prev = new Int32Array(total).fill(-2);
    prev[s0] = -1;
    const q = [s0];
    let found = -1;
    for (let h = 0; h < q.length && found < 0; h++) {
      const cur = q[h];
      const ci = cur % nx, cj = Math.floor(cur / nx) % ny, ck = Math.floor(cur / (nx * ny));
      for (const d of DIRS) {
        const a = ci + d[0], b = cj + d[1], c = ck + d[2];
        if (!inb(a, b, c)) continue;
        const n = idx(a, b, c);
        if (prev[n] !== -2 || state[n] !== -1) continue;
        prev[n] = cur;
        if (c === 0) { found = n; break; }
        q.push(n);
      }
    }
    if (found < 0) return null;
    const out = [];
    for (let n = found; n !== s0; n = prev[n]) out.push([n % nx, Math.floor(n / nx) % ny, Math.floor(n / (nx * ny))]);
    return out.reverse();
  };

  const finish = (c) => {
    done[c] = true;
    const path = paths[c];
    const head = path[path.length - 1];
    if (head[2] === 0) return;
    const ret = bfsToBottom(head);
    if (ret) {
      for (const cell of ret) { state[idx(...cell)] = c; path.push(cell); }
    } else {
      deadEnd[c] = true;
      notes[c].push(chans[c].deadEndOk ? 'dead‑end (allowed)' : 'could not route outlet back to the manifold — dead‑end tube');
    }
  };

  // ---- competitive growth
  let iter = 0;
  const maxIter = total * 30;
  while (iter++ < maxIter) {
    let best = -1, bestS = -Infinity;
    for (let c = 0; c < k; c++) {
      if (done[c]) continue;
      const s = (budgets[c] - paths[c].length) / budgets[c] + rng() * 0.25;
      if (s > bestS) { bestS = s; best = c; }
    }
    if (best < 0) break;
    const c = best, path = paths[c];
    if (path.length >= budgets[c]) { finish(c); continue; }
    const head = path[path.length - 1];
    const prev = path.length > 1 ? path[path.length - 2] : null;
    const pd = prev ? [head[0] - prev[0], head[1] - prev[1], head[2] - prev[2]] : null;

    const cand = [], wts = [];
    for (const pass of [0, 1]) {
      for (const d of DIRS) {
        if (pass === 0 && path.length === 1 && d[2] !== 1) continue;    // first step: straight up off the port
        const i = head[0] + d[0], j = head[1] + d[1], kk = head[2] + d[2];
        if (!inb(i, j, kk) || state[idx(i, j, kk)] !== -1) continue;
        let w = 1;
        if (pd && d[0] === pd[0] && d[1] === pd[1] && d[2] === pd[2]) w *= straightBonus[c];
        w *= 0.3 + freeNeighbours(i, j, kk);
        const sc = biasScore(chans[c].bias, i / Math.max(nx - 1, 1), j / Math.max(ny - 1, 1), kk / Math.max(nz - 1, 1));
        w *= Math.exp(BIAS_GAIN * (sc - 0.5));
        cand.push([i, j, kk]); wts.push(w);
      }
      if (cand.length || path.length > 1) break;
    }
    if (!cand.length) {
      if (path.length === 1) { notes[c].push('inlet boxed in; channel abandoned'); done[c] = true; deadEnd[c] = true; continue; }
      const dead = path.pop();
      state[idx(...dead)] = -2;                         // permanent void → root space
      continue;
    }
    let r = rng() * wts.reduce((a, b) => a + b, 0), pick = 0;
    for (; pick < wts.length - 1; pick++) { r -= wts[pick]; if (r <= 0) break; }
    path.push(cand[pick]);
    state[idx(...cand[pick])] = c;
  }
  for (let c = 0; c < k; c++) if (!done[c]) finish(c);
  if (iter >= maxIter) warnings.push('maze: iteration cap reached — some channels may be short');

  let used = 0, voids = 0;
  for (let i = 0; i < total; i++) { if (state[i] >= 0) used++; else if (state[i] === -2) voids++; }

  const channels = chans.map((ch, c) => {
    const n = paths[c].length;
    notes[c].unshift(`${n} cells (budget ${budgets[c]})`);
    if (n < 2) notes[c].push('too short — omitted');
    return { id: ch.id, spec: ch, cells: n >= 2 ? paths[c] : null, centreline: [], deadEnd: deadEnd[c], notes: notes[c] };
  });
  return {
    generator: 'maze',
    grid: { pitch: p, dims: [nx, ny, nz], origin },
    channels,
    warnings,
    stats: { cellsUsed: used, cellsTotal: total, voidsMarked: voids },
  };
}