# Coupled Uncertain Theory Trees: Algorithm Specification and Experiment Plan

## 1. Purpose

This document specifies an algorithm, and the experiments that should test it, for learning decision-tree theories from observations whose feature values and labels are uncertain. Uncertainty is treated as part of the geometry the tree operates on, not as metadata attached to samples.

The system has three intended capabilities:

1. **Learn a partition from uncertain observations.** Each observation is a region of feature space, not a point. Each label is a set of possible classes, not a single class.
2. **Push information backward into the observations.** A learned partition, combined with the labels, constrains where each uncertain observation could have been. Those constraints can tighten the observations, and the tightened observations can be used to learn a better partition.
3. **Map the space of competing theories.** The system does not stop at one preferred explanation. It searches for explanations that fit almost as well while differing as much as possible. It then reports which inferred facts hold across all of them and which depend on the chosen explanation.

The central structural idea is the **compiled observation**. When a master tree partitions feature space, each uncertain observation is cut by the master splits it straddles. The result is a persistent, sparse subordinate tree, the *point-tree*. The point-tree's leaves are fragments of the original observation, and their masses are the latent variables the system solves for. Splitting compiles uncertainty into topology once. After that, most learning is redistribution of mass over a fixed topology rather than repeated re-splitting.

Probabilistic routing of uncertain instances through decision trees is established machinery. What this specification treats as the novel part, and what the experiments should test, is the combination of four things:

- The induced partition of each observation is kept as persistent state.
- That state is solved jointly with the shared tree.
- Hard support inference is kept strictly separate from soft distribution inference.
- The set of near-optimal solutions is treated as a primary output.

The most distinctive output is a *latent* Rashomon set: theories that agree closely on predictions but disagree on where the observations actually were.

## 2. Scope of the First Prototype

The first prototype is deliberately narrow:

- Numeric features only, each with a known bounded domain.
- Axis-aligned interval uncertainty per feature, so each observation is a box.
- Categorical labels, given as allowed label sets. A singleton set means a fully supervised observation.
- Axis-aligned binary master-tree splits.
- A fixed-topology solver (SOLVE, CHALLENGE, BOUNDS) as the core deliverable.
- Structural learning of the master tree as a second layer, added only after the fixed-tree solver behaves as intended.

These are explicitly out of scope for the first prototype and are treated as extensions:

- Correlated or non-box uncertainty regions.
- Regression leaves.
- Structural (topology-changing) CHALLENGE.
- Measurement recommendation beyond the core fixed-tree version of §5.11.

## 3. Data Model

### 3.1 Uncertain observation

A raw observation $i$ consists of:

- **Support** $S_i^{(0)} = [a_{i1}, b_{i1}] \times \dots \times [a_{id}, b_{id}]$, a box inside the feature domain $\mathcal{X}$.
- **Allowed label set** $Y_i \subseteq \{1, \dots, C\}$, non-empty.
- **Optional label prior** $\rho_i(c)$ over $Y_i$. It is uniform if nothing is known.

All of the usual observation cases become degrees of the same object:

| Case | Representation |
|---|---|
| Exact measurement | Degenerate interval $[a, a]$ |
| Noisy measurement | Interval $[a, b]$ |
| Missing value | Full feature domain $[\min \mathcal{X}_j, \max \mathcal{X}_j]$ |
| Censored value | One-sided interval clipped to the domain |
| Fully supervised label | $\lvert Y_i \rvert = 1$ |
| Partial label | $\lvert Y_i \rvert > 1$ |
| Unlabeled observation | $Y_i = \{1, \dots, C\}$ |

### 3.2 Master tree

The master tree $T$ is a binary tree of axis-aligned tests $x_j < t$. Every node $n$ owns a box region $R_n$, and the leaf regions $\{R_\ell\}$ partition $\mathcal{X}$.

### 3.3 Compiled observation (point-tree)

Compiling observation $i$ against $T$ produces the point-tree $T_i = C_T(S_i)$. It is the subtree of $T$ containing exactly the nodes $n$ whose region meets $S_i$ with positive measure in the non-degenerate dimensions of $S_i$. A degenerate observation reaches the unique path containing it.

Each leaf of $T_i$ is a **fragment** $f = (i, \ell)$ with region $R_{i\ell} = S_i \cap R_\ell$. The fragments of $i$ partition $S_i$ exactly.

Each point-tree node caches a fixed set of statistics:

- **Geometric prior mass** $\pi_{in} = \mathrm{vol}(R_n \cap S_i) / \mathrm{vol}(S_i)$.
    - Because both regions are boxes, this factorizes over dimensions. It is computed incrementally along tree edges. At each split on dimension $j$, the parent's mass is multiplied by the one-dimensional length ratio $\lvert [a_{ij}, b_{ij}] \cap [l_{nj}, u_{nj}] \rvert / \lvert [a_{ij}, b_{ij}] \cap [l_{pj}, u_{pj}] \rvert$, where $[l_{nj}, u_{nj}]$ and $[l_{pj}, u_{pj}]$ are the child's and parent's extents on dimension $j$.
    - $d$-dimensional volumes are never formed. This avoids floating-point underflow at moderate dimension ($d = 30$ in E10).
    - Degenerate dimensions are dropped from the computation.
    - For zero-width boxes, $\pi$ is 1 on the unique containing leaf.
- **Current fitted mass** $\hat{w}_{in}$, equal to the sum of its children's masses.
- **Mass envelope** $[\underline{w}_{in}, \overline{w}_{in}]$, filled by the BOUNDS procedure.
- **Class-conditioned mass** $\hat{w}_{in}\, q_i(c)$.
- **Admissibility flags**, produced by the support solve.

### 3.4 Per-observation state

The full state of observation $i$ is

$$X_i = \big(S_i,\; [\underline{\mathbf{w}}_i, \overline{\mathbf{w}}_i],\; \hat{\mathbf{w}}_i,\; q_i\big)$$

where:

- $S_i$ is the hard remaining support: where the point could still be.
- $[\underline{\mathbf{w}}_i, \overline{\mathbf{w}}_i]$ is the range of fragment masses compatible with near-optimal theories.
- $\hat{\mathbf{w}}_i$ is the preferred fitted distribution over surviving fragments.
- $q_i$ is the fitted label distribution, supported on $Y_i$.

### 3.5 Theory

For a fixed topology $T$, a **theory** is

$$\theta = (S, W, Q, \Phi)$$

with the following components:

- $S = \{S_i\}$ are the supports.
- $W = \{\hat{\mathbf{w}}_i\}$ are the fragment masses.
- $Q = \{q_i\}$ are the label distributions.
- $\Phi = \{\varphi_\ell\}$ are the leaf class distributions.

Neither $\Phi$ nor $Q$ is a free parameter:

- $\Phi$ is computed from $W$ and the label priors.
- $Q$ is read off after convergence (§5.4).

A theory is therefore determined by $(S, W)$.

The **feasible theory space** at tolerance $\epsilon$ is

$$\mathcal{T}_\epsilon = \{\theta : F(\theta) \le F(\theta_0) + \epsilon\},$$

where:

- $F$ is the total free energy (§5.4);
- $\theta_0$ is the SOLVE result;
- $\epsilon = N\bar{\epsilon}$ is a per-observation tolerance $\bar{\epsilon}$ scaled by the number of observations.

The same functional defines the preferred theory, the challenger theories, and the envelopes. A theory space filtered by a different loss than the one its anchor theory minimizes would be incoherent: perturbed theories could appear to fit *better* than $\theta_0$.

## 4. Design Principles

These principles are binding. Every algorithmic choice below follows from them, and several experiments exist specifically to test whether they matter.

**P1. Epistemic firewall.** Support and distribution are different kinds of knowledge.
- Support contraction records what the evidence rules out.
- Fitted weights record what the current theory prefers.
- Weights never silently become support. A model assigning 99% of a point's mass to one cell has not measured that point.
- Soft quantities never enter hard rules. This includes fractional label counts, priors, and fitted masses.

**P2. Monotone, topology-preserving contraction.** Support may only shrink, and it may only shrink by eroding its boundary. A box stays a box: faces move inward, and holes are never punched. Inference may contract an observation but may not increase its topological complexity. Relaxations of this rule are benchmark variants (§5.8, E7), not defaults.

**P3. No self-consumption.** When a point's own weights are updated, the leaf statistics used must exclude that point's own contribution. Evidence must come from other observations. A model must not manufacture confidence by repeatedly consuming its own inference.

Leave-one-out removes the direct cycle $i \to \ell \to i$. It does not by itself remove two other routes to self-reinforcement:

- **Within-point feedback**, between an observation's location and its own label. §5.4 removes this by construction.
- **Collective feedback**, $i \to \ell \to i' \to \ell \to i$, in which a group of symmetric observations herd each other onto an arbitrary answer. Damping, restarts, and CHALLENGE mitigate it, and E3 and E6 test for it directly.

**P4. Underdetermination is output, not failure.**
- Multiple near-equivalent solutions are preserved and characterized.
- The width of the feasible theory space is reported.
- An algorithm that converges confidently on an arbitrary answer to an unidentifiable question has failed, even if its accuracy is high.

**P5. Separate topology from inference.** Changing the master tree enlarges the representational basis. Solving weights operates inside that basis. These are distinct operations with distinct triggers.

**P6. Rebuild from hard knowledge only.** When structural learning is re-run on refined data, it consumes contracted supports. It never consumes fitted weights.

## 5. Algorithm

The algorithm is organized as a set of operations. Sections 5.1–5.8 assume a fixed master tree. Sections 5.9–5.11 add structure, prediction, and measurement recommendation.

### 5.1 Compilation

**Input:** master tree $T$ and observation supports $\{S_i\}$.

**Procedure:**

1. For each observation, descend $T$ from the root. At each internal node with test $x_j < t$, branch according to how the interval relates to $t$:

   | Relation | Route |
      |---|---|
   | $a_{ij} \ge t$ | Right only |
   | $b_{ij} \le t$ and $a_{ij} < t$ | Left only |
   | $a_{ij} < t < b_{ij}$ | Both children, clipping the interval on dimension $j$ for each branch |

   The inequalities are strict on purpose. A non-degenerate interval that merely touches $t$ at its upper end is routed left only, rather than spawning a zero-volume fragment $[t, t]$ on the right. A degenerate interval at exactly $t$ follows the test and goes right.
2. Record every reached node in $T_i$, and cache geometric prior masses $\pi$ incrementally (§3.3).
3. Build the inverse index: for every master leaf $\ell$, the list of fragments $(i, \ell)$ that occupy it.

**Incremental recompilation.** When a master leaf $\ell$ is split at $(j, t)$, only observations with a fragment in $\ell$ are touched. Each such fragment becomes one or two child fragments, and the parent node's mass becomes the sum of its children. No other point-tree changes.

**Invariants to enforce:**

- Fragment regions of $i$ partition $S_i$.
- $\sum_\ell \pi_{i\ell} = 1$.
- Node mass equals the sum of child masses.
- No fragment of a non-degenerate support has zero prior mass.
- Recompiling from scratch yields the same point-trees as incremental updates.

### 5.2 Leaf evidence and anchors

Two kinds of leaf statistics are maintained, matching the firewall.

**Anchor evidence (hard).** An observation is an *anchor* of leaf $\ell$ if its entire current support lies inside $R_\ell$, i.e. it has exactly one surviving fragment. Anchors are located without inference. For each leaf and class, compute:

- The anchor count $n_\ell$.
- Class counts $n_{\ell c}$ over anchors with singleton label sets.

Only singleton-label anchors enter exclusion tests. A fractional rule such as $1/\lvert Y_i \rvert$ per allowed class is a prior, not evidence, so it never feeds the hard layer (P1). Where a partial-label anchor must be used, it enters under the worst case for exclusion: it counts toward every class in $Y_i$. Fractional counts remain available for the soft statistics below.

Each anchor also records its **derivation depth**:

- Depth 0 if its raw support already lay inside one leaf.
- Depth $k + 1$ if it became an anchor through a contraction whose provenance used anchors of depth at most $k$.

**Subtree anchors (variant).** In higher dimensions or with wide intervals, few observations fit inside a single leaf, and the hard layer can go inert (§9). As a benchmarked variant (A10), an observation is a *subtree anchor* of internal node $n$ if $S_i \subseteq R_n$.

- Node-level class counts are formed the same way as leaf counts.
- A node-level exclusion of class $c$ is lifted to a descendant leaf $\ell$ only if no anchor of class $c$, at any level, lies inside $R_\ell$.
- Lifted exclusions are weaker evidence, because a node-level rate says nothing about how classes distribute among its leaves. They are tagged as lifted in all provenance.

**Fitted statistics (soft).**

$$\varphi_\ell(c) = \frac{\alpha + \sum_i \hat{w}_{i\ell}\, \tilde{q}_i(c)}{C\alpha + \sum_i \hat{w}_{i\ell}}$$

This uses a symmetric Dirichlet pseudo-count $\alpha$. Here $\tilde{q}_i$ is the label prior $\rho_i$ during solving (§5.4).

For any update concerning observation $i$, the leave-one-out version $\varphi_\ell^{-i}$ is used. It subtracts $i$'s own contribution from numerator and denominator. Cached totals make this a constant-time adjustment per fragment.

### 5.3 SUPPORT SOLVE (monotone contraction)

**Goal:** eliminate parts of each observation's support that are incompatible with the evidence, while preserving box shape. In standard terms, this is a *statistical box-consistency* procedure over the master partition.

**Fragment admissibility.**

- Leaf $\ell$ *excludes* class $c$ when both of the following hold:
    - The anchor count is at least $m_{\min}$.
    - An upper confidence bound on $P(c \mid \ell)$ falls below a tolerance $\tau_{\mathrm{excl}}$. The bound is an exact Clopper–Pearson binomial bound computed from anchor counts.
- Because this test is applied across all $L$ leaves and $C$ classes, it uses a family-wise corrected level $\alpha'_{\mathrm{excl}} = \alpha_{\mathrm{excl}} / (L \cdot C)$. An uncorrected level makes false exclusions in deep trees close to certain.
- A fragment $(i, \ell)$ is **inadmissible** if leaf $\ell$ excludes every class in $Y_i$.

Leaves with too few anchors exclude nothing. Absence of evidence never counts as evidence of absence. The tolerance $\tau_{\mathrm{excl}} > 0$ provides robustness to label noise.

**Face erosion.** For each observation $i$, dimension $j$, and side (lower or upper):

1. Collect candidate cut positions. These are the master thresholds on dimension $j$ that lie strictly inside the current interval and appear in $T_i$.
2. Consider moving the face inward to a candidate position. The removed **slab** is $S_i \cap \{x_j < t\}$ for the lower face, or the mirror image for the upper face.
3. The slab is removable only if every fragment intersecting it is inadmissible. A fragment that straddles the cut is truncated; its remaining part is still inadmissible.
4. Choose the most aggressive removable cut.

**Synchronous sweeps.** Each sweep has three steps:

1. Compute leaf exclusions once from the anchor set at the start of the sweep.
2. Erode faces for all observations against those frozen exclusions, in a fixed round-robin order over faces.
3. Recount anchors, and from them exclusions, only between sweeps.

This makes each sweep's result independent of observation order, which §7 requires.

**Latching.** Exclusions are latched: once a leaf excludes a class, it continues to do so. Supports only shrink, so anchor sets only grow. Normally, new anchors cannot carry an excluded class into a leaf that excludes it. If the upper confidence bound for a latched exclusion would later rise above $\tau_{\mathrm{excl}}$, the exclusion is not silently revoked. The leaf is flagged as an **exclusion inconsistency**, which is a diagnostic in the same family as contradictions.

**Propagation.** Contraction can turn observations into anchors, and new anchors can create new exclusions. Repeat full sweeps until no face moves.

- Termination is guaranteed: supports only shrink, and only through a finite set of thresholds.
- To keep one false exclusion from cascading through derived anchors, exclusion tests may use only anchors of derivation depth at most $k_{\mathrm{prop}}$. The value of $k_{\mathrm{prop}}$ is declared per run.
- False exclusion (M4) is reported broken down by derivation depth.

**Safeguards.**

- Support never becomes empty. If all fragments of an observation would be inadmissible, no contraction is applied. The observation is flagged as a **contradiction**, which is a diagnostic output and a signal for structural growth or label error.
- Anchors used to exclude classes for leaf $\ell$ never include the observation being contracted. This is automatic, because an observation being contracted has more than one fragment and so is not an anchor.

**Theory-conditional variant (optional, reported separately).** A fragment is inadmissible if its upper mass bound $\overline{w}_{i\ell}$ (§5.6) is below $\tau_w$ across the discovered theory ensemble. This is weaker evidence than anchor exclusion. It must be labeled as theory-conditional and must never feed the default rebuild loop.

**Output:**

- Contracted supports $S_i'$.
- Per-dimension tightening.
- A list of contradictions and exclusion inconsistencies.
- The exclusion provenance for each removed slab: which leaf, which anchors and their derivation depths, which classes, and whether the exclusion was lifted from a subtree.

### 5.4 SOLVE (distribution solve within fixed support)

**Goal:** find the preferred theory $\theta_0$, i.e. fitted fragment masses inside the frozen supports. In standard terms, this is leave-one-out variational EM over a fixed partition.

**Per-observation objective (free-energy form).** For fixed leaf statistics, observation $i$ minimizes

$$J_i(\mathbf{w}_i) = \sum_\ell w_{i\ell}\,\big(-\log g_{i\ell}\big) + \beta\,\mathrm{KL}(\mathbf{w}_i \,\|\, \boldsymbol{\pi}_i),
\qquad g_{i\ell} = \sum_{c \in Y_i} \rho_i(c)\, \varphi_\ell^{-i}(c)$$

over the simplex on surviving fragments. The closed-form minimizer is

$$w_{i\ell} \propto \pi_{i\ell}\; g_{i\ell}^{1/\beta}.$$

The temperature $\beta$ sets how strongly label evidence may move mass away from the geometric prior:

- $\beta = 1$ is the Bayesian posterior under a piecewise-uniform prior.
- $\beta > 1$ is deliberately conservative.
- $\beta \to \infty$ freezes mass at the prior.

**Partial labels are marginalized, not alternated.** For $\lvert Y_i \rvert > 1$, the likelihood $g_{i\ell}$ integrates over the allowed labels using the prior $\rho_i$. The point's own label distribution is not updated during the solve.

Alternating between $\mathbf{w}_i$ and $q_i$ would let a point's tentative location sharpen its own label, and that label sharpen its location. This is within-point self-consumption that leave-one-out cannot see.

After convergence, the label distribution is read off as

$$q_i(c) \propto \mathbb{1}[c \in Y_i]\, \rho_i(c) \Big(\sum_\ell \hat{w}_{i\ell}\, \varphi_\ell^{-i}(c)\Big)^{1/\beta}.$$

The alternating scheme is kept only as an ablation (A11).

**Total free energy.** The quantity that ranks theories, and that defines $\mathcal{T}_\epsilon$ (§3.5), is

$$F(\theta) = \sum_i J_i\big(\hat{\mathbf{w}}_i;\, \Phi^{-i}(\theta)\big).$$

**Iteration.**

1. Initialize $\hat{\mathbf{w}}_i = \boldsymbol{\pi}_i$.
2. Alternate:
    - recompute leaf statistics;
    - update all $\mathbf{w}_i$ using leave-one-out statistics.
3. Apply damping $\eta \in (0, 1]$: new state = $(1 - \eta)\cdot$old $+ \eta\cdot$update.
4. Stop when the maximum total-variation change per observation falls below tolerance, or an iteration cap is reached.

**Restarts.** Run $R$ restarts from perturbed initializations, using Dirichlet noise around $\boldsymbol{\pi}_i$.

- Distinct fixed points are recorded as candidate theories, not discarded.
- $\theta_0$ is the restart with the lowest $F$.

**Explanatory loss.** The more interpretable quantity

$$L(\theta) = -\sum_i \log \sum_\ell w_{i\ell} \sum_{c \in Y_i} \varphi_\ell^{-i}(c)$$

is reported alongside $F$. It is the leave-one-out probability that each observation's label falls in its allowed set.

$L$ is not what SOLVE minimizes. The free energy charges for moving mass away from the prior, and $L$ does not. A theory may therefore have lower $L$ than $\theta_0$ while lying outside $\mathcal{T}_\epsilon$. Held-out predictive loss is tracked separately and reported alongside both.

### 5.5 CHALLENGE (near-equivalent alternative theories)

**Goal:** find the theory most different from all previously discovered theories that still fits within tolerance $\epsilon$:

$$\theta_{k} = \arg\max_{\theta \in \mathcal{T}_\epsilon} D\big(\theta, \{\theta_0, \dots, \theta_{k-1}\}\big)$$

In standard terms, this is repulsive exploration of a latent Rashomon set.

**Distance $D$.** A primary measure plus two secondary ones.

- **Primary: latent disagreement.**

  $$D\big(\theta, \{\theta_{k'}\}_{k'<k}\big) = \min_{k' < k} \frac{1}{N} \sum_i \mathrm{TV}\big(\mathbf{w}_i, \hat{\mathbf{w}}_i^{(k')}\big)$$

  The minimum sits *outside* the average. A new theory must differ from each previous theory as a whole. It cannot qualify as a "chimera" that copies one previous theory on some observations and another on the rest. This measure captures "different reconstruction of where the points were."
- **Secondary: leaf-semantics disagreement.** Mass-weighted total-variation distance between $\varphi_\ell$ vectors.
- **Secondary: predictive disagreement.** The fraction of held-out queries whose argmax prediction differs. This is reported, not maximized. The interesting regime is high latent disagreement with low predictive disagreement.

**Solution method (nearest-theory repulsion).**

1. Add a repulsion term to each per-observation objective. It penalizes overlap with the *nearest* previous theory $k^\star = \arg\min_{k'<k} D(\theta, \theta_{k'})$, recomputed at each outer iteration:

   $$J_i^{\mathrm{ch}} = J_i + \lambda \sum_\ell w_{i\ell}\, \hat{w}^{(k^\star)}_{i\ell}$$

   This yields $w_{i\ell} \propto \pi_{i\ell}\, g_{i\ell}^{1/\beta} \exp\!\big(-\tfrac{\lambda}{\beta} \hat{w}^{(k^\star)}_{i\ell}\big)$.

   Repelling from the sum of all previous theories is not used. On the simplex, two complementary previous theories sum to a near-constant, and their repulsion cancels.
2. Sweep $\lambda$ over a grid.
3. For each $\lambda$, run the SOLVE iteration to a fixed point, starting both from $\theta_0$ and from fresh perturbations.
4. Among results with $F \le F(\theta_0) + \epsilon$, keep the one with the largest $D$.
5. The leaf statistics $\Phi$ follow automatically from the new masses. Leaf semantics are therefore free to change, which is what allows a genuinely different explanation to emerge.

**Iteration and stopping (theory-space saturation).** Repeat CHALLENGE, adding each accepted theory to the ensemble. Stop when either:

- the best achievable $D$ falls below $\delta_D$, or
- a new theory widens no fragment envelope by more than $\delta_{\mathrm{env}}$.

The system reports the number of theories found as a measure of underdetermination.

**Diversity–fit curve.** For every $\lambda$, record $D$, predictive disagreement, $F - F(\theta_0)$, and $L - L(\theta_0)$. Plot latent and predictive disagreement against fit loss on the same axes. The curve shows how different an explanation can become before its explanatory power collapses, and whether that difference shows up in predictions at all. It is a primary output.

**Topology conditionality.** CHALLENGE explores theories within one master topology. If the topology does not contain a split that a competing explanation needs, CHALLENGE cannot find that explanation. Statuses built on the ensemble are then conditional on the topology. §5.9 provides a topology-union option for this case. Every report states which topology the theory space was explored in.

### 5.6 BOUNDS (fragment mass envelopes)

**Goal:** for each fragment, find the range of mass consistent with near-optimal theories. Two estimates are computed and reported separately. Ablation A9 compares them.

1. **Ensemble envelope (inner approximation).** The minimum and maximum of $\hat{w}_{i\ell}$ across all accepted theories. It is cheap. It is guaranteed to lie within the true range but may underestimate it.
2. **Local convex envelope.** This bounds each fragment's mass with the leaf semantics held at each accepted theory's values.
    - With $\Phi$ fixed, $J_i$ is convex in $\mathbf{w}_i$: linear terms plus KL.
    - With $\Phi$ fixed, the problem is also separable across observations. A single global budget $\epsilon$ would therefore be spent entirely on whichever observation is being bounded, which makes the bounds vacuous. A per-observation budget is used instead: $J_i(\mathbf{w}_i) \le J_i(\hat{\mathbf{w}}_i) + \bar{\epsilon}$.
    - Maximizing $w_{i\ell^\star}$ under this constraint has an exponential-tilt solution:

      $$w_{i\ell} \propto \pi_{i\ell}\, g_{i\ell}^{1/\beta}\, \exp\big(\nu\, \mathbb{1}[\ell = \ell^\star]\big).$$

      The constraint is monotone in $\nu \ge 0$, so the bound is found exactly by a one-dimensional bisection on $\nu$. The minimum uses $\nu \le 0$. No general convex solver is required.
    - Take the union over accepted theories.
    - **Interval-semantics variant.** To capture first-order coupling between masses and leaf semantics, $\varphi_\ell$ may instead range over $[\underline{\varphi}_\ell, \overline{\varphi}_\ell]$, its extremes across the ensemble. Each bisection then uses the most favorable $g_{i\ell}$ within those intervals.

   This captures slack the ensemble missed. It is still conditional on the leaf-semantics configurations discovered, and it must be labeled as such.

**Neither estimate is a certified global bound**, because $\Phi$ depends on $W$ and the full problem is non-convex. The specification requires stating this wherever envelopes are displayed.

### 5.7 Epistemic classification of inferred facts

Every fragment, and by aggregation every observation, receives one status, with fixed thresholds $\kappa$:

| Status | Criterion | Meaning |
|---|---|---|
| **Observed** | Fragment existed in raw support and was never touched | No inference involved |
| **Excluded** | Removed by anchor-based support solve | Evidence-constrained, hard |
| **Forced** | $\underline{w}_{i\ell} \ge 1 - \kappa_f$ and the evidence test below passes | Every near-optimal theory puts the point here |
| **Robust** | $\overline{w}_{i\ell} - \underline{w}_{i\ell} \le \kappa_r$ and the evidence test below passes | Mass is pinned regardless of theory |
| **Theory-dependent** | Wide envelope and accepted theories disagree systematically | The data admits competing reconstructions |
| **Underdetermined** | The evidence test fails, or the envelope approximately spans prior-to-extreme range while all theories stay near $\pi$ | Nothing in the data speaks to it |

**Evidence test.** A narrow envelope is not evidence by itself. At high $\beta$, every theory is tethered to $\boldsymbol{\pi}_i$, so envelopes can be narrow simply because nothing is allowed to move. A fragment can be Forced or Robust only if the data actually distinguishes the observation's fragments in at least one accepted theory:

$$\max_{\ell, \ell'} \big\lvert \log g_{i\ell} - \log g_{i\ell'} \big\rvert > \kappa_u.$$

Otherwise the fragment is Underdetermined, however narrow its envelope.

All of these statuses are conditional on the topology in which theories were explored (§5.5).

The aggregate report summarizes the tightening ladder: observed → logically constrained → theory-inferred → underdetermined.

### 5.8 Contraction levels (experimental relaxation axis)

The default contraction rule is Level 0. Other levels exist only to be benchmarked against it.

| Level | Allowed support change |
|---|---|
| 0 | Outer-fragment trimming only, at master thresholds (default) |
| 1 | Continuous face contraction (faces may stop at non-threshold positions, e.g. tightest admissible point within a straddling fragment) |
| 2 | One internal zero region allowed, so support may have two connected components |
| $k$ | At most $k$ connected components |
| Free | Any fragment may be zeroed independently |

At every level, contraction still requires anchor-based inadmissibility. The levels relax only the shape rule, not the evidence rule. A comparison is therefore only meaningful where anchors exist. When too few leaves pass $m_{\min}$, every level degenerates into a no-op, so E7 controls for anchor availability (§8.11).

### 5.9 Structural learning of the master tree

**Split candidates.** At a node, for each dimension $j$, candidate thresholds are drawn from:

- the sorted endpoints $a_{ij}, b_{ij}$ of supports reaching the node, and
- the midpoints between consecutive endpoints.

Candidates are subsampled to a fixed budget per node when necessary.

**Split scoring.** Three criteria are specified so they can be compared.

- **S1 — Expected impurity.** Weighted Gini or entropy, with each observation contributing its geometric prior mass $\pi$ to each side. This is the baseline used in the uncertain-tree literature.
- **S2 — Crisp worst-case impurity.**
    - Mass certain to go one way counts normally.
    - Straddling mass is assigned adversarially to maximize impurity.
    - The score is the worst-case impurity reduction.
    - This favors splits whose benefit does not depend on where uncertain points actually were.
- **S3 — Ambiguity reduction per complexity.**
    - Numerator: the expected reduction in a proxy for theory-space volume, namely total straddling mass whose allowed labels disagree with the dominant anchor labels on either side.
    - When a child has fewer than $m_{\min}$ anchors, its dominant label is taken from prior-weighted label proportions instead. Otherwise S3 cannot score any split once anchors become scarce.
    - Denominator: added complexity, i.e. one node plus $\gamma \times$ the number of new fragments created.
    - This ties tree growth to the cost of fragmenting point-trees, not only to label purity.

**Stopping.** A node becomes a leaf when any of these holds:

- The total prior mass reaching it, $\sum_i \pi_{in}$, is below $m_{\mathrm{leaf}}$.
- Depth equals $d_{\max}$.
- The best score is below a threshold.
- The fragment budget would be exceeded.

Anchor count is deliberately not a stopping criterion. Once boxes straddle splits on two or more dimensions, almost no observation fits inside a deep node. An anchor-count rule would halt growth after two or three splits regardless of the data. Anchor counts are still recorded per node as a diagnostic.

**Rebuild loop (support-driven).**

1. Learn $T_0$ from raw supports $D_0$.
2. Compile and run SUPPORT SOLVE to obtain contracted supports $D_1$.
3. Learn $T_1$ from $D_1$.
4. Repeat until either:
    - total contracted volume changes by less than $\delta_V$, or
    - consecutive trees agree on more than a fixed fraction of anchor assignments.
5. Freeze the final tree and supports, then run SOLVE, CHALLENGE, and BOUNDS.

Per P6, fitted weights never enter the rebuild.

**Residual-driven growth (alternative mode).** Instead of rebuilding from scratch, keep $T$ and split individual leaves when the current partition is insufficient. Its triggers fall on two sides of the firewall:

- **Hard triggers (firewall-compliant):**
    - contradictions are concentrated in the leaf;
    - anchors of conflicting classes coexist in the leaf.
- **Soft triggers (firewall-relaxing):**
    - accepted theories disagree materially on $\varphi_\ell$;
    - envelope width is concentrated in fragments occupying the leaf.

Soft triggers let fitted weights shape topology, which P1, P5, and P6 otherwise forbid. They are therefore a quarantined ablation, tested in E6, and never the default structural learner.

After each split, recompile incrementally. Re-solve both warm-started from the previous fixed point and from fresh restarts, so that symmetry breaking in an earlier solve is not locked in by the path taken.

The two modes are compared in experiments.

**Topology union (option).** A greedy learner facing two redundant features will typically split on one and stop, because the second split adds no purity. Fixed-topology CHALLENGE then cannot see the competing explanation, and fragments relying on the chosen feature look falsely robust. Two remedies are specified, and either may be used:

- **Refinement.** Build the fixed topology as the common refinement of the top-$k$ candidate root splits by score ($k$ small). This keeps a single partition in which every candidate explanation is expressible.
- **Multiplexer.** Place a root node whose children are $K$ diverse candidate trees.
    - Each observation's mass is split across them as a further latent choice.
    - Theories may move mass between subtrees.
    - Differences between theories are summarized at the feature level: which feature each theory leans on.

### 5.10 Prediction for new observations

1. Compile the query support against $T$. There is no label, so there is no support contraction.
2. Set fragment masses using one of:
    - (a) the geometric prior $\pi$, or
    - (b) $\pi$ reweighted by the training mass density in each leaf. This is legitimate population information. The choice is reported.
3. The class distribution is $\sum_\ell w_\ell\, \varphi_\ell(c)$, computed under $\theta_0$.
4. Repeat the computation under every accepted theory to give a prediction envelope.
5. Report both the point prediction and its envelope.

### 5.11 Measurement recommendation

For each observation-dimension pair $(i, j)$:

1. Simulate tightening dimension $j$ of $S_i$ to each of its surviving inter-threshold segments.
2. For each simulation, recompute envelopes locally, with $\Phi$ fixed at each accepted theory. In the full version, add a first-order correction for $i$'s contribution to leaf statistics.
3. Weight the outcomes by current fitted mass to obtain the expected reduction in total envelope width.
4. Rank pairs by this expected reduction.

The output is a ranked list of the form "measure feature $j$ of observation $i$ more precisely." The ranking identifies which uncertain bounds keep competing theories observationally equivalent.

The **core version** is part of the main evaluation (E11, stage gate 5), because it is the clearest practical payoff of BOUNDS. It uses a fixed tree, ensemble and local envelopes, and no first-order correction. The full version, with first-order correction and learned trees, remains an extension.

## 6. Outputs of a Run

A complete run produces:

1. The master tree, with per-leaf anchor counts, fitted class distributions, and per-theory class distributions.
2. Per observation:
    - raw support and contracted support;
    - exclusion provenance;
    - point-tree;
    - fitted masses;
    - envelopes;
    - epistemic status;
    - **feature-level credible intervals**. Fragment envelopes are projected back onto each coordinate axis. For each dimension, the report gives the interval that certainly contains the point (hard support) and the sub-interval to which near-optimal theories give non-negligible mass. Users think in feature values, not fragments.
3. The accepted theory ensemble, with:
    - each theory's $F$ and $L$;
    - pairwise latent and predictive distances;
    - the diversity–fit curve;
    - the topology the ensemble was explored in.
4. A contradiction list and an exclusion-inconsistency list.
5. Structural statistics:
    - master nodes, leaves, total fragments, and fragments per observation;
    - active anchor fraction, overall and per leaf;
    - solver iterations and rebuild iterations.
6. A prediction function returning point predictions with envelopes.
7. Ranked measurement recommendations (core version; full version as extension).

The hyperparameters are numerous: $m_{\min}$, $\alpha_{\mathrm{excl}}$, $\tau_{\mathrm{excl}}$, $k_{\mathrm{prop}}$, $\beta$, $\bar{\epsilon}$, $\lambda$ grid, and the $\kappa$ thresholds. They are bundled into three declared presets:

| Preset | Intended behavior |
|---|---|
| **strict** | Maximal protection against false exclusion and false certainty |
| **balanced** | The default |
| **exploratory** | Wider tolerance and more aggressive CHALLENGE for mapping theory space |

Every run reports its preset and any overrides.

## 7. Verification Properties

These properties must hold before any experiment is meaningful. Each is checked on randomized inputs.

- **Mass conservation.** For every observation and theory, fragment masses sum to 1, and every point-tree node equals the sum of its children.
- **Partition exactness.** Fragment regions exactly tile the support, with no overlap and no gaps.
- **No degenerate fragments.** Non-degenerate supports never produce zero-mass fragments, including for intervals with an endpoint exactly on a threshold.
- **Support monotonicity.** Every support is a subset of its previous version. At Level 0, every support remains a single box.
- **Non-emptiness.** No support becomes empty. Would-be empties appear in the contradiction list.
- **Exclusion monotonicity.** Latched exclusions never disappear within a run. Would-be revocations appear in the exclusion-inconsistency list.
- **Exact-data reduction.** With all intervals degenerate and all labels singleton:
    - every observation has one fragment;
    - support solve is a no-op;
    - SOLVE is trivial;
    - structural learning with S1 reproduces standard CART on the same data.
- **Order invariance.** Permuting observation order changes no output beyond solver tolerance. This includes SUPPORT SOLVE, which is guaranteed by synchronous sweeps.
- **Incremental equivalence.** Incremental recompilation after a split equals full recompilation.
- **Leave-one-out correctness.** An observation's update is unchanged by arbitrary changes to its own previous masses, given fixed other observations.
- **Envelope nesting.** For every fragment, the ensemble envelope lies within the local convex envelope. Both lie within $[0, 1]$.
- **Prior limit.** With $\beta \to \infty$, fitted masses equal $\pi$, CHALLENGE finds no theory beyond $\theta_0$, and every non-excluded fragment is classified Underdetermined.

## 8. Experiment Plan

### 8.1 Common protocol

**Latent truth.** Every experiment starts from clean latent points $x_i^*$ and true labels $y_i^*$. The latent points are discarded before training and used only for evaluation.

**Feature corruption.** Each coordinate is replaced by an interval of width $w_{ij}$ containing the truth.

- The truth's position inside the interval is drawn uniformly. Intervals are **never centered on the truth**, because centering leaks the answer through the midpoint and invalidates every latent-recovery metric.
- Width regimes:
    - constant width $\epsilon$, expressed as a fraction of the feature's range;
    - heteroscedastic widths drawn per observation;
    - a mixture of exact, noisy, censored, and missing values.
- Intervals are clipped to the domain.
- **Anchor floor.** Where the experiment's question depends on the hard layer (E1, E4, E7), a declared fraction (10–20%) of observations receive narrow or exact intervals. Without this, wide-width conditions measure only the absence of anchors. The active anchor fraction is always reported, and anchor-free conditions are run as well and labeled as such.

**Label corruption (where specified).**

- Partial labels: with probability $p$, add distractor classes to $Y_i$.
- Label noise: with probability $r$, replace the true label (the true label then is *not* in $Y_i$, which deliberately tests robustness of exclusion).

**Splits and repetition.** Train/test splits with independent seeds. Test inputs are evaluated in two conditions: (a) corrupted the same way as training and (b) exact. All reported numbers are aggregated over seeds with dispersion.

**Sweeps.** Corruption width is always swept from zero through widths larger than the structures to be learned. Many of the most informative results are phase transitions along this axis.

### 8.2 Metrics

Fragment-level metrics are confounded by tree depth. Shattering an observation into more fragments mechanically lowers its largest fragment mass, which can flatter or penalize a deeper tree for reasons unrelated to what it has learned. Latent-recovery and certainty metrics are therefore evaluated on **evaluation cells**: a fixed spatial grid, or the true class regions where the generator defines them. These cells are independent of $T$. Fitted mass is mapped to evaluation cells under the piecewise-uniform-within-fragment reading. Fragment-level versions are reported secondarily.

**Predictive**

- **M1.** Accuracy, log loss, and Brier score on test data, in both test conditions.

**Latent recovery** (training observations only)

- **M2a. True-cell mass.** $m_i$ is the mass assigned to the evaluation cell containing $x_i^*$. Report the mean of $\log m_i$ and the fraction of observations with $m_i \ge 0.5$.
- **M2b. Latent information gain.** Treat fitted masses as piecewise-uniform within fragments. Compute the negative log density of $x_i^*$, minus the same quantity under the uniform raw support. The result is nats of location information gained. Negative values mean the model moved mass away from the truth. The gain is decomposed as

  $$\mathrm{IG} = \mathrm{IG}_{\mathrm{support}} + \mathrm{IG}_{\mathrm{weights}},$$

    - $\mathrm{IG}_{\mathrm{support}}$ is the gain from uniform-on-$S_i^{(0)}$ to uniform-on-$S_i'$.
    - $\mathrm{IG}_{\mathrm{weights}}$ is the gain from uniform-on-$S_i'$ to fitted.
    - Both are computed only over observations with $x_i^* \in S_i'$. Falsely excluded observations are counted under M4 instead.

**Tightening**

- **M3. Interval tightening.** $1 - \mathrm{vol}(S_i') / \mathrm{vol}(S_i^{(0)})$ and per-dimension log width ratios.

**Honesty** (these may matter more than accuracy)

- **M4. False exclusion rate.** The fraction of observations with $x_i^* \notin S_i'$.
    - It must be zero under clean labels.
    - Under label noise, it is reported against noise rate $r$ and must degrade gracefully.
    - It is broken down by anchor derivation depth, and by leaf versus lifted exclusion.
    - Tightening is worthless if reality is being deleted.
- **M5. False certainty**, on evaluation cells.
    - Fitted: the fraction of observations whose largest cell mass is at least 0.9 but whose largest cell does not contain the truth.
    - Envelope: the fraction of observations whose true cell has upper bound below 0.1.
- **M6. Mass calibration and credal coverage.**
    - Fitted masses: bin all cell masses and compare each bin's mean mass with the empirical frequency of the cell containing the truth. Report a reliability curve and expected calibration error.
    - Envelopes: report **credal coverage**, the fraction of cells whose partition-conditioned oracle posterior mass (B6-T) falls inside $[\underline{w}, \overline{w}]$. Envelope midpoints are not calibrated, because a midpoint is not a probability claim.
- **M7. Envelope quality.**
    - Coverage: the fraction of true fragments whose upper bound exceeds a small threshold.
    - Mean envelope width.
    - Width conditioned on ground-truth identifiability, available in synthetic sets.

**Theory space**

- **M8. Diversity–fit curve.** Latent distance $D$ and predictive disagreement against free-energy and loss increase, plus the number of accepted theories at saturation.

**Cost**

- **M9. Structural cost.** Master nodes, leaves, total fragments, mean and maximum fragments per observation, active anchor fraction, solver iterations to convergence, rebuild iterations, and wall-clock time as a measured quantity.

**Status accuracy**

- **M10. Epistemic status accuracy.** The agreement between assigned status (§5.7) and true status. True statuses are defined from the partition-conditioned oracle B6-T:
    - a fragment is truly forced, robust, or underdetermined according to how the oracle posterior over $T$'s leaves behaves;
    - for underdetermined, the test is how the oracle posterior differs from $\pi$.

### 8.3 Baselines

**Predictive and latent baselines**

- **B1.** CART trained on interval midpoints.
- **B2.** CART trained on Monte Carlo samples drawn uniformly from each box (augmentation).
- **B3.** Probabilistic-routing uncertain tree: uniform weights, transient routing, no persistent point-trees, no backward flow. This isolates the contribution of the persistent coupled representation.
- **B4.** Random forest on midpoints, as a strong predictive reference.
- **B5.** The geometric prior $\pi$ alone, as the latent-recovery floor. Any learned latent mass must beat this.
- **B6.** The oracle Bayes posterior, as the latent-recovery ceiling where computable. In synthetic sets, the generative model is known, so the exact posterior of $x_i^*$ given box and label can be computed.
- **B6-T.** The partition-conditioned oracle: B6 integrated over the leaves of $T$. It is the best any method could do *within the given partition*. It separates solver error from representational limits, and it defines ground truth for M6 coverage and M10.
- **B7.** A bootstrap ensemble of B3 trees, as a conventional Rashomon-style baseline for theory diversity (E2, E10).

For partial labels (E9), baselines B1–B4 and B7 receive each observation duplicated once per allowed class with weight $1/\lvert Y_i \rvert$.

**Ablations of the proposed system**

- **A1.** No support solve. Supports stay at raw values.
- **A2.** No distribution solve. Masses equal $\pi$ throughout.
- **A3.** No leave-one-out. This is the self-consumption stress test.
- **A4.** Temperature sweep: $\beta \in \{0.5, 1, 2, 4, \infty\}$.
- **A5.** Contraction level: 0, 1, 2, and free.
- **A6.** Split criterion: S1, S2, S3.
- **A7.** Single pass, versus support-driven rebuild loop, versus residual-driven growth with hard triggers only, versus residual-driven growth with soft triggers.
- **A8.** Theory-conditional contraction enabled versus disabled.
- **A9.** Ensemble envelope versus local convex envelope versus interval-semantics envelope.
- **A10.** Leaf anchors only versus subtree anchors.
- **A11.** Marginalized partial labels (default) versus alternating $\mathbf{w}_i$/$q_i$ updates.

### 8.4 Experiment E0 — Sanity and reduction

**Setup.** Degenerate intervals and singleton labels on all synthetic generators and on Iris.

**Expected outcome.** Outputs are identical to standard CART. Supports are unchanged. One theory is found. All verification properties of §7 pass.

**Failure signal.** Any divergence from CART under S1 indicates a compilation or scoring defect. No further experiment proceeds until this passes.

### 8.5 Experiment E1 — Uncertain XOR (core functionality)

**Setup.**

- Latent $x, y \sim U[0, 1]$ with $c = (x > 0.5) \oplus (y > 0.5)$.
- Interval width swept from 0 to beyond 0.5, i.e. intervals wider than a quadrant.
- An anchor floor (§8.1), with an anchor-free condition reported separately.
- Sub-conditions:
    - **(a)** Hand-specified tree at the true thresholds, to test the fixed-tree solver in isolation.
    - **(b)** Learned tree.
- Both symmetric widths and asymmetric widths (one coordinate much wider than the other).

**Hypotheses.**

- H1.1: At small widths, support solve trims straddling observations toward the correct quadrant with zero false exclusion.
- H1.2: True-cell mass and latent information gain exceed the prior baseline B5 and approach the oracles B6-T and B6.
- H1.3: As width grows, the experiment shows a clean phase transition from identifiable to ambiguous to unknowable:
    - tightening drops;
    - envelopes widen;
    - status moves from forced/robust toward underdetermined;
    - false certainty stays low throughout.
- H1.4: B3 matches predictive accuracy at small widths but has no latent-recovery capability by construction. The proposed system should match or exceed B1/B2 predictively at moderate widths.
- H1.5: CHALLENGE finds no materially different theory at small widths, because XOR with a fixed tree is identifiable.

**Failure signals.**

- Any false exclusion with clean labels.
- Latent information gain below zero.
- Confident mass on wrong quadrants at large widths.

### 8.6 Experiment E2 — Redundant equivalent theories (CHALLENGE)

**Setup.**

- Label $c = (x > 0.5)$.
- A second feature $y$ correlated with $x$ at controlled strength.
- Uncertainty widened selectively:
    - on $x$ only;
    - on $y$ only;
    - on both, at matched widths.
- Variants:
    - **(a)** A master tree containing both an $x$-split and a $y$-split, so both explanations are expressible within one topology.
    - **(b)** A learned tree, built with the topology-union option of §5.9. A plain greedy tree is also run to show what single-tree CHALLENGE misses.

**Off-diagonal occupancy.** With strong correlation, nearly all anchors fall in the diagonal leaves $(x_L, y_L)$ and $(x_R, y_R)$.

- The off-diagonal leaves $(x_L, y_R)$ and $(x_R, y_L)$ are exactly where the two explanations disagree. If they are empty, their statistics are pure Dirichlet prior.
- Moving straddling mass into them is then penalized for reasons that have nothing to do with the competing explanation, and variant (a) fails by construction.
- The generator therefore places a declared small fraction of observations in the off-diagonal regions, consistent with the correlation strength. Their occupancy is reported.

**Hypotheses.**

- H2.1: With both features uncertain, CHALLENGE finds at least two accepted theories:
    - they have similar predictive performance;
    - they have materially different latent reconstructions;
    - one leans on the $x$-split and the other on the $y$-split.
- H2.2: The diversity–fit curve stays flat in loss over a substantial range of distance. This is the signature of genuine redundancy.
- H2.3: Widening uncertainty on one feature tilts the preferred theory toward the other feature, and envelopes on the widened feature's fragments grow.
- H2.4: Reducing correlation strength collapses the theory count toward one. The diversity–fit curve steepens accordingly.
- H2.5: Fragments whose location is implied by both theories are classified robust or forced. Fragments implied by only one are classified theory-dependent.
- H2.6: The bootstrap ensemble B7 shows predictive variation but does not separate latent reconstructions by feature, because it has no latent state to disagree about.

**Failure signals.**

- CHALLENGE returns near-copies of $\theta_0$ in the redundant regime.
- CHALLENGE fabricates diverse theories in the non-redundant regime.
- In (b) without topology union, the plain greedy tree reports the chosen feature's fragments as robust. This is the documented blind spot, and the topology-union run must remove it.

### 8.7 Experiment E3 — Deliberate unidentifiability (refusing to solve the unsolvable)

**Setup.**

- Two separated latent populations along $x$, e.g. modes near 0.25 and 0.75.
- A fraction of observations receive intervals spanning both modes.
- Labels and all other features are arranged so nothing distinguishes which mode such an observation came from.
- Control: an otherwise identical set in which another feature does distinguish the modes.
- **Collective-initialization stress test.** All spanning observations are jointly initialized on the same mode. This probes the two-cycle herd collapse that leave-one-out does not block (P3).

**Hypotheses.**

- H3.1: Spanning observations keep feasible mass in both mode regions. Support solve does not trim either side.
- H3.2: Fitted mass stays near the population-informed split rather than collapsing onto one mode. Envelopes are wide. Status is underdetermined.
- H3.3: False certainty (M5) remains near zero for these observations, while the control set shows correct resolution.
- H3.4: Without leave-one-out (A3), or with low temperature, spanning observations collapse onto arbitrary modes. This demonstrates the safeguard's value.
- H3.5: Under collective initialization, CHALLENGE recovers the mirror-image theory and the envelope remains wide, even if $\theta_0$ itself has herded. If it does not, collective self-reinforcement is a live failure mode, and damping or temperature defaults must change.

**Primary metric.** False certainty, ahead of accuracy.

### 8.8 Experiment E4 — Nonlinear geometry and representational blowup

**Setup.**

- Circular class boundary $c = \mathbb{1}[(x - 0.5)^2 + (y - 0.5)^2 < r^2]$.
- Box uncertainty around each latent point, with an anchor floor (§8.1).
- Sweeps over maximum depth and fragment budget, in addition to width.

**Hypotheses.**

- H4.1: Accuracy improves with depth, but fragments per observation grow sharply for observations near the boundary.
- H4.2: S3, with its fragment complexity term, reaches comparable accuracy and latent recovery with substantially fewer fragments than S1.
- H4.3: There is an identifiable width–depth region where added splits stop improving latent recovery and only add fragments. This locates the practical limits of the representation.

Because latent metrics use evaluation cells, the comparison across depths is not distorted by fragment shattering.

**Primary metrics.** M9 against M1 and M2, presented as Pareto fronts.

### 8.9 Experiment E5 — Correlated uncertainty (adversarial to box representation)

**Setup.**

- Latent points on $y = x + \text{noise}$.
- The true uncertainty region for each observation is a thin diagonal band.
- The prototype receives only the bounding box.
- A labeling rule that depends on which part of the box is actually possible.

**Comparison.** Box representation versus an extension that keeps the joint constraint. The extension represents feasible regions as polytopes, or as unions of boxes constrained to the band, and compiles fragments by intersecting master cells with the true region.

**Hypotheses.**

- H5.1: The box representation assigns mass to impossible fragments. This produces measurable latent-recovery loss and spurious theories in CHALLENGE.
- H5.2: The joint representation removes those artifacts.
- H5.3: The size of the gap, as a function of band thinness, quantifies how much independent marginal uncertainty costs. That determines whether correlated support is a priority extension.

### 8.10 Experiment E6 — Self-reinforcement stress test

**Setup.**

- Run E1 and E3 with long solver runs.
- Include E3's collective-initialization condition.
- Run repeated rebuild loops with:
    - leave-one-out on and off;
    - marginalized versus alternating partial-label updates (A11, on E1 with partial labels);
    - theory-conditional contraction on and off;
    - residual-driven growth with soft triggers;
    - a deliberately misconfigured variant in which fitted weights feed back into support (violating P1).

**Hypotheses.**

- H6.1: With all safeguards, confidence metrics plateau, and calibration (M6) stays stable with iteration count.
- H6.2: Without leave-one-out, with alternating label updates, or with weight-to-support leakage, mass concentration and false certainty increase monotonically with iteration count while true-cell mass does not. This is direct evidence of manufactured confidence.
- H6.3: Soft-triggered structural growth produces splits that track earlier symmetry-breaking choices rather than the data. The signature is that its trees differ across restarts more than hard-triggered trees do.

**Primary metric.** M5 and M6 plotted against iteration number.

### 8.11 Experiment E7 — Crispness versus flexibility (contraction levels)

**Setup.**

- Run E1, E2, E3, and E4 at contraction levels 0, 1, 2, and free.
- Use learned trees, after the structural gate.
- An anchor floor is enforced, and the active anchor fraction is reported for every cell of the comparison. A level comparison in which no leaf passes $m_{\min}$ compares four no-ops, and is discarded rather than read as support for Level 0.

**Hypotheses.**

- H7.1: Level 0 matches or beats the higher levels on false exclusion, false certainty, and calibration.
- H7.2: Any predictive or latent-recovery gain from higher levels is small relative to the increase in support components and solver iterations.
- H7.3: At free level, CHALLENGE finds more theories that differ only in fragmented support patterns rather than in explanatory structure. This indicates entanglement rather than insight.

This experiment tests the specification's central bet: that the crisp version performs disproportionately well because it preserves a strong invariant.

### 8.12 Experiment E8 — Mixed observation types

**Setup.** Corrupt the E1 and E2 generators with a mixture:

- exact values;
- noisy intervals;
- one-sided censoring;
- fully missing coordinates.

**Comparison.** The unified representation against conventional pipelines:

- imputation by mean, then CART;
- imputation by sampling, then CART.

**Hypothesis.** The unified representation needs no special-casing. It is competitive predictively and is the only approach that returns latent reconstructions and honest uncertainty for the missing coordinates. These are reported as feature-level credible intervals.

### 8.13 Experiment E9 — Partial and noisy labels

**Setup.** Sweep the partial-label rate $p$ and the label-noise rate $r$ on E1 and Iris. Baselines handle partial labels by weighted duplication (§8.3).

**Hypotheses.**

- H9.1: Partial labels are disambiguated. The post-hoc $q_i$ concentrates on the true label at a rate above chance, increasing with feature precision.
- H9.2: Under label noise, false exclusion grows in proportion to $r$ but is held down by $\tau_{\mathrm{excl}}$, $m_{\min}$, the family-wise correction, and $k_{\mathrm{prop}}$. The trade-off between tightening and false exclusion is reported as a curve over these parameters.
- H9.3: Contradictions flagged by support solve are enriched for noisy labels. Report precision and recall of the contradiction list as a label-error detector.

### 8.14 Experiment E10 — Corrupted standard datasets

The datasets are run in order of increasing difficulty, and each is entered only after the synthetic suite passes.

- **Iris.** 150 instances, 4 features, 3 classes. A sanity check at low dimension.
- **Breast Cancer Wisconsin (Diagnostic).** 569 instances, 30 numeric features. Moderate dimensionality and fragment growth.
- **Wine Quality.** Thousands of instances with continuous measurements. Scale. Also a candidate for regression leaves once that extension exists.

**Protocol.** Original measurements are the hidden truth. Apply the corruption protocol of §8.1 across a width sweep. Report all metrics against all baselines, with the active anchor fraction and subtree-anchor ablation (A10) shown for each dataset.

**Hypotheses.**

- H10.1: Predictive performance is competitive with B1 and B2 at moderate widths.
- H10.2: Latent recovery is strictly better than the prior baseline B5.
- H10.3: False exclusion is near zero.
- H10.4: In Breast Cancer, where many features are correlated, CHALLENGE finds multiple near-equivalent theories using different feature subsets.
    - This run uses topology union.
    - The invariant constraints shared across theories are reported as the dataset's robust findings.

### 8.15 Experiment E11 — Measurement recommendation

**Setup.** On E2 and Breast Cancer:

1. Rank $(i, j)$ pairs by expected envelope reduction, using the core version of §5.11.
2. Reveal the true value (tightened to a narrow interval) for the top-$k$ pairs.
3. Compare against revealing $k$ random pairs and $k$ pairs chosen by widest interval.

The full version, with first-order correction, is compared against the core version as an extension.

**Hypothesis.** Recommended reveals reduce total envelope width and the theory count substantially more than both alternatives, per measurement.

### 8.16 Stage gates

Experiments are staged. Each stage depends on the previous gate.

1. **Representation gate.** All verification properties (§7) hold, and E0 passes.
2. **Fixed-tree solver gate.** Using hand-specified trees:
    - E1(a) shows latent recovery above B5 with zero false exclusion;
    - E2(a), with controlled off-diagonal occupancy, yields multiple accepted theories in the redundant regime and one in the non-redundant regime;
    - E3 shows no false certainty.

   This gate is the most important. The first interesting results are expected here, before structural learning exists.
3. **Safeguard gate.** E6 confirms that the leave-one-out, marginalization, and firewall safeguards prevent manufactured confidence, including under collective initialization.
4. **Structural gate.**
    - E1(b), E2(b) with topology union, and E4 with learned trees.
    - Comparison of S1, S2, and S3, and of the rebuild loop versus residual-driven growth.
    - E7 then establishes the default contraction level. It runs here, not earlier, because its comparison is only meaningful with learned trees and rebuild loops in place.
5. **Generalization gate.** E8 and E9, then E10, then the core version of E11.
6. **Extensions.**
    - E5 with a joint-constraint representation.
    - The full version of E11.
    - Regression leaves.
    - Structural CHALLENGE: penalizing reuse of previous trees' features and thresholds during split scoring, to find topologically different theories without relying on topology union.

## 9. Risks and Open Questions

**Meaning of the geometric prior.** Piecewise-uniform $\pi$ is a modeling choice, not evidence. The support–distribution split confines its influence to fitted masses. Still, latent-recovery metrics partly reflect it.

- The plan reports $\beta = \infty$ to expose the prior's contribution.
- The evidence test of §5.7 keeps prior-tethered envelopes from being reported as robust.

**Envelope guarantees.** Envelopes are inner or conditional approximations, not certified bounds. Whether a tractable certified outer bound exists for the coupled non-convex problem is open. Candidate routes:

- extending the interval-semantics variant of §5.6 into a full relaxation that treats $\Phi$ as an interval-valued variable;
- bounding leaf statistics by their extreme feasible values.

**Multiple testing and cascades.** The family-wise correction and $k_{\mathrm{prop}}$ make false exclusion controllable but not impossible. Correlated anchors and adaptive, data-dependent trees both weaken the nominal error rate. M4 broken down by derivation depth is the empirical check. If it shows growth with depth, $k_{\mathrm{prop}}$ defaults must tighten.

**Anchor scarcity.** In high dimensions with wide intervals, few observations become anchors, and support solve may do nothing. This is honest behavior, but it may make the hard layer inert. The specification's responses are:

- prior-mass stopping, so tree growth does not stall;
- subtree anchors (A10), clearly labeled as weaker evidence;
- the theory-conditional variant, clearly labeled.

The specification deliberately does not loosen statistical rigor to manufacture anchors. Whether these structural remedies suffice is a question for E10.

**Fragment blowup.** Fragments per observation can grow multiplicatively with depth and dimension. The fragment budget and S3 are the primary controls. E4 and E10 should show whether they suffice.

**Topology-conditional theory space.** Fixed-topology CHALLENGE is blind to explanations its tree cannot express. Topology union is a pragmatic patch. It enlarges the basis and, with refinement, the fragment count. Structural CHALLENGE is the principled remedy and remains an extension.

**Distance choice in CHALLENGE.** Latent total-variation distance may reward trivial reshufflings among near-identical fragments. Aggregating distance at point-tree internal nodes, so that only distinctions the tree observes count, is a planned variant if E2 or E7 show this problem.

**Marginal-box artifacts.** E5 tests the most serious representational limitation. Its outcome decides the priority of correlated support regions.

**Novelty verification.** Before making claims, related work must be checked carefully, with emphasis on the persistent coupled point-tree representation and the support–distribution separation. The modules map onto established terms, and claims should be phrased against them:

| Module | Established term |
|---|---|
| SUPPORT SOLVE | Statistical box-consistency (constraint propagation) |
| SOLVE | Leave-one-out variational EM over a partition |
| CHALLENGE | Repulsive exploration of a Rashomon set |
| BOUNDS | Conditional sublevel-set envelopes |

Areas to check:

- decision trees for uncertain data with probabilistic routing;
- soft and probabilistic trees;
- ternary trees with uncertainty zones;
- credal and imprecise-probability decision trees;
- symbolic / interval-valued data analysis;
- partial-label and superset-label learning;
- EM-style latent-variable estimation over partitions;
- Rashomon-set analyses of near-optimal trees, which are closely related to the theory-space outputs.

Uncertain decision trees as such are not novel. Claims should be limited to:

- the persistent coupled point-tree;
- using it for backward, anchor-based support contraction jointly with partial-label disambiguation;
- the firewall between hard and soft inference;
- the latent Rashomon set, in which theories agree on predictions but disagree on reconstructions.