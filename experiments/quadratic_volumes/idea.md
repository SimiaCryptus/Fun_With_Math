# Residual-Volume Coding: Geometric Measure as the Probability Algebra of Decision Trees

## Abstract

This paper proposes a training criterion for decision trees and related partition models. The model is scored by how many bits it removes from the cost of locating each observation at full resolution inside the region that remains admissible. Each leaf is a region defined by predicates such as $a^\top x \le b$, $x^\top Q x + a^\top x + c \le 0$, or $f_\theta(x) < t$ for a learned scalar field $f_\theta$. Under an ideal codec, the cost of an observation is the cost of naming its leaf plus $\log_2$ of the leaf's measure divided by the volume of one resolution cell.

From this one accounting rule, three results follow:

1. The model is a piecewise-uniform density estimator.
2. The net gain of any split equals $N$ times the Kullback–Leibler divergence between the empirical mass on its two sides and the geometric mass on its two sides, minus the bits needed to describe the split.
3. Model complexity is no longer an arbitrary regularizer. It is priced in the same currency, bits, as the compression it buys.

Making this computable needs a *measure oracle*: a component that returns certified lower and upper bounds on the measure of predicate-defined regions. We describe a tiered oracle based on adaptive box subdivision:

- **Affine predicates** have exact box ranges in $O(d)$.
- **Quadratic predicates** can be certified using their known Hessian: convexity, concavity, or a difference-of-convex decomposition.
- **Radial-basis-function decision fields** can be bounded through per-center distance bounds.
- **Vertex evaluations** are inherited down the subdivision hierarchy and updated incrementally.

Because the oracle returns intervals, the split gain is also an interval. Because the gain is convex in each child's share of measure, that interval can be computed tightly from the oracle's bounds. Geometric refinement can therefore be *decision-directed*: it stops as soon as the winning split is certified.

We then argue for two broader claims. First, the criterion tends to recover *least-description function–measure relations*: cheap functional constraints under which observed mass occupies surprisingly little of the available measure. Second, the measure oracle is useful beyond trees, as a common geometric "co-denominator" for comparing otherwise unrelated models through conditional overlap.

---

## 1. Introduction

A conventional decision tree measures the quality of a split by counting rows. The probability of the left branch is the fraction of training samples that went left. Impurity is computed from those fractions. The continuous space in which the samples live plays no role except as the arena where thresholds are placed. Two splits that send the same samples to the same sides are indistinguishable, even if one carves off a sliver of the domain and the other carves off nine-tenths of it.

That information is not irrelevant. Suppose 98 of 100 observations fall inside a blob covering 1% of the admissible domain, and the other 2 are scattered through the remaining 99%. A row-count tree sees a 98:2 split. The geometry says the dense side occupies a 1:99 share of the space. The *discrepancy* between these two ratios is the evidence of structure: the data are concentrated in a way a uniform reference would not predict.

This paper builds a model class around that discrepancy. The central idea is simple enough to state in one sentence:

> **The volume of a leaf is the residual address length of every point inside it.**

If a decoder knows that a point lies in a region $R$ and must recover its coordinates to resolution $\varepsilon$ in $d$ dimensions, it needs about $\log_2(\mu(R)/\varepsilon^d)$ further bits. A model that confines observations to small regions, at low descriptive cost, is a good codec for the point distribution. Everything else in this paper follows from taking that sentence seriously:

- the split criterion,
- the density interpretation,
- the role of nonlinear split surfaces,
- the need for certified volume computation,
- the branch-and-bound training procedure,
- and the overlap algebra between models.

Existing partition models tend to sit on one side of a trade-off. Oblique and kernel trees have flexible geometry but are blind to ambient volume; they score splits by row counts. Density estimation trees, MDL histograms, and Bayesian adaptive partitions are volume-aware, but they stay inside axis-aligned cells, where volume is trivial to compute. The method here aims at the missing corner: nonlinear split geometry *and* volume-aware scoring. What makes that corner reachable is a measure oracle that can bound the volume of curved, intersected regions, together with a training loop that asks it for no more precision than a decision needs.

### 1.1 Contributions

1. **A residual-volume code-length objective** for partition models. The split gain decomposes exactly as
   $$G = N\,D_{\mathrm{KL}}(P \,\|\, Q) - C_{\text{split}},$$
   where $P$ is empirical mass, $Q$ is geometric (reference) mass, and $C_{\text{split}}$ is the description length of the boundary (Section 3). With a universal branch code, the identity holds up to a known regret term that also removes the pathology of empty children.

2. **A separation of split generation from split evaluation.** Any scalar field $f_\theta$ (affine, quadratic, RBF-SVM, small network) proposes level-set splits $f_\theta(x) < t$ or two-sided slabs $t_1 \le f_\theta(x) < t_2$. A holdout sweep over thresholds selects the split by verified code-length gain, with accounting that charges each model component exactly once (Section 4).

3. **A certified measure oracle** with an interface that returns intervals, and a tiered implementation (Section 5). The tiers are:
    - exact affine box ranges,
    - Hessian-aware quadratic certificates,
    - inherited and incrementally updated vertex evaluations,
    - per-center RBF bounds,
    - and a statistical sampling fallback with anytime-valid confidence sequences.

4. **Decision-directed refinement.** Gain intervals are computed from the convexity of the objective in each child's share of measure, and geometric precision is spent only where it changes which split wins (Section 6).

5. **A reading of the objective as discovery of function–measure relations** (Section 7). Intrinsic dimension and functional laws emerge as by-products of compression.

6. **A geometric overlap algebra** for comparing arbitrary predicate-defined models (Section 8).

We describe a method and its theory. We do not report empirical results; Section 11 sets out the evaluation that would be needed to support or refute the claims.

---

## 2. Related Work

**Decision trees with richer splits.** Axis-aligned trees (CART; Breiman et al., 1984) were generalized to oblique hyperplanes (e.g., OC1; Murthy, Kasif & Salzberg, 1994). Later work placed full classifiers, including kernel SVMs, at internal nodes. STree is a maintained example of an oblique tree whose nodes are SVMs, with RBF kernels supported. Optimal classification trees with SVM splits have also been published. Putting an RBF-SVM inside a tree is therefore *not* novel. What differs here is how the resulting split is *evaluated*: by geometric measure and code length, not by row-count impurity.

**Density estimation trees and adaptive partitions.** Ram and Gray's Density Estimation Trees (2011) use the leaf density $\hat f(x) = n_L/(N V_L)$, so leaf volume is explicitly part of the estimator. They train by minimizing an integrated squared error criterion. Discrepancy-based adaptive sequential partitioning (Li, Yang & Wong, 2016) recursively builds piecewise-constant densities, with splits driven by a discrepancy measure. Optional Pólya trees (Wong & Ma, 2010) place a prior over recursive dyadic partitions and integrate over where to stop and how to split, which yields a Bayesian counterpart of volume-aware partitioning. Recent partition-tree work trains piecewise-constant densities by conditional negative log-likelihood, which is the closest probabilistic relative of the objective here. These methods mostly use axis-aligned cells, where volume is trivial. They do not treat the measure of arbitrary analytically defined regions as the primary computational object.

**Minimum description length.** The MDL principle (Rissanen, 1978; Grünwald, 2007) selects the model minimizing the combined length of the model and of the data encoded with it. Barron and Cover (1991) established minimum-complexity density estimation, connecting description length, relative entropy, and convergence to the true density. MDL histograms (Kontkanen & Myllymäki, 2007) and recent MDL-based binning combined with tensor factorization apply the principle to multivariate density estimation. Our criterion is an instance of MDL. Its specific operational form is new as far as we can determine: the data cost is the logarithm of the measure of the analytically defined feasible region, computed with certified bounds.

**Quantization and rate–distortion.** At high resolution, the cost of coding a continuous source relates to its differential entropy (Gray & Neuhoff, 1998; Cover & Thomas, 2006). The $-\log_2 \varepsilon^d$ term in our code length is the familiar high-resolution offset. The learned partition plays the role of a structured, variable-rate quantizer.

**Volume computation.** Exact volume of an H-polytope is #P-hard in general (Dyer & Frieze, 1988). Practical exact algorithms include triangulation, signed decompositions, and Lawrence's formula (Lawrence, 1991; Büeler, Enge & Fukuda, 2000). In high dimension, randomized polynomial-time approximation based on random walks is the standard route (Dyer, Frieze & Kannan, 1991).

**Interval branch-and-bound and set inversion.** Recursive box subdivision with function-range bounds is the workhorse of interval analysis (Moore, Kearfott & Cloud, 2009) and of global optimization. Convex underestimators for nonconvex quadratics are central to methods such as αBB (Androulakis, Maranas & Floudas, 1995). Recent quadratic solvers combine interval propagation with convex relaxations. Set inversion via interval analysis (SIVIA; Jaulin & Walter, 1993) comes closest to our use: it builds inner and outer pavings of a set defined by inequalities, which is exactly the IN/UNKNOWN bookkeeping of Section 5.2. Most of that literature uses box classification to *find optima*, *prove feasibility*, or *approximate a set to a fixed tolerance*. We use the same machinery to *accumulate measure* that feeds a code length: certified-inside boxes add to a lower bound, ambiguous boxes add to the gap, and refinement is driven by a downstream modeling decision, not by a tolerance fixed in advance.

**Positioning.** Taken together, the neighbors fall into two groups. Nonlinear, volume-blind methods (oblique and SVM trees) have expressive boundaries but score them by counts. Axis-aligned, volume-aware methods (DETs, MDL histograms, Optional Pólya trees, log-loss partition trees) score by density but restrict geometry to boxes. The contribution here is the combination: a code-length criterion over nonlinear predicate-defined regions, made computable by an interval-valued measure oracle and a racing procedure that consumes those intervals.

---

## 3. Residual-Volume Code Length

### 3.1 Setup

Let $D \subset \mathbb{R}^d$ be a bounded reference domain with a reference measure $\mu$. The default is Lebesgue volume; Section 3.5 generalizes it. Observations $x_1, \dots, x_N \in D$ are to be transmitted to resolution $\varepsilon$, that is, to an accuracy cell of measure $v_\varepsilon \approx \varepsilon^d$.

Without a model, each point costs
$$\ell_0(x) = \log_2 \frac{\mu(D)}{v_\varepsilon}$$
bits.

A partition model $T$ (a tree) assigns each point to a leaf $L_T(x)$. The decoder first learns the leaf, then the position inside it. With a leaf code of length $\ell_{\text{path}}(x)$, the per-point cost is
$$\ell_T(x) = \ell_{\text{path}}(x) + \log_2 \frac{\mu(L_T(x))}{v_\varepsilon}.$$

The total two-part code length is
$$\mathcal{L}(T) = \mathcal{L}_{\text{model}}(T) + \sum_{i=1}^N \Big[\ell_{\text{path}}(x_i) + \log_2 \mu(L_T(x_i))\Big] - N \log_2 v_\varepsilon .$$

The final term is identical for every model compared at the same resolution, so it cancels out of every comparison. **What remains is the quantity the tree minimizes.**

### 3.2 Equivalence to a piecewise-uniform density

Let $n_j$ points fall in leaf $L_j$, with $p_j = n_j/N$ and $V_j = \mu(L_j)$. The ideal leaf code is $\ell_{\text{path}} = -\log_2 p_j$. Then
$$\sum_i \ell_T(x_i) + N\log_2 v_\varepsilon = -\sum_j n_j \log_2 p_j + \sum_j n_j \log_2 V_j = -\sum_i \log_2 \hat f(x_i),$$
where
$$\hat f(x) = \frac{p_j}{V_j}, \qquad x \in L_j .$$

So the residual-volume codec is the same thing as the negative log-likelihood of the piecewise-uniform density with leaf masses $p_j$ and leaf volumes $V_j$. The two coding costs, *which leaf* and *where in the leaf*, are the two terms of the log-likelihood. The objective is therefore simultaneously:

- a minimum-description-length criterion,
- a density estimator,
- an estimator of geometric (differential) entropy,
- and a recursive spatial codec.

### 3.3 Split gain is a KL divergence

Consider a parent region $P$ containing $n$ points with measure $V_P$. A candidate split produces children with measures $V_L + V_R = V_P$ containing $n_L + n_R = n$ points.

Replacing the parent leaf by two children has two effects:

- It saves residual address bits:
  $$n\log_2 V_P - n_L \log_2 V_L - n_R \log_2 V_R.$$
- It spends branch bits, because the decoder must now learn which child each point is in. With ideal branch probabilities $p_L = n_L/n$ and $p_R = n_R/n$, this costs $n H_2(p_L)$.

Write $q_L = V_L/V_P$ and $q_R = V_R/V_P$. The net gain is
$$G = n\log_2 V_P - n_L\log_2 V_L - n_R\log_2 V_R - nH_2(p_L) - C_{\text{split}}.$$

Expanding $n\log_2 V_P = n_L\log_2 V_P + n_R\log_2 V_P$ and collecting terms gives
$$G + C_{\text{split}} = n_L\log_2\frac{p_L}{q_L} + n_R\log_2\frac{p_R}{q_R},$$
so
$$\boxed{\,G = n\, D_{\mathrm{KL}}\big((p_L, p_R)\,\big\|\,(q_L, q_R)\big) - C_{\text{split}}\,}$$

The same identity holds for any multiway partition of $D$ into regions $R_1, \dots, R_k$:
$$\sum_j n_j \log_2 \frac{\mu(D)}{\mu(R_j)} - N H(P) = N\, D_{\mathrm{KL}}(P \,\|\, Q), \qquad Q_j = \frac{\mu(R_j)}{\mu(D)}.$$

The interpretation is direct:

> **A split compresses when the fraction of observations on each side differs from the fraction of available measure on each side.** The tree compresses by finding where points occupy much less space than the reference measure predicts.

Return to the blob example: 98% of points in 1% of the space. The gain is
$$0.98\log_2\tfrac{0.98}{0.01} + 0.02\log_2\tfrac{0.02}{0.99} \approx 6.48 - 0.11 = 6.37$$
bits per observation, before paying for the boundary.

A row-count tree treats this split as merely "fairly pure." The geometric criterion sees it as a large compression win.

### 3.4 Why the split cost cannot be omitted

The KL divergence is non-negative. Without $C_{\text{split}}$, every split appears to help, and the optimum shrinks a bubble around each observation until its residual measure reaches $v_\varepsilon$. The term $C_{\text{split}}$ is what makes the objective well posed. It must include everything the decoder needs to reconstruct the boundary:

- the generator family,
- its parameters at the precision used,
- the threshold,
- and, for kernel fields, the centers and their weights.

A standard MDL accounting charges roughly $\tfrac{1}{2}\log_2 n$ bits per real parameter, quantized at its optimal precision. It charges $\log_2 m$ bits to select a threshold among $m$ candidates. This is the asymptotic cost of a parameter estimated from $n$ points (Rissanen, 1978).

How parameters are encoded matters as much as how many there are. Charged naively, an RBF field with $k$ centers costs about $\tfrac{1}{2}kd\log_2 n$ bits for coordinates alone, and a dense quadratic costs $O(d^2 \log_2 n)$. In moderate dimension that prices every curved split out of the market before it is evaluated. Two encodings keep the accounting honest without inflating it:

- **Centers as pointers.** Support vectors are observations the decoder will receive anyway. A center can be named by its index, at $\log_2 \binom{n}{k}$ bits for the set, plus $\tfrac{1}{2}\log_2 n$ per weight.
- **Sparse or low-rank quadratics.** A quadratic with $k$ nonzero coefficients out of $p = d(d+1)/2 + d + 1$ possible ones costs $\log_2 \binom{p}{k} + \tfrac{k}{2}\log_2 n$ bits. A low-rank Hessian is priced by its factors.

The branch code needs the same care. The plug-in cost $nH_2(p_L)$ assumes the decoder already knows $p_L$, which it does not. A universal code for the branch sequence, such as the Krichevsky–Trofimov (KT) code (Krichevsky & Trofimov, 1981), costs
$$\ell_{\text{KT}}(n_L, n_R) = -\log_2 \frac{\Gamma(n_L + \tfrac12)\,\Gamma(n_R + \tfrac12)}{\pi\,\Gamma(n_L + n_R + 1)} \approx nH_2(p_L) + \tfrac12 \log_2 n + O(1).$$
Using $\ell_{\text{KT}}$ in place of $nH_2(p_L)$ charges the regret of learning the branch probability automatically. It also assigns a finite, sensible cost when one side is empty. This matters during threshold sweeps: the plug-in KL treats $n_R = 0$ as certainty ($0\log 0 = 0$), which biases the sweep toward extreme thresholds that carve away empty space at no apparent branch cost. One further bit per node encodes the tree topology (internal node versus leaf).

Complexity control is therefore not a heuristic. **A boundary must pay for itself in bits:** a curved surface is used only when the extra residual-volume reduction it delivers exceeds the extra bits needed to describe it.

Because the total is a genuine two-part code, with model descriptions satisfying the Kraft inequality, the minimum-complexity density estimation results of Barron and Cover (1991) apply to a countable, discretized family of trees. The fitted density then converges to the true density in squared Hellinger distance, at a rate bounded by the index of resolvability: the best trade-off, over the family, between description length per sample and relative entropy from the truth. Consistency is thus a consequence of the accounting, not an additional assumption.

### 3.5 Weighted reference measures

Nothing above requires $\mu$ to be Lebesgue volume. Let
$$\mu_w(A) = \int_A w(x)\,dx$$
for a non-negative weight $w$. The weight can encode a physical prior, the frequency of operating conditions, regions known to be impossible ($w = 0$), or economic importance.

The codec then measures surprise *relative to that prior*. The split gain becomes the KL divergence between empirical mass and prior mass. The fitted density becomes $\hat f(x) = w(x)\, p_j/\mu_w(L_j)$, a piecewise rescaling of the prior.

Plain volume is the special case $w \equiv 1$. The method is best described as a tree with an explicit reference measure, and "volume" as its default instance.

### 3.6 Escape mass and honest codes

A code must assign finite length to every point it may be asked to encode. If a leaf is fitted to training points and a held-out point falls into a leaf with estimated mass $p_j = 0$, its code length is infinite. Two standard repairs keep the code valid:

- **Smoothed leaf probabilities.** Use additive smoothing or, as in Section 3.4, the Krichevsky–Trofimov estimator for the branch codes. Their cost has known regret bounds, and it is charged inside the split criterion itself, so the same smoothing that keeps held-out codes finite also governs which split is chosen.
- **Escape mixture.** Mix each leaf's density with its parent's:
  $$\hat f_j^{\text{mix}} = (1-\eta)\,\hat f_j + \eta\,\hat f_{\text{parent}}.$$
  This bounds the worst-case cost per point by $\log_2(1/\eta)$ plus the parent's cost.

The holdout and prequential evaluation in Section 4.3 make the code *honest*: model parameters are never chosen using the same points whose code length they are credited with reducing.

---

## 4. Split Generators and the Holdout Sweep

### 4.1 Splits as level sets

At a node with region $N$, let a *generator* produce a scalar field $f_\theta : \mathbb{R}^d \to \mathbb{R}$. The candidate splits are the level sets
$$L_t = N \cap \{x : f_\theta(x) < t\}, \qquad R_t = N \cap \{x : f_\theta(x) \ge t\}.$$

The same field also proposes *two-sided slabs*,
$$S_{t_1, t_2} = N \cap \{x : t_1 \le f_\theta(x) < t_2\},$$
with the complement as the other child. A slab on an affine field is a band; on a radial quadratic it is a shell. Slabs matter because many lawful structures are thin on both sides of a level set. A one-sided split must cut one face of the band, then wait for a second split to cut the other, and greedy growth may refuse the first cut because it pays only jointly with the second. Section 9 shows that slabs cost nothing extra in oracle work.

The tree algorithm does not care what $f_\theta$ is. Admissible generators include:

- **Affine** fields $a^\top x + c$, giving oblique hyperplanes.
- **Quadratic** forms $x^\top Q x + a^\top x + c$, giving ellipsoids, hyperboloids, slabs, and cylinders.
- **RBF-SVM** decision functions $f(x) = b + \sum_i c_i \exp(-\gamma \|x - x_i\|^2)$, with $c_i = \alpha_i y_i$.
- **Polynomial kernels**, logistic models, small neural networks, symbolic expressions, and ensembles.

Every node also considers one deliberately simple candidate: contracting the node's region to the tight axis-aligned bounding box of its points. This baseline costs $2d$ thresholds. Its role is defensive. Without it, a complex generator can appear to pay for itself merely by trimming empty margin that the reference box happened to include; with it, a curved boundary must beat the cheapest margin-trimming move before it is credited with discovering structure.

A leaf is the intersection of the parent region with a sequence of such sublevel, superlevel, or slab sets. Its measure is what the oracle in Section 5 must bound.

This separation, with the generator *proposing* geometry and the codec *evaluating* it, is the architectural core of the method. It turns the "tree" into a recursive model decomposition with no fixed split language.

### 4.2 Fitting a field without fitting a split

How does a generator choose $\theta$ when the target is code length, not classification? One effective option for kernel fields is to manufacture a contrast problem: label observed points as positive, and points drawn from the reference measure $\mu$ restricted to $N$ as negative. Then fit a classifier. This is the classical device of turning density estimation into supervised learning against a reference sample (Hastie, Tibshirani & Friedman, 2009, §14.2.4).

The decision field of such a classifier is large where data are dense relative to the reference. Its level sets are therefore natural candidates for regions with high $p/q$ ratio. For affine and quadratic generators, a cheaper alternative works well:

- principal directions of the node's points, and
- minimum-volume enclosing ellipsoids or slabs around subsets.

The fitted field does not need to be optimal. It only needs to propose good level sets. The threshold, and the decision whether to split at all, are settled by the codec.

### 4.3 The holdout sweep

Fitting a flexible field is expensive. Sweeping a threshold is cheap. The procedure at a node is:

1. Partition the node's observations into a fitting set and a holdout set.
2. Fit $f_\theta$, and any hyperparameters such as $\gamma$ and $C$ for an RBF-SVM, on the fitting set only.
3. Evaluate $z_i = f_\theta(x_i)$ on the holdout set and sort.
4. For each candidate threshold $t$ (or threshold pair $t_1 < t_2$) between consecutive sorted values:
    - read off the holdout counts $(n_L(t), n_R(t))$ in $O(1)$ amortized time;
    - query the oracle for interval bounds on $V_L(t)$ and $V_R(t)$.
5. Compute interval bounds on $G(t)$ and keep the threshold whose lower bound is largest, subject to it being positive.

Two different kinds of evidence meet in this step:

- **Empirical evidence:** do unseen observations fall where the boundary predicts they will concentrate?
- **Geometric evidence:** how much of the admissible space does the boundary actually remove?

A boundary that wraps tightly around fitting points creates apparent concentration that holdout points do not confirm. The holdout counts then fail to diverge from the geometric fractions, and the KL term collapses.

**Charging each component once.** A holdout split interacts with two-part accounting in two ways that are easy to get wrong. First, if $\theta$ is fitted on the fitting set alone, a decoder that has already received the fitting set can refit $\theta$ itself. Charging the full $C_{\text{split}}(\theta)$ while crediting compression only on the holdout points then counts the boundary's complexity twice. Second, sweeping many families, hyperparameters, and thresholds against the same holdout set quietly turns it into a second training set; that selection must be paid for. Two protocols are internally consistent:

- **Two-stage conditional code.** Transmit the fitting points under the parent's code, with no gain credited. The decoder refits $f_\theta$ deterministically, so $\theta$ costs zero bits. The holdout points are then encoded with the split, and the charge is only for what the decoder cannot reconstruct: the family index ($\log_2$ of the number of families), the hyperparameter grid index, the threshold choice, and the KT branch code. The gain is credited on $n_{\text{hold}}$ points.
- **Full-sample two-part code.** Use the holdout split only to *propose* and screen thresholds. Evaluate the final gain on all $n$ points at the node, charging the full $C_{\text{split}}(\theta, t)$ with the parameter encodings of Section 3.4.

Either is honest. The first is cleaner when $\theta$ is expensive to describe, as with many support vectors; the second wastes no data when $\theta$ is cheap.

A fully prequential variant (Dawid, 1984) removes the choice of holdout fraction. The code length of each point is computed under a model fitted only to earlier points. This gives a single honest number per candidate split. Its cost is geometric as much as statistical: every refit of $\theta$ changes the regions whose measure must be bounded. A *block-prequential* code over dyadic blocks (fit on the first $2^k$ points, encode the next $2^k$) keeps most of the benefit while calling the oracle only about $\log_2 n$ times per candidate.

### 4.4 Sweeping scale

For an RBF generator, $\gamma$ sets the spatial scale over which each center has influence, and $C$ trades margin against training error. The node search is conceptually
$$(\gamma, C, t)^* = \arg\max_{\gamma, C, t} \Big[\, n\, D_{\mathrm{KL}}\big(p(t)\,\|\,q(t)\big) - C_{\text{split}}(\gamma, C, t) \Big],$$
with $p(t)$ taken from holdout counts.

Larger $\gamma$ allows tighter, more fragmented regions, but it typically increases the number of support vectors and therefore $C_{\text{split}}$. The criterion settles the trade-off without a separate regularization parameter.

---

## 5. The Measure Oracle

### 5.1 Interface

The tree is only one consumer of the geometry. The more fundamental component is a *measure oracle* with roughly this interface:

    measure(region, tolerance)  -> [lower, upper]
    restrict(region, predicate) -> region
    intersect(A, B)             -> region
    union(A, B)                 -> region
    conditional(A, B, tol)      -> [lower, upper]   # bounds on mu(A ∩ B) / mu(B)

A region is a Boolean combination of predicates over a bounding box. The oracle never claims more precision than it has certified; every answer is an interval. Different back-ends can implement the interface:

- exact polytope volume,
- box subdivision with function-range certificates,
- randomized estimators with confidence intervals,
- or hybrids.

### 5.2 Box subdivision as measure accumulation

Let a region be $S = \{x \in B_0 : g_k(x) \le 0,\ k = 1..K\}$. Maintain a set of boxes, each tagged IN, OUT, or UNKNOWN. For a box $B$, compute bounds $\underline{g}_k(B) \le g_k(x) \le \overline{g}_k(B)$ for all $x \in B$, then classify:
$$
B \mapsto
\begin{cases}
\text{IN} & \overline{g}_k(B) \le 0 \ \text{ for all } k,\\[2pt]
\text{OUT} & \underline{g}_k(B) > 0 \ \text{ for some } k,\\[2pt]
\text{UNKNOWN} & \text{otherwise.}
\end{cases}
$$
Split UNKNOWN boxes, usually by bisecting the longest edge, and classify the children. At every stage,
$$V^- = \sum_{B \in \text{IN}} \mu(B) \;\le\; \mu(S) \;\le\; V^- + \sum_{B \in \text{UNKNOWN}} \mu(B) = V^+ .$$

This is interval branch-and-bound turned from optimization to integration. A branch-and-bound optimizer would discard a box once it cannot contain the optimum. Here a box is *banked* once its classification is certain.

Two practical refinements apply:

- **Constraint dropping.** A predicate certified satisfied on a box can be dropped for all of that box's descendants, so deep boxes test only the predicates that remain active. This is what keeps deep leaves, which are intersections of many predicates, affordable: most ancestors' predicates are certified long before the box reaches the current split's boundary.
- **Midpoint estimate.** A point estimate between $V^-$ and $V^+$ can be formed by evaluating the predicates at the center of each UNKNOWN box. It is not certified, but it is useful for ranking which boxes to refine first.

Certification quality is determined entirely by the range bounds. The tiers below supply increasingly expensive bounds for increasingly general predicates. For fields that fit none of them, first-order Taylor models or affine arithmetic (de Figueiredo & Stolfi, 2004) give a generic fallback. They track linear correlations between subexpressions and so avoid the dependency problem that makes naive interval arithmetic loose on anything but the simplest expressions.

### 5.3 Tier 1: affine predicates

For $g(x) = a^\top x + c$ on a box with center $m$ and half-widths $h$, the exact range is
$$g(m) \pm \sum_{i=1}^d |a_i|\, h_i .$$

This costs $O(d)$, with no vertex enumeration. Affine predicates are never ambiguous due to loose bounds. A box is UNKNOWN only if the hyperplane actually passes through it.

For leaves that are pure intersections of half-spaces, exact polytope volume algorithms are an alternative in low dimension. Box subdivision remains useful when such a leaf must be intersected with nonlinear predicates further down the tree.

### 5.4 Tier 2: quadratic predicates and Hessian certificates

For $q(x) = x^\top Q x + a^\top x + c$, the Hessian $H = Q + Q^\top$ is constant and known exactly. This is the key structural advantage over generic interval arithmetic: convexity does not need to be estimated, because it can be read off $H$ once, at construction time.

**Convex case ($H \succeq 0$).**

- *Maximum:* a convex function on a box attains its maximum at a vertex. So $\max_B q = \max_v q(v)$ over the vertices. If every vertex satisfies $q(v) \le 0$, the whole box is IN.
- *Minimum (cheap bound):* the supporting hyperplane at the center gives
  $$q(x) \ge q(m) + \nabla q(m)^\top (x - m),$$
  whose minimum over the box is available in closed form via the affine rule of Section 5.3. If that bound is positive, the box is OUT.
- *Minimum (exact):* when the cheap bound is inconclusive, the exact minimum solves a small convex box-constrained QP. If the unconstrained minimizer $-H^{-1}a$ lies inside the box, it is simply that point.

**Concave case ($H \preceq 0$).** The roles reverse. The minimum is at a vertex, and the maximum is bounded above by the tangent plane, $q(x) \le q(m) + \nabla q(m)^\top(x - m)$.

**Indefinite case.** Decompose $H = H_+ - H_-$ with both parts positive semidefinite, for example from the eigendecomposition. This writes
$$q = q_+ - q_-$$
as a difference of convex quadratics with the linear and constant terms assigned to either part. Then:

- **Upper bound for $q$:** an upper bound on $q_+$ from its vertex maximum, minus a lower bound on $q_-$ from its tangent plane.
- **Lower bound for $q$:** symmetric.

An alternative is the αBB construction (Androulakis, Maranas & Floudas, 1995). It adds $\alpha \sum_i (x_i - l_i)(x_i - u_i)$, which is non-positive on the box, with $\alpha$ chosen to make the sum convex. The added term vanishes at the vertices and its magnitude shrinks quadratically with box width, so the bound tightens rapidly under subdivision.

### 5.5 Vertex induction

Vertex-based certificates raise an obvious cost question. A box in $d$ dimensions has $2^d$ vertices.

**Inheritance under bisection.** When a box is bisected along one axis, each child inherits $2^{d-1}$ vertices from the parent. The other $2^{d-1}$ vertices lie on the cutting hyperplane and are *shared* between the two children. Producing both children therefore needs $2^{d-1}$ new evaluations, not $2^{d+1}$: a fourfold saving at every split.

**Sharing across the whole subdivision.** Box corners in a dyadic subdivision of $B_0$ have dyadic rational coordinates. A hash map keyed on integer dyadic coordinates lets neighboring boxes reuse each other's corners, not just those of their parent. The subdivision tree thereby becomes a *geometric memoization structure*. Corner information propagates downward and sideways, and only genuinely new lattice points are evaluated. The map has its own costs: memory grows with the number of distinct corners touched, and for cheap predicates a lookup can cost more than an evaluation. In practice, passing corner arrays from parent to child captures most of the saving up to $d \approx 8$, and the global map earns its overhead mainly for expensive fields, such as RBFs with many centers.

**Incremental evaluation.** For quadratics, a new vertex differs from a known one by a step $\delta$ along a single axis $k$:
$$q(x + \delta e_k) = q(x) + \delta\, \partial_k q(x) + \tfrac{1}{2}\delta^2 H_{kk}.$$
The update costs $O(1)$ if the gradient is cached, and the gradient itself updates in $O(d)$ via $\nabla q(x + \delta e_k) = \nabla q(x) + \delta H_{:,k}$.

**When to stop enumerating.** Even with all of these savings, enumerating vertices is exponential in $d$. It is the right tool in low to moderate dimension, roughly $d \lesssim 12$. Above that, the closed-form affine and tangent-plane bounds, which never enumerate vertices, should carry the load. Vertex certificates are then used only on the few boxes where those bounds are inconclusive, or replaced by solving the box-constrained QP directly.

### 5.6 Tier 3: radial-basis decision fields

An RBF-SVM boundary is not quadratic. It is a weighted sum of exponentials of quadratics. Its structure still gives direct, cheap bounds, so it does not have to pass through the quadratic tier.

For a box $B$ and center $x_i$, the minimum and maximum squared distances are separable across coordinates:
$$d_{i,\min}^2(B) = \sum_k \operatorname{dist}(x_{ik}, [l_k, u_k])^2, \qquad d_{i,\max}^2(B) = \sum_k \max\big((x_{ik} - l_k)^2, (x_{ik} - u_k)^2\big).$$

Because $e^{-\gamma r^2}$ decreases in $r$, each kernel term is bracketed:
$$e^{-\gamma d_{i,\max}^2} \le e^{-\gamma\|x - x_i\|^2} \le e^{-\gamma d_{i,\min}^2}.$$

Accounting for the signs of the weights $c_i$ gives
$$\overline{f}(B) = b + \sum_{c_i > 0} c_i e^{-\gamma d_{i,\min}^2} + \sum_{c_i < 0} c_i e^{-\gamma d_{i,\max}^2},$$
and $\underline{f}(B)$ by exchanging $d_{i,\min}$ and $d_{i,\max}$. Then:

- $\overline{f}(B) < t$ certifies $B \subseteq L_t$.
- $\underline{f}(B) \ge t$ certifies $B \subseteq R_t$.
- Otherwise the box is subdivided.

Centers whose maximum possible contribution over $B$, $|c_i| e^{-\gamma d_{i,\min}^2}$, falls below a tolerance can be folded into a single error term and dropped from all descendants of $B$. This gives the RBF tier the same "constraint dropping" economy as the polynomial tiers.

The bounds tighten as boxes shrink: the gap $d_{i,\max}^2 - d_{i,\min}^2$ is proportional to box diameter. Because the per-center bounds are taken independently, they ignore the fact that all terms are evaluated at the *same* point. Near the decision boundary, where positive and negative centers nearly cancel, a first-order Taylor model of $f$ about the box center (Section 5.2) is often much tighter and is worth trying before subdividing.

### 5.7 Tier 4: statistical fallback

In high dimension, certified subdivision suffers the curse of dimensionality. The number of boundary boxes at resolution $r$ scales like $r^{-(d-1)}$ times the boundary area. The fallback is a randomized estimator: rejection sampling from simple enclosing sets, or random-walk methods for convex bodies. It reports a confidence interval in place of a certified one.

The choice of interval matters because of how the intervals are used. A fixed-sample interval, such as Clopper–Pearson on the acceptance fraction, is valid only if the sample size is fixed in advance and the interval is consulted once. The racing loop of Section 6 does neither: it samples, looks, decides whether to sample more, and compares many candidates at once. The fallback should therefore use *anytime-valid confidence sequences* (Howard, Ramdas, McAuliffe & Sekhon, 2021), which remain valid under optional stopping, and allocate the failure probability $\delta$ across active candidates with a union bound such as Holm–Bonferroni.

The proposal distribution matters as well. What the gain needs is $\log_2 V_L$, and the relative error of a rejection estimate grows like $\sqrt{(1-q)/(mq)}$ for acceptance fraction $q$ after $m$ samples. Sampling from the root domain is hopeless for small leaves. Samples should instead be drawn from the parent's surviving boxes (IN $\cup$ UNKNOWN), with IN boxes accounted exactly and only UNKNOWN boxes sampled, or from a minimum-volume enclosing ellipsoid of the parent region.

The rest of the system consumes intervals and is indifferent to their provenance. An interval's semantics (certified or probabilistic, at confidence $1 - \delta$) should still be recorded, so that downstream decisions can report what they actually guarantee.

---

## 6. Decision-Directed Refinement

### 6.1 Gain intervals

The oracle returns $V_L \in [V_L^-, V_L^+]$ and $V_R \in [V_R^-, V_R^+]$. The parent measure $V_P$ is either already known or itself an interval.

It is tempting to compute the gain interval by plugging endpoints into the formula of Section 3.3 independently, on the grounds that $G$ decreases in $V_L$ and in $V_R$. That is wrong in two ways. First, $V_L$ and $V_R$ are not independent: they are bound by $V_L + V_R = V_P$, so combinations such as both at their lower bounds may be jointly infeasible, and the resulting interval is loose. Second, at the start of subdivision no box has yet been certified IN, so $V_L^- = 0$, and endpoint substitution gives $G^+ = +\infty$. Every candidate then looks potentially unbounded, and the race of Section 6.2 can eliminate nothing.

Both problems disappear when the gain is written in terms of a child's share of measure, $q_L = V_L/(V_L + V_R)$. Up to terms that do not depend on geometry,
$$G(q_L) = n_L \log_2 \frac{1}{q_L} + n_R \log_2 \frac{1}{1 - q_L} - \ell_{\text{branch}}(n_L, n_R) - C_{\text{split}},$$
where $\ell_{\text{branch}}$ is $nH_2(p_L)$ or the KT code of Section 3.4. With the plug-in branch code this is exactly $n\,D_{\mathrm{KL}}\big((p_L, p_R)\,\|\,(q_L, 1 - q_L)\big) - C_{\text{split}}$. In either case $G$ is strictly convex in $q_L$ and minimized at $q_L = p_L$.

Since $q_L$ increases with $V_L$ and decreases with $V_R$, the oracle's bounds give
$$\underline{q}_L = \frac{\hat V_L^-}{\hat V_L^- + V_R^+}, \qquad \overline{q}_L = \frac{V_L^+}{V_L^+ + \hat V_R^-}, \qquad \hat V^- = \max(V^-, v_\varepsilon),$$
where the clamp applies the resolution floor of Section 7.5. By convexity, the maximum of $G$ over $[\underline q_L, \overline q_L]$ is at an endpoint, and the minimum is at $p_L$ if the interval contains it, otherwise at the nearer endpoint:
$$G^+ = \max\big(G(\underline q_L),\, G(\overline q_L)\big), \qquad
G^- = \begin{cases} G(p_L) & p_L \in [\underline q_L, \overline q_L],\\ \min\big(G(\underline q_L),\, G(\overline q_L)\big) & \text{otherwise.}\end{cases}$$

The floor keeps $G^+$ finite at cold start. Before anything is certified, $G^+$ equals the cost of locating the left-side points at full resolution, which is the largest saving physically possible, and it falls as soon as IN boxes are banked on either side.

Note that under subdivision, $V_L^-$ and $V_R^-$ both grow from IN boxes, and $V_L^+ = V_P - V_R^-$.

### 6.2 Racing candidates

Training needs only the *argmax* of the gain, and only if it is positive. It does not need any gain to high precision. Refinement can therefore stop as soon as the decision is certified:

- **Reject:** if $G^+ < 0$ for a candidate, it can never pay for itself.
- **Accept:** if $G^-_{A} > \max_{B \ne A} G^+_{B}$ and $G^-_A > 0$, candidate $A$ wins.
- **Refine:** otherwise, refine only the candidates whose intervals overlap the current leader's.

For example, with $G_A \in [0.421, 0.424]$ and $G_B \in [0.38, 0.40]$ (in bits per point), integration stops: $A$ already wins. With $G_A \in [0.421, 0.424]$ and $G_B \in [0.420, 0.427]$, both candidates are refined, and only where it matters.

Some races cannot be settled cheaply: two candidates may be genuinely tied to within any precision the oracle can afford. A hard subdivision budget $B_{\max}$ per node bounds the work. When it is exhausted, the candidate with the largest lower bound is taken if that bound is positive; otherwise the node becomes a leaf. A near-tie means the choice barely affects code length, so this rule costs little.

### 6.3 Where to refine

Within a candidate, the sensitivity of the gain to the child's share of measure is
$$\frac{\partial G}{\partial q_L} = \frac{n}{\ln 2}\cdot\frac{q_L - p_L}{q_L(1 - q_L)}.$$

A child with many points and small volume is therefore where volume uncertainty most affects the gain. Refinement should prioritize UNKNOWN boxes by the product of:

- their measure,
- the sensitivity of the side they could fall on,
- and, for comparisons, whether that candidate is still contested.

This is a geometric analogue of racing algorithms in bandit-style model selection. The computational question changes from "what is this volume to $10^{-8}$?" to "do I know enough about this volume to make the modeling decision?" The second question is usually far cheaper to answer.

---

## 7. Least-Entropy Function–Measure Relations

### 7.1 Constraints as explanations

Consider what the objective rewards in its general, not necessarily tree-shaped, form. A model $M$ consists of a set of functional constraints that defines, for each observation, a region $R_M(x)$ still compatible with it. Up to a constant, the cost is
$$\mathcal{L}(M) = L(M) + \sum_i \Big[\ell_{\text{select}}(x_i) + \log_2 \mu\big(R_M(x_i)\big)\Big].$$

Adding a constraint $g$ is worthwhile approximately when
$$\sum_i \log_2 \frac{\mu(\text{region before } g)}{\mu(\text{region after } g)} \;>\; L(g) + \text{(branch bits)}.$$

This gives an operational definition of explanation:

> **A function explains a set of points when describing the function costs fewer bits than describing the variation it removes.**

The objective searches for the cheapest functions under which observed mass occupies the most surprisingly small share of the available measure:
$$f^* = \arg\max_f \Big[N\, D_{\mathrm{KL}}\big(P^{f}_{\text{data}} \,\big\|\, Q^{f}_{\text{measure}}\big) - L(f)\Big].$$

### 7.2 A worked example: a noisy line

Let $D = [0,1]^2$ with Lebesgue measure. Suppose $N = 1000$ points lie uniformly in the band $|y - (0.3 + 0.4x)| < 0.01$, a strip of area $0.02$ inside the square.

- **The lawful slab.** A two-sided slab on the affine field $y - \beta_0 - \beta_1 x$, with thresholds $\pm w$, isolates the band in a single split; a quadratic split $(y - \beta_0 - \beta_1 x)^2 < w^2$ does the same. The volume fraction is $q \approx 0.02$ and the empirical fraction is $p \approx 1$. The gain is about $\log_2(1/0.02) \approx 5.64$ bits per point, or roughly 5,600 bits in total. The description is three real parameters, $\beta_0$, $\beta_1$, and $w$, at about $\tfrac{1}{2}\log_2 1000 \approx 5$ bits each, plus a few bits for the family, threshold, and branch regret. The constraint pays for itself by more than two orders of magnitude.
- **An axis-aligned tree.** It must cover the band with a staircase. With $k$ steps of width $1/k$, each box has height about $0.4/k + 0.02$. The covering area is $0.4/k + 0.02$, which approaches the band's area only as $k$ grows. Each step costs its own thresholds. The criterion finds the right staircase for a given $N$, but it is uniformly dominated by the single oblique slab.
- **An RBF island model.** It could cover the band more tightly, for example by following noise in the sample. But each center costs a pointer and a weight even under the economical encoding of Section 3.4. On holdout points, the extra tightness is not confirmed, because the true band is uniform. The KL term barely improves while $C_{\text{split}}$ grows, so the RBF candidate loses.

The criterion thus recovers the generating relation $y \approx 0.3 + 0.4x$ *and* its noise width. It does this not because it was asked to regress $y$ on $x$, but because that relation is the shortest description of where the points are.

### 7.3 Relations, not regressions

Nothing privileges $y = f(x)$ over any other form. A constraint $g(x_1, \dots, x_d) \approx 0$ is treated identically, so the method searches for implicit relations: circles, conservation laws, and coupled constraints among several variables. There is no designated response variable. The two-sided slab $|g(x)| < w$ is the natural form of such a constraint, and it is a single split.

The criterion also does not ask whether a function is "true." It asks whether the function is *cheap relative to the measure it removes*, given the evidence. A more complicated $f_2$ that leaves $1/1000$ of the residual volume of $f_1$ buys $\log_2 1000 \approx 10$ bits per point. It wins exactly when its extra description costs less than $10N$ bits and holdout points confirm the tighter region.

### 7.4 Emergent intrinsic dimension

Suppose data in a 20-dimensional ambient box lie near a 3-dimensional structure. Before any constraints, the code spends bits on all 20 coordinates. Each successful constraint collapses measure in one or more directions transverse to the structure.

Once the transverse extent has shrunk to the noise scale, further constraints stop paying for themselves:

- holdout points stop confirming tighter bands, or
- the band reaches the resolution floor $v_\varepsilon$, below which no further bits can be saved.

The residual code then describes position *along* the structure plus deviations of noise scale. The number of directions in which measure was collapsed is an estimate of the codimension. **Intrinsic dimension is never asked for; it appears as a consequence of compression.**

This can be made visible with a *codimension and scale profile*: along each root-to-leaf path, plot the cumulative drop in $\log_2 \mu$ against the cumulative $C_{\text{split}}$ spent to achieve it. Collapse onto a structure shows as a few large drops, each bought cheaply, followed by a plateau. Mere tiling of a diffuse density shows as many small drops, each paying close to break-even. The profile separates the two cases without asking the model to report a dimension.

### 7.5 The resolution floor

The resolution $\varepsilon$ is not just bookkeeping. Collapsing a region below $v_\varepsilon$ saves nothing, because the decoder cannot use sub-resolution information. A practical implementation should therefore cap the residual cost from below at zero bits, that is, enforce $\mu(R) \ge v_\varepsilon$.

The floor has a sharper form that ties it to the oracle. What the decoder really pays for is the number of $\varepsilon$-cells a region touches, not its Lebesgue measure. For a thin or curved region, such as a filament or shell near the noise scale, the two differ: the cell count is governed by the region's $\varepsilon$-neighborhood, and hence by its surface area, rather than by its volume. Box subdivision measures exactly this when it is stopped at side length $\varepsilon$. The outer measure $V^+$, the total measure of IN and UNKNOWN boxes at that depth, *is* the count of touched cells times $v_\varepsilon$. Terminating subdivision at the resolution of the code is therefore not an approximation to the right quantity; it computes the right quantity, and it is also what keeps the racing bounds of Section 6.1 finite.

In consequence, the "laws" the method recovers are relative to the precision of measurement. Coarse measurements support only coarse laws. This is the expected behavior of an MDL criterion.

### 7.6 The end state

The model that results is not a large explicit table of $p(x)$. It is
$$\text{Distribution} \;\approx\; \text{a short collection of functional constraints} \;+\; \text{a residual measure}.$$

This is a compact, inspectable answer to the question: *what is the shortest set of laws that turns the observed data from a large address space into a small one?*

How inspectable it is depends on which generators won. Sparse affine and quadratic constraints, especially slabs, read as symbolic laws: a line with a width, a conic with a tolerance. Deep intersections of RBF level sets compress just as honestly, but what they offer a reader is spatial accounting, not a formula. The two outcomes are worth distinguishing in reporting. The generator families can also be restricted deliberately when the goal is law discovery, not raw compression; the price of that restriction is then itself measured in bits.

---

## 8. A Geometric Overlap Algebra for Models

Once a measure oracle exists, it is useful beyond trees. Any model whose outputs can be expressed as predicates over a shared parameter space defines measurable regions. Examples are a tree's leaves, an SVM's positive class, a constraint system's feasible set, or a rule's firing region. Such regions can be compared without reference to the machinery that produced them:
$$P_\mu(A \mid B) = \frac{\mu(A \cap B)}{\mu(B)}, \qquad J_\mu(A, B) = \frac{\mu(A \cap B)}{\mu(A \cup B)} .$$

This is the sense in which volume is a common denominator, a *co-denominator*, between unrelated models. Three uses stand out.

**Extrapolation agreement.** Given models $M_1, \dots, M_k$, the matrix $A_{ij} = J_\mu(M_i, M_j)$ measures agreement over the *whole* reference measure, not only at observed points. Two classifiers with identical test accuracy can have very different overlap matrices. Their disagreement then lies where observations are scarce, which is exactly where validation metrics cannot see. The overlap matrix exposes divergent extrapolation behavior that accuracy hides. As with the split gain, the answer is relative to $\mu$: overlap over an arbitrarily large bounding box can be dominated by regions no one cares about, so the reference measure should encode the operating envelope of interest.

**Geometric ensembles.** An ordinary forest asks how many trees voted for a class at a point. A measure-aware ensemble can also ask how much of a region the members agree about. This gives region-level confidence statements that pointwise voting cannot express.

**Constraint and feasibility analysis.** For engineering design spaces, $\mu(\text{feasible})$, $P_\mu(\text{safe} \mid \text{feasible})$, and the measure of disagreement between a learned surrogate and a physics-based constraint set are all oracle queries. Each comes with certified bounds where the predicates admit them.

Because the oracle returns intervals, every quantity in this algebra carries an error bar. The decision-directed refinement of Section 6 applies whenever the downstream question is a comparison, for example: is $A$ more consistent with $B$ than with $C$?

---

## 9. Algorithm Summary

    TrainNode(region N, points X, measure oracle O):
        if stopping rule triggers (no budget, |X| small): return Leaf(N, X)
        split X into X_fit, X_hold
        candidates = [TightBoxContraction(N, X)]          # mandatory baseline
        for generator family F in {affine, quadratic, rbf, ...}:
            for hyperparameters h in grid(F):
                f = F.fit(X_fit, N, h)              # e.g., data-vs-reference contrast
                boxes = O.box_tree(N, f)            # built once per field
                z = sort(f(X_hold))
                for split s in thresholds(z) ∪ slabs(z):    # f < t, or t1 <= f < t2
                    (nL, nR) = counts(z, s)
                    (VL, VR) = boxes.measure(s)             # intervals, from shared sweep
                    G  = gain_interval(nL, nR, VL, VR,      # convex bound, Sec. 6.1
                                       KT(nL, nR), cost(F, h, f, s))
                    candidates.append((f, s, G))
        winner = Race(candidates, O, budget)        # refine only contested intervals
        if winner is None or winner.G_lower <= 0: return Leaf(N, X)
        L = N ∩ winner.region
        R = N \ winner.region
        return Node(winner, TrainNode(L, X ∩ L, O), TrainNode(R, X ∩ R, O))

    Race(candidates, O, budget):
        drop candidates with G_upper < 0
        while the leader's G_lower <= max over others of G_upper and budget remains:
            pick contested candidate and side with largest uncertainty × sensitivity
            refine that side's UNKNOWN boxes (O), recompute G
        return leader if its G_lower > 0, else None

Here `cost` follows whichever accounting protocol of Section 4.3 is in use: under the two-stage conditional code it charges only the family index, the grid index, and the threshold choice; under the full-sample code it also charges the parameters, and the gain is recomputed on all of $X$.

Two implementation notes:

- **Sharing work across thresholds.** Oracle state should be shared across thresholds of the same field. The box tree for $f_\theta$ on region $N$ is built once. Each box stores its interval $[\underline f(B), \overline f(B)]$. A box is IN for threshold $t$ when $\overline f(B) < t$, so a single sweep over boxes sorted by their bounds yields $V^-(t)$ and $V^+(t)$ for *all* thresholds at once. Slabs come for free from the same sweep: the bounds on $\mu(t_1 \le f < t_2)$ are differences of the one-sided bounds at $t_2$ and $t_1$, taken in the direction that keeps them valid. This single-sweep structure is what makes a threshold sweep cost one integration, not one per threshold.
- **Prediction.** At inference time, the tree serves as a density, $\hat f(x) = p_j / \mu(L_j)$, using the midpoint or certified bound of each leaf measure. It also serves as a codec, as a structural summary of the data (its list of constraints), and as a source of regions for the overlap algebra.

---

## 10. Limitations and Open Problems

- **Dimension.** Certified subdivision scales poorly with $d$. The statistical tier keeps the method usable, at the price of probabilistic rather than certified guarantees. Whether low-dimensional structure in the *predicates*, such as fields depending on few coordinates or on few projections, can be exploited to keep certified subdivision tractable is open.
- **Cost of describing kernel fields.** Charging honestly for support vectors is delicate. Section 3.4 prices centers as pointers into data the decoder already holds, and Section 4.3 shows how a conditional code can make fitted parameters free. Which encoding is right depends on the coding protocol, and the choice affects which models win; it deserves systematic study.
- **Search, not only scoring.** The criterion scores splits, but finding the best field in a rich family is a nonconvex search. Data-versus-reference contrast fitting is a reasonable proposal mechanism, but not an optimizer of the actual objective. Gradient-based refinement of $\theta$ against a smoothed code length is a natural next step.
- **Choice of reference measure.** The KL formulation makes it explicit that structure is always *relative to* $\mu$. A poorly chosen $\mu$, for example an over-large bounding box, inflates early gains. The tight-box baseline of Section 4.1 keeps that inflation from being credited to complex generators, but it does not remove the dependence. A prior that encodes the wrong physics distorts which relations look surprising.
- **Greedy construction.** Like other trees, top-down growth is myopic. Pairs of constraints that only pay off jointly may be missed unless the generator families include them directly. Two-sided slabs and quadratic generators cover the most common case, the two faces of a band; joint constraints on several fields remain an open problem.
- **Discrete and mixed variables.** The method assumes a continuous reference measure. Categorical coordinates can be handled with counting measure on product spaces, but this has not been worked out in detail.

---

## 11. Proposed Evaluation

The claims made here are testable, and several of them are cheap to test. Even a minimal prototype in two or three dimensions would show whether the central mechanisms behave as described, and should precede any claim at scale. An appropriate evaluation would include:

1. **Synthetic relation recovery.** Data are sampled near known implicit relations (lines, conics, tori, low-dimensional manifolds in high-dimensional boxes) at controlled noise and resolution. Measure whether the learned constraints recover the generating relation and its noise width, how many splits that takes compared with axis-aligned density trees, and whether the number of collapsed directions matches the codimension. Report the codimension and scale profile of Section 7.4 for each case.
2. **Density estimation benchmarks.** Compare held-out log-likelihood (equivalently, code length) against:
    - histograms with MDL binning,
    - Density Estimation Trees,
    - log-loss partition trees,
    - and kernel density estimators.
      Comparisons should be at matched model description length, and are best presented as a curve of model bits against held-out code length.
3. **Oracle efficiency.** Measure, across dimensions from about 2 to 16:
    - certified-gap width versus number of evaluations, with and without vertex inheritance, incremental updates, Taylor-model bounds, and Hessian certificates;
    - the fraction of split decisions settled by racing before any candidate's gap falls below a fixed tolerance;
    - the saving from the shared single-sweep box tree relative to integrating each threshold separately.
4. **Overlap diagnostics.** Construct classifier pairs that agree on more than 99% of test points drawn from a narrow manifold but extrapolate differently away from it, and test whether the overlap matrix separates them.
5. **Ablations.** Compare:
    - Lebesgue versus prior-weighted reference measure;
    - holdout, conditional two-stage, full-sample, and block-prequential coding;
    - plug-in versus KT branch codes;
    - one-sided splits versus slabs, with and without the tight-box baseline;
    - each generator family in isolation.

---

## 12. Conclusion

The proposal starts from a small accounting change: count the bits needed to locate a point inside its leaf, not merely the bits needed to name the leaf. That change turns geometric measure into the probability algebra of a decision tree. Split quality becomes a KL divergence between empirical and geometric mass, net of the cost of the boundary. The tree becomes a piecewise-uniform density and a recursive codec. Complexity control becomes a matter of bookkeeping rather than tuning, provided the bookkeeping is done carefully: universal branch codes, parameters priced by what the decoder cannot reconstruct, and each component charged exactly once.

Computation is carried by a measure oracle that returns certified intervals. Its tiers are:

- exact affine box ranges,
- Hessian-aware certificates for quadratics,
- inherited and incrementally updated vertex evaluations,
- per-center bounds for RBF fields,
- and statistical estimates, with anytime-valid confidence sequences, as a fallback.

Because the gain is convex in each child's share of measure, those intervals translate into tight gain intervals. Because the training procedure needs only to know *which* split wins, it can stop refining geometry as soon as that is certain.

The broader view is that the tree is a demonstration application. The more fundamental object is the triple of a predicate language, a reference measure, and an adaptive measure oracle. Trees use it for split selection. Ensembles use it for geometric agreement. Constraint systems use it for feasible-space measure. Model comparison uses it for conditional overlap. And when the objective is code length, the method's output is a short list of functional constraints that best explains where the data are, together with the residual measure those constraints leave behind.

---

## References

- Androulakis, I. P., Maranas, C. D., & Floudas, C. A. (1995). αBB: A global optimization method for general constrained nonconvex problems. *Journal of Global Optimization*, 7(4), 337–363.
- Barron, A. R., & Cover, T. M. (1991). Minimum complexity density estimation. *IEEE Transactions on Information Theory*, 37(4), 1034–1054.
- Breiman, L., Friedman, J., Olshen, R., & Stone, C. (1984). *Classification and Regression Trees*. Wadsworth.
- Büeler, B., Enge, A., & Fukuda, K. (2000). Exact volume computation for polytopes: A practical study. In *Polytopes — Combinatorics and Computation*, DMV Seminar 29, Birkhäuser.
- Cover, T. M., & Thomas, J. A. (2006). *Elements of Information Theory* (2nd ed.). Wiley.
- Dawid, A. P. (1984). Present position and potential developments: Some personal views — statistical theory, the prequential approach. *Journal of the Royal Statistical Society, Series A*, 147(2), 278–292.
- de Figueiredo, L. H., & Stolfi, J. (2004). Affine arithmetic: Concepts and applications. *Numerical Algorithms*, 37, 147–158.
- Dyer, M. E., & Frieze, A. M. (1988). On the complexity of computing the volume of a polyhedron. *SIAM Journal on Computing*, 17(5), 967–974.
- Dyer, M., Frieze, A., & Kannan, R. (1991). A random polynomial-time algorithm for approximating the volume of convex bodies. *Journal of the ACM*, 38(1), 1–17.
- Gray, R. M., & Neuhoff, D. L. (1998). Quantization. *IEEE Transactions on Information Theory*, 44(6), 2325–2383.
- Grünwald, P. D. (2007). *The Minimum Description Length Principle*. MIT Press.
- Hastie, T., Tibshirani, R., & Friedman, J. (2009). *The Elements of Statistical Learning* (2nd ed.). Springer.
- Howard, S. R., Ramdas, A., McAuliffe, J., & Sekhon, J. (2021). Time-uniform, nonparametric, nonasymptotic confidence sequences. *Annals of Statistics*, 49(2), 1055–1080.
- Jaulin, L., & Walter, E. (1993). Set inversion via interval analysis for nonlinear bounded-error estimation. *Automatica*, 29(4), 1053–1064.
- Kontkanen, P., & Myllymäki, P. (2007). MDL histogram density estimation. In *Proceedings of AISTATS*.
- Krichevsky, R., & Trofimov, V. (1981). The performance of universal encoding. *IEEE Transactions on Information Theory*, 27(2), 199–207.
- Lawrence, J. (1991). Polytope volume computation. *Mathematics of Computation*, 57(195), 259–271.
- Li, D., Yang, K., & Wong, W. H. (2016). Density estimation via discrepancy based adaptive sequential partition. In *Advances in Neural Information Processing Systems 29*.
- Moore, R. E., Kearfott, R. B., & Cloud, M. J. (2009). *Introduction to Interval Analysis*. SIAM.
- Murthy, S. K., Kasif, S., & Salzberg, S. (1994). A system for induction of oblique decision trees. *Journal of Artificial Intelligence Research*, 2, 1–32.
- Ram, P., & Gray, A. G. (2011). Density estimation trees. In *Proceedings of the 17th ACM SIGKDD International Conference on Knowledge Discovery and Data Mining*, 627–635.
- Rissanen, J. (1978). Modeling by shortest data description. *Automatica*, 14(5), 465–471.
- STree: Oblique tree classifier based on SVM nodes. Software, Doctorado-ML (GitHub; PyPI package `STree`).
- Wong, W. H., & Ma, L. (2010). Optional Pólya tree and Bayesian inference. *Annals of Statistics*, 38(3), 1433–1459.