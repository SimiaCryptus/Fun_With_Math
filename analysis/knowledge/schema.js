/**
 * schema.js — runtime mirror of knowledge_graph.schema.ts
 * Constants, endpoint discipline, validators and the request-queue derivation.
 * Layer constants are shared with the theory viewer so the two agree.
 */
import { LAYERS, LAYER_COLOR } from '../theory/schema.js';

export { LAYERS, LAYER_COLOR };

/* ------------------------------ entries ------------------------------ */

export const ENTRY_KIND_GROUP = {
  term: 'language',
  notation: 'language',
  abbreviation: 'language',

  concept: 'content',
  object: 'content',
  structure: 'content',
  property: 'content',
  operation: 'content',
  quantity: 'content',
  unit: 'content',
  named_result: 'content',
  method: 'content',
  problem: 'content',

  field: 'context',
  tool: 'context',
  format: 'context',
  dataset: 'context',
  person: 'context',
  work: 'context',
  convention: 'context',
};

export const ENTRY_KINDS = Object.keys(ENTRY_KIND_GROUP);
export const ENTRY_GROUPS = ['language', 'content', 'context'];

export const GROUP_COLOR = {
  language: '#a78bfa',
  content: '#38bdf8',
  context: '#94a3b8',
};

/* --------------------------- definition status ------------------------ */

export const DEFINITION_STATUSES = [
  'defined_here',
  'defined_elsewhere',
  'gestured',
  'assumed_known',
  'ambiguous',
  'conflicting',
  'undefined',
  'unknown',
];

export const NEEDS_FOLLOWUP = {
  defined_here: false,
  defined_elsewhere: false,
  assumed_known: true,
  gestured: true,
  ambiguous: true,
  conflicting: true,
  undefined: true,
  unknown: true,
};

/** Lane colour: green = settled, warm = owed, grey = unclassified. */
export const STATUS_COLOR = {
  defined_here: '#34d399',
  defined_elsewhere: '#4ade80',
  gestured: '#fbbf24',
  assumed_known: '#fb923c',
  ambiguous: '#f472b6',
  conflicting: '#ff6b6b',
  undefined: '#94a3b8',
  unknown: '#64748b',
};

export const ROLES = [
  'introduced',
  'central',
  'supporting',
  'background',
  'incidental',
  'questioned',
  'rejected',
];

export const MENTION_ROLES = [
  'introduces',
  'defines',
  'uses',
  'cites',
  'contrasts',
  'questions',
  'renames',
  'exemplifies',
];

/* ----------------------------- relations ----------------------------- */

export const RELATION_GROUP = {
  synonym_of: 'lexical',
  abbreviation_of: 'lexical',
  variant_of: 'lexical',
  notation_for: 'lexical',
  homonym_of: 'lexical',
  renames: 'lexical',

  is_a: 'taxonomic',
  instance_of: 'taxonomic',
  part_of: 'taxonomic',
  has_part: 'taxonomic',
  generalizes: 'taxonomic',
  specializes: 'taxonomic',

  defined_in_terms_of: 'definitional',
  presupposes: 'definitional',
  prerequisite_of: 'definitional',
  disambiguated_by: 'definitional',

  operates_on: 'functional',
  produces: 'functional',
  parameterized_by: 'functional',
  measured_by: 'functional',
  implements: 'functional',
  computes: 'functional',
  applies_to: 'functional',

  co_occurs_with: 'discourse',
  contrasts_with: 'discourse',
  alternative_to: 'discourse',
  analogous_to: 'discourse',
  example_of: 'discourse',
  counterexample_to: 'discourse',
  motivates: 'discourse',
  see_also: 'discourse',

  attributed_to: 'provenance',
  introduced_in: 'provenance',
  documented_in: 'provenance',
  cites: 'provenance',
};

export const RELATION_KINDS = Object.keys(RELATION_GROUP);

export const RELATION_GROUPS = [
  'lexical',
  'taxonomic',
  'definitional',
  'functional',
  'discourse',
  'provenance',
];

export const RELATION_GROUP_COLOR = {
  lexical: '#a78bfa',
  taxonomic: '#34d399',
  definitional: '#fbbf24',
  functional: '#38bdf8',
  discourse: '#7f8ea3',
  provenance: '#2dd4bf',
};

/** CSS class per relation, derived from its group. */
export const RELATION_CLASS = (() => {
  const m = {};
  for (const [rel, grp] of Object.entries(RELATION_GROUP)) m[rel] = `rel-${grp}`;
  return m;
})();

export const SYMMETRIC_RELATIONS = [
  'synonym_of',
  'homonym_of',
  'variant_of',
  'co_occurs_with',
  'contrasts_with',
  'alternative_to',
  'analogous_to',
  'see_also',
];

export const INVERSE_RELATION = {
  synonym_of: 'synonym_of',
  homonym_of: 'homonym_of',
  variant_of: 'variant_of',
  co_occurs_with: 'co_occurs_with',
  contrasts_with: 'contrasts_with',
  alternative_to: 'alternative_to',
  analogous_to: 'analogous_to',
  see_also: 'see_also',
  part_of: 'has_part',
  has_part: 'part_of',
  generalizes: 'specializes',
  specializes: 'generalizes',
  presupposes: 'prerequisite_of',
  prerequisite_of: 'presupposes',
};

export const ACYCLIC_RELATIONS = [
  'is_a',
  'part_of',
  'specializes',
  'defined_in_terms_of',
  'presupposes',
  'prerequisite_of',
];

export const DEPENDENCY_RELATIONS = ['defined_in_terms_of', 'presupposes'];

export const RELATION_ENDPOINT_RULES = {
  notation_for: { from: ['notation', 'abbreviation'] },
  abbreviation_of: { from: ['abbreviation', 'notation'] },
  attributed_to: { to: ['person'] },
  introduced_in: { to: ['work', 'dataset', 'tool'] },
  documented_in: { to: ['work', 'dataset', 'tool', 'format'] },
  implements: { from: ['tool', 'method', 'dataset'] },
  measured_by: { to: ['quantity', 'unit', 'method'] },
  parameterized_by: { to: ['quantity', 'unit', 'object', 'structure'] },
};

/* ------------------------------- lanes ------------------------------- */

export const LANE_MODES = ['status', 'group', 'kind', 'layer'];

export const NO_LAYER = 'unlayered';

export function laneKeyOf(entry, mode = 'status') {
  switch (mode) {
    case 'group':
      return groupOf(entry);
    case 'kind':
      return entry.kind;
    case 'layer':
      return (entry.layers && entry.layers[0]) || NO_LAYER;
    default:
      return entry.definition_status || 'unknown';
  }
}

export function laneOrder(mode = 'status') {
  switch (mode) {
    case 'group':
      return [...ENTRY_GROUPS];
    case 'kind':
      return [...ENTRY_KINDS];
    case 'layer':
      return [...LAYERS, NO_LAYER];
    default:
      return [...DEFINITION_STATUSES];
  }
}

export function laneColor(key, mode = 'status') {
  switch (mode) {
    case 'group':
      return GROUP_COLOR[key] || '#888';
    case 'kind':
      return GROUP_COLOR[ENTRY_KIND_GROUP[key]] || '#888';
    case 'layer':
      return LAYER_COLOR[key] || '#64748b';
    default:
      return STATUS_COLOR[key] || '#888';
  }
}

/* ------------------------------ helpers ------------------------------ */

export const groupOf = (e) => ENTRY_KIND_GROUP[e.kind] || 'content';
export const mentionCount = (e) => e.mention_count ?? (e.mentions || []).length;
export const needsDefinition = (e) => NEEDS_FOLLOWUP[e.definition_status] ?? true;
export const isSymmetric = (r) => SYMMETRIC_RELATIONS.includes(r);

const in01 = (x) => typeof x !== 'number' || (x >= 0 && x <= 1);

/** Normalised weighted degree in [0,1], keyed by entry id. */
export function centrality(g) {
  const degree = new Map();
  for (const e of g.entries || []) degree.set(e.id, 0);
  for (const edge of g.edges || []) {
    const w = edge.strength ?? 1;
    if (degree.has(edge.from)) degree.set(edge.from, degree.get(edge.from) + w);
    if (degree.has(edge.to)) degree.set(edge.to, degree.get(edge.to) + w);
  }
  let max = 0;
  for (const v of degree.values()) if (v > max) max = v;
  const out = new Map();
  for (const [k, v] of degree) out.set(k, max > 0 ? v / max : 0);
  return out;
}

/* ----------------------------- validation ---------------------------- */

export function validateKnowledgeGraph(g) {
  const problems = [];
  if (!g || typeof g !== 'object') return ['not an object'];
  if (!Array.isArray(g.entries)) return ['missing entries[]'];
  if (!Array.isArray(g.edges)) problems.push('missing edges[]');
  if (!g.corpus || !Array.isArray(g.corpus.documents)) problems.push('missing corpus.documents[]');

  const ids = new Set();
  const senseIds = new Set();
  const kindById = new Map();

  for (const e of g.entries) {
    if (ids.has(e.id)) problems.push(`duplicate entry id: ${e.id}`);
    ids.add(e.id);
    kindById.set(e.id, e.kind);

    if (!ENTRY_KINDS.includes(e.kind)) problems.push(`bad kind on ${e.id}: ${e.kind}`);
    if (!e.label || !String(e.label).trim()) problems.push(`empty label on ${e.id}`);
    if (!DEFINITION_STATUSES.includes(e.definition_status)) {
      problems.push(`bad definition_status on ${e.id}: ${e.definition_status}`);
    }
    if (!e.mentions || !e.mentions.length) {
      problems.push(`entry without mentions (phantom?): ${e.id}`);
    }
    for (const m of e.mentions || []) {
      if (!m.source || !m.source.file) problems.push(`mention without source file on ${e.id}`);
    }
    if (!in01(e.confidence)) problems.push(`confidence out of [0,1] on ${e.id}`);
    if (e.mention_count !== undefined && e.mentions && e.mention_count !== e.mentions.length) {
      problems.push(`mention_count disagrees with mentions on ${e.id}`);
    }
    for (const l of e.layers || []) {
      if (!isLayer(l)) problems.push(`bad layer on ${e.id}: ${l}`);
    }
    if ((e.layers || []).length > 1 && !(e.layer_drift || '').trim() && !(e.senses || []).length) {
      problems.push(`multi-layer entry ${e.id} needs layer_drift or senses`);
    }
    if (e.gloss && !e.gloss.verbatim && !e.gloss.provisional) {
      problems.push(`gloss on ${e.id} must be marked verbatim or provisional`);
    }
    if (
      (e.senses || []).length > 1 &&
      e.definition_status !== 'ambiguous' &&
      e.definition_status !== 'conflicting' &&
      e.definition_status !== 'defined_here'
    ) {
      problems.push(
        `entry ${e.id} has ${e.senses.length} senses but status "${e.definition_status}"`
      );
    }
    for (const s of e.senses || []) {
      if (senseIds.has(s.id)) problems.push(`duplicate sense id: ${s.id}`);
      senseIds.add(s.id);
      if (!String(s.id).startsWith(`${e.id}#`)) {
        problems.push(`sense id must be "<entry-id>#<slug>": ${s.id} on ${e.id}`);
      }
      if (s.layer && !isLayer(s.layer)) problems.push(`bad sense layer on ${s.id}: ${s.layer}`);
    }
    if (e.definition_status === 'defined_here' && !e.definition_ref && !e.gloss) {
      problems.push(`"defined_here" on ${e.id} with neither gloss nor definition_ref`);
    }
    if (
      e.definition_status === 'defined_elsewhere' &&
      !(e.definition_ref && (e.definition_ref.citation || e.definition_ref.entry || e.definition_ref.node))
    ) {
      problems.push(`"defined_elsewhere" on ${e.id} with no definition_ref target`);
    }
  }

  for (const e of g.entries) {
    if (e.definition_ref && e.definition_ref.entry && !ids.has(e.definition_ref.entry)) {
      problems.push(`dangling definition_ref entry on ${e.id}: ${e.definition_ref.entry}`);
    }
    for (const m of e.mentions || []) {
      if (m.sense && !senseIds.has(m.sense)) {
        problems.push(`mention cites unknown sense on ${e.id}: ${m.sense}`);
      }
    }
  }

  // surface-form collisions
  const claim = (map, key, id) => {
    const k = String(key || '').trim().toLowerCase();
    if (!k) return;
    map.set(k, [...(map.get(k) || []), id]);
  };
  const aliasOwners = new Map();
  const symbolOwners = new Map();
  for (const e of g.entries) {
    claim(aliasOwners, e.label, e.id);
    for (const a of e.aliases || []) claim(aliasOwners, a, e.id);
    for (const s of e.symbols || []) claim(symbolOwners, s, e.id);
  }
  for (const [k, owners] of aliasOwners) {
    if (owners.length > 1) problems.push(`alias collision "${k}": ${owners.join(', ')}`);
  }
  for (const [k, owners] of symbolOwners) {
    if (owners.length > 1) problems.push(`notation clash "${k}": ${owners.join(', ')}`);
  }

  const edgeIds = new Set();
  const seenPairs = new Set();
  for (const edge of g.edges || []) {
    if (edgeIds.has(edge.id)) problems.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!RELATION_KINDS.includes(edge.relation)) {
      problems.push(`bad relation on ${edge.id}: ${edge.relation}`);
      continue;
    }
    if (!ids.has(edge.from)) problems.push(`dangling edge source: ${edge.id} -> ${edge.from}`);
    if (!ids.has(edge.to)) problems.push(`dangling edge target: ${edge.id} -> ${edge.to}`);
    if (edge.from === edge.to) problems.push(`self-relation on ${edge.id}`);
    if (!in01(edge.confidence)) problems.push(`confidence out of [0,1] on ${edge.id}`);
    if (!in01(edge.strength)) problems.push(`strength out of [0,1] on ${edge.id}`);

    const key = isSymmetric(edge.relation)
      ? `${edge.relation}|${[edge.from, edge.to].sort().join('|')}`
      : `${edge.relation}|${edge.from}|${edge.to}`;
    if (seenPairs.has(key)) problems.push(`redundant relation on ${edge.id} (${edge.relation})`);
    seenPairs.add(key);

    const rule = RELATION_ENDPOINT_RULES[edge.relation];
    const kf = kindById.get(edge.from);
    const kt = kindById.get(edge.to);
    if (rule && rule.from && kf && !rule.from.includes(kf)) {
      problems.push(
        `relation ${edge.relation} on ${edge.id} must originate in ${rule.from.join('|')}, got ${kf}`
      );
    }
    if (rule && rule.to && kt && !rule.to.includes(kt)) {
      problems.push(
        `relation ${edge.relation} on ${edge.id} must target ${rule.to.join('|')}, got ${kt}`
      );
    }
    if (edge.from_sense && !senseIds.has(edge.from_sense)) {
      problems.push(`edge ${edge.id} cites unknown from_sense: ${edge.from_sense}`);
    }
    if (edge.to_sense && !senseIds.has(edge.to_sense)) {
      problems.push(`edge ${edge.id} cites unknown to_sense: ${edge.to_sense}`);
    }
  }

  const requestIds = new Set();
  for (const r of g.requests || []) {
    if (requestIds.has(r.id)) problems.push(`duplicate request id: ${r.id}`);
    requestIds.add(r.id);
    if (!ids.has(r.entry)) problems.push(`request ${r.id} targets unknown entry: ${r.entry}`);
    if (!r.reason || !String(r.reason).trim()) problems.push(`request without reason: ${r.id}`);
    if (!in01(r.score)) problems.push(`score out of [0,1] on ${r.id}`);
    for (const b of r.blocked_by || []) {
      if (!ids.has(b)) problems.push(`request ${r.id} blocked by unknown entry: ${b}`);
    }
  }

  for (const t of g.topics || []) {
    for (const member of t.members || []) {
      if (!ids.has(member)) problems.push(`topic ${t.id} has unknown member: ${member}`);
    }
    if (t.root && !ids.has(t.root)) problems.push(`topic ${t.id} has unknown root: ${t.root}`);
  }

  for (const i of g.unresolved || []) {
    for (const r of i.refs || []) {
      if (!ids.has(r) && !edgeIds.has(r) && !requestIds.has(r) && !senseIds.has(r)) {
        problems.push(`issue "${i.kind}" references unknown id: ${r}`);
      }
    }
  }

  for (const c of findCycles(g)) problems.push(`cycle: ${c.join(' -> ')}`);
  return problems;
}

/** Cycles over ACYCLIC_RELATIONS only. */
export function findCycles(g) {
  const adj = new Map();
  for (const e of g.edges || []) {
    if (!ACYCLIC_RELATIONS.includes(e.relation)) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const cycles = [];
  const state = new Map();
  const stack = [];
  const walk = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adj.get(id) || []) {
      const s = state.get(next) ?? 0;
      if (s === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
      else if (s === 0) walk(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const e of g.entries || []) if ((state.get(e.id) ?? 0) === 0) walk(e.id);
  return cycles;
}

/**
 * Derive the follow-up queue: every entry whose meaning the corpus never
 * settles, ranked by how much of the discussion leans on it.
 */
export function findDefinitionGaps(g) {
  const cent = centrality(g);
  const maxMentions = Math.max(1, ...(g.entries || []).map(mentionCount));
  const undefinedIds = new Set((g.entries || []).filter(needsDefinition).map((e) => e.id));

  const blockers = new Map();
  for (const e of g.edges || []) {
    if (!DEPENDENCY_RELATIONS.includes(e.relation)) continue;
    if (!undefinedIds.has(e.to)) continue;
    blockers.set(e.from, [...(blockers.get(e.from) || []), e.to]);
  }

  const wantFor = (e) => {
    if (e.kind === 'notation' || e.kind === 'abbreviation') return 'notation_key';
    if (e.definition_status === 'ambiguous' || e.definition_status === 'conflicting')
      return 'disambiguation';
    if (e.definition_status === 'gestured') return 'formal_definition';
    if (groupOf(e) === 'context') return 'citation';
    return 'gloss';
  };

  const requests = [];
  for (const e of g.entries || []) {
    if (!needsDefinition(e)) continue;
    const score = 0.5 * (cent.get(e.id) ?? 0) + 0.5 * (mentionCount(e) / maxMentions);
    if (score === 0 && mentionCount(e) < 2) continue;
    const slug = e.id.includes('.') ? e.id.slice(e.id.indexOf('.') + 1) : e.id;
    requests.push({
      id: `q.${slug}`,
      entry: e.id,
      reason:
        `"${e.label}" is ${String(e.definition_status).replace(/_/g, ' ')} after ` +
        `${mentionCount(e)} mention(s)` +
        ((e.grounds || []).length ? ` and grounds ${e.grounds.length} theory node(s)` : ''),
      wants: wantFor(e),
      priority: score >= 0.66 ? 'high' : score >= 0.33 ? 'medium' : 'low',
      score: Number(score.toFixed(3)),
      blocked_by: blockers.get(e.id),
      status: 'open',
      sources: (e.mentions || []).slice(0, 2).map((m) => m.source),
    });
  }
  return requests.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Advisory checks — feed into `unresolved`, do not fail on them. */
export function findAdvisoryIssues(g) {
  const issues = [];
  const degree = new Map();
  for (const e of g.edges || []) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  for (const e of g.entries || []) {
    if ((degree.get(e.id) || 0) === 0 && !(e.grounds || []).length) {
      issues.push({
        kind: 'orphan_entry',
        description: `"${e.label}" has no relations and grounds nothing — is it load-bearing?`,
        refs: [e.id],
      });
    }
    if (!(e.grounds || []).length && e.role === 'central') {
      issues.push({
        kind: 'unbridged_entry',
        description: `central entry "${e.label}" grounds no theory node`,
        refs: [e.id],
      });
    }
    if ((e.layers || []).length > 1 && !(e.layer_drift || '').trim()) {
      issues.push({
        kind: 'layer_drift',
        description: `"${e.label}" is used at ${e.layers.join(', ')} with no reconciliation`,
        refs: [e.id],
        layers: e.layers,
      });
    }
    if (e.definition_status === 'conflicting') {
      issues.push({
        kind: 'conflicting_definitions',
        description: `"${e.label}" is defined incompatibly in the corpus`,
        refs: [e.id],
      });
    }
  }
  return issues;
}

export function computeStats(g) {
  const by_kind = {},
    by_group = {},
    by_relation = {},
    by_relation_group = {},
    by_definition_status = {},
    by_layer = {};
  let mentions = 0,
    undefinedEntries = 0,
    bridged = 0;

  for (const e of g.entries || []) {
    by_kind[e.kind] = (by_kind[e.kind] ?? 0) + 1;
    const grp = groupOf(e);
    by_group[grp] = (by_group[grp] ?? 0) + 1;
    by_definition_status[e.definition_status] = (by_definition_status[e.definition_status] ?? 0) + 1;
    for (const l of e.layers || []) by_layer[l] = (by_layer[l] ?? 0) + 1;
    mentions += mentionCount(e);
    if (needsDefinition(e)) undefinedEntries++;
    if ((e.grounds || []).length) bridged++;
  }
  for (const e of g.edges || []) {
    by_relation[e.relation] = (by_relation[e.relation] ?? 0) + 1;
    const grp = RELATION_GROUP[e.relation];
    if (grp) by_relation_group[grp] = (by_relation_group[grp] ?? 0) + 1;
  }

  return {
    documents: ((g.corpus && g.corpus.documents) || []).length,
    entries: (g.entries || []).length,
    edges: (g.edges || []).length,
    requests: (g.requests || []).length,
    by_kind,
    by_group,
    by_relation,
    by_relation_group,
    by_definition_status,
    by_layer,
    undefined_entries: undefinedEntries,
    bridged_entries: bridged,
    mentions,
  };
}

/**
 * Tolerate the usual authoring slips: edges parked inside `entries[]`,
 * missing arrays, absent `mention_count`. Report what was repaired.
 */
export function normalizeGraph(raw) {
  const g = {
    ...raw,
    entries: [],
    edges: [...(raw.edges || [])],
    requests: [...(raw.requests || [])],
    topics: [...(raw.topics || [])],
    unresolved: [...(raw.unresolved || [])],
  };
  const repairs = [];
  for (const item of raw.entries || []) {
    if (item && item.from && item.to) {
      g.edges.push({ ...item, relation: item.relation || 'co_occurs_with' });
      repairs.push({ id: item.id, as: item.relation ? 'edge' : 'edge (relation guessed)' });
      continue;
    }
    const e = { ...item };
    if (!e.definition_status) {
      e.definition_status = 'unknown';
      repairs.push({ id: e.id, as: 'definition_status defaulted to unknown' });
    }
    if (e.mention_count === undefined) e.mention_count = (e.mentions || []).length;
    g.entries.push(e);
  }
  return { graph: g, repairs };
}