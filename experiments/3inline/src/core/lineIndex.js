import { lineKey } from './geometry.js';

// Incremental line index: lineKey -> Set of pointIds.
// Maintains "no key holds >= 3 points" for valid configs.
export class LineIndex {
  constructor(n) {
    this.n = n;
    this.lines = new Map(); // key -> Set<pointId>
    this.points = new Map(); // pointId -> [x,y]
  }

  clone() {
    const c = new LineIndex(this.n);
    for (const [id, p] of this.points) c.points.set(id, p);
    for (const [k, set] of this.lines) c.lines.set(k, new Set(set));
    return c;
  }

  // Would adding point p (=[x,y], id) create a 3-in-line?
  // For each existing point q, the line p-q must not already contain
  // another selected point r (i.e. its key set size >= 2 means {q, r}
  // already collinear with p).
  wouldViolate(p, id) {
    // Track keys we've already seen so two points q,r on the SAME line
    // through p are detected even before this point is inserted.
    const seen = new Map(); // key -> count of existing points sharing it w/ p
    for (const [qid, q] of this.points) {
      if (qid === id) continue;
      const key = lineKey(p, q);
      // If another existing point already shares this p-line, that's 2
      // existing + p = 3 collinear.
      const cnt = (seen.get(key) || 0) + 1;
      if (cnt >= 2) return true;
      seen.set(key, cnt);
    }
    return false;
  }

  addPoint(p, id) {
    for (const [qid, q] of this.points) {
      if (qid === id) continue;
      const key = lineKey(p, q);
      let set = this.lines.get(key);
      if (!set) {
        set = new Set();
        this.lines.set(key, set);
      }
      set.add(id);
      set.add(qid);
    }
    this.points.set(id, p);
  }

  removePoint(p, id) {
    this.points.delete(id);
    for (const [qid, q] of this.points) {
      const key = lineKey(p, q);
      const set = this.lines.get(key);
      if (set) {
        set.delete(id);
        if (set.size < 2) this.lines.delete(key);
      }
    }
  }

  // Debug: brute-force check no 3 collinear among current points.
  validate() {
    const ids = [...this.points.keys()];
    for (let a = 0; a < ids.length; a++)
      for (let b = a + 1; b < ids.length; b++)
        for (let c = b + 1; c < ids.length; c++) {
          const A = this.points.get(ids[a]);
          const B = this.points.get(ids[b]);
          const C = this.points.get(ids[c]);
          const det = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
          if (det === 0) return false;
        }
    return true;
  }
}
