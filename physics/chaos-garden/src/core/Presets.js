/** Curated designs, generated procedurally so they are resolution-independent. */
function disk(bf, fx, fy, fr) {
  const cx = fx * bf.Nx, cy = fy * bf.Ny, r = fr * bf.Ny;
  for (let j = Math.floor(cy - r - 1); j <= cy + r + 1; j++) for (let i = Math.floor(cx - r - 1); i <= cx + r + 1; i++) {
    if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r && bf.paintable(i)) bf.set(i, j, 1);
  }
}
function bar(bf, fx, fy0, fy1, ft) {
  const i0 = Math.round((fx - ft / 2) * bf.Nx), i1 = Math.max(i0, Math.round((fx + ft / 2) * bf.Nx) - 1);
  for (let j = Math.round(fy0 * bf.Ny); j < Math.round(fy1 * bf.Ny); j++) for (let i = i0; i <= i1; i++) if (bf.paintable(i)) bf.set(i, j, 1);
}
export const PRESETS = [
  { id: 'empty', label: 'Empty channel', paint() {} },
  { id: 'one-cylinder', label: 'One cylinder', paint(bf) { disk(bf, 0.28, 0.5, 0.07); } },
  { id: 'two-cylinders', label: 'Two cylinders', paint(bf) { disk(bf, 0.28, 0.32, 0.055); disk(bf, 0.28, 0.68, 0.055); } },
  { id: 'staggered-ladder', label: 'Staggered ladder', paint(bf) {
    const rows = [[0.22, 0.05, 0.5], [0.4, 0.035, 0.25], [0.55, 0.025, 0.125]];
    for (const [fx, fr, sp] of rows) for (let y = sp / 2; y < 1; y += sp) disk(bf, fx, y, fr);
  } },
  { id: 'slot-jets', label: 'Slot jets', paint(bf) { bar(bf, 0.25, 0.0, 0.2, 0.02); bar(bf, 0.25, 0.3, 0.45, 0.02); bar(bf, 0.25, 0.55, 0.7, 0.02); bar(bf, 0.25, 0.8, 1.0, 0.02); } },
];
export function applyPreset(bf, id) { const p = PRESETS.find((x) => x.id === id); if (!p) return false; bf.mask.fill(0); p.paint(bf); bf.bump(); return true; }