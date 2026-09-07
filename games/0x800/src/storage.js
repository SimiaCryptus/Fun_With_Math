// storage.js — localStorage load/save. Every access is wrapped so private
// mode / disabled storage degrade to "nothing persists" instead of crashing.

import { serialize, deserialize } from './game.js';

const NS = '0x800';
export const PREFS_KEY = `${NS}:prefs`;
export const stateKey = (radius) => `${NS}:state:r${radius}`;
export const bestKey = (radius) => `${NS}:best:r${radius}`;

export const DEFAULT_PREFS = Object.freeze({
  theme: 'auto', // auto | light | dark | contrast
  hexScore: true,
  sound: false,
  reduceMotion: false,
  radius: 2,
});

const get = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k, v) => {
  try {
    localStorage.setItem(k, v);
    return true;
  } catch {
    return false;
  }
};
const del = (k) => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

export function loadState(radius) {
  const raw = get(stateKey(radius));
  if (!raw) return null;
  const s = deserialize(raw);
  return s && s.radius === radius ? s : null;
}

export function saveState(state) {
  return set(stateKey(state.radius), serialize(state));
}

export function clearState(radius) {
  del(stateKey(radius));
}

export function loadBest(radius) {
  const n = Number(get(bestKey(radius)));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function saveBest(radius, best) {
  if (best > loadBest(radius)) set(bestKey(radius), String(best));
}

export function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(get(PREFS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  return set(PREFS_KEY, JSON.stringify({ ...DEFAULT_PREFS, ...prefs }));
}
