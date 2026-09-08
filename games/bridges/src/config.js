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
export const BORDER_MODES = ['off', 'anchored', 'spanning'];
/** Who sits in a seat: a human or a bot level (difficulty = thinking budget). */
export const BOTS = ['human', 'easy', 'medium', 'hard'];
/** Clock presets: [main seconds, Fischer increment seconds]. */
export const CLOCKS = {
  none: [0, 0],
  '1+0': [60, 0],
  '3+2': [180, 2],
  '5+0': [300, 0],
  '5+3': [300, 3],
  '10+5': [600, 5],
  '15+10': [900, 10],
  '30+0': [1800, 0],
};
export const clockLabel = (time, inc) =>
  time > 0 ? `${time % 60 === 0 ? time / 60 : (time / 60).toFixed(1)}+${inc}` : 'none';

export const DEFAULTS = Object.freeze({
  version: 1,
  tiling: 'triangle',
  outline: 'rhombus',
  size: 11,
  players: 2,
  edgeMode: 'centroid',
  crossingMode: 'bridge',
  goal: 'opposite',
  variants: [],
  seed: 1,
  bots: [],          // per seat: human | easy | medium | hard (filled to `players`)
  time: 0,           // main time per seat in seconds; 0 = untimed
  increment: 0,      // Fischer increment per move in seconds
});
/**
  * Display settings live outside the game config: they are per-device, never
  * part of the shared URL, and changing them never restarts a game.
  */
export const DISPLAY_DEFAULTS = Object.freeze({
   theme: 'slate',
   borders: 'anchored', // paint tile borders: off | anchored (group reaches an owned side) | spanning (reaches both)
   links: true,         // link bars between connected tiles
   animations: true,    // claim rise, ripple, hover lift
});
export function normalizeDisplay(partial = {}, themeIds = ['slate']) {
   const d = { ...DISPLAY_DEFAULTS, ...partial };
   if (!themeIds.includes(d.theme)) d.theme = DISPLAY_DEFAULTS.theme;
   if (!BORDER_MODES.includes(d.borders)) d.borders = DISPLAY_DEFAULTS.borders;
   d.links = d.links !== false && d.links !== 'false';
   d.animations = d.animations !== false && d.animations !== 'false';
   return d;
}

const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(v)) || 0));

export function normalize(partial = {}, tilingIds = ['triangle']) {
  const c = { ...DEFAULTS, ...partial };
  if (!tilingIds.includes(c.tiling)) c.tiling = tilingIds.includes(DEFAULTS.tiling) ? DEFAULTS.tiling : tilingIds[0];
  if (!OUTLINES[c.outline]) c.outline = DEFAULTS.outline;
  c.size = Math.min(31, Math.max(3, Math.round(Number(c.size) || DEFAULTS.size)));
  if (!EDGE_MODES.includes(c.edgeMode)) c.edgeMode = DEFAULTS.edgeMode;
  if (!CROSSING_MODES.includes(c.crossingMode)) c.crossingMode = DEFAULTS.crossingMode;
  if (!GOALS.includes(c.goal)) c.goal = DEFAULTS.goal;
  // Player count follows from the macro shape: S = 2P.
  c.players = OUTLINES[c.outline].sides / 2;
  c.variants = [...new Set((c.variants || []).filter(v => VARIANTS.includes(v)))];
  c.seed = (Number(c.seed) | 0) || 1;
  const bots = Array.isArray(c.bots) ? c.bots : String(c.bots ?? '').split(',');
  c.bots = Array.from({ length: c.players }, (_, i) => (BOTS.includes(bots[i]) ? bots[i] : 'human'));
  c.time = clampInt(c.time, 0, 36000);
  c.increment = c.time > 0 ? clampInt(c.increment, 0, 600) : 0;
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
  if (cfg.bots.some(b => b !== 'human')) p.set('b', cfg.bots.join(','));
  if (cfg.time > 0) {
    p.set('k', String(cfg.time));
    if (cfg.increment > 0) p.set('ki', String(cfg.increment));
  }
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
  if (p.has('b')) partial.bots = p.get('b').split(',');
  if (p.has('k')) partial.time = p.get('k');
  if (p.has('ki')) partial.increment = p.get('ki');
  const moves = p.has('m') ? decodeMoves(p.get('m')) : [];
  return { config: normalize(partial, tilingIds), moves };
}