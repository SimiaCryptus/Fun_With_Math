/** Classical sieve of Eratosthenes (used only to *find* the basis primes). */
export function primesUpTo(limit) {
  const out = [];
  if (limit < 2) return out;
  const composite = new Uint8Array(limit + 1);
  for (let i = 2; i <= limit; i++) {
    if (composite[i]) continue;
    out.push(i);
    for (let j = i * i; j <= limit; j += i) composite[j] = 1;
  }
  return out;
}

const cache = { limit: 0, list: [] };

export function firstNPrimes(n) {
  if (n < 1) return [];
  if (cache.list.length >= n) return cache.list.slice(0, n);
  let limit = Math.max(32, Math.ceil(n * (Math.log(n + 2) + Math.log(Math.log(n + 3) + 1)) * 1.5));
  let list = primesUpTo(limit);
  while (list.length < n) {
    limit *= 2;
    list = primesUpTo(limit);
  }
  cache.limit = limit;
  cache.list = list;
  return list.slice(0, n);
}
