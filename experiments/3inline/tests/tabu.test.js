import assert from 'assert';
import { TabuList } from '../src/core/tabu.js';

describe('TabuList', () => {
  it('detects revisited configurations', () => {
    const t = new TabuList(8, 16);
    const a = new Set([0, 1, 2]);
    assert.strictEqual(t.has(a), false);
    t.add(a);
    assert.strictEqual(t.has(new Set([2, 1, 0])), true, 'order-independent');
  });

  it('evicts oldest beyond capacity', () => {
    const t = new TabuList(8, 2);
    t.add(new Set([0]));
    t.add(new Set([1]));
    t.add(new Set([2])); // evicts {0}
    assert.strictEqual(t.has(new Set([0])), false);
    assert.strictEqual(t.has(new Set([2])), true);
  });

  it('clear empties the list', () => {
    const t = new TabuList(8, 8);
    t.add(new Set([3, 4]));
    t.clear();
    assert.strictEqual(t.has(new Set([3, 4])), false);
  });
});
