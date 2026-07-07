// Player-facing verbs as pure transformations (v2 model).
//
// The tree is a flat sum/product of atoms; verbs operate on atoms and on
// adjacent pairs within a container, not on binary graph branches.
//
// Verbs:
//   split(expr, numId, { into })    - replace a Num with an equal expr
//   swap(expr, aId, bId)            - swap two adjacent members of a sum/prod
//   group(expr, [ids])              - wrap a contiguous run of members
//   ungroup(expr, groupId)          - splice a group's contents back inline
//   combine(expr, aId, bId)         - fold two adjacent atoms into one Num
//   cancel(expr, aId, bId)          - remove an inverse pair (x, -x)/(x, /x)

import {
  num,
  sum,
  product,
  group as mkGroup,
  isNum,
  isSum,
  isProduct,
  isGroup,
  findNode,
  replaceNode,
  cloneWithFreshIds,
  membersOf,
  withMembers,
  negate,
  reciprocate,
} from './expression.js';
import { evaluate } from './value.js';
import { parse } from './serialize.js';

// --- helpers ------------------------------------------------------------

// Signed/reciprocal-aware value of a single atom.
function atomValue(node) {
  return evaluate(node);
}
// Apply an additive/multiplicative inverse to a freshly-parsed replacement.
function negateNode(node) {
  return negate(node);
}
function reciprocateNode(node) {
  return reciprocate(node);
}

function findMemberIndex(container, id) {
  return membersOf(container).findIndex((m) => m.id === id);
}

// Locate the container (sum/product) that directly holds `id`, plus index.
function locateInContainer(expr, id) {
  const found = findNode(expr, id);
  if (!found || !found.parent || !(isSum(found.parent) || isProduct(found.parent))) {
    return null;
  }
  return { container: found.parent, index: found.index, node: found.node };
}

// --- split --------------------------------------------------------------
export function split(expr, numId, { into }) {
  const found = findNode(expr, numId);
  if (!found || !isNum(found.node)) {
    console.warn('[transform] split: target is not a Num', {
      numId,
      into,
      node: found && found.node,
    });
    throw new Error('split: target is not a Num');
  }
  let replacement = typeof into === 'string' ? parse(into) : into;
  replacement = cloneWithFreshIds(replacement);
  console.log('[transform] split begin', {
    numId,
    into,
    targetValue: evaluate(found.node),
    replacementValue: evaluate(replacement),
  });
  // If the target number is negated/reciprocated, the chooser presents
  // options for its bare magnitude. Fold the target's inverse flags onto
  // the replacement so values match.
  const target = found.node;
  if (target.neg) replacement = negateNode(replacement);
  if (target.recip) replacement = reciprocateNode(replacement);
  if (evaluate(replacement) !== evaluate(found.node)) {
    console.warn('[transform] split: replacement value mismatch', {
      targetValue: evaluate(found.node),
      replacementValue: evaluate(replacement),
    });
    throw new Error('split: replacement value does not match');
  }
  // A split must break a number into genuinely "smaller" parts: for
  // a -> b + c we require every part to be strictly smaller in
  // magnitude than a (i.e. Σ parts² < a²). See splitPartsAreSmaller.
  if (!splitPartsAreSmaller(found.node, replacement)) {
    const a = evaluate(found.node);
    const parts = isSum(replacement)
      ? replacement.terms.map((t) => evaluate(t))
      : [evaluate(replacement)];
    const sumSquares = parts.reduce((acc, v) => acc + v * v, 0);
    console.warn('[transform] split rejected: parts not smaller', {
      original: a,
      parts,
      sumSquares,
      aSquared: a * a,
      rule: 'Σ parts² < a²',
      satisfied: sumSquares < a * a,
    });
    throw new Error(
      `split: parts must be smaller (need Σ parts² < a²; got Σ=${sumSquares} vs a²=${a * a})`,
    );
  }
  // Preserve unambiguity by wrapping structured replacements in a group.
  const wrapped = isSum(replacement) || isProduct(replacement) ? mkGroup(replacement) : replacement;
  return replaceNode(expr, numId, wrapped);
}
// Enforce the "smaller numbers" split rule. Only applies to additive
// splits (a -> b + c + ...). Every resulting top-level term must have
// a strictly smaller magnitude than the original (a genuine break-apart),
// and there must be at least two parts.
function splitPartsAreSmaller(original, replacement) {
  const a = evaluate(original);
  if (!isSum(replacement)) return true; // non-additive splits unaffected
  const parts = replacement.terms.map((t) => evaluate(t));
  if (parts.length < 2) {
    console.warn('[transform] splitPartsAreSmaller: need >= 2 parts', { original: a, parts });
    return false;
  }
  // Rule: every part must be strictly smaller in magnitude than the
  // original. For an additive split (Σ parts = a) this is equivalent to
  // Σ parts² < a² whenever no single part exceeds a — but to be precise
  // and robust to signs we check each part's magnitude directly, then
  // corroborate with the sum-of-squares form for logging.
  const maxPart = Math.max(...parts.map((v) => Math.abs(v)));
  const sumSquares = parts.reduce((acc, v) => acc + v * v, 0);
  const eachSmaller = parts.every((v) => Math.abs(v) < Math.abs(a));
  const sumSquaresSmaller = sumSquares < a * a;
  console.log('[transform] splitPartsAreSmaller check', {
    original: a,
    parts,
    maxPartMagnitude: maxPart,
    aMagnitude: Math.abs(a),
    sumSquares,
    aSquared: a * a,
    eachSmaller,
    sumSquaresSmaller,
  });
  // The primary rule is "each part strictly smaller in magnitude".
  return eachSmaller;
}
// --- factorize ----------------------------------------------------------
// Multiplicative split: replace a Num with an equal product expression.
export function factorize(expr, numId, { into }) {
  const found = findNode(expr, numId);
  if (!found || !isNum(found.node)) {
    console.warn('[transform] factorize: target is not a Num', {
      numId,
      into,
      node: found && found.node,
    });
    throw new Error('factorize: target is not a Num');
  }
  let replacement = typeof into === 'string' ? parse(into) : into;
  replacement = cloneWithFreshIds(replacement);
  const target = found.node;
  if (target.neg) replacement = negateNode(replacement);
  if (target.recip) replacement = reciprocateNode(replacement);
  if (evaluate(replacement) !== evaluate(found.node)) {
    console.warn('[transform] factorize: replacement value mismatch', {
      targetValue: evaluate(found.node),
      replacementValue: evaluate(replacement),
    });
    throw new Error('factorize: replacement value does not match');
  }
  const wrapped = isSum(replacement) || isProduct(replacement) ? mkGroup(replacement) : replacement;
  return replaceNode(expr, numId, wrapped);
}

// --- swap ---------------------------------------------------------------
// Swap two adjacent members of the same sum/product.
export function swap(expr, aId, bId) {
  const a = locateInContainer(expr, aId);
  const b = locateInContainer(expr, bId);
  if (!a || !b || a.container !== b.container) {
    throw new Error('swap: targets are not siblings in a container');
  }
  if (isProduct(a.container)) {
    // products are commutative; ok
  } else if (isSum(a.container)) {
    // sums are commutative for signed atoms; ok
  } else {
    throw new Error('swap: unsupported container');
  }
  const members = membersOf(a.container).slice();
  [members[a.index], members[b.index]] = [members[b.index], members[a.index]];
  const next = withMembers(a.container, members);
  return replaceNode(expr, a.container.id, next);
}

// --- group / ungroup ----------------------------------------------------
// Group a contiguous run of members (by id list) inside their container.
export function group(expr, ids) {
  const idList = Array.isArray(ids) ? ids : [ids];
  const first = locateInContainer(expr, idList[0]);
  if (!first) throw new Error('group: target not inside a container');
  const container = first.container;
  const members = membersOf(container);
  const indices = idList.map((id) => findMemberIndex(container, id)).sort((x, y) => x - y);
  if (indices.some((i) => i < 0)) throw new Error('group: ids not all siblings');
  // must be contiguous
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) throw new Error('group: selection not contiguous');
  }
  const run = indices.map((i) => members[i]);
  const inner = isSum(container) ? sum(run) : product(run);
  const wrapped = mkGroup(inner);
  const next = [
    ...members.slice(0, indices[0]),
    wrapped,
    ...members.slice(indices[indices.length - 1] + 1),
  ];
  return replaceNode(expr, container.id, withMembers(container, next));
}

export function ungroup(expr, groupId) {
  const loc = locateInContainer(expr, groupId);
  const found = findNode(expr, groupId);
  if (!found || !isGroup(found.node)) throw new Error('ungroup: target is not a group');
  const grp = found.node;
  if (grp.neg || grp.recip) {
    throw new Error('ungroup: group carries an inverse (distribute first)');
  }
  const child = grp.child;
  // If splicing into a matching container, flatten members inline.
  if (loc) {
    const container = loc.container;
    const members = membersOf(container).slice();
    const inlineMembers =
      (isSum(container) && isSum(child)) || (isProduct(container) && isProduct(child))
        ? membersOf(child)
        : [child];
    members.splice(loc.index, 1, ...inlineMembers);
    const next = withMembers(container, members);
    if (evaluate(next) !== evaluate(expr)) {
      throw new Error('ungroup: would change value');
    }
    return replaceNode(expr, container.id, next);
  }
  // Top-level group: just unwrap.
  const candidate = replaceNode(expr, groupId, child);
  if (evaluate(candidate) !== evaluate(expr)) {
    throw new Error('ungroup: would change value');
  }
  return candidate;
}

// --- combine ------------------------------------------------------------
// Fold two adjacent Num atoms in a sum/product into a single Num.
export function combine(expr, aId, bId) {
  const a = locateInContainer(expr, aId);
  const b = locateInContainer(expr, bId);
  if (!a || !b || a.container !== b.container) {
    throw new Error('combine: targets are not siblings');
  }
  if (Math.abs(a.index - b.index) !== 1) {
    throw new Error('combine: atoms are not adjacent');
  }
  if (!isNum(a.node) || !isNum(b.node)) {
    throw new Error('combine: both operands must be numbers');
  }
  const container = a.container;
  let value;
  if (isSum(container)) {
    value = atomValue(a.node) + atomValue(b.node);
  } else {
    // product: enforce exact integer result
    const prod = atomValue(a.node) * atomValue(b.node);
    if (!Number.isInteger(prod)) throw new Error('combine: non-exact division');
    value = prod;
  }
  const members = membersOf(container).slice();
  const lo = Math.min(a.index, b.index);
  const folded = value < 0 ? num(-value, { neg: true }) : num(value);
  members.splice(lo, 2, folded);
  let next = withMembers(container, members);
  // Collapse a single-member container.
  if (membersOf(next).length === 1) {
    next = membersOf(next)[0];
  }
  return replaceNode(expr, container.id, next);
}

// --- cancel -------------------------------------------------------------
// Remove an inverse pair of adjacent atoms: (x, -x) in a sum -> 0 removed,
// (x, /x) in a product -> 1 removed.
export function cancel(expr, aId, bId) {
  const a = locateInContainer(expr, aId);
  const b = locateInContainer(expr, bId);
  if (!a || !b || a.container !== b.container) {
    throw new Error('cancel: targets are not siblings');
  }
  const container = a.container;
  const va = atomValue(a.node);
  const vb = atomValue(b.node);
  if (isSum(container)) {
    if (va + vb !== 0) throw new Error('cancel: terms do not cancel');
  } else {
    if (va * vb !== 1) throw new Error('cancel: factors do not cancel');
  }
  const members = membersOf(container).slice();
  const lo = Math.min(a.index, b.index);
  members.splice(lo, 2);
  let next;
  if (members.length === 0) {
    next = isSum(container) ? num(0) : num(1);
  } else if (members.length === 1) {
    next = members[0];
  } else {
    next = withMembers(container, members);
  }
  const candidate = replaceNode(expr, container.id, next);
  if (evaluate(candidate) !== evaluate(expr)) {
    throw new Error('cancel: value mismatch (unexpected)');
  }
  return candidate;
}

// Registry so the session layer can dispatch by name.
export const VERBS = { split, factorize, swap, group, ungroup, combine, cancel };
