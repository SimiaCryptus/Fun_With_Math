export const KIND_ORDER = [
  'theory',
  'model',
  'axiom',
  'definition',
  'theorem',
  'lemma',
  'conjecture',
  'heuristic',
  'observation',
  'experiment',
  'artifact',
  'open_question',
];

export const RELATION_ORDER = [
  'depends_on',
  'assumes',
  'implies',
  'refines',
  'specializes',
  'generalizes',
  'equivalent_to',
  'instantiates',
  'supports',
  'refutes',
  'contradicts',
  'motivates',
  'tests',
  'measures',
  'cites',
];

const INVERSE_PHRASE = {
  depends_on: 'is depended on by',
  assumes: 'is assumed by',
  implies: 'is implied by',
  refines: 'is refined by',
  specializes: 'is specialized by',
  generalizes: 'is generalized by',
  equivalent_to: 'equivalent to',
  instantiates: 'is instantiated by',
  supports: 'is supported by',
  refutes: 'is refuted by',
  contradicts: 'contradicts',
  motivates: 'is motivated by',
  tests: 'is tested by',
  measures: 'is measured by',
  cites: 'is cited by',
};

export const inversePhrase = (r) => INVERSE_PHRASE[r] ?? `←${r}`;

function push(map, key, value) {
  const arr = map.get(key);
  if (arr) arr.push(value);
  else map.set(key, [value]);
}

function tally(items, get) {
  const m = new Map();
  for (const it of items) {
    const k = get(it) ?? '—';
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]));
}

/** Build all the lookup tables the UI needs. */
export function indexGraph(graph) {
  const nodes = new Map();
  const order = new Map();
  graph.nodes.forEach((n, i) => {
    nodes.set(n.id, n);
    order.set(n.id, i);
  });

  const out = new Map();
  const inc = new Map();
  for (const e of graph.edges) {
    push(out, e.from, e);
    push(inc, e.to, e);
  }

  const clustersOf = new Map();
  for (const c of graph.clusters) for (const m of c.members) push(clustersOf, m, c);

  const issuesOf = new Map();
  for (const i of graph.unresolved) for (const r of i.refs ?? []) push(issuesOf, r, i);

  const docById = new Map();
  const docByFile = new Map();
  for (const d of graph.corpus.documents ?? []) {
    docById.set(d.id, d);
    docByFile.set(String(d.path).split('/').pop(), d);
  }

  const searchText = new Map();
  for (const n of graph.nodes) {
    const parts = [
      n.id,
      n.name,
      n.statement,
      n.formal,
      n.notes,
      n.scope,
      n.kind,
      n.status,
      n.domain,
      ...(n.aliases ?? []),
      ...(n.tags ?? []),
      ...(n.notation ?? []),
    ];
    for (const a of n.attributes ?? []) parts.push(a.key, a.value, a.unit);
    for (const s of n.sources ?? []) parts.push(s.file, s.heading, s.quote);
    searchText.set(n.id, parts.filter(Boolean).join(' \u0001 ').toLowerCase());
  }

  const degree = new Map();
  for (const e of graph.edges) {
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
  }

  const facets = {
    kind: tally(graph.nodes, (n) => n.kind),
    status: tally(graph.nodes, (n) => n.status),
    domain: tally(graph.nodes, (n) => n.domain),
  };

  return {
    graph,
    nodes,
    order,
    out,
    inc,
    clustersOf,
    issuesOf,
    docById,
    docByFile,
    searchText,
    degree,
    facets,
    edges: graph.edges,
  };
}

export const edgesOut = (idx, id) => idx.out.get(id) ?? [];
export const edgesIn = (idx, id) => idx.inc.get(id) ?? [];
export const clustersOf = (idx, id) => idx.clustersOf.get(id) ?? [];
export const issuesOf = (idx, id) => idx.issuesOf.get(id) ?? [];

/** Apply the sidebar filters. */
export function filterNodes(idx, s) {
  const terms = s.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const result = [];
  for (const n of idx.graph.nodes) {
    if (s.kinds.size && !s.kinds.has(n.kind)) continue;
    if (s.statuses.size && !s.statuses.has(n.status)) continue;
    if (s.domains.size && !s.domains.has(n.domain ?? '—')) continue;
    if (s.cluster && !clustersOf(idx, n.id).some((c) => c.id === s.cluster)) continue;
    if ((n.confidence ?? 1) < s.minConfidence) continue;
    if (terms.length) {
      const blob = idx.searchText.get(n.id) ?? '';
      if (!terms.every((t) => blob.includes(t))) continue;
    }
    result.push(n);
  }
  return sortNodes(idx, result, s.sort);
}

export function sortNodes(idx, list, mode = 'kind') {
  const byName = (a, b) => a.name.localeCompare(b.name);
  const copy = [...list];
  switch (mode) {
    case 'name':
      return copy.sort(byName);
    case 'confidence':
      return copy.sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0) || byName(a, b));
    case 'degree':
      return copy.sort(
        (a, b) => (idx.degree.get(b.id) ?? 0) - (idx.degree.get(a.id) ?? 0) || byName(a, b)
      );
    case 'document':
      return copy.sort((a, b) => {
        const da = idx.docById.get(a.first_seen)?.order ?? 999;
        const db = idx.docById.get(b.first_seen)?.order ?? 999;
        return da - db || idx.order.get(a.id) - idx.order.get(b.id);
      });
    case 'kind':
    default:
      return copy.sort(
        (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || byName(a, b)
      );
  }
}

/** Group a sorted node list into `[label, nodes]` pairs. */
export function groupNodes(idx, list, mode) {
  const key =
    {
      kind: (n) => n.kind,
      name: (n) => n.name[0].toUpperCase(),
      confidence: (n) => `confidence ${(Math.floor((n.confidence ?? 0) * 20) / 20).toFixed(2)}`,
      degree: () => 'by connectivity',
      document: (n) => idx.docById.get(n.first_seen)?.title ?? n.first_seen ?? '—',
    }[mode] ?? ((n) => n.kind);

  const groups = [];
  let current = null;
  for (const n of list) {
    const k = key(n);
    if (!current || current[0] !== k) groups.push((current = [k, []]));
    current[1].push(n);
  }
  return groups;
}

/** Undirected BFS around `id`, returning the induced sub-graph. */
export function neighborhood(idx, id, depth = 1) {
  const ids = new Set();
  if (!idx.nodes.has(id)) return { ids, edges: [] };
  let frontier = [id];
  ids.add(id);
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const e of edgesOut(idx, cur)) if (!ids.has(e.to)) (ids.add(e.to), next.push(e.to));
      for (const e of edgesIn(idx, cur)) if (!ids.has(e.from)) (ids.add(e.from), next.push(e.from));
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { ids, edges: idx.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
}

export function inducedEdges(idx, ids) {
  return idx.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
}
