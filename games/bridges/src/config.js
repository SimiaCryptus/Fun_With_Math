// Defaults, validation and the URL <-> config codec.
// State = config + move list; everything else is derived.

export const SWAP = -1; // pie-rule marker inside a move list

export const OUTLINES = {
  rhombus: { sides: 4, label: 'Rhombus (Hex)' },
  square:  { sides: 4, label: 'Square' },
  hexagon: { sides: 6, label: 'Hexagon' },
};
export const EDGE_MODES = ['whole', 'centroid', 'clip'];
export const CROSSING_MODES = ['strict', 'bridge', 'open'];
export const GOALS = ['opposite', 'fork'];
export const VARIANTS = ['pie'];

export const DEFAULTS = Object.freeze({
  version: 1,
  tiling: 'hex',
  outline: 'rhombus',
  size: 11,
  players: 2,
  edgeMode: 'centroid',
  crossingMode: 'bridge',
  goal: 'opposite',
  variants: [],
  seed: 1,
  theme: 'slate',
});

export function normalize(partial = {}, tilingIds = ['hex']) {
  const c = { ...DEFAULTS, ...partial };
  if (!tilingIds.includes(c.tiling)) c.tiling = DEFAULTS.tiling;
  if (!OUTLINES[c.outline]) c.outline = DEFAULTS.outline;
  c.size = Math.min(31, Math.max(3, Math.round(Number(c.size) || DEFAULTS.size)));
  if (!EDGE_MODES.includes(c.edgeMode)) c.edgeMode = DEFAULTS.edgeMode;
  if (!CROSSING_MODES.includes(c.crossingMode)) c.crossingMode = DEFAULTS.crossingMode;
  if (!GOALS.includes(c.goal)) c.goal = DEFAULTS.goal;
  // Player count follows from the macro shape: S = 2P.
  c.players = OUTLINES[c.outline].sides / 2;
  c.variants = [...new Set((c.variants || []).filter(v => VARIANTS.includes(v)))];
  c.seed = (Number(c.seed) | 0) || 1;
  return c;
}

// Compact move string: 2 URL-safe base64 chars per move (cells < 4095; 4095 = swap).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeMoves(moves) {
  let s = '';
  for (const m of moves) {
    const v = m === SWAP ? 4095 : m;
    if (!Number.isInteger(v) || v < 0 || v > 4095) throw new Error(`move out of range: ${m}`);
    s += B64[v >> 6] + B64[v & 63];
  }
  return s;
}

export function decodeMoves(s) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i += 2) {
    const hi = B64.indexOf(s[i]), lo = B64.indexOf(s[i + 1]);
    if (hi < 0 || lo < 0) break;
    const v = hi * 64 + lo;
    out.push(v === 4095 ? SWAP : v);
  }
  return out;
}

export function toHash(cfg, moves = []) {
  const p = new URLSearchParams();
  p.set('t', cfg.tiling);
  p.set('o', cfg.outline);
  p.set('s', String(cfg.size));
  p.set('p', String(cfg.players));
  p.set('e', cfg.edgeMode);
  p.set('c', cfg.crossingMode);
  if (cfg.goal !== DEFAULTS.goal) p.set('g', cfg.goal);
  if (cfg.variants.length) p.set('v', cfg.variants.join(','));
  if (cfg.seed !== DEFAULTS.seed) p.set('seed', String(cfg.seed));
  if (moves.length) p.set('m', encodeMoves(moves));
  return '#' + p.toString();
}

export function fromHash(hash, tilingIds) {
  const p = new URLSearchParams((hash || '').replace(/^#/, ''));
  const partial = {};
  if (p.has('t')) partial.tiling = p.get('t');
  if (p.has('o')) partial.outline = p.get('o');
  if (p.has('s')) partial.size = p.get('s');
  if (p.has('e')) partial.edgeMode = p.get('e');
  if (p.has('c')) partial.crossingMode = p.get('c');
  if (p.has('g')) partial.goal = p.get('g');
  if (p.has('v')) partial.variants = p.get('v').split(',').filter(Boolean);
  if (p.has('seed')) partial.seed = p.get('seed');
  const moves = p.has('m') ? decodeMoves(p.get('m')) : [];
  return { config: normalize(partial, tilingIds), moves };
}