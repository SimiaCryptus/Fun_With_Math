---
transforms: (.*).md -> $1.theory_graph.json
related:
  - theory_graph.schema.ts
---

# Extract a layered theory graph from the primegen notes

Identify the inspirations, hunches, definitions, rewrite rules, axioms, theorems, experiments, citations and
constraints in the notes — with their relations, cross-ontology morphisms, coherence obligations and attributes.

## Inputs

Every markdown document that matches `([^/]*).md`. The capture group is the **document id** (`$1`); use it verbatim in `SourceRef.file` as `<$1>.md` and in `corpus.documents[].id`.

These are working notes: informal prose, derivations, benchmark tables, TODOs and half-finished ideas about prime
generation (sieves, wheels, residue classes, gap statistics, primality tests, RNG-driven candidate search).

## Output

A single JSON object conforming to `TheoryGraph` in
`theory_graph.schema.ts`. Emit **only** the JSON — no prose, no code fences.

## The layer model

Every node lives in exactly one **layer**. Five layers form the vertical cognitive axis; two are orthogonal
contextual axes that modulate all five.

| Layer            | What an object is                         | Existence            | Truth                        | Equality               |
| ---------------- | ----------------------------------------- | -------------------- | ---------------------------- | ---------------------- |
| `-2 inspiration` | a direction in the space of theories      | expressible          | n/a                          | same research trajectory |
| `0 fuzzy`        | a pattern, hunch, sketch, proto-operator  | expressible at all   | n/a (pre-truth-apt)          | similarity of shape    |
| `1 symbolic`     | a term in a rewrite system                | well-formedness      | reaches a normal form        | convertibility         |
| `2 deductive`    | a node in a derivation graph              | derivability         | closure under inference      | provable equivalence   |
| `3 numeric`      | a limit of computable approximations      | convergence          | stability under refinement   | within an error bound  |
| `+S social`      | citation, norm, program, folklore         | held by a community  | community acceptance         | same convention        |
| `+E ecological`  | constraint, resource, affordance, tool    | obtains in the world | survives real constraints    | same constraint        |

`social` is the collective dual of `inspiration`; `ecological` is the collective dual of `numeric`. Use `dual_of`
edges only when the notes actually pair them (e.g. an internal error bound and the machine budget that motivated it).

The layer of a node is **where the notes treat it**, not where it could in principle live. "I suspect the wheel
removes most composites" is `fuzzy` even though it is about a symbolic object.

## Procedure

1. **Segment.** Split each document by heading and by claim. One assertion = one candidate node. Do not merge two
   independent claims into one node.
2. **Classify.** Assign a `kind` (see table). The kind fixes the layer via `NODE_KIND_LAYER`. Set `layer` explicitly
   only to override, and then always write `layer_rationale`. If a statement is asserted without justification and
   used to justify other statements, it is an `axiom` or `definition`, not a `theorem`.
3. **Normalize.** Rewrite each statement as one self-contained declarative sentence in the present tense. Resolve
   pronouns and "this"/"the above". Keep inline LaTeX intact; put the symbolic form in `formal` when present.
4. **Represent.** Fill `representation` with the object-layer triple: `layer`, a `form`
   (`"term-graph"`, `"rewrite-rule"`, `"proof-term"`, `"digit-stream"`, `"interval"`, `"benchmark-row"`,
   `"prose-sketch"`, `"table"`, …) and the verbatim `content` where the notes give one. Add an `interfaces` entry for
   every cross-ontology projection the notes offer *or visibly want*; set `available: false` for the wanted-but-absent
   ones and `lossy: true` where information is discarded.
5. **Deduplicate across documents.** The same claim restated in another file is _one_ node with multiple entries in
   `sources` and any variant phrasings in `aliases`. Prefer the most precise phrasing as `statement`. A hunch and its
   later formalization are **two** nodes in **two** layers joined by `formalizes` — never one node.
6. **Relate.** Emit an edge for every dependency the text asserts or clearly implies. Prefer explicit textual
   evidence; put the trigger phrase in the edge's `sources[].quote`.
7. **Transport.** Whenever the notes carry the *same object* from one ontology into another, emit a `Morphism` in
   `morphisms` (not just an edge). Record `state` (`performed` / `intended` / `failed`), `loss` and `cost` where the
   notes say. The descent pattern — fuzzy pattern → rewrite rule → justification → algorithm — is three morphisms and
   four nodes, and it deserves a `descent_chain` cluster.
8. **Cohere.** Where two layers describe the same object, emit a `CoherenceObligation`: `semantic` (numeric respects
   symbolic identities), `logical` (rewrites preserve provable truths), `analytic` (proofs guarantee the convergence
   they claim). Set `status: "violated"` when a benchmark contradicts an identity, `"pending"` when the notes never
   check, and record the `cost` when they complain about the checking.
9. **Attribute.** Move every measured or stipulated quantity out of the prose and into `attributes`
   (`{key, value, unit}`): complexity bounds, wheel modulus, bit sizes, densities, error probabilities, runtimes,
   sample sizes. Tag the attribute's `layer` when it is not the node's own (a `big-O` on a `model` is `numeric`).
10. **Contextualize.** Citations, "the standard trick is…", "nobody bothers with…" go into `social` (or their own
    `reference` / `norm` / `folklore` nodes). Machine, RAM, cache line, wall-clock budget, "this has to fit in L2",
    "only worth it if it beats gmp" go into `ecological` (or `constraint` / `resource` nodes). Corpus-wide context
    that appears once goes in the root `context` object.
11. **Shape.** For `inspiration` and `fuzzy` nodes, fill `shape.descriptor` with the hunch in its own vocabulary, and
    add `similar_to` links (with `score` and `basis: "shape"`) between hunches the notes treat as "the same idea
    again". Do not invent embeddings.
12. **Provenance.** Every node, every edge with textual support, every morphism and every obligation needs at least
    one `SourceRef` with a short verbatim `quote` (≤ 200 chars).
13. **Validate.** Every `from`/`to` must resolve to a node `id`. Ids are unique. Morphism endpoints must satisfy
    `MORPHISM_SIGNATURE`; layer-aware relations must satisfy `RELATION_LAYER_RULES`.
    `depends_on` / `implies` / `formalizes` chains must be acyclic; if the notes are genuinely circular, keep the
    edges and record the cycle in `unresolved`.

## Kind selection

### −2 Inspiration — directional inference about what to investigate

| Signal in the text                                                           | `kind`                  |
| ---------------------------------------------------------------------------- | ----------------------- |
| "the next thing to try is…", "the whole point of this line of work"          | `trajectory`            |
| "this is basically a …", "resembles", "same shape as X in another domain"    | `analogy`               |
| a systematic dictionary between two settings (sieving ↔ hashing, say)        | `domain_mapping`        |
| "something should be preserved here", "there ought to be an invariant"       | `invariance_hypothesis` |
| "we don't know anything about the region above…", explicit known/unknown map | `knowledge_gap`         |

### 0 Fuzzy — pre-formal, pre-truth-apt

| Signal in the text                                                          | `kind`          |
| ----------------------------------------------------------------------------| --------------- |
| an unformalized recurring shape ("gaps cluster after a big prime")          | `proto_pattern` |
| a half-formed operation, no rule yet ("skip forward by something like …")   | `proto_operator`|
| a partial derivation, arrow diagram, or "roughly, the argument is"          | `sketch`        |
| "think of it as a …"                                                        | `metaphor`      |
| "conjecture", "I suspect", "probably", "it seems that", "if this holds"     | `conjecture`    |
| Unjustified rule of thumb, approximation, "good enough in practice"         | `heuristic`     |
| "why does…", "unclear whether…", TODO                                       | `open_question` |

### 1 Symbolic — form

| Signal in the text                                                    | `kind`         |
| ----------------------------------------------------------------------| -------------- |
| "let X be", "we call"                                                 | `definition`   |
| pure notation introduction with no content                            | `notation`     |
| an oriented identity / transformation actually applied to terms       | `rewrite_rule` |
| the arity/type/signature of a construction                            | `signature`    |
| a concrete generator, algorithm or parameterised construction         | `model`        |

### 2 Deductive — truth

| Signal in the text                                                                        | `kind`    |
| ----------------------------------------------------------------------------------------- | --------- |
| "assume", "we take as given", "by construction", stated without proof and used downstream | `axiom`   |
| Proved in the notes, or cited as a known result                                           | `theorem` |
| Proved and used only as a step                                                            | `lemma`   |
| The derivation itself, written out                                                        | `proof`   |
| A named framework / explanatory account tying several claims together                     | `theory`  |

### 3 Numeric — stability

| Signal in the text                            | `kind`        |
| ----------------------------------------------| ------------- |
| Measurement, benchmark row, plot description  | `observation` |
| A described run/setup producing observations  | `experiment`  |
| An error, tail or complexity bound            | `bound`       |
| A computation offered as證 evidence of a claim | `certificate` |

### +S Social / +E Ecological

| Signal in the text                                                       | `kind`             |
| -------------------------------------------------------------------------| ------------------ |
| External reference, paper, library, "as in Knuth"                        | `reference`        |
| "we only accept…", methodological convention, acceptance criterion       | `norm`             |
| A stated agenda, roadmap or open-problem list                            | `research_program` |
| "everyone knows", unattributed shared belief                             | `folklore`         |
| RAM/cache/time/cost limit, "must fit in L2", "no more than 5 min"        | `constraint`       |
| Machine, dataset, library, tool actually used                            | `resource`         |
| Code, dataset, table, figure referenced by the notes                     | `artifact`         |

Hedged language always wins over confident framing: a "theorem" the notes admit is unproved is a `conjecture` with
`status: "proposed"`. Pre-truth-apt layers (`inspiration`, `fuzzy`) never take `status: "accepted"` or `"refuted"`;
use `pre_formal`, `stabilized`, `proposed`, `supported`, `superseded` or `abandoned`.

## Relation selection

Epistemic:

- `assumes` — node relies on an axiom/definition.
- `depends_on` — general logical or constructional prerequisite.
- `implies` — A entails B as stated in the notes.
- `generalizes` / `specializes` — strictly weaker / stronger versions.
- `equivalent_to` — the notes claim mutual implication.
- `supports` / `refutes` — evidence (usually `observation` → `conjecture`).
- `contradicts` — two claims cannot both hold.
- `motivates` — an open question or observation prompting a theory/model.
- `tests` / `measures` — experiment → claim, experiment → attribute-bearing node.
- `refines` — later version supersedes an earlier one (note the doc order).
- `instantiates` — model is a concrete case of a theory.
- `cites` — external reference.

Layer-aware (these carry a direction discipline the validator enforces):

- `formalizes` — descends the cognitive axis: hunch → rewrite rule, conjecture → theorem, intuition → experiment.
- `abstracts` — ascends it: a failed proof or a surprising benchmark that generates a new fuzzy question.
- `analogous_to` — structural resemblance used as an inference (`inspiration`/`fuzzy` sources only).
- `steers` — an `inspiration` node directing what gets worked on.
- `selects_for` — a `social` node determining what is pursued, named or believed.
- `constrains` — an `ecological` node determining what is feasible.
- `stabilizes` — repeated use turning a proto-object into a fixture of the notes.
- `dual_of` — links a cognitive node to its contextual dual (inspiration↔social, numeric↔ecological only).

Do not invent transitive edges: if A→B and B→C are stated, do not add A→C.

## Morphism selection

Emit a `Morphism` when the *same object* is carried across ontologies. Signatures are enforced.

| Morphism              | From → To            | Trigger in the notes                                     |
| --------------------- | -------------------- | -------------------------------------------------------- |
| `extract`             | deductive → symbolic | reading a formula off a proof                            |
| `embed`               | symbolic → deductive | adopting an identity as an axiom/lemma "for now"         |
| `evaluate`            | symbolic → numeric   | plugging numbers in, timing the formula, tabulating it   |
| `fit`                 | numeric → symbolic   | guessing a closed form from a table or plot              |
| `bound`               | deductive → numeric  | turning a proof into a computable bound                  |
| `certify`             | numeric → deductive  | a computation used as a proof (exhaustive check, interval) |
| `formalize_symbolic`  | fuzzy → symbolic     | a pattern written down as a rule                         |
| `formalize_deductive` | fuzzy → deductive    | a conjecture turned into a theorem/proof attempt         |
| `formalize_numeric`   | fuzzy → numeric      | an intuition turned into an experiment                   |
| `abstract`            | formal → fuzzy/insp. | a result that "makes me wonder whether…"                 |
| `analogy_*`           | inspiration          | extending, inverting or fusing a resemblance             |
| `trajectory_*`        | inspiration          | refining, branching or abandoning a direction            |
| `domain_mapping`      | inspiration          | building the dictionary between two settings             |
| `gap_identification`  | insp./fuzzy → insp.  | naming what is missing                                   |
| `invariance_projection` | inspiration → any  | pushing "something is preserved" into a concrete layer   |
| `social_selection`    | social → any         | a convention deciding which version is kept              |
| `ecological_constraint` | ecological → any   | a hardware/time limit deciding which version is kept     |

A morphism the notes *want* but never perform is still recorded, with `state: "intended"`. A morphism that was tried
and failed is `state: "failed"` — it is usually the most informative thing on the page.

## Coherence obligations

| Kind       | Between            | Requirement                                               |
| ---------- | ------------------ | --------------------------------------------------------- |
| `semantic` | numeric ↔ symbolic | numeric evaluation must respect symbolic identities       |
| `logical`  | symbolic ↔ deductive | symbolic rewrites must preserve provable truths         |
| `analytic` | deductive ↔ numeric | proofs must guarantee the convergence they claim         |

Record the `cost` of maintaining each one whenever the notes mention it (extra runtime, extra proof burden, "I stopped
checking after 10^7"). Never assume coherence away; an unchecked obligation is `status: "pending"`, not absent.

## Ids and confidence

- `id` = `<kind>.<kebab-slug-of-name>`, e.g. `conjecture.gap-density-decay`,
  `model.wheel-210-sieve`, `proto_pattern.wheel-skips-composites`, `constraint.l2-cache-budget`. Stable across runs;
  never reuse an id for a different claim.
- edge id = `e.<from-slug>.<relation>.<to-slug>`; morphism id = `m.<from-slug>.<kind>.<to-slug>`;
  obligation id = `c.<kind>.<slug>`.
- `confidence` is _your extraction confidence_ (0–1): how sure you are the document says this. It is not the truth of
  the claim — that goes in `status` and in `strength` on supporting edges.
- Anything you had to infer rather than read gets `confidence ≤ 0.5` and a `notes` field explaining the inference.
  Layer assignments you had to guess get `confidence ≤ 0.5` **and** an `unresolved` entry of kind `layer_ambiguity`.

## Hard rules

- Never introduce mathematics that is not in the notes.
- Never drop a claim because it looks wrong; record it and let `refutes` edges do the work.
- Never promote a hunch into a formal node. If the notes only gesture, it stays `fuzzy` with `status: "pre_formal"`.
- Never invent social or ecological context. No imagined citations, no assumed hardware. If the machine is not named,
  there is no `resource` node.
- Never silently collapse layers: a benchmark and the identity it checks are two nodes plus a `semantic` obligation.
- Unparseable references, dangling "see above", missing definitions, and layers you could not decide go in
  `unresolved`, not into invented nodes.

## Shape reminder

```json
{
  "version": "2.0.0",
  "corpus": {
    "documents": [
      {
        "id": "sieve-notes",
        "path": "sieve-notes.md",
        "order": 1,
        "dominant_layers": ["symbolic", "numeric"]
      }
    ]
  },
  "context": {
    "ecological": { "substrate": "x86-64 laptop", "constraints": ["sieve must fit in L2"] }
  },
  "nodes": [
    {
      "id": "proto_pattern.wheel-skips-composites",
      "kind": "proto_pattern",
      "name": "Small-Prime Multiples Are Never Worth Visiting",
      "statement": "Candidates divisible by a small prime can be skipped before any test is run.",
      "status": "pre_formal",
      "confidence": 0.8,
      "shape": { "descriptor": "pre-filter by cheap divisibility before the expensive test" },
      "representation": {
        "layer": "fuzzy",
        "form": "prose-sketch",
        "interfaces": [{ "to": "symbolic", "via": "formalize_symbolic", "available": true, "target": "axiom.candidates-coprime-to-wheel" }]
      },
      "sources": [{ "file": "sieve-notes.md", "heading": "Wheel", "quote": "no point even looking at multiples of 2,3,5,7" }]
    },
    {
      "id": "axiom.candidates-coprime-to-wheel",
      "kind": "axiom",
      "name": "Candidates Are Coprime to the Wheel Modulus",
      "statement": "Every candidate emitted by the generator is coprime to 2·3·5·7.",
      "status": "accepted",
      "confidence": 0.9,
      "representation": { "layer": "deductive", "form": "proposition", "content": "\\gcd(n, 210) = 1" },
      "attributes": [{ "key": "wheel_modulus", "value": 210 }],
      "sources": [{ "file": "sieve-notes.md", "heading": "Wheel", "quote": "we only ever emit residues coprime to 210" }]
    },
    {
      "id": "constraint.l2-cache-budget",
      "kind": "constraint",
      "name": "Segment Must Fit in L2",
      "statement": "The sieve segment is sized so that the bitset stays inside the 1 MiB L2 cache.",
      "status": "accepted",
      "confidence": 0.7,
      "attributes": [{ "key": "l2_size", "value": 1, "unit": "MiB" }],
      "sources": [{ "file": "sieve-notes.md", "heading": "Segmenting", "quote": "keep the segment under L2 or it falls off a cliff" }]
    }
  ],
  "edges": [
    {
      "id": "e.proto_pattern.wheel-skips-composites.formalizes.axiom.candidates-coprime-to-wheel",
      "from": "proto_pattern.wheel-skips-composites",
      "to": "axiom.candidates-coprime-to-wheel",
      "relation": "formalizes",
      "confidence": 0.8
    },
    {
      "id": "e.constraint.l2-cache-budget.constrains.model.wheel-210-sieve",
      "from": "constraint.l2-cache-budget",
      "to": "model.wheel-210-sieve",
      "relation": "constrains",
      "confidence": 0.7
    }
  ],
  "morphisms": [
    {
      "id": "m.proto_pattern.wheel-skips-composites.formalize_deductive.axiom.candidates-coprime-to-wheel",
      "kind": "formalize_deductive",
      "from": "proto_pattern.wheel-skips-composites",
      "to": "axiom.candidates-coprime-to-wheel",
      "state": "performed",
      "loss": "drops the informal 'cheap before expensive' motivation",
      "confidence": 0.75,
      "sources": [{ "file": "sieve-notes.md", "quote": "so: assume gcd(n,210)=1 from here on" }]
    }
  ],
  "coherence": [
    {
      "id": "c.semantic.wheel-density-vs-benchmark",
      "kind": "semantic",
      "refs": ["axiom.candidates-coprime-to-wheel", "observation.candidate-rate"],
      "requirement": "The measured candidate rate must match the 48/210 density implied by the wheel.",
      "status": "pending",
      "cost": { "measure": "developer-effort", "note": "never checked in the notes" }
    }
  ],
  "clusters": [
    {
      "id": "cluster.wheel-descent",
      "name": "Wheel: Hunch to Benchmark",
      "kind": "descent_chain",
      "root": "proto_pattern.wheel-skips-composites",
      "members": ["proto_pattern.wheel-skips-composites", "axiom.candidates-coprime-to-wheel", "constraint.l2-cache-budget"],
      "layers": ["fuzzy", "deductive", "ecological"]
    }
  ],
  "unresolved": [
    {
      "kind": "layer_ambiguity",
      "description": "\"the 210-trick\" is used both as a hunch and as a concrete rule; split into two nodes on the surrounding wording.",
      "refs": ["proto_pattern.wheel-skips-composites"],
      "layers": ["fuzzy", "symbolic"]
    }
  ]
}
```