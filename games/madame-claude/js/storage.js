// Session/local storage helpers. Every call is wrapped because storage can be
// unavailable (private mode, strict settings) and the game must still work.

const KEY = 'madame-claude:apiKey';
const REMEMBER = 'madame-claude:remember';
const MODEL = 'madame-claude:model';

function safe(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

export function loadApiKey() {
  return safe(() => localStorage.getItem(KEY)) || safe(() => sessionStorage.getItem(KEY)) || '';
}

export function isRemembered() {
  return safe(() => localStorage.getItem(REMEMBER)) === '1';
}

export function clearApiKey() {
  safe(() => localStorage.removeItem(KEY));
  safe(() => sessionStorage.removeItem(KEY));
}

export function saveApiKey(key, remember) {
  clearApiKey();
  safe(() => localStorage.setItem(REMEMBER, remember ? '1' : '0'));
  if (!key) return;
  safe(() => (remember ? localStorage : sessionStorage).setItem(KEY, key));
}

export function loadModel() {
  return safe(() => localStorage.getItem(MODEL)) || '';
}

export function saveModel(model) {
  safe(() => (model ? localStorage.setItem(MODEL, model) : localStorage.removeItem(MODEL)));
}