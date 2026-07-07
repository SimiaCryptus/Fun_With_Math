// Which verbs are legal for a given selection of tile/node ids (v2 model).
//
// legalVerbs(expr, selection, allowed?) -> Verb[]
//
// Selection semantics:
//   single Num                          -> split
//   single group (no inverse)           -> ungroup
//   single member of a sum/product      -> group (wrap self)
//   two adjacent Num siblings           -> combine (and cancel if inverse)
//   two adjacent siblings               -> swap, group

import { isNum, isSum, isProduct, isGroup, findNode } from './expression.js';
import { evaluate } from './value.js';

function locate(expr, id) {
  const found = findNode(expr, id);
  if (!found) return null;
  const inContainer =
    found.parent && (isSum(found.parent) || isProduct(found.parent))
      ? { container: found.parent, index: found.index }
      : null;
  return { node: found.node, inContainer };
}

export function legalVerbs(expr, selection, allowed = null, opts = {}) {
  const difficulty = opts.difficulty || 'easy';
  const ids = Array.isArray(selection) ? selection : [selection];
  const verbs = new Set();

  if (ids.length === 1) {
    const loc = locate(expr, ids[0]);
    if (loc) {
      const { node } = loc;
      if (isNum(node)) {
        verbs.add('split');
        verbs.add('factorize');
      }
      if (isGroup(node) && !node.neg && !node.recip) verbs.add('ungroup');
    }
  } else if (ids.length === 2) {
    const a = locate(expr, ids[0]);
    const b = locate(expr, ids[1]);
    if (
      a &&
      b &&
      a.inContainer &&
      b.inContainer &&
      a.inContainer.container === b.inContainer.container
    ) {
      const container = a.inContainer.container;
      const ia = a.inContainer.index;
      const ib = b.inContainer.index;
      // Sums and products are commutative, so any two members of the same
      // container may be paired (swapped/grouped/combined/cancelled),
      // whether or not they are physically adjacent.
      void ia;
      void ib;
      {
        verbs.add('swap');
        verbs.add('group');
        if (isNum(a.node) && isNum(b.node)) {
          if (combineOk(container, a.node, b.node, difficulty)) verbs.add('combine');
          if (cancelOk(container, a.node, b.node)) verbs.add('cancel');
        }
      }
    }
  }

  let result = [...verbs];
  if (allowed) result = result.filter((v) => allowed.includes(v));
  return result;
}

function combineOk(container, a, b, difficulty = 'easy') {
  const va = evaluate(a);
  const vb = evaluate(b);
  let result;
  if (isSum(container)) {
    result = va + vb;
  } else {
    result = va * vb;
    // product: exact integer result only
    if (!Number.isInteger(result)) return false;
  }
  return difficultyAllows(difficulty, [va, vb], result);
}

// Is a number's absolute value factorizable using only the given factors?
function factorizableBy(n, factors) {
  let v = Math.abs(n);
  if (v === 0) return false;
  for (const f of factors) {
    if (f <= 1) continue;
    while (v % f === 0) v /= f;
  }
  return v === 1;
}

// Difficulty gate for a candidate combination.
//   easy   - anything
//   medium - each operand and the result is either magnitude < 10 or
//            factorizable using only 2 and 5
//   hard   - each operand and the result is either magnitude < 5 or
//            factorizable using only 2 and 5
//   custom - each operand and the result is either magnitude < threshold
//            or factorizable using the allowed factors. Parameterized via
//            opts: { threshold, factors }.
export function difficultyAllows(difficulty, operands, result) {
  const vals = [...operands, result];
  if (difficulty === 'easy') return true;
  // Resolve threshold + factors for the named/custom difficulty.
  let threshold;
  let factors;
  if (typeof difficulty === 'object' && difficulty) {
    // Allow passing a parameter object directly.
    threshold = difficulty.threshold;
    factors = difficulty.factors || [2, 5];
  } else if (difficulty === 'medium') {
    threshold = 10;
    factors = [2, 5];
  } else if (difficulty === 'hard') {
    threshold = 5;
    factors = [2, 5];
  } else {
    return true;
  }
  // At least two of the three numbers (both operands and the result)
  // must be below the threshold OR factorizable using only the allowed
  // factors. This lets e.g. 5 + 10 or 1 + 25 combine even when one of
  // the numbers is "ugly".
  const satisfied = vals.filter(
    (v) => Math.abs(v) < threshold || factorizableBy(v, factors),
  ).length;
  return satisfied >= 2;
}

function cancelOk(container, a, b) {
  if (isSum(container)) return evaluate(a) + evaluate(b) === 0;
  return evaluate(a) * evaluate(b) === 1;
}
