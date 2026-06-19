// Simulated annealing acceptance.
export function accept(deltaFitness, temperature) {
  // We maximize fitness; deltaFitness > 0 is improvement.
  if (deltaFitness >= 0) return true;
  return Math.random() < Math.exp(deltaFitness / Math.max(temperature, 1e-6));
}

// Adaptive temperature adjustment based on recent acceptance rate.
// Targets a band [lo, hi]; nudges temperature up when too few moves are
// accepted (search is stuck/cold) and down when too many are (too hot to
// converge). Returns the adjusted temperature.
export function adaptTemperature(temperature, acceptRate, opts = {}) {
  const lo = opts.lo ?? 0.2;
  const hi = opts.hi ?? 0.6;
  const up = opts.up ?? 1.05;
  const down = opts.down ?? 0.97;
  const max = opts.max ?? 100;
  const min = opts.min ?? 0.01;
  let t = temperature;
  if (acceptRate < lo) t *= up;
  else if (acceptRate > hi) t *= down;
  return Math.max(min, Math.min(max, t));
}
