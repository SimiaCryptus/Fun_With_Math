// Longitudinal foliation: n sub-ribbons of width w/n − gap, inheriting the parent frame.
export const subHalfWidth = (width, n, gap = 0.02) => Math.max(0.01, width / (2 * n) - gap);
export const transverse = (q, n, width) => ((q + 0.5) / n - 0.5) * width;