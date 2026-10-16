// PD code of the braid closure. X[a,b,c,d]: counter-clockwise from the incoming under-arc.
// Chirality follows NOTES.md conventions; verify against Sage if it matters.
export function braidToPD(word, n) {
  const lab = Array.from({ length: n }, (_, i) => i + 1);
  let next = n + 1;
  const X = [];
  for (const g of word) {
    const i = Math.abs(g) - 1;
    const a = lab[i], b = lab[i + 1], c = next++, d = next++;
    if (g > 0) X.push([b, d, c, a]);
    else X.push([a, b, d, c]);
    lab[i] = c;
    lab[i + 1] = d;
  }
  const map = new Map();
  lab.forEach((l, q) => map.set(l, q + 1));
  const fin = (l) => { while (map.has(l) && map.get(l) !== l) l = map.get(l); return l; };
  const used = [...new Set(X.flat().map(fin))].sort((p, q) => p - q);
  const re = new Map(used.map((l, i) => [l, i + 1]));
  const pd = X.map((x) => x.map((l) => re.get(fin(l))));
  const loose = lab.filter((l, q) => l === q + 1).length;
  return {
    pd,
    text: `PD[${pd.map((x) => `X[${x.join(',')}]`).join(', ')}]` +
      (loose ? `\n(* ${loose} crossing-free strand(s) omitted *)` : ''),
  };
}