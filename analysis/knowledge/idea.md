# **The Knowledge Layer: A Relational Map of the Vocabulary of a Discussion**

## **Abstract**

The theory schema records *claims* — what a corpus asserts, at which ontological layer, on what evidence. It presupposes
something it does not itself capture:
the vocabulary those claims are phrased in. Every set of working notes leans on a large body of terms, notations, named
objects, methods, tools, and prior work that it never defines, because the author already knows what they mean. This
companion schema records that body. Its organising principle is deliberately inverted with respect to a glossary: **we
record how terms relate before, and often instead of, what they mean.** An entry is created the moment a term is used as
though it meant something; its definition is treated as a separate, later, optional act. The result is not a dictionary
but a *map of the discussion's vocabulary together with a ranked queue of the definitions that map is missing* — an
index of what is assumed, what is ambiguous, and what a reader (or a tool)
must be told next in order to proceed.

## **1. Two Complementary Graphs**

The theory graph and the knowledge graph answer different questions about the same corpus:

|              | theory graph                                                           | knowledge graph                                                          |
|--------------|------------------------------------------------------------------------|--------------------------------------------------------------------------|
| unit         | a claim                                                                | a term                                                                   |
| asks         | "what is being asserted, and how do assertions depend on one another?" | "what is being talked about, and how do the things talked about relate?" |
| truth        | central (status, confidence, evidence)                                 | absent — entries are not truth-apt                                       |
| completeness | every claim traceable to a source                                      | every *word used as if load-bearing* has an entry                        |
| failure mode | missing an argument                                                    | missing that a word was never explained                                  |

They are not layered one above the other; they are two projections of the same prose. A single sentence — *"the wheel of
modulus 210 removes 77% of candidates before any primality test runs"* — contributes one claim to the theory graph and
four entries plus their relations to the knowledge graph (`wheel`, `modulus`,
`candidate`, `primality test`), none of which the sentence defines.

The bridge between them is one-directional and cheap: an entry may *ground* a set of theory nodes (the nodes whose
statements use it). Nothing in the theory graph needs to know the knowledge graph exists.

## **2. Relations Before Definitions**

The central design commitment is that **relational metadata is extracted, and definitional content is only recorded when
the corpus supplies it.**

There are three reasons for this ordering.

**It is honest.** A definition invented by the extractor is indistinguishable in the output from a definition present in
the notes, and is far more likely to be wrong. A relation ("*wheel* is used together with *modulus*"; "*wheel* is a kind
of *sieve optimisation*"; "*wheel* is never defined here") is directly observable in the text.

**It is cheap and stable.** Co-occurrence, apposition, taxonomic phrasing ("a wheel is a …"), and notational binding are
surface phenomena. They survive re-extraction; paraphrased glosses drift on every run.

**It is what a follow-up actually needs.** To ask a good question about a term you need to know where it sits, what
depends on it, and what else is undefined around it — not a provisional summary that pre-empts the answer. The knowledge
graph is designed to be read as a work queue: *these are the twelve terms this corpus assumes, ranked by how much of the
discussion is standing on them.*

Accordingly `gloss` is optional and `definition_status` is required. An entry whose status is `assumed_known` with forty
mentions is a *more* valuable output than an entry with a confident paraphrase.

## **3. Entries**

An entry is created for anything the corpus treats as a name. Kinds fall into three groups:

- **Language** — `term`, `notation`, `abbreviation`. The word or glyph itself, independent of what it denotes. Notation
  entries exist so that a symbol whose meaning is never stated is still visible in the map.
- **Content** — `concept`, `object`, `structure`, `property`, `operation`,
  `quantity`, `unit`, `named_result`, `method`, `problem`. The things denoted. Note that `named_result` records *"
  Dirichlet's theorem"* as a name to be looked up; the theorem as a claim belongs in the theory graph.
- **Context** — `field`, `tool`, `format`, `dataset`, `person`, `work`,
  `convention`. The surrounding apparatus, and the natural attachment points for citations.

Each entry carries the facets needed for retrieval and prioritisation:
aliases and symbols (so the same thing found under three names collapses to one node), mentions (every occurrence, with
the role the occurrence plays — introducing, using, contrasting, questioning), the metaontology layers the term is
actually used at, and its role in the discussion (central, background, incidental).

### **3.1 Definition Status**

`definition_status` is a small lattice, and the whole schema is arranged around it:

`defined_here` · `defined_elsewhere` · `assumed_known` · `gestured` ·
`ambiguous` · `conflicting` · `undefined` · `unknown`

Only the first two are terminal. `gestured` — the notes indicate the shape of the meaning without pinning it — and
`assumed_known` are the common and interesting cases, and both generate follow-up requests.

### **3.2 Senses**

Working notes reuse words. A `sense` is a distinct reading of one entry, each with its own optional gloss, its own
layer, and a discriminator saying what tells the readings apart in context. Recording two senses is always preferable to
silently picking one, and a term with unresolved senses is marked `ambiguous`
rather than split into two entries the author would not recognise as separate.

The most systematic source of sense-splitting is the metaontology itself: the same word means different things at
different layers. *Equality* is convertibility symbolically, provable equivalence deductively, and indistinguishability
within a bound numerically. *Wheel* may be a residue-class set at the symbolic layer and a bit-array at the ecological
one. This drift is recorded explicitly (`layer_drift`) rather than treated as noise, because it is exactly the kind of
thing a reader silently gets wrong.

## **4. The Relation Taxonomy**

Relations are grouped by what kind of evidence licenses them:

- **Lexical** — `synonym_of`, `abbreviation_of`, `variant_of`, `notation_for`,
  `homonym_of`, `renames`. Evidence: the surface form.
- **Taxonomic** — `is_a`, `instance_of`, `part_of`, `has_part`, `generalizes`,
  `specializes`. Evidence: explicit classificatory phrasing.
- **Definitional** — `defined_in_terms_of`, `presupposes`, `prerequisite_of`,
  `disambiguated_by`. Evidence: the term appears inside another's explanation. These carry the dependency structure that
  orders the follow-up queue.
- **Functional** — `operates_on`, `produces`, `parameterized_by`, `measured_by`,
  `implements`, `computes`, `applies_to`. Evidence: verb-argument structure.
- **Discourse** — `co_occurs_with`, `contrasts_with`, `alternative_to`,
  `analogous_to`, `example_of`, `counterexample_to`, `motivates`, `see_also`. Evidence: adjacency and rhetorical
  framing. The weakest, most numerous, and most useful for clustering.
- **Provenance** — `attributed_to`, `introduced_in`, `documented_in`, `cites`. Evidence: names and citations.

`co_occurs_with` is deliberately included despite carrying almost no semantics. It is the substrate from which topics
are induced when nothing stronger is available, and its `strength` field (co-occurrence weight) is the graph's cheapest
signal.

## **5. Definition Requests: the Map as a Queue**

The output of the schema that justifies its existence is `requests`: an explicit, ranked list of definitions the corpus
needs and does not have. A request records the entry, why the definition is wanted now, what shape of answer would
satisfy it (`formal_definition`, `gloss`, `disambiguation`, `citation`, `example`,
`notation_key`), which other undefined entries block it, and where to look.

Requests are derived, not authored: score rises with centrality in the relation graph and with mention count, and falls
when the corpus already defines the term. An entry mentioned once in passing and never related to anything generates no
request; an entry that thirty claims are phrased in terms of, with status
`assumed_known`, goes to the top. Prerequisite edges order the queue so that answering it top-down does not require
forward references.

## **6. Worked Example**

From a corpus of prime-generation notes:

- `term.wheel` — 31 mentions, `definition_status: gestured`
  ("*a wheel skips multiples of the first k primes*"), two senses (residue-class set / packed bitmask), layers
  `symbolic` and `ecological`,
  `layer_drift` recorded. Relations: `parameterized_by → quantity.modulus`,
  `part_of → method.sieve-of-eratosthenes`, `alternative_to → method.segmented-sieve`,
  `co_occurs_with → quantity.candidate-density` (strength 0.8). Grounds nine theory nodes. → **request, high priority,
  wants `disambiguation`.**
- `notation.phi` — `definition_status: undefined`, `notation_for → quantity.totient`
  inferred from a single apposition, confidence 0.6. → **request, wants `notation_key`.**
- `named_result.mertens-third-theorem` — `definition_status: defined_elsewhere`,
  `documented_in → work.hardy-wright`. → **no request.**

The map says nothing about what a wheel *is*. It says precisely how much of the discussion will be misread by someone
who does not know.

## **7. Anti-Goals**

- **Not a glossary.** Completeness of meaning is not the target; completeness of *coverage* is. Every load-bearing word
  must appear; almost none need be explained.
- **Not an ontology of mathematics.** Entries and relations describe *this corpus's usage*, not the subject. If the
  notes use a term incorrectly, the graph records the incorrect usage and flags a conflict.
- **Not a summary.** No entry may be created for something the corpus does not name. Phantom entries — plausible
  neighbours the extractor knows about but the text never mentions — are the primary failure mode and are excluded by
  the requirement that every entry carry at least one mention with a source.
- **Not over-linked.** A relation asserted without textual evidence is worse than a missing one; low-evidence links
  belong in `co_occurs_with` with a strength, not in `is_a`.

## **8. Further Work**

**Alias resolution across corpora.** Merging entries whose labels differ but whose relational neighbourhoods coincide.

**Induced topics.** Community detection over the discourse relations to produce glossary sections that reflect how the
notes actually organise their vocabulary, rather than a subject-matter taxonomy imposed from outside.

**Request answering as a first-class operation.** A follow-up pass that consumes
`requests`, retrieves candidate definitions, and writes back entries with
`definition_status: defined_elsewhere` plus citations — closing the loop without ever letting the extractor invent
meaning.

**Joint queries with the theory graph.** "Which unproved conjectures are phrased entirely in undefined vocabulary?" is
answerable only across both graphs, and is the sharpest available measure of how far a set of notes is from being
readable by anyone but its author.