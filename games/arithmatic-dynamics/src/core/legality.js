// Which verbs are legal for a given selection of tile/node ids.
//
// legalVerbs(expr, selection) -> Verb[]  (array of verb name strings)
//
// The selection is an array of node ids. Different verbs care about
// different selection shapes:
//   - split   : a single Num
//   - swap    : a single commutative op
//   - group   : a single op (not already directly wrapped)
//   - ungroup : a single group (value-safe to remove)
//   - combine : a single op with two Num operands
//   - cancel  : a single op forming an inverse pair with its left operand

import {isNum, isOp, isGroup, findNode, COMMUTATIVE, INVERSE} from './expression.js';
import {evaluate} from './value.js';
import {parse, serialize} from './serialize.js';

export function legalVerbs(expr, selection, allowed = null) {
    const ids = Array.isArray(selection) ? selection : [selection];
    const verbs = new Set();

    if (ids.length === 1) {
        const found = findNode(expr, ids[0]);
        if (found) {
            const node = found.node;

            if (isNum(node)) {
                verbs.add('split');
            }

            if (isOp(node)) {
                if (COMMUTATIVE.has(node.op)) verbs.add('swap');
                verbs.add('group');
                if (isNum(node.left) && isNum(node.right) && exactDivOk(node)) {
                    verbs.add('combine');
                }
                if (canCancel(node)) verbs.add('cancel');
            }

            if (isGroup(node)) {
                if (ungroupSafe(expr, ids[0])) verbs.add('ungroup');
            }
        }
    }

    let result = [...verbs];
    if (allowed) result = result.filter((v) => allowed.includes(v));
    return result;
}

function exactDivOk(node) {
    if (node.op !== '/') return true;
    const r = evaluate(node.right);
    return r !== 0 && evaluate(node.left) % r === 0;
}

function canCancel(outer) {
    const inner = isGroup(outer.left) ? outer.left.child : outer.left;
    if (!isOp(inner)) return false;
    if (inner.op !== INVERSE[outer.op]) return false;
    try {
        return evaluate(inner.right) === evaluate(outer.right);
    } catch {
        return false;
    }
}

function ungroupSafe(expr, groupId) {
    const found = findNode(expr, groupId);
    if (!found || !isGroup(found.node)) return false;
     // Simulate replacement, then round-trip through the surface syntax so
     // that precedence hazards (load-bearing parens) are actually detected.
     try {
         const spliced = serializeRawSplice(expr, groupId, found.node.child);
         const reparsed = parse(spliced);
         return evaluate(reparsed) === evaluate(expr);
     } catch {
         return false;
     }
}
// Render `expr` but drop the parentheses around the group with `groupId`,
// exposing precedence hazards a structural removal would hide.
function serializeRawSplice(node, groupId, child, parentPrec = 0) {
    if (isNum(node)) return String(node.value);
    if (isGroup(node)) {
        if (node.id === groupId) return serialize(child);
        return `(${serializeRawSplice(node.child, groupId, child, 0)})`;
    }
    if (isOp(node)) {
        const PREC = {'+': 1, '-': 1, '*': 2, '/': 2};
        const prec = PREC[node.op];
        const left = serializeRawSplice(node.left, groupId, child, prec);
        const right = serializeRawSplice(node.right, groupId, child, prec + 1);
        const s = `${left} ${node.op} ${right}`;
        return prec < parentPrec ? `(${s})` : s;
    }
    throw new Error('serializeRawSplice: unknown node kind');
}

// Local helper (avoids importing replaceNode to keep deps light).
function replaceGroupChild(root, id, child) {
    if (!root) return root;
    if (root.id === id && isGroup(root)) return child;
    if (isGroup(root)) {
        return {...root, child: replaceGroupChild(root.child, id, child)};
    }
    if (isOp(root)) {
        return {
            ...root,
            left: replaceGroupChild(root.left, id, child),
            right: replaceGroupChild(root.right, id, child),
        };
    }
    return root;
}