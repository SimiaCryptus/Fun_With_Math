import { Config } from '../core/config.js';

function isPrime(p) {
  if (p < 2) return false;
  for (let i = 2; i * i <= p; i++) if (p % i === 0) return false;
  return true;
}

function largestPrimeAtMost(n) {
  for (let p = n; p >= 2; p--) if (isPrime(p)) return p;
  return 2;
}

// Parabola construction: {(x, x^2 mod p)} for largest prime p <= n.
// These p points are guaranteed non-collinear (3 points on a parabola over
// a field are never collinear).
export function parabolaWarmStart(n) {
  const cfg = new Config(n);
  const p = largestPrimeAtMost(n);
  for (let x = 0; x < p; x++) {
    const y = (x * x) % p;
    cfg.forceAdd(x, y);
  }
  return cfg;
}
