// Zobrist hashing for configurations (tabu / dedup).
export class Zobrist {
  constructor(n) {
    this.n = n;
    this.table = new Uint32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      this.table[i] = (Math.random() * 0xffffffff) >>> 0;
    }
  }

  hash(selectedSet) {
    let h = 0;
    for (const id of selectedSet) h ^= this.table[id];
    return h >>> 0;
  }
}
