// Player-facing verbs as pure transformations.
//
// Every transformation returns a NEW tree and is value-preserving by
// construction. Where a transformation cannot legally apply it throws;
// legality.js is responsible for only offering legal verbs to the UI.
//
// Verbs:
//   split(expr, numId, { into })       - replace a Num with an equal expr
//   swap(expr, aId, bId)                - swap operands of a commutative op
//   group(expr, opId)                   - wrap an op in explicit parens
//   ungroup(expr, groupId)              - remove redundant parens
//   combine(expr, opId)                 - fold "a <op> b" into one Num
//   cancel(expr, opId)                  - remove an inverse pair -> identity

import {
    num, op, group as mkGroup,
    isNum, isOp, isGroup,
    findNode, replaceNode, cloneWithFreshIds, COMMUTATIVE, INVERSE,
} from './expression.js';
import {evaluate} from './value.js';
import {parse, serialize} from './serialize.js';

// --- split --------------------------------------------------------------
// `into` may be an AST node or a string (parsed). It must evaluate to the
// same value as the target number.
export function split(expr, numId, {into}) {
    const found = findNode(expr, numId);
    if (!found || !isNum(found.node)) {
        throw new Error('split: target is not a Num');
    }
    let replacement = typeof into === 'string' ? parse(into) : into;
// Fresh ids so a re-used template subtree cannot collide.
    replacement = cloneWithFreshIds(replacement);
    if (evaluate(replacement) !== found.node.value) {
        throw new Error('split: replacement value does not match');
    }
// A split introduces structure, so wrap in a group to keep precedence
// unambiguous within the surrounding expression.
    const wrapped = isOp(replacement) ? mkGroup(replacement) : replacement;
    return replaceNode(expr, numId, wrapped);
}

// --- swap ---------------------------------------------------------------
// Swaps the operands of a commutative operator (id points at the op node).
export function swap(expr, opId) {
    const found = findNode(expr, opId);
    if (!found || !isOp(found.node)) {
        throw new Error('swap: target is not an operator');
    }
    const node = found.node;
    if (!COMMUTATIVE.has(node.op)) {
        throw new Error(`swap: ${node.op} is not commutative`);
    }
    const swapped = {...node, left: node.right, right: node.left};
    return replaceNode(expr, opId, swapped);
}

// --- group / ungroup ----------------------------------------------------
export function group(expr, opId) {
    const found = findNode(expr, opId);
    if (!found || !isOp(found.node)) {
        throw new Error('group: target is not an operator');
    }
    return replaceNode(expr, opId, mkGroup(found.node));
}

export function ungroup(expr, groupId) {
    const found = findNode(expr, groupId);
    if (!found || !isGroup(found.node)) {
        throw new Error('ungroup: target is not a group');
    }
// Ungrouping is only value-safe if it doesn't change how the surrounding
// operators bind. The in-memory tree already encodes binding via its
// structure, so simply dropping the group node never changes evaluate().
// To detect precedence hazards we compare two serializations of the
// surrounding expression: one where the group is preserved and one where
// it is dropped. The serializer re-inserts protective parens only when
// precedence demands them, so if the parens were load-bearing the
// "dropped" form differs from a raw splice of the child text. We detect
// this by parsing a splice that omits the parentheses entirely.
     const candidate = replaceNode(expr, groupId, found.node.child);
// Serialize the child at top-level precedence (as raw, unparenthesized
// text) and splice it into the surface syntax where the group sat.
     const spliced = serializeWithRawSplice(expr, groupId, found.node.child);
     const reparsed = parse(spliced);
     if (evaluate(reparsed) !== evaluate(expr)) {
         throw new Error('ungroup: would change value (precedence-unsafe)');
     }
     return candidate;
}

// Serialize `expr`, but render the node with id `groupId` as its child's
// text WITHOUT any surrounding parentheses (a naive textual removal of the
// parens). This exposes precedence hazards that structural removal hides.
function serializeWithRawSplice(node, groupId, child, parentPrec = 0) {
    if (isNum(node)) return String(node.value);
    if (isGroup(node)) {
        if (node.id === groupId) {
            // Drop the parens: serialize the child at top-level precedence.
            return serialize(child);
        }
        return `(${serializeWithRawSplice(node.child, groupId, child, 0)})`;
    }
    if (isOp(node)) {
        const PREC = {'+': 1, '-': 1, '*': 2, '/': 2};
        const prec = PREC[node.op];
        const left = serializeWithRawSplice(node.left, groupId, child, prec);
        const right = serializeWithRawSplice(node.right, groupId, child, prec + 1);
        const s = `${left} ${node.op} ${right}`;
        return prec < parentPrec ? `(${s})` : s;
    }
    throw new Error('serializeWithRawSplice: unknown node kind');
}

// --- combine ------------------------------------------------------------
// Folds an operator whose operands are both plain Nums into a single Num.
export function combine(expr, opId) {
    const found = findNode(expr, opId);
    if (!found || !isOp(found.node)) {
        throw new Error('combine: target is not an operator');
    }
    const node = found.node;
    if (!isNum(node.left) || !isNum(node.right)) {
        throw new Error('combine: both operands must be numbers');
    }
    const value = evaluate(node); // throws on non-exact division
    return replaceNode(expr, opId, num(value));
}

// --- cancel -------------------------------------------------------------
// An inverse pair that nets to identity. For the additive pair this means
// "a + x - x" style patterns collapsing the "+x -x" to nothing (0), and for
// "*x /x" collapsing to 1. We support the direct binary form:
//   (a + x) - x  -> a    /  (a - x) + x -> a
//   (a * x) / x  -> a    /  (a / x) * x -> a
// where the op node given is the OUTER operator.
export function cancel(expr, opId) {
    const found = findNode(expr, opId);
    if (!found || !isOp(found.node)) {
        throw new Error('cancel: target is not an operator');
    }
    const outer = found.node;
    const inner = isGroup(outer.left) ? outer.left.child : outer.left;

    if (!isOp(inner)) {
        throw new Error('cancel: left operand is not an inverse operation');
    }
    if (inner.op !== INVERSE[outer.op]) {
        throw new Error('cancel: operators are not an inverse pair');
    }
// inner.right and outer.right must be equal-value terms to cancel.
    if (evaluate(inner.right) !== evaluate(outer.right)) {
        throw new Error('cancel: terms do not cancel');
    }
// The result is inner.left, preserved as-is.
    const candidate = replaceNode(expr, opId, inner.left);
    if (evaluate(candidate) !== evaluate(expr)) {
        throw new Error('cancel: value mismatch (unexpected)');
    }
    return candidate;
}

// Registry so the session layer can dispatch by name.
export const VERBS = {split, swap, group, ungroup, combine, cancel};