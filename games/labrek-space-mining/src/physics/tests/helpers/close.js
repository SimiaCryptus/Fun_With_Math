// Tolerance helpers for tests (tests may use any Math.*; only src/sim is restricted).
import assert from 'node:assert/strict';

export function close(a, b, tol, msg = '') {
  const d = Math.abs(a - b);
  assert.ok(d <= tol, `${msg} |${a} - ${b}| = ${d} > ${tol}`);
}

export function relClose(a, b, tol, msg = '') {
  const s = Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
  const d = Math.abs(a - b) / s;
  assert.ok(d <= tol, `${msg} rel |${a} - ${b}| = ${d} > ${tol}`);
}

export function closeVec(a, b, tol, msg = '') {
  assert.equal(a.length, b.length, `${msg} length`);
  for (let i = 0; i < a.length; i++) close(a[i], b[i], tol, `${msg}[${i}]`);
}