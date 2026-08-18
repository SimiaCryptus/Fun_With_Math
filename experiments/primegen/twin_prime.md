# Twin Primes in the Wheel Lattice: Structure, Density, and the Period–Window Dichotomy

**Status:** structural results, exact numerics, one sufficient condition. **Companions:** `paper.md` §2.5 (lattice
recursion F1, phase separation O2/F3), `fractal.md` (lattice reading), `theory.md` (statement inventory, status
legend), `algorithm.md` (Theorem 2.1, Lemma 2.3).

This document develops the **pair lattice** — the twin-candidate residues of a wheel — as an object in its own right:
its exact recursion under wheel promotion, the geometry of the deletions that promotion performs, its density (which
is the Hardy–Littlewood singular series, materialised), and the precise sense in which it does and does not carry
information about twin primes.

Two facts frame everything that follows, and both are already in `paper.md`:

- a wheel **counts exactly** over its full period `P_k` (Claim F1, §2.5);
- a wheel **certifies primality** only on the window `[p_{k+1}, p_{k+1}²)` (Claim O2/F3, and `paper.md` §6.1 (a)).

The window has relative length `p_{k+1}²/P_k = e^{−(1+o(1))p_k}` inside the period, so the two ranges are separated by
a doubly exponential factor. Everything the pair lattice says is on one side of that separation or the other, and
knowing which side a statement lives on is the whole content of the subject. The document closes with three things the
framework delivers on the certified side: a well-posed conjecture (TP-J), a Lean-formalisable implication (W ⟹ TPC),
and a twin generator that is free given Algorithm B.

---

## 0. Summary

| object                                | what it gives                        | where                      | strength                     |
| ------------------------------------- | ------------------------------------ | -------------------------- | ---------------------------- |
| pair lattice `S_k^{(2)}`, count `T_k` | exact count, exact recursion (TP1/2) | over the full period `P_k` | upper bound on `π_2` (TP0)   |
| density `τ_k`                         | the singular series (TP3)            | period-wide, asymptotic    | heuristic density, not count |
| deletion geometry `δ_k`               | which copies die (TP8)               | period-wide, per class     | structural, tile-indexed     |
| roughness certificate (O2)            | holes **are** primes                 | `[p_{k+1}, p_{k+1}²)`      | equality, but no count       |

The first three rows are elementary and exact. The last row is the only place where holes are primes, and it carries no
count. Bridging the top three rows to the bottom row is an equidistribution problem at scale `e^{−p_k}` (§5.3), and
that problem is the twin prime conjecture in localised form (§6).

---

## 1. Notation

Extends `algorithm.md` §1.

| symbol                               | meaning                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `P_k = p_1⋯p_k`                      | `k`-th primorial (`P_0 = 1`)                                                           |
| `S_k = { r mod P_k : gcd(r,P_k)=1 }` | the stage-`k` wheel; `\|S_k\| = φ(P_k)`, `κ_k = φ(P_k)/P_k`                            |
| `S_k^{(2)}`                          | the **pair lattice**: `{ r mod P_k : gcd(r(r+2), P_k) = 1 }`                           |
| `T_k = \|S_k^{(2)}\|`                | number of twin-**candidate** residue classes mod `P_k`                                 |
| `τ_k = T_k / P_k`                    | density of twin-candidate positions                                                    |
| `π_2(x)`                             | number of primes `q ≤ x` with `q+2` prime                                              |
| `C_2 = ∏_{p≥3}(1 − 1/(p−1)²)`        | twin constant `≈ 0.6601618`                                                            |
| `C_2(y) = ∏_{3≤p≤y}(1 − 1/(p−1)²)`   | its partial product                                                                    |
| `g(n)`                               | Jacobsthal: max gap between consecutive integers coprime to `n` (`theory.md` T9)       |
| `g_2(n)`                             | **pair Jacobsthal**: max gap between consecutive elements of `S^{(2)}` mod `n` (§6.2)  |
| `P̄ = P_k^{-1} mod p_{k+1}`           | inverse of the previous primorial modulo the new prime (§4.4)                          |
| `j ∈ ℤ_{p_{k+1}}`                    | **tile index** of a promotion: tile `j` is `S_k^{(2)} + j·P_k` (one replicated period) |
| `δ_k ≡ −2P̄ (mod p_{k+1})`            | **deletion offset**: tile distance between the two deletions of a class (§4.4)         |

"Hole" means an element of `S_k` (or `S_k^{(2)}`) lifted to `ℤ_{>1}`, as in `paper.md` §2.5.

---

## 2. Two objects: classes and integers

Two distinct objects travel under the phrase "twin primes in the wheel", and every statement below is about exactly
one of them:

- **Classes.** `S_k^{(2)}` is a set of `T_k` residue classes mod `P_k`. It is finite, exactly computable, and its
  behaviour under promotion is elementary (§4).
- **Integers.** A twin prime pair is a pair of integers `(q, q+2)`, both prime. Every twin prime pair with `q > p_k`
  lies in some class of `S_k^{(2)}` — and so do infinitely many pairs in which one or both members are composite.

The relation between them is a containment, and it runs one way:

> **Claim TP0 (one-way containment).** For every `k` and every `x`,
> `#{ q ≤ x : q, q+2 both prime, q > p_k } ≤ #{ q ≤ x : q mod P_k ∈ S_k^{(2)} }`.
> Equality holds on `q ∈ [p_{k+1}, p_{k+1}² − 2)` and, in general, nowhere else.
>
> _Status: `[T]`. Proof: a prime `q > p_k` is coprime to `P_k`, and likewise `q+2` unless `q+2 ≤ p_k`; conversely a
> class of `S_k^{(2)}` contains composite representatives (§5.1). The equality range is Claim O2 /
> `Primegen.prime_of_rough_of_lt_sq` applied to both coordinates._

TP0 is the hinge of the whole document. Counts of pair-holes bound `π_2` **from above**; they become counts of twin
primes only on the window, where the containment is an equality. §4 develops the count side; §5 develops the
consequences of the direction.

---

## 3. Numbers first

`T_k` and its density, computed exactly (recursion proved in §4.1):

| `k` | `p_k` | `P_k`     | `φ(P_k)`  | `κ_k = φ/P` | `T_k`   | `τ_k = T_k/P_k` | `T_k/φ(P_k)` |
| --- | ----- | --------- | --------- | ----------- | ------- | --------------- | ------------ |
| 1   | 2     | 2         | 1         | 0.50000     | 1       | 0.50000         | 1.0000       |
| 2   | 3     | 6         | 2         | 0.33333     | 1       | 0.16667         | 0.5000       |
| 3   | 5     | 30        | 8         | 0.26667     | 3       | 0.10000         | 0.3750       |
| 4   | 7     | 210       | 48        | 0.22857     | 15      | 0.07143         | 0.3125       |
| 5   | 11    | 2 310     | 480       | 0.20779     | 135     | 0.05844         | 0.2813       |
| 6   | 13    | 30 030    | 5 760     | 0.19181     | 1 485   | 0.04945         | 0.2578       |
| 7   | 17    | 510 510   | 92 160    | 0.17950     | 22 275  | 0.04363         | 0.2417       |
| 8   | 19    | 9 699 690 | 1 658 880 | 0.16967     | 378 675 | 0.03904         | 0.2283       |

Sanity checks by hand: mod 6 the only pair class is `5` (`5,7`); mod 30 there are three — `(11,13)`, `(17,19)`,
`(29,31)` — and `T_3 = 1·1·3 = 3`. ✔

Read the table the way `paper.md` §6.1 (b) reads `κ_k`: the _count_ `T_k` explodes, the _density_ `τ_k` decays, and
the decay is `1/log²`. Both are consequences of the single recursion of §4.1, and the two facts are worth quoting
together — the growth of `T_k` is a statement about `P_k` growing faster than the density falls, nothing more.

---

## 4. Structure of the pair lattice

### 4.1 The pair count recursion

> **Claim TP1 (pair count).** `T_1 = 1` and, for `k ≥ 1` with `p = p_{k+1}`,
> `T_{k+1} = (p − 2)·T_k`. Hence `T_k = ∏_{3 ≤ p_i ≤ p_k} (p_i − 2)`.
>
> _Status: `[T]` (CRT, `theory.md` T4)._

_Proof._ By CRT, `r mod P_{k+1}` is `(r mod P_k, r mod p)`, and `gcd(r(r+2), P_{k+1}) = 1` iff `r mod P_k ∈ S_k^{(2)}`
and `r ≢ 0, −2 (mod p)`. For `p ≥ 3` the two excluded classes mod `p` are distinct (else `p | 2`), so exactly `p − 2`
of the `p` lifts of each class survive. ∎

Three features of the constants, since they are easy to misremember:

- The multiplier is `p − 2`, not `p`, and the per-stage deletion is `2/p`, not `1/p`. Both coordinates of a candidate
  pair are exposed to the new prime; this is the entire reason twin counting is a two-dimensional sieve rather than a
  one-dimensional one.
- The net effect on **density** is `τ_{k+1} = τ_k·(1 − 2/p)`, strictly decreasing. `T_k` grows only because `P_k`
  grows faster.
- At `p = 3` the factor is `p − 2 = 1`: stage 3 adds no new pair classes at all (mod 2 and mod 6 both have exactly
  one), so the growth of `T_k` is not even strict at the bottom of the range.

### 4.2 The promotion (pair version of Claim F1)

> **Claim TP2 (pair lattice recursion).** Let `p = p_{k+1}`, `P = P_k`, `p̄ = p^{-1} mod P`. Then, all sets taken mod
> `P_{k+1} = pP`,
>
> ```
> S_{k+1}^{(2)} = ( ⋃_{j=0}^{p−1} (S_k^{(2)} + j·P) )  \  ( D ⊎ D' )
> D  = p · { s : gcd(s(s + 2p̄), P) = 1 }
> D' = p · { s : gcd(s(s − 2p̄), P) = 1 } − 2
> ```
>
> with `|D| = |D'| = T_k` and `D ∩ D' = ∅` for `p ≥ 3`; counting gives TP1.
>
> _Status: `[T]` (routine CRT); not formalised. Its algorithmic content is `Primegen.theta_eq_image`: `D` is `Θ_p` read
> mod `P_{k+1}` and `D'` is `Θ_p − 2`._

_Proof._ Tile as in F1. A tile element dies iff `p | r` or `p | r+2`. If `r = ps`, then `gcd(r, P) = 1 ⟺ gcd(s, P) = 1`
and `gcd(r+2, P) = gcd(ps+2, P) = 1 ⟺ gcd(s + 2p̄, P) = 1` (multiply by the unit `p̄`); this is `D`. The case
`p | r+2`, `r = ps − 2`, gives `D'` symmetrically. Disjointness: `p | r` and `p | r+2` forces `p | 2`. ∎

So promotion in the pair setting is exactly what it is in the single-hole setting — replicate the period `p` times,
punch out the multiples of the new prime — with one twist worth recording. In F1 (`paper.md` §2.5) the deleted set is a
dilated copy **of the previous stage itself**; here it is a dilated copy of a **shifted twin** of the previous stage,
and there are **two** of them. The self-similarity is therefore weaker: the deletion sets are affine images of a
_different_ member of the same family. Any argument leaning on exact self-similarity has to be checked against that
twist, and §4.4 removes half of it (the two sets are translates of each other) while open problem 4 asks whether the
rest can be organised into a genuine IFS on a finite alphabet.

In generator language: a pair `(n, n+2)` is deleted at stage `k+1` exactly when `n ∈ Θ_p` or `n+2 ∈ Θ_p`. Twin sieving
is the single sieve run against two shifted copies of itself; nothing more.

### 4.3 Density = the singular series

> **Claim TP3 (density).** Exactly,
> `τ_k = ½ · C_2(p_k) · ∏_{3≤p≤p_k}(1 − 1/p)²`, and asymptotically
> `τ_k ~ 2 C_2 e^{−2γ} / log² p_k`.
>
> _Status: `[C]` — Mertens (`theory.md` T7) plus the identity `(1−2/p)/(1−1/p)² = 1 − 1/(p−1)²`._

Check at `k = 6`: `∏_{3≤p≤13}(1−1/p) = 0.383616`, squared `0.147161`; `C_2(13) = 0.672059`; half the product is
`0.049450 = 1485/30030`. ✔

The pair lattice therefore _is_ the Hardy–Littlewood singular series, materialised as a finite set of residues. That is
a genuine and pleasant identification. It also fixes the register the object speaks in: the singular series is a
**heuristic density**, and the gap between it and a prime count is measurable and provably nonzero.

> **Remark TP3a (hole density exceeds prime density, by a constant, provably).** Sieving by all `p ≤ √x` leaves
> survivor density `∏_{p≤√x}(1−1/p) ~ 2e^{−γ}/log x ≈ 1.1229/log x`, whereas `π(x)/x ~ 1/log x`. The wheel exceeds the
> **single**-prime count by `2e^{−γ} ≈ 1.123`. Squaring, the pair lattice at level `√x` gives
> `8C_2e^{−2γ}/log²x ≈ 1.6634/log²x` against the conjectured truth `2C_2/log²x ≈ 1.3203/log²x`: a factor
> `(2e^{−γ})² ≈ 1.2599`.
>
> _Status: `[C]` (Mertens vs. PNT)._

TP3a is the quantitative form of TP0: hole density is strictly larger than prime density, and the discrepancy does not
vanish with `k`. A recursion on hole counts is a recursion on the larger quantity throughout.

### 4.4 Deletion geometry: two strikes, rigidly linked

A natural question about promotion is _which_ of the `p` replicated copies of a given twin class get punched out. This
has a complete elementary answer, and it is sharper than "two of them do".

> **Claim TP8 (deletion geometry).** Let `p = p_{k+1}`, `P = P_k`, `P̄ = P^{-1} mod p`, and index the `p` tiles of the
> promotion by `j ∈ ℤ_p`, tile `j` being `S_k^{(2)} + jP`. Fix a class `r ∈ S_k^{(2)}`. The lift `r + jP` is deleted iff
>
> ```
> j = j_0(r) := −r·P̄     mod p      (left  coordinate hit: p | r + jP)
> j = j_1(r) := −(r+2)·P̄ mod p      (right coordinate hit: p | r + jP + 2)
> ```
>
> and `j_1(r) − j_0(r) ≡ −2P̄ =: δ_k (mod p)`, **independent of `r`**. Consequently:
>
> - **(a) no copy is deleted twice.** `j_0(r) ≠ j_1(r)` for `p ≥ 3`, so exactly `p − 2` of the `p` copies survive,
>   never fewer — hence `p − 2 ≥ 1` and no pair class ever dies (TP4 for `H = {0,2}`, re-derived geometrically).
> - **(b) the two deletion sets of TP2 are translates.** `D' = D + δ_k·P (mod P_{k+1})`; the pair sieve performs one
>   strike and a rigid companion strike at fixed offset, not two independent strikes.
> - **(c) survivors come in two arcs.** The surviving tiles of each class are the two cyclic intervals of lengths
>   `δ_k − 1` and `p − δ_k − 1`, so every class survives on a run of `≥ ⌈(p−2)/2⌉` **consecutive** copies.
>
> _Status: `[T]` (CRT plus one unit multiplication); not formalised (§8.3)._

_Proof._ `r + jP ≡ 0 (mod p) ⟺ j ≡ −rP̄ (mod p)` since `P` is a unit mod `p`; likewise `r + jP + 2 ≡ 0 ⟺ j ≡ −(r+2)P̄`.
Subtracting gives `δ_k`, and `δ_k ≢ 0` because `p ∤ 2`, which is (a) — and counting `p − 2` survivors per class over all
`T_k` classes is TP1 again. For (b), the element of `D` in the lift of class `r` is `r + j_0(r)P` and the element of
`D'` is `r + j_1(r)P = (r + j_0(r)P) + δ_k P`, and every element of `D'` arises this way. For (c), two distinct points
cut `ℤ_p` into arcs of lengths `δ_k − 1` and `p − δ_k − 1`, whose maximum is `≥ ⌈(p−2)/2⌉`. ∎

> **Remark TP8a (adjacency criterion).** The two deleted copies of a class are cyclically **adjacent** exactly when
> `δ_k ≡ ±1 (mod p)`, i.e. when `P_k ≡ ∓2 (mod p_{k+1})`. This does occur:
>
> | `k` | `P_k mod p_{k+1}` | `δ_k` | cyclic distance | adjacent?                |
> | --- | ----------------- | ----- | --------------- | ------------------------ |
> | 1   | `2 mod 3`         | 2     | 1               | yes (vacuously: `p = 3`) |
> | 2   | `1 mod 5`         | 3     | 2               | no                       |
> | 3   | `2 mod 7`         | 6     | 1               | **yes**                  |
> | 4   | `1 mod 11`        | 9     | 2               | no                       |
> | 5   | `9 mod 13`        | 7     | 6               | no                       |
> | 6   | `8 mod 17`        | 4     | 4               | no                       |
> | 7   | `18 mod 19`       | 2     | 2               | no                       |
> | 8   | `15 mod 23`       | 6     | 6               | no                       |
>
> The `k = 3` row is explicit: mod 210 every class loses copies `j = 4` and `j = 5`. Take `r = 11 mod 30`, lifting to
> `11, 41, 71, 101, 131, 161, 191`; the deletions are `131` (because `133 = 7·19`) and `161 = 7·23` — adjacent copies.
> Since `Σ_k 2/p_{k+1}` diverges, one should expect adjacency infinitely often; deciding it is a primorial-congruence
> question of the usual intractable kind, and nothing here depends on the answer.
>
> _Status: `[T]` for the criterion and the table._

**What TP8 pins down.** (i) The loss is exactly `2` per class, so the multiplier is `p − 2`: the two strikes can
neither coincide (which would give `p − 1`) nor cascade (`p − 3`). (ii) The second deletion set is not an independent
object but a rigid translate of the first, which removes half of §4.2's twist. (iii) `δ_k` is a computable invariant of
the stage with no analogue in the single-hole recursion F1, where there is only one strike.

**What TP8 is about.** Copies of residue classes. It constrains _which_ of the `p` copies of a class dies, and every
such statement is period-wide; §5.4 records how that relates to the window.

In generator language: at stage `k+1` the pair sieve is one strike set plus a rigid shift by `δ_k P_k`, so a
pair-marking pass needs one traversal and a fixed offset rather than two independent traversals (cf. §8.2).

### 4.5 Admissibility

> **Claim TP4 (admissibility).** For a finite `H ⊂ ℤ_{≥0}`, let `S_k^{(H)} = { r : gcd(∏_{h∈H}(r+h), P_k) = 1 }`. Then
> `|S_k^{(H)}| = ∏_{i≤k} (p_i − ν_i)` where `ν_i = #{ h mod p_i : h ∈ H }`; and `S_k^{(H)} ≠ ∅` for all `k` iff `H` is
> admissible (`ν_i < p_i` for all `i`).
>
> _Status: `[T]` (CRT)._

TP4 is the reason the class-level picture is well behaved for every admissible pattern and self-corrects for
inadmissible ones: run the recursion on `{0,2,4}` and it dies at `p = 3` (`ν = 3`), as it must, since there is exactly
one prime triple of that shape. The class-level theory is thus complete and pattern-uniform; the distance between it
and a statement about integers is uniform too, and is the subject of §5.

---

## 5. The period–window dichotomy

This section collects, in one place, the four ways in which class-level information and integer-level information
differ. None of them is a defect of the recursion; they are the boundary of what a period-wide exact count can express.

### 5.1 Holes are candidates: composite pair-holes exist

The holes of `S_k` are certified prime on `[p_{k+1}, p_{k+1}²)` and nowhere else (Claim O2/F3, `paper.md` §6.1 (a)).
The boundary is reached inside the first period: `121 = 11²` is coprime to `P_4 = 210`, so `121 ∈ S_4` with
`121 < P_4` — a composite hole in the mod-210 wheel's own first period, and the exact reason
`Primegen.prime_of_rough_of_lt_sq` carries the hypothesis `n < p²`.

For pairs the same thing happens, and one can exhibit it in both flavours:

- **one coordinate composite.** `(167, 169) ∈ S_4^{(2)}` — both coprime to `210`, `167` prime, `169 = 13²`. It sits at
  `167 < 210`, i.e. inside the first period, above the window `[11, 121)`.
- **both coordinates composite.** `(527, 529) ∈ S_5^{(2)}` — both coprime to `2310`, `527 = 17·31`, `529 = 23²`, and
  `527 < 2310`, again inside the first period.

The general statement needs no lucky example:

> **Claim TP5 (composite pair-holes exist at every stage `k ≥ 4`).** `S_k^{(2)}` contains classes whose small
> representatives are composite in one or both coordinates: for `p_{k+1}`-rough composites `m, m+2` the pair `(m, m+2)`
> lies in `S_k^{(2)}`, and such pairs exist below `P_k` as soon as `p_{k+1}² < P_k`, i.e. for `k ≥ 4`.
>
> _Status: `[T]` given `p_{k+1}² < P_k` for `k ≥ 4` (Cor. 2.4 of `algorithm.md`); the existence count is
> `Φ`-counting, `theory.md` T8._

So `S_k^{(2)}` counts _candidate_ pairs, exactly as `S_k` counts _candidate_ primes, and `T_k` is properly named
"number of twin-candidate residue classes mod `P_k`".

### 5.2 Classes are not integers

`T_k` counts residue classes. A class is an infinite arithmetic progression `{ r + jP_k }`. TPC asks for **one integer
pair** `(q, q+2)` inside **some** class with **both** coordinates prime. Promotion never empties a class (TP4), so the
class-level theory separates cleanly into two statements that it cannot connect:

- "this class is admissible and full of candidates" — true for every class, at every stage, and what TP1 counts;
- "this class contains a twin prime pair" — the conjecture.

The analogous single-coordinate pair is `φ(P_k) → ∞` versus "there are infinitely many primes": the first is about
holes, the second about primes, and §5.1 is the reason those are different sets.

### 5.3 The inequality has a direction

> **Claim TP6 (direction).** By TP0, for every `k` and `x`, the count of twin-candidate positions `≤ x` is an **upper
> bound** on `π_2(x)`. Growth of that count from stage to stage is growth of an upper bound, which is compatible with
> `π_2(x)` bounded.
>
> _Status: `[T]`._

Two facts from the literature put TP6 in context rather than treating it as a technicality. Brun's sieve gives
`π_2(x) ≪ x/log²x` — an upper bound of exactly the shape TP1/TP3 predicts — and Brun's theorem (convergence of
`Σ 1/q` over twins) shows the twins are sparse enough that density arguments of this kind cannot force infinitude. In
the other direction, the parity problem (Selberg; Bombieri's asymptotic sieve) is the theorem-level statement that a
sieve of this shape **cannot** produce a positive lower bound for a two-variable pattern: it cannot separate "both
coordinates prime" from "both coordinates have an odd number of prime factors". Chen's theorem (1973) — infinitely many
`q` with `q+2` prime _or_ semiprime — marks where pure sieve stops.

### 5.4 The bridging input is equidistribution

The one range where TP0 is an equality is the window, so the natural localised question is whether the window contains
a candidate pair (§6). Getting there from §4 means converting a count over a full period `P_k = e^{(1+o(1))p_k}` into
occupancy of an interval of relative length `p_{k+1}²/P_k = e^{−(1+o(1))p_k}` — i.e. equidistribution of `S_k^{(2)}` at
scale `e^{−p_k}`. That is the input the modern literature works hardest for and obtains only in averaged form:
Goldston–Pintz–Yıldırım, Zhang's extension of Bombieri–Vinogradov, Maynard–Tao and Polymath8 give **bounded gaps**
(`≤ 246`) rather than gap 2, precisely because the available equidistribution is lossy. The wheel recursion supplies
none of it; it is a statement about periods.

The deletion geometry of §4.4 sits on the period side as well, and it is worth seeing exactly how. For `k ≥ 4` we have
`p_{k+1}² < P_k` (Cor. 2.4 of `algorithm.md`), so the certified window `[p_{k+1}, p_{k+1}²)` lies inside tile `j = 0`
**alone**; the other `p − 1` copies of every class sit at positive multiples of `P_k` and are invisible to the window.
TP8 fixes the _offset_ `δ_k` between the two deleted copies, not their _position_: tile `0` of class `r` is deleted
exactly when `p | r` or `p | r + 2`, and `j_0(r) = −rP̄` sweeps all of `ℤ_p` as `r` sweeps `S_k^{(2)}`, so tile `0`
loses its share of classes like every other tile. A guaranteed run of `⌈(p−2)/2⌉` surviving consecutive copies is a
guarantee about residues far out in the period. The geometry is thus **transverse** to the window: period-wide
structure, window silence. Open problem 6 turns this into a measurement.

Summary, and the one thing worth remembering:

| what the wheel gives you | where                               | strength                   |
| ------------------------ | ----------------------------------- | -------------------------- |
| exact counts             | over the full period `P_k`          | upper bound only (TP0/TP6) |
| exact certification      | on the window `[p_{k+1}, p_{k+1}²)` | equality, but **no count** |

The two ranges do not overlap, and the gap between them is doubly exponential.

---

## 6. A sufficient window condition

On the certified side there is one honest, well-posed target.

> **Claim W (window occupancy).** For every prime `p` there exist `h` with `p ≤ h`, `h + 2 < p²`, and both `h` and
> `h+2` coprime to `P_{<p}`.
>
> Equivalently: for every prime `p`, the pair lattice at the stage below `p` has a hole-pair inside the certified
> window.

> **Claim TP7 (W ⟹ TPC).** Claim W implies there are infinitely many twin primes.
>
> _Status: `[P]` — provable now, in Lean, from `Primegen.prime_of_rough_of_lt_sq` alone. See §8.3._

_Proof._ Given `p`, Claim W produces `h` with `p ≤ h < h+2 < p²`, both `p`-rough. By Claim O2
(`prime_of_rough_of_lt_sq`) applied to each coordinate, both `h` and `h+2` are prime, so `(h, h+2)` is a twin pair with
`h ≥ p`. Letting `p` run over the primes gives twin pairs above every bound. ∎

Three remarks on the standing of W:

1. **W is not weaker than TPC.** TP7 gives `W ⟹ TPC`, and no implication is known in the other direction, so W sits at
   or above TPC in strength. It is a _reformulation with a sharper localisation_, in the family of
   Legendre/Brocard-type short-interval statements (Brocard: at least four primes between consecutive prime squares for
   `p ≥ 3`; W is its twin analogue). It is not available as a lemma toward TPC.
2. **What W would follow from is a pair-Jacobsthal bound.** Define `g_2(n)` = the maximal gap between consecutive
   elements of `S^{(2)}` mod `n`. Then

   > **Conjecture TP-J (pair Jacobsthal).** `g_2(P_k) ≪ log² P_k ≍ p_k²`.

   `TP-J ⟹ W` up to constants (a gap bound below the window length `p_{k+1}²` forces a hole-pair in the window), hence
   `TP-J ⟹ TPC`, hence TP-J is hard. Note the calibration: for the **single**-hole analogue the corresponding bound is
   Iwaniec's theorem `g(P_k) ≪ log²P_k` (`theory.md` T9) — the single-coordinate version of the required input is
   known, and lands _exactly_ at the window length, which is why the single-prime version of the window statement is
   within reach and the pair version is not. The lower bound of Ford–Green–Konyagin–Maynard–Tao shows there is no slack
   to spare.

3. **TP-J is measurable.** `g_2(P_k)` is computable exactly for `k ≤ 8` (period `9 699 690`) and by segmented
   enumeration well beyond. Fitting `g_2(P_k)` against `p_k^α` either supports TP-J with a credible exponent or kills
   it. This is where the framework of `paper.md` contributes something new to the twin question, and it contributes
   _data_. Measure before quoting — `paper.md` §6's caveat applies verbatim.

---

## 7. Context in the literature

| item                                                       | relation                                                                               |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Hardy–Littlewood (1923), `2C_2 x/log²x`                    | TP3 **is** the singular series; a century-old heuristic, materialised as a residue set |
| Brun (1919), sieve + convergence of `Σ 1/q` over twins     | upper bound of the shape TP1 predicts; density arguments cannot force infinitude       |
| Selberg's parity example; Bombieri, asymptotic sieve       | a sieve of this shape cannot give a positive lower bound for a 2-variable pattern      |
| Chen (1973)                                                | `q, q+2 = P_2` — where pure sieve stops                                                |
| Goldston–Pintz–Yıldırım (2009); Zhang (2014); Maynard, Tao | bounded gaps; the input is equidistribution (§5.4), which the wheel does not supply    |
| Iwaniec; Ford–Green–Konyagin–Maynard–Tao                   | `g(P_k)` bounds — the single-coordinate calibration for TP-J (`theory.md` T9)          |
| Pritchard (1982)                                           | wheel promotion = TP2/F1; not novel (`theory.md` T55, `paper.md` §6.1 (d))             |

The pattern is uniform: every classical counterpart of a statement in §4 is one-sided in the direction TP0 predicts,
and that one-sidedness is the parity problem.

---

## 8. What this framework delivers

Three deliverables, in decreasing order of certainty.

### 8.1 A twin generator, free

Algorithm B (`paper.md` §4.3) emits the primes in increasing order with `O(1)` state per prime and no array over the
range. Twin detection is one register:

```
twins():                       # unbounded; O(π(√n)) memory, as B()
  prev := none
  for q in B():
      if prev ≠ none and q − prev = 2:  emit (prev, q)
      prev := q
```

No extra asymptotic cost, and it inherits `paper.md` §4.6's `O(1)` random-access restart, so twin counting is exactly
as segment-parallel as prime counting. This is the right tool for §6's measurements and for checking `π_2(x)` against
`2C_2 x/log²x`.

### 8.2 A pair wheel for the scan — with a caveat

`T_w` of the `φ(W)` spokes are pair-spokes. At `W = 30030`: `1485` of `5760`, so a scan searching for twins need test
only `25.8%` of spoke positions — a `3.88×` reduction in scan positions. Build it exactly like `paper.md` §4.2:

```
pairSpokes = sorted { r ∈ [0,W) : gcd(r,W) = gcd(r+2,W) = 1 }      # |pairSpokes| = T_w
```

**Caveat, and it is the same wall as Conjecture X1 one level up.** The saving is in the _scan_, not in the _advance_.
Restricting stream `p` to multipliers whose product lands on a pair-relevant position requires a step table indexed by
`p mod W` — a per-prime table, i.e. primorial space, i.e. the obstruction of `algorithm.md` Remark 2.9. So:
pair-restrict the scan, never the advance. Marking still covers `pairSpokes ∪ (pairSpokes + 2)`, which is `2T_w = 2970`
of `5760` spokes at `w = 6` — a genuine but modest `~48%` reduction in useful marks, not in performed marks.

### 8.3 Formalisation targets

Consistent with `paper.md` §9, and all reachable from lemmas already in `lean/`:

| statement                      | proposed Lean name               | file (new)  | input                              |
| ------------------------------ | -------------------------------- | ----------- | ---------------------------------- |
| TP1 pair count recursion       | `Twin.card_pairLattice_succ`     | `Twin.lean` | CRT, Mathlib                       |
| TP2 pair lattice recursion     | `Twin.pairLattice_succ`          | `Twin.lean` | CRT + units                        |
| TP8 deletion geometry (`δ_k`)  | `Twin.deleted_tile_offset`       | `Twin.lean` | CRT + `ZMod` units                 |
| TP8(a) no copy dies twice      | `Twin.deleted_tiles_ne`          | `Twin.lean` | `p ∤ 2`                            |
| TP4 admissibility              | `Twin.pairLattice_nonempty_iff`  | `Twin.lean` | CRT                                |
| TP7 `W ⟹ TPC`                  | `Twin.infinite_twins_of_window`  | `Twin.lean` | `Primegen.prime_of_rough_of_lt_sq` |
| TP5 composite pair-holes exist | `Twin.exists_composite_pairHole` | `Twin.lean` | `algorithm.md` Cor. 2.4            |

`Twin.infinite_twins_of_window` is short and is worth doing precisely because it makes the shape of §5 **machine-visible**:
the hypothesis is Claim W, the conclusion is TPC, and the promotion recursion appears nowhere in the proof — the
certified window carries the entire primality content.

A note on scope, since it is the same point in kernel form: there is no statement of the form "TP1 ⟹ TPC" to formalise.
TP1 is a statement about residue classes and TPC is a statement about integers, so the goal cannot be closed at the
step where classes must become integers; that step is §5.2, and its content is §5.4.

---

## 9. Claim → status table

| id   | statement                                             | status                   | depends on   |
| ---- | ----------------------------------------------------- | ------------------------ | ------------ |
| TP0  | one-way containment, equality only on the window      | `[T]`                    | O2 / F3, T1  |
| TP1  | `T_{k+1} = (p−2)T_k`                                  | `[T]`                    | T4           |
| TP2  | pair lattice recursion, two twisted affine deletions  | `[T]` (not formalised)   | T4, F1       |
| TP3  | `τ_k` = singular series; `~ 2C_2e^{−2γ}/log²p_k`      | `[C]`                    | T7           |
| TP3a | hole density exceeds prime density by `(2e^{−γ})^h`   | `[C]`                    | T7 + PNT     |
| TP4  | admissibility ⟺ classes survive forever               | `[T]`                    | T4           |
| TP5  | composite pair-holes exist for `k ≥ 4`                | `[T]`                    | Cor. 2.4, T8 |
| TP6  | period-wide counts bound `π_2` from above             | `[T]`                    | TP0          |
| TP8  | deletion geometry: `j_1 − j_0 ≡ δ_k`, `D' = D + δ_kP` | `[T]` (not formalised)   | T4, TP2      |
| TP8a | deleted copies adjacent ⟺ `P_k ≡ ∓2 (mod p_{k+1})`    | `[T]`                    | TP8          |
| W    | window occupancy                                      | `[?]` open, `⟹` TPC      | —            |
| TP7  | `W ⟹ TPC`                                             | `[P]` (formalisable now) | O2           |
| TP-J | `g_2(P_k) ≪ p_k²`                                     | `[?]` open, `⟹ W ⟹ TPC`  | —            |

Status tags follow `theory.md` §0.

---

## 10. Open problems

1. **Measure `g_2(P_k)`** exactly for `k ≤ 8` and by segmented enumeration for `k ≤ 12`; fit `g_2(P_k) ≍ p_k^α`. Does
   `α ≤ 2` look plausible (TP-J), or does the pair gap outgrow the window? This is the single most informative
   experiment the framework supports, and it is cheap with §8.1.
2. **Window occupancy statistics.** For each `k`, count the pair-holes actually inside `[p_{k+1}, p_{k+1}²)` and
   compare with the period-wide prediction `τ_k·p_{k+1}²`. Any systematic deficit is the §5.4 equidistribution defect,
   made numerical.
3. **Formalise TP7 and TP1** (§8.3). Small, honest, and they put the period/window boundary in the kernel.
4. **Does TP2's twist matter?** The pair recursion deletes affine copies of _shifted_ pair lattices rather than of
   itself (§4.2). TP8(b) halves the problem: the two deletion sets are translates, `D' = D + δ_k P_k`, so a single
   generator plus a stage-dependent translation may suffice, and the only residual twist is that `D` is a dilate of
   `{ s : gcd(s(s + 2p̄), P) = 1 }` — a pair lattice with a stage-dependent shift `2p̄` — rather than of `S_k^{(2)}`
   itself. Is there an exact recursion on a finite family of shifted lattices closed under promotion — a genuine IFS on
   a finite alphabet? If so, `paper.md` §2.5's Moran reading extends to pairs and its transfer operator is computable.
   This is a structural question about the lattice; TP6 is unaffected either way.
5. **`π_2` versus the wheel prediction.** Verify TP3a's `1.26` factor numerically to `10^{10}` with §8.1, and check
   that the discrepancy is the predicted constant rather than a trend. If it is a trend, something in the accounting is
   wrong and worth finding.
6. **Where does the window's copy die?** TP8 fixes the offset `δ_k` between the two deleted copies but says nothing
   about their location. Tabulate, for each `k`, the distribution of `j_0(r) = −rP̄ mod p_{k+1}` over `r ∈ S_k^{(2)}`,
   and in particular how many classes lose tile `0` — the only tile the certified window meets. Equidistribution of
   `j_0` is a period-wide statement and is provable; what §5.4 asks for is the reverse conditioning (given a position in
   the window, which class is it in, and did that class survive), and the experiment makes the distance between the two
   questions numerical. Also record `δ_k` for `k ≤ 12` and check the adjacency criterion `P_k ≡ ±2 (mod p_{k+1})`
   against the heuristic frequency `2/p_{k+1}`.

---

## 11. Summary

The pair lattice `S_k^{(2)}` is an exact, cheap, fully elementary object: it satisfies a promotion recursion of the same
shape as Claim F1 (TP2), its count obeys `T_{k+1} = (p_{k+1} − 2)T_k` (TP1), its deletion geometry is one strike plus a
rigid translate by `δ_k P_k` with no copy ever deleted twice and a guaranteed run of `⌈(p−2)/2⌉` consecutive survivors
(TP8), and its density is the Hardy–Littlewood singular series (TP3). All of that lives over the full period `P_k`,
where hole counts bound `π_2` from above (TP0/TP6) and hole density strictly exceeds prime density by a nonvanishing
constant (TP3a). The one region where holes _are_ primes is `[p_{k+1}, p_{k+1}²)`, of relative length `e^{−(1+o(1))p_k}`
inside that period, and it carries a certificate but no count. Bridging the two is a short-interval equidistribution
problem — the input GPY/Zhang/Maynard obtain only in averaged form, yielding bounded gaps rather than gap 2, and which
the parity problem prevents a pure sieve from converting into a lower bound. On the certified side the framework
contributes a sufficient window condition with a two-line proof from an already machine-checked lemma (`W ⟹ TPC`, TP7),
a sharp and measurable conjecture calibrated against Iwaniec's theorem (TP-J), a set of small formalisation targets, and
a twin generator that costs one register on top of Algorithm B.
