// Runs under `node --test` and in the browser (tests.html).
const isNode = typeof process !== 'undefined' && !!(process.versions && process.versions.node);
const nodeTest = isNode ? (await import('node:test')).test : null;
export const registry = [];
export const IS_NODE = isNode;

export function test(name, fn) {
  if (nodeTest) nodeTest(name, fn);
  else registry.push({ name, fn });
}

export const assert = {
  ok(v, m) { if (!v) throw new Error(m || 'assert.ok failed'); },
  equal(a, b, m) { if (a !== b) throw new Error(`${m || 'equal'}: ${a} !== ${b}`); },
  close(a, b, tol, m) { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m || 'close'}: ${a} vs ${b}`); },
};