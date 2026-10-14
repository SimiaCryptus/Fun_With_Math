export function minimalTable(store) {
  const rows = [];
  for (const [n, costs] of store.byValue) {
    const c = Math.min(...costs.keys());
    const e = costs.get(c);
    rows.push({ n, cost: c, count: e.count, entry: e });
  }
  return rows.sort((a, b) => a.n - b.n);
}

export function spectrum(store, n) {
  const out = {};
  const m = store.byValue.get(n);
  if (m) for (const [c, e] of [...m].sort((a, b) => a[0] - b[0])) out[c] = e.count;
  return out;
}

export function valuesAtCost(store, k) {
  return [...(store.byCost.get(k)?.keys() || [])].sort((a, b) => a - b);
}

// Smallest/largest n with C(n) = k, within the computed range.
export function records(rows) {
  const m = new Map();
  for (const r of rows) {
    const rec = m.get(r.cost);
    if (!rec) m.set(r.cost, { cost: r.cost, smallest: r.n, largest: r.n });
    else { rec.smallest = Math.min(rec.smallest, r.n); rec.largest = Math.max(rec.largest, r.n); }
  }
  return [...m.values()].sort((a, b) => a.cost - b.cost);
}

export function topOps(store, n) {
  const c = store.minCost(n);
  const e = store.get(n, c);
  if (!e) return [];
  if (!e.derivations.length) return ['atom'];
  return [...new Set(e.derivations.map(d => d[0]))];
}

export function toJSON(rows) {
  return JSON.stringify(rows.map(({ n, cost, count, example }) => ({ n, cost, count, example })), null, 1);
}

export function toCSV(rows) {
  const lines = ['n,cost,count,example'];
  for (const r of rows) lines.push(`${r.n},${r.cost},${r.count},"${r.example ?? ''}"`);
  return lines.join('\n');
}