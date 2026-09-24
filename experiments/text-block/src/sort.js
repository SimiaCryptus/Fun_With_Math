/**
 * Rotation sorting → SA, plus LCP between neighbouring sorted rotations.
 * The sentinel (if enabled) is appended as the last ring position and is
 * lexicographically smallest. Ties between identical rotations break by offset.
 *
 * O(n² log n) worst case with the direct comparator. Fine for n ≤ a few hundred.
 */

/** Integer code per ring position (code-unit order of graphemes); sentinel = 0. */
export function ringCodes(chars, sentinel = false) {
  const n = chars.length + (sentinel ? 1 : 0);
  const key = new Int32Array(n);
  if (n === 0) return key;
  const distinct = [...new Set(chars.map((c) => c.ch))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rank = new Map(distinct.map((ch, i) => [ch, i + 1]));
  for (let i = 0; i < chars.length; i++) key[i] = rank.get(chars[i].ch);
  if (sentinel) key[n - 1] = 0;
  return key;
}

export function computeSA(chars, { sentinel = false } = {}) {
  const key = ringCodes(chars, sentinel);
  const n = key.length;
  if (n === 0) return new Int32Array(0);

  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => {
    let x = a;
    let y = b;
    for (let k = 0; k < n; k++) {
      const d = key[x] - key[y];
      if (d !== 0) return d;
      if (++x === n) x = 0;
      if (++y === n) y = 0;
    }
    return a - b;
  });
  return Int32Array.from(idx);
}

/**
 * Kasai-style LCP over cyclic rotations: LCP[i] = lcp(rotation SA[i-1], rotation SA[i]),
 * capped at n (identical rotations of periodic text have LCP = n). LCP[0] = 0.
 */
export function computeLCP(codes, sa) {
  const n = sa.length;
  const lcp = new Int32Array(n);
  if (n < 2) return lcp;
  const rank = new Int32Array(n);
  for (let i = 0; i < n; i++) rank[sa[i]] = i;
  let h = 0;
  for (let i = 0; i < n; i++) {
    const r = rank[i];
    if (r === 0) { h = 0; continue; }
    const j = sa[r - 1];
    while (h < n && codes[(i + h) % n] === codes[(j + h) % n]) h++;
    lcp[r] = h;
    if (h > 0) h--;
  }
  return lcp;
}