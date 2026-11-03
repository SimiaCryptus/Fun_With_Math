import { describe, it, assert, note } from './run.js';
import { race } from '../src/tree/race.js';
import { makeRng } from '../src/core/rng.js';

// Synthetic candidates: a true gain plus an interval that shrinks on refine.
function fake(trueG, width, rng) {
  let w = width;
  let frozen = false;
  return {
    label: `g=${trueG.toFixed(3)}`,
    family: 'axis',
    get frozen() { return frozen; },
    evaluate: () => ({
      gain: { lo: trueG - w / 2, hi: trueG + w / 2 },
      label: `g=${trueG.toFixed(3)}`,
      family: 'axis',
      trueG,
    }),
    refine() {
      if (w < 1e-6) { frozen = true; return 0; }
      w *= 0.4;
      return 10;
    },
  };
}

describe('15. racing agrees with brute force', () => {
  it('picks the true argmax in the overwhelming majority of nodes', () => {
    const rng = makeRng(2027);
    let agree = 0, total = 0, ties = 0;
    for (let t = 0; t < 300; t++) {
      const k = 2 + rng.int(5);
      const gs = [];
      for (let i = 0; i < k; i++) gs.push(rng.range(-1, 5));
      const states = gs.map((g) => fake(g, rng.range(0.2, 3), rng));
      const r = race(states, { budget: 2000, step: 50 });
      const bestTrue = Math.max(...gs);
      total++;
      if (bestTrue <= 0) { if (!r.winner) agree++; continue; }
      if (r.winner && Math.abs(r.winner.trueG - bestTrue) < 1e-9) agree++;
      else if (r.winner && bestTrue - r.winner.trueG < 0.01) { agree++; ties++; }
    }
    note(`agreement ${agree}/${total} (${ties} near-ties accepted)`);
    assert(agree / total > 0.99, `agreement ${agree / total}`);
  });

  it('rejects every candidate whose G+ is negative', () => {
    const rng = makeRng(5);
    const r = race([fake(-2, 0.1, rng), fake(-5, 0.2, rng)], { budget: 500 });
    assert(r.winner === null, 'should produce no winner');
  });
});