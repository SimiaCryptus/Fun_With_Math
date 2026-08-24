---
transforms: (.*).md -> $1.knowledge_graph.json
related:
  - knowledge_graph.schema.ts
  - ../theory/theory_graph.schema.ts
  - ../theory/parse.op.md
---

# Map the vocabulary a set of notes is written in

Identify every term, notation, named object, method, tool and prior work the notes _use as though it meant
something_ — with their relations, senses, mentions, definition status and the ranked queue of definitions the notes
never supply.

## Inputs

Every markdown document that matches `([^/]*).md`. The capture group is the **document id** (`$1`); use it verbatim in
`SourceRef.file` as `<$1>.md` and in `corpus.documents[].id`.

These are working notes: informal prose, derivations, benchmark tables, TODOs and half-finished ideas. They lean
constantly on vocabulary they never define, because the author already knows what it means. That vocabulary is the
subject of this op.

## Output

A single JSON object conforming to `KnowledgeGraph` in `knowledge_graph.schema.ts`. Emit **only** the JSON — no prose,
no code fences.

## The organising commitment: relations before definitions

**Record how terms relate before, and often instead of, what they mean.**

An entry is created the moment a term is used as if it were load-bearing. Its _definition_ is a separate, later,
optional act.

- `definition_status` is **required**. `gloss` is **optional by design**.
- A gloss may only be written from the corpus's own words. If you quote, set `verbatim: true`. If you paraphrase, set
  `provisional: true`. If the corpus says nothing, write no gloss at all.
- An entry with status `assumed_known` and forty mentions is a **more valuable** output than an entry with a confident
  invented paraphrase.

The deliverable is not a glossary. It is a map of the discussion's vocabulary, plus a work queue of the definitions
that map is missing.

## Relationship to the theory graph

|              | theory graph                               | knowledge graph                         |
| ------------ | ------------------------------------------ | --------------------------------------- |
| unit         | a claim                                    | a term                                  |
| truth        | central (`status`, `confidence`, evidence) | absent — entries are not truth-apt      |
| completeness | every claim traceable to a source          | every load-bearing word has an entry    |
| failure mode | missing an argument                        | missing that a word was never explained |

The sentence _"the wheel of modulus 210 removes 77% of candidates before any primality test runs"_ is **one** theory
node and **four** entries (`wheel`, `modulus`, `candidate`, `primality test`), none of which it defines.

The bridge is one-directional and optional: an entry may `grounds` the theory-node ids whose statements are phrased in
it. Never invent a theory node id you have not been given.

## Entry kinds

### Language — the word or glyph itself, independent of what it denotes

| Signal in the text                                                       | `kind`         |
| ------------------------------------------------------------------------ | -------------- |
| a word or phrase used as if it meant something                           | `term`         |
| a symbol, glyph or syntactic convention (`\varphi`, `n \mid m`, `⟨·,·⟩`) | `notation`     |
| an acronym or short form ("MR", "CRT", "SoE")                            | `abbreviation` |

Notation entries exist precisely so that a symbol whose meaning is never stated is still visible on the map.

### Content — the things denoted

| Signal in the text                                                         | `kind`         |
| -------------------------------------------------------------------------- | -------------- |
| a structured idea with no single formal definition                         | `concept`      |
| a specific named object ("the zeta function", "the wheel-210 table")       | `object`       |
| a class of objects ("group", "ring", "wheel")                              | `structure`    |
| a predicate objects satisfy ("squarefree", "B-smooth")                     | `property`     |
| a named map or transformation ("sieving", "lifting", "reduction mod p")    | `operation`    |
| a named measurable ("density", "gap", "modulus", "throughput")             | `quantity`     |
| ms, bits, candidates/s                                                     | `unit`         |
| a result referred to **by name** ("Dirichlet's theorem", "Mertens' third") | `named_result` |
| a technique, algorithm or recipe, by name                                  | `method`       |
| a named problem or task                                                    | `problem`      |

`named_result` records the _name to be looked up_. The theorem **as a claim** belongs in the theory graph; do not
restate its content here.

### Context — the surrounding apparatus

| Signal in the text                                             | `kind`       |
| -------------------------------------------------------------- | ------------ |
| a subject area ("analytic number theory")                      | `field`      |
| software, language, library, machine ("gmp", "perf", "the M1") | `tool`       |
| file / data / interchange format, encoding                     | `format`     |
| a dataset actually used or referenced                          | `dataset`    |
| a named person                                                 | `person`     |
| a paper, book, page, thread, conversation                      | `work`       |
| a house rule, naming scheme, unit choice                       | `convention` |

## Definition status

The lattice the whole schema turns on. Assign exactly one per entry; senses may carry their own.

| status              | when                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| `defined_here`      | the corpus states a definition ("let a _wheel_ be the set of residues coprime to …")                   |
| `defined_elsewhere` | the corpus points at one (citation, link, "see Hardy & Wright §22")                                    |
| `assumed_known`     | used freely, never explained, and clearly expected to be understood                                    |
| `gestured`          | the shape of the meaning is indicated but not pinned ("a wheel skips multiples of the first k primes") |
| `ambiguous`         | several readings are live and the corpus never selects one                                             |
| `conflicting`       | the corpus defines it two incompatible ways                                                            |
| `undefined`         | used once or twice with no explanatory context at all                                                  |
| `unknown`           | you could not tell; set `confidence ≤ 0.5` and add an `unresolved` entry                               |

Only `defined_here` and `defined_elsewhere` are terminal. Everything else generates a `DefinitionRequest`.

`defined_here` requires a `gloss` or a `definition_ref`. `defined_elsewhere` requires a `definition_ref` with a
`citation`, `entry` or `node`.

## Senses and layer drift

Working notes reuse words. A `Sense` is a distinct reading of **one** entry, with its own optional gloss, its own
`layer`, and a `discriminator` saying what tells the readings apart in context.

- Recording two senses always beats silently picking one.
- A term with unresolved senses is `ambiguous`, **not** two entries the author would not recognise as separate.
- Sense ids are `<entry-id>#<kebab-slug>`.

The most systematic source of sense-splitting is the metaontology itself. _Equality_ is convertibility symbolically,
provable equivalence deductively, indistinguishability within a bound numerically. _Wheel_ may be a residue-class set
at the `symbolic` layer and a packed bitmask at the `ecological` one. Put the layers in `layers` and say how the
meaning shifts in `layer_drift`. Multi-layer entries **must** carry either `layer_drift` or `senses`.

## Procedure

1. **Sweep for names.** Read for nouns and glyphs, not for arguments. Anything the corpus treats as a name gets a
   candidate entry — including words you find obvious. Keep multiword phrases whole (`primality test`, not `primality`
   - `test`).
2. **Canonicalize.** One entry per thing. Surface variants (`wheel`, `wheels`, `wheel sieve` when used for the same
   thing) become `aliases`; symbols become `symbols`. A surface form may be claimed by exactly one entry — if two
   entries want it, that is an `alias_collision` / `notation_clash` and goes in `unresolved`.
3. **Classify.** Assign a `kind` from the three groups. When a word is used both as language and as content
   (`notation.phi` vs `quantity.totient`), make **two** entries joined by `notation_for`.
4. **Status.** Assign `definition_status` from the lattice. This is the required field; do it before thinking about
   meaning.
5. **Gloss, only if given.** Quote (`verbatim: true`) or paraphrase from the corpus's own words
   (`provisional: true`). Never both absent-and-invented. ≤ 240 chars, one sentence.
6. **Split senses.** Where the corpus reads the word two ways, emit `senses` with `discriminator` and `layer`, and set
   the entry to `ambiguous` unless it genuinely defines both.
7. **Record mentions.** Every occurrence, with a `SourceRef` (`file`, `heading`, optional `lines`, ≤ 200-char `quote`)
   and a `role`: `introduces`, `defines`, `uses`, `cites`, `contrasts`, `questions`, `renames`, `exemplifies`. Set
   `mention_count` to `mentions.length`. **Every entry needs at least one mention** — this is the rule that excludes
   phantom entries.
8. **Layer.** Fill `layers` with the metaontology layers the term is _actually used at_ in these notes, and
   `layer_drift` when it shifts.
9. **Relate.** Emit relations only where the surface text licenses them (see the taxonomy below), with the trigger
   phrase in `sources[].quote`. Anything weaker than that becomes `co_occurs_with` with a `strength`, never `is_a`.
10. **Score the role.** `central`, `supporting`, `background`, `incidental`, `introduced`, `questioned`, `rejected` —
    how much of the discussion leans on it.
11. **Bridge.** Fill `grounds` with theory-graph node ids only when you have been given that graph and the id is
    certain. Otherwise leave it empty; the advisory pass will flag the entry as `unbridged_entry`.
12. **Queue.** Derive `requests` (below). Do not author speculative ones.
13. **Cluster and validate.** Group into `topics` where the notes clearly organise their own vocabulary. Then: ids
    unique, endpoints resolve, `RELATION_ENDPOINT_RULES` satisfied, `ACYCLIC_RELATIONS` acyclic, every entry has a
    mention. Anything unresolvable goes in `unresolved`.

## Relation selection

Relations are grouped by what kind of evidence licenses them. Prefer the weakest relation the evidence supports.

**Lexical** — evidence: the surface form.

- `synonym_of`, `variant_of` — the corpus uses two forms interchangeably.
- `abbreviation_of` — "Miller–Rabin (MR)". Source must be the `abbreviation`/`notation` entry.
- `notation_for` — a glyph bound to a thing. Source must be the `notation`/`abbreviation` entry.
- `homonym_of` — one form, two unrelated things.
- `renames` — the notes deliberately rename something mid-corpus.

**Taxonomic** — evidence: explicit classificatory phrasing ("a wheel is a kind of …", "one of the …").

- `is_a`, `instance_of`, `part_of`, `has_part`, `generalizes`, `specializes`.

**Definitional** — evidence: the term appears inside another's explanation. These carry the dependency structure that
orders the follow-up queue.

- `defined_in_terms_of` — A's explanation uses B.
- `presupposes` — A is unintelligible without B.
- `prerequisite_of` — inverse of `presupposes`.
- `disambiguated_by` — B is what tells A's senses apart.

**Functional** — evidence: verb–argument structure.

- `operates_on`, `produces`, `parameterized_by`, `measured_by`, `implements`, `computes`, `applies_to`.

**Discourse** — evidence: adjacency and rhetorical framing. The weakest, most numerous, and most useful for clustering.

- `co_occurs_with` (always with a `strength` in [0,1]), `contrasts_with`, `alternative_to`, `analogous_to`,
  `example_of`, `counterexample_to`, `motivates`, `see_also`.

**Provenance** — evidence: names and citations.

- `attributed_to` (target must be a `person`), `introduced_in`, `documented_in`, `cites`.

Do not invent transitive edges. Do not emit both directions of a symmetric relation
(`synonym_of`, `homonym_of`, `variant_of`, `co_occurs_with`, `contrasts_with`, `alternative_to`, `analogous_to`,
`see_also`) — one edge is enough.

## Definition requests: the map as a queue

`requests` is the output that justifies the graph. It is **derived, not authored**.

- One request per entry whose `definition_status` needs follow-up (`assumed_known`, `gestured`, `ambiguous`,
  `conflicting`, `undefined`, `unknown`).
- `score = 0.5 · centrality + 0.5 · (mentions / maxMentions)`, where centrality is normalised weighted degree over all
  relations. `priority`: `high ≥ 0.66`, `medium ≥ 0.33`, else `low`.
- Skip entries with `score = 0` and fewer than two mentions — genuinely incidental.
- `wants`: `notation_key` for `notation`/`abbreviation`; `disambiguation` for `ambiguous`/`conflicting`;
  `formal_definition` for `gestured`; `citation` for context-group entries; else `gloss`.
- `blocked_by`: entries reachable by `defined_in_terms_of` / `presupposes` that are themselves undefined, so the queue
  can be answered top-down without forward references.
- `reason` is one sentence naming the status, the mention count, and the number of theory nodes grounded.
- `candidates` holds only citations the corpus itself offers.

## Ids and confidence

```
entry     <kind>.<kebab-slug>          term.wheel, notation.phi, named_result.mertens-third-theorem
sense     <entry-id>#<kebab-slug>      term.wheel#residue-class-set
edge      k.<from-slug>.<relation>.<to-slug>
request   q.<entry-slug>               q.wheel
```

Ids are stable across runs and never reused for a different thing. `confidence` is _your extraction confidence_ — how
sure you are the corpus uses this word this way. It says nothing about whether the usage is correct. Anything inferred
rather than read gets `confidence ≤ 0.5` and a `notes` field explaining the inference.

## Hard rules (anti-goals)

- **No phantom entries.** Never create an entry for something the corpus does not name. Plausible neighbours you happen
  to know about are the primary failure mode; the mention requirement exists to exclude them.
- **No invented meaning.** No gloss without corpus wording. No citation the notes do not give. No definition imported
  from your own knowledge — that is what `requests` is for.
- **No claims.** If you find yourself recording that something is _true_, you are writing the theory graph. Record the
  name and stop.
- **Not an ontology of mathematics.** Entries describe _this corpus's usage_. If the notes use a term incorrectly,
  record the incorrect usage and flag a `conflicting_definitions` issue.
- **Not over-linked.** A relation asserted without textual evidence is worse than a missing one.
- **Never merge senses.** Two readings are two senses, or two entries, never one silent choice.
- **Never drop a term for being trivial** if the discussion leans on it. Coverage, not meaning, is the completeness
  target.
- Unparseable references, undecidable statuses, colliding aliases and orphan entries go in `unresolved`, not into
  invented structure.

## Shape reminder

```json
{
  "version": "1.0.0",
  "corpus": {
    "documents": [{ "id": "sieve-notes", "path": "sieve-notes.md", "order": 1 }]
  },
  "companion": { "theory_graph": "sieve-notes.theory_graph.json" },
  "entries": [
    {
      "id": "term.wheel",
      "kind": "term",
      "label": "Wheel",
      "aliases": ["wheel sieve"],
      "gloss": {
        "text": "a wheel skips multiples of the first k primes",
        "verbatim": true,
        "source": { "file": "sieve-notes.md", "heading": "Wheel" }
      },
      "definition_status": "gestured",
      "senses": [
        {
          "id": "term.wheel#residue-class-set",
          "layer": "symbolic",
          "discriminator": "used with gcd and residues",
          "definition_status": "gestured"
        },
        {
          "id": "term.wheel#packed-bitmask",
          "layer": "ecological",
          "discriminator": "used with cache lines and bytes",
          "definition_status": "assumed_known"
        }
      ],
      "role": "central",
      "layers": ["symbolic", "ecological"],
      "layer_drift": "a set of residue classes when reasoning, a packed bit-array when timing",
      "mentions": [
        {
          "source": {
            "file": "sieve-notes.md",
            "heading": "Wheel",
            "quote": "no point even looking at multiples of 2,3,5,7"
          },
          "role": "introduces"
        },
        {
          "source": {
            "file": "sieve-notes.md",
            "heading": "Segmenting",
            "quote": "the wheel has to stay in L2"
          },
          "role": "uses",
          "sense": "term.wheel#packed-bitmask"
        }
      ],
      "mention_count": 2,
      "first_seen": "sieve-notes",
      "grounds": ["axiom.candidates-coprime-to-wheel"],
      "confidence": 0.9
    },
    {
      "id": "quantity.modulus",
      "kind": "quantity",
      "label": "Modulus",
      "symbols": ["m"],
      "definition_status": "assumed_known",
      "role": "supporting",
      "layers": ["symbolic"],
      "mentions": [
        {
          "source": {
            "file": "sieve-notes.md",
            "heading": "Wheel",
            "quote": "we only ever emit residues coprime to 210"
          },
          "role": "uses"
        }
      ],
      "mention_count": 1,
      "confidence": 0.85
    }
  ],
  "edges": [
    {
      "id": "k.term.wheel.parameterized_by.quantity.modulus",
      "from": "term.wheel",
      "to": "quantity.modulus",
      "relation": "parameterized_by",
      "confidence": 0.8,
      "sources": [{ "file": "sieve-notes.md", "quote": "residues coprime to 210" }]
    }
  ],
  "requests": [
    {
      "id": "q.wheel",
      "entry": "term.wheel",
      "reason": "\"Wheel\" is gestured after 2 mention(s) and grounds 1 theory node(s)",
      "wants": "disambiguation",
      "priority": "high",
      "score": 0.85,
      "status": "open",
      "sources": [
        {
          "file": "sieve-notes.md",
          "heading": "Wheel",
          "quote": "no point even looking at multiples of 2,3,5,7"
        }
      ]
    }
  ],
  "unresolved": [
    {
      "kind": "layer_drift",
      "description": "\"wheel\" is a residue-class set when reasoning and a bitmask when timing; the notes never reconcile them.",
      "refs": ["term.wheel"],
      "layers": ["symbolic", "ecological"]
    }
  ]
}
```
