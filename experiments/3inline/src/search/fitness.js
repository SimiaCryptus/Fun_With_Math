// Hard fitness: point count (assumes config valid).
export function fitness(config) {
  return config.pointCount;
}

export function isSaturated(config) {
  return config.isSaturated();
}

// Diagonal-concentration score: a SECONDARY fitness that rewards
// configurations whose selected points cluster near the two main
// diagonals of the grid. It is designed to be used only as a
// tie-breaker among configurations of equal point count, so it can
// never reduce the primary (point-count / 3-in-line) fitness.
//
// For each selected point (x, y) we measure its distance to the nearer
// of the two diagonals (y = x) and (y = (n-1) - x), normalized to [0,1],
// and reward proximity. Higher score = more concentrated on a diagonal.
export function diagonalConcentration(config) {
  const n = config.n;
  if (n <= 1 || config.pointCount === 0) return 0;
  const maxDist = n - 1; // worst-case distance to a diagonal
  let score = 0;
  for (const id of config.selected) {
    const x = id % n;
    const y = Math.floor(id / n);
    const d1 = Math.abs(y - x); // distance to y = x
    const d2 = Math.abs(y - (n - 1 - x)); // distance to anti-diagonal
    const d = Math.min(d1, d2);
    // reward closeness: 1 at the diagonal, 0 at maximum distance
    score += 1 - d / maxDist;
  }
  // normalize by point count so the value lives in [0,1]
  return score / config.pointCount;
}

// Lexicographic combined fitness: primary = point count, secondary =
// diagonal concentration. The secondary term is scaled to be strictly
// smaller than one unit of the primary term, guaranteeing it can only
// break ties between equal-count configurations and never trade away a
// point. Returns a single comparable number.
export function lexFitness(config) {
  // diagonalConcentration in [0,1); divide by 2 to keep it < 1 with margin.
  return config.pointCount + diagonalConcentration(config) * 0.5;
}
