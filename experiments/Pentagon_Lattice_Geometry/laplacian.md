# Laplacian Analysis of the Multi-Sheeted N-Gon Graph

This document describes how the adjacency matrix and graph Laplacian
are formed for the multi-sheeted $n$-gon tiling graph, what spectral
quantities are computed, and how they connect to the dimensional
predictions of the paper _Emergent Fractional Dimensionality and
Spinor-Like Holonomy in Multi-Sheeted Pentagon Tilings_.

The analysis is performed in two places:

- **`experiment.mac`, Section 4** — runs the Laplacian eigen-analysis
  as part of the full pipeline (subject to `SKIP_EIG`).
- **`laplacian_analysis.mac`** — a standalone driver that _forces_ the
  eigendecomposition at a fixed, tractable cluster size, and adds
  supplementary quantities (connected-component count, normalized
  Laplacian spectrum, spectral-radius bound).

---

## 1. From graph to matrices

The cluster is built by BFS from an origin $n$-gon (Section 3 of
`experiment.mac`). Each cell $i$ has an adjacency list `nbrs[i]`. From
this we form three $N \times N$ matrices:

- **Adjacency matrix** $A$, with $A_{ij} = 1$ iff cells $i$ and $j$
  share an edge in the multi-sheeted graph (and $0$ otherwise).
- **Degree matrix** $D = \operatorname{diag}(d_1, \dots, d_N)$, where
  $d_i = |\text{nbrs}[i]|$.
- **Graph Laplacian** $L = D - A$.

Because the graph is undirected, $A$ (and hence $L$) is symmetric.
This is verified numerically:

$$\|L - L^{\mathsf T}\|_{\max} = 0.$$

The all-ones vector lies in the kernel of $L$ (each row of $L$ sums to
zero), which is also checked.

---

## 2. Eigen-analysis

We compute the full real eigenspectrum
$0 = \lambda_1 \le \lambda_2 \le \dots \le \lambda_N$ using LAPACK's
`dgeev` (with a symbolic `eigenvalues()` fallback). The Laplacian is
positive semi-definite, so all eigenvalues are non-negative.

### 2.1 Connected components

The multiplicity of the zero eigenvalue equals the number of connected
components of the graph. For a connected cluster this is exactly $1$
(the constant vector). A multiplicity $> 1$ signals that the BFS
construction or the $\tau$-rule has disconnected sheets — a useful
diagnostic for the multi-sheeted construction.

### 2.2 Spectral gap (algebraic connectivity)

The smallest **positive** eigenvalue $\lambda_2$ is the _Fiedler value_
or _algebraic connectivity_. It measures how well-connected the graph
is: a small gap indicates weak inter-sheet bridges (the vortex edges).
The value is preset-dependent: a 156-cell `medium` signed-3 cluster
gives $\lambda_2 \approx 0.027$, whereas the 31-cell `small` cluster
produced by `laplacian_analysis.mac` gives
$\lambda_2 \approx 0.1459$. Notably this matches the squared
edge-length norm $(\,\lambda_2 = \tfrac{\sqrt5-1}{4}\cdots = 0.14589803\ldots)$
and appears with ~4-fold near-degeneracy, the algebraic-connectivity
signature of the multi-sheeted bridges.

### 2.3 Spectral radius

The largest eigenvalue obeys the bound
$$\lambda_{\max} \le 2\,d_{\max},$$
where $d_{\max}$ is the maximum degree. This is verified as a sanity
check on the numerical spectrum.

### 2.4 Normalized Laplacian

When the graph has no isolated vertices, we also form the **normalized
Laplacian**
$$\mathcal{L} = I - D^{-1/2} A\, D^{-1/2},$$
whose eigenvalues lie in $[0, 2]$. The largest normalized eigenvalue
equals $2$ iff the graph has a bipartite connected component — relevant
here because, for **odd** $n$, the dual tiling graph is bipartite on
chirality (every edge connects an "up" cell to a "down" cell). The
normalized spectrum therefore provides an independent confirmation of
the bipartite-chirality structure discussed in `experiment.md`.

---

## 3. Spectral dimension from the density of states

The **spectral dimension** $d_{\text{spec}}$ governs the low-frequency
density of states $\rho(\lambda)$ of the Laplacian:

$$
\rho(\lambda) \sim \lambda^{\,d_{\text{spec}}/2 - 1}
\quad (\lambda \to 0^+),
$$

equivalently the integrated DOS scales as
$$N(\le \lambda) \sim \lambda^{\,d_{\text{spec}}/2}.$$

We estimate $d_{\text{spec}}$ by counting eigenvalues below several
fractions of $\lambda_{\max}$ and performing a log–log least-squares
fit of $\log N(\le \lambda)$ against $\log \lambda$; the slope is
$d_{\text{spec}}/2$. **Note:** the integrated DOS must _exclude_ the
zero (kernel) eigenvalue. `experiment.mac` §4 currently includes it
($d_{\text{spec}}^{\text{DOS}}\approx 1.90$ in the small run) while
the standalone `laplacian_analysis.mac` excludes it
($\approx 2.12$); the kernel-excluded value is the correct one.

This spectral-dimension estimate complements the random-walk estimates
from $P_0(t) \sim t^{-d_{\text{spec}}/2}$ (return probability) and the
Alexander–Orbach relation $d_{\text{spec}} = 2 d_{\text{eff}} / d_w$.
For the multi-sheeted graph the paper predicts
$$d_{\text{spec}} < d_{\text{eff}},$$
i.e. the vortex edges induce **sub-diffusion**: a walker is retarded by
inter-sheet bottlenecks. The dense-DOS estimate
$d_{\text{spec}}^{\text{DOS}} \approx 1.9 < d_{\text{eff}} \approx 2.4$
(medium preset) qualitatively confirms this.

---

## 4. Relationship between the matrices and transport

The three derived quantities form a coherent story:

| Object                     | Quantity                 | Interpretation                          |
| -------------------------- | ------------------------ | --------------------------------------- |
| $A$ (adjacency)            | row sums $= d_i$         | local connectivity / degree             |
| $L = D - A$                | $\ker L$                 | connected components                    |
| $L$                        | $\lambda_2$ (Fiedler)    | global connectivity, vortex bottlenecks |
| $L$                        | $\rho(\lambda)$ near $0$ | spectral dimension $d_{\text{spec}}$    |
| $\mathcal{L}$ (normalized) | $\lambda_{\max} = 2$?    | bipartite (chirality) structure         |

Because the random walk on the graph has transition matrix
$P = D^{-1} A = I - D^{-1} L$, the Laplacian spectrum **directly
controls** the return probability and the diffusion exponent $d_w$.
Analyzing $L$ is therefore the spectral counterpart of the
random-walk experiments in Section 6 of `experiment.mac`.

---

## 5. Running the analysis

```sh
maxima --batch=laplacian_analysis.mac
```

This forces the `small` preset with `SKIP_EIG = false` so the full
eigendecomposition runs even though the default `experiment.mac`
preset (`huge`) would otherwise skip it. To study a different polygon
or size, set the overrides before batching, e.g.:

```mac
EXPERIMENT_N_GON_OVERRIDE : 7 $
EXPERIMENT_PRESET_OVERRIDE : "medium" $
batch("laplacian_analysis.mac") $
```

For large clusters (where $O(N^3)$ dense diagonalization is
infeasible) use the KPM spectral-density approximation in Section 18
of `experiment.mac` instead, which estimates $\rho(\lambda)$
stochastically from Chebyshev moments of $L$.

> **Caveat (observed):** the KPM rescaling uses
> $b = d_{\max}+1$, but the spectral bound is $2 d_{\max}$, so the
> rescaled spectrum can exceed $[-1,1]$ (the log warns
> `rescaled lam_max bound = 1.44 ... may exceed 1`). When this
> happens the low-$\lambda$ tail is empty and the KPM
> $d_{\text{spec}}$ estimates are unreliable. Use
> $b \gtrsim 2 d_{\max} - d_{\text{mean}}$.

> **Caveat (small clusters):** at the `small` preset the 31-cell
> cluster is nearly a tree (25/31 vertices have degree 1, girth
> $>8$, zero cycles). Holonomy and random-walk transport
> diagnostics are then vacuous ($d_w<0$, $d_{\text{spec}}(P_0)$
> unfit); only the Laplacian DOS estimate is meaningful at this size.
