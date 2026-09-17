// Trivial generator: k interleaved helices going up, each returning down an inner column.
// Exists to prove the pipeline end to end (problem.md §7 week 1).

export function generateHelix(spec) {
  const chans = spec.channels, k = chans.length;
  const { x: dx, y: dy, z: dz } = spec.cartridge.dims;
  const maxD = Math.max(...chans.map((c) => c.diameter));
  const gap = maxD + spec.clearanceMin;
  const R = Math.min(dx, dy) / 2 - maxD;
  const R2 = R - gap;
  const warnings = [];
  if (R2 <= maxD) throw new Error('Cartridge too small for the helix generator');
  if (2 * R2 * Math.sin(Math.PI / Math.max(k, 2)) < gap) {
    warnings.push('helix: return columns are closer than the clearance — fewer channels or a larger cartridge needed');
  }
  const rise = k * gap * 1.1;                  // rise per turn → strand spacing ≈ gap
  const z0 = maxD, z1 = dz - maxD;
  const turns = Math.max(0.5, (z1 - z0) / rise);
  const steps = 36;
  const total = Math.ceil(turns * steps);

  const channels = chans.map((ch, c) => {
    const phase = (2 * Math.PI * c) / k;
    const pts = [];
    for (let s = 0; s <= total; s++) {
      const t = Math.min(s / steps, turns);
      const a = phase + 2 * Math.PI * t;
      pts.push([R * Math.cos(a), R * Math.sin(a), z0 + rise * t]);
    }
    const aEnd = phase + 2 * Math.PI * turns, zEnd = z0 + rise * turns;
    pts.push([R2 * Math.cos(aEnd), R2 * Math.sin(aEnd), zEnd]);
    pts.push([R2 * Math.cos(aEnd), R2 * Math.sin(aEnd), z0]);
    return { id: ch.id, spec: ch, cells: null, centreline: pts, deadEnd: false, notes: [] };
  });
  return { generator: 'helix', grid: null, channels, warnings, stats: {} };
}