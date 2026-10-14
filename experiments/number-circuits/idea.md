# Number Circuits

## 1. Core Idea

Every positive integer can be written as an expression tree (a "circuit") built from:

- the single **atom** `1`
- the binary operator `+` (addition)
- the binary operator `*` (multiplication)
- parentheses to make the order of operations explicit

No other constants, operators, or functions are allowed. Subtraction, division, exponentiation and digit concatenation are excluded.

Every positive integer `n` has at least one such representation, `1 + 1 + ... + 1` (n times), and most have many.

### Examples for 6

| Expression                        | Cost (number of 1s) |
|-----------------------------------|---------------------|
| `1+1+1+1+1+1`                     | 6                   |
| `(1+1) * (1+1+1)`                 | 5                   |
| `((1+1) * (1+1)) + (1+1)`         | 6                   |
| `(1+1) * (1+1) * (1+1)`           | 6                   |
| `((1+1+1) * (1+1)) * 1`           | 6                   |

The minimal cost for 6 is **5**, reached by `(1+1) * (1+1+1)`.

## 2. Definitions

- **Atom**: one occurrence of the literal `1`.
- **Circuit / Tree**: a binary tree whose leaves are atoms and whose internal nodes are `+` or `*`.
- **Value**: the integer obtained by evaluating the tree.
- **Cost**: the number of atoms (leaves) in the tree. Operators and parentheses are free.
  (Alternative cost models, such as counting operators or tree depth, can be added later; see section 9.)
- **Minimal cost** `C(n)`: the smallest cost of any tree whose value is `n`.
  This is known as the *integer complexity* of `n` (OEIS **A005245**).
- **Minimal representation**: any tree with value `n` and cost `C(n)`.

### Known reference values (for testing)

| n    | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |
|------|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|----|----|----|----|----|
| C(n) | 1 | 2 | 3 | 4 | 5 | 5 | 6 | 6 | 6 | 7  | 8  | 7  | 8  | 8  | 8  | 8  | 9  | 8  | 9  | 9  |

### Known bounds

- Lower bound: `C(n) >= 3 * log3(n)` (products of `(1+1+1)` are the most efficient way to grow).
- Upper bound: `C(n) <= 3 * log2(n)` for `n > 1`.
- The largest value reachable with cost `k` is approximately `3^(k/3)`
  (exactly: `3^m`, `4 * 3^(m-1)`, or `2 * 3^m` depending on `k mod 3`).

These bounds are useful for pruning and for sizing the search.

## 3. Goal

Build a **minimal circuit aggregator** that:

1. Brute-forces tree representations, organized by cost.
2. Indexes every discovered tree by the pair **(value, cost)**.
3. Exposes **projections** of that dataset, the most important being
   "for each value, the minimal cost and the trees that achieve it".

Then build an **in-browser calculator and browser** on top of it, written in plain HTML and modular ES6 (no build step, no framework).

## 4. Aggregation Algorithm

### 4.1 Dynamic programming by cost

Trees of cost `k` are formed by combining a tree of cost `a` with a tree of cost `k - a`:

    T(1) = { 1 }
    T(k) = { (x + y), (x * y) : x in T(a), y in T(k - a), 1 <= a <= k - 1 }

Build the levels in increasing `k`. Each level depends only on lower levels, so the search can be stopped at any cost limit `K` and resumed later.

### 4.2 Two storage modes

The number of distinct trees grows roughly exponentially (Catalan numbers times `2^(k-1)`), so the aggregator supports two modes:

- **Value mode (default, fast)**: for each cost `k`, store only the *set of values* reachable at cost `k`, plus one or more back-pointers `(op, a, leftValue, rightValue)` describing how each value was reached. Trees are reconstructed on demand. This is sufficient for computing `C(n)` and enumerating minimal representations.
- **Tree mode (exhaustive, slow)**: materialize every canonical tree per `(value, cost)`. Only feasible for small `K` (roughly `K <= 12`), but useful for exploring and counting all representations.

Counting the number of trees per `(value, cost)` can be done in value mode without materializing trees, by summing counts over back-pointers.

### 4.3 Canonicalization and de-duplication

Many trees differ only trivially. To avoid redundant work and clutter:

- **Commutativity**: `x + y` and `y + x` are the same; only generate with `a <= k - a`, and when `a == k - a`, require `leftValue <= rightValue`.
- **Associativity**: `(x + y) + z` and `x + (y + z)` are the same. The canonical form flattens chains of the same operator into n-ary nodes and sorts children (e.g. by value, then by canonical string).
- **Identity waste**: `x * 1` has the same value as `x` but higher cost; such trees are never minimal. They are pruned by default, with a toggle to include them for completeness.

Two trees are considered the same representation if and only if their canonical strings are equal.

### 4.4 Pruning

- **Value cap** `N`: ignore values greater than `N` when only interested in `1..N`.
  Safe because `+` and `*` on positive integers never decrease a value.
- **Dominance**: in minimal-only mode, a value found at cost `k` does not need to be expanded again from any higher cost level.
- **Cost limit** `K`: choose `K` from the upper bound `3 * log2(N)` so that every `n <= N` is guaranteed to have its minimal cost found.

### 4.5 Alternative: direct recurrence for C(n)

For the minimal-cost projection alone there is a classic recurrence:

    C(1) = 1
    C(n) = min( min over a + b = n of C(a) + C(b),
                min over a * b = n, a, b > 1 of C(a) + C(b) )

This is used as an independent cross-check of the aggregator's output.

## 5. Data Model

    Entry {
      value: number          // evaluated result
      cost: number           // atom count
      count: number          // number of canonical trees with this (value, cost)
      derivations: [         // how to build it from smaller entries
        { op: '+' | '*', left: [value, cost], right: [value, cost] }
      ]
    }

The store is indexed in two ways:

- `byValue: Map<value, Map<cost, Entry>>`
- `byCost:  Map<cost,  Map<value, Entry>>`

## 6. Projections

Projections are read-only views over the store:

- **Minimal cost table**: `n -> C(n)`.
- **Minimal representations**: `n -> all canonical trees of cost C(n)`.
- **Cost spectrum of a value**: `n -> { cost -> count }`, showing how many representations exist at each cost.
- **Values at a cost**: `k -> sorted list of values reachable with exactly k atoms`.
- **Records / interesting numbers**:
  - smallest `n` with `C(n) = k` for each `k` (OEIS A005520),
  - largest `n` with `C(n) = k` (OEIS A000792),
  - numbers whose minimal representation requires `+` at the top level versus `*`.
- **Export**: download any projection as JSON or CSV.

## 7. User Interface

A single `index.html` page with two main panels.

### 7.1 Calculator

- Text input accepting expressions over `1`, `+`, `*`, `(`, `)` and whitespace.
- Live output:
  - parse errors with position highlighting,
  - evaluated value,
  - cost (atom count),
  - canonical form,
  - whether the expression is minimal for its value, and if not, the minimal cost and an example minimal expression,
  - a rendered tree diagram (nested HTML or SVG).
- Reverse mode: type an integer `n` and get its minimal representations.

### 7.2 Browser

- Controls for value cap `N`, cost limit `K`, storage mode, and the pruning toggles.
- "Run" / "Stop" buttons with a progress indicator (current cost level, number of values found).
- A paginated, sortable table: `n | C(n) | #minimal reps | example representation`.
- Clicking a row opens a detail view showing all minimal trees and the full cost spectrum for that value.
- A small chart of `C(n)` versus `n`, overlaid with the `3 * log3(n)` and `3 * log2(n)` bounds.

### 7.3 Responsiveness

The aggregation runs in a **Web Worker** so the UI never blocks. The worker posts progress after each cost level, and results are streamed into the browser table incrementally.

## 8. Module Layout

    experiments/number-circuits/
      idea.md
      index.html
      styles.css
      src/
        main.js                   // wires up UI panels
        expr/
          ast.js                  // node types: Atom, Add, Mul; evaluate(), cost()
          parser.js               // string -> AST (recursive descent, * binds tighter than +)
          printer.js              // AST -> string with minimal or full parentheses
          canonical.js            // flattening, sorting, canonical string
        engine/
          aggregator.js           // DP over cost levels, value/tree modes
          store.js                // (value, cost) indices
          projections.js          // minimal table, spectrum, records
          recurrence.js           // direct C(n) recurrence for cross-checking
          reconstruct.js          // build trees from derivation back-pointers
        workers/
          aggregator.worker.js    // runs aggregator, posts progress messages
        ui/
          calculator.js
          browser.js
          tree-view.js            // render AST as nested HTML / SVG
          chart.js
      tests/
        index.html                // in-browser test runner
        parser.test.js
        canonical.test.js
        aggregator.test.js        // compare against A005245 reference values

All modules use native ES module `import` / `export` and are loaded with `<script type="module">`. The page must be served over HTTP (e.g. `python -m http.server`) because module scripts do not load from `file://`.

## 9. Possible Extensions

- Alternative cost models: count operators, count `+` only, tree depth, or weighted cost.
- Additional atoms, such as allowing `2` or `3` as primitives.
- Additional operators, such as `-` or `^`, compared against the base system.
- Shared sub-circuits (DAGs instead of trees), where reused subexpressions are counted once. This is closer to real arithmetic circuits and gives different minimal costs.
- Persisting computed results in IndexedDB so large runs survive page reloads.

## 10. Milestones

1. Parser, evaluator, cost and printer, with the calculator panel working.
2. Value-mode aggregator plus minimal-cost projection, verified against the A005245 values.
3. Browser panel with table and detail view.
4. Web Worker integration and progress reporting.
5. Tree mode, counting, canonicalization toggles.
6. Charts, records, export, and extensions.