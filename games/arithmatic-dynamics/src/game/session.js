// GameSession — holds the current expression, undo/redo stacks, and
// tracks metrics (move count, verbs used) for star evaluation.
//
// The session is UI-agnostic: the UI subscribes to events and issues
// intents via apply(). Every apply pushes the previous state so undo is
// first-class and unlimited.

import {Emitter} from '../util/events.js';
import {isNum} from '../core/expression.js';
import {evaluate} from '../core/value.js';
import {serialize, parse} from '../core/serialize.js';
import {VERBS} from '../core/transformations.js';

export class GameSession extends Emitter {
    constructor(level) {
        super();
        this.level = level || null;
        const start = level && level.start ? level.start : '0';
        this.expr = typeof start === 'string' ? parse(start) : start;
        this.allowedVerbs = (level && level.allowedVerbs) || [
            'split', 'swap', 'group', 'ungroup', 'combine', 'cancel',
        ];
        this._undo = [];
        this._redo = [];
        this.moveCount = 0;
        this.verbsUsed = new Set();
    }

    // Apply a named transformation. `args` are spread after the expr.
    // Returns the new expression, or throws if the verb is illegal.
    apply(verb, ...args) {
        if (!this.allowedVerbs.includes(verb)) {
            throw new Error(`Verb not allowed in this level: ${verb}`);
        }
        const fn = VERBS[verb];
        if (!fn) throw new Error(`Unknown verb: ${verb}`);

        const before = this.expr;
        const next = fn(before, ...args);
        // Value-preservation belt-and-suspenders check.
        if (evaluate(next) !== evaluate(before)) {
            throw new Error(`Transformation ${verb} changed value`);
        }

        this._undo.push({
            expr: before,
            moveCount: this.moveCount,
            verbsUsed: new Set(this.verbsUsed),
        });
        this._redo.length = 0;
        this.expr = next;
        this.moveCount += 1;
        this.verbsUsed.add(verb);

        this.emit('changed', {expr: this.expr, verb});
        if (this.isSolved()) {
            this.emit('solved', {expr: this.expr});
        }
        return this.expr;
    }

    canUndo() {
        return this._undo.length > 0;
    }

    canRedo() {
        return this._redo.length > 0;
    }

    undo() {
        if (!this.canUndo()) return;
        const snapshot = this._undo.pop();
        this._redo.push({
            expr: this.expr,
            moveCount: this.moveCount,
            verbsUsed: new Set(this.verbsUsed),
        });
        this.expr = snapshot.expr;
        this.moveCount = snapshot.moveCount;
        this.verbsUsed = snapshot.verbsUsed;
        this.emit('changed', {expr: this.expr, undo: true});
    }

    redo() {
        if (!this.canRedo()) return;
        const snapshot = this._redo.pop();
        this._undo.push({
            expr: this.expr,
            moveCount: this.moveCount,
            verbsUsed: new Set(this.verbsUsed),
        });
        this.expr = snapshot.expr;
        this.moveCount = snapshot.moveCount;
        this.verbsUsed = snapshot.verbsUsed;
        this.emit('changed', {expr: this.expr, redo: true});
    }

    reset() {
        const start = this.level && this.level.start ? this.level.start : '0';
        this.expr = typeof start === 'string' ? parse(start) : start;
        this._undo.length = 0;
        this._redo.length = 0;
        this.moveCount = 0;
        this.verbsUsed = new Set();
        this.emit('changed', {expr: this.expr, reset: true});
    }

    isSolved() {
        return isNum(this.expr);
    }

    serialize() {
        return serialize(this.expr);
    }
}