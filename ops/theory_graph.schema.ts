/**
 * theory_graph.schema.ts
 *
 * Shape of `theory_graph.json`, produced by `analyze.op.md` from the
 * markdown working notes in `experiments/primegen/`.
 *
 * The schema follows the consolidated metaontology of mathematical practice:
 * five *cognitive* layers (inspiration, fuzzy, symbolic, deductive, numeric)
 * plus two orthogonal *contextual* layers (social, ecological) that are the
 * structural duals of the inspiration and numeric layers respectively.
 *
 * Three pieces of connective structure span the cognitive layers:
 *   - the OBJECT layer     : every node carries an ontology tag + representation
 *                            + cross-ontology interfaces (`Representation`).
 *   - the MORPHISM layer   : named, first-class transports between ontologies
 *                            (`Morphism`, `MorphismKind`).
 *   - the COHERENCE layer  : explicit, costed obligations that keep the
 *                            ontologies consistent (`CoherenceObligation`).
 *
 * Dependency-free: the types double as the contract for the extractor and as
 * the type used by downstream consumers (renderers, validators, queries).
 */

/* ------------------------------------------------------------------ *
 * Layers (the vertical cognitive axis + the two contextual axes)
 * ------------------------------------------------------------------ */

/**
 * Ontological stratum a node lives in.
 *
 *   -2 inspiration : directional inference about the space of theories
 *    0 fuzzy       : pre-formal, pre-truth-apt proto-structure
 *    1 symbolic    : terms in a rewrite system
 *    2 deductive   : proof objects in a derivation graph
 *    3 numeric     : limits of computable approximations
 *   +S social      : distributed epistemic environment (dual of inspiration)
 *   +E ecological  : distributed physical/technological environment (dual of numeric)
 */
export type Layer =
    | "inspiration"
    | "fuzzy"
    | "symbolic"
    | "deductive"
    | "numeric"
    | "social"
    | "ecological";

export const COGNITIVE_LAYERS: readonly Layer[] = [
    "inspiration", "fuzzy", "symbolic", "deductive", "numeric",
] as const;

export const CONTEXTUAL_LAYERS: readonly Layer[] = ["social", "ecological"] as const;

export const LAYERS: readonly Layer[] = [...COGNITIVE_LAYERS, ...CONTEXTUAL_LAYERS];

/**
 * The paper's numbering. Contextual layers are orthogonal to the cognitive
 * axis and therefore have no index (`null`), not a large one.
 */
export const LAYER_INDEX: Record<Layer, number | null> = {
    inspiration: -2,
    fuzzy: 0,
    symbolic: 1,
    deductive: 2,
    numeric: 3,
    social: null,
    ecological: null,
};

/** Section 7: the duality that completes the schema. */
export const LAYER_DUAL: Partial<Record<Layer, Layer>> = {
    inspiration: "social",
    social: "inspiration",
    numeric: "ecological",
    ecological: "numeric",
};

/** The commitments each layer makes about objects, truth and equality. */
export interface LayerSemantics {
    /** What a "mathematical object" *is* here. */
    identity: string;
    /** What it means for such an object to exist. */
    existence: string;
    /** What counts as truth (or `null` where the layer is pre-truth-apt). */
    truth: string | null;
    /** What it means for two objects to be equal. */
    equality: string;
    /** The characteristic computation performed at this layer. */
    computation: string;
}

export const LAYER_SEMANTICS: Record<Layer, LayerSemantics> = {
    inspiration: {
        identity: "a directional inference about the space of possible theories",
        existence: "expressible as a trajectory, mapping, gap or suspected duality",
        truth: null,
        equality: "sameness of research direction",
        computation: "analogical deduction, knowledge-boundary mapping, steering",
    },
    fuzzy: {
        identity: "a pre-formal cognitive structure: pattern, hunch, sketch, proto-operator",
        existence: "it can be expressed at all",
        truth: null,
        equality: "similarity of conceptual shape",
        computation: "exploration, refinement, mutation, analogy, clustering",
    },
    symbolic: {
        identity: "a term in a rewrite system",
        existence: "being a well-formed syntactic construct",
        truth: "reachability of a normal form under rewrite rules",
        equality: "convertibility (existence of a rewrite path)",
        computation: "rewriting, unification, normalization",
    },
    deductive: {
        identity: "a node in a derivation graph",
        existence: "derivability from axioms",
        truth: "closure under inference rules",
        equality: "provable equivalence",
        computation: "inference, proof search, verification",
    },
    numeric: {
        identity: "a limit of computable approximations",
        existence: "convergence under some metric",
        truth: "stability under refinement",
        equality: "indistinguishability within an error bound",
        computation: "evaluation, interval refinement, tail-error bounding",
    },
    social: {
        identity: "a distributed epistemic fact: citation, norm, program, folklore",
        existence: "being held or enacted by a community",
        truth: "community acceptance",
        equality: "sameness of convention",
        computation: "collective steering: attention, prestige, selection",
    },
    ecological: {
        identity: "a physical, technological or economic condition of the work",
        existence: "obtaining in the practitioner's environment",
        truth: "survival of contact with real constraints",
        equality: "sameness of constraint or affordance",
        computation: "constraint propagation, cost accounting, external stabilization",
    },
};

/** Section 7's duality table, machine-readable. */
export const LAYER_DUALITY_TABLE: readonly {
    cognitive: Layer;
    social_analog: string;
    ecological_analog: string;
}[] = [
    { cognitive: "inspiration", social_analog: "collective inspiration (folklore, research programs)", ecological_analog: "problem ecology (what the world demands)" },
    { cognitive: "fuzzy", social_analog: "community heuristics", ecological_analog: "environmental heuristics" },
    { cognitive: "symbolic", social_analog: "canonical formalisms", ecological_analog: "tool-driven representations" },
    { cognitive: "deductive", social_analog: "proof norms", ecological_analog: "physical/logical constraints" },
    { cognitive: "numeric", social_analog: "empirical norms", ecological_analog: "real-world stability" },
] as const;

/* ------------------------------------------------------------------ *
 * Enumerations: node kinds
 * ------------------------------------------------------------------ */

/** What sort of claim or object a node represents. */
export type NodeKind =
    /* -2 inspiration ------------------------------------------------ */
    | "trajectory"           // a research direction worth pursuing
    | "analogy"              // structural resemblance used as an inference
    | "domain_mapping"       // systematic correspondence between two domains
    | "invariance_hypothesis"// "something ought to be preserved here"
    | "knowledge_gap"        // an identified hole in the known/unknown map
    /* 0 fuzzy -------------------------------------------------------- */
    | "proto_pattern"        // unformalized recurring shape
    | "proto_operator"       // half-formed operation, not yet a rule
    | "sketch"               // partial derivation or diagram in prose
    | "metaphor"             // "it behaves like a …"
    | "conjecture"           // hedged or unproved claim
    | "heuristic"            // rule of thumb, approximation, "good enough"
    | "open_question"        // TODO, "unclear whether…"
    /* 1 symbolic ----------------------------------------------------- */
    | "definition"           // introduces a term or notation
    | "notation"             // pure notational stipulation
    | "rewrite_rule"         // an oriented identity / transformation
    | "signature"            // an algebraic signature or type of a construction
    | "model"                // a concrete generator / algorithm / construction
    /* 2 deductive ---------------------------------------------------- */
    | "axiom"                // asserted without proof, used to justify other nodes
    | "theorem"              // proved in the notes, or a cited known result
    | "lemma"                // proved, used only as a step
    | "proof"                // a derivation object itself
    | "theory"               // an explanatory framework spanning several claims
    /* 3 numeric ------------------------------------------------------ */
    | "observation"          // measurement, benchmark, plot reading
    | "experiment"           // a described run that produces observations
    | "bound"                // an error / complexity / tail bound
    | "certificate"          // a computation that certifies a claim
    /* +S social ------------------------------------------------------ */
    | "reference"            // external work cited by the notes
    | "norm"                 // "we only accept …", methodological convention
    | "research_program"     // a stated agenda or open-problem list
    | "folklore"             // "everybody knows", unattributed shared belief
    /* +E ecological -------------------------------------------------- */
    | "constraint"           // hardware, memory, time, economic limit
    | "resource"             // machine, dataset, library actually available
    | "artifact";            // code, dataset, table, figure

export const NODE_KINDS: readonly NodeKind[] = [
    "trajectory", "analogy", "domain_mapping", "invariance_hypothesis", "knowledge_gap",
    "proto_pattern", "proto_operator", "sketch", "metaphor", "conjecture", "heuristic", "open_question",
    "definition", "notation", "rewrite_rule", "signature", "model",
    "axiom", "theorem", "lemma", "proof", "theory",
    "observation", "experiment", "bound", "certificate",
    "reference", "norm", "research_program", "folklore",
    "constraint", "resource", "artifact",
] as const;

/**
 * Default layer for each kind. A node MAY override this with `layer`, but then
 * it must explain itself in `layer_rationale` (the validator asks for it).
 */
export const NODE_KIND_LAYER: Record<NodeKind, Layer> = {
    trajectory: "inspiration",
    analogy: "inspiration",
    domain_mapping: "inspiration",
    invariance_hypothesis: "inspiration",
    knowledge_gap: "inspiration",

    proto_pattern: "fuzzy",
    proto_operator: "fuzzy",
    sketch: "fuzzy",
    metaphor: "fuzzy",
    conjecture: "fuzzy",
    heuristic: "fuzzy",
    open_question: "fuzzy",

    definition: "symbolic",
    notation: "symbolic",
    rewrite_rule: "symbolic",
    signature: "symbolic",
    model: "symbolic",

    axiom: "deductive",
    theorem: "deductive",
    lemma: "deductive",
    proof: "deductive",
    theory: "deductive",

    observation: "numeric",
    experiment: "numeric",
    bound: "numeric",
    certificate: "numeric",

    reference: "social",
    norm: "social",
    research_program: "social",
    folklore: "social",

    constraint: "ecological",
    resource: "ecological",
    artifact: "ecological",
};

/* ------------------------------------------------------------------ *
 * Enumerations: relations
 * ------------------------------------------------------------------ */

/** Directed relation from `from` to `to`. */
export type RelationKind =
    /* epistemic / logical */
    | "assumes"
    | "depends_on"
    | "implies"
    | "generalizes"
    | "specializes"
    | "equivalent_to"
    | "supports"
    | "refutes"
    | "contradicts"
    | "motivates"
    | "tests"
    | "measures"
    | "refines"
    | "instantiates"
    | "cites"
    /* layer-aware (the descent pattern of §3.2 and the axes of §5–7) */
    | "formalizes"     // lower cognitive index -> higher (fuzzy -> symbolic, …)
    | "abstracts"      // higher cognitive index -> lower (numeric -> fuzzy, …)
    | "analogous_to"   // inspiration/fuzzy structural resemblance
    | "steers"         // inspiration -> the work it directs
    | "selects_for"    // social -> what the community rewards / stabilizes
    | "constrains"     // ecological -> what the environment permits
    | "stabilizes"     // repeated use turns a proto-object into a fixture
    | "dual_of";       // links a cognitive layer node to its contextual dual

export const RELATION_KINDS: readonly RelationKind[] = [
    "assumes", "depends_on", "implies", "generalizes", "specializes",
    "equivalent_to", "supports", "refutes", "contradicts", "motivates",
    "tests", "measures", "refines", "instantiates", "cites",
    "formalizes", "abstracts", "analogous_to", "steers", "selects_for",
    "constrains", "stabilizes", "dual_of",
] as const;

/** Semantic inverse, where one exists (used by renderers and consistency checks). */
export const INVERSE_RELATION: Partial<Record<RelationKind, RelationKind>> = {
    generalizes: "specializes",
    specializes: "generalizes",
    equivalent_to: "equivalent_to",
    contradicts: "contradicts",
    formalizes: "abstracts",
    abstracts: "formalizes",
    analogous_to: "analogous_to",
    dual_of: "dual_of",
};

/** Relations that must form a DAG over the node set. */
export const ACYCLIC_RELATIONS: readonly RelationKind[] = [
    "assumes", "depends_on", "implies", "refines", "formalizes",
] as const;

/**
 * Layer discipline for relations. `direction`:
 *   "descend"  LAYER_INDEX(to)   > LAYER_INDEX(from)
 *   "ascend"   LAYER_INDEX(to)   < LAYER_INDEX(from)
 *   "dual"     LAYER_DUAL[from] === to
 */
export const RELATION_LAYER_RULES: Partial<Record<RelationKind, {
    from?: readonly Layer[];
    to?: readonly Layer[];
    direction?: "descend" | "ascend" | "dual";
}>> = {
    formalizes: { direction: "descend" },
    abstracts: { direction: "ascend" },
    analogous_to: { from: ["inspiration", "fuzzy"] },
    steers: { from: ["inspiration"] },
    selects_for: { from: ["social"] },
    constrains: { from: ["ecological"] },
    dual_of: { direction: "dual" },
};

/* ------------------------------------------------------------------ *
 * Enumerations: morphisms (the cross-ontology transport layer)
 * ------------------------------------------------------------------ */

/**
 * Named operations that move information *between* ontologies. These are not
 * claims about the world; they are transports of objects, and they are the
 * architecture most mathematical software implements only ad hoc.
 */
export type MorphismKind =
    /* §2.5 — the six cross-ontology morphisms */
    | "extract"                 // deductive -> symbolic : take the term out of a proof
    | "embed"                   // symbolic -> deductive : adopt a term as axiom/lemma
    | "evaluate"                // symbolic -> numeric   : compute with error bounds
    | "fit"                     // numeric -> symbolic   : guess a closed form
    | "bound"                   // deductive -> numeric  : computable bounds from a derivation
    | "certify"                 // numeric -> deductive  : existence proof from computation
    /* §3.1 — fuzzy projections and their inverse */
    | "formalize_symbolic"      // fuzzy -> symbolic : pattern becomes a rewrite rule
    | "formalize_deductive"     // fuzzy -> deductive: conjecture becomes a theorem
    | "formalize_numeric"       // fuzzy -> numeric  : intuition becomes an experiment
    | "abstract"                // formal -> fuzzy   : formal work surfaces a new pattern
    /* §4 — inspiration-layer morphisms */
    | "analogy_extension"
    | "analogy_inversion"
    | "analogy_fusion"
    | "trajectory_refinement"
    | "trajectory_branch"
    | "trajectory_prune"
    | "domain_mapping"
    | "gap_identification"
    | "invariance_projection"
    /* §5–6 — contextual modulation */
    | "social_selection"        // social -> any cognitive layer
    | "ecological_constraint";  // ecological -> any cognitive layer

export const MORPHISM_KINDS: readonly MorphismKind[] = [
    "extract", "embed", "evaluate", "fit", "bound", "certify",
    "formalize_symbolic", "formalize_deductive", "formalize_numeric", "abstract",
    "analogy_extension", "analogy_inversion", "analogy_fusion",
    "trajectory_refinement", "trajectory_branch", "trajectory_prune",
    "domain_mapping", "gap_identification", "invariance_projection",
    "social_selection", "ecological_constraint",
] as const;

/** Legal source/target layers for each morphism. */
export const MORPHISM_SIGNATURE: Record<MorphismKind, { from: readonly Layer[]; to: readonly Layer[] }> = {
    extract: { from: ["deductive"], to: ["symbolic"] },
    embed: { from: ["symbolic"], to: ["deductive"] },
    evaluate: { from: ["symbolic"], to: ["numeric"] },
    fit: { from: ["numeric"], to: ["symbolic"] },
    bound: { from: ["deductive"], to: ["numeric"] },
    certify: { from: ["numeric"], to: ["deductive"] },

    formalize_symbolic: { from: ["fuzzy"], to: ["symbolic"] },
    formalize_deductive: { from: ["fuzzy"], to: ["deductive"] },
    formalize_numeric: { from: ["fuzzy"], to: ["numeric"] },
    abstract: { from: ["symbolic", "deductive", "numeric"], to: ["fuzzy", "inspiration"] },

    analogy_extension: { from: ["inspiration"], to: ["inspiration"] },
    analogy_inversion: { from: ["inspiration"], to: ["inspiration"] },
    analogy_fusion: { from: ["inspiration"], to: ["inspiration"] },
    trajectory_refinement: { from: ["inspiration"], to: ["inspiration"] },
    trajectory_branch: { from: ["inspiration"], to: ["inspiration"] },
    trajectory_prune: { from: ["inspiration"], to: ["inspiration"] },
    domain_mapping: { from: ["inspiration"], to: ["inspiration", "fuzzy"] },
    gap_identification: { from: ["inspiration", "fuzzy"], to: ["inspiration"] },
    invariance_projection: { from: ["inspiration"], to: ["fuzzy", "symbolic", "deductive", "numeric"] },

    social_selection: { from: ["social"], to: ["inspiration", "fuzzy", "symbolic", "deductive", "numeric"] },
    ecological_constraint: { from: ["ecological"], to: ["inspiration", "fuzzy", "symbolic", "deductive", "numeric"] },
};

/** Morphisms that undo one another (round-trips should be flagged as lossy or not). */
export const MORPHISM_INVERSE: Partial<Record<MorphismKind, MorphismKind>> = {
    extract: "embed",
    embed: "extract",
    evaluate: "fit",
    fit: "evaluate",
    bound: "certify",
    certify: "bound",
    formalize_symbolic: "abstract",
    formalize_deductive: "abstract",
    formalize_numeric: "abstract",
    analogy_extension: "analogy_inversion",
    analogy_inversion: "analogy_extension",
};

/** §2.5 — universal operators acting across all three formal ontologies. */
export type MetaOperator =
    | "normalization"   // symbolic
    | "verification"    // deductive
    | "refinement"      // numeric
    | "extraction"      // cross-ontology
    | "approximation"   // numeric-from-symbolic
    | "certification";  // proof-from-numeric

export const META_OPERATORS: readonly MetaOperator[] = [
    "normalization", "verification", "refinement",
    "extraction", "approximation", "certification",
] as const;

export const META_OPERATOR_HOME: Record<MetaOperator, Layer | "cross"> = {
    normalization: "symbolic",
    verification: "deductive",
    refinement: "numeric",
    extraction: "cross",
    approximation: "cross",
    certification: "cross",
};

/* ------------------------------------------------------------------ *
 * Status & domains
 * ------------------------------------------------------------------ */

/** Epistemic state of the claim *according to the notes*. */
export type Status =
    | "pre_formal"   // fuzzy/inspiration object, not yet truth-apt
    | "stabilized"   // a proto-object the notes reuse as if settled
    | "accepted"
    | "proposed"
    | "tested"
    | "supported"
    | "refuted"
    | "superseded"
    | "abandoned"
    | "unknown";

export const STATUSES: readonly Status[] = [
    "pre_formal", "stabilized", "accepted", "proposed", "tested",
    "supported", "refuted", "superseded", "abandoned", "unknown",
] as const;

/** Coarse subject tag; free strings are allowed for anything unforeseen. */
export type Domain =
    | "sieve"
    | "wheel"
    | "primality-test"
    | "distribution"
    | "gaps"
    | "randomness"
    | "complexity"
    | "implementation"
    | "benchmark"
    | (string & {});

/* ------------------------------------------------------------------ *
 * Provenance, cost & attributes
 * ------------------------------------------------------------------ */

/** Pointer back into a source document. */
export interface SourceRef {
    /** File name as matched by the transform, e.g. "sieve-notes.md". */
    file: string;
    /** Nearest enclosing heading text, if any. */
    heading?: string;
    /** 1-based inclusive line range in the source document. */
    lines?: [number, number];
    /** Short verbatim excerpt (<= 200 chars) justifying the extraction. */
    quote?: string;
}

export type AttributeValue = string | number | boolean | null;

/** A measured or stipulated quantity lifted out of the prose. */
export interface Attribute {
    /** snake_case key, e.g. "wheel_modulus", "time_complexity", "bit_size". */
    key: string;
    value: AttributeValue;
    /** SI or ad-hoc unit: "ms", "bits", "candidates/s", "big-O". */
    unit?: string;
    /** Uncertainty on numeric values, same unit. */
    error?: number;
    /** Which layer's notion of measurement this quantity belongs to. */
    layer?: Layer;
    source?: SourceRef;
}

/** Coherence is not free — this records what it costs. */
export interface Cost {
    /** What is being spent: "time", "memory", "developer-effort", "trust". */
    measure: string;
    value?: number;
    unit?: string;
    note?: string;
}

/* ------------------------------------------------------------------ *
 * Object layer: representation + cross-ontology interfaces
 * ------------------------------------------------------------------ */

/** A projection this object offers into another ontology. */
export interface OntologyInterface {
    /** Target layer of the projection. */
    to: Layer;
    /** Morphism that realizes it, if the notes name or perform one. */
    via?: MorphismKind;
    /** Does the projection actually exist in the notes, or is it only wanted? */
    available: boolean;
    /** True if the projection discards information (rounding, forgetting a proof, …). */
    lossy?: boolean;
    /** Node id of the projected object, when it exists as its own node. */
    target?: string;
    note?: string;
}

/**
 * `Object := { Ontology, Representation, Interfaces }` from §2.5, made concrete.
 */
export interface Representation {
    /** Ontology tag; normally equals the node's layer. */
    layer: Layer;
    /**
     * Substrate form, e.g. "term-graph", "rewrite-rule", "proof-term",
     * "sequent", "digit-stream", "interval", "benchmark-row", "prose-sketch".
     */
    form: string;
    /** The representation itself, verbatim from the notes where possible. */
    content?: string;
    /** Cross-ontology projections. */
    interfaces?: OntologyInterface[];
}

/* ------------------------------------------------------------------ *
 * Geometry of inspiration & fuzzy space (§9)
 * ------------------------------------------------------------------ */

/** Similarity of conceptual shape — the fuzzy layer's notion of equality. */
export interface Similarity {
    /** Node id. */
    to: string;
    /** [0, 1]; 1 means "the same shape". */
    score: number;
    /** What the similarity is measured on. */
    basis?: "shape" | "analogy" | "statement" | "attribute" | "notation" | (string & {});
    note?: string;
}

/** An explicit handle on "the shape of a hunch". */
export interface ConceptShape {
    /** Short descriptor of the shape, in the notes' own vocabulary if possible. */
    descriptor?: string;
    /** Named axes the descriptor varies along. */
    dims?: string[];
    /** Optional numeric embedding, if a downstream tool supplies one. */
    embedding?: number[];
}

/* ------------------------------------------------------------------ *
 * Contextual metadata (social / ecological), first-class per §8
 * ------------------------------------------------------------------ */

export interface Citation {
    key?: string;
    text: string;
    url?: string;
    doi?: string;
    kind?: "paper" | "book" | "note" | "conversation" | "software" | "dataset" | (string & {});
}

export interface SocialContext {
    references?: Citation[];
    /** Named research program or agenda the item belongs to. */
    program?: string;
    /** Methodological conventions invoked ("only accept 64-bit deterministic MR"). */
    norms?: string[];
    /** "Everyone knows…" beliefs relied on without attribution. */
    folklore?: string[];
    /** Blind spots the notes admit to. */
    blind_spots?: string[];
    /** Rough attention/prestige weight in [0, 1], only if the notes indicate one. */
    prestige?: number;
}

export interface EcologicalContext {
    /** Hard limits: RAM, cache, wall-clock budget, cost ceiling. */
    constraints?: string[];
    /** What was actually available: machine, library, dataset. */
    resources?: string[];
    /** What the environment made easy ("SIMD popcount", "GPU"). */
    affordances?: string[];
    /** Substrate the work ran on, e.g. "x86-64 laptop", "CPython 3.12". */
    substrate?: string;
    costs?: Cost[];
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

export interface GraphNode {
    /** `<kind>.<kebab-slug>`, unique and stable across runs. */
    id: string;
    kind: NodeKind;
    /**
     * Ontological stratum. Defaults to `NODE_KIND_LAYER[kind]`; set explicitly
     * only when the notes treat the item at a different layer, and then say why
     * in `layer_rationale`.
     */
    layer?: Layer;
    layer_rationale?: string;
    /** Short human label (title case, no trailing period). */
    name: string;
    /** Variant phrasings found in other documents. */
    aliases?: string[];
    /** One self-contained declarative sentence; inline LaTeX preserved. */
    statement: string;
    /** Symbolic form, LaTeX, if the notes give one. */
    formal?: string;
    /** Notation introduced by this node (definitions mostly). */
    notation?: string[];
    /** Object-layer payload: ontology tag, representation, interfaces. */
    representation?: Representation;
    /** Meta-operators the notes apply to this object. */
    meta_operators?: MetaOperator[];
    /** Conceptual-shape handle (inspiration / fuzzy layers especially). */
    shape?: ConceptShape;
    /** Shape-similarity links; the fuzzy layer's substitute for equality. */
    similar_to?: Similarity[];
    status: Status;
    /** Extraction confidence in [0, 1] — not the truth of the claim. */
    confidence?: number;
    /** Conditions under which the claim is asserted to hold. */
    scope?: string;
    domain?: Domain;
    tags?: string[];
    attributes?: Attribute[];
    /** Community context, only when the notes actually exhibit it. */
    social?: SocialContext;
    /** Environmental context, only when the notes actually exhibit it. */
    ecological?: EcologicalContext;
    /** At least one entry; every node must be traceable to the corpus. */
    sources: SourceRef[];
    /** Document id where the node first appears (corpus order). */
    first_seen?: string;
    /** Extractor commentary: inferences made, ambiguities, caveats. */
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Edges
 * ------------------------------------------------------------------ */

export interface GraphEdge {
    /** `e.<from-slug>.<relation>.<to-slug>`. */
    id: string;
    /** Node id. */
    from: string;
    /** Node id. */
    to: string;
    relation: RelationKind;
    /** Optional edge label for rendering. */
    label?: string;
    /**
     * How strongly the relation holds according to the notes, in [0, 1].
     * For `supports` / `refutes` this is evidential weight.
     */
    strength?: number;
    /** Extraction confidence in [0, 1]. */
    confidence?: number;
    /** Side conditions ("only for n > 10^6", "assuming GRH"). */
    conditions?: string;
    sources?: SourceRef[];
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Morphism layer
 * ------------------------------------------------------------------ */

/** A transport of an object from one ontology to another. */
export interface Morphism {
    /** `m.<from-slug>.<kind>.<to-slug>`. */
    id: string;
    kind: MorphismKind;
    /** Node id of the source object. */
    from: string;
    /** Node id of the target object. */
    to: string;
    /**
     * Was the transport actually performed in the notes, merely wanted, or
     * attempted and failed?
     */
    state?: "performed" | "intended" | "failed" | "unknown";
    /** Information the transport discards (rounding, forgetting a proof, …). */
    loss?: string;
    /** What performing it cost. */
    cost?: Cost;
    /** Coherence obligation ids this morphism creates or discharges. */
    obligations?: string[];
    confidence?: number;
    sources?: SourceRef[];
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Coherence layer
 * ------------------------------------------------------------------ */

export type CoherenceKind = "semantic" | "logical" | "analytic";

export const COHERENCE_LAW: Record<CoherenceKind, { between: readonly [Layer, Layer]; requirement: string }> = {
    semantic: {
        between: ["numeric", "symbolic"],
        requirement: "numeric evaluation must respect symbolic identities",
    },
    logical: {
        between: ["symbolic", "deductive"],
        requirement: "symbolic rewrites must preserve provable truths",
    },
    analytic: {
        between: ["deductive", "numeric"],
        requirement: "proofs must guarantee the convergence properties they claim",
    },
};

/** An explicit, costed consistency requirement across ontologies. */
export interface CoherenceObligation {
    /** `c.<kind>.<slug>`. */
    id: string;
    kind: CoherenceKind;
    /** Node and/or morphism ids the obligation ranges over. */
    refs: string[];
    /** What must hold, phrased for this particular pair of objects. */
    requirement: string;
    status: "discharged" | "pending" | "violated" | "unknown";
    /** What maintaining it costs — never assume it away. */
    cost?: Cost;
    confidence?: number;
    sources?: SourceRef[];
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Corpus, clusters, diagnostics
 * ------------------------------------------------------------------ */

export interface DocumentRef {
    /** Capture group from the transform pattern, e.g. "sieve-notes". */
    id: string;
    /** Path relative to the graph file, e.g. "../sieve-notes.md". */
    path: string;
    title?: string;
    /** Ordering hint when the notes are chronological. */
    order?: number;
    /** Content hash, for incremental re-extraction. */
    hash?: string;
    /** Which layers this document mostly operates in. */
    dominant_layers?: Layer[];
}

/** An optional grouping of nodes (a theory and its dependents, a thread, …). */
export interface Cluster {
    id: string;
    name: string;
    /** Node ids. */
    members: string[];
    /** Node id acting as the cluster's head, usually a `theory` or `model`. */
    root?: string;
    /**
     * A "descent chain" cluster records one fuzzy pattern and its symbolic,
     * deductive and numeric realizations (the §3.2 pattern).
     */
    kind?: "thread" | "descent_chain" | "analogy_family" | "benchmark_family" | (string & {});
    /** Layers actually represented among the members. */
    layers?: Layer[];
    summary?: string;
}

export type IssueKind =
    | "dangling_reference"
    | "undefined_term"
    | "cycle"
    | "contradiction"
    | "ambiguous_statement"
    | "missing_source"
    | "unparsed_math"
    | "layer_ambiguity"      // the notes do not settle which ontology is meant
    | "missing_morphism"     // two layers discuss the same object with no transport
    | "coherence_violation"  // §2.5 coherence law appears to be broken
    | "unattributed_claim";  // social-layer folklore with no citation

/** Anything the extractor could not resolve — never silently dropped. */
export interface Issue {
    kind: IssueKind;
    description: string;
    /** Node, edge, morphism or obligation ids involved. */
    refs?: string[];
    /** Layers the issue straddles, when relevant. */
    layers?: Layer[];
    sources?: SourceRef[];
}

export interface GraphStats {
    documents: number;
    nodes: number;
    edges: number;
    morphisms?: number;
    obligations?: number;
    by_kind?: Partial<Record<NodeKind, number>>;
    by_relation?: Partial<Record<RelationKind, number>>;
    by_layer?: Partial<Record<Layer, number>>;
    by_morphism?: Partial<Record<MorphismKind, number>>;
    by_coherence?: Partial<Record<CoherenceKind, number>>;
    /** Edges whose endpoints sit in different layers. */
    cross_layer_edges?: number;
}

/* ------------------------------------------------------------------ *
 * Root
 * ------------------------------------------------------------------ */

export interface TheoryGraph {
    $schema?: string;
    /** Semver of this schema. */
    version: string;
    /** ISO-8601 timestamp of extraction. */
    generated_at?: string;
    generator?: { op: string; model?: string };
    corpus: { documents: DocumentRef[] };
    /** Corpus-wide context, when the notes state it once rather than per node. */
    context?: { social?: SocialContext; ecological?: EcologicalContext };
    nodes: GraphNode[];
    edges: GraphEdge[];
    /** Cross-ontology transports (the missing architecture of §2.5). */
    morphisms?: Morphism[];
    /** Explicit, costed consistency requirements. */
    coherence?: CoherenceObligation[];
    clusters?: Cluster[];
    unresolved?: Issue[];
    stats?: GraphStats;
}

/* ------------------------------------------------------------------ *
 * Runtime helpers (structural validation, no external deps)
 * ------------------------------------------------------------------ */

export function isLayer(x: unknown): x is Layer {
    return typeof x === "string" && (LAYERS as readonly string[]).includes(x);
}

export function isNodeKind(x: unknown): x is NodeKind {
    return typeof x === "string" && (NODE_KINDS as readonly string[]).includes(x);
}

export function isRelationKind(x: unknown): x is RelationKind {
    return typeof x === "string" && (RELATION_KINDS as readonly string[]).includes(x);
}

export function isMorphismKind(x: unknown): x is MorphismKind {
    return typeof x === "string" && (MORPHISM_KINDS as readonly string[]).includes(x);
}

export function isCognitive(l: Layer): boolean {
    return (COGNITIVE_LAYERS as readonly string[]).includes(l);
}

export function isContextual(l: Layer): boolean {
    return (CONTEXTUAL_LAYERS as readonly string[]).includes(l);
}

/** Effective layer of a node: explicit override, else the kind's default. */
export function layerOf(n: GraphNode): Layer {
    return n.layer ?? NODE_KIND_LAYER[n.kind] ?? "fuzzy";
}

export function dualOf(l: Layer): Layer | undefined {
    return LAYER_DUAL[l];
}

/** Movement along the cognitive axis; `undefined` when a contextual layer is involved. */
export function descentDirection(from: Layer, to: Layer): "descend" | "ascend" | "same" | "contextual" {
    const a = LAYER_INDEX[from];
    const b = LAYER_INDEX[to];
    if (a === null || b === null) return "contextual";
    if (a === b) return "same";
    return b > a ? "descend" : "ascend";
}

function inRange01(x: unknown): boolean {
    return typeof x !== "number" || (x >= 0 && x <= 1);
}

/**
 * Returns a list of human-readable problems with a candidate graph.
 * Empty array == structurally valid.
 */
export function validateTheoryGraph(g: TheoryGraph): string[] {
    const problems: string[] = [];
    const ids = new Set<string>();
    const layerById = new Map<string, Layer>();

    for (const n of g.nodes) {
        if (ids.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
        ids.add(n.id);
        if (!isNodeKind(n.kind)) problems.push(`bad kind on ${n.id}: ${n.kind}`);
        if (n.layer !== undefined && !isLayer(n.layer)) problems.push(`bad layer on ${n.id}: ${n.layer}`);
        if (!n.statement?.trim()) problems.push(`empty statement on ${n.id}`);
        if (!n.sources?.length) problems.push(`node without sources: ${n.id}`);
        if (!inRange01(n.confidence)) problems.push(`confidence out of [0,1] on ${n.id}`);

        const layer = layerOf(n);
        layerById.set(n.id, layer);

        if (n.layer && n.layer !== NODE_KIND_LAYER[n.kind] && !n.layer_rationale?.trim()) {
            problems.push(`layer override without layer_rationale on ${n.id} (${n.kind} -> ${n.layer})`);
        }
        if (n.representation && n.representation.layer !== layer) {
            problems.push(`representation layer mismatch on ${n.id}: ${n.representation.layer} vs ${layer}`);
        }
        if (LAYER_SEMANTICS[layer].truth === null &&
            (n.status === "accepted" || n.status === "refuted")) {
            problems.push(`pre-truth-apt node ${n.id} (${layer}) carries truth-apt status "${n.status}"`);
        }
        for (const iface of n.representation?.interfaces ?? []) {
            if (iface.target && !ids.has(iface.target)) {
                // resolved after the loop; recorded lazily below
            }
            if (iface.via && !isMorphismKind(iface.via)) {
                problems.push(`bad interface morphism on ${n.id}: ${iface.via}`);
            }
        }
    }

    // Second pass: references that need the full id set.
    for (const n of g.nodes) {
        for (const s of n.similar_to ?? []) {
            if (!ids.has(s.to)) problems.push(`dangling similarity target on ${n.id}: ${s.to}`);
            if (s.to === n.id) problems.push(`self-similarity on ${n.id}`);
            if (!inRange01(s.score)) problems.push(`similarity score out of [0,1] on ${n.id} -> ${s.to}`);
        }
        for (const iface of n.representation?.interfaces ?? []) {
            if (iface.target && !ids.has(iface.target)) {
                problems.push(`dangling interface target on ${n.id}: ${iface.target}`);
            }
        }
    }

    const edgeIds = new Set<string>();
    for (const e of g.edges) {
        if (edgeIds.has(e.id)) problems.push(`duplicate edge id: ${e.id}`);
        edgeIds.add(e.id);
        if (!isRelationKind(e.relation)) problems.push(`bad relation on ${e.id}: ${e.relation}`);
        if (!ids.has(e.from)) problems.push(`dangling edge source: ${e.id} -> ${e.from}`);
        if (!ids.has(e.to)) problems.push(`dangling edge target: ${e.id} -> ${e.to}`);
        if (!inRange01(e.confidence)) problems.push(`confidence out of [0,1] on ${e.id}`);
        if (!inRange01(e.strength)) problems.push(`strength out of [0,1] on ${e.id}`);

        const rule = RELATION_LAYER_RULES[e.relation];
        const lf = layerById.get(e.from);
        const lt = layerById.get(e.to);
        if (rule && lf && lt) {
            if (rule.from && !rule.from.includes(lf)) {
                problems.push(`relation ${e.relation} on ${e.id} must originate in ${rule.from.join("|")}, got ${lf}`);
            }
            if (rule.to && !rule.to.includes(lt)) {
                problems.push(`relation ${e.relation} on ${e.id} must target ${rule.to.join("|")}, got ${lt}`);
            }
            if (rule.direction === "descend" && descentDirection(lf, lt) !== "descend") {
                problems.push(`"${e.relation}" must descend the cognitive axis: ${e.id} (${lf} -> ${lt})`);
            }
            if (rule.direction === "ascend" && descentDirection(lf, lt) !== "ascend") {
                problems.push(`"${e.relation}" must ascend the cognitive axis: ${e.id} (${lf} -> ${lt})`);
            }
            if (rule.direction === "dual" && LAYER_DUAL[lf] !== lt) {
                problems.push(`"dual_of" must link dual layers: ${e.id} (${lf} -> ${lt})`);
            }
        }
    }

    const morphIds = new Set<string>();
    for (const m of g.morphisms ?? []) {
        if (morphIds.has(m.id)) problems.push(`duplicate morphism id: ${m.id}`);
        morphIds.add(m.id);
        if (!isMorphismKind(m.kind)) { problems.push(`bad morphism kind on ${m.id}: ${m.kind}`); continue; }
        if (!ids.has(m.from)) problems.push(`dangling morphism source: ${m.id} -> ${m.from}`);
        if (!ids.has(m.to)) problems.push(`dangling morphism target: ${m.id} -> ${m.to}`);
        if (!inRange01(m.confidence)) problems.push(`confidence out of [0,1] on ${m.id}`);

        const sig = MORPHISM_SIGNATURE[m.kind];
        const lf = layerById.get(m.from);
        const lt = layerById.get(m.to);
        if (sig && lf && !sig.from.includes(lf)) {
            problems.push(`morphism ${m.kind} on ${m.id}: source layer ${lf} not in ${sig.from.join("|")}`);
        }
        if (sig && lt && !sig.to.includes(lt)) {
            problems.push(`morphism ${m.kind} on ${m.id}: target layer ${lt} not in ${sig.to.join("|")}`);
        }
    }

    const oblIds = new Set<string>();
    for (const c of g.coherence ?? []) {
        if (oblIds.has(c.id)) problems.push(`duplicate coherence id: ${c.id}`);
        oblIds.add(c.id);
        if (!(c.kind in COHERENCE_LAW)) problems.push(`bad coherence kind on ${c.id}: ${c.kind}`);
        if (!c.refs?.length) problems.push(`coherence obligation without refs: ${c.id}`);
        for (const r of c.refs ?? []) {
            if (!ids.has(r) && !morphIds.has(r) && !edgeIds.has(r)) {
                problems.push(`dangling coherence ref on ${c.id}: ${r}`);
            }
        }
    }

    for (const m of g.morphisms ?? []) {
        for (const o of m.obligations ?? []) {
            if (!oblIds.has(o)) problems.push(`morphism ${m.id} cites unknown obligation: ${o}`);
        }
    }

    for (const cl of g.clusters ?? []) {
        for (const member of cl.members) {
            if (!ids.has(member)) problems.push(`cluster ${cl.id} has unknown member: ${member}`);
        }
        if (cl.root && !ids.has(cl.root)) problems.push(`cluster ${cl.id} has unknown root: ${cl.root}`);
    }

    for (const i of g.unresolved ?? []) {
        for (const r of i.refs ?? []) {
            if (!ids.has(r) && !edgeIds.has(r) && !morphIds.has(r) && !oblIds.has(r)) {
                problems.push(`issue "${i.kind}" references unknown id: ${r}`);
            }
        }
    }

    problems.push(...findCycles(g).map((c) => `cycle: ${c.join(" -> ")}`));
    return problems;
}

/** Cycles over `ACYCLIC_RELATIONS` only. */
export function findCycles(g: TheoryGraph): string[][] {
    const adj = new Map<string, string[]>();
    for (const e of g.edges) {
        if (!(ACYCLIC_RELATIONS as readonly string[]).includes(e.relation)) continue;
        (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    }

    const cycles: string[][] = [];
    const state = new Map<string, 0 | 1 | 2>(); // 0 unseen, 1 on stack, 2 done
    const stack: string[] = [];

    const walk = (id: string): void => {
        state.set(id, 1);
        stack.push(id);
        for (const next of adj.get(id) ?? []) {
            const s = state.get(next) ?? 0;
            if (s === 1) cycles.push([...stack.slice(stack.indexOf(next)), next]);
            else if (s === 0) walk(next);
        }
        stack.pop();
        state.set(id, 2);
    };

    for (const n of g.nodes) if ((state.get(n.id) ?? 0) === 0) walk(n.id);
    return cycles;
}

/**
 * Advisory checks, not structural errors: places where the schema says a
 * transport or an obligation *ought* to exist and the graph has none.
 * Feed the results into `unresolved` rather than failing the build.
 */
export function findMissingMorphisms(g: TheoryGraph): Issue[] {
    const issues: Issue[] = [];
    const layerById = new Map(g.nodes.map((n) => [n.id, layerOf(n)] as const));
    const transported = new Set(
        (g.morphisms ?? []).flatMap((m) => [`${m.from}|${m.to}`, `${m.to}|${m.from}`]),
    );

    for (const e of g.edges) {
        const lf = layerById.get(e.from);
        const lt = layerById.get(e.to);
        if (!lf || !lt || lf === lt) continue;
        if (!isCognitive(lf) || !isCognitive(lt)) continue;
        if (e.relation !== "formalizes" && e.relation !== "abstracts" && e.relation !== "instantiates") continue;
        if (transported.has(`${e.from}|${e.to}`)) continue;
        issues.push({
            kind: "missing_morphism",
            description: `"${e.relation}" crosses ${lf} -> ${lt} with no named morphism transporting the object`,
            refs: [e.id, e.from, e.to],
            layers: [lf, lt],
        });
    }
    return issues;
}

/** Recompute `stats` from the graph contents. */
export function computeStats(g: TheoryGraph): GraphStats {
    const by_kind: Partial<Record<NodeKind, number>> = {};
    const by_layer: Partial<Record<Layer, number>> = {};
    const by_relation: Partial<Record<RelationKind, number>> = {};
    const by_morphism: Partial<Record<MorphismKind, number>> = {};
    const by_coherence: Partial<Record<CoherenceKind, number>> = {};
    const layerById = new Map<string, Layer>();

    for (const n of g.nodes) {
        by_kind[n.kind] = (by_kind[n.kind] ?? 0) + 1;
        const l = layerOf(n);
        layerById.set(n.id, l);
        by_layer[l] = (by_layer[l] ?? 0) + 1;
    }
    let cross = 0;
    for (const e of g.edges) {
        by_relation[e.relation] = (by_relation[e.relation] ?? 0) + 1;
        const lf = layerById.get(e.from);
        const lt = layerById.get(e.to);
        if (lf && lt && lf !== lt) cross++;
    }
    for (const m of g.morphisms ?? []) by_morphism[m.kind] = (by_morphism[m.kind] ?? 0) + 1;
    for (const c of g.coherence ?? []) by_coherence[c.kind] = (by_coherence[c.kind] ?? 0) + 1;

    return {
        documents: g.corpus.documents.length,
        nodes: g.nodes.length,
        edges: g.edges.length,
        morphisms: (g.morphisms ?? []).length,
        obligations: (g.coherence ?? []).length,
        by_kind,
        by_relation,
        by_layer,
        by_morphism,
        by_coherence,
        cross_layer_edges: cross,
    };
}