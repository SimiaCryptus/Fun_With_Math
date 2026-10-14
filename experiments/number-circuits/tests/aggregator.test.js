import { test, eq, ok } from './harness.js';
import { Aggregator } from '../src/engine/aggregator.js';
import { complexityTable } from '../src/engine/recurrence.js';
import { minimalTable, spectrum } from '../src/engine/projections.js';
import { treesFor } from '../src/engine/reconstruct.js';

const REF = [1, 2, 3, 4, 5, 5, 6, 6, 6, 7, 8, 7, 8, 8, 8, 8, 9, 8, 9, 9];

test('recurrence matches A005245', () => {
  const t = complexityTable(20);
  eq([...t.C.slice(1)], REF);
});

test('value mode matches A005245', () => {
  const agg = new Aggregator({ N: 20 }).run();
  eq(minimalTable(agg.store).map(r => r.cost), REF);
});

test('value mode matches recurrence up to 1000', () => {
  const N = 1000;
  const agg = new Aggregator({ N }).run();
  const t = complexityTable(N);
  for (const r of minimalTable(agg.store)) eq(r.cost, t.C[r.n], `n=${r.n}`);
  eq(minimalTable(agg.store).length, N);
});

test('full mode spectrum of 6', () => {
  const agg = new Aggregator({ N: 20, K: 8, minimalOnly: false }).run();
  const s = spectrum(agg.store, 6);
  ok(s[5] >= 1 && s[6] >= 1, JSON.stringify(s));
});

test('tree mode: 6 has one canonical minimal tree', () => {
  const agg = new Aggregator({ N: 20, K: 9, mode: 'tree', minimalOnly: false }).run();
  eq(agg.store.get(6, 5).trees, ['(1+1)*(1+1+1)']);
  eq(minimalTable(agg.store).map(r => r.cost), REF);
});

test('reconstruct minimal trees of 6', () => {
  const agg = new Aggregator({ N: 6 }).run();
  eq(treesFor(agg.store, 6, 5).length, 1);
});
test('recurrence with factorial: C(6) = 3', () => eq(complexityTable(6, { fact: true }).C[6], 3));
test('recurrence with exponent: C(8) = 5', () => eq(complexityTable(8, { pow: true }).C[8], 5));
test('value mode with ^ and ! matches recurrence up to 500', () => {
   const N = 500, ops = { pow: true, fact: true };
   const agg = new Aggregator({ N, ops }).run();
   const t = complexityTable(N, ops);
   for (const r of minimalTable(agg.store)) eq(r.cost, t.C[r.n], `n=${r.n}`);
   eq(minimalTable(agg.store).length, N);
});
test('tree mode with factorial: 720 = 3!!', () => {
   const agg = new Aggregator({ N: 720, K: 3, mode: 'tree', ops: { fact: true } }).run();
   ok(agg.store.get(720, 3).trees.includes('(1+1+1)!!'));
});