/** settings.js — persistence (§9) and the lobby sheet. */

const SETTINGS_KEY = 'troggle.settings';
const STATS_KEY = 'troggle.stats';

export const DEFAULTS = Object.freeze({
  size: 4,
  adjacency: 'corner',
  duration: 180,
  minWordLength: null,
  speechLang: 'en-US',
  reducedMotion: false,
  colorblind: false,
  sound: false,
});

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : null) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* private mode */ }
}

export function loadStats() {
  try {
    return JSON.parse(localStorage.getItem(STATS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function recordRound(results) {
  try {
    const stats = loadStats();
    const key = `s${results.size}`;
    const prev = stats[key] ?? { best: 0, rounds: 0, words: 0 };
    stats[key] = {
      best: Math.max(prev.best, results.score),
      rounds: prev.rounds + 1,
      words: prev.words + results.found.length,
    };
    stats.history = [
      { at: Date.now(), seed: results.seedString, score: results.score },
      ...(stats.history ?? []),
    ].slice(0, 30);
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch { /* ignore */ }
}

/**
 * Show the lobby; resolves with `{action, settings, seedString}` or null.
 */
export function openLobby(settings) {
  const dlg = document.getElementById('lobby');
  const size = document.getElementById('set-size');
  const adjacency = document.getElementById('set-adjacency');
  const duration = document.getElementById('set-duration');
  const reduced = document.getElementById('set-reduced');
  const seed = document.getElementById('seed-input');

  size.value = String(settings.size);
  adjacency.value = settings.adjacency;
  duration.value = String(settings.duration);
  reduced.checked = !!settings.reducedMotion;
  seed.value = '';

  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      const action = dlg.returnValue;
      const next = {
        size: Number(size.value),
        adjacency: adjacency.value,
        duration: Number(duration.value),
        reducedMotion: reduced.checked,
      };
      if (action === 'play' || action === 'daily') {
        resolve({ action, settings: next, seedString: seed.value.trim() || null });
      } else {
        resolve(null);
      }
    };
    dlg.addEventListener('close', onClose);
    if (!dlg.open) dlg.showModal();
  });
}

export default loadSettings;