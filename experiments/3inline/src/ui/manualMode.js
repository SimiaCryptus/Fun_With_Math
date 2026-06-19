import { lineKey, lineCells, fromId } from '../core/geometry.js';

// Find a violating triple if point p were added (for visual feedback).
export function findViolation(config, p) {
  const n = config.n;
  for (const idA of config.selected) {
    const a = fromId(idA, n);
    const key = lineKey(p, a);
    // collect all selected on this line
    const set = config.lineIndex.lines.get(key);
    if (set && set.size >= 2) {
      // any two of them + p form a triple. Pick endpoints on the line.
      const others = [...set].map((id) => fromId(id, n));
      // ensure two distinct exist
      if (others.length >= 2) {
        return { p, a: others[0], b: others[1] };
      }
    }
  }
  return null;
}

// Undo/redo via snapshots of the selected set.
export class History {
  constructor() {
    this.stack = [];
    this.ptr = -1;
  }
  push(selectedSet) {
    this.stack = this.stack.slice(0, this.ptr + 1);
    this.stack.push(new Set(selectedSet));
    this.ptr = this.stack.length - 1;
  }
  canUndo() {
    return this.ptr > 0;
  }
  canRedo() {
    return this.ptr < this.stack.length - 1;
  }
  undo() {
    if (this.canUndo()) return this.stack[--this.ptr];
    return null;
  }
  redo() {
    if (this.canRedo()) return this.stack[++this.ptr];
    return null;
  }
}
