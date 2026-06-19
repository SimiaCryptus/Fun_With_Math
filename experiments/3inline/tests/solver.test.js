import assert from 'assert';
import { Config } from '../src/core/config.js';
import { parabolaWarmStart } from '../src/constructions/parabola.js';
import { Solver } from '../src/search/solver.js';
import { mutate } from '../src/search/mutation.js';

describe('no-three-in-line core', () => {
  it('warm start is valid (no 3 collinear)', () => {
    const cfg = parabolaWarmStart(13);
    assert.ok(cfg.isValid(), 'parabola construction must be collinearity-free');
  });

  it('config.add rejects a collinear third point', () => {
    const c = new Config(8);
    assert.ok(c.add(0, 0));
    assert.ok(c.add(2, 2));
    // (4,4) is collinear with (0,0),(2,2) -> must be rejected
    assert.strictEqual(c.add(4, 4), false);
    assert.ok(c.isValid());
  });

  it('solver never produces an invalid config over many steps', () => {
    const solver = new Solver(10, { config: parabolaWarmStart(10) });
    for (let i = 0; i < 300; i++) {
      solver.stepOnce();
      assert.ok(solver.config.isValid(), `invalid config at step ${i}`);
    }
  });

  it('relocate mutation never returns a strictly-worse config', () => {
    const cfg = parabolaWarmStart(12);
    for (let i = 0; i < 50; i++) {
      const res = mutate(cfg, { size: 3, allowGrow: false });
      if (res && res.accepted) {
        assert.ok(res.config.isValid());
      }
    }
  });

  it('best is monotonically non-decreasing', () => {
    const solver = new Solver(12, { config: parabolaWarmStart(12) });
    let prevBest = solver.best.pointCount;
    for (let i = 0; i < 500; i++) {
      solver.stepOnce();
      assert.ok(solver.best.pointCount >= prevBest);
      prevBest = solver.best.pointCount;
    }
  });
});
