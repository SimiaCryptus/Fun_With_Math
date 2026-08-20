---
transforms: ../([^/]*).md -> theory_graph.json
related:
  - theory_graph.schema.ts
---

# Extract a theory graph from the primegen notes

Identify the axioms, theories, conjectures with relations and attributes.

## Inputs

Every markdown document in `experiments/primegen/` (the parent directory) that matches `../([^/]*).md`. The capture
group is the **document id** (`$1`); use it verbatim in `SourceRef.file` as `<$1>.md` and in `corpus.documents[].id`.

These are working notes: informal prose, derivations, benchmark tables, TODOs and half-finished ideas about prime
generation (sieves, wheels, residue classes, gap statistics, primality tests, RNG-driven candidate search).

## Output

A single JSON object conforming to `TheoryGraph` in
`theory_graph.schema.ts`. Emit **only** the JSON — no prose, no code fences.

## Procedure

1. **Segment.** Split each document by heading and by claim. One assertion = one candidate node. Do not merge two
   independent claims into one node.
2. **Classify.** Assign a `kind` (see table). If a statement is asserted without justification and used to justify other
   statements, it is an
   `axiom` or `definition`, not a `theorem`.
3. **Normalize.** Rewrite each statement as one self-contained declarative sentence in the present tense. Resolve
   pronouns and "this"/"the above". Keep inline LaTeX intact; put the symbolic form in `formal` when present.
4. **Deduplicate across documents.** The same claim restated in another file is *one* node with multiple entries in
   `sources` and any variant phrasings in `aliases`. Prefer the most precise phrasing as `statement`.
5. **Relate.** Emit an edge for every dependency the text asserts or clearly implies. Prefer explicit textual evidence;
   put the trigger phrase in the edge's `sources[].quote`.
6. **Attribute.** Move every measured or stipulated quantity out of the prose and into `attributes`
   (`{key, value, unit}`): complexity bounds, wheel modulus, bit sizes, densities, error probabilities, runtimes, sample
   sizes.
7. **Provenance.** Every node and every edge with textual support needs at least one `SourceRef` with a short verbatim
   `quote` (≤ 200 chars).
8. **Validate.** Every `from`/`to` must resolve to a node `id`. Ids are unique.
   `depends_on` / `implies` chains must be acyclic; if the notes are genuinely circular, keep the edges and record the
   cycle in `unresolved`.

## Kind selection

| Signal in the text                                                                        | `kind`          |
|-------------------------------------------------------------------------------------------|-----------------|
| "assume", "we take as given", "by construction", stated without proof and used downstream | `axiom`         |
| "let X be", "we call", notation introduction                                              | `definition`    |
| A named framework / explanatory account tying several claims together                     | `theory`        |
| A concrete generator, algorithm or parameterised construction                             | `model`         |
| "conjecture", "I suspect", "probably", "it seems that", "if this holds"                   | `conjecture`    |
| Proved in the notes, or cited as a known result                                           | `theorem`       |
| Proved and used only as a step                                                            | `lemma`         |
| Unjustified rule of thumb, approximation, "good enough in practice"                       | `heuristic`     |
| Measurement, benchmark row, plot description                                              | `observation`   |
| A described run/setup producing observations                                              | `experiment`    |
| Code, dataset, table, figure referenced by the notes                                      | `artifact`      |
| "why does…", "unclear whether…", TODO                                                     | `open_question` |

Hedged language always wins over confident framing: a "theorem" the notes admit is unproved is a `conjecture` with
`status: "proposed"`.

## Relation selection

- `assumes` — node relies on an axiom/definition.
- `depends_on` — general logical or构 constructional prerequisite.
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

Do not invent transitive edges: if A→B and B→C are stated, do not add A→C.

## Ids and confidence

- `id` = `<kind>.<kebab-slug-of-name>`, e.g. `conjecture.gap-density-decay`,
  `model.wheel-210-sieve`. Stable across runs; never reuse an id for a different claim.
- `confidence` is *your extraction confidence* (0–1): how sure you are the document says this. It is not the truth of
  the claim — that goes in
  `status` and in `strength` on supporting edges.
- Anything you had to infer rather than read gets `confidence ≤ 0.5` and a
  `notes` field explaining the inference.

## Hard rules

- Never introduce mathematics that is not in the notes.
- Never drop a claim because it looks wrong; record it and let `refutes`
  edges do the work.
- Unparseable references, dangling "see above", and missing definitions go in
  `unresolved`, not into invented nodes.

## Shape reminder

```json
{
  "version": "1.0.0",
  "corpus": {
    "documents": [
      {
        "id": "sieve-notes",
        "path": "../sieve-notes.md"
      }
    ]
  },
  "nodes": [
    {
      "id": "axiom.candidates-coprime-to-wheel",
      "kind": "axiom",
      "name": "Candidates are coprime to the wheel modulus",
      "statement": "Every candidate emitted by the generator is coprime to 2·3·5·7.",
      "status": "accepted",
      "confidence": 0.9,
      "attributes": [
        {
          "key": "wheel_modulus",
          "value": 210
        }
      ],
      "sources": [
        {
          "file": "sieve-notes.md",
          "heading": "Wheel",
          "quote": "we only ever emit residues coprime to 210"
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "e.wheel-210-sieve.assumes.candidates-coprime",
      "from": "model.wheel-210-sieve",
      "to": "axiom.candidates-coprime-to-wheel",
      "relation": "assumes",
      "confidence": 0.9
    }
  ]
}
```