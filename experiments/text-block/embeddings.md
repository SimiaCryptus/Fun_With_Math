# Text Block: learned embeddings mode

## Summary

This document specifies a new mode for Text Block that learns a **vector embedding for
every positional character** of the text ring. The embedding is learned only from the
structure of the sorted-rotation block.

The idea:

1. Every positional character (ring position `p`, stable id `id`) starts with a
   random seed vector `x_p ∈ ℝ^d`.
2. The block is a 2-D grid. Each cell shows a positional character, so every pair of
   nearby cells says "these two positional characters are neighbours". Pairs are
   collected within a chosen neighbourhood, optionally weighted by a distance falloff.
   Summing them over the whole block gives a weighted graph on positions.
3. The vectors are optimized so that neighbours agree (small distance between their
   vectors). An expansion or normalization term keeps all vectors from collapsing to
   a single point.
4. The resulting vectors are a label-free representation of the text learned from
   its structure. They can be visualized, clustered, searched, used to colour the
   block, or exported for further analysis.

The mode reuses the existing model (stable ids, `SA`, selection, shift). It adds a
graph builder, an optimizer, and a scatter-plot view. It is still plain ES6 modules
with no dependencies.

---

## 1. What the block's adjacencies actually mean

Before choosing an objective, it helps to be precise about which information each
kind of grid adjacency carries. Recall from `idea.md`:

~~~
pos(r, k) = (SA[r] + k) mod n        // k is the column relative to the origin
                                     // (k < 0 = prefix side, k ≥ 0 = suffix side)
~~~

### 1.1 Horizontal neighbours: ring topology only

Cells `(r, k)` and `(r, k + j)` always hold positions `p` and `p + j`, whatever row
they are in. Summed over all rows, horizontal adjacency is `n` copies of the same
ring lattice. **It carries no information about the text content**, only the ring's
topology. It acts as a smoothness prior: nearby positions in the text should have
similar vectors.

Sanity check: with horizontal edges alone, the 2-D spectral embedding is exactly a
circle, because the eigenvectors of a ring Laplacian are sin/cos. This becomes a
built-in test preset (see §5.6).

### 1.2 Vertical neighbours: shared context

Rows `r` and `r+1` are adjacent in sorted order. Their rotations share a common
prefix of length

~~~
ℓ(r, r+1) = LCP[r+1]         // LCP[i] = lcp(rotation SA[i-1], rotation SA[i])
ℓ(r, r+m) = min(LCP[r+1..r+m])
~~~

The vertical pair in column `k` links positions `SA[r]+k` and `SA[r+1]+k`. What that
pair means depends on the column:

| column `k`        | the two linked positions…                                   | meaning                         |
|-------------------|-------------------------------------------------------------|---------------------------------|
| `0 ≤ k < ℓ`       | are the **same glyph**. They share `k` chars of left context and `ℓ-k-1` chars of right context | occurrences of the same repeated substring |
| `k ≥ ℓ`           | are unrelated beyond the shared prefix                      | weak / noisy evidence           |
| `k = -1` (L col.) | **precede identical right contexts** of length `ℓ`          | *substitutability*: distributional similarity |
| `k < -1`          | precede identical contexts at a larger gap                  | weaker distributional evidence  |

All of the text content lives in the vertical and diagonal edges. Different column
windows therefore produce different kinds of similarity:

- **suffix-side window** (`k ≥ 0`): clusters occurrences of repeats and groups
  positions by *identity in context*
- **L-column window** (`k = -1`): links characters that appear before the same
  contexts. This is the character-level analogue of word2vec's "you shall know a
  word by the company it keeps". For English text, vowels tend to group with
  vowels.

### 1.3 Diagonal neighbours

`(r, k)` and `(r+1, k+1)` link `SA[r]+k` with `SA[r+1]+k+1`: an off-by-one alignment
between neighbouring contexts. These edges are included through the distance kernel.
They mostly soften the graph and join the vertical "tracks" to the ring.

### 1.4 Boundaries

- **Columns wrap**, because the ring is circular. The column window must not be
  wider than `n`, or a position would be paired with itself inside a row.
- **Rows do not wrap** by default, because `SA` is not cyclic. A `cyclicRows`
  option links row `n-1` to row 0. This connects to the open question about
  vertical rotation in `idea.md`.
- With the sentinel on, `SA` is the suffix array of `T$` and LCP is well defined.
  Without it, periodic texts (`abab`) have tied rows with `ℓ = n`. That is fine:
  they just produce very strong edges.

---

## 2. Mathematical approach

### 2.1 Graph construction

Choose:

- a column window `K = [kMin, kMax]` relative to the origin, with `|K| ≤ n`
- a neighbourhood radius `(Rr, Rk)` in rows and columns
- an offset set without double counting:
  `O = { (dr, dk) : 0 ≤ dr ≤ Rr, |dk| ≤ Rk, (dr > 0) or (dr = 0 and dk > 0) }`
- a kernel with separate scales per axis, because the axes mean different things:

~~~
κ(dr, dk) = a(dr) · f(dr/σr, dk/σk)

a(0)  = α              // horizontal (ring) weight
a(dr) = β   for dr>0   // vertical / diagonal (context) weight

f = gaussian  : exp(-(u² + v²)/2)
  | inverse   : 1 / (1 + sqrt(u² + v²))
  | box       : 1
~~~

- an optional column emphasis `c(k)` (for example `exp(-|k - k0| / τ)`, which
  favours columns near a focus column `k0`)
- an optional LCP gate `g(ℓ)` for vertical and diagonal edges:

~~~
g(ℓ) = 1                               // off
     | [ℓ ≥ ℓmin]                      // hard gate
     | min(ℓ, ℓcap) / ℓcap             // soft, saturating
~~~

Accumulate:

~~~
for r in 0..n-1, k in K, (dr, dk) in O:
    r2 = r + dr   (skip if r2 ≥ n, unless cyclicRows)
    k2 = k + dk   (skip if k2 ∉ K)
    p  = pos(r, k),  q = pos(r2, k2);   skip if p == q
    w  = κ(dr, dk) · sqrt(c(k) c(k2)) · (dr > 0 ? g(ℓ(r, r2)) : 1)
    W[p][q] += w;  W[q][p] += w
~~~

Degree: `D = diag(W·1)`. The graph Laplacian is `L = D − W`.

Cost: `O(n · |K| · |O|)`. For `n ≤ 256` a **dense** `Float32Array(n·n)` (256 KB) is
simpler and fast enough, so no sparse structures are needed.

The horizontal contribution is text-independent and could be added analytically.
For clarity it is accumulated the same way as everything else.

### 2.2 Objective: agreement plus anti-collapse

Agreement (the "minimize disagreement with neighbours" term):

~~~
E_agree(X) = Σ_{p<q} W_pq ‖x_p − x_q‖²  =  tr(Xᵀ L X)
~~~

On its own this has the trivial minimum `x_p = const`. Something must spread the
vectors out. There are three options, and the first two are implemented.

#### (A) Hard normalization: Laplacian eigenmaps (optimizer `diffuse`)

~~~
minimize tr(Xᵀ L X)   subject to   Xᵀ D X = I,   Xᵀ D 1 = 0
~~~

The solution is the `d` eigenvectors of the generalized problem `L v = λ D v` with the
smallest non-zero eigenvalues. Equivalently, it is the top non-trivial eigenvectors of
the random-walk matrix `P = D⁻¹W`.

This is also exactly what the literal idea computes when it is run as an iteration:

~~~
X ← (1 − η) X + η · D⁻¹ W X          // move each vector toward its neighbours' average
X ← X − 1 (1ᵀ D X) / (1ᵀ D 1)        // remove the D-weighted mean (trivial direction)
X ← X · (Xᵀ D X)^(-1/2)              // whiten = the "expansion / normalization" term
~~~

Steps 1–3 are subspace (power) iteration on the lazy walk `(1−η)I + ηP`. Starting
from the random seed vectors, they converge to the eigenmap. Properties:

- The result is deterministic **up to an orthogonal transform** (rotation and sign
  flips). Different seeds give the same geometry, possibly rotated.
- Convergence speed depends on the spectral gap. Ring-dominated graphs (large `α`)
  converge slowly. A "Solve" button runs the iteration to tolerance, then finishes
  with a Rayleigh–Ritz step (a small `d×d` eigen-solve on `XᵀLX`) so the axes are
  ordered by eigenvalue.
- The whitening uses the `d×d` matrix `M = XᵀDX`. `M^(-1/2)` is computed by Jacobi
  eigen-decomposition of `M`, which is tiny.

#### (B) Soft expansion on the sphere: alignment + uniformity (optimizer `contrastive`)

Constrain `‖x_p‖ = 1` and minimize

~~~
L(X) = L_align + λ · L_unif

L_align = (1 / ΣW) Σ_{p<q} W_pq ‖x_p − x_q‖²
L_unif  = log( (1 / (n(n−1))) Σ_{p≠q} exp(−t ‖x_p − x_q‖²) )
~~~

The uniformity term (Wang & Isola) is minimized when points spread evenly over the
sphere, so it is the soft expansion term. The two terms compete, which produces
sharper, more separated clusters than (A). This is closer in spirit to
t-SNE, UMAP, or LINE.

Gradients, using the full symmetric `W`:

~~~
∂L_align/∂x_p = (2 / ΣW) Σ_q W_pq (x_p − x_q)
∂L_unif /∂x_p = −(4t / Z) Σ_{q≠p} e^{−t d²_pq} (x_p − x_q),   Z = Σ_{p≠q} e^{−t d²_pq}
~~~

Riemannian step on the sphere, with optional momentum:

~~~
g_p ← g_p − (g_p · x_p) x_p           // project onto tangent space
x_p ← normalize(x_p − η g_p)
~~~

Cost per step is `O(n² d)`: about 2 MFLOP at `n = 256`, `d = 32`. Many steps per
frame are cheap.

#### (C) Considered, not implemented

- A VICReg-style variance/covariance penalty (per-dimension std ≥ 1, off-diagonal
  covariance → 0). It behaves like a soft version of (A).
- Negative sampling instead of full repulsion. This is unnecessary at `n ≤ 256`.

### 2.3 Seeds, warm starts, and identity

- `seedVector(id, seed, d)` uses a hashed, seeded PRNG (`mulberry32(hash(id, seed))`)
  with Gaussian samples, normalized for (B). Each id gets the same seed vector every
  time.
- Vectors are stored **by stable id**, not by position. After an edit:
  - surviving ids keep their learned vectors (warm start)
  - new ids get fresh seed vectors
  - removed ids are dropped
- The optimizer then continues from there, so you can watch an edit perturb the
  embedding locally instead of starting over. This reuses the persistence model
  from `idea.md`.
- The sentinel has its own id and takes part like any other node.

### 2.4 Optional glyph tying

Positions can be encouraged to share a per-glyph component:

~~~
x_p = g_{T[p]} + u_p,   penalty μ Σ_p ‖u_p‖²
~~~

This is off by default. Without tying, glyph clustering is an *emergent* result,
which is more interesting. With tying, the residual `u_p` shows how a particular
occurrence differs from its glyph's typical context.

### 2.5 Display projection and stability

- For `d > 2`, the scatter view shows a PCA projection to 2-D (optionally 3-D with a
  slow rotation).
- Embeddings are defined only up to rotation, and eigenvector signs can flip between
  solves. Each new frame is therefore **Procrustes-aligned** to the previously
  displayed coordinates before drawing (orthogonal `R` from the SVD of `AᵀB`,
  computed with a small Jacobi SVD). This prevents visual jumping.

### 2.6 Diagnostics

Shown in the readout so the user can tell whether the embedding is meaningful:

- **loss** (current value and a sparkline history)
- **effective rank** `(Σλ_i)² / Σλ_i²` of the centred covariance. A value near 1
  means collapse.
- **glyph kNN purity**: the fraction of each position's `k` nearest neighbours
  that share its glyph. Glyphs were never used in training (unless tying is on), so
  this measures how much structure was recovered.
- **ring smoothness**: mean `‖x_p − x_{p+1}‖` compared with the mean over random
  pairs.

---

## 3. Use cases

1. **See context similarity.** A 2-D scatter of positions, drawn as their glyphs,
   shows which occurrences the block considers alike. Repeated substrings appear as
   parallel "tracks": the `i`-th characters of two copies of a repeat sit close
   together.
2. **Find repeats and their extent.** Clusters along a track reveal where a repeat
   starts and ends. Selecting a cluster highlights all the involved positions in the
   block, using the existing selection model.
3. **Character classes from distribution.** The L-column preset links characters
   that precede the same contexts. On natural-language text, classes like vowels,
   consonants, punctuation, and space emerge without labels.
4. **Segmentation and boundaries.** The sequence `‖x_p − x_{p+1}‖` along the ring
   spikes where the local context changes, such as at word or segment boundaries. It
   is shown as a boundary sparkline under the editor.
5. **Nearest-neighbour search.** Hovering a position lists its `k` nearest positions
   ("occurrences most like this one") and faintly previews them in the block.
6. **Colour the block by embedding.** Map the projected coordinates to a hue (2-D
   angle, or 3-D mapped to OKLab with fixed lightness). The block turns into a
   structure heat map: vertical bands of shared context and horizontal smoothness
   become visible. Brightness rules (F/L columns, prefix dimming) are kept.
7. **Understand the BWT.** Runs in the L column correspond to clusters in the
   L-column embedding, which makes it clear *why* the BWT compresses: positions in
   similar contexts are similar.
8. **Teaching representation learning.** The mode is a small, fully inspectable
   example of how graph embeddings, eigenmaps, and contrastive learning turn
   structure into vectors. The random seeds visibly organize over time.
9. **Export.** Embeddings can be downloaded as JSON or CSV
   (`id, pos, char, x_1..x_d`) along with the parameters and the graph, for
   analysis in other tools.

Limitations, stated honestly in the UI help:

- At `n ≤ 256` the statistics are small. Results are qualitative.
- The block sorts by right context only. Left context is visible on the prefix side
  but is not ordered. A stretch goal builds a second graph from `SA(reverse(T))` and
  takes the union to get a bidirectional context graph.

---

## 4. Presets

| preset          | window `K`        | `(Rr,Rk)` | `α`  | `β` | LCP gate          | purpose                            |
|-----------------|-------------------|-----------|------|-----|-------------------|------------------------------------|
| **Context**     | `[0, 8]`          | `(2, 1)`  | 0.2  | 1   | off               | default; repeats and identity      |
| **Substitution**| `[-1, -1]`        | `(3, 0)`  | 0    | 1   | soft, `ℓcap = 4`  | distributional character classes   |
| **Ring**        | `[0, 8]`          | `(0, 2)`  | 1    | 0   | n/a               | sanity check: should give a circle |
| **Follow view** | visible columns   | `(2, 1)`  | 0.2  | 1   | off               | the graph is what you see          |

"Follow view" rebuilds the graph when `shift` changes (debounced), so dragging the
block redefines the embedding's notion of neighbourhood.

---

## 5. Project addition spec

### 5.1 Files

~~~
experiments/text-block/
  embeddings.md          – this document
  src/
    sort.js              – + computeLCP (Kasai, O(n)) next to computeSA
    embed/
      rng.js             – mulberry32, string hash, gaussian, seedVector
      linalg.js          – small dense helpers: jacobiEig (symmetric), invSqrtSym,
                           procrustes, pca
      graph.js           – buildGraph(): dense W + degrees from SA/LCP/params
      embedder.js        – Embedder class: id-keyed storage, diffuse & contrastive steps
      metrics.js         – effective rank, kNN purity, ring smoothness, boundary signal
      worker.js          – optional Web Worker wrapper around Embedder
      scatter.js         – canvas scatter view (glyph points, edges, selection, hover)
      panel.js           – parameter panel + presets + run/pause/step/solve/reset
      colorize.js        – embedding → per-position colour for the block
~~~

`index.html` gets a mode switch and a container for the scatter/panel.
`style.css` gets the panel and scatter styles in the existing matrix theme.

### 5.2 State additions

~~~
{
  mode: 'block' | 'embed' | 'split',   // split = block + scatter side by side
  embed: {
    params: {
      preset: 'context',
      dim: 8,
      window: [0, 8], followView: false,
      radius: [2, 1], sigma: [1, 1], kernel: 'gaussian',
      alpha: 0.2, beta: 1,
      columnFocus: null, columnTau: 4,
      lcpGate: 'off', lcpMin: 1, lcpCap: 4,
      cyclicRows: false,
      optimizer: 'contrastive',        // | 'diffuse'
      lr: 0.05, momentum: 0.9, lambda: 1, t: 2, eta: 0.5,
      glyphTying: 0,
      seed: 1,
      stepsPerFrame: 10
    },
    running: false,
    version: 0,                        // bumped on each published embedding
    colorBlock: false
  }
}
~~~

The vectors themselves are optimizer state. They live inside the `Embedder` (or the
worker), not in `state`. Only `version` is stored in `state`, so subscribers know
when to re-read. Projection and metrics are derived.

### 5.3 Module APIs

~~~
// sort.js
computeLCP(codes: Int32Array, sa: Int32Array) → Int32Array   // LCP[0] = 0

// embed/rng.js
seedVector(id: number, seed: number, d: number) → Float32Array

// embed/graph.js
buildGraph({ sa, lcp, n, shift, params }) →
  { n, W: Float32Array /*n*n*/, deg: Float32Array, totalWeight: number,
    edgeCount: number }

// embed/embedder.js
class Embedder {
  constructor({ dim, seed })
  sync(ids: number[])                  // position order; warm-start by id
  setGraph(graph)
  setParams(params)
  step(k = 1) → { loss, iter }
  solve({ tol = 1e-6, maxIter = 5000 }) → { loss, iter, converged }  // diffuse only
  reseed()
  matrix() → Float32Array              // n*d, position order
  get(id) → Float32Array | undefined
  export() → { params, ids, chars, X }
}

// embed/metrics.js
effectiveRank(X, n, d), knnPurity(X, n, d, codes, k), boundarySignal(X, n, d)

// embed/linalg.js
pca(X, n, d, k) → Float32Array /*n*k*/
procrustes(A, B, n, k) → Float32Array /*k*k*/   // R minimizing ‖A R − B‖
~~~

### 5.4 Data flow

~~~
text edit → ring.applyEdit → computeSA → computeLCP
          → buildGraph → embedder.sync(ids) + setGraph → emit('embedding-graph')
param change → (graph params ? rebuild graph : setParams) → emit('embedParams')
shift change (followView only, debounced 150ms) → rebuild graph
rAF loop while running → embedder.step(stepsPerFrame) → pca → procrustes-align
          → state.embed.version++ → emit('embedding')
scatter.js / colorize.js / metrics readout subscribe to 'embedding'
~~~

The worker path has the same flow, except that `step` runs in the worker. The worker
posts `Float32Array` snapshots (transferable) at most once per frame. The main-thread
fallback is used if workers are unavailable. At `n ≤ 256`, the main thread is
expected to be sufficient.

### 5.5 UI

- **Mode switch** in the header: `Block | Embed | Split`.
- **Parameter panel** (collapsible):
  - preset selector
  - dim, window, radius, sigma, kernel, α, β, LCP gate, cyclic rows
  - optimizer and its hyper-parameters
  - seed
  - buttons: **Run/Pause**, **Step**, **Solve** (diffuse), **Reseed**, **Export**
- **Scatter view** (canvas):
  - each position is drawn as its glyph in phosphor green; the sentinel is drawn
    as `$`
  - optional faint edges for the top-k strongest `W_pq` per node
  - pan (drag) and zoom (wheel or pinch)
  - hover sets `state.hover` to that id, so the block previews its path, and shows a
    tooltip `pos 7 'a'` plus its k nearest neighbours
  - click, ctrl/cmd-click, and shift-click use the **same selection semantics** as
    the block (shift-range is still in ring order)
  - optional lasso (alt-drag) adds positions to the selection
  - selected positions use the existing highlight palette in both views
- **Readouts**: loss sparkline, effective rank, glyph kNN purity, edge count, and
  iteration count.
- **Colour block by embedding** toggle. Selection highlight always takes precedence
  over embedding colour. `prefers-reduced-motion` stops the auto-run animation;
  the user steps or solves manually instead.
- **Boundary sparkline** under the editor (optional): `‖x_p − x_{p+1}‖` along the ring.

### 5.6 Tests (plain assertions in `tests/embed.html`)

- `computeLCP` matches brute force on random strings, with and without sentinel.
- `buildGraph`: `W` is symmetric, has a zero diagonal and non-negative entries, and
  the horizontal-only graph equals the analytic ring lattice.
- **Ring preset**: the diffuse 2-D solution lies on a circle (low radial variance)
  in ring order.
- Contrastive loss is non-increasing on average over 200 steps, and effective rank
  stays above 1.5 for `d ≥ 2`.
- Diffuse iteration from two different seeds gives subspaces that agree after
  Procrustes (residual < 1e-3).
- Warm start: after a one-character insertion, surviving ids keep bit-identical
  vectors before the next step.
- `n = 0, 1, 2` and `aaaa` (all ties) run without NaNs.

### 5.7 Performance budget

- `n ≤ 256`, `d ≤ 32`.
- Graph build ≤ 5 ms. The contrastive step is `O(n²d)`, about 1 ms. Diffuse is
  `O(n²d + nd² + d³)`.
- Target: ≥ 10 steps per frame at 60 fps on a mid-range laptop.
- Beyond the soft cap, the mode refuses to run and says why, like the block's cap.

### 5.8 Milestones

1. `computeLCP`, `rng.js`, and `graph.js` with tests; a debug view of `W` as a
   heat map.
2. `Embedder` with the `diffuse` optimizer and Solve; the Ring preset reproduces
   the circle.
3. Scatter view with PCA, Procrustes alignment, and shared hover/selection.
4. `contrastive` optimizer, live Run loop, loss sparkline, and metrics.
5. Warm start across edits; follow-view graph; presets.
6. Colour-block mode, boundary sparkline, export.
7. Stretch goals: worker, glyph tying, bidirectional graph (`SA` of the reversed
   text), 3-D view.

---

## 6. Open questions

- Should the default optimizer be `diffuse` (exact, explainable, matches the literal
  "average neighbours + normalize" idea) or `contrastive` (nicer clusters)? The
  current proposal is `contrastive` for Run and `diffuse` for Solve. either/both
- Should vertical edges beyond the LCP (`k ≥ ℓ`) be down-weighted by default? They
  are mostly noise in the Context preset, but they give the graph connectivity. no
- Is a per-position embedding enough, or should the mode also offer a
  **per-rotation (row)** embedding, where nodes are rows and cells are features?
  That would be a different but related view of the same grid. no
- Should the embedding also drive the block's row order, as an alternative sort?
  That would make an interesting comparison with lexicographic order, but it would
  no longer be the BWT. no