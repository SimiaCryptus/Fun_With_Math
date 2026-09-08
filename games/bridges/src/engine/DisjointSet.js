export class DisjointSet {
  constructor(n) {
    this.parent = new Int32Array(n);
    this.size = new Int32Array(n).fill(1);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(x) {
    const p = this.parent;
    while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; }
    return x;
  }
  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return ra;
    if (this.size[ra] < this.size[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
    return ra;
  }
  same(a, b) { return this.find(a) === this.find(b); }
}