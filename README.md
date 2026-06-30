# ![Mathematical Explorations](og-image.png)

A collection of original interactive mathematical experiments and essays—all running live in your browser with no
installation required. Each lab is a small piece of in-browser mathematical research, not a textbook visualization.

🔗 **Live site:** [math.cognotik.com](https://math.cognotik.com/)

---

## ✨ What Is This?

This is a working laboratory disguised as a website. Most "math visualization" sites animate things you already
know — a Mandelbrot zoom, a Fourier wheel, a prime sieve. Those live here too, as warm-ups. But the heart of the
collection is a set of **original investigations**: questions that were asked, attacked with code and mathematics,
and written up honestly — including where they lead somewhere new and where they cheerfully admit they lead nowhere
useful.

Three ideas recur across nearly everything here, and noticing them turns a grab-bag of demos into a single
conversation:

1. **Geometry as computation.** Numbers, knots, lattices, and tilings are treated as _processes_ — things that run,
   diffuse, optimize, or unfold — rather than static objects.
2. **Optimization as a lens.** Many labs share the same three optimizers (Adam, L-BFGS, and the homegrown **QQN**).
   Watching _how_ a problem is solved often reveals as much as the answer itself.
3. **Honesty about limits.** Several pieces are built around what _cannot_ be decided, computed, or distinguished —
   and treat that boundary as the interesting part, not an embarrassment.

If you read nothing else, read that list again on your way out. It's the through-line.

---

## 🚀 Getting Started

Open `index.html` in any modern web browser, or serve the folder with any static file server:

```bash
npx serve .
# or
python -m http.server
```

Then navigate to the URL shown in your terminal (e.g. `http://localhost:3000` for `serve`, `http://localhost:8000` for
Python).

Everything runs **client-side**. No build step, no server, no account. The heavier labs lean on
[TensorFlow.js](https://www.tensorflow.org/js) (loaded from a CDN) for GPU-accelerated tensors and automatic
differentiation; the rest is plain HTML, CSS, and JavaScript.

---

## 🗺 A Guided Tour

Read this section like a museum walk. You can wander in any order, but the rooms are arranged so each one sets up
the next.

### Room 1 — Warm-Ups: The Classics

Start where everyone starts. The [short demonstrations](#-short-demonstrations) — the **Mandelbrot Set**, the
**Prime Number Sieve**, **Fourier Series**, and the **Collatz Conjecture** — are the familiar faces of recreational
mathematics. They're here to calibrate the eye: simple rules, surprising structure. Each one quietly previews a
theme the deeper labs develop. The Mandelbrot set is iteration that never settles; Fourier series is _building a
shape out of simpler motions_; primes and Collatz are _discrete processes hiding continuous-looking patterns_. Hold
those thoughts.

### Room 2 — When Lattices Stop Behaving

A lattice is the most orderly object in mathematics: a perfect grid, the same in every direction. Three labs ask
what happens when you _break_ that perfection in principled ways.

- **[Irrational Lattice](experiments/irrational_lattice/index.html)** introduces a new primitive: *algebraic colored
  lattice fields*. Instead of adding random noise to a grid (structureless) or leaving it periodic (sterile), it
  deforms each point by a displacement living in a quadratic number field $\mathbb{Q}(\sqrt{D})$, then snaps back to
  the nearest lattice point. The result is **deterministic, provably aperiodic, spectrally tunable** disorder — and
  it's computed with pure integer arithmetic, making it embarrassingly parallel. Visually it conjures the moiré
  ghosts of Penrose tilings, _constrained to a square grid_.

- **[Pentagonal Lattice Geometry](experiments/Pentagon_Lattice_Geometry/index.html)** takes the opposite tack: a
  pentagon _can't_ tile the plane (its angles don't divide 360°), so what if you let it fail upward into a
  **multi-sheeted covering space**? The payoff is genuinely strange: an emergent **fractional dimension** ($d \approx
  2.37$), and **spinor-like holonomy** — loop once around a vertex and you land on a different sheet; you must loop
  _twice_ to come home, exactly like a spin-½ particle needing a 4π rotation. The pentagon turns out to sit at a
  unique algebraic crossroads, tied to the golden ratio's field $\mathbb{Q}(\sqrt{5})$.

- **[Space-Color Symmetry](experiments/symmetry_simple/index.html)** is the gentlest of the three and the most
  hypnotic. You draw on a small pixel canvas while symmetry operations (mirrors, rotations, toroidal wrapping) mirror
  your strokes — standard kaleidoscope fare. The twist: symmetry also **rewires the diffusion graph**, so color
  spreads along the symmetry axes as if the canvas were a quotient manifold. A moment-preserving renormalization keeps
  the colors from washing out to grey, so the pattern swirls forever.

The connecting thread: **the algebraic structure you put in determines the geometry you get out.** Pentagon's
$\mathbb{Q}(\sqrt{5})$ gives fractional dimension; a rational field gives a clean integer lattice; two independent
irrationals refuse to close at all. This is stated most explicitly in the Pentagon lab, but it's the same melody the
Irrational Lattice plays.

### Room 3 — Points That Arrange Themselves

Now we hand the steering wheel to an optimizer and watch points settle into configurations no human placed.

- **[Geometric Entropy](experiments/geometric-entropy/index.html)** is the continuous cousin of the classical Erdős
  distinct-distance problem. Rather than _counting_ distinct pairwise distances, it treats them as a probability
  distribution and **maximizes the Shannon entropy** of that distribution on a manifold — sphere, torus, cube,
  saddle, or any STL mesh you upload. The most "distance-diverse" arrangement emerges. Its most charming (and the
  README's word, "useless") discovery: because the optimum is _degenerate_ — many configurations achieve the same
  $H \approx \ln N$ — the _shape_ you get is a **fingerprint of the optimizer**. Adam leaves noisy lattices, QQN
  leaves smooth symmetric curves, L-BFGS snaps to crystals. You can identify the optimizer from the picture.

- **[Spacelike Knots](experiments/spacelike-knots/index.html)** equips a 3D knot with a **Minkowski metric** — pick
  an axis to call "time" — and reclassifies every pair of points as timelike, spacelike, or lightlike. The over/under
  of a crossing becomes a **causal inversion**. The distance matrix becomes a causal diagram of a tiny relativistic
  spacetime. Physics-based optimization (edge springs + repulsion) keeps the knot from collapsing, and you can rotate
  it to extremize its causal structure.

- **[No-Three-in-Line](experiments/3inline/README.md)** (the *3inline* lab) tackles a hard combinatorial problem —
  place as many points as possible on an $n \times n$ grid so no three are collinear — by **relaxing it into
  continuous space**. Collinearity is penalized by an angle-based energy that diverges as any triple straightens out.
  Gradient descent crystallizes the points back onto the lattice, and a validation pass checks every triple exactly.
  It works in 3D too.

The thread here: **hard discrete problems become tractable when you let them flow continuously**, and **the path
matters** — the optimizer's personality shows up in the answer.

### Room 4 — Life on Top of Life

- **[Layered Cellular Automata](experiments/layered_ca/index.html)** stacks three classic systems into one feedback
  sandwich. **Langton's ants** crawl across a multi-color grid, their turn rules encoded in binary indexed by the
  color beneath them. The trail they paint becomes a **substrate**, and a selectively-activated **Conway's Game of
  Life** evolves only on cells the ants have "activated" — with positive zones that spawn life and negative zones that
  inhibit it. Highways, fractal boundaries, and competing colonies emerge from the interplay of three layers that
  each only know their own rules.

This room is the collection's reminder that **emergence needs no continuous mathematics at all** — just simple
discrete rules in conversation.

### Room 5 — Learning a Shape

- **[Fractal Learning](experiments/fractal_learning/index.html)** runs the Mandelbrot warm-up in reverse. Given a
  target image, it **fits an iterated function system** (the recipe behind ferns and Sierpiński triangles) by
  gradient descent under a Chamfer distance metric. Instead of asking "what does this fractal look like?", it asks
  "what fractal _is_ this?"

This closes the loop opened in Room 1: iteration forward (Mandelbrot) and iteration learned backward (Fractal
Learning).

### Room 6 — The Essays: Foundations

Where the labs play, the [essays](#-essays) think. They're longer, written investigations into how computation and
number meet.

- **[Quadratic Quasi-Newton (QQN)](essays/QQN/index.html)** is the source of that mysterious third optimizer haunting
  half the labs. It interpolates between **gradient descent** (robust, slow) and **L-BFGS** (fast, fragile) by fitting
  a quadratic along the search direction. Having met its _behavior_ in Geometric Entropy's fingerprints, here you meet
  its _theory_.

- **[Rational Certificate Complexity (RCC)](essays/RCC/index.html)** proposes a taxonomy of mathematical constants
  stratified by how _expensive_ it is to certify their digits. Some numbers are cheap to pin down; others demand
  ever-growing work. It's a complexity theory for the constants themselves.

- **[The Simplest Increment: x + sin(x)](essays/PI_RCC/index.html)** is RCC made concrete and delightful: a
  cubic-convergent iteration for π, built from the derivative structure of a single analytic function. Each step
  roughly _triples_ the number of correct digits.

- **[Numbers as Machines (NAM)](essays/NAM/index.html)** is the philosophical keystone. It reimagines every number as
  a **deterministic, forkable virtual machine** that emits an infinite digit stream on demand. A rational, π, $\sqrt
  2$ — each is a tiny program implementing one primitive: `step → (digit, next state)`.

### Room 7 — Numbers You Can Touch

- **[nam — the interactive numbers-as-machines lab](experiments/nam-calculator/README.md)** is the NAM essay made
  playable: a browser calculator (and matching REPL) over the `nam` library, compiled to WebAssembly. Here the
  collection's third theme — **honesty about limits** — becomes a literal contract printed on the screen:

  - Comparison is **tri-state** (`Less | Greater | Indistinguishable`), because equality of infinite streams is
    undecidable — and the lab refuses to fake a definite answer.
  - Forking a number reports its **cost tier** (O(1) for rationals and $\sqrt 2$, O(log n) for series like π and $e$).
  - Changing base is a **codec**, not a new number — the same machine, re-projected.
  - When a digit can't be _proven_, it renders as honest `pending (null)` rather than a fabricated guess.

This room and the NAM essay are the clearest statement of the whole site's ethic: a tool that **never tells you a
comfortable lie**.

### Room 8 — Physics, Honestly Approximate

- **[Relativistic 2-Body Gravity](experiments/gravity/README.md)** simulates two gravitating bodies with finite
  light speed (**retarded interactions**) and tunable relativistic corrections. Because gravity propagates at speed
  $c$, each body feels where the other _was_, not where it _is_ — breaking Newton's third law for the instantaneous
  pair and producing orbital precession and chaos. It openly declares itself a tool for _intuition_, not a GR solver:
  another instance of the site's honesty about what it is and isn't.

### Room 9 — Language as Camouflage

- **[Predictive Markov Wordsearch](experiments/wordsearch/README.md)** ends the tour with pure wit. Ordinary
  wordsearches hide words in _random_ letters — and random noise makes real words pop out. This generator fills the
  grid with letters predicted by a **Markov model** trained on real text, so the background reads like plausible
  language fragments **in all eight directions at once**. The hidden words blend in not because the grid is bigger,
  but because the _noise itself looks like language_. Difficulty by camouflage. A clean little fusion of the
  Fourier-style "build structure from statistics" idea and the multi-directional thinking of the knot and lattice
  labs.

---

## 🧪 Featured Laboratories

Extended interactive studies, each accompanied by documentation describing the underlying mathematics, motivation, and
methods.

| Laboratory                                                                      | Description                                                                                                              |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [Pentagonal Lattice Geometry](experiments/Pentagon_Lattice_Geometry/index.html) | Multi-sheeted covering construction where the pentagon develops fractional dimension (d ≈ 2.37) and spinor-like holonomy |
| [Space-Color Symmetry](experiments/symmetry_simple/index.html)                  | A pixel canvas where symmetry rewires the diffusion graph, producing kaleidoscope dynamics on a quotient-like manifold   |
| [Geometric Entropy](experiments/geometric-entropy/index.html)                   | A continuous analogue of the Erdős distinct-distance problem via Shannon entropy optimization                            |
| [Spacelike Knots](experiments/spacelike-knots/index.html)                       | A knot equipped with a Minkowski metric, turning crossings into causal inversions                                        |
| [Layered Cellular Automata](experiments/layered_ca/index.html)                  | Langton's ants write a colored substrate gating where Conway's Life can live — three feedback layers                     |
| [Fractal Learning](experiments/fractal_learning/index.html)                     | Inverse iterated-function-system fitting via gradient optimization under a Chamfer metric                                |
| [Irrational Lattice](experiments/irrational_lattice/index.html)                 | Deterministic, algebraic "colored noise" for lattices — provably aperiodic, spectrally tunable                           |
| [No-Three-in-Line](experiments/3inline/index.html)                              | Continuous relaxation of a classic combinatorial problem via angle-based collinearity penalties (2D & 3D)                |
| [Relativistic 2-Body Gravity](experiments/gravity/index.html)                   | Retarded, relativistically-corrected two-body orbits exhibiting precession and chaos                                     |
| [Predictive Markov Wordsearch](experiments/wordsearch/index.html)               | A PWA that hides words in Markov-generated filler that reads like language in all eight directions                       |

## 📝 Essays

Extended written investigations into the foundations of computational mathematics.

| Essay                                                          | Description                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Quadratic Quasi-Newton](essays/QQN/index.html)                | A new optimization algorithm interpolating between gradient descent and L-BFGS                     |
| [Rational Certificate Complexity](essays/RCC/index.html)       | A computational taxonomy of mathematical constants, stratified by certificate cost                 |
| [The Simplest Increment: x + sin(x)](essays/PI_RCC/index.html) | A cubic-convergent iteration for π built from the derivative structure of an analytic function     |
| [Numbers as Machines](essays/NAM/index.html)                   | A generator-based numerics library where every number is a deterministic, forkable virtual machine |

## 🧮 Short Demonstrations

Compact, self-contained demonstrations of classical mathematical concepts.

| Demonstration                                        | Description                                   |
| ---------------------------------------------------- | --------------------------------------------- |
| [Mandelbrot Set](experiments/basic/mandelbrot.html)  | Zoom and pan the iconic complex-plane fractal |
| [Prime Number Sieve](experiments/basic/primes.html)  | Animated Sieve of Eratosthenes                |
| [Fourier Series](experiments/basic/fourier.html)     | Build waveforms from rotating circles         |
| [Collatz Conjecture](experiments/basic/collatz.html) | Visualize the 3n+1 sequence                   |

---

## 🧵 How It All Connects

A few threads tie the collection together. Pull any one and the rest follow:

- **The shared optimizers.** Adam, L-BFGS, and **QQN** appear across Geometric Entropy, Spacelike Knots,
  No-Three-in-Line, and Fractal Learning. The QQN essay explains the algorithm; the labs let you _watch its
  personality_ — most vividly in Geometric Entropy's "optimizer fingerprinting," where the optimum is so degenerate
  that the optimizer's path becomes visible in the final shape.

- **Algebraic number fields → geometry.** $\mathbb{Q}(\sqrt{D})$ is the quiet engine behind the **Irrational
  Lattice** (colored aperiodic noise) and **Pentagonal Lattice Geometry** (fractional dimension from
  $\mathbb{Q}(\sqrt{5})$). The same field structure underlies the **NAM** machinery, where $\sqrt 2$ is an O(1)
  "automaton-tier" number precisely because its algebra is simple.

- **Continuous relaxation of discrete problems.** **No-Three-in-Line** (combinatorics → gradient descent),
  **Geometric Entropy** (Erdős distance counting → entropy maximization), and **Fractal Learning** (discrete IFS →
  differentiable fit) all share the move: replace a hard search over a discrete set with a smooth landscape you can
  flow downhill on.

- **Honesty about the undecidable.** **NAM** and its **calculator** make tri-state comparison and `pending (null)`
  first-class citizens. **RCC** quantifies the _cost_ of certainty. **Relativistic Gravity** is upfront that it's
  qualitative, not exact. The collection consistently treats the limits of computation as features to expose, not
  flaws to hide.

- **Iteration, forward and backward.** **Mandelbrot** and **Fractal Learning** are the same idea facing opposite
  directions; **x + sin(x)** and **NAM** are iteration in the service of _numbers themselves_; the **Layered CA**
  is iteration as raw emergence.

Whether you arrived to zoom a fractal or to argue about decidability, there's a door for you — and they all open into
the same building.

---

## 🗂 Project Structure

```
index.html              ← Landing page / experiment gallery
css/
  style.css             ← Shared stylesheet
  home.css              ← Landing page styles
js/
  home.js               ← Landing page logic (README previews, modals)
  marked.min.js         ← Markdown renderer
  optimizer-*.js        ← Shared QQN / Adam / L-BFGS optimizers
experiments/
  basic/                ← Short classical demonstrations
  3inline/              ← No-Three-in-Line continuous solver
  Pentagon_Lattice_Geometry/  ← Multi-sheeted polygon covers
  symmetry_simple/      ← Space-Color Symmetry
  geometric-entropy/    ← Continuous Erdős distinct-distance
  spacelike-knots/      ← Minkowski-metric knots
  layered_ca/           ← Langton's ants × Conway's Life
  fractal_learning/     ← Inverse IFS fitting
  irrational_lattice/   ← Algebraic colored-noise lattices
  gravity/              ← Relativistic 2-body gravity simulator
  nam-calculator/       ← Numbers-as-machines interactive lab
  wordsearch/           ← Predictive Markov wordsearch PWA
essays/
  QQN/                  ← Quadratic Quasi-Newton
  RCC/                  ← Rational Certificate Complexity
  PI_RCC/               ← The Simplest Increment: x + sin(x)
  NAM/                  ← Numbers as Machines
terraform/              ← Infrastructure for static hosting (S3 + CloudFront)
scripts/                ← Sitemap and OG-image generation
```

## 🛠 Implementation

Implemented in plain HTML, CSS, and JavaScript — no build step, and no dependencies beyond a couple of CDN-loaded
libraries (MathJax, Mermaid, TensorFlow.js, and a handful of d3 modules for the geometric labs). The heavier labs use
TensorFlow.js for GPU-accelerated automatic differentiation; the `nam` calculator runs a WebAssembly build of a C++
library. Deployed as a static site to AWS S3 + CloudFront via Terraform.

## 📄 License

See [LICENSE](LICENSE).