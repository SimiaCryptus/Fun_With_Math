// §8.1 corruption: intervals with uniformly drawn offset (never centred), label corruption.
const clip = v => Math.min(1, Math.max(0, v));

export function corrupt(gen, C, cfg, rng) {
  const { X, y } = gen;
  const d = X[0].length;
  const obs = [];
  for (let i = 0; i < X.length; i++) {
    const x = X[i];
    let lo = [], hi = [];
    const ov = cfg.override ? cfg.override(i, gen, rng) : null;
    if (ov) { lo = ov[0].map(clip); hi = ov[1].map(clip); }
    else {
      const anchor = rng() < (cfg.anchorFloor || 0);
      for (let j = 0; j < d; j++) {
        const w = anchor ? 0 : cfg.widths[j];
        let a, b;
        if (cfg.mixed && !anchor) {
          const r = rng();
          if (r < 0.2) { a = b = x[j]; }
          else if (r < 0.6) { const u = rng(); a = x[j] - u * w; b = a + w; }
          else if (r < 0.8) { const u = rng() * 0.3; if (rng() < 0.5) { a = 0; b = x[j] + u; } else { a = x[j] - u; b = 1; } }
          else { a = 0; b = 1; }
        } else {
          const u = rng();
          a = x[j] - u * w; b = a + w;
        }
        lo.push(clip(a)); hi.push(clip(b));
      }
    }
    let t = y[i];
    if (rng() < (cfg.noise || 0)) t = (t + 1 + Math.floor(rng() * (C - 1))) % C;
    let Y = 1 << t;
    if (rng() < (cfg.partial || 0)) Y |= 1 << ((t + 1 + Math.floor(rng() * (C - 1))) % C);
    obs.push({ lo: lo.slice(), hi: hi.slice(), lo0: lo, hi0: hi, Y, rho: null });
  }
  return obs;
}