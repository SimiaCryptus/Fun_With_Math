# **A Consolidated Schema for Mathematical Knowledge: Toward a Metaontology of Mathematical Practice**

## **Abstract**

Mathematics is conventionally treated as a single, homogeneous domain unified by a shared notion of truth. In practice, however, mathematical work is carried out across several distinct computational and cognitive regimes — proof, symbolic manipulation, numerical experiment — that differ not merely in method but in their fundamental commitments about what a mathematical object _is_, what it means for two objects to be _equal_, and what counts as _evidence_. Beneath these formal regimes lies a layer of practice that has never been formally written down: the improvisational, analogical, and exploratory activity that precedes formalization. Around the whole stack sits a distributed context — the community of practitioners and the physical/technological environment — that selects which ideas are pursued, stabilized, and remembered. This paper proposes a consolidated schema that names and relates all of these strata: an _inspiration layer_, a _fuzzy layer_, three _formal ontologies_ (symbolic, deductive, numeric), a _social layer_, and an _ecological layer_. We argue that the social and ecological layers are structural duals of the inspiration and numeric layers respectively, giving the full schema a coherent triadic geometry rather than a simple linear stack. The result is a mechanism-first metaontology intended to serve as the substrate for tools — human or artificial — that operate across the whole of mathematical practice rather than within a single one of its regimes.

## **1\. Introduction: Mathematics Is Not One Ontology**

It is tempting to think of mathematics as a single edifice: a body of true statements, discovered or invented, connected by proof. This picture is useful for pedagogy but false as a description of practice. A working mathematician moves fluidly between at least three activities that behave like different sciences wearing the same clothing:

- **Proving a theorem** — building a chain of inference from axioms to a conclusion, where existence means derivability and truth means closure under inference rules.
- **Manipulating symbols** — rewriting terms, simplifying expressions, applying algebraic identities, where existence means being a well-formed term and truth means reduction to a canonical form.
- **Running an experiment** — computing digits, simulating a system, checking convergence, where existence means being the limit of a computable process and truth means stability under refinement.

These are not three _styles_ of doing the same thing. They are three different answers to the questions "what exists?", "what is equal to what?", and "what is evidence?" Proof theory, symbolic computation, and numerical analysis have each built enormous, self-consistent machinery to answer these questions in incompatible ways, and every attempt to bolt them together after the fact — computer algebra systems wired to proof assistants, formally verified floating-point libraries, and so on — shows the seams. This paper's goal is to design the schema underneath these three practices: the _metaontology_ that makes their differing commitments explicit and specifies the morphisms that let information move between them.

But formal practice is only the visible tip of mathematical work. Long before a theorem is stated, a term is rewritten, or a computation is run, a mathematician is doing something else — noticing a resemblance, sketching a half-formed idea, asking "what if the structure here is really a group?", or simply feeling that a problem "wants" to be attacked from a certain direction. This activity was, until recently, unrecorded almost by necessity: it lived in a mathematician's head, in margin notes, in conversations, in the unrepeatable texture of a single mind working a single problem. The rise of tools that can converse with, capture, and manipulate this pre-formal material makes it possible — for the first time — to treat it as a first-class ontological layer rather than an invisible precondition. A complete schema for mathematical knowledge must include it.

Finally, mathematics does not happen in a vacuum. What gets investigated, what counts as interesting, and what survives long enough to become a field is shaped by two external pressures: the community of practitioners (with its citations, norms, prestige gradients, and shared folklore) and the physical and technological environment (with its engineering demands, computational constraints, and economic incentives). Any schema that stops at the boundary of the individual mind is incomplete.

What follows is a proposal for the full schema: five cognitive layers plus two contextual layers, related by a duality that gives the whole structure its final coherence.

## **2\. The Three Formal Ontologies**

We begin with the visible, well-studied strata — the parts of mathematics that already have institutions, journals, and formalisms built around them.

### **2.1 The Deductive Ontology (Proof-Objects)**

In the deductive ontology, a mathematical object is a node in a derivation graph.

- **Existence** means derivability from axioms.
- **Truth** means closure under inference rules.
- **Equality** means provable equivalence.

Its primitive substrate consists of sequents, inference rules, proof terms, type judgments, and the logical frameworks that host them (natural deduction, sequent calculi, type theories such as those underlying Coq or Lean). In this world, "2 \+ 2 \= 4" is not a number but a _proposition with a proof_.

### **2.2 The Symbolic Ontology (Rewrite-Objects)**

In the symbolic ontology, a mathematical object is a term in a rewrite system.

- **Existence** means being a well-formed syntactic construct.
- **Truth** means reachability of a normal form under rewrite rules.
- **Equality** means convertibility — the existence of a rewrite path between two terms.

Its primitive substrate consists of term graphs, rewrite rules, algebraic signatures, unification algorithms, and symbolic evaluators. Here, "2 \+ 2" is a tree, "4" is another tree, and their equality is a _path_, not a fact.

Symbolic manipulation sits closer to the deductive ontology than to the numeric one — every rewrite step can, in principle, be justified by a proof — but it remains ontologically distinct: proof concerns itself with truth, symbolics with form.

### **2.3 The Numeric (Analytic) Ontology**

In the numeric ontology, a mathematical object is a limit of computable approximations.

- **Existence** means convergence under some metric.
- **Truth** means stability under refinement.
- **Equality** means indistinguishability within an error bound.

Its primitive substrate consists of digit generators, series expansions, interval refinement, tail-error bounds, floating-point models, and valuations (archimedean or p-adic). Here, "2 \+ 2 \= 4" is a digit stream with zero tail error — a statement about a process, not about a form or a proof.

### **2.4 Why They Do Not Naturally Merge**

Each ontology answers a different question — "is this true?" (deductive), "what is the canonical form?" (symbolic), "what is the value to N digits?" (numeric) — and each carries its own notion of equality, existence, computation, error, time, and infinity. This is why hybrid systems that wire a computer algebra system to a proof assistant, or attach verified floating-point arithmetic to a formal theorem, tend to feel bolted together: the seams are not accidents of engineering but symptoms of genuine ontological mismatch.

### **2.5 A Unifying Object and Morphism Layer**

A schema that respects these differences without collapsing them can be built from two layers.

**The object layer.** Every mathematical object is represented as a triple of an ontology tag, an ontology-specific representation, and a set of cross-ontology interfaces:  
Object := {  
Ontology: {Proof, Symbolic, Numeric},  
Representation: (ontology-specific),  
Interfaces: (cross-ontology projections)  
}

**The morphism layer.** Every operation that moves information between ontologies is a named morphism:  
Proof → Symbolic (extract term from a proof)  
Symbolic → Proof (embed a term as an axiom or lemma)  
Symbolic → Numeric (evaluate with error bounds)  
Numeric → Symbolic (fit an approximation to a closed form)  
Proof → Numeric (construct computable bounds from a derivation)  
Numeric → Proof (construct existence proofs from computation, e.g.  
interval-arithmetic certificates)

These six morphisms are the actual missing architecture of mathematical software today: most systems implement one or two of them ad hoc, and none implement all six as first-class, composable operations.

**The coherence layer.** Because the three ontologies can each evolve independently, a schema needs an explicit coherence layer enforcing:

- _Semantic coherence_ — numeric evaluation must respect symbolic identities.
- _Logical coherence_ — symbolic rewrites must preserve provable truths.
- _Analytic coherence_ — proofs must guarantee the convergence properties they claim.

Coherence is not free; maintaining it across ontologies has a computational and conceptual cost that any implementation must budget for explicitly rather than assume away.

**Meta-operators.** Finally, a small set of universal operators act across all three ontologies: _normalization_ (symbolic), _verification_ (proof), _refinement_ (numeric), _extraction_ (cross-ontology), _approximation_ (numeric-from-symbolic), and _certification_ (proof-from-numeric). A substrate built from digit generators, multiplexing trees, rewrite graphs, and proof terms can host all six meta-operators without privileging any one ontology — supporting infinite and lazy structures, symbolic manipulation, proof extraction, numeric convergence, and structural sharing in a single representation.

With the three formal ontologies and their connective tissue in place, we can now ask where mathematical objects come from _before_ they are proofs, terms, or numbers.

## **3\. The Fuzzy Layer: A Fourth, Pre-Formal Ontology**

Historically, the activity that precedes formalization — half-formed concepts, intuitions, sketches, questions, heuristics, analogies, doodles, operator-shapes, mental models — has been treated as unworthy of formal attention: it was private, ephemeral, unrecorded, and effectively uncomputable. Yet this is the layer in which mathematicians actually spend much of their thinking time, and it is the layer from which every proof, every rewrite rule, and every numerical algorithm ultimately descends.

We name this **Ontology 0: the fuzzy layer**, and give it the same structural treatment as the three formal ontologies.

- **Identity.** A mathematical object at this layer is a pre-formal cognitive structure — a pattern, a conjecture, a sketch, a metaphor, a structural hunch, a partial operator, a shape in conceptual space.
- **Existence.** It exists once it can be expressed at all — as a pattern, a question, a partial operator, or a shape — without needing to be formalized.
- **Truth.** Not applicable. Fuzzy objects are pre-truth-apt; they have not yet committed to a notion of correctness.
- **Computation.** Exploration, refinement, mutation, analogy, clustering.
- **Equality.** Similarity of conceptual shape, not identity or convertibility.

The fuzzy layer is not "informal mathematics" in the pejorative sense; it is a computational substrate with its own dynamics, now newly amenable to external representation and manipulation.

### **3.1 Relation to the Formal Layers**

Crucially, the fuzzy layer is not parallel to the three formal ontologies — it is upstream of all of them, feeding each in a characteristic way:

- **Fuzzy → Symbolic.** A pattern becomes a term, a rewrite rule, an algebraic signature.
- **Fuzzy → Proof.** A conjecture becomes a theorem, a lemma, a derivation.
- **Fuzzy → Numeric.** An intuition becomes an experiment, a simulation, a convergence test.

And the relationship runs in both directions: symbolic manipulation often surfaces new fuzzy patterns, numerical experiments often provoke new fuzzy conjectures, and failed proof attempts often generate new fuzzy questions. This bidirectional loop — fuzzy objects seeding formal work, formal work seeding new fuzzy objects — is the creative engine of mathematics that a purely formal schema cannot represent.

### **3.2 Worked Example: Completing the Square**

Consider the transformation known as "completing the square." At the fuzzy layer it exists as an unformalized pattern: _quadratics become simpler if you isolate a perfect square._ This is a shape in conceptual space, not yet committed to any representation.

At the symbolic layer, it becomes a concrete rewrite rule:  
a x^2 \+ b x \+ c → a (x \+ b/2a)^2 − b^2/4a \+ c

At the deductive layer, it becomes a proof object — a derivation showing that the rewrite preserves equality. At the numeric layer, it becomes an algorithm: a stable method for locating roots or vertex coordinates.

The same pattern — fuzzy hunch propagating downward into symbolic form, deductive justification, and numeric implementation — recurs for the principle of relativity: the fuzzy hunch that "the laws shouldn't depend on the observer's frame" becomes, symbolically, a covariance requirement under x' \= x − vt; deductively, the formal statement that physical laws are Lorentz-invariant; and numerically, the requirement that stable integrators preserve the associated invariants (energy, momentum). Symmetry arguments, dimensional analysis, duality, change of basis, and perturbation expansions all follow the identical descent pattern: fuzzy pattern, symbolic rule, deductive justification, numeric consequence.

## **4\. The Inspiration Layer: A Deductive Meta-Navigator**

If the fuzzy layer is where improvisations are held and shaped, something else decides _which_ improvisations are worth having in the first place. This is the layer above the fuzzy layer — call it **Ontology −2: the inspiration layer** — and it behaves in a way that is easy to mistake for either intuition or pure creativity, but is neither.

The inspiration layer works _deductively_, in the same sense that the deductive ontology at the bottom of the stack works deductively, but at a much higher altitude and toward a different end: not proving statements within a fixed theory, but deciding which investigations are worth pursuing at all. It operates by:

1. **Deductive steering.** Using inference not to prove theorems but to choose a direction: _if the invariants of this system resemble group cohomology, then the natural next step is to check for a hidden grading in the operator algebra._
2. **Knowledge-boundary mapping.** Maintaining an explicit sense of what is known, what is unknown, what is merely suspected, and what analogies or dualities remain unexplored.
3. **Analogical deduction.** Treating structural resemblance itself as a deductive operator — not decorative metaphor, but a rigorous move of the form _this resembles a Lie algebra, therefore check Jacobi-like constraints; this resembles a gauge symmetry, therefore look for redundancy; this resembles a p-adic valuation, therefore check ultrametricity._

Ontologically, an inspiration-layer object is not a mathematical object at all — it is a _directional inference about the space of possible theories_: a research trajectory, a domain mapping, a suspected duality, a hypothesis that a certain invariance ought to hold, an inference that a given gap implies a missing structure. Its morphisms are analogy extension, analogy inversion, analogy fusion, trajectory refinement, trajectory branching and pruning, domain mapping, gap identification, and invariance projection.

This is the layer where new fields of mathematics, new physical theories, and new engineering paradigms are actually conceived — not as isolated flashes of insight, but as the outcome of a genuine (if informal) deductive process operating over a map of known and unknown structure, using analogy as its primary inferential tool.

## **5\. The Social Layer: The Collective Analog of Inspiration**

Mathematics is not produced by isolated minds. Every layer described so far can be instantiated inside a single head, but every layer is also modulated by a distributed epistemic environment that determines what gets attention, what counts as valid, and what survives. We call this **Ontology \+S: the social layer**, and treat it as orthogonal to the cognitive stack rather than as another rung on the same ladder.

The social layer contains references, related work, citations, prior art, folklore, shared heuristics, established metaphors, domain conventions, research programs, open-problem lists, collective blind spots, collective obsessions, prestige gradients, funding incentives, and publication norms. It shapes every layer below it:

- It shapes **inspiration** by determining which analogies feel natural and which directions seem worth exploring.
- It shapes the **fuzzy layer** by determining which improvisations are recognized, named, and stabilized into shared patterns.
- It shapes the **symbolic layer** by determining which formalisms become canonical.
- It shapes the **deductive layer** by determining what counts as a legitimate proof and which axioms are acceptable.
- It shapes the **numeric layer** by determining which experiments count as meaningful evidence.

Without this layer, the schema cannot explain how fields emerge and persist, how ideas propagate, how blind spots form and endure, or how paradigms shift. Relativity, symmetry-as-a-principle, category theory as a common language, and machine learning as a paradigm are all, in part, social achievements: the social layer is the selection pressure that decides which cognitive-layer productions become permanent fixtures of the field.

## **6\. The Ecological Layer: The Collective Analog of Numeric Stability**

A second, orthogonal contextual layer completes the schema: **Ontology \+E, the ecological layer.** Where the social layer is the distributed epistemic environment of the _community_, the ecological layer is the distributed physical and technological environment of the _world_. It contains physical constraints, engineering demands, computational limits, economic incentives, technological affordances, available materials, available computational substrates, and the historical accidents of which tools happened to exist when a given problem arose.

This layer explains facts that no purely cognitive or social account can: why calculus emerged when physics demanded it, why probability theory emerged when gambling and insurance demanded it, why linear algebra exploded once computers made matrix operations cheap, why category theory rose as systems grew more complex, why deep learning emerged only once data and GPUs coexisted, and why some formally elegant structures (p-adic numbers, for instance) remain comparatively niche for want of ecological pressure to develop them further. It equally explains why a given practitioner's own idiosyncratic outputs take the shape they do: an idea born from constraints in one domain — hazardous maintenance conditions, say, or the physics of coherence limits — is as much a product of ecological pressure as of individual insight.

The ecological layer modulates the same five cognitive layers as the social layer, but through constraint rather than through attention: it determines which analogies feel natural because they reflect the practitioner's actual environment, which proto-operators stabilize because they solve real problems, which formalisms become canonical because they fit available tools, which axioms matter because they model genuine physical constraints, and which algorithms survive because they remain stable under real-world noise.

## **7\. The Duality That Completes the Schema**

The social and ecological layers are not two more entries appended to a list; they are the structural duals of two specific cognitive layers, and recognizing this duality is what makes the schema feel complete rather than merely long.

**Inspiration ↔ Social.** Inspiration is _individual_ meta-deductive steering: analogical reasoning applied to decide what a single mind should investigate next. The social layer is _collective_ meta-deductive steering: the same kind of analogical, trajectory-shaping reasoning, but distributed across a community and encoded in citations, folklore, and shared heuristics about what is "natural" or "promising" to pursue. Both operate on the same raw materials — analogies, gaps, trajectories — one internally, one externally.

**Numeric ↔ Ecological.** The numeric layer is concerned with _internal_ stability: convergence, error bounds, robustness under refinement. The ecological layer is concerned with _external_ stability: which structures survive contact with real engineering, computational, and economic constraints. Both operate on the same raw materials — noise, cost, feasibility, robustness — one mathematically, one environmentally.

This gives the following duality table, which should be read as the organizing summary of the entire schema:

| Cognitive Layer | Social Analog                                        | Ecological Analog                        |
| --------------- | ---------------------------------------------------- | ---------------------------------------- |
| −2 Inspiration  | Collective inspiration (folklore, research programs) | Problem ecology (what the world demands) |
| 0 Fuzzy         | Community heuristics                                 | Environmental heuristics                 |
| 1 Symbolic      | Canonical formalisms                                 | Tool-driven representations              |
| 2 Deductive     | Proof norms                                          | Physical/logical constraints             |
| 3 Numeric       | Empirical norms                                      | Real-world stability                     |

The schema is therefore not a linear stack but a structure with three axes: a vertical _cognitive_ axis running from inspiration through fuzzy, symbolic, and deductive to numeric; a horizontal _social_ axis modulating every cognitive layer through community context; and a horizontal _ecological_ axis modulating every cognitive layer through environmental context. Mathematics, on this account, is the joint product of a mind, a community, and a world, and no schema that omits any one of the three axes can claim to describe mathematical practice rather than merely mathematical formalism.

## **8\. The Consolidated Schema**

Bringing the preceding sections together, the consolidated schema consists of five cognitive layers and two contextual layers:

- **−2 Inspiration Layer** — deductive, analogical, improvisational steering; maps known against unknown; generates research trajectories rather than mathematical objects.
- **0 Fuzzy Layer** — stabilizes improvisation into proto-operators and proto-structures; pre-formal, pre-truth-apt, exploratory.
- **1 Symbolic Layer** — formal rewrite systems; term graphs; existence as well-formedness; truth as reachability of normal form.
- **2 Deductive Layer** — proof objects and derivation graphs; existence as derivability; truth as closure under inference.
- **3 Numeric Layer** — approximation and simulation; existence as convergence; truth as stability under refinement.
- **\+S Social Layer** — the distributed epistemic environment: references, related work, lineage, prestige, norms; the collective analog of inspiration.
- **\+E Ecological Layer** — the distributed physical/technological environment: engineering, computation, economics; the collective analog of numeric stability.

Connective structure spans all five cognitive layers: an object layer tagging every mathematical entity with its ontology and cross-ontology interfaces; a morphism layer of named operations (extraction, embedding, evaluation, approximation, bound-construction, certification) that move information between ontologies; and a coherence layer that makes the cost of maintaining consistency across ontologies explicit rather than assumed.

## **9\. Implications and Directions for Further Work**

This schema is offered as a foundation rather than a finished theory, and several directions of further work follow naturally from it.

**A type system for each layer.** Inspiration objects (trajectories, domain mappings, invariance hypotheses), fuzzy objects (proto-patterns, conjectural shapes), and the objects of the three formal ontologies each need explicit type disciplines before the schema can be implemented rather than merely described.

**Morphism catalogues.** The six cross-ontology morphisms sketched in Section 2, together with the fuzzy-to-formal projections of Section 3 and the analogical morphisms of Section 4, need to be enumerated exhaustively and given precise operational semantics.

**Geometry of inspiration and fuzzy space.** Both the inspiration layer and the fuzzy layer admit a notion of similarity or distance between objects (shape of a hunch, resemblance of an analogy); making this geometry explicit would allow automated tools to cluster, retrieve, and extend proto-mathematical material in a principled way.

**A unified workspace engine.** The ultimate practical goal of this schema is a system — a "workspace engine" — that represents objects across all five cognitive layers uniformly, supports the morphisms between them, tracks social and ecological context as first-class metadata, and can therefore assist with mathematics at every stage from an unformalized hunch to a numerically certified result.

## **10\. Conclusion**

Mathematics has always been more than proof, and more than symbol manipulation, and more than computation — and it has always been more than the individual mind, embedded as it is in a community and a physical world. What this paper proposes is not a new philosophy of mathematics but a mechanism-first schema: five cognitive layers, from inspiration through fuzzy improvisation to symbolic, deductive, and numeric formalization, wired together by explicit object, morphism, and coherence structures; and two contextual layers, social and ecological, that are not afterthoughts but structural duals of the inspiration and numeric layers respectively. The result is the first schema, to our knowledge, that treats the pre-formal and the contextual dimensions of mathematical practice with the same structural seriousness traditionally reserved for proof and computation — and that does so not by inventing new mysticism about creativity, but by naming, as precisely as the formal layers themselves are named, the mechanisms by which mathematical knowledge is actually found, shaped, and kept.
