# Implementation Plan: Honest Password Entropy (MDL & Adversarial Modeling)

## 1. Overview & Architectural Goals

This project implements an information-theoretic password strength evaluator and interactive laboratory based on **Minimum Description Length (MDL)** and **Kerckhoffs's Principle**. 

The codebase is built with **zero-build Vanilla HTML5, CSS3, and Modular ES6 (`type="module"`)** and is structured around three cleanly decoupled layers:
1. **Core MDL Engine (`src/engine/`)**: Pure, dependency-free ES6 modules that build a directed acyclic multigraph (lattice) over password substrings, evaluate generator and transducer bit-costs, find the $K$-best derivations via dynamic programming, and compute counterfactual sensitivity gradients.
2. **Reusable Password Entry Web Component (`src/component/`)**: A self-contained Custom Element (`<honest-password-input>`) that can be dropped into any standard HTML form to provide real-time Honest vs. Naive entropy metering, inline token segmentation, and actionable feedback.
3. **Interactive Adversarial Lab (`index.html` + `src/lab/`)**: A comprehensive educational and analytical workbench that exposes the full parse tree, stacked transducers, transition bit-costs, attacker knowledge toggles, personal context sandbox, and competing hypotheses explorer.

---

## 2. Directory & Module Structure

```text
experiments/password-entropy/
├── index.html                        # Interactive Adversarial Lab & Component Demo
├── styles/
│   ├── main.css                      # Lab layout, typography, theme variables, animations
│   └── ribbon.css                    # Shared styles for parse-tree ribbons & stacked pills
└── src/
     ├── main.js                       # Lab bootstrap, state management, and event wiring
     ├── data/
     │   ├── dictionary.js             # Top English words + leaked password tokens with Zipf ranks
     │   ├── keyboards.js              # Spatial adjacency graphs for QWERTY, Dvorak, Numpad
     │   ├── char-frequencies.js       # Unigram & bigram character probabilities + charset tables
     │   └── l33t-table.js             # Probabilistic character substitution tables
     ├── engine/
     │   ├── coding.js                 # Universal integer encodings (Elias gamma/delta), log2 helpers
     │   ├── transitions.js            # Markov transition matrix P(m_i | m_{i-1}) between modules
     │   ├── solver.js                 # K-Best Viterbi / DAG shortest-path lattice solver
     │   ├── counterfactuals.js        # Perturbation analyzer for high-entropy edit suggestions
     │   ├── naive.js                  # Traditional Shannon / NIST / pool-based entropy calculator
     │   └── generators/
     │       ├── index.js              # Generator registry and configuration filter
     │       ├── charset.js            # m_unif and m_freq character-level fallback generators
     │       ├── dictionary.js         # m_dict-u and m_dict-f lexical matchers
     │       ├── keyboard.js           # m_walk spatial walk detector (start, direction, turns, len)
     │       ├── patterns.js           # m_rep (repeats), m_seq (ASCII/numeric/date sequences)
     │       ├── pii.js                # m_pii contextual matcher (name, username, birth year, etc.)
     │       └── transducers.js        # Composable layers: T_case (modifiers), T_sub (l33t), T_edit (fuzzy)
     ├── component/
     │   └── honest-password-input.js  # Reusable <honest-password-input> Web Component
     └── lab/
         ├── state.js                  # Reactive store for password, PII context, and attacker toggles
         ├── ledger-view.js            # Dual-bar Entropy Ledger & "Human Predictability Tax" meter
         ├── ribbon-view.js            # Interactive Parse Tree & Multi-Layer Stacked Segmentation Ribbon
         ├── attacker-panel.js         # Personal Context Sandbox & Adversary Sophistication Toggles
         ├── hypotheses-view.js        # K-Best Competing Hypotheses Explorer with hover preview
         └── advisor-view.js           # Actionable Counterfactual Feedback & Preset Selector
```

---

## 3. Core Mathematical & Algorithmic Engine (`src/engine/`)

### 3.1. Universal Coding & Primitives (`coding.js`)
* **`eliasGammaCost(n)`**: Computes $L_{\mathbb{N}}(n) = 2 \lfloor \log_2(n) \rfloor + 1$ for encoding positive integers (run lengths, edit counts, repeat counts) without arbitrary magic penalties.
* **`shannonCost(prob)`**: Computes $-\log_2(\max(p, \epsilon))$ safely.
* **`combinationCost(n, k)`**: Computes $\log_2 \binom{n}{k}$ for positional subset selection (used when encoding which characters in a word are capitalized, substituted, or edited).

### 3.2. Candidate Span Generation & Transducer Composition (`generators/`)
Given a password $S$ of length $N$ and active attacker capabilities $\mathcal{M}_{\text{active}}$, the engine evaluates all spans $S[i..j]$ ($0 \le i < j \le N$):

1. **Base Generators**:
    * **Character Generators (`charset.js`)**:
      * $m_{\text{unif}}$: Detects minimal active character pool $|C| \in \{10, 26, 36, 52, 62, 95\}$ or per-token class, costing $(j - i) \log_2 |C|$.
      * $m_{\text{freq}}$: Sums $-\log_2 P_{\text{corpus}}(c)$ over the span using English/password unigram and bigram frequencies.
    * **Lexical Generators (`dictionary.js`)**:
      * Matches lowercase normalized spans against a curated frequency-ranked dictionary (~10,000 common English words, names, and top leaked password roots).
      * $m_{\text{dict-u}}$: Flat cost $\log_2 |D|$.
      * $m_{\text{dict-f}}$: Zipfian probability $P(r) = \frac{1 / (r + r_0)^\alpha}{\sum 1 / (k + r_0)^\alpha}$, yielding ~6–9 bits for very common words (`password`, `love`, `dragon`) and ~13–15 bits for rarer words.
    * **Keyboard Spatial Walks (`keyboard.js`)**:
      * Represents QWERTY, Dvorak, and Numpad layouts as coordinate graphs where each key has up to 8 directional neighbors.
      * Identifies contiguous spatial paths of length $\ge 3$:
        $$\text{Cost} = \log_2 |V| + k_{\text{turns}} \cdot \log_2(\text{deg}(v)) + L_{\mathbb{N}}(\text{length})$$
      * Captures straight runs (`qwerty`, `12345`), vertical/diagonal columns (`zaq1`, `1qaz2wsx`), and shifted walks (`!@#$%`).
    * **Pattern Generators (`patterns.js`)**:
      * **Repetition ($m_{\text{rep}}$)**: Detects character runs (`aaaa`) or repeated preceding tokens (`abcabc`). Cost is reference index + $L_{\mathbb{N}}(\text{count})$.
      * **Sequences ($m_{\text{seq}}$)**: Detects arithmetic progressions in ASCII codepoints (`abcd`, `9876`, `2468`) as well as calendar/date patterns (`1990`–`2029`, `MMDD`, month/day names).
    * **Personal Information Priors (`pii.js`)**:
      * Dynamically builds a high-priority micro-dictionary from user-supplied fields (Full Name, Username, Birthdate parts, Pet/Partner Name, Previous Password).
      * Assigns high prior probability ($2.5\text{–}4.5\text{ bits}$ per token).

2. **Relational & Mutation Transducers (`transducers.js`)**:
    * Rather than treating `P@ssw0rd` or `correct_h0rse` as random symbols, candidate spans are passed through composable inverse transducers before querying Dictionary and PII generators:
      * **Case Modifier Layer ($T_{\text{case}}$)**:
        * All-lowercase ($0.2\text{ bits}$), Title Case ($1.5\text{ bits}$), ALL CAPS ($1.8\text{ bits}$), End-Capitalized ($2.5\text{ bits}$), or Arbitrary Mask ($\log_2 \binom{L}{k} + L_{\mathbb{N}}(k)$).
      * **L33t Substitution Layer ($T_{\text{sub}}$)**:
        * Maps characters like `@->a, 4->a, 0->o, 3->e, 1->i/l, $->s, !->i, 7->t`.
        * Computes exact bit cost: $\sum_{pos} -\log_2 P_{\text{sub}}(s'_{pos} \mid s_{pos})$.
      * **Edit / Hamming Distance Layer ($T_{\text{edit}}$)**:
        * Computes Damerau-Levenshtein distance $d \le 2$ against PII tokens (especially Previous Password) and top dictionary words.
        * Cost: $L_{\mathbb{N}}(d) + d \cdot (\log_2(\text{op}) + \log_2 |s| + \log_2 |\Sigma|)$.
    * Each multi-layer candidate stores an ordered `layers` array:
      `[{ type: 'base', ... }, { type: 'case', ... }, { type: 'l33t', ... }, { type: 'edit', ... }]`
      so the UI can render the exact vertical stack under the password segment.

### 3.3. Markov Transition Matrix (`transitions.js`)
* Defines $P(m_i \mid m_{i-1})$ including `START` and `END` states.
* Reflects empirical human password grammar:
   * `START -> Dictionary` or `START -> PII`: High probability (~1.2 bits).
   * `Dictionary -> Digits/Sequence` (e.g., `hunter2`, `shadow1999`): Very high probability (~1.0 bit).
   * `Digits -> Symbol` (e.g., trailing `!`): High probability (~1.1 bits).
   * `Random -> Random` (merged) vs. frequent switching between unrelated generators: Penalized by transition bits.

### 3.4. $K$-Best Lattice Solver (`solver.js`)
* Constructs a DAG where vertices are character indices $0 \dots N$ and directed multiedges $(i, j, e)$ represent every valid generator/transducer derivation of $S[i..j]$.
* Uses a generalized **K-Best Viterbi algorithm** (Yen's/trellis top-$K$ dynamic programming) to find:
   1. **Optimal Derivation $\pi^*$**: Minimizes $L(\pi) + L(S \mid \pi)$, yielding Honest Entropy $H^*(S)$.
   2. **Runner-Up Hypotheses ($\pi_2, \pi_3, \dots$)**: Distinct structural parses (e.g., alternative word boundaries, keyboard walk vs. dictionary interpretation, pure frequency model, and pure naive model) to populate the **Competing Hypotheses Explorer**.

### 3.5. Counterfactual Gradient Engine (`counterfactuals.js`)
* Analyzes $\pi^*$ to find the weakest link (lowest bits-per-character segment).
* Evaluates targeted single-character mutations (substituting the middle of a keyboard walk or sequence, breaking a dictionary word or PII match, changing a predictable trailing digit/symbol) and re-runs the solver to find the edit $S \to S'$ that maximizes $\Delta H^* = H^*(S') - H^*(S)$.
* Outputs human-readable causal explanations with exact bit deltas (e.g., *"Segment `1234` costs only 4.1 bits as an ascending sequence. Changing `3` → `8` breaks the sequence and adds +9.4 bits."*).

---

## 4. Reusable Password Entry Component (`src/component/honest-password-input.js`)

A standalone, production-ready Custom Element `<honest-password-input>` built with Web Components APIs:
* **Attributes & Properties**:
   * `value`, `placeholder`, `name`, `required`, `min-bits="50"`
   * `context`: JSON attribute or JS property accepting `{ name, username, birthdate, previousPassword }`
   * `show-ribbon`: Toggles the inline mini parse-ribbon below the input.
* **Events**:
   * Dispatches `entropy-change` CustomEvent with `{ honestBits, naiveBits, taxBits, derivation, recommendation, isStrong }`.
* **Visual Features**:
   * Password input with eye toggle (show/hide), copy button, and dice button (generate high-MDL passphrase/password).
   * Compact dual-layer progress bar (Ghost bar = Naive bits, Solid bar = Honest MDL bits).
   * Color-coded inline token pills showing how the password is segmented in real time.
   * Single-line counterfactual tip underneath.

---

## 5. Interactive Adversarial Lab UI (`index.html` & `src/lab/`)

The main page (`index.html`) presents a dark-mode cryptographic analysis workbench divided into two primary modes/views: the **Interactive Adversarial Lab** and a live **Reusable Component Showcase**.

### 5.1. Curated Preset Bar
One-click chips to load illustrative passwords that demonstrate specific MDL phenomena:
* `P@ssw0rd123!` (Stacked transducers: Dictionary + Case + L33t + Sequence + Trailing Bang)
* `correcthorsebatterystaple` (Multi-word dictionary passphrase — high naive entropy, moderate ~44-bit honest entropy)
* `1qaz2wsx3edc` (2D spatial keyboard column walk)
* `Summer2024! -> Summer2025!` (Demonstrates Edit-Distance collapse against Previous Password in PII)
* `Tr0ub4dor&3` (Classic XKCD example analyzed bit-by-bit)
* `xK9#mP2$vL` (High-entropy genuinely random token)

### 5.2. Primary Input & "The Entropy Ledger" (`ledger-view.js`)
* Large, monospace-aligned password input with character index rulers.
* **Dual-Layered Comparison Meter**:
   * Background ghost bar: **Naive Entropy** ($H_{\text{naive}}$ bits) with crack-time estimate under naive assumptions.
   * Foreground bar: **Honest MDL Entropy** ($H^*(S)$ bits) split visually into **Model Cost $L(\pi)$** and **Data Cost $L(S \mid \pi)$**, plus realistic offline crack-time estimate (e.g., at $10^{10}$ guesses/sec).
   * Highlighted callout badge for **"The Human Predictability Tax"** ($H_{\text{naive}} - H^*(S)$ bits and % compression ratio).

### 5.3. Parse Tree & Multi-Layer Segmentation Ribbon (`ribbon-view.js`)
* Renders directly beneath the input, aligned with the password characters:
   * **Transition Connectors**: Badges between segments showing $-\log_2 P(m_i \mid m_{i-1})$ transition costs.
   * **Color-Coded Segment Columns**:
     * Blue: Lexical / Dictionary ($m_{\text{dict}}$)
     * Amber/Orange: Keyboard Walk ($m_{\text{walk}}$)
     * Cyan/Teal: Sequence / Repetition ($m_{\text{seq}}, m_{\text{rep}}$)
     * Crimson/Pink: Personal Info ($m_{\text{pii}}$)
     * Purple: Transducer Layer ($T_{\text{sub}}, T_{\text{case}}, T_{\text{edit}}$)
     * Emerald Green: Uncompressed Character Entropy ($m_{\text{freq}}, m_{\text{unif}}$)
   * **Vertical Transducer Stacks**: For mutated segments (e.g. `P@ssw0rd`), displays stacked cards from top to bottom:
     1. *Observed Token*: `"P@ssw0rd"`
     2. *Base Generator*: `Dict("password")` — `6.4 bits`
     3. *Case Modifier*: `TitleCase(0)` — `1.5 bits`
     4. *L33t Transducer*: `a→@, o→0` — `3.2 bits`
     5. *Segment Total*: `11.1 bits` (plus transition cost)
   * **Mathematical Ledger Formula**: Shows the exact summation $H^*(S) = \sum (L(m_i \mid m_{i-1}) + L(s_i \mid m_i))$ below the ribbon.

### 5.4. Interactive "Attacker Knowledge" Panel (`attacker-panel.js`)
* **Personal Context Sandbox**:
   * Live inputs for *Name*, *Username*, *Birth Year / Date*, *Pet / Partner*, and *Previous Password*.
   * Editing these immediately recomputes the lattice; e.g., typing `P@ssw0rd122!` into *Previous Password* while testing `P@ssw0rd123!` switches the entire parse tree to a single `EditDistance(d=1)` transducer costing ~7 bits.
* **Adversary Sophistication Toggles (Kerckhoffs Simulator)**:
   * Toggle switches for each module in $\mathcal{M}$:
     * `[x] English & Leaked Password Dictionary (Zipf-weighted)`
     * `[x] Spatial Keyboard Graphs (QWERTY / Dvorak / Numpad)`
     * `[x] L33tspeak & Case Mutation Transducers`
     * `[x] Sequences & Repetitions (1234, abcd, aaaa)`
     * `[x] Personal Information & Fuzzy Edit Distance`
     * `[x] Natural Language Character Frequencies`
   * Displays the live bit delta next to each toggle so users can see exactly how many bits each attacker capability shaves off their password.

### 5.5. Competing Hypotheses Explorer (`hypotheses-view.js`)
* Displays the top 4 distinct derivations $(\pi_1^*, \pi_2, \pi_3, \pi_{\text{naive}})$ ranked by total MDL bit-cost.
* Each row shows its total bits, structural summary pills, and bit-cost breakdown.
* **Interactive Hover / Pin Preview**: Hovering or clicking any runner-up hypothesis temporarily updates the main Segmentation Ribbon and Entropy Ledger to visualize how that alternative model parses the password.

### 5.6. Actionable Counterfactual Feedback (`advisor-view.js`)
* Displays the top 2–3 highest-leverage single-edit counterfactuals computed by `counterfactuals.js`.
* Includes an **"Apply Edit"** button on each recommendation so the user can test the improvement with one click and watch the parse tree fracture into higher-cost blocks.

---

## 6. Implementation Sequence & Verification

1. **Phase 1 — Data & Mathematical Primitives**:
    * Build `coding.js`, `char-frequencies.js`, `keyboards.js`, `l33t-table.js`, and `dictionary.js`.
    * Verify bit-cost helper functions and spatial keyboard neighbor traversal (including shifted keys and multi-turn walks).
2. **Phase 2 — Generators, Transducers & Lattice Solver**:
    * Implement all generator modules in `src/engine/generators/` and the composable transducer pipeline (`T_case`, `T_sub`, `T_edit`).
    * Implement `transitions.js`, `solver.js` ($K$-best DAG pathfinder), `naive.js`, and `counterfactuals.js`.
    * Verify that `P@ssw0rd123!`, `correcthorsebatterystaple`, `1qaz2wsx`, and PII-mutated passwords produce mathematically consistent MDL derivations where segment + transition bits sum to $H^*(S)$.
3. **Phase 3 — Reusable `<honest-password-input>` Web Component**:
    * Build `src/component/honest-password-input.js` with encapsulated styling, live MDL evaluation, mini segmentation ribbon, and form integration.
4. **Phase 4 — Interactive Adversarial Lab UI & Polish**:
    * Build `index.html`, `styles/`, and `src/lab/` views (`ledger-view.js`, `ribbon-view.js`, `attacker-panel.js`, `hypotheses-view.js`, `advisor-view.js`).
    * Wire interactive hover previews, attacker knowledge toggles, personal context sandbox, and preset scenarios.