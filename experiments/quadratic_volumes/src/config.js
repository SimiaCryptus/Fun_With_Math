// Defaults plus URL-hash (de)serialization, so any run is shareable.

export const DEFAULTS = {
  dataset: 'bilogistic',
  seed: 1,
  N: 20000,
  maxDepth: 6,
  epsK: 10,
  nMin: 50,
  families: ['tightBox', 'axis'],
  protocol: 'fullSample',
  params: {},
};

export function epsToVEps(epsK, d = 3) {
  return Math.pow(2, -epsK * d);
}

export function readHash(defaults = DEFAULTS) {
  const out = { ...defaults, params: { ...defaults.params } };
  const h = typeof location !== 'undefined' ? location.hash.slice(1) : '';
  if (!h) return out;
  try {
    Object.assign(out, JSON.parse(decodeURIComponent(h)));
  } catch (e) {
    /* ignore malformed hash */
  }
  return out;
}

export function writeHash(cfg) {
  if (typeof location === 'undefined') return;
  location.hash = encodeURIComponent(JSON.stringify(cfg));
}