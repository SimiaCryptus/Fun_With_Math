# Numbers as Machines: A Generator-Based Numerics Library

## The Core Inversion

Classical numerics treats numbers as values — static objects stored in registers, manipulated by arithmetic circuits,
approximated by floating-point hardware. This essay proposes a different substrate: **every number is a deterministic,
forkable virtual machine** that emits an infinite digit stream on demand.

This is not a metaphor. It is a literal computational ontology with precise consequences for implementation, memory
complexity, and the structure of mathematics itself. The framing has deep roots — Cauchy sequences, computable reals (
Turing 1936), coalgebraic stream arithmetic, p-adic expansions, exact real arithmetic systems like iRRAM, and the Type-2
Theory of Effectivity all instantiate parts of this idea. What is new here is not the underlying mathematics but the \*
\*unified protocol, the codec/base separation, and the explicit ABI\*\* that makes all of it composable at native speed.

The primitive is simple:

```
step : State → (digit, State)
```

A number is any deterministic program that implements this interface. Everything else — vectors, matrices, tensors,
p-adics, transcendentals, metrics, arithmetic — is a combinator over this primitive. Categorically, this is the final
coalgebra for the digit-stream functor `F(X) = D × X`, which is the correct mathematical framing and the same one used
in coinductive treatments of streams.

---

## The Binary Multiplexer as Foundation

A vector is a nesting of binary multiplexer encoders. A matrix or tensor is a nesting of vector construction operators.
This is not an analogy to existing data structures — it is the correct ontological description of what these objects
are.

The core combinator is:

```
MUX(selector, left, right)
```

Where `selector` is itself a generator, and `left` and `right` are generators recursively. This gives you:

- **Unbounded precision** — digits are computed on demand; you never run out of bits
- **p-adic structure** — digits are naturally hierarchical and base-parametrized
- **Lazy evaluation** — only expand the tree as far as the consumer requires
- **Structural sharing** — subtrees are reused, giving canonicalization for free
- **Vectors, matrices, tensors** — as nested MUX trees over number generators

A number in this model is a function `digit(k) → {0, 1, ..., b-1}`, implemented as a MUX tree. A vector is a MUX over
number generators. A matrix is a MUX over vector generators. The nesting is uniform all the way down.

Arithmetic becomes generator composition. Addition is a carry-propagating combinator over two digit generators.
Multiplication is a convolution combinator. Division, negation, and subtraction follow the same pattern — pure generator
composition.

But carry propagation is where the abstraction meets its hardest test, and we should be honest about it.

---

## The Carry Problem and Signed-Digit Representation

Standard positional arithmetic has a notorious flaw as a stream operation: addition is **not local**. The first digit of
`0.4999... + 0.5000...` cannot be determined from any finite prefix — a carry from arbitrarily deep in the expansion
could propagate up and flip every digit above it. Any naive digit-by-digit addition combinator will fail to terminate on
inputs near a digit boundary. This is not an edge case; it is a structural property of the standard representation.

The solution, well-established in exact real arithmetic, is to adopt a **signed-digit (redundant) representation**
internally, where digits range over `{-(b-1), ..., -1, 0, 1, ..., b-1}` rather than `{0, ..., b-1}`. In this
representation:

- Addition is digit-local — no unbounded carry propagation
- Each number has multiple valid encodings (this is the redundancy)
- The MUX/codec layer projects to a standard non-redundant form only when emitting an externally visible digit

Avizienis signed-digit representation is the canonical choice. Without it, the arithmetic combinators are mathematically
ill-defined as local operations. With it, addition, subtraction, and multiplication become genuinely streaming
operations with bounded look-ahead. The base parameter still plays its role as a codec, but the internal arithmetic
layer operates in a redundant alphabet.

This is a non-negotiable design commitment for the real-number arithmetic layer.

---

## Unbounded Precision as a Native Property

Because digits are computed on demand and the tree is lazily evaluated, unbounded precision is not a feature to be
added — it is the default behavior of the substrate. Structural sharing keeps memory bounded to what is actually needed.
You compute exactly as many digits as the consumer requests, and no more.

This is the same mechanism used by lazy streams in functional languages and exact real arithmetic libraries (iRRAM,
Haskell's `Data.Number.CReal`, MPFR with rigorous error tracking), but grounded in a more explicit state-machine
semantics that LLVM can compile directly to native code, and unified under a single ABI rather than scattered across
domain-specific libraries.

---

## p-Adics Come for Free

The p-adic numbers are particularly natural in this model, and notably **easier than the reals** in a precise technical
sense: digit commitment is _local_ in p-adics, where it is _non-local_ in the reals.

A p-adic number is a digit stream indexed from the least significant digit upward, with digits in `{0, 1, ..., p-1}`. In
the generator model, this is simply a MUX tree with a p-way multiplexer instead of a binary one.

More importantly: **p-adic numbers are periodic state machines in the generator computer**. A p-adic rational has an
ultimately periodic digit expansion, which means its generator VM has a finite state space with a periodic orbit. The VM
cycles through a finite set of states, emitting the repeating digit pattern.

This has an immediate consequence: **the p-adic metric is also a periodic state machine**. The p-adic distance between
two numbers `x` and `y` is `p^{-v_p(x-y)}`, where `v_p(x-y)` is the index of the first digit where they differ. If both
`x` and `y` are periodic generators, then the metric computation is a product automaton over their state spaces — itself
a finite, periodic machine.

The general primitive this reveals is:

**AutomatonOverGenerators**: a finite state machine whose transition function reads one or more digit generators and
produces either a new generator or a scalar (valuation, distance, boolean).

p-adics and their metric are the cleanest, most symmetric instance of this pattern. Because valuations are algebraic
rather than analytic, a term with p-adic valuation `v` can only affect digits at positions `≤ v` — giving exact,
finite-witness digit commitment that the real case can only approximate via interval refinement.

---

## The Odd Primitives: Turning Math into Compute

Supporting most of mathematics requires some nonstandard primitives — operators that compile mathematical definitions
into digit streams with correctness guarantees.

### Series Stepper

```
series_step(state) → (term, new_state)
```

A finite state machine that emits the next term of an infinite series. This is the computational form of a mathematical
definition — a convergent series becomes an executable state machine.

### Tail Bound Oracle

```
tail_bound(state) → E
```

Given the current series state at index `n`, returns an upper bound `E` such that the remaining tail satisfies
`|∑_{k>n} a_k| ≤ E`. This is the bridge from convergence proofs to executable digit safety. Without it, you cannot
safely commit to digits — you don't know whether the tail will perturb a digit you've already emitted.

This is a compiled convergence proof: you turn analytic or algebraic control into an executable bound. **It is a
mathematical barrier, not merely an engineering concern** — every supported transcendental constant or analytic function
requires its own per-constant convergence proof, embedded as a callable bound. The library must ship a standard
repertoire of these oracles (for π, e, log, sin, cos, ζ at integers, polylogarithms, etc.) and expose a documented
interface for users who wish to add their own.

### Interval Refinement Engine (for reals)

```
refine_interval(L, U, term, E) → (L', U')
emit_digit_if_safe(L, U, base) → maybe digit
```

Maintains a shrinking interval `[L, U]` containing the true value. A digit is emitted when all numbers in the current
interval share the same prefix of sufficient length. This is the real-number version of digit extraction — an online,
monotone refinement process that commits digits as the interval collapses.

This is essentially interval arithmetic combined with online digit extraction, a technique with substantial prior art
dating to the 1980s. Combined with signed-digit representation, it provides a complete streaming arithmetic layer for
the reals — with the documented caveat that exact-boundary inputs (e.g., a result that is provably exactly `0.5` in base 10) may not commit a leading digit in finite time. This is not a defect of the implementation but a structural property
of real-number computation, and the API must expose it honestly via interval-based predicates (`definitely_less_than`,
`agrees_with(digits=N)`) rather than pretending exact equality is decidable.

### Valuation Extractor (for p-adics)

```
valuation(a_n) → v_p(a_n)
```

For p-adics, locality is algebraic rather than analytic. A term with p-adic valuation `v` can only affect digits at
positions `≤ v`. This gives a locality primitive: you know exactly which terms can affect which digits, and you can
compute low-order digits from a finite subset of terms — no tail bound oracle required, no interval refinement, no
boundary pathologies.

### Carry Propagator

```
carry(k) → {0, 1, ...}
```

Addition, subtraction, multiplication, and division all reduce to digitwise combinators plus a carry propagation rule.
Under signed-digit representation, this combinator is local. Under standard representation, it is not. The library
commits to signed-digit internally.

### Composition Engine

```
compose(f, g) → h
```

All mathematical operations reduce to composing digit generators. This is the function algebra of the numerics library —
the mechanism by which complex mathematical objects are built from simpler ones.

### Memoization and Structural Sharing

```
memo(generator) → generator'
```

Repeated digit queries must not recompute. Shared subtrees must remain shared. This is not conceptually deep, but it is
essential for performance — without it, the lazy unfolding of infinite structures becomes intractable.

Memoization is exposed as an **explicit wrapper, never an implicit global cache**, because implicit caching breaks the
value-semantics story for forking. The recommended implementation is a bounded LRU cache sized to fit in L2/L3, with the
user-facing API offering `.streaming()` (no cache, O(1) space, sequential access only) and `.cached(max_digits=N)` (
bounded LRU) modes. Hidden global state is forbidden by ABI.

These primitives together support real analysis, p-adic analysis, linear algebra, algebra, combinatorics, and number
theory. All of it reduces to digit generators, MUX trees, series steppers, tail bounds or valuations, interval
refinement, carry propagation, and composition.

---

## The Forkable Nano-VM: A Two-Tier ABI

The full picture of a number in this model is a **forkable, coinductive, deterministic nano-VM**:

1. **Stateful** — each number carries internal state that evolves as digits are requested
2. **Forkable** — the state can be cloned exactly at any point, enabling parallel digit computation, comparison, metric
   evaluation, and speculative arithmetic
3. **Deterministic and pure** — forking is exact; there is no hidden global state
4. **Periodic-friendly** — the VM supports periodic state cycles, ultimately periodic orbits, and product automata
5. **Composable** — two VMs combine into a new VM via arithmetic and analytic combinators
6. **Lazy** — digits are produced on demand, not precomputed

Nothing like this exists in the numerical computing ecosystem as a unified protocol. Classical numerics assumes numbers
are values, precision is bounded, evaluation is eager, and arithmetic is stateless. This model inverts all four
assumptions. The closest conceptual ancestors — coinductive streams in Haskell, coalgebraic automata theory, stream
transducers, exact real arithmetic libraries, symbolic algebra systems — each capture one or two of these properties but
not all of them together under one ABI.

But "forkable" hides a critical bifurcation that a single ABI cannot honestly serve. There are two structurally distinct
classes of generator:

| Tier                | Examples                                           | State                        | Fork Cost                                  |
| ------------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------------ |
| **Automaton class** | Rationals, algebraic irrationals, periodic p-adics | Fixed-size, inline           | **O(1)** — true struct copy                |
| **Series class**    | Classical transcendentals (π, e, log 2, ζ(3))      | Grows with computation depth | **O(log n)** — must deep-copy accumulators |

For the automaton tier, fork is a literal struct copy. For the series tier, fork must deep-copy the arbitrary-precision
accumulators that have grown as digits were emitted. Pretending these have the same cost would mislead users and produce
subtle aliasing bugs. The ABI therefore separates them explicitly:

```c
// Automaton tier: pure value semantics, O(1) fork
typedef struct {
    uint32_t base;
    uint32_t phase;
    uint64_t state[4];     // sufficient for degree-4 algebraic
} AutomatonVM;

// Series tier: explicit deep-copy required for fork
typedef struct {
    uint32_t base;
    uint32_t index;
    const SeriesSpec *spec;     // immutable, safe to alias
    ArbitraryInt *accum;        // mutable, deep-copy on fork
    ArbitraryInt *error_bound;  // mutable, deep-copy on fork
} SeriesVM;
```

The "forking is a struct copy" claim applies to the automaton tier, fully and without qualification. For the series
tier, fork is `O(log n)` in the computation depth and is documented as such. This is not a defect — it is the actual
cost of the operation, and hiding it would break the value-semantics contract that makes the abstraction safe.

---

## LLVM as the Execution Substrate

The nano-VM is not a bytecode interpreter. It does not encode or decode its own state. That is precisely why LLVM is the
right implementation target.

The canonical ABI for the automaton tier is:

```c
struct NumVMStep {
    uint32_t digit;
    AutomatonVM next;
};

typedef struct NumVMStep (*NumVMFn)(AutomatonVM);
```

In LLVM IR:

```llvm
%AutomatonVM = type { i32, i32, [4 x i64] }
%NumVMStep   = type { i32, %AutomatonVM }

define %NumVMStep @num_step(%AutomatonVM %s) { ... }
```

**State is native machine data, not a serialized blob.** LLVM handles state layout, register allocation, calling
conventions, inlining, constant folding, JIT specialization, dead code elimination, loop unrolling, and tail recursion
elimination. The program does not encode or decode anything — it simply operates on struct fields.

Forking the automaton tier is a struct copy:

```c
static inline AutomatonVM num_vm_fork(AutomatonVM s) {
    return s; // pure value copy — no hidden state
}
```

Composition is function wrapping: an addition VM holds two sub-VM states plus a carry field, calls both sub-VM step
functions, combines the digits, and returns a new composite state. LLVM inlines the entire generator graph, optimizes
across VM boundaries, fuses arithmetic, eliminates intermediate states, and specializes for constants.

**A caveat about LLVM's reach.** LLVM optimization applies fully to _statically-known, compile-time-fixed_ expression
trees. For _runtime-constructed_ expression trees — parsing arithmetic expressions, dynamic matrix construction,
user-input formulas — function-pointer dispatch will not be eliminated by static optimization alone. For these cases,
the library provides a **JIT compilation path**: an expression tree is compiled to a single specialized LLVM function
via `compile(expr_tree) → NumVMFn`, which then receives the same inlining, constant folding, and specialization
treatment as a statically-built tree. This split is explicit in the API, not hidden behind a single uniform interface
that would silently degrade for dynamic cases.

The base parameter — the codec — lives in `payload` or `flags`. It is not baked into the number. Changing base is
changing the projection, not the number. The ABI does not change when you swap codecs.

---

## Base as Codec: The Arithmetic Encoder Interface

The base parameter is not a mathematical constant. It is a projection operator — a codec. This is the correct
ontological description:

- A number = a generator VM
- A base = a decoder for that VM
- A digit = a symbol in that decoder's alphabet

This is the same relationship as a probability distribution to an arithmetic coder, a message to a bitstream, a model to
a codebook. Base is a codec. The number is the generator. The digits are the encoded tape.

Arithmetic coding always produces an infinite binary expansion representing a real number in `[0, 1]` — the limit of
nested intervals. This is not a bug. It is the definition of arithmetic coding. Choosing a base implicitly introduces ℝ,
because arithmetic coding is a mapping from symbolic processes to real intervals.

But in this model, ℝ is not the ontology. ℝ is one possible projection of the generator. The generator is the real
object. The real number is the encoding. Changing base is changing coordinate charts on generator space — the underlying
object does not change, only the representation does.

Any infinite binary stream can be interpreted as a real in `[0, 1]` and mapped to any arbitrary interval `[a, b]` via an
affine wrapper VM. So any random program that implements a digit stream is a valid number anywhere on any interval — not
because of a special construction, but because the affine combinator is just another VM transformer.

---

## BBP Formulas Explained: Automaton Periodicity as Fast-Forward

The Bailey-Borwein-Plouffe formula for π in base 16 allows computing the n-th hexadecimal digit of π without computing
the preceding digits. This has been known since 1995. The mechanism — the algebraic structure of the underlying series
and its alignment with the base-16 representation — has been understood in the prior literature, and the framing here is
a **reformulation rather than a discovery**.

What the generator-VM model contributes is a _first-class library primitive_ that lifts this phenomenon out of one-off
optimizations and into the ABI:

**A BBP-type formula corresponds to the generator automaton admitting an O(log n) fast-forward under the chosen codec —
in the cleanest cases, a periodic orbit; more generally, a sub-automaton whose n-th state is reachable by repeated
squaring (modular exponentiation) rather than by stepping through all n predecessors.**

The honest form of the claim is a correspondence, not a strict equivalence: the existence of a known BBP-type extraction
formula is what licenses installing a `skip` opcode, and that opcode is implemented by the modular-exponentiation
structure underlying the formula. Calling this "a periodic orbit" is exact only in the genuinely periodic cases
(rationals, periodic p-adics); for π in base 16 the precise mechanism is the repeated-squaring fast-forward of a partial
sum modulo a moving denominator. We use "periodicity" below as a convenient shorthand for this broader fast-forwardable
structure, and flag here that the shorthand overstates the symmetry in the transcendental case.

In base 16, the π-generator VM has a periodic sub-automaton. The codec (base 16) aligns with that periodic structure,
exposing a fast-forward opcode: you can jump ahead in the automaton's state in O(log n) time — via repeated squaring of
the relevant modular quantities — rather than stepping through all n digits. (Strictly, this is the fast-forwardable
structure described above, of which a true finite periodic orbit is the special case.)

In base 10, the same automaton has no such periodic orbit under that codec. No fast-forward is possible.
(More carefully: no such O(log n) fast-forward is _known_; the absence of a base-10 BBP formula for π is an empirical
and conjectural state of affairs, not a proven impossibility.)

This is not a property of π. It is a property of the π-generator under a specific projection. The base is a lens on the
automaton's structure. Some lenses expose periodicity; others do not.

This explanation unifies all base-dependent digit-extraction formulas:

- BBP for π in base 16
- BBP for log(2) in base 2
- BBP for polylogarithms in various bases
- Certain p-adic expansions
- Certain Mahler-function expansions

They all arise from the same mechanism: a hidden periodicity in the generator's state machine that becomes visible only
under certain projections.

The skip-ahead primitive this implies is a natural addition to the nano-VM ABI:

```
skip(n, state) → state'
```

Available only when the automaton has a periodic orbit under the current codec. This is the computational form of a BBP
formula. The skip function cannot be synthesized automatically — it requires per-constant manual derivation — but once
written, it becomes a first-class operation that LLVM optimizes alongside the rest of the generator graph. JIT-friendly,
statically dispatchable, and uniformly callable across the entire library.

---

## Memory as the Right Complexity Metric

Runtime is elastic — you can trade time for algorithms, parallelize, precompute. Memory (state size) is structural. It
is tied to the Kolmogorov complexity of the number and to the order and dimension of the recurrence or automaton.

In the nano-VM model, the memory cost of a number is the size of its VM state — specifically, the number of independent
fields and the bit-width required for each.

This gives a clean, implementation-level notion of numerical complexity. The hierarchy below is presented as a **working
conjecture grounded in observed minimal-recurrence orders**, not as proven lower bounds. Proving that π _requires_ at
least four coupled accumulators (rather than admitting some unknown three-register representation) is an open problem;
the table reflects the structure of known optimal generators, not theorems about minimum state.

**Rationals** require constant state. The VM cycles through a finite period. One phase variable, one fixed payload. The
struct size does not grow as you emit more digits.

**Quadratic irrationals** (√2, φ, √3) require two coupled registers — a second-order recurrence. The field count is
fixed; the bit-width grows as O(log n) for the n-th digit. These are algebraic of degree 2, and the generator reflects
that exactly. (Note that the `AutomatonVM` struct over-provisions with `state[4]` so that a single fixed layout covers
algebraic numbers up to degree 4; the _logical_ register count for a degree-d algebraic number is d, even though the
_physical_ struct reserves a uniform four-word slot. The complexity metric below counts logical, minimal registers, not
the padded struct width.)

**Transcendentals** (π, e, log(2), ζ(3)) require more coupled accumulators, error-control state, and index tracking.
Still O(log n) bit-width growth, but with a strictly richer invariant structure — more fields, more intertwined
dependencies. These are one structural tier above quadratic irrationals.

**Higher transcendentals** (polylogarithms, special values of L-functions, elliptic integrals, modular forms) require
progressively more coupled registers and higher-order recurrences. Each tier adds genuine structural complexity to the
generator state.

**Algorithmically inaccessible numbers** require state that grows with the number of digits emitted — O(n) for n digits.
No finite automaton suffices.

| Class                     | Minimal VM State Dimension | Memory Growth | Examples                 |
| ------------------------- | -------------------------- | ------------- | ------------------------ |
| Rationals                 | 1                          | constant      | 1/7, 3/8                 |
| Quadratic irrationals     | 2                          | O(log n)      | √2, φ                    |
| Classical transcendentals | 3–4                        | O(log n)      | π, e                     |
| Higher transcendentals    | 4–6+                       | O(log n)      | ζ(3), polylogs           |
| Inaccessible generators   | unbounded                  | O(n)          | encrypted/random streams |

π and e are not just "more complicated" than √2 in some informal sense. They appear to be the first two members of an
ascending sequence of irreducible generator-complexity classes, each requiring genuinely more state to maintain
correctness over an unbounded digit stream. Whether the sequence is strictly ascending in a provable sense is a question
for computable analysis complexity theory; the architecture is committed to making the question well-posed and
instrumentable, not to settling it.
A subtlety worth flagging, since it connects to the companion essays: the state-dimension figures above are claims about
the _minimal_ generator for a constant, not about any particular generator one might choose to run. The x + sin(x) cubic
engine for π analyzed in the companion PI_RCC essay, for instance, carries more live state than the 3–4 register figure
— it maintains a growing rational seed plus Taylor-truncation accumulators — yet it computes the same π. This is not a
contradiction: a constant's complexity class is the infimum of state dimension over all correct generators, and a
deliberately non-minimal engine (chosen for its cubic outer convergence rather than for state economy) sits above that
infimum. The table tracks the floor; specific engines sit on or above it.

---

## Randomness as Encrypted Determinism

In this ontology, randomness does not exist as a fundamental phenomenon. Every number is a deterministic generator VM.
The step function is deterministic. The digit stream is fully determined by the initial state.

What people call "random" is a number whose generator is **inaccessible** — not absent, not large, but hidden.

A random number is an encrypted number. The generator exists. The encryptor has it. But it cannot be derived from the
output. This is theoretically attacked with infinite compute — brute-forcing the key — but that is as close as we get.

This framing unifies several phenomena that are usually treated as distinct:

**Cryptographically hidden generators**: AES-CTR output, ChaCha20 streams, hash-based PRNGs. The generator is small and
elegant. The key is small and secret. The output looks random because the mapping from generator to output is one-way.
The generator is inaccessible in practice, not in principle.

**Algorithmically inaccessible generators**: Chaitin Ω, Martin-Löf random reals. The generator exists — every real
number has a shortest program that generates it — but the generator is provably uncomputable. It cannot be derived by
any algorithm, even with infinite compute. This is inaccessibility in principle, not just in practice.

From the perspective of an observer reading the digit stream, these two classes look identical. They differ only in
_why_ the generator is inaccessible, not in how the output behaves. Cryptography is the engineered, intentional version
of the general phenomenon of generator inaccessibility.

The real axis of classification is **generator accessibility**:

- **Accessible**: the generator can be derived from the number (rationals, algebraic irrationals, classical
  transcendentals with known recurrences)
- **Cryptographically inaccessible**: the generator exists and is small, but is hidden by a one-way function
- **Computably inaccessible**: the generator exists but is provably uncomputable

All three classes are deterministic from the engineering standpoint. None of them invoke metaphysical randomness in the
library's operation. The distinction between them is epistemic, not ontological.

A philosophical caveat is in order: the claim "randomness is encrypted determinism" is a working stance, not a settled
theorem. It conflates engineered hiddenness (cryptographic) with in-principle inaccessibility (Chaitin Ω) and with the
standard philosophical category of randomness, and it presupposes a particular position in the philosophy of
mathematics. The library does not require this metaphysical commitment to function — it requires only that every input
it accepts implements the step interface, and the framing is offered as a useful organizing principle rather than a
proof. Every number the library can ingest has, operationally, a seed; the question of whether there exist numbers
without seeds is left to philosophy.

---

## A Random Program Is a Valid Number

In this ontology, a random program is a perfectly valid number — not metaphorically, but literally.

Any program that has a finite state representation, implements `step(state) → (digit, next_state)`, and does not halt,
is a number. Even if it is chaotic. Even if it is incompressible. Even if it is algorithmically random.

Such a program corresponds to a random infinite binary expansion, which is a real number in `[0, 1]` — with probability
1 transcendental, with probability 1 normal, with probability 1 uncomputable. Via an affine wrapper VM, it is a valid
number anywhere on any interval.

This collapses the operational distinction between program and number. In this model:

- Numbers are programs (operationally)
- Programs are numbers (operationally)
- The difference is only in how you interpret the generator

The space of numbers, as the library exposes it, is the space of all possible infinite computations. This is the most
general possible _operational_ number ontology — a strict superset of all existing computational frameworks. Whether it
is a complete ontology of numbers _qua_ mathematical objects is a separate question; the library does not require an
answer.

---

## On Equality, Identity, and the Limits of the Substrate

A foundational caveat, presented honestly because the architecture's value depends on its users understanding it.
There is a Futurama line that captures the situation with uncomfortable precision. Professor Farnsworth, having
"translated" an alien message, announces: _"Of course we can translate it — but only into Betacrypt-3… a language so
complex, there is even less chance of understanding it."_ The joke lands because the translation technically succeeds —
it just maps the problem into a representation where the operations people actually cared about have become harder, not
easier. This is, structurally, exactly the move Numbers as Machines makes. We "translate" every number into a
generator-VM that emits an infinite digit stream, gaining uniformity, composability, and exactness. The bill for that
translation comes due precisely here: the very act of representing a number as a non-halting machine is what makes "is
this equal?" and "which is bigger?" non-primitive, partial, or outright undecidable. We did not make the substrate too
complex out of carelessness — the translation preserves computability by discarding cheap equality. Betacrypt-3, but the
trade is honest and the dialect is at least the same one everywhere.

The natural equivalence relation on generator VMs is extensional: two VMs are equal iff they produce identical digit
streams on every query. This relation is **not computably decidable** — it is the canonical example of an undecidable
semantic property of programs (Rice's theorem). The library therefore cannot ship an `equals(x, y)` operation that
returns `true` or `false` in finite time for arbitrary inputs.

What it ships instead is a family of **interval-based and bounded-precision predicates**:

```c
bool definitely_less_than(VM x, VM y);          // true / false / pending
bool agrees_with(VM x, VM y, int digits);       // exact for a finite prefix
Trit compare(VM x, VM y, int max_digits);       // Less | Greater | Indistinguishable
```

These are the honest computational counterparts of equality and ordering on the reals. The library exposes them by name
and does not pretend exact equality is a decidable operation. This is forced by mathematics, not by implementation
laziness — and it is the same constraint every exact real arithmetic system operates under.

The same undecidability has a deeper consequence: the abstract equivalence class that a VM "represents" cannot in
general be characterized except _through_ generators like the VM itself. The library treats this as a non-issue at the
engineering level — it is a theory of digit-emitting machines and the operations between them, not a metaphysical theory
of what numbers ultimately are. The MUX/codec/skip/fork machinery works regardless of whether one is a Platonist, a
constructivist, or a structuralist. That ontological neutrality is a feature: the library serves users across the
philosophical spectrum without forcing any of them into a corner.

---

## The User-Facing API

A substrate is not a library. The ABI is the foundation, but users interact with a stratified API that hides the
substrate where appropriate and exposes it where necessary.

```python
# Precision context — establishes target accuracy for a region of code
with precision_context(digits=50):
    result = sin(pi / 4) + sqrt(2)

# Explicit comparison — interval-honest, never lies about decidability
x.agrees_with(y, digits=20)  # bool
x.definitely_less_than(y)  # True | False | Unknown

# Explicit memoization policy — no hidden caches
x = sqrt(2).cached(max_digits=1000)
x = pi.streaming()  # O(1) space, sequential only

# Forking with honest cost annotation
x1, x2 = pi.fork()  # O(log n) for series-tier VMs

# Skip-ahead when available
digit_billion = pi.in_base(16).skip(10 ** 9).next_digit()
```

Three layers:

1. **Primitive layer** — the raw `NumVMFn` ABI, used by combinator authors
2. **Combinator layer** — arithmetic, comparison, codec, memoization wrappers
3. **User layer** — operator overloading, precision contexts, ergonomic constructors

Most users never see the primitive layer. The combinator layer is the contract; the user layer is the convenience.
Adoption requires that the user layer feel natural to anyone who has used `mpmath`, `MPFR`, or `Decimal`.

---

## Implementation Roadmap

The architecture admits a staged build, with each phase delivering value and informing the next.

**Phase 1 — Automaton tier (high confidence).** Rationals, quadratic irrationals, p-adic numbers, base-conversion
codecs, matrix-exponentiation skip-ahead. The struct-copy fork story is exact. LLVM inlines across the whole graph. This
phase ships a working library for the entire algebraic and p-adic universe.

**Phase 2 — Series tier (research-grade).** Classical transcendentals with built-in tail bound oracles. Signed-digit
internal arithmetic for carry locality. Bounded LRU memoization. Interval-based comparison. This phase requires
per-constant convergence proofs and careful engineering of the deep-copy fork path.

**Phase 3 — User-facing API (required for adoption).** Operator overloading, precision contexts, explicit memoization
modes, honest comparison predicates. Documentation that makes the tier distinction visible to users who care and
invisible to users who don't.

**Phase 4 — JIT compilation path.** Expression-tree compilation for runtime-constructed formulas. Struct-of-arrays
layout for vector and matrix operations. Batched digit computation API for SIMD.

Each phase is independently useful. The full system is the union, but no phase is wasted if a later one is delayed.

---

## What This Is

This is not a numerics library in the conventional sense. It is a **coinductive computational substrate for numbers** —
a system in which:

- Numbers are forkable, deterministic nano-VMs, split honestly into automaton and series tiers
- Arithmetic is VM composition over a signed-digit internal alphabet
- Bases are codecs, not mathematical constants
- Metrics are product VMs
- p-adics are periodic automata with local digit commitment
- BBP formulas are automaton-codec resonances exposed as a first-class `skip` primitive
- Randomness is operationally indistinguishable from inaccessible determinism
- Memory complexity is generator state dimension, a proposed numerical complexity metric
- Comparison is interval-honest, not falsely exact
- The real line is the space of digit-generating computations under a chosen codec

LLVM is the execution engine for statically-known graphs; JIT compilation handles dynamic ones. The ABI is a two-tier
struct plus a step function. Forking is a struct copy for the automaton tier and an explicit deep copy for the series
tier. Inlining, specialization, and optimization are LLVM's responsibility wherever possible.

The result is a system where every mathematical object — from a simple rational to a transcendental constant to an
encrypted stream to an algorithmically random real — is represented uniformly as a tiny machine with the same interface,
composable with every other machine, projectable into any coordinate system, and executable at native speed.

The genuine novelty is the **unified protocol**: rationals, algebraic numbers, p-adic numbers, and transcendentals all
compose through the same interface, rather than living in separate libraries with incompatible representations. Combined
with the codec/base separation and the first-class skip primitive, this is a real advance over existing systems (MPFR,
iRRAM, mpmath) even where it builds on their mathematical foundations.

Alpha to omega: from mathematical definitions to compiled digit streams, with the approximations made explicit, the
costs made honest, and the limits made visible.
