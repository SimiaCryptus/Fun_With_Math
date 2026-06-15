# Numbers as Machines, Cost, and Continua

A trilogy of companion essays exploring a single question from three angles: **what
is a mathematical constant, computationally?** Each essay answers by treating
numbers not as static values but as _engines_ — generative processes whose structure,
cost, and reachability can be measured precisely.

The three pieces share vocabulary, cross-reference one another, and are best read as
a unit. Together they propose an operational ontology of number in which metaphysics
is replaced by computation, data, and asymptotic analysis.

---

## The Essays

### 1. [RCC — Rational Certificate Complexity](./RCC/README.md)

_The foundational vocabulary._

Defines the **rational certificate engine**: treat every convergence sequence as a
machine that emits a rational approximant, measure the bit-length of that rational as
a function of demanded tolerance ε, and classify constants by the cheapest engine in a
precisely specified class. Establishes:

- The **RC₁ / RC₂ / RC₃ cost classes** (log-optimal, polynomial, super-polynomial).
- The **hypergeometric regularity condition** — the decidable, machine-checkable
  property that makes an engine "natural."
- An information-theoretic lower bound of Θ(log(1/ε)) that pins down what _optimal_
  means.
- The central separation: algebraic irrationals sit in RC₁ via their natural
  hypergeometric engines; the classical hypergeometric engines for π and e pay
  polynomial cost.

This essay supplies the definitions the other two invoke.

### 2. [PI_RCC — The Simplest Increment](./PI_RCC/README.md)

_An engine outside the hypergeometric class that still attains RC₁ cost._

Analyzes the cubic fixed-point iteration `x ↦ x + sin(x)` for π. Its outer recurrence
is **not** hypergeometric (its term ratio in the iteration index is not a rational
function of the index), so it falls outside the class RCC classifies — yet its
composite certificate cost lands in the optimal logarithmic regime. Along the way it
develops:

- **Derivative engineering**: building cubic convergence by forcing the first two
  derivatives of the error map to vanish at the target — a codimension-2 design
  condition, not a numerical accident.
- The **tower of continua**: ℚ → algebraic → analytic → elliptic/modular → periods,
  read as a sequence of **functional recursions**, each a least-fixed-point closure
  over an evaluation map.
- The reframing of the engine as the _smallest mutation_ of the analytic layer that
  produces a new, unclassifiable RCC entry.

Where RCC defines the cost classes, PI_RCC shows their boundary is permeable.

### 3. [NAM — Numbers as Machines](./NAM/README.md)

_A concrete computational substrate where the cost classes reappear as state tiers._

Proposes a generator-based numerics library: **every number is a forkable,
deterministic nano-VM** emitting an infinite digit stream via `step : State → (digit,
State)`. The RCC cost classes resurface here as **generator state-dimension tiers** —
the minimal VM state required to maintain a correct digit stream. Develops:

- The **two-tier ABI**: O(1)-fork automaton VMs (rationals, algebraics, periodic
  p-adics) vs. O(log n)-fork series VMs (transcendentals).
- **Base as codec**: a base is a projection operator on generator space, not a
  property of the number.
- **BBP formulas as automaton-codec resonance**, exposed as a first-class `skip`
  primitive.
- **Randomness as inaccessible determinism**, and an honest, interval-based account of
  the undecidability of equality.

Where RCC measures cost and PI_RCC engineers an engine, NAM builds the machine that
runs them all.

---

## The Shared Thread

| Essay  | Object of study            | What it contributes                                  |
| ------ | -------------------------- | ---------------------------------------------------- |
| RCC    | Convergence engines        | Cost classes, regularity condition, lower bound      |
| PI_RCC | The `x + sin(x)` iteration | A non-hypergeometric RC₁ engine; the continua tower  |
| NAM    | Generator VMs              | An executable substrate; cost classes as state tiers |

A constant, across all three, is the same kind of thing: **a regular convergence
engine together with its cost profile** (RCC), realizable as **a tuned functional
recursion** (PI_RCC), and executable as **a tiny forkable machine** (NAM). The
Prime-Number-Theorem-level denominator bound (`log lcm(1,...,M) ~ M`) recurs in all
three as the load-bearing number-theoretic input.

None of the three claims metaphysical completeness. Each replaces a piece of the
real-number continuum's apparatus with operational precision — a measurable,
falsifiable account of approximation strategies — while honestly flagging the
mathematical commitments that remain.

---

## Suggested Reading Order

1. **RCC** first — it fixes the vocabulary.
2. **PI_RCC** second — it stress-tests the RCC boundary with a concrete engine.
3. **NAM** last — it grounds the whole framework in a buildable system.
