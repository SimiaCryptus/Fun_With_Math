/**
 * schema.js — runtime mirror of theory_graph.schema.ts
 * Constants, layer discipline, and the validation helpers, in plain ES6.
 */

export const COGNITIVE_LAYERS = ['inspiration', 'fuzzy', 'symbolic', 'deductive', 'numeric'];
export const CONTEXTUAL_LAYERS = ['social', 'ecological'];
export const LAYERS = [...COGNITIVE_LAYERS, ...CONTEXTUAL_LAYERS];

/** Left-to-right lane order used by the viewer. */
export const LANE_ORDER = [
  'social',
  'inspiration',
  'fuzzy',
  'symbolic',
  'deductive',
  'numeric',
  'ecological',
];

export const LAYER_INDEX = {
  inspiration: -2,
  fuzzy: 0,
  symbolic: 1,
  deductive: 2,
  numeric: 3,
  social: null,
  ecological: null,
};

export const LAYER_DUAL = {
  inspiration: 'social',
  social: 'inspiration',
  numeric: 'ecological',
  ecological: 'numeric',
};

export const LAYER_COLOR = {
  inspiration: '#a78bfa',
  fuzzy: '#f472b6',
  symbolic: '#38bdf8',
  deductive: '#34d399',
  numeric: '#fbbf24',
  social: '#fb7185',
  ecological: '#94a3b8',
};

export const LAYER_SEMANTICS = {
  inspiration: {
    identity: 'a directional inference about the space of possible theories',
    truth: null,
  },
  fuzzy: { identity: 'a pre-formal cognitive structure', truth: null },
  symbolic: { identity: 'a term in a rewrite system', truth: 'reachability of a normal form' },
  deductive: { identity: 'a node in a derivation graph', truth: 'closure under inference rules' },
  numeric: {
    identity: 'a limit of computable approximations',
    truth: 'stability under refinement',
  },
  social: { identity: 'a distributed epistemic fact', truth: 'community acceptance' },
  ecological: {
    identity: 'a condition of the working environment',
    truth: 'survival of contact with real constraints',
  },
};

export const NODE_KIND_LAYER = {
  trajectory: 'inspiration',
  analogy: 'inspiration',
  domain_mapping: 'inspiration',
  invariance_hypothesis: 'inspiration',
  knowledge_gap: 'inspiration',

  proto_pattern: 'fuzzy',
  proto_operator: 'fuzzy',
  sketch: 'fuzzy',
  metaphor: 'fuzzy',
  conjecture: 'fuzzy',
  heuristic: 'fuzzy',
  open_question: 'fuzzy',

  definition: 'symbolic',
  notation: 'symbolic',
  rewrite_rule: 'symbolic',
  signature: 'symbolic',
  model: 'symbolic',

  axiom: 'deductive',
  theorem: 'deductive',
  lemma: 'deductive',
  proof: 'deductive',
  theory: 'deductive',

  observation: 'numeric',
  experiment: 'numeric',
  bound: 'numeric',
  certificate: 'numeric',

  reference: 'social',
  norm: 'social',
  research_program: 'social',
  folklore: 'social',

  constraint: 'ecological',
  resource: 'ecological',
  artifact: 'ecological',
};

export const NODE_KINDS = Object.keys(NODE_KIND_LAYER);

export const RELATION_KINDS = [
  'assumes',
  'depends_on',
  'implies',
  'generalizes',
  'specializes',
  'equivalent_to',
  'supports',
  'refutes',
  'contradicts',
  'motivates',
  'tests',
  'measures',
  'refines',
  'instantiates',
  'cites',
  'formalizes',
  'abstracts',
  'analogous_to',
  'steers',
  'selects_for',
  'constrains',
  'stabilizes',
  'dual_of',
];

export const ACYCLIC_RELATIONS = ['assumes', 'depends_on', 'implies', 'refines', 'formalizes'];

export const RELATION_LAYER_RULES = {
  formalizes: { direction: 'descend' },
  abstracts: { direction: 'ascend' },
  analogous_to: { from: ['inspiration', 'fuzzy'] },
  steers: { from: ['inspiration'] },
  selects_for: { from: ['social'] },
  constrains: { from: ['ecological'] },
  dual_of: { direction: 'dual' },
};

/** Visual grouping of relations. */
export const RELATION_CLASS = (() => {
  const m = {};
  const put = (cls, ...rs) => rs.forEach((r) => (m[r] = cls));
  put(
    'rel-logic',
    'assumes',
    'depends_on',
    'implies',
    'generalizes',
    'specializes',
    'equivalent_to',
    'refines',
    'instantiates',
    'cites'
  );
  put('rel-evidence', 'supports', 'tests', 'measures', 'motivates');
  put('rel-conflict', 'refutes', 'contradicts');
  put('rel-cross', 'formalizes', 'abstracts', 'analogous_to', 'dual_of', 'stabilizes');
  put('rel-context', 'steers', 'selects_for', 'constrains');
  return m;
})();

export const MORPHISM_SIGNATURE = {
  extract: { from: ['deductive'], to: ['symbolic'] },
  embed: { from: ['symbolic'], to: ['deductive'] },
  evaluate: { from: ['symbolic'], to: ['numeric'] },
  fit: { from: ['numeric'], to: ['symbolic'] },
  bound: { from: ['deductive'], to: ['numeric'] },
  certify: { from: ['numeric'], to: ['deductive'] },

  formalize_symbolic: { from: ['fuzzy'], to: ['symbolic'] },
  formalize_deductive: { from: ['fuzzy'], to: ['deductive'] },
  formalize_numeric: { from: ['fuzzy'], to: ['numeric'] },
  abstract: { from: ['symbolic', 'deductive', 'numeric'], to: ['fuzzy', 'inspiration'] },

  analogy_extension: { from: ['inspiration'], to: ['inspiration'] },
  analogy_inversion: { from: ['inspiration'], to: ['inspiration'] },
  analogy_fusion: { from: ['inspiration'], to: ['inspiration'] },
  trajectory_refinement: { from: ['inspiration'], to: ['inspiration'] },
  trajectory_branch: { from: ['inspiration'], to: ['inspiration'] },
  trajectory_prune: { from: ['inspiration'], to: ['inspiration'] },
  domain_mapping: { from: ['inspiration'], to: ['inspiration', 'fuzzy'] },
  gap_identification: { from: ['inspiration', 'fuzzy'], to: ['inspiration'] },
  invariance_projection: {
    from: ['inspiration'],
    to: ['fuzzy', 'symbolic', 'deductive', 'numeric'],
  },

  social_selection: { from: ['social'], to: COGNITIVE_LAYERS },
  ecological_constraint: { from: ['ecological'], to: COGNITIVE_LAYERS },
};

export const MORPHISM_KINDS = Object.keys(MORPHISM_SIGNATURE);

export const COHERENCE_LAW = {
  semantic: {
    between: ['numeric', 'symbolic'],
    requirement: 'numeric evaluation must respect symbolic identities',
  },
  logical: {
    between: ['symbolic', 'deductive'],
    requirement: 'symbolic rewrites must preserve provable truths',
  },
  analytic: {
    between: ['deductive', 'numeric'],
    requirement: 'proofs must guarantee the convergence properties they claim',
  },
};

export const STATUSES = [
  'pre_formal',
  'stabilized',
  'accepted',
  'proposed',
  'tested',
  'supported',
  'refuted',
  'superseded',
  'abandoned',
  'unknown',
];

/* ------------------------------------------------------------------ */

export const isCognitive = (l) => COGNITIVE_LAYERS.includes(l);
export const isContextual = (l) => CONTEXTUAL_LAYERS.includes(l);

export function layerOf(node) {
  return node.layer ?? NODE_KIND_LAYER[node.kind] ?? 'fuzzy';
}

export function descentDirection(from, to) {
  const a = LAYER_INDEX[from],
    b = LAYER_INDEX[to];
  if (a === null || a === undefined || b === null || b === undefined) return 'contextual';
  if (a === b) return 'same';
  return b > a ? 'descend' : 'ascend';
}

const in01 = (x) => typeof x !== 'number' || (x >= 0 && x <= 1);

/** Structural validation; returns an array of human-readable problems. */
export function validateTheoryGraph(g) {
  const problems = [];
  if (!g || typeof g !== 'object') return ['not an object'];
  if (!Array.isArray(g.nodes)) return ['missing nodes[]'];
  if (!Array.isArray(g.edges)) problems.push('missing edges[]');
  if (!g.corpus || !Array.isArray(g.corpus.documents)) problems.push('missing corpus.documents[]');

  const ids = new Set();
  const layerById = new Map();

  for (const n of g.nodes) {
    if (ids.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
    ids.add(n.id);
    if (!NODE_KINDS.includes(n.kind)) problems.push(`bad kind on ${n.id}: ${n.kind}`);
    if (n.layer !== undefined && !LAYERS.includes(n.layer))
      problems.push(`bad layer on ${n.id}: ${n.layer}`);
    if (!n.statement || !String(n.statement).trim()) problems.push(`empty statement on ${n.id}`);
    if (!n.sources || !n.sources.length) problems.push(`node without sources: ${n.id}`);
    if (!in01(n.confidence)) problems.push(`confidence out of [0,1] on ${n.id}`);

    const layer = layerOf(n);
    layerById.set(n.id, layer);

    if (n.layer && n.layer !== NODE_KIND_LAYER[n.kind] && !(n.layer_rationale || '').trim()) {
      problems.push(`layer override without layer_rationale on ${n.id} (${n.kind} -> ${n.layer})`);
    }
    if (n.representation && n.representation.layer !== layer) {
      problems.push(
        `representation layer mismatch on ${n.id}: ${n.representation.layer} vs ${layer}`
      );
    }
    if (
      LAYER_SEMANTICS[layer] &&
      LAYER_SEMANTICS[layer].truth === null &&
      (n.status === 'accepted' || n.status === 'refuted')
    ) {
      problems.push(`pre-truth-apt node ${n.id} (${layer}) carries truth-apt status "${n.status}"`);
    }
    for (const iface of (n.representation && n.representation.interfaces) || []) {
      if (iface.via && !MORPHISM_KINDS.includes(iface.via)) {
        problems.push(`bad interface morphism on ${n.id}: ${iface.via}`);
      }
    }
  }

  for (const n of g.nodes) {
    for (const s of n.similar_to || []) {
      if (!ids.has(s.to)) problems.push(`dangling similarity target on ${n.id}: ${s.to}`);
      if (s.to === n.id) problems.push(`self-similarity on ${n.id}`);
      if (!in01(s.score)) problems.push(`similarity score out of [0,1] on ${n.id} -> ${s.to}`);
    }
    for (const iface of (n.representation && n.representation.interfaces) || []) {
      if (iface.target && !ids.has(iface.target)) {
        problems.push(`dangling interface target on ${n.id}: ${iface.target}`);
      }
    }
  }

  const edgeIds = new Set();
  for (const e of g.edges || []) {
    if (edgeIds.has(e.id)) problems.push(`duplicate edge id: ${e.id}`);
    edgeIds.add(e.id);
    if (!RELATION_KINDS.includes(e.relation))
      problems.push(`bad relation on ${e.id}: ${e.relation}`);
    if (!ids.has(e.from)) problems.push(`dangling edge source: ${e.id} -> ${e.from}`);
    if (!ids.has(e.to)) problems.push(`dangling edge target: ${e.id} -> ${e.to}`);
    if (!in01(e.confidence)) problems.push(`confidence out of [0,1] on ${e.id}`);
    if (!in01(e.strength)) problems.push(`strength out of [0,1] on ${e.id}`);

    const rule = RELATION_LAYER_RULES[e.relation];
    const lf = layerById.get(e.from),
      lt = layerById.get(e.to);
    if (rule && lf && lt) {
      if (rule.from && !rule.from.includes(lf)) {
        problems.push(
          `relation ${e.relation} on ${e.id} must originate in ${rule.from.join('|')}, got ${lf}`
        );
      }
      if (rule.to && !rule.to.includes(lt)) {
        problems.push(
          `relation ${e.relation} on ${e.id} must target ${rule.to.join('|')}, got ${lt}`
        );
      }
      if (rule.direction === 'descend' && descentDirection(lf, lt) !== 'descend') {
        problems.push(`"${e.relation}" must descend the cognitive axis: ${e.id} (${lf} -> ${lt})`);
      }
      if (rule.direction === 'ascend' && descentDirection(lf, lt) !== 'ascend') {
        problems.push(`"${e.relation}" must ascend the cognitive axis: ${e.id} (${lf} -> ${lt})`);
      }
      if (rule.direction === 'dual' && LAYER_DUAL[lf] !== lt) {
        problems.push(`"dual_of" must link dual layers: ${e.id} (${lf} -> ${lt})`);
      }
    }
  }

  const morphIds = new Set();
  for (const m of g.morphisms || []) {
    if (morphIds.has(m.id)) problems.push(`duplicate morphism id: ${m.id}`);
    morphIds.add(m.id);
    if (!MORPHISM_KINDS.includes(m.kind)) {
      problems.push(`bad morphism kind on ${m.id}: ${m.kind}`);
      continue;
    }
    if (!ids.has(m.from)) problems.push(`dangling morphism source: ${m.id} -> ${m.from}`);
    if (!ids.has(m.to)) problems.push(`dangling morphism target: ${m.id} -> ${m.to}`);
    if (!in01(m.confidence)) problems.push(`confidence out of [0,1] on ${m.id}`);

    const sig = MORPHISM_SIGNATURE[m.kind];
    const lf = layerById.get(m.from),
      lt = layerById.get(m.to);
    if (sig && lf && !sig.from.includes(lf)) {
      problems.push(
        `morphism ${m.kind} on ${m.id}: source layer ${lf} not in ${sig.from.join('|')}`
      );
    }
    if (sig && lt && !sig.to.includes(lt)) {
      problems.push(`morphism ${m.kind} on ${m.id}: target layer ${lt} not in ${sig.to.join('|')}`);
    }
  }

  const oblIds = new Set();
  for (const c of g.coherence || []) {
    if (oblIds.has(c.id)) problems.push(`duplicate coherence id: ${c.id}`);
    oblIds.add(c.id);
    if (!(c.kind in COHERENCE_LAW)) problems.push(`bad coherence kind on ${c.id}: ${c.kind}`);
    if (!c.refs || !c.refs.length) problems.push(`coherence obligation without refs: ${c.id}`);
    for (const r of c.refs || []) {
      if (!ids.has(r) && !morphIds.has(r) && !edgeIds.has(r)) {
        problems.push(`dangling coherence ref on ${c.id}: ${r}`);
      }
    }
  }

  for (const m of g.morphisms || []) {
    for (const o of m.obligations || []) {
      if (!oblIds.has(o)) problems.push(`morphism ${m.id} cites unknown obligation: ${o}`);
    }
  }

  for (const cl of g.clusters || []) {
    for (const member of cl.members || []) {
      if (!ids.has(member)) problems.push(`cluster ${cl.id} has unknown member: ${member}`);
    }
    if (cl.root && !ids.has(cl.root))
      problems.push(`cluster ${cl.id} has unknown root: ${cl.root}`);
  }

  for (const i of g.unresolved || []) {
    for (const r of i.refs || []) {
      if (!ids.has(r) && !edgeIds.has(r) && !morphIds.has(r) && !oblIds.has(r)) {
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
  for (const n of g.nodes || []) if ((state.get(n.id) ?? 0) === 0) walk(n.id);
  return cycles;
}

/** Advisory: cross-layer relations with no named morphism transporting the object. */
export function findMissingMorphisms(g) {
  const issues = [];
  const layerById = new Map((g.nodes || []).map((n) => [n.id, layerOf(n)]));
  const transported = new Set(
    (g.morphisms || []).flatMap((m) => [`${m.from}|${m.to}`, `${m.to}|${m.from}`])
  );
  for (const e of g.edges || []) {
    const lf = layerById.get(e.from),
      lt = layerById.get(e.to);
    if (!lf || !lt || lf === lt) continue;
    if (!isCognitive(lf) || !isCognitive(lt)) continue;
    if (!['formalizes', 'abstracts', 'instantiates'].includes(e.relation)) continue;
    if (transported.has(`${e.from}|${e.to}`)) continue;
    issues.push({
      kind: 'missing_morphism',
      description: `"${e.relation}" crosses ${lf} -> ${lt} with no named morphism transporting the object`,
      refs: [e.id, e.from, e.to],
      layers: [lf, lt],
    });
  }
  return issues;
}

export function computeStats(g) {
  const by_kind = {},
    by_layer = {},
    by_relation = {},
    by_morphism = {},
    by_coherence = {};
  const layerById = new Map();
  for (const n of g.nodes || []) {
    by_kind[n.kind] = (by_kind[n.kind] ?? 0) + 1;
    const l = layerOf(n);
    layerById.set(n.id, l);
    by_layer[l] = (by_layer[l] ?? 0) + 1;
  }
  let cross = 0;
  for (const e of g.edges || []) {
    by_relation[e.relation] = (by_relation[e.relation] ?? 0) + 1;
    const lf = layerById.get(e.from),
      lt = layerById.get(e.to);
    if (lf && lt && lf !== lt) cross++;
  }
  for (const m of g.morphisms || []) by_morphism[m.kind] = (by_morphism[m.kind] ?? 0) + 1;
  for (const c of g.coherence || []) by_coherence[c.kind] = (by_coherence[c.kind] ?? 0) + 1;

  return {
    documents: ((g.corpus && g.corpus.documents) || []).length,
    nodes: (g.nodes || []).length,
    edges: (g.edges || []).length,
    morphisms: (g.morphisms || []).length,
    obligations: (g.coherence || []).length,
    by_kind,
    by_relation,
    by_layer,
    by_morphism,
    by_coherence,
    cross_layer_edges: cross,
  };
}

/**
 * Some graphs (see docs/generator.theory_graph.json) mistakenly park edges and
 * morphisms inside `nodes[]`. Split them out so the viewer sees the real shape.
 */
export function normalizeGraph(raw) {
  const g = {
    ...raw,
    nodes: [],
    edges: [...(raw.edges || [])],
    morphisms: [...(raw.morphisms || [])],
    coherence: [...(raw.coherence || [])],
    clusters: [...(raw.clusters || [])],
    unresolved: [...(raw.unresolved || [])],
  };
  const misplaced = [];
  for (const item of raw.nodes || []) {
    const looksLikeLink = item.from && item.to;
    if (looksLikeLink && item.relation) {
      g.edges.push(item);
      misplaced.push({ id: item.id, as: 'edge' });
    } else if (looksLikeLink && MORPHISM_KINDS.includes(item.kind)) {
      g.morphisms.push(item);
      misplaced.push({ id: item.id, as: 'morphism' });
    } else if (looksLikeLink) {
      g.edges.push({ ...item, relation: item.relation || 'depends_on' });
      misplaced.push({ id: item.id, as: 'edge (relation guessed)' });
    } else {
      g.nodes.push(item);
    }
  }
  return { graph: g, misplaced };
}
