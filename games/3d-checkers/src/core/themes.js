// Preset themes and the list of user-adjustable style settings.
//
// A "style" is a flat object of colours ('#rrggbb' strings), numbers and
// booleans. The renderer modules (SceneManager, LatticeView, PieceView,
// HighlightLayer) each read the keys they care about in their setStyle(). The
// user picks a preset and may override individual keys; resolveStyle() merges
// the two so a preset can always be restored with "Reset to theme".

export const DEFAULT_THEME = 'midnight';

/** Every tweakable setting, grouped the way the Appearance dialog shows them. */
export const STYLE_FIELDS = [
  // Board
  { key: 'background',       group: 'Board',      label: 'Background',         type: 'color' },
  { key: 'fog',              group: 'Board',      label: 'Depth fog',          type: 'check' },
  { key: 'latticeColor',     group: 'Board',      label: 'Cell colour',        type: 'color' },
  { key: 'latticeOpacity',   group: 'Board',      label: 'Cell opacity',       type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'frameColor',       group: 'Board',      label: 'Frame',              type: 'color' },
  { key: 'plateColor',       group: 'Board',      label: 'Level plates',       type: 'color' },
  { key: 'plateOpacity',     group: 'Board',      label: 'Plate opacity',      type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'ghostLevel',       group: 'Board',      label: 'Ghosted visibility', type: 'range', min: 0, max: 0.8, step: 0.01 },
  // Pieces
  { key: 'redColor',         group: 'Pieces',     label: 'Red pieces',         type: 'color' },
  { key: 'blackColor',       group: 'Pieces',     label: 'Black pieces',       type: 'color' },
  { key: 'pieceRoughness',   group: 'Pieces',     label: 'Roughness',          type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'pieceMetalness',   group: 'Pieces',     label: 'Metalness',          type: 'range', min: 0, max: 1, step: 0.01 },
  { key: 'kingGlowColor',    group: 'Pieces',     label: 'King glow colour',   type: 'color' },
  { key: 'kingGlow',         group: 'Pieces',     label: 'King glow',          type: 'range', min: 0, max: 2, step: 0.05 },
  // Highlights
  { key: 'moveColor',        group: 'Highlights', label: 'Legal move',         type: 'color' },
  { key: 'captureColor',     group: 'Highlights', label: 'Capture',            type: 'color' },
  { key: 'finalColor',       group: 'Highlights', label: 'Chain end',          type: 'color' },
  { key: 'hoverColor',       group: 'Highlights', label: 'Hover',              type: 'color' },
  { key: 'lastMoveColor',    group: 'Highlights', label: 'Last move trail',    type: 'color' },
  { key: 'highlightOpacity', group: 'Highlights', label: 'Highlight opacity',  type: 'range', min: 0.1, max: 1, step: 0.01 },
  // Lighting
  { key: 'skyColor',         group: 'Lighting',   label: 'Ambient (sky)',      type: 'color' },
  { key: 'groundColor',      group: 'Lighting',   label: 'Ambient (ground)',   type: 'color' },
  { key: 'ambientIntensity', group: 'Lighting',   label: 'Ambient intensity',  type: 'range', min: 0, max: 3, step: 0.05 },
  { key: 'sunColor',         group: 'Lighting',   label: 'Key light',          type: 'color' },
  { key: 'sunIntensity',     group: 'Lighting',   label: 'Key intensity',      type: 'range', min: 0, max: 4, step: 0.05 },
  { key: 'fillColor',        group: 'Lighting',   label: 'Fill light',         type: 'color' },
  { key: 'fillIntensity',    group: 'Lighting',   label: 'Fill intensity',     type: 'range', min: 0, max: 2, step: 0.05 },
  { key: 'exposure',         group: 'Lighting',   label: 'Exposure',           type: 'range', min: 0.3, max: 2.5, step: 0.05 },
  { key: 'shadows',          group: 'Lighting',   label: 'Shadows',            type: 'check' },
];

// The original look of the game; every other preset is expressed as a delta on it.
const BASE = {
  background: '#15181f', fog: true,
  latticeColor: '#8fb3d9', latticeOpacity: 0.26, frameColor: '#8a7a66',
  plateColor: '#2b313d', plateOpacity: 0.35, ghostLevel: 0.2,
  redColor: '#c93b30', blackColor: '#2b2b32', pieceRoughness: 0.42, pieceMetalness: 0.2,
  kingGlowColor: '#ffd27a', kingGlow: 0.35,
  moveColor: '#5cff9a', captureColor: '#ffb347', finalColor: '#a8ffd0', hoverColor: '#e8f4ff',
  lastMoveColor: '#6fa8ff', highlightOpacity: 0.9,
  skyColor: '#dfe8ff', groundColor: '#2a2320', ambientIntensity: 0.9,
  sunColor: '#ffffff', sunIntensity: 1.7, fillColor: '#9db4ff', fillIntensity: 0.4,
  exposure: 1, shadows: true,
};
const def = (label, overrides = {}) => ({ ...BASE, ...overrides, label });

export const THEMES = {
  midnight: def('Midnight (default)'),

  classic: def('Classic Wood', {
    background: '#1b1510', latticeColor: '#d6a86e', latticeOpacity: 0.3, frameColor: '#6b4a2b',
    plateColor: '#3d2c1c', plateOpacity: 0.5,
    redColor: '#b3332a', blackColor: '#2a2420', pieceRoughness: 0.55, pieceMetalness: 0.05,
    kingGlowColor: '#ffcf70', kingGlow: 0.3,
    hoverColor: '#fff1d8', lastMoveColor: '#7fb2ff',
    skyColor: '#ffe7c6', groundColor: '#3a2a1c', ambientIntensity: 0.95,
    sunColor: '#fff0dc', sunIntensity: 1.6, fillColor: '#b8c6e6', fillIntensity: 0.35, exposure: 1.05,
  }),

  neon: def('Glass & Neon', {
    background: '#06080f', latticeColor: '#2fb6ff', latticeOpacity: 0.16, frameColor: '#ff3fd0',
    plateColor: '#0c1430', plateOpacity: 0.55, ghostLevel: 0.12,
    redColor: '#ff2f6d', blackColor: '#1c2140', pieceRoughness: 0.2, pieceMetalness: 0.6,
    kingGlowColor: '#00ffe1', kingGlow: 1.3,
    moveColor: '#00ffb3', captureColor: '#ff8a00', finalColor: '#c8fff0', hoverColor: '#ffffff',
    lastMoveColor: '#8a7dff', highlightOpacity: 1,
    skyColor: '#3a5bff', groundColor: '#12001f', ambientIntensity: 0.8,
    sunColor: '#c8f0ff', sunIntensity: 1.2, fillColor: '#ff40c0', fillIntensity: 0.9,
    exposure: 1.15, shadows: false,
  }),

  glass: def('Frosted Glass', {
    background: '#dfe6ee', fog: false, latticeColor: '#ffffff', latticeOpacity: 0.35, frameColor: '#7c8a99',
    plateColor: '#c4cfdb', plateOpacity: 0.45, ghostLevel: 0.4,
    redColor: '#e2503f', blackColor: '#2d3340', pieceRoughness: 0.15, pieceMetalness: 0.1,
    kingGlowColor: '#ffffff', kingGlow: 0.25,
    moveColor: '#12b364', captureColor: '#e57c00', finalColor: '#3fd18f', hoverColor: '#ffffff',
    lastMoveColor: '#2b6fe0', highlightOpacity: 0.85,
    skyColor: '#ffffff', groundColor: '#9aa7b8', ambientIntensity: 1.2,
    sunColor: '#fff9f0', sunIntensity: 1.3, fillColor: '#c9d8f0', fillIntensity: 0.5, exposure: 1,
  }),

  marble: def('Marble', {
    background: '#2c2b2f', latticeColor: '#efe9df', latticeOpacity: 0.2, frameColor: '#8d8781',
    plateColor: '#3e3b3f', plateOpacity: 0.4, ghostLevel: 0.25,
    redColor: '#8f2626', blackColor: '#1f1f22', pieceRoughness: 0.3, pieceMetalness: 0.1,
    kingGlowColor: '#f2d59b', kingGlow: 0.3,
    moveColor: '#3ddc84', captureColor: '#ffa62b', finalColor: '#9ff0c4', hoverColor: '#ffffff', lastMoveColor: '#8eb4ff',
    skyColor: '#fff8f0', groundColor: '#4a4644', ambientIntensity: 1.0,
    sunColor: '#fff7ea', sunIntensity: 1.5, fillColor: '#d0d8e8', fillIntensity: 0.45, exposure: 1,
  }),

  ivory: def('Ivory & Ebony', {
    background: '#2a2621', latticeColor: '#e6dcc3', latticeOpacity: 0.28, frameColor: '#7a6a55',
    plateColor: '#3a342c', plateOpacity: 0.45,
    redColor: '#f0e4c9', blackColor: '#171310', pieceRoughness: 0.55, pieceMetalness: 0,
    kingGlowColor: '#ffe9b0', kingGlow: 0.3,
    moveColor: '#7fe0a8', captureColor: '#ffb84d', finalColor: '#c8f5dd', hoverColor: '#fff6e6', lastMoveColor: '#8fb0e0',
    skyColor: '#fff4e0', groundColor: '#4a4036', ambientIntensity: 1.0,
    sunColor: '#fff5e5', sunIntensity: 1.6, fillColor: '#a8b8d8', fillIntensity: 0.3, exposure: 1.05,
  }),

  forest: def('Emerald Felt', {
    background: '#0f1e18', latticeColor: '#7fcaa2', latticeOpacity: 0.22, frameColor: '#3b5b45',
    plateColor: '#163021', plateOpacity: 0.5,
    redColor: '#c6463a', blackColor: '#1c2620', pieceRoughness: 0.5, pieceMetalness: 0.1,
    kingGlowColor: '#ffe28a', kingGlow: 0.4,
    moveColor: '#b6ff5c', captureColor: '#ff9f43', finalColor: '#e0ffb0', hoverColor: '#f0fff4', lastMoveColor: '#7bd6ff',
    skyColor: '#d6f0dc', groundColor: '#14261b', ambientIntensity: 0.9,
    sunColor: '#fff6d8', sunIntensity: 1.6, fillColor: '#6fb08a', fillIntensity: 0.4, exposure: 1,
  }),

  contrast: def('High Contrast', {
    background: '#000000', fog: false, latticeColor: '#ffffff', latticeOpacity: 0.5, frameColor: '#ffffff',
    plateColor: '#202020', plateOpacity: 0.7, ghostLevel: 0.08,
    redColor: '#ff1a1a', blackColor: '#f5f5f5', pieceRoughness: 0.6, pieceMetalness: 0,
    kingGlowColor: '#ffff00', kingGlow: 1.2,
    moveColor: '#00ff00', captureColor: '#ffff00', finalColor: '#00ffff', hoverColor: '#ffffff',
    lastMoveColor: '#ff00ff', highlightOpacity: 1,
    skyColor: '#ffffff', groundColor: '#404040', ambientIntensity: 1.6,
    sunColor: '#ffffff', sunIntensity: 2.0, fillColor: '#ffffff', fillIntensity: 0.8,
    exposure: 1.1, shadows: false,
  }),
};

/** Merge a preset with per-key user overrides (unknown keys are ignored). */
export function resolveStyle(theme = DEFAULT_THEME, overrides = {}) {
  const base = THEMES[theme] ?? THEMES[DEFAULT_THEME];
  const out = { ...BASE, ...base };
  if (overrides) {
    for (const f of STYLE_FIELDS) if (overrides[f.key] !== undefined) out[f.key] = overrides[f.key];
  }
  return out;
}

/** Name of the preset after `name` in the library (wraps around). */
export function nextTheme(name) {
  const keys = Object.keys(THEMES);
  return keys[(keys.indexOf(name) + 1) % keys.length];
}