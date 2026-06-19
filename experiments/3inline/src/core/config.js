import { LineIndex } from './lineIndex.js';
import { Frontier } from './frontier.js';
import { pointId, fromId } from './geometry.js';

// A candidate configuration bundle.
export class Config {
  constructor(n) {
    this.n = n;
    this.selected = new Set(); // pointIds
    this.lineIndex = new LineIndex(n);
    this.frontier = new Frontier(n);
  }

  get pointCount() {
    return this.selected.size;
  }

  pointList() {
    return [...this.selected].map((id) => fromId(id, this.n));
  }

  has(x, y) {
    return this.selected.has(pointId(x, y, this.n));
  }

  // Returns true if added; false if would violate.
  add(x, y) {
    const id = pointId(x, y, this.n);
    if (this.selected.has(id)) return false;
    const p = [x, y];
    if (this.lineIndex.wouldViolate(p, id)) return false;
    const pts = this.pointList(); // existing points (id not yet added)
    this.lineIndex.addPoint(p, id);
    this.frontier.addPoint(p, pts);
    this.selected.add(id);
    return true;
  }

  // Force-add without validity check (used by mutation w/ later global check).
  forceAdd(x, y) {
    const id = pointId(x, y, this.n);
    if (this.selected.has(id)) return;
    const p = [x, y];
    const pts = this.pointList();
    this.lineIndex.addPoint(p, id);
    this.frontier.addPoint(p, pts);
    this.selected.add(id);
  }

  remove(x, y) {
    const id = pointId(x, y, this.n);
    if (!this.selected.has(id)) return false;
    const p = [x, y];
    this.selected.delete(id);
    const pts = this.pointList(); // after removal
    this.frontier.removePoint(p, pts);
    this.lineIndex.removePoint(p, id);
    return true;
  }

  clone() {
    const c = new Config(this.n);
    c.selected = new Set(this.selected);
    c.lineIndex = this.lineIndex.clone();
    c.frontier = this.frontier.clone();
    return c;
  }

  isSaturated() {
    return this.frontier.frontierCells(this.selected).length === 0;
  }

  isValid() {
    return this.lineIndex.validate();
  }
}
