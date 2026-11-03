// Tiny binary max-heap keyed by a numeric priority. DOM-free.

export class MaxHeap {
  constructor() {
    this.k = [];
    this.v = [];
  }
  get size() {
    return this.k.length;
  }
  push(key, value) {
    this.k.push(key);
    this.v.push(value);
    let i = this.k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.k[p] >= this.k[i]) break;
      this._swap(i, p);
      i = p;
    }
  }
  pop() {
    if (this.k.length === 0) return undefined;
    const top = this.v[0];
    const lk = this.k.pop();
    const lv = this.v.pop();
    if (this.k.length) {
      this.k[0] = lk;
      this.v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.k.length && this.k[l] > this.k[m]) m = l;
        if (r < this.k.length && this.k[r] > this.k[m]) m = r;
        if (m === i) break;
        this._swap(i, m);
        i = m;
      }
    }
    return top;
  }
  _swap(i, j) {
    const tk = this.k[i]; this.k[i] = this.k[j]; this.k[j] = tk;
    const tv = this.v[i]; this.v[i] = this.v[j]; this.v[j] = tv;
  }
}