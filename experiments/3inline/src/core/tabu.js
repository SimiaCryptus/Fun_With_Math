import { Zobrist } from './zobrist.js';

// Bounded tabu set of recently-visited configuration hashes.
// Uses Zobrist hashing for O(1) membership checks. Prevents the search
// from revisiting configurations (cycle-breaking complements annealing).
export class TabuList {
  constructor(n, capacity = 512) {
    this.zobrist = new Zobrist(n);
    this.capacity = capacity;
    this.set = new Set();
    this.queue = [];
  }

  hash(selectedSet) {
    return this.zobrist.hash(selectedSet);
  }

  has(selectedSet) {
    return this.set.has(this.hash(selectedSet));
  }

  add(selectedSet) {
    const h = this.hash(selectedSet);
    if (this.set.has(h)) return;
    this.set.add(h);
    this.queue.push(h);
    while (this.queue.length > this.capacity) {
      const old = this.queue.shift();
      this.set.delete(old);
    }
  }

  clear() {
    this.set.clear();
    this.queue = [];
  }
}
