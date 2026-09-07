export const LEVELS = [
  { id: 'surface-scratch', name: 'Surface Scratch', w: 8, d: 8, h: 1, mines: 8, par: 60, notes: 'Tutorial: strike, mark, cascade' },
  { id: 'shallow-seam', name: 'Shallow Seam', w: 12, d: 12, h: 1, mines: 22, par: 120, notes: 'Classic beginner feel' },
  { id: 'deep-seam', name: 'Deep Seam', w: 16, d: 16, h: 1, mines: 45, par: 240, notes: 'Classic intermediate' },
  { id: 'double-deck', name: 'Double Deck', w: 10, d: 10, h: 2, mines: 22, par: 180, notes: 'Introduces vertical adjacency' },
  { id: 'the-undercut', name: 'The Undercut', w: 14, d: 14, h: 2, mines: 47, par: 360, notes: 'Layer-isolate hotkeys taught' },
  { id: 'triple-threat', name: 'Triple Threat', w: 10, d: 10, h: 3, mines: 27, par: 300, notes: 'First 3-layer board' },
  { id: 'the-vault', name: 'The Vault', w: 16, d: 16, h: 3, mines: 77, par: 720, notes: 'Campaign finale' },
];

export const CUSTOM_LIMITS = { min: 3, max: 40 };

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Sanitises a custom board spec so it is always playable. */
export function customLevel({ w, d, h, mines }) {
  const width = clamp(Math.round(Number(w) || 10), CUSTOM_LIMITS.min, CUSTOM_LIMITS.max);
  const depth = clamp(Math.round(Number(d) || width), CUSTOM_LIMITS.min, CUSTOM_LIMITS.max);
  const height = clamp(Math.round(Number(h) || 1), 1, CUSTOM_LIMITS.max);
  const cells = width * depth * height;
  // Keep mineCount + 27 <= cellCount where possible so safe-first-strike can always relocate.
  const maxMines = Math.max(1, Math.min(cells - 28, cells - 1));
  const mineCount = clamp(Math.round(Number(mines) || Math.round(cells * 0.12)), 1, maxMines);
  return {
    id: 'custom',
    name: `Custom ${width}×${depth}×${height}`,
    w: width,
    d: depth,
    h: height,
    mines: mineCount,
    par: null,
    custom: true,
    index: -1,
  };
}