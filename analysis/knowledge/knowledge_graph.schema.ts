/**
 * knowledge_graph.schema.ts
 *
 * Shape of `knowledge_graph.json` — the companion to `theory_graph.json`.
 *
 * Where the theory graph records *claims* (what the corpus asserts, at which
 * ontological layer, on what evidence), this graph records the *vocabulary the
 * claims are phrased in*: terms, notations, named objects, methods, tools and
 * prior work, together with how they relate.
 *
 * DESIGN COMMITMENT — relations before definitions.
 *   An entry is created the moment a term is used as though it meant something.
 *   `definition_status` is REQUIRED; `gloss` is OPTIONAL BY DESIGN and must only
 *   be filled from the corpus's own words. The extractor's job is to map usage,
 *   not to supply meaning. Missing meaning is an *output* (`requests`), not a gap.
 *
 * Bridging: an `Entry` may `grounds` a set of theory-graph node ids. The theory
 * graph never needs to know this file exists.
 *
 * The only imports are sibling types from the theory schema, so the two graphs
 * agree on layers, sources, citations and documents. No external dependencies.
 */

import {
    type Layer,
    type SourceRef,
    type Citation,
    type DocumentRef,
    isLayer,
} from "../theory/theory_graph.schema";

export type { Layer, SourceRef, Citation, DocumentRef };

/* ------------------------------------------------------------------ *
 * Entry kinds
 * ------------------------------------------------------------------ */

/**
 * What sort of name an entry is. Three groups:
 *   language — the word/glyph itself, independent of what it denotes
 *   content  — the thing denoted
 *   context  — the surrounding apparatus (people, works, tools, conventions)
 */
export type EntryKind =
    /* language ------------------------------------------------------- */
    | "term"            // a word or phrase used as if it meant something
    | "notation"        // a symbol, glyph or syntactic convention
    | "abbreviation"    // acronym / short form
    /* content -------------------------------------------------------- */
    | "concept"         // structured idea with no single formal definition
    | "object"          // a specific named object (the zeta function)
    | "structure"       // a class of objects (group, ring, wheel)
    | "property"        // a predicate objects may satisfy (squarefree)
    | "operation"       // a named map or transformation (sieving, lifting)
    | "quantity"        // a named measurable (density, gap, modulus)
    | "unit"            // ms, bits, candidates/s
    | "named_result"    // "Dirichlet's theorem" as a NAME (claim -> theory graph)
    | "method"          // technique, algorithm or recipe, by name
    | "problem"         // a named problem or task
    /* context -------------------------------------------------------- */
    | "field"           // subject area
    | "tool"            // software, language, library, machine
    | "format"          // file / data / interchange format, encoding
    | "dataset"
    | "person"
    | "work"            // paper, book, page, thread, conversation
    | "convention";     // house rule, naming scheme, unit choice

export const ENTRY_KINDS: readonly EntryKind[] = [
    "term", "notation", "abbreviation",
    "concept", "object", "structure", "property", "operation", "quantity",
    "unit", "named_result", "method", "problem",
    "field", "tool", "format", "dataset", "person", "work", "convention",
] as const;

export type EntryGroup = "language" | "content" | "context";

export const ENTRY_KIND_GROUP: Record<EntryKind, EntryGroup> = {
    term: "language",
    notation: "language",
    abbreviation: "language",

    concept: "content",
    object: "content",
    structure: "content",
    property: "content",
    operation: "content",
    quantity: "content",
    unit: "content",
    named_result: "content",
    method: "content",
    problem: "content",

    field: "context",
    tool: "context",
    format: "context",
    dataset: "context",
    person: "context",
    work: "context",
    convention: "context",
};

/* ------------------------------------------------------------------ *
 * Definition status — the lattice the whole schema turns on
 * ------------------------------------------------------------------ */

export type DefinitionStatus =
    | "defined_here"      // the corpus states a definition
    | "defined_elsewhere" // the corpus points at one (citation, link, "see X")
    | "assumed_known"     // used freely, never explained
    | "gestured"          // shape indicated, not pinned down
    | "ambiguous"         // several readings, none selected
    | "conflicting"       // the corpus defines it two incompatible ways
    | "undefined"         // used once or twice with no explanatory context
    | "unknown";          // the extractor could not tell

export const DEFINITION_STATUSES: readonly DefinitionStatus[] = [
    "defined_here", "defined_elsewhere", "assumed_known", "gestured",
    "ambiguous", "conflicting", "undefined", "unknown",
] as const;

/** Which statuses generate a follow-up `DefinitionRequest`. */
export const NEEDS_FOLLOWUP: Record<DefinitionStatus, boolean> = {
    defined_here: false,
    defined_elsewhere: false,
    assumed_known: true,
    gestured: true,
    ambiguous: true,
    conflicting: true,
    undefined: true,
    unknown: true,
};

/** How much of the discussion leans on the entry. */
export type Role =
    | "introduced"   // the corpus brings it in as new
    | "central"      // much of the discussion is phrased in it
    | "supporting"
    | "background"   // assumed apparatus
    | "incidental"
    | "questioned"   // the corpus doubts it
    | "rejected";    // the corpus discards it

export const ROLES: readonly Role[] = [
    "introduced", "central", "supporting", "background",
    "incidental", "questioned", "rejected",
] as const;

/* ------------------------------------------------------------------ *
 * Mentions, glosses, senses
 * ------------------------------------------------------------------ */

/** What the occurrence does with the term. */
export type MentionRole =
    | "introduces" | "defines" | "uses" | "cites"
    | "contrasts" | "questions" | "renames" | "exemplifies";

/** One occurrence in the corpus. Every entry needs at least one. */
export interface Mention {
    source: SourceRef;
    role?: MentionRole;
    /** Sense id, when the entry is polysemous here. */
    sense?: string;
    /** Surface form as it appeared, if not the entry's label. */
    surface?: string;
}

/**
 * A short paraphrase. OPTIONAL BY DESIGN: fill only from the corpus's own
 * words, and set `provisional` whenever the extractor did the paraphrasing.
 */
export interface Gloss {
    /** <= 240 chars, one sentence, no trailing commentary. */
    text: string;
    /** True when `text` is quoted verbatim from the corpus. */
    verbatim?: boolean;
    /** True when the extractor wrote it and it must be confirmed. */
    provisional?: boolean;
    source?: SourceRef;
}

/** Where the definition lives, if anywhere. */
export interface DefinitionRef {
    where: "corpus" | "external" | "sibling_graph" | "none";
    /** Theory-graph node id (usually a `definition` node). */
    node?: string;
    /** Another entry that carries the definition. */
    entry?: string;
    citation?: Citation;
    source?: SourceRef;
}

/**
 * A distinct reading of one entry. Two senses always beat silently picking
 * one. The commonest source of sense-splitting is the metaontology itself:
 * "equality" differs symbolically, deductively and numerically.
 */
export interface Sense {
    /** `<entry-id>#<kebab-slug>`. */
    id: string;
    gloss?: Gloss;
    /** The ontological layer this reading belongs to. */
    layer?: Layer;
    /** What tells this reading apart in context. */
    discriminator?: string;
    definition_status?: DefinitionStatus;
    sources?: SourceRef[];
}

/* ------------------------------------------------------------------ *
 * Entries
 * ------------------------------------------------------------------ */

export interface Entry {
    /** `<kind>.<kebab-slug>`, unique and stable across runs. */
    id: string;
    kind: EntryKind;
    /** Short human label, as the corpus writes it (title case, no period). */
    label: string;
    /** Other surface forms that denote the same entry. */
    aliases?: string[];
    /** Notation bound to this entry, LaTeX where possible. */
    symbols?: string[];
    /** Optional by design — see `Gloss`. */
    gloss?: Gloss;
    /** REQUIRED. The point of the graph. */
    definition_status: DefinitionStatus;
    definition_ref?: DefinitionRef;
    /** Distinct readings; presence of >1 usually implies `ambiguous`. */
    senses?: Sense[];
    role?: Role;
    /** Metaontology layers the term is actually used at. */
    layers?: Layer[];
    /** Recorded, not smoothed away: how the meaning shifts between layers. */
    layer_drift?: string;
    /** Coarse subject tag; free strings allowed. */
    domain?: string;
    tags?: string[];
    /** Every place the corpus touches it. At least one. */
    mentions: Mention[];
    /** Convenience mirror of `mentions.length`; recomputable. */
    mention_count?: number;
    /** Document id of first appearance (corpus order). */
    first_seen?: string;
    /** Theory-graph node ids this entry supplies vocabulary for. */
    grounds?: string[];
    /** External pointers the corpus gives for this entry. */
    references?: Citation[];
    /** Extraction confidence in [0, 1] — not a claim about correctness. */
    confidence?: number;
    /** Extractor commentary: inferences, ambiguities, caveats. */
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Relations
 * ------------------------------------------------------------------ */

/** Directed relation from `from` to `to`, grouped by licensing evidence. */
export type RelationKind =
    /* lexical — evidence: the surface form */
    | "synonym_of"
    | "abbreviation_of"
    | "variant_of"
    | "notation_for"
    | "homonym_of"
    | "renames"
    /* taxonomic — evidence: classificatory phrasing */
    | "is_a"
    | "instance_of"
    | "part_of"
    | "has_part"
    | "generalizes"
    | "specializes"
    /* definitional — evidence: appears inside another's explanation */
    | "defined_in_terms_of"
    | "presupposes"
    | "prerequisite_of"
    | "disambiguated_by"
    /* functional — evidence: verb-argument structure */
    | "operates_on"
    | "produces"
    | "parameterized_by"
    | "measured_by"
    | "implements"
    | "computes"
    | "applies_to"
    /* discourse — evidence: adjacency and rhetorical framing */
    | "co_occurs_with"
    | "contrasts_with"
    | "alternative_to"
    | "analogous_to"
    | "example_of"
    | "counterexample_to"
    | "motivates"
    | "see_also"
    /* provenance — evidence: names and citations */
    | "attributed_to"
    | "introduced_in"
    | "documented_in"
    | "cites";

export const RELATION_KINDS: readonly RelationKind[] = [
    "synonym_of", "abbreviation_of", "variant_of", "notation_for", "homonym_of", "renames",
    "is_a", "instance_of", "part_of", "has_part", "generalizes", "specializes",
    "defined_in_terms_of", "presupposes", "prerequisite_of", "disambiguated_by",
    "operates_on", "produces", "parameterized_by", "measured_by", "implements",
    "computes", "applies_to",
    "co_occurs_with", "contrasts_with", "alternative_to", "analogous_to",
    "example_of", "counterexample_to", "motivates", "see_also",
    "attributed_to", "introduced_in", "documented_in", "cites",
] as const;

export type RelationGroup =
    | "lexical" | "taxonomic" | "definitional"
    | "functional" | "discourse" | "provenance";

export const RELATION_GROUP: Record<RelationKind, RelationGroup> = {
    synonym_of: "lexical",
    abbreviation_of: "lexical",
    variant_of: "lexical",
    notation_for: "lexical",
    homonym_of: "lexical",
    renames: "lexical",

    is_a: "taxonomic",
    instance_of: "taxonomic",
    part_of: "taxonomic",
    has_part: "taxonomic",
    generalizes: "taxonomic",
    specializes: "taxonomic",

    defined_in_terms_of: "definitional",
    presupposes: "definitional",
    prerequisite_of: "definitional",
    disambiguated_by: "definitional",

    operates_on: "functional",
    produces: "functional",
    parameterized_by: "functional",
    measured_by: "functional",
    implements: "functional",
    computes: "functional",
    applies_to: "functional",

    co_occurs_with: "discourse",
    contrasts_with: "discourse",
    alternative_to: "discourse",
    analogous_to: "discourse",
    example_of: "discourse",
    counterexample_to: "discourse",
    motivates: "discourse",
    see_also: "discourse",

    attributed_to: "provenance",
    introduced_in: "provenance",
    documented_in: "provenance",
    cites: "provenance",
};

/** Relations that hold in both directions; renderers may draw them once. */
export const SYMMETRIC_RELATIONS: readonly RelationKind[] = [
    "synonym_of", "homonym_of", "variant_of", "co_occurs_with",
    "contrasts_with", "alternative_to", "analogous_to", "see_also",
] as const;

/** Semantic inverse, where one exists. */
export const INVERSE_RELATION: Partial<Record<RelationKind, RelationKind>> = {
    synonym_of: "synonym_of",
    homonym_of: "homonym_of",
    variant_of: "variant_of",
    co_occurs_with: "co_occurs_with",
    contrasts_with: "contrasts_with",
    alternative_to: "alternative_to",
    analogous_to: "analogous_to",
    see_also: "see_also",
    part_of: "has_part",
    has_part: "part_of",
    generalizes: "specializes",
    specializes: "generalizes",
    presupposes: "prerequisite_of",
    prerequisite_of: "presupposes",
};

/** Relations that must form a DAG over the entry set. */
export const ACYCLIC_RELATIONS: readonly RelationKind[] = [
    "is_a", "part_of", "specializes", "defined_in_terms_of",
    "presupposes", "prerequisite_of",
] as const;

/** Relations whose ordering drives the follow-up queue. */
export const DEPENDENCY_RELATIONS: readonly RelationKind[] = [
    "defined_in_terms_of", "presupposes",
] as const;

/** Endpoint discipline: which entry kinds may sit at each end. */
export const RELATION_ENDPOINT_RULES: Partial<Record<RelationKind, {
    from?: readonly EntryKind[];
    to?: readonly EntryKind[];
}>> = {
    notation_for: { from: ["notation", "abbreviation"] },
    abbreviation_of: { from: ["abbreviation", "notation"] },
    attributed_to: { to: ["person"] },
    introduced_in: { to: ["work", "dataset", "tool"] },
    documented_in: { to: ["work", "dataset", "tool", "format"] },
    implements: { from: ["tool", "method", "dataset"] },
    measured_by: { to: ["quantity", "unit", "method"] },
    parameterized_by: { to: ["quantity", "unit", "object", "structure"] },
};

export interface KnowledgeEdge {
    /** `k.<from-slug>.<relation>.<to-slug>`. */
    id: string;
    /** Entry id. */
    from: string;
    /** Entry id. */
    to: string;
    relation: RelationKind;
    /** Optional label for rendering. */
    label?: string;
    /**
     * How strongly the relation holds, in [0, 1]. For `co_occurs_with` this is
     * the normalised co-occurrence weight.
     */
    strength?: number;
    /** Extraction confidence in [0, 1]. */
    confidence?: number;
    /** Sense ids when the relation only holds under a particular reading. */
    from_sense?: string;
    to_sense?: string;
    sources?: SourceRef[];
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Definition requests — the map read as a work queue
 * ------------------------------------------------------------------ */

export type RequestWant =
    | "formal_definition"
    | "gloss"
    | "disambiguation"
    | "citation"
    | "example"
    | "notation_key"
    | (string & {});

export interface DefinitionRequest {
    /** `q.<entry-slug>`. */
    id: string;
    /** Entry id the request is about. */
    entry: string;
    /** Why the definition is wanted now, in one sentence. */
    reason: string;
    /** What shape of answer would close it. */
    wants?: RequestWant;
    priority?: "high" | "medium" | "low";
    /** Derived score in [0, 1]: centrality x mention weight x undefinedness. */
    score?: number;
    /** Entry ids that should be defined first (dependency relations). */
    blocked_by?: string[];
    /** Where to look. */
    candidates?: Citation[];
    status?: "open" | "answered" | "deferred" | "dropped";
    sources?: SourceRef[];
    notes?: string;
}

/* ------------------------------------------------------------------ *
 * Topics, issues, stats
 * ------------------------------------------------------------------ */

export interface Topic {
    id: string;
    name: string;
    /** Entry ids. */
    members: string[];
    /** Entry id acting as the topic's head. */
    root?: string;
    kind?:
        | "glossary_section"
        | "thread"
        | "prerequisite_chain"
        | "notation_family"
        | "synonym_ring"
        | (string & {});
    /** Layers the members are used at. */
    layers?: Layer[];
    summary?: string;
}

export type IssueKind =
    | "undefined_term"
    | "ambiguous_term"
    | "conflicting_definitions"
    | "orphan_entry"          // no relations and grounds nothing
    | "dangling_reference"
    | "notation_clash"        // one symbol claimed by several entries
    | "alias_collision"       // one alias claimed by several entries
    | "cycle"
    | "missing_source"
    | "unbridged_entry"       // never grounds a theory node
    | "layer_drift"           // used at incompatible layers, unreconciled
    | "phantom_entry";        // entry with no textual evidence

export interface Issue {
    kind: IssueKind;
    description: string;
    /** Entry, edge, request or topic ids involved. */
    refs?: string[];
    layers?: Layer[];
    sources?: SourceRef[];
}

export interface KnowledgeStats {
    documents: number;
    entries: number;
    edges: number;
    requests?: number;
    by_kind?: Partial<Record<EntryKind, number>>;
    by_group?: Partial<Record<EntryGroup, number>>;
    by_relation?: Partial<Record<RelationKind, number>>;
    by_relation_group?: Partial<Record<RelationGroup, number>>;
    by_definition_status?: Partial<Record<DefinitionStatus, number>>;
    by_layer?: Partial<Record<Layer, number>>;
    /** Entries whose status needs follow-up. */
    undefined_entries?: number;
    /** Entries that ground at least one theory node. */
    bridged_entries?: number;
    mentions?: number;
}

/* ------------------------------------------------------------------ *
 * Root
 * ------------------------------------------------------------------ */

export interface KnowledgeGraph {
    $schema?: string;
    /** Semver of this schema. */
    version: string;
    /** ISO-8601 timestamp of extraction. */
    generated_at?: string;
    generator?: { op: string; model?: string };
    corpus: { documents: DocumentRef[] };
    /** The theory graph this one supplies vocabulary for. */
    companion?: { theory_graph?: string; version?: string };
    entries: Entry[];
    edges: KnowledgeEdge[];
    /** The follow-up queue; normally derived by `findDefinitionGaps`. */
    requests?: DefinitionRequest[];
    topics?: Topic[];
    unresolved?: Issue[];
    stats?: KnowledgeStats;
}

/* ------------------------------------------------------------------ *
 * Runtime helpers (structural validation, no external deps)
 * ------------------------------------------------------------------ */

export function isEntryKind(x: unknown): x is EntryKind {
    return typeof x === "string" && (ENTRY_KINDS as readonly string[]).includes(x);
}

export function isRelationKind(x: unknown): x is RelationKind {
    return typeof x === "string" && (RELATION_KINDS as readonly string[]).includes(x);
}

export function isDefinitionStatus(x: unknown): x is DefinitionStatus {
    return typeof x === "string" && (DEFINITION_STATUSES as readonly string[]).includes(x);
}

export function isSymmetric(r: RelationKind): boolean {
    return (SYMMETRIC_RELATIONS as readonly string[]).includes(r);
}

export function groupOf(e: Entry): EntryGroup {
    return ENTRY_KIND_GROUP[e.kind] ?? "content";
}

export function mentionCount(e: Entry): number {
    return e.mention_count ?? e.mentions?.length ?? 0;
}

export function needsDefinition(e: Entry): boolean {
    return NEEDS_FOLLOWUP[e.definition_status] ?? true;
}

function inRange01(x: unknown): boolean {
    return typeof x !== "number" || (x >= 0 && x <= 1);
}

/** Normalised undirected degree in [0, 1], keyed by entry id. */
export function centrality(g: KnowledgeGraph): Map<string, number> {
    const degree = new Map<string, number>();
    for (const e of g.entries) degree.set(e.id, 0);
    for (const edge of g.edges) {
        const w = edge.strength ?? 1;
        degree.set(edge.from, (degree.get(edge.from) ?? 0) + w);
        degree.set(edge.to, (degree.get(edge.to) ?? 0) + w);
    }
    let max = 0;
    // @ts-ignore
    for (const v of degree.values()) if (v > max) max = v;
    const out = new Map<string, number>();
    // @ts-ignore
    for (const [k, v] of degree) out.set(k, max > 0 ? v / max : 0);
    return out;
}

/**
 * Returns a list of human-readable problems with a candidate graph.
 * Empty array == structurally valid.
 */
export function validateKnowledgeGraph(g: KnowledgeGraph): string[] {
    const problems: string[] = [];
    const ids = new Set<string>();
    const senseIds = new Set<string>();
    const kindById = new Map<string, EntryKind>();

    for (const e of g.entries) {
        if (ids.has(e.id)) problems.push(`duplicate entry id: ${e.id}`);
        ids.add(e.id);
        kindById.set(e.id, e.kind);

        if (!isEntryKind(e.kind)) problems.push(`bad kind on ${e.id}: ${e.kind}`);
        if (!e.label?.trim()) problems.push(`empty label on ${e.id}`);
        if (!isDefinitionStatus(e.definition_status)) {
            problems.push(`bad definition_status on ${e.id}: ${e.definition_status}`);
        }
        if (!e.mentions?.length) {
            problems.push(`entry without mentions (phantom?): ${e.id}`);
        }
        for (const m of e.mentions ?? []) {
            if (!m.source?.file) problems.push(`mention without source file on ${e.id}`);
        }
        if (!inRange01(e.confidence)) problems.push(`confidence out of [0,1] on ${e.id}`);
        if (e.mention_count !== undefined && e.mentions &&
            e.mention_count !== e.mentions.length) {
            problems.push(`mention_count disagrees with mentions on ${e.id}`);
        }
        for (const l of e.layers ?? []) {
            if (!isLayer(l)) problems.push(`bad layer on ${e.id}: ${l}`);
        }
        if ((e.layers?.length ?? 0) > 1 && !e.layer_drift?.trim() && !(e.senses?.length)) {
            problems.push(`multi-layer entry ${e.id} needs layer_drift or senses`);
        }
        if (e.gloss && !e.gloss.verbatim && !e.gloss.provisional) {
            problems.push(`gloss on ${e.id} must be marked verbatim or provisional`);
        }
        if ((e.senses?.length ?? 0) > 1 &&
            e.definition_status !== "ambiguous" &&
            e.definition_status !== "conflicting" &&
            e.definition_status !== "defined_here") {
            problems.push(`entry ${e.id} has ${e.senses!.length} senses but status "${e.definition_status}"`);
        }
        for (const s of e.senses ?? []) {
            if (senseIds.has(s.id)) problems.push(`duplicate sense id: ${s.id}`);
            senseIds.add(s.id);
            if (!s.id.startsWith(`${e.id}#`)) {
                problems.push(`sense id must be "<entry-id>#<slug>": ${s.id} on ${e.id}`);
            }
            if (s.layer && !isLayer(s.layer)) problems.push(`bad sense layer on ${s.id}: ${s.layer}`);
        }
        if (e.definition_status === "defined_here" && !e.definition_ref && !e.gloss) {
            problems.push(`"defined_here" on ${e.id} with neither gloss nor definition_ref`);
        }
        if (e.definition_status === "defined_elsewhere" &&
            !e.definition_ref?.citation && !e.definition_ref?.entry && !e.definition_ref?.node) {
            problems.push(`"defined_elsewhere" on ${e.id} with no definition_ref target`);
        }
    }

    // Second pass: references needing the full id set.
    for (const e of g.entries) {
        if (e.definition_ref?.entry && !ids.has(e.definition_ref.entry)) {
            problems.push(`dangling definition_ref entry on ${e.id}: ${e.definition_ref.entry}`);
        }
        for (const m of e.mentions ?? []) {
            if (m.sense && !senseIds.has(m.sense)) {
                problems.push(`mention cites unknown sense on ${e.id}: ${m.sense}`);
            }
        }
    }

    // Alias / symbol collisions: one surface form, several entries.
    const claim = (map: Map<string, string[]>, key: string, id: string) => {
        const k = key.trim().toLowerCase();
        if (!k) return;
        map.set(k, [...(map.get(k) ?? []), id]);
    };
    const aliasOwners = new Map<string, string[]>();
    const symbolOwners = new Map<string, string[]>();
    for (const e of g.entries) {
        claim(aliasOwners, e.label, e.id);
        for (const a of e.aliases ?? []) claim(aliasOwners, a, e.id);
        for (const s of e.symbols ?? []) claim(symbolOwners, s, e.id);
    }
    // @ts-ignore
    for (const [k, owners] of aliasOwners) {
        if (owners.length > 1) problems.push(`alias collision "${k}": ${owners.join(", ")}`);
    }
    // @ts-ignore
    for (const [k, owners] of symbolOwners) {
        if (owners.length > 1) problems.push(`notation clash "${k}": ${owners.join(", ")}`);
    }

    const edgeIds = new Set<string>();
    const seenPairs = new Set<string>();
    for (const edge of g.edges) {
        if (edgeIds.has(edge.id)) problems.push(`duplicate edge id: ${edge.id}`);
        edgeIds.add(edge.id);
        if (!isRelationKind(edge.relation)) {
            problems.push(`bad relation on ${edge.id}: ${edge.relation}`);
            continue;
        }
        if (!ids.has(edge.from)) problems.push(`dangling edge source: ${edge.id} -> ${edge.from}`);
        if (!ids.has(edge.to)) problems.push(`dangling edge target: ${edge.id} -> ${edge.to}`);
        if (edge.from === edge.to) problems.push(`self-relation on ${edge.id}`);
        if (!inRange01(edge.confidence)) problems.push(`confidence out of [0,1] on ${edge.id}`);
        if (!inRange01(edge.strength)) problems.push(`strength out of [0,1] on ${edge.id}`);

        const key = isSymmetric(edge.relation)
            ? `${edge.relation}|${[edge.from, edge.to].sort().join("|")}`
            : `${edge.relation}|${edge.from}|${edge.to}`;
        if (seenPairs.has(key)) problems.push(`redundant relation on ${edge.id} (${edge.relation})`);
        seenPairs.add(key);

        const rule = RELATION_ENDPOINT_RULES[edge.relation];
        const kf = kindById.get(edge.from);
        const kt = kindById.get(edge.to);
        if (rule?.from && kf && !rule.from.includes(kf)) {
            problems.push(`relation ${edge.relation} on ${edge.id} must originate in ${rule.from.join("|")}, got ${kf}`);
        }
        if (rule?.to && kt && !rule.to.includes(kt)) {
            problems.push(`relation ${edge.relation} on ${edge.id} must target ${rule.to.join("|")}, got ${kt}`);
        }
        if (edge.from_sense && !senseIds.has(edge.from_sense)) {
            problems.push(`edge ${edge.id} cites unknown from_sense: ${edge.from_sense}`);
        }
        if (edge.to_sense && !senseIds.has(edge.to_sense)) {
            problems.push(`edge ${edge.id} cites unknown to_sense: ${edge.to_sense}`);
        }
    }

    const requestIds = new Set<string>();
    for (const r of g.requests ?? []) {
        if (requestIds.has(r.id)) problems.push(`duplicate request id: ${r.id}`);
        requestIds.add(r.id);
        if (!ids.has(r.entry)) problems.push(`request ${r.id} targets unknown entry: ${r.entry}`);
        if (!r.reason?.trim()) problems.push(`request without reason: ${r.id}`);
        if (!inRange01(r.score)) problems.push(`score out of [0,1] on ${r.id}`);
        for (const b of r.blocked_by ?? []) {
            if (!ids.has(b)) problems.push(`request ${r.id} blocked by unknown entry: ${b}`);
        }
    }

    for (const t of g.topics ?? []) {
        for (const member of t.members) {
            if (!ids.has(member)) problems.push(`topic ${t.id} has unknown member: ${member}`);
        }
        if (t.root && !ids.has(t.root)) problems.push(`topic ${t.id} has unknown root: ${t.root}`);
    }

    for (const i of g.unresolved ?? []) {
        for (const r of i.refs ?? []) {
            if (!ids.has(r) && !edgeIds.has(r) && !requestIds.has(r) && !senseIds.has(r)) {
                problems.push(`issue "${i.kind}" references unknown id: ${r}`);
            }
        }
    }

    problems.push(...findCycles(g).map((c) => `cycle: ${c.join(" -> ")}`));
    return problems;
}

/** Cycles over `ACYCLIC_RELATIONS` only. */
export function findCycles(g: KnowledgeGraph): string[][] {
    const adj = new Map<string, string[]>();
    for (const e of g.edges) {
        if (!(ACYCLIC_RELATIONS as readonly string[]).includes(e.relation)) continue;
        const bucket = adj.get(e.from) ?? [];
        bucket.push(e.to);
        adj.set(e.from, bucket);
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

    for (const e of g.entries) if ((state.get(e.id) ?? 0) === 0) walk(e.id);
    return cycles;
}

/**
 * Derive the follow-up queue: every entry whose meaning the corpus never
 * settles, ranked by how much of the discussion leans on it.
 *
 * score = 0.5 * centrality + 0.5 * (mentions / maxMentions)
 */
export function findDefinitionGaps(g: KnowledgeGraph): DefinitionRequest[] {
    const cent = centrality(g);
    const maxMentions = Math.max(1, ...g.entries.map(mentionCount));
    const undefinedIds = new Set(g.entries.filter(needsDefinition).map((e) => e.id));

    const blockers = new Map<string, string[]>();
    for (const e of g.edges) {
        if (!(DEPENDENCY_RELATIONS as readonly string[]).includes(e.relation)) continue;
        if (!undefinedIds.has(e.to)) continue;
        blockers.set(e.from, [...(blockers.get(e.from) ?? []), e.to]);
    }

    const wantFor = (e: Entry): RequestWant => {
        if (e.kind === "notation" || e.kind === "abbreviation") return "notation_key";
        if (e.definition_status === "ambiguous" || e.definition_status === "conflicting") {
            return "disambiguation";
        }
        if (e.definition_status === "gestured") return "formal_definition";
        if (ENTRY_KIND_GROUP[e.kind] === "context") return "citation";
        return "gloss";
    };

    const requests: DefinitionRequest[] = [];
    for (const e of g.entries) {
        if (!needsDefinition(e)) continue;
        const score = 0.5 * (cent.get(e.id) ?? 0) + 0.5 * (mentionCount(e) / maxMentions);
        if (score === 0 && mentionCount(e) < 2) continue; // truly incidental
        const slug = e.id.includes(".") ? e.id.slice(e.id.indexOf(".") + 1) : e.id;
        requests.push({
            id: `q.${slug}`,
            entry: e.id,
            reason:
                `"${e.label}" is ${e.definition_status.replace(/_/g, " ")} after ` +
                `${mentionCount(e)} mention(s)` +
                (e.grounds?.length ? ` and grounds ${e.grounds.length} theory node(s)` : ""),
            wants: wantFor(e),
            priority: score >= 0.66 ? "high" : score >= 0.33 ? "medium" : "low",
            score: Number(score.toFixed(3)),
            blocked_by: blockers.get(e.id),
            status: "open",
            sources: e.mentions?.slice(0, 2).map((m) => m.source),
        });
    }
    return requests.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/**
 * Advisory checks, not structural errors. Feed the results into `unresolved`
 * rather than failing the build.
 */
export function findAdvisoryIssues(g: KnowledgeGraph): Issue[] {
    const issues: Issue[] = [];
    const degree = new Map<string, number>();
    for (const e of g.edges) {
        degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
        degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }

    for (const e of g.entries) {
        if ((degree.get(e.id) ?? 0) === 0 && !(e.grounds?.length)) {
            issues.push({
                kind: "orphan_entry",
                description: `"${e.label}" has no relations and grounds nothing — is it load-bearing?`,
                refs: [e.id],
            });
        }
        if (!(e.grounds?.length) && e.role === "central") {
            issues.push({
                kind: "unbridged_entry",
                description: `central entry "${e.label}" grounds no theory node`,
                refs: [e.id],
            });
        }
        if ((e.layers?.length ?? 0) > 1 && !e.layer_drift?.trim()) {
            issues.push({
                kind: "layer_drift",
                description: `"${e.label}" is used at ${e.layers!.join(", ")} with no reconciliation`,
                refs: [e.id],
                layers: e.layers,
            });
        }
        if (e.definition_status === "conflicting") {
            issues.push({
                kind: "conflicting_definitions",
                description: `"${e.label}" is defined incompatibly in the corpus`,
                refs: [e.id],
            });
        }
    }
    return issues;
}

/** Recompute `stats` from the graph contents. */
export function computeStats(g: KnowledgeGraph): KnowledgeStats {
    const by_kind: Partial<Record<EntryKind, number>> = {};
    const by_group: Partial<Record<EntryGroup, number>> = {};
    const by_relation: Partial<Record<RelationKind, number>> = {};
    const by_relation_group: Partial<Record<RelationGroup, number>> = {};
    const by_definition_status: Partial<Record<DefinitionStatus, number>> = {};
    const by_layer: Partial<Record<Layer, number>> = {};

    let mentions = 0;
    let undefinedEntries = 0;
    let bridged = 0;

    for (const e of g.entries) {
        by_kind[e.kind] = (by_kind[e.kind] ?? 0) + 1;
        const grp = groupOf(e);
        by_group[grp] = (by_group[grp] ?? 0) + 1;
        by_definition_status[e.definition_status] =
            (by_definition_status[e.definition_status] ?? 0) + 1;
        for (const l of e.layers ?? []) by_layer[l] = (by_layer[l] ?? 0) + 1;
        mentions += mentionCount(e);
        if (needsDefinition(e)) undefinedEntries++;
        if (e.grounds?.length) bridged++;
    }

    for (const e of g.edges) {
        by_relation[e.relation] = (by_relation[e.relation] ?? 0) + 1;
        const grp = RELATION_GROUP[e.relation];
        if (grp) by_relation_group[grp] = (by_relation_group[grp] ?? 0) + 1;
    }

    return {
        documents: g.corpus.documents.length,
        entries: g.entries.length,
        edges: g.edges.length,
        requests: (g.requests ?? []).length,
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