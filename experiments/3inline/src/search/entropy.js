// Process-entropy proxy: sliding-window average Hamming distance between
// recently visited configurations (by selected-set symmetric difference).
export class EntropyMonitor {
  constructor(windowSize = 20) {
    this.window = [];
    this.windowSize = windowSize;
  }

  push(selectedSet) {
    this.window.push(new Set(selectedSet));
    if (this.window.length > this.windowSize) this.window.shift();
  }

  // Average pairwise Hamming distance over window, normalized.
  value() {
    const w = this.window;
    if (w.length < 2) return 0;
    let total = 0,
      pairs = 0;
    for (let i = 0; i < w.length; i++)
      for (let j = i + 1; j < w.length; j++) {
        total += symDiff(w[i], w[j]);
        pairs++;
      }
    return pairs ? total / pairs : 0;
  }

  collapsed(threshold = 0.5) {
    return this.window.length >= this.windowSize && this.value() < threshold;
  }
}

function symDiff(a, b) {
  let d = 0;
  for (const x of a) if (!b.has(x)) d++;
  for (const x of b) if (!a.has(x)) d++;
  return d;
}
