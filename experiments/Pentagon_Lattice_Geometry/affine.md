# Generalized Replicative Generators from Irregular Polygons

## Overview

The core idea is to generalize the pentagonal multi-sheeted tiling construction into a
universal framework for replicative (self-similar, fractal-like) generators based on
**any polygon** — regular or irregular. Each such polygon defines a family of affine
transformations, and the structure of that family determines whether the resulting
expansion reconnects into a well-defined tiling, a fractal, or a pathological
non-terminating tree.

---

## 1. The General Construction

### 1.1 Polygons as Walk Generators

Given any polygon $P$ with $n$ edges $e_1, e_2, \dots, e_n$, each edge provides exactly
**two canonical affine operations** that map $P$ to an adjacent copy:

1. **Reflection** across the midpoint of the edge (an isometric flip).
2. **Rotation** by $\pi$ about the midpoint of the edge (a half-turn, equivalent to a
   point reflection through the midpoint).

Each of these operations is an element of the **affine group** $\text{Aff}(\mathbb{R}^2)$,
and together the $2n$ operations (or $n$ if reflection and rotation coincide, as they do
for edges of symmetric polygons) form the **generator set** of the expansion family.

<p align="center">

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 240" width="500" height="240">
   <title>Edge generators: reflection and rotation about an edge midpoint</title>
   <!-- Original polygon (pentagon) -->
   <polygon points="100,180 60,130 90,75 145,80 165,140"
            fill="#cfe4ff" stroke="#1f4e9c" stroke-width="2"/>
   <text x="105" y="135" font-family="serif" font-size="14" text-anchor="middle">P</text>
   <!-- Shared edge highlighted -->
   <line x1="165" y1="140" x2="145" y2="80" stroke="#d23" stroke-width="3"/>
   <circle cx="155" cy="110" r="3" fill="#d23"/>
   <text x="178" y="113" font-size="12" fill="#d23">midpoint</text>
   <!-- Reflected copy (mirror) -->
   <polygon points="210,180 250,130 220,75 165,80 145,140"
            fill="#ffe2cf" stroke="#9c4e1f" stroke-width="2"
            transform="translate(40,0)"/>
   <text x="225" y="135" font-family="serif" font-size="14" text-anchor="middle">T(P)</text>
   <!-- Arrow indicating operation -->
   <path d="M 175 50 Q 220 30 260 50" stroke="#333" stroke-width="1.5" fill="none"
         marker-end="url(#arr)"/>
   <text x="220" y="25" font-size="12" text-anchor="middle">reflect / rotate π</text>
   <!-- Right: tree of copies -->
   <g transform="translate(340,30)">
     <circle cx="60" cy="20" r="10" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="20" cy="80" r="10" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="60" cy="80" r="10" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="100" cy="80" r="10" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="0" cy="150" r="8" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="40" cy="150" r="8" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="80" cy="150" r="8" fill="#cfe4ff" stroke="#1f4e9c"/>
     <circle cx="120" cy="150" r="8" fill="#cfe4ff" stroke="#1f4e9c"/>
     <line x1="60" y1="30" x2="20" y2="70" stroke="#1f4e9c"/>
     <line x1="60" y1="30" x2="60" y2="70" stroke="#1f4e9c"/>
     <line x1="60" y1="30" x2="100" y2="70" stroke="#1f4e9c"/>
     <line x1="20" y1="90" x2="0" y2="142" stroke="#1f4e9c"/>
     <line x1="20" y1="90" x2="40" y2="142" stroke="#1f4e9c"/>
     <line x1="100" y1="90" x2="80" y2="142" stroke="#1f4e9c"/>
     <line x1="100" y1="90" x2="120" y2="142" stroke="#1f4e9c"/>
     <text x="60" y="185" font-size="11" text-anchor="middle">expansion tree</text>
   </g>
   <defs>
     <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6"
             markerHeight="6" orient="auto">
       <path d="M0,0 L10,5 L0,10 z" fill="#333"/>
     </marker>
   </defs>
</svg>

</p>

The resulting structure is a **replicative generator**: starting from a single tile, one
repeatedly applies these operations to produce a tree (or graph) of adjacent copies. The
key question is whether this tree ever **reconnects** — i.e., whether two independently
generated copies ever land on the same position and orientation, closing a loop in the
adjacency graph.

### 1.2 Affine Transforms over an Algebraic Field

Each generator operation (reflection or rotation about an edge midpoint) is an affine map:
$$T_k(\mathbf{x}) = A_k \mathbf{x} + \mathbf{b}_k$$
where $A_k \in O(2)$ (an orthogonal matrix encoding the rotation/reflection) and
$\mathbf{b}_k \in \mathbb{R}^2$ (a translation vector determined by the edge midpoint).

The critical structural observation is that **all coordinates and transformation parameters
live in a specific algebraic number field** $\mathbb{F}$ determined by the polygon's
geometry:

- For a **square**: $\mathbb{F} = \mathbb{Q}$ (all rational; trivially reconnects into
  $\mathbb{Z}^2$).
- For a **regular hexagon**: $\mathbb{F} = \mathbb{Q}(\sqrt{3})$ (reconnects into the
  triangular lattice).
- For a **regular pentagon**: $\mathbb{F} = \mathbb{Q}(\sqrt{5})$ (does _not_ reconnect
  flatly; requires multi-sheeted covering space as developed in `idea.md`).
- For a **regular $n$-gon**: $\mathbb{F} = \mathbb{Q}(\zeta_n) \cap \mathbb{R}$, the
  maximal real subfield of the $n$-th cyclotomic field.
- For an **irregular polygon** with algebraically independent edge lengths: $\mathbb{F}$
  may be a higher-degree extension or even transcendental, generically preventing
  reconnection entirely.

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 200" width="560" height="200">
   <title>Polygons and their algebraic fields</title>
   <!-- Square -->
   <g transform="translate(20,40)">
     <rect x="10" y="10" width="80" height="80" fill="#d4f0d4" stroke="#2a7a2a" stroke-width="2"/>
     <text x="50" y="115" font-size="11" text-anchor="middle">square</text>
     <text x="50" y="132" font-size="11" text-anchor="middle" fill="#2a7a2a">ℚ</text>
   </g>
   <!-- Triangle -->
   <g transform="translate(140,40)">
     <polygon points="50,10 90,90 10,90" fill="#d4e4f0" stroke="#2a5a7a" stroke-width="2"/>
     <text x="50" y="115" font-size="11" text-anchor="middle">triangle / hexagon</text>
     <text x="50" y="132" font-size="11" text-anchor="middle" fill="#2a5a7a">ℚ(√3)</text>
   </g>
   <!-- Pentagon -->
   <g transform="translate(260,40)">
     <polygon points="50,10 90,40 75,90 25,90 10,40" fill="#f0e4d4" stroke="#7a5a2a" stroke-width="2"/>
     <text x="50" y="115" font-size="11" text-anchor="middle">pentagon</text>
     <text x="50" y="132" font-size="11" text-anchor="middle" fill="#7a5a2a">ℚ(√5)</text>
   </g>
   <!-- Octagon -->
   <g transform="translate(380,40)">
     <polygon points="35,10 65,10 90,35 90,65 65,90 35,90 10,65 10,35"
              fill="#f0d4e4" stroke="#7a2a5a" stroke-width="2"/>
     <text x="50" y="115" font-size="11" text-anchor="middle">octagon</text>
     <text x="50" y="132" font-size="11" text-anchor="middle" fill="#7a2a5a">ℚ(√2)</text>
   </g>
   <!-- 15-gon (irregular field) -->
   <g transform="translate(480,40)">
     <polygon points="50,8 67,12 80,22 88,38 90,55 86,71 75,84 60,90 40,90 25,84 14,71 10,55 12,38 20,22 33,12"
              fill="#e4d4f0" stroke="#5a2a7a" stroke-width="2"/>
     <text x="50" y="115" font-size="11" text-anchor="middle">15-gon</text>
     <text x="50" y="132" font-size="11" text-anchor="middle" fill="#5a2a7a">ℚ(√3,√5)</text>
     <text x="50" y="148" font-size="10" text-anchor="middle" fill="#a33">✗ degree 4</text>
   </g>
</svg>
</p>

The field $\mathbb{F}$ is not merely a computational convenience — it is the **invariant
algebraic substrate** of the entire expansion family. Two copies of $P$ can only coincide
(reconnect) if their centroid coordinates and orientation angles are equal as elements of
$\mathbb{F}$. This makes the reconnection question a purely algebraic one.

---

## 2. The Reconnection Problem

### 2.1 Generic Behavior: Non-Reconnective Trees

For a generic polygon, the expansion process produces an **infinite, non-reconnective
tree**: the adjacency graph is a tree (no cycles), and the tiling never closes up into a
periodic or quasiperiodic structure. This is the _generic_ case.

Concretely, starting from tile $P_0$, the set of reachable tiles after $k$ expansion steps
is a subtree of depth $k$ in the Cayley graph of the group generated by
$\{T_1, T_2, \dots, T_n\}$. If no two distinct words in these generators evaluate to the
same affine transformation (i.e., the generators satisfy no non-trivial relations), the
group is **free** and the adjacency graph is a tree.

Most polygons — especially irregular ones — fall into this category. The expansion grows
exponentially (branching factor up to $n-1$ per step, since one edge was used to arrive),
and the resulting structure has:

- **No periodic long-range order**.
- **Exponential volume growth**, giving a formal dimension $d_{\text{eff}} = \infty$ in

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 220" width="560" height="220">
   <title>Three expansion regimes: lattice, fractal, tree</title>
   <!-- Lattice -->
   <g transform="translate(20,20)">
     <text x="80" y="0" font-size="12" text-anchor="middle" font-weight="bold">Periodic lattice</text>
     <g stroke="#1f4e9c" stroke-width="1" fill="#cfe4ff">
       <rect x="20" y="20" width="30" height="30"/>
       <rect x="50" y="20" width="30" height="30"/>
       <rect x="80" y="20" width="30" height="30"/>
       <rect x="110" y="20" width="30" height="30"/>
       <rect x="20" y="50" width="30" height="30"/>
       <rect x="50" y="50" width="30" height="30"/>
       <rect x="80" y="50" width="30" height="30"/>
       <rect x="110" y="50" width="30" height="30"/>
       <rect x="20" y="80" width="30" height="30"/>
       <rect x="50" y="80" width="30" height="30"/>
       <rect x="80" y="80" width="30" height="30"/>
       <rect x="110" y="80" width="30" height="30"/>
       <rect x="20" y="110" width="30" height="30"/>
       <rect x="50" y="110" width="30" height="30"/>
       <rect x="80" y="110" width="30" height="30"/>
       <rect x="110" y="110" width="30" height="30"/>
     </g>
     <text x="80" y="170" font-size="10" text-anchor="middle">d_eff = 2</text>
     <text x="80" y="185" font-size="10" text-anchor="middle">Crit 1 ✓  Crit 2 ✓</text>
   </g>
   <!-- Fractal (Sierpinski) -->
   <g transform="translate(200,20)">
     <text x="80" y="0" font-size="12" text-anchor="middle" font-weight="bold">Fractal</text>
     <g fill="#7a2a5a" stroke="none">
       <!-- Sierpinski-like triangles -->
       <polygon points="80,20 140,140 20,140"/>
     </g>
     <g fill="#ffffff" stroke="none">
       <polygon points="80,80 110,140 50,140"/>
     </g>
     <g fill="#7a2a5a">
       <polygon points="80,80 95,110 65,110"/>
       <polygon points="50,140 65,110 35,110"/>
       <polygon points="110,140 125,110 95,110"/>
     </g>
     <g fill="#ffffff">
       <polygon points="80,110 87,125 73,125"/>
       <polygon points="50,140 57,125 43,125"/>
       <polygon points="110,140 117,125 103,125"/>
     </g>
     <text x="80" y="170" font-size="10" text-anchor="middle">d_eff ≈ 1.585</text>
     <text x="80" y="185" font-size="10" text-anchor="middle">Crit 1 ✓  Crit 2 ✓</text>
   </g>
   <!-- Non-reconnective tree -->
   <g transform="translate(380,20)">
     <text x="80" y="0" font-size="12" text-anchor="middle" font-weight="bold">Tree (generic)</text>
     <g stroke="#7a5a2a" stroke-width="1.2" fill="none">
       <line x1="80" y1="20" x2="80" y2="50"/>
       <line x1="80" y1="50" x2="40" y2="80"/>
       <line x1="80" y1="50" x2="80" y2="80"/>
       <line x1="80" y1="50" x2="120" y2="80"/>
       <line x1="40" y1="80" x2="20" y2="110"/>
       <line x1="40" y1="80" x2="50" y2="110"/>
       <line x1="80" y1="80" x2="70" y2="110"/>
       <line x1="80" y1="80" x2="90" y2="110"/>
       <line x1="120" y1="80" x2="110" y2="110"/>
       <line x1="120" y1="80" x2="140" y2="110"/>
       <line x1="20" y1="110" x2="10" y2="135"/>
       <line x1="20" y1="110" x2="25" y2="135"/>
       <line x1="50" y1="110" x2="45" y2="135"/>
       <line x1="50" y1="110" x2="60" y2="135"/>
       <line x1="70" y1="110" x2="68" y2="135"/>
       <line x1="90" y1="110" x2="92" y2="135"/>
       <line x1="110" y1="110" x2="105" y2="135"/>
       <line x1="140" y1="110" x2="145" y2="135"/>
     </g>
     <g fill="#7a5a2a">
       <circle cx="80" cy="20" r="3"/>
       <circle cx="40" cy="80" r="2.5"/>
       <circle cx="80" cy="80" r="2.5"/>
       <circle cx="120" cy="80" r="2.5"/>
     </g>
     <text x="80" y="170" font-size="10" text-anchor="middle">d_eff = ∞</text>
     <text x="80" y="185" font-size="10" text-anchor="middle">Crit 1 ✗ or Crit 2 ✗</text>
   </g>
</svg>
</p>

the graph-theoretic sense (or more precisely, $d_{\text{eff}}$ equal to the growth
exponent of the free group, which is not polynomial).

- **No well-defined spectral dimension** in the usual sense.

### 2.2 The Two Reconnection Criteria

For the expansion to reconnect — producing a genuine tiling, lattice, or quasicrystal
rather than a tree — **two conditions must both be satisfied**:

#### Criterion 1: Symmetry Rule for Invariant Orientations (Modular Closure)

The set of orientations reachable by the generators must form a **finite group** under
composition. Specifically, if $R_k$ denotes the rotational part of generator $T_k$, then
the group $\Gamma = \langle R_1, R_2, \dots, R_n \rangle \subseteq O(2)$ must be
**finite**.

This is the direct analogue of a **modular number circle**: just as the integers modulo
$m$ form a finite cyclic group that "wraps around," the orientation group must wrap around
after finitely many steps. When $\Gamma$ is finite, the set of distinct orientations of
tiles in the expansion is bounded, and tiles generated by different paths can share the
same orientation — a necessary precondition for two independently generated tiles to
coincide.

For regular $n$-gons, $\Gamma = \mathbb{Z}_n$ (the cyclic group of order $n$), which is
always finite. For irregular polygons, $\Gamma$ is generically infinite (a dense subgroup
of $SO(2)$), preventing reconnection.

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 460 200" width="460" height="200">
   <title>Criterion 1: finite vs. dense orientation group</title>
   <!-- Finite cyclic group Z_5 -->
   <g transform="translate(30,20)">
     <text x="80" y="0" font-size="12" text-anchor="middle" font-weight="bold">
       Finite: Z₅ (closes)
     </text>
     <circle cx="80" cy="90" r="60" fill="none" stroke="#1f4e9c" stroke-width="1.5"/>
     <!-- 5 marks at 72° apart -->
     <g fill="#d23">
       <circle cx="80" cy="30" r="4"/>
       <circle cx="137" cy="71" r="4"/>
       <circle cx="116" cy="139" r="4"/>
       <circle cx="44" cy="139" r="4"/>
       <circle cx="23" cy="71" r="4"/>
     </g>
     <g stroke="#d23" stroke-width="1" fill="none" stroke-dasharray="3,2">
       <line x1="80" y1="90" x2="80" y2="30"/>
       <line x1="80" y1="90" x2="137" y2="71"/>
       <line x1="80" y1="90" x2="116" y2="139"/>
       <line x1="80" y1="90" x2="44" y2="139"/>
       <line x1="80" y1="90" x2="23" y2="71"/>
     </g>
     <text x="80" y="175" font-size="10" text-anchor="middle">θ = 2π/5 (rational × π)</text>
   </g>
   <!-- Dense (irrational angle) -->
   <g transform="translate(260,20)">
     <text x="80" y="0" font-size="12" text-anchor="middle" font-weight="bold">
       Dense: irrational θ
     </text>
     <circle cx="80" cy="90" r="60" fill="none" stroke="#7a5a2a" stroke-width="1.5"/>
     <!-- Many marks at irrational angle around circle -->
     <g fill="#7a5a2a">
       <circle cx="80" cy="30" r="2"/>
       <circle cx="122" cy="48" r="2"/>
       <circle cx="139" cy="92" r="2"/>
       <circle cx="118" cy="135" r="2"/>
       <circle cx="71" cy="149" r="2"/>
       <circle cx="27" cy="123" r="2"/>
       <circle cx="21" cy="76" r="2"/>
       <circle cx="50" cy="38" r="2"/>
       <circle cx="100" cy="32" r="2"/>
       <circle cx="133" cy="65" r="2"/>
       <circle cx="135" cy="115" r="2"/>
       <circle cx="96" cy="148" r="2"/>
       <circle cx="50" cy="143" r="2"/>
       <circle cx="22" cy="100" r="2"/>
       <circle cx="33" cy="55" r="2"/>
       <circle cx="65" cy="32" r="2"/>
     </g>
     <text x="80" y="175" font-size="10" text-anchor="middle">never closes — dense in S¹</text>
   </g>
</svg>
</p>

**Practical test**: Compute the angle $\theta_k$ introduced by each generator $T_k$. The
orientation group is finite if and only if all $\theta_k$ are **rational multiples of
$\pi$** (equivalently, all $e^{i\theta_k}$ are roots of unity).

#### Criterion 2: Non-Increasing Complexity of the Number Field (Single Irrational Base)

Even when the orientation group is finite, reconnection requires that the **translation
parts** $\mathbf{b}_k$ of the generators do not introduce new algebraic irrationalities at
each step. Formally, the field $\mathbb{F}$ generated by all coordinates of all reachable
tile centroids must be:

1. **Finitely generated over $\mathbb{Q}$** — i.e., $[\mathbb{F} : \mathbb{Q}] < \infty$.
2. **Generated by exactly one irrational base** — i.e., $\mathbb{F} = \mathbb{Q}(\alpha)$
   for a single algebraic number $\alpha$, **without any additional scaling freedom**.

The "without scaling" condition is subtle but critical. If the edge lengths of $P$ involve
two algebraically independent irrationals $\alpha$ and $\beta$ (e.g., $\sqrt{2}$ and
$\sqrt{3}$), then the translation vectors $\mathbf{b}_k$ live in
$\mathbb{Q}(\sqrt{2}, \sqrt{3})$, a degree-4 extension. Tiles generated by different paths
accumulate different combinations of $\sqrt{2}$ and $\sqrt{3}$ in their centroid
coordinates, and two tiles can only coincide if their $\sqrt{2}$-components _and_
$\sqrt{3}$-components separately match. This generically fails, and the tree does not
reconnect.

Conversely, if all edge-length irrationalities reduce to a **single algebraic number**
$\alpha$ (as $\sqrt{5}$ does for the regular pentagon, or $\sqrt{3}$ for the regular
hexagon), then all centroid coordinates live in $\mathbb{Q}(\alpha)$, and the coincidence
condition reduces to a single algebraic equation — which can and does have solutions,
enabling reconnection.

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200" width="520" height="200">
   <title>Criterion 2: single vs. multiple irrational bases</title>
   <!-- Single base: 1D lattice -->
   <g transform="translate(20,30)">
     <text x="110" y="0" font-size="12" text-anchor="middle" font-weight="bold">
       ℚ(α): rank-1 lattice ✓
     </text>
     <line x1="10" y1="80" x2="210" y2="80" stroke="#333" stroke-width="1"/>
     <g fill="#1f4e9c">
       <circle cx="30" cy="80" r="4"/>
       <circle cx="60" cy="80" r="4"/>
       <circle cx="90" cy="80" r="4"/>
       <circle cx="120" cy="80" r="4"/>
       <circle cx="150" cy="80" r="4"/>
       <circle cx="180" cy="80" r="4"/>
     </g>
     <text x="30" y="105" font-size="10" text-anchor="middle">0</text>
     <text x="60" y="105" font-size="10" text-anchor="middle">α</text>
     <text x="90" y="105" font-size="10" text-anchor="middle">2α</text>
     <text x="120" y="105" font-size="10" text-anchor="middle">3α</text>
     <text x="150" y="105" font-size="10" text-anchor="middle">4α</text>
     <text x="180" y="105" font-size="10" text-anchor="middle">5α</text>
     <text x="110" y="140" font-size="10" text-anchor="middle">discrete: coincidences solvable</text>
   </g>
   <!-- Two bases: dense 2D -->
   <g transform="translate(280,30)">
     <text x="110" y="0" font-size="12" text-anchor="middle" font-weight="bold">
       ℚ(α,β): rank-2, dense ✗
     </text>
     <rect x="10" y="20" width="200" height="100" fill="#fff" stroke="#333"/>
     <!-- Scattered points (dense projection) -->
     <g fill="#7a2a5a">
       <circle cx="30" cy="40" r="2"/>
       <circle cx="55" cy="62" r="2"/>
       <circle cx="78" cy="88" r="2"/>
       <circle cx="103" cy="35" r="2"/>
       <circle cx="128" cy="98" r="2"/>
       <circle cx="152" cy="48" r="2"/>
       <circle cx="178" cy="75" r="2"/>
       <circle cx="42" cy="100" r="2"/>
       <circle cx="67" cy="30" r="2"/>
       <circle cx="92" cy="70" r="2"/>
       <circle cx="117" cy="55" r="2"/>
       <circle cx="142" cy="110" r="2"/>
       <circle cx="167" cy="40" r="2"/>
       <circle cx="190" cy="95" r="2"/>
       <circle cx="38" cy="75" r="2"/>
       <circle cx="73" cy="105" r="2"/>
       <circle cx="108" cy="85" r="2"/>
       <circle cx="135" cy="65" r="2"/>
       <circle cx="160" cy="100" r="2"/>
       <circle cx="185" cy="55" r="2"/>
       <circle cx="20" cy="55" r="2"/>
       <circle cx="200" cy="35" r="2"/>
     </g>
     <text x="110" y="140" font-size="10" text-anchor="middle">independent axes never align</text>
   </g>
</svg>
</p>

**Summary of Criterion 2**: The polygon's geometry must be definable over a number field
of the form $\mathbb{Q}(\alpha)$ for a **single** algebraic $\alpha$, with no independent
scaling parameters.

---

## 3. The Expansion Family Taxonomy

Combining the two criteria, we obtain a complete taxonomy of expansion families:

<p align="center">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 280" width="500" height="280">
   <title>Decision tree: classifying polygon expansions</title>
   <!-- Root -->
   <rect x="180" y="10" width="140" height="40" rx="6" fill="#eef" stroke="#333"/>
   <text x="250" y="35" font-size="12" text-anchor="middle">Polygon P</text>
   <!-- Crit 1 branch -->
   <line x1="250" y1="50" x2="250" y2="75" stroke="#333"/>
   <rect x="160" y="75" width="180" height="40" rx="6" fill="#ffe" stroke="#333"/>
   <text x="250" y="100" font-size="12" text-anchor="middle">Criterion 1: Γ finite?</text>
   <!-- No branch -> tree -->
   <line x1="160" y1="95" x2="80" y2="140" stroke="#333"/>
   <text x="105" y="130" font-size="10" fill="#a33">no</text>
   <rect x="10" y="140" width="140" height="40" rx="6" fill="#fdd" stroke="#a33"/>
   <text x="80" y="165" font-size="11" text-anchor="middle">Tree (generic)</text>
   <!-- Yes branch -->
   <line x1="340" y1="95" x2="340" y2="140" stroke="#333"/>
   <text x="350" y="125" font-size="10" fill="#2a7a2a">yes</text>
   <rect x="250" y="140" width="180" height="40" rx="6" fill="#ffe" stroke="#333"/>
   <text x="340" y="165" font-size="12" text-anchor="middle">Criterion 2: ℚ(α)?</text>
   <!-- No -> tree -->
   <line x1="250" y1="160" x2="170" y2="200" stroke="#333"/>
   <text x="195" y="190" font-size="10" fill="#a33">no</text>
   <rect x="100" y="200" width="140" height="40" rx="6" fill="#fdd" stroke="#a33"/>
   <text x="170" y="225" font-size="11" text-anchor="middle">Tree</text>
   <!-- Yes -> flat tiling? -->
   <line x1="430" y1="160" x2="430" y2="200" stroke="#333"/>
   <text x="440" y="190" font-size="10" fill="#2a7a2a">yes</text>
   <rect x="270" y="200" width="220" height="40" rx="6" fill="#efe" stroke="#2a7a2a"/>
   <text x="380" y="218" font-size="11" text-anchor="middle">Periodic lattice (square, hex…)</text>
   <text x="380" y="234" font-size="10" text-anchor="middle" fill="#555">
     fractal (Sierpiński) / multi-sheet (pentagon)
   </text>
</svg>
</p>

### 3.1 Fully Reconnective (Periodic Tilings)

- **Both criteria satisfied**, and the orientation group acts transitively on the tile
  orientations.
- Examples: **square** ($\mathbb{F} = \mathbb{Q}$, $\Gamma = \mathbb{Z}_4$), **equilateral
  triangle** ($\mathbb{F} = \mathbb{Q}(\sqrt{3})$, $\Gamma = \mathbb{Z}_6$), **regular
  hexagon** ($\mathbb{F} = \mathbb{Q}(\sqrt{3})$, $\Gamma = \mathbb{Z}_6$).
- The adjacency graph is a **periodic lattice** (e.g., $\mathbb{Z}^2$, the triangular
  lattice, the honeycomb lattice).
- $d_{\text{eff}} = 2$ exactly.

### 3.2 Quasi-Reconnective (Quasicrystals and Fractals)

- **Both criteria satisfied**, but the orientation group does _not_ act transitively, or
  the reconnection produces a quasiperiodic rather than periodic structure.
- Examples:
  - **Regular pentagon** ($\mathbb{F} = \mathbb{Q}(\sqrt{5})$, $\Gamma = \mathbb{Z}_5$):
    reconnects into a **Penrose-like quasicrystal** or, in the multi-sheeted
    construction, a covering space with fractional dimension $2 < d_{\text{eff}} < 3$.
  - **Sierpiński triangle** (equilateral triangle with a specific contraction ratio):
    reconnects into a **fractal** with $d_{\text{eff}} = \log 3 / \log 2 \approx 1.585$.
  - **Koch snowflake** (equilateral triangle with edge-replacement rule): reconnects into
    a fractal curve with $d_{\text{eff}} = \log 4 / \log 3 \approx 1.261$.
- The adjacency graph has **polynomial but non-integer volume growth**.

### 3.3 Non-Reconnective (Trees)

- **Either criterion fails**.
- The adjacency graph is an infinite tree with exponential volume growth.
- No well-defined tiling or fractal structure emerges.
- This is the **generic case** for irregular polygons.

---

## 4. Canonical Examples

### 4.1 Sierpiński Triangle

The Sierpiński triangle arises from an equilateral triangle with a **contraction ratio of
$1/2$**. The three generators are reflections across the midpoints of the three edges,
each scaling distances by $1/2$. The field is $\mathbb{F} = \mathbb{Q}(\sqrt{3})$
(inherited from the equilateral triangle), and the orientation group is $\mathbb{Z}_6$
(finite). Both criteria are satisfied, and the expansion reconnects into the Sierpiński
fractal.

The fractal dimension is $d_{\text{eff}} = \log 3 / \log 2$, reflecting the fact that
scaling by 2 produces 3 copies of the original.

### 4.2 Koch Snowflake

The Koch snowflake arises from an equilateral triangle with an **edge-replacement rule**:
each edge is replaced by four edges of length $1/3$. The generators involve rotations by
$\pm 60^\circ$ and translations in $\mathbb{Q}(\sqrt{3})$. Both criteria are satisfied,
and the expansion reconnects into the Koch curve.

The fractal dimension is $d_{\text{eff}} = \log 4 / \log 3$.

### 4.3 Regular Pentagon (Multi-Sheeted)

As developed in `idea.md`, the regular pentagon satisfies both criteria
($\mathbb{F} = \mathbb{Q}(\sqrt{5})$, $\Gamma = \mathbb{Z}_5$) but cannot tile the
Euclidean plane flatly. The resolution is the **multi-sheeted covering space**: the
expansion reconnects, but only after lifting to a higher-dimensional fiber bundle. The
result is a fractional dimension $2 < d_{\text{eff}} < 3$ with spinor-like holonomy.

### 4.4 Regular $n$-gon with Irrational Base

For a regular $n$-gon where $n$ is such that $\mathbb{Q}(\zeta_n) \cap \mathbb{R}$ is a
**simple extension** $\mathbb{Q}(\alpha)$ (e.g., $n = 3, 4, 5, 6, 8, 10, 12$), both
criteria are satisfied. The expansion family is well-defined, and the resulting structure
is either a periodic tiling, a quasicrystal, or a multi-sheeted covering space, depending
on whether the pentagon-like angular frustration is present.

For $n$ such that $[\mathbb{Q}(\zeta_n) \cap \mathbb{R} : \mathbb{Q}] > 1$ and the field
is **not** a simple extension (e.g., $n = 15$, where
$\mathbb{Q}(\zeta_{15}) \cap \mathbb{R} = \mathbb{Q}(\sqrt{5}, \sqrt{3})$, a degree-4
extension with **two** independent irrationals), Criterion 2 fails and the expansion is
generically non-reconnective.

---

## 5. Algorithmic Decision Procedure

Given a polygon $P$, the following procedure determines which expansion family it belongs
to:

1. **Compute the algebraic field** $\mathbb{F}$ of the polygon's vertex coordinates.
   - Determine the minimal polynomial of each vertex coordinate over $\mathbb{Q}$.
   - Compute the compositum of all these fields.

2. **Check Criterion 1** (Orientation Closure):
   - Compute the rotation angle $\theta_k$ introduced by each edge generator.
   - Check whether all $\theta_k$ are rational multiples of $\pi$.
   - If **no**: the expansion is **non-reconnective (tree)**. Stop.
   - If **yes**: proceed to Criterion 2.

3. **Check Criterion 2** (Single Irrational Base):
   - Check whether $\mathbb{F} = \mathbb{Q}(\alpha)$ for a single $\alpha$.
   - Equivalently, check whether $[\mathbb{F} : \mathbb{Q}]$ equals the degree of the
     minimal polynomial of a single generator.
   - If **no**: the expansion is **non-reconnective (tree)**. Stop.
   - If **yes**: proceed to classification.

4. **Classify the reconnection type**:
   - Attempt to tile $\mathbb{R}^2$ flatly (check angular sums at vertices).
   - If flat tiling is possible: **periodic tiling** (e.g., square, hexagon).
   - If flat tiling is impossible but the expansion reconnects with a contraction ratio:
     **fractal** (e.g., Sierpiński, Koch).
   - If flat tiling is impossible and no contraction: **multi-sheeted covering space**
     (e.g., pentagon), with fractional dimension to be determined by the methods of
     `idea.md` Section 6.

---

## 6. Relationship to the Principal Bundle Framework

The general framework described here is the **combinatorial skeleton** of the principal
$G$-bundle construction in `idea.md`. Specifically:

- The **fiber group** $G$ is the orientation group $\Gamma$ (or a quotient thereof).
- The **transition functions** $\tau(e)$ are the sheet-transition maps induced by the
  edge generators.
- The **holonomy** of a loop is the product of transition functions around the loop,
  which is non-trivial precisely when the angular sum around a vertex is not $2\pi k$ for
  any integer $k$.
- The **cut-and-project window** is the mechanism that enforces Criterion 2 computationally,
  preventing the cyclotomic density trap by restricting which sheets are admitted.

The two reconnection criteria thus have direct geometric interpretations in the bundle
language:

- **Criterion 1** (finite orientation group) ↔ the holonomy group is **finite** (the
  bundle has finitely many sheets).
- **Criterion 2** (single irrational base) ↔ the transition functions live in a
  **rank-1 lattice** over $\mathbb{Q}$, preventing the fiber coordinates from densifying.

---

## 7. Summary Table

| Polygon              | Field $\mathbb{F}$              | $\Gamma$          | Criterion 1 | Criterion 2 | Result                       |
| -------------------- | ------------------------------- | ----------------- | ----------- | ----------- | ---------------------------- |
| Square               | $\mathbb{Q}$                    | $\mathbb{Z}_4$    | ✓           | ✓           | Periodic lattice ($d=2$)     |
| Equilateral triangle | $\mathbb{Q}(\sqrt{3})$          | $\mathbb{Z}_6$    | ✓           | ✓           | Periodic lattice ($d=2$)     |
| Regular hexagon      | $\mathbb{Q}(\sqrt{3})$          | $\mathbb{Z}_6$    | ✓           | ✓           | Periodic lattice ($d=2$)     |
| Regular pentagon     | $\mathbb{Q}(\sqrt{5})$          | $\mathbb{Z}_5$    | ✓           | ✓           | Multi-sheeted ($2<d<3$)      |
| Regular octagon      | $\mathbb{Q}(\sqrt{2})$          | $\mathbb{Z}_8$    | ✓           | ✓           | Quasicrystal / multi-sheeted |
| Regular 15-gon       | $\mathbb{Q}(\sqrt{3},\sqrt{5})$ | $\mathbb{Z}_{15}$ | ✓           | ✗           | Non-reconnective tree        |
| Sierpiński triangle  | $\mathbb{Q}(\sqrt{3})$          | $\mathbb{Z}_6$    | ✓           | ✓           | Fractal ($d \approx 1.585$)  |
| Koch snowflake       | $\mathbb{Q}(\sqrt{3})$          | $\mathbb{Z}_6$    | ✓           | ✓           | Fractal ($d \approx 1.261$)  |
| Generic irregular    | Transcendental / high degree    | Infinite          | ✗           | ✗           | Non-reconnective tree        |
