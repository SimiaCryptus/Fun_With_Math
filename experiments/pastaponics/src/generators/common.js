// Helpers shared by all routers.

export function normaliseFractions(channels) {
  const s = channels.reduce((a, c) => a + Math.max(0, c.volumeFraction || 0), 0);
  return channels.map((c) => (s > 0 ? Math.max(0, c.volumeFraction || 0) / s : 1 / channels.length));
}

export function biasDirection(bias) {
  return bias === 'top' ? 1 : bias === 'bottom' ? -1 : 0;
}

/** Preference score in [0,1] for a cell at normalised coordinates (u, v, w), w = height. */
export function biasScore(bias, u, v, w) {
  switch (bias) {
    case 'top': return w;
    case 'bottom': return 1 - w;
    case 'core': return 1 - Math.min(1, Math.hypot(u - 0.5, v - 0.5) / 0.7071);
    case 'periphery': return Math.min(1, Math.hypot(u - 0.5, v - 0.5) / 0.7071);
    default: return 0.5;
  }
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

/** Grid cell indices → world cell centres (mm). */
export function cellsToWorld(cells, grid) {
  const p = grid.pitch, o = grid.origin;
  return cells.map(([i, j, k]) => [o[0] + (i + 0.5) * p, o[1] + (j + 0.5) * p, o[2] + (k + 0.5) * p]);
}