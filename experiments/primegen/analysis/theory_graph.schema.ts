
/**
 * theory_graph.schema.ts
 *
 * Shape of `theory_graph.json`, produced by `analyze.op.md` from the
 * markdown working notes in `experiments/primegen/`.
 *
 * Dependency-free: the types double as the contract for the extractor and as
 * the type used by downstream consumers (renderers, validators, queries).
 */

/* ------------------------------------------------------------------ *
 * Enumerations
 * ------------------------------------------------------------------ */

/** What sort of claim or object a node represents. */
export type NodeKind =
    | "axiom"          // asserted without proof, used to justify other nodes
    | "definition"     // introduces a term or notation
    | "theory"         // an explanatory framework spanning several claims
    | "model"          // a concrete generator / algorithm / construction
    | "conjecture"     // hedged or unproved claim
    | "lemma"          // proved, used only as a step
    | "theorem"        // proved in the notes, or a cited known result
    | "heuristic"      // rule of thumb, approximation, "good enough"
    | "observation"    // measurement, benchmark, plot reading
    | "experiment"     // a described run that produces observations
    | "artifact"       // code, dataset, table, figure
    | "open_question"; // TODO, "unclear whether…"

export const NODE_KINDS: readonly NodeKind[] = [
    "axiom", "definition", "theory", "model", "conjecture", "lemma",
    "theorem", "heuristic", "observation", "experiment", "artifact",
    "open_question",
] as const;

/** Directed relation from `from` to `to`. */
export type RelationKind =
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
    | "cites";

export const RELATION_KINDS: readonly RelationKind[] = [
    "assumes", "depends_on", "implies", "generalizes", "specializes",
    "equivalent_to", "supports", "refutes", "contradicts", "motivates",
    "tests", "measures", "refines", "instantiates", "cites",
] as const;

/** Semantic inverse, where one exists (used by renderers and consistency checks). */
export const INVERSE_RELATION: Partial<Record<RelationKind, RelationKind>> = {
    generalizes: "specializes",
    specializes: "generalizes",
    equivalent_to: "equivalent_to",
    contradicts: "contradicts",
};

/** Relations that must form a DAG over the node set. */
export const ACYCLIC_RELATIONS: readonly RelationKind[] = [
    "assumes", "depends_on", "implies", "refines",
] as const;

/** Epistemic state of the claim *according to the notes*. */
export type Status =
    | "accepted"
    | "proposed"
    | "tested"
    | "supported"
    | "refuted"
    | "superseded"
    | "abandoned"
    | "unknown";

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
 * Provenance & attributes
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
    source?: SourceRef;
}

/* ------------------------------------------------------------------ *
 * Nodes
 * ------------------------------------------------------------------ */

export interface GraphNode {
    /** `<kind>.<kebab-slug>`, unique and stable across runs. */
    id: string;
    kind: NodeKind;
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
    status: Status;
    /** Extraction confidence in [0, 1] — not the truth of the claim. */
    confidence?: number;
    /** Conditions under which the claim is asserted to hold. */
    scope?: string;
    domain?: Domain;
    tags?: string[];
    attributes?: Attribute[];
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
}

/** An optional grouping of nodes (a theory and its dependents, a thread, …). */
export interface Cluster {
    id: string;
    name: string;
    /** Node ids. */
    members: string[];
    /** Node id acting as the cluster's head, usually a `theory` or `model`. */
    root?: string;
    summary?: string;
}

export type IssueKind =
    | "dangling_reference"
    | "undefined_term"
    | "cycle"
    | "contradiction"
    | "ambiguous_statement"
    | "missing_source"
    | "unparsed_math";

/** Anything the extractor could not resolve — never silently dropped. */
export interface Issue {
    kind: IssueKind;
    description: string;
    /** Node or edge ids involved. */
    refs?: string[];
    sources?: SourceRef[];
}

export interface GraphStats {
    documents: number;
    nodes: number;
    edges: number;
    by_kind?: Partial<Record<NodeKind, number>>;
    by_relation?: Partial<Record<RelationKind, number>>;
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
    nodes: GraphNode[];
    edges: GraphEdge[];
    clusters?: Cluster[];
    unresolved?: Issue[];
    stats?: GraphStats;
}

/* ------------------------------------------------------------------ *
 * Runtime helpers (structural validation, no external deps)
 * ------------------------------------------------------------------ */

export function isNodeKind(x: unknown): x is NodeKind {
    return typeof x === "string" && (NODE_KINDS as readonly string[]).includes(x);
}

export function isRelationKind(x: unknown): x is RelationKind {
    return typeof x === "string" && (RELATION_KINDS as readonly string[]).includes(x);
}

/**
 * Returns a list of human-readable problems with a candidate graph.
 * Empty array == structurally valid.
 */
export function validateTheoryGraph(g: TheoryGraph): string[] {
    const problems: string[] = [];
    const ids = new Set<string>();

    for (const n of g.nodes) {
        if (ids.has(n.id)) problems.push(`duplicate node id: ${n.id}`);
        ids.add(n.id);
        if (!isNodeKind(n.kind)) problems.push(`bad kind on ${n.id}: ${n.kind}`);
        if (!n.statement?.trim()) problems.push(`empty statement on ${n.id}`);
        if (!n.sources?.length) problems.push(`node without sources: ${n.id}`);
    }

    const edgeIds = new Set<string>();
    for (const e of g.edges) {
        if (edgeIds.has(e.id)) problems.push(`duplicate edge id: ${e.id}`);
        edgeIds.add(e.id);
        if (!isRelationKind(e.relation)) problems.push(`bad relation on ${e.id}: ${e.relation}`);
        if (!ids.has(e.from)) problems.push(`dangling edge source: ${e.id} -> ${e.from}`);
        if (!ids.has(e.to)) problems.push(`dangling edge target: ${e.id} -> ${e.to}`);
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