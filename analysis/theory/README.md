# Theory Graph

A metaontology of mathematical practice — and a zero-dependency viewer for the graphs it produces.

Working notes (markdown) are read by an extraction op (`parse.op.md`) and turned into a `*.theory_graph.json` document
conforming to
`theory_graph.schema.ts`. The viewer in this directory (`index.html`, `app.js`,
`graph.js`, `schema.js`, `styles.css`) renders that document as a layered graph with an inspector, filters, tables and a
validator.

```
notes/*.md ──▶ analyze.op.md ──▶ *.theory_graph.json ──▶ viewer (index.html)
               (LLM extraction)   (theory_graph.schema.ts)
```

---

## Why

Mathematics is not one ontology. `idea.md` argues that mathematical work runs across several regimes that disagree about
what an object _is_, what _equality_
means, and what counts as _evidence_:

| Layer            | An object is…                            | Existence            | Truth                      | Equality              |
| ---------------- | ---------------------------------------- | -------------------- | -------------------------- | --------------------- |
| `-2 inspiration` | a direction in the space of theories     | expressible          | n/a                        | same trajectory       |
| `0 fuzzy`        | a hunch, pattern, sketch, proto-operator | expressible at all   | n/a (pre-truth-apt)        | similarity of shape   |
| `1 symbolic`     | a term in a rewrite system               | well-formedness      | reaches a normal form      | convertibility        |
| `2 deductive`    | a node in a derivation graph             | derivability         | closure under inference    | provable equivalence  |
| `3 numeric`      | a limit of computable approximations     | convergence          | stability under refinement | within an error bound |
| `+S social`      | a citation, norm, program, folklore      | held by a community  | community acceptance       | same convention       |
| `+E ecological`  | a constraint, resource, affordance       | obtains in the world | survives real constraints  | same constraint       |

The five cognitive layers form a vertical axis; `social` and `ecological` are orthogonal contextual axes that modulate
all five. `social` is the collective dual of `inspiration`; `ecological` is the collective dual of `numeric`.

Three pieces of connective structure span the cognitive layers:

- **Object layer** — every node carries an ontology tag, a `representation`
  and cross-ontology `interfaces`.
- **Morphism layer** — named, first-class transports between ontologies (`extract`, `embed`, `evaluate`, `fit`, `bound`,
  `certify`, the
  `formalize_*` projections, `abstract`, the inspiration-layer analogy and trajectory morphisms, and the contextual
  `social_selection` /
  `ecological_constraint`).
- **Coherence layer** — explicit, _costed_ obligations: `semantic` (numeric evaluation respects symbolic identities),
  `logical` (rewrites preserve provable truths), `analytic` (proofs guarantee the convergence they claim).

---

## Files

| File                        | Role                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `idea.md`                   | The paper: the consolidated schema and the duality that closes it.                                                                           |
| `theory_graph.schema.ts`    | Canonical types + constants + `validateTheoryGraph`, `findCycles`, `findMissingMorphisms`, `computeStats`. Dependency-free.                  |
| `parse.op.md`               | The extraction op: how to turn markdown notes into a `TheoryGraph`. Contains the kind/relation/morphism selection tables and the hard rules. |
| `schema.js`                 | Runtime ES6 mirror of the schema constants and validators, used by the viewer. Also `normalizeGraph()`.                                      |
| `graph.js`                  | `GraphView`: SVG lane renderer, barycentric layout, pan/zoom/drag, highlight.                                                                |
| `app.js`                    | Wiring: loading, `?src=` routing, filters, inspector, tables, diagnostics, export.                                                           |
| `index.html` / `styles.css` | Shell and theme. Sample buttons live in `index.html`.                                                                                        |
| `UI.md`                     | Viewer-specific notes (shapes, colours, shortcuts).                                                                                          |

---

## Run

ES modules cannot be imported over `file://`, so serve the directory:

```sh
python3 -m http.server 8000
# then open
# http://localhost:8000/?src=../generator.theory_graph.json
```

Three ways to load a graph:

- **`?src=…`** — fetched on start, and kept in sync in the address bar so any view is linkable and browser back/forward
  moves between visited graphs.
- **Open file… / drag & drop** — anything dropped on the page is parsed. Local files clear `?src` (there is nothing to
  link to).
- **Fetch box** — paste a relative or absolute path.

Quick-access samples are declared in `index.html` and wired automatically by
`app.js`:

```html
<span class="samples" id="samples">
  <button class="btn" data-src="../generator.theory_graph.json">generator</button>
</span>
```

---

## What the viewer shows

- **Lanes** — one column per layer in schema order:
  `social | inspiration | fuzzy | symbolic | deductive | numeric | ecological`. Vertical position is a barycentric
  ordering over the edge + morphism adjacency, so descent chains (hunch → rule → proof → benchmark) read across.
- **Shapes** — triangle = inspiration, circle = fuzzy, rounded square = symbolic, square = deductive, diamond = numeric,
  hexagon = contextual. Size scales with `confidence`;
  dashed outline = `proposed` / `pre_formal` / `unknown`;
  faded = `refuted` / `abandoned` / `superseded`.
- **Links** — grey logical/structural, amber evidential, red conflict, violet cross-layer (`formalizes` / `abstracts`),
  teal contextual (`steers` / `selects_for` / `constrains`), dashed cyan morphisms,
  dotted pink coherence obligations chained across their `refs`.
- **Inspector** — statement, `formal`, representation and its interfaces, attributes, shape/similarity, social and
  ecological context, incident edges / morphisms / obligations, and every `SourceRef` with its quote.
- **Tables** — Nodes, Edges, Morphisms, Coherence, Clusters, Issues, Diagnostics, Stats.
- **Diagnostics** — a JS port of `validateTheoryGraph`, `findCycles` (over
  `ACYCLIC_RELATIONS`) and the advisory `findMissingMorphisms`, including layer discipline (“`formalizes` must descend
  the cognitive axis”, “pre-truth-apt node carries a truth-apt status”, morphism signature violations).
- **Export** — downloads the visible subgraph as a valid theory graph with recomputed `stats`.

### Shortcuts

| key          | action                            |
| ------------ | --------------------------------- |
| `f`          | fit to view                       |
| `/`          | focus search                      |
| `Esc`        | clear selection                   |
| wheel / drag | zoom / pan; drag a node to pin it |

---

## Producing a graph

Run `parse.op.md` over a directory of markdown notes. The transform header

```
transforms: (.*).md -> $1.theory_graph.json
```

makes the capture group the **document id**, used verbatim in
`SourceRef.file` and `corpus.documents[].id`.

The op's procedure, in brief:

1. **Segment** by heading and claim — one assertion, one node.
2. **Classify** into a `kind`; the kind fixes the layer via `NODE_KIND_LAYER`. Override `layer` only with a
   `layer_rationale`.
3. **Normalize** each statement to one self-contained declarative sentence.
4. **Represent** — fill `representation` with layer, `form`, verbatim
   `content`, and an `interfaces` entry for every projection the notes offer _or visibly want_ (`available: false` for
   the wanted-but-absent ones).
5. **Deduplicate** across documents; a hunch and its formalization are **two**
   nodes in **two** layers joined by `formalizes`.
6. **Relate** with evidence — put the trigger phrase in `sources[].quote`.
7. **Transport** — same object across ontologies ⇒ a `Morphism`, with `state`
   (`performed` / `intended` / `failed`), `loss` and `cost`.
8. **Cohere** — two layers describing one object ⇒ a `CoherenceObligation`; unchecked is `pending`, never absent.
9. **Attribute** — every measured quantity leaves the prose for `attributes`.
10. **Contextualize** — citations and norms to `social`; machines, budgets and cache limits to `ecological`.
11. **Shape** — `shape.descriptor` and `similar_to` for inspiration/fuzzy.
12. **Provenance** — every node, supported edge, morphism and obligation gets at least one `SourceRef` with a ≤200-char
    verbatim quote.
13. **Validate** — ids unique, endpoints resolve, `MORPHISM_SIGNATURE` and
    `RELATION_LAYER_RULES` satisfied, acyclic chains; genuine cycles go into
    `unresolved`.

### Ids

```
node        <kind>.<kebab-slug>            conjecture.gap-density-decay
edge        e.<from-slug>.<relation>.<to-slug>
morphism    m.<from-slug>.<kind>.<to-slug>
obligation  c.<kind>.<slug>
```

`confidence` is _extraction_ confidence (how sure you are the document says this), not the truth of the claim — truth
lives in `status` and in `strength`
on supporting edges.

### Hard rules

- Never introduce mathematics that is not in the notes.
- Never drop a claim because it looks wrong; let `refutes` edges do the work.
- Never promote a hunch: gestures stay `fuzzy` with `status: "pre_formal"`.
- Never invent social or ecological context — no imagined citations, no assumed hardware.
- Never silently collapse layers: a benchmark and the identity it checks are two nodes plus a `semantic` obligation.
- Anything unresolvable goes into `unresolved`, not into invented nodes.

---

## Minimal graph

```json
{
  "version": "2.0.0",
  "corpus": {
    "documents": [
      {
        "id": "sieve-notes",
        "path": "sieve-notes.md",
        "order": 1
      }
    ]
  },
  "nodes": [
    {
      "id": "proto_pattern.wheel-skips-composites",
      "kind": "proto_pattern",
      "name": "Small-Prime Multiples Are Never Worth Visiting",
      "statement": "Candidates divisible by a small prime can be skipped before any test is run.",
      "status": "pre_formal",
      "confidence": 0.8,
      "representation": {
        "layer": "fuzzy",
        "form": "prose-sketch",
        "interfaces": [
          {
            "to": "deductive",
            "via": "formalize_deductive",
            "available": true,
            "target": "axiom.candidates-coprime-to-wheel"
          }
        ]
      },
      "sources": [
        {
          "file": "sieve-notes.md",
          "quote": "no point even looking at multiples of 2,3,5,7"
        }
      ]
    },
    {
      "id": "axiom.candidates-coprime-to-wheel",
      "kind": "axiom",
      "name": "Candidates Are Coprime to the Wheel Modulus",
      "statement": "Every candidate emitted by the generator is coprime to 2·3·5·7.",
      "status": "accepted",
      "confidence": 0.9,
      "representation": {
        "layer": "deductive",
        "form": "proposition",
        "content": "\\gcd(n, 210) = 1"
      },
      "attributes": [
        {
          "key": "wheel_modulus",
          "value": 210
        }
      ],
      "sources": [
        {
          "file": "sieve-notes.md",
          "quote": "we only ever emit residues coprime to 210"
        }
      ]
    }
  ],
  "edges": [
    {
      "id": "e.proto_pattern.wheel-skips-composites.formalizes.axiom.candidates-coprime-to-wheel",
      "from": "proto_pattern.wheel-skips-composites",
      "to": "axiom.candidates-coprime-to-wheel",
      "relation": "formalizes",
      "confidence": 0.8
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
      "sources": [
        {
          "file": "sieve-notes.md",
          "quote": "so: assume gcd(n,210)=1 from here on"
        }
      ]
    }
  ]
}
```

---

## Notes and known quirks

- Some older graphs park edges and morphisms inside `nodes[]`.
  `normalizeGraph()` detects objects carrying `from`/`to`, moves them into
  `edges[]` / `morphisms[]`, and reports what it moved in **Diagnostics**.
- `validateTheoryGraph` in `schema.js` is a faithful port of the TypeScript original; keep the two in sync when the
  schema changes.
- The viewer has no build step and no dependencies — plain ES modules, plain SVG, plain CSS.

## Roadmap

- Type disciplines per layer (inspiration and fuzzy objects especially).
- An exhaustive morphism catalogue with operational semantics.
- An explicit geometry over inspiration/fuzzy space, so hunches can be clustered, retrieved and extended.
- A unified workspace engine: edit and author across all five cognitive layers, not just read them.
