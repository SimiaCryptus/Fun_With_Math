// §5.3 SUPPORT SOLVE: anchor-based exclusion, latched; face erosion at master
// thresholds (Level 0); synchronous sweeps; provenance; contradictions.
// Extension points: subtree anchors (A10) would add node-level voters in
// computeExclusions; levels > 0 (A5) would replace erodeObservation.
import { compileAll } from './compile.js';
import { cpUpper } from './stats.js';

function snapshot(sweep, obs, excl, nProv) {
  return { sweep, lo: obs.map(o => o.lo.slice()), hi: obs.map(o => o.hi.slice()), excl: excl.slice(), nProv };
}

export function supportSolve(tree, obs, C, prm, opts = {}) {
  const L = tree.leaves.length, N = obs.length, d = tree.d;
  const alphaP = prm.alphaExcl / (L * C);
  const excl = new Int32Array(L);
  const inconsistent = new Set(), contradictions = new Set();
  const depth = new Float64Array(N).fill(Infinity);
  const provDepth = new Float64Array(N).fill(-1);
  const prov = [], snaps = [];
  const maxSweeps = opts.maxSweeps ?? prm.maxSweeps ?? 50;
  const singleStep = !!opts.singleSweep;
  let table = compileAll(tree, obs);
  for (let i = 0; i < N; i++) if (table.start[i + 1] - table.start[i] === 1) depth[i] = 0;
  snaps.push(snapshot(0, obs, excl, 0));
  let sweep = 0, converged = false;

  for (sweep = 1; sweep <= maxSweeps; sweep++) {
    // 1. anchors (depth-limited) and exclusions, frozen for this sweep
    const voters = Array.from({ length: L }, () => []);
    for (let i = 0; i < N; i++) {
      if (table.start[i + 1] - table.start[i] === 1 && depth[i] <= prm.kProp) voters[table.leaf[table.start[i]]].push(i);
    }
    for (let l = 0; l < L; l++) {
      const n = voters[l].length;
      if (n < prm.mMin) continue; // absence of evidence is not evidence of absence
      for (let c = 0; c < C; c++) {
        const bit = 1 << c;
        // partial-label anchors count toward every allowed class (worst case for exclusion)
        let nc = 0;
        for (const a of voters[l]) if (obs[a].Y & bit) nc++;
        const ub = cpUpper(nc, n, alphaP);
        if (ub < prm.tauExcl) excl[l] |= bit;
        else if (excl[l] & bit) inconsistent.add(`${l}:${c}`);
      }
    }
    const frozen = excl.slice();

    // 2. erode faces against frozen exclusions
    let moved = false;
    for (let i = 0; i < N; i++) {
      const s = table.start[i], e = table.start[i + 1];
      if (e - s <= 1) continue;
      const o = obs[i], Y = o.Y;
      let fr = [];
      for (let f = s; f < e; f++) {
        const l = table.leaf[f];
        fr.push({ leaf: l, lo: table.lo[f].slice(), hi: table.hi[f].slice(), adm: (frozen[l] & Y) !== Y });
      }
      if (!fr.some(f => f.adm)) { contradictions.add(i); continue; }
      for (let j = 0; j < d; j++) {
        for (const side of [0, 1]) {
          const cuts = new Set();
          for (const f of fr) {
            for (const v of [f.lo[j], f.hi[j]]) if (v > o.lo[j] && v < o.hi[j]) cuts.add(v);
          }
          const arr = [...cuts].sort((a, b) => a - b);
          if (side === 1) arr.reverse();
          let best = null;
          for (const t of arr) {
            const slab = fr.filter(f => (side === 0 ? f.lo[j] < t : f.hi[j] > t));
            if (slab.every(f => !f.adm)) best = t; else break;
          }
          if (best === null) continue;
          const slab = fr.filter(f => (side === 0 ? f.lo[j] < best : f.hi[j] > best));
          const leaves = [...new Set(slab.map(f => f.leaf))];
          let md = -1;
          const leafProv = leaves.map(l => {
            const an = voters[l].map(a => [a, depth[a]]);
            for (const [, dp] of an) md = Math.max(md, dp);
            return { leaf: l, anchors: an };
          });
          const slabLo = o.lo.slice(), slabHi = o.hi.slice();
          if (side === 0) slabHi[j] = best; else slabLo[j] = best;
          prov.push({ obs: i, dim: j, side, from: side === 0 ? o.lo[j] : o.hi[j], to: best, slabLo, slabHi,
            leaves: leafProv, classes: Y, sweep, lifted: false });
          if (side === 0) {
            o.lo[j] = best;
            fr = fr.filter(f => f.hi[j] > best);
            for (const f of fr) if (f.lo[j] < best) f.lo[j] = best;
          } else {
            o.hi[j] = best;
            fr = fr.filter(f => f.lo[j] < best);
            for (const f of fr) if (f.hi[j] > best) f.hi[j] = best;
          }
          provDepth[i] = Math.max(provDepth[i], md);
          moved = true;
        }
      }
    }

    // 3. recount between sweeps
    table = compileAll(tree, obs);
    for (let i = 0; i < N; i++) {
      if (table.start[i + 1] - table.start[i] === 1 && depth[i] === Infinity) depth[i] = provDepth[i] + 1;
    }
    snaps.push(snapshot(sweep, obs, excl, prov.length));
    if (!moved) { converged = true; break; }
    if (singleStep) break;
  }
  return {
    table, excl, depth, provDepth, prov, snaps, sweeps: sweep, converged,
    contradictions: [...contradictions], inconsistencies: [...inconsistent],
  };
}