const KEY = 'mineminer.settings';
const VERSION = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  version: VERSION,
  cascade: 'on', // 'on' | 'off' | 'single-layer'
  adjacency: 26, // 26 | 6
  lives: '1', // '1' | '3' | 'inf'
  safeFirstStrike: true,
  strictMarks: true,
  undo: true,
  effects: 'med', // 'low' | 'med' | 'high'
  volume: 0.6,
  colourblind: false,
  reducedMotion: false,
});

export function loadSettings() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (parsed.version !== VERSION) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...settings, version: VERSION }));
  } catch {
    /* storage unavailable */
  }
}

export function livesFromSetting(value) {
  if (value === 'inf' || value === Infinity) return Infinity;
  return Number(value) || 1;
}