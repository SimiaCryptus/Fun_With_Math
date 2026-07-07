// Evaluate an expression AST to an exact number.
//
// Integer-only semantics: division is only legal when it divides exactly.
// This mirrors the "exact-division gating" decision from plan.md.

import { isNum, isOp, isGroup } from './expression.js';

export function evaluate(node) {
  if (isNum(node)) return node.value;
  if (isGroup(node)) return evaluate(node.child);
  if (isOp(node)) {
    const l = evaluate(node.left);
    const r = evaluate(node.right);
    switch (node.op) {
      case '+':
        return l + r;
      case '-':
        return l - r;
      case '*':
        return l * r;
      case '/':
        if (r === 0) throw new Error('Division by zero');
        if (l % r !== 0) {
          throw new Error(`Non-exact division: ${l} / ${r}`);
        }
        return l / r;
      default:
        throw new Error(`Unknown operator: ${node.op}`);
    }
  }
  throw new Error('evaluate: unknown node kind');
}

// Convenience: does `a` evaluate to the same value as `b`?
export function sameValue(a, b) {
  return evaluate(a) === evaluate(b);
}
