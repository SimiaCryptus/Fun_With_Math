// Seed derivation, hashing and PRNG. Pure functions live at top level so this
// module can also be imported by the Node render script.

/** cyrb53 — small, fast 53-bit string hash. */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** mulberry32 — tiny deterministic PRNG, returns floats in [0, 1). */
export function mulberry32(a) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fold a 53-bit hash down to an unsigned 32-bit integer. */
export function fold32(hash) {
  return (hash ^ Math.floor(hash / 4294967296)) >>> 0;
}

const SHARE_PREFIX = 'h:';

/**
 * Turn any seed string into a hash. Strings of the form "h:<hex>" are treated
 * as a literal, pre-computed hash so share links reproduce a reading exactly
 * without carrying the original seed text.
 */
export function seedToHash(seedString) {
  const m = /^h:([0-9a-f]{1,14})$/i.exec(String(seedString).trim());
  if (m) return parseInt(m[1], 16);
  return cyrb53(String(seedString));
}

export function hashToShareSeed(hash) {
  return SHARE_PREFIX + hash.toString(16);
}

export function rngFromHash(hash) {
  return mulberry32(fold32(hash));
}

/** An independent stream derived from the same hash (e.g. for prose choices). */
export function deriveRng(hash, label) {
  return mulberry32((fold32(hash) ^ cyrb53(label)) >>> 0);
}

export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function normalizeInput(text) {
  return (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function buildDefaultSeed({ location, date, input }) {
  return `${location}|${date}|${normalizeInput(input)}`;
}

let cachedLocation = null;

/**
 * Coarse location string: rounded geolocation → time zone → "unknown".
 * Resolved once per page load; never rejects.
 */
export function getLocation({ timeout = 4000 } = {}) {
  if (cachedLocation) return cachedLocation;
  cachedLocation = new Promise((resolve) => {
    const fallback = () => {
      try {
        resolve(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown');
      } catch {
        resolve('unknown');
      }
    };
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return fallback();
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => finish(fallback), timeout);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish(() => {
          const lat = (Math.round(pos.coords.latitude * 10) / 10).toFixed(1);
          const lon = (Math.round(pos.coords.longitude * 10) / 10).toFixed(1);
          resolve(`${lat},${lon}`);
        }),
        () => finish(fallback),
        { enableHighAccuracy: false, maximumAge: 3600000, timeout },
      );
    } catch {
      finish(fallback);
    }
  });
  return cachedLocation;
}