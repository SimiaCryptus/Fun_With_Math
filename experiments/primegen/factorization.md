# Factorization from the Orthogonal Stream Family

**Status:** exploration and brainstorm, with one concrete new algorithm (§6, Algorithm D), two corrections to sibling
documents (§5.3, §7.2), and an explicit no-go (§1). **Companions:** `paper.md` (primary specification),
`algorithm.md` (§3 Algorithm A, §4 Algorithm B, §4C Algorithm C, §5 engineering), `min_factor.md` (Algorithm C in full),
`generator.md` (architecture), `observation.md` (multiplier sets), `fractal.md` (lattice reading),
`theory.md` (statement inventory, status legend), `algorithm-a.js` / `algorithm-b.js` / `algorithm-c.js`
(executable references).

Status tags follow `theory.md` §0: `[T]` trivial, `[C]` classical, `[K]` known in the algorithms literature,
`[N]` new framing, `[P]` provable but unproved here, `[?]` open. New statements here are numbered `FC…`.

---

## 0. Summary

The generator family already computes factorizations; it just does not say so out loud. Each algorithm splits every
composite at a different place, and the split _is_ factorization data:

| algorithm | index                         | what a pop tells you about `m`                   | which end |
| --------- | ----------------------------- | ------------------------------------------------ | --------- |
| **A**     | base `b = m/P(m)`             | `P(m)` and `m/P(m)`, one touch, no division      | top       |
| **B**     | prime `p`                     | the **set** `{p : p ∣ m, p² ≤ m}` — no exponents | bottom    |
| **C**     | layer `(p, e)`                | `(spf m, v_spf m, m/spf^v)` — one prime, exactly | bottom    |
| **D** §6  | layer `(p, e)`, tail restored | the **full** factorization of `m`, no division   | bottom    |

The four rows are not competing implementations of one idea; they answer four different questions, and the right one
depends on whether you want the largest prime factor (smoothness), the smallest (roughness), the set of small factors (a
sieve hit list), or all of it.

Three things this document establishes, in decreasing order of confidence:

1. **The obvious reading of Algorithm C as "the factorizer" is wrong** (§5). C's claimant set is _strictly smaller_
   than B's — that is min_factor.md's Claim M10, sold there as an advantage — and the primes it drops are exactly the
   ones a flat factorizer needs. The least witness is the same `847 = 7·11²` that makes C look good on touches. The
   inversion is exact: **the property that makes C cheap makes it incomplete.**
2. **Restoring the dropped tail costs nothing and buys everything** (§6). Replacing C's constraint `r ≥ p` with
   `p^e·r ≥ p²` yields Algorithm D, whose touch count is _identically_ `ops_B(N)`, whose claimant set is _identically_
   `claimants_B(m)` but carrying exponents, and which therefore reports the complete factorization of every candidate
   with `O(π(√N))` state, no range array, and no divisions except one per composite to recover the single large prime.
   This is the deliverable.
3. **None of this touches single-target factorization** (§1, §10). The family factors _ranges_. Factoring one `N` by any
   member of it is trial division wearing a heap. Say so before saying anything else.

---

## 1. Scope: ranges, not targets

> **Claim FC0 (the no-go).** Let `X` be a member of the family {A, B, C, D}. Determining `spf(N)` for a single
> input `N` by running `X` costs `Ω(π(√N))` operations in the best case and `Ω(κ_W·N)` if run as specified.
>
> _Status: `[T]`._ _Argument._ `X` decides compositeness of `N` by whether some stream's cursor lands on `N`. A
> stream lands on `N` iff its prime divides `N`, so "which streams claim `N`" is literally the set of prime divisors
> of `N` below `√N`. Evaluating that predicate for every candidate stream without running the scan is trial division
> by the primes `≤ √N`; running the scan visits every `W`-coprime integer below `N`. There is no third option
> inside the architecture. ∎

Two ways to say the same thing, both worth keeping:

- **Factorization is the transpose of generation.** The generator streams the map `n ↦ (its claimants)` in row-major
  order over `n`. Factoring a given `N` is a single-column query on that matrix, and the architecture has no locality in
  that direction. Every cost in `paper.md` §4.5 is an amortised cost, and the amortisation is over the range; per-target
  it vanishes entirely.
- **The queue is the factor base.** At scan position `n` the state of Algorithm B is one record per prime `≤ √n`. That
  is not an accident of implementation: any streaming decision rule of this shape must carry enough state to determine
  `spf(n)` at the moment `n` arrives, and `spf` is what a factor base is for. Compare Remark M-X (`min_factor.md` §2.5)
  and Conjecture X1 (`paper.md` §2.4): the obstruction is relocated, never removed.

> **Remark FC0a.** Everything below therefore concerns _enumerative_ factorization: factor tables, segment
> factorizers, smooth/rough enumeration, streaming multiplicative functions. For subexponential single-target work
> — Pollard ρ, `p−1`, ECM, SQUFOF, CFRAC, QS, NFS — this family contributes nothing, and §10 records the one place
> where the framework at least _explains_ something (bucket sieving in NFS) without improving it.

---

## 2. Notation

Inherits `algorithm.md` §1 and `min_factor.md` §1. Additionally:

| symbol             | meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `L(m)`             | the **large part** `m / ∏_{p ≤ √m} p^{v_p(m)}`; `1` or a prime       |
| `K(m)`             | the **claimed part** `m / L(m)`                                      |
| `claimants_B(m)`   | `{ p prime : p ∣ m, p² ≤ m }` (`AlgB.claims_iff`)                    |
| `claimants_C(m)`   | `{ (p, v_p(m)) : p ∣ m, (m = p^{v_p} ∨ m/p^{v_p} ≥ p) }` (Claim M10) |
| `claimants_D(m)`   | `{ (p, v_p(m)) : p ∣ m, p² ≤ m }` (§6)                               |
| `Ψ(x,y)`, `Φ(x,y)` | counts of `y`-smooth, `y`-rough integers `≤ x`                       |
| `Δ`                | segment length in the bucketed form (`algorithm.md` §5.1)            |

Throughout, "`W`-coprime" is the wheel restriction of `paper.md` §4.2 with `W = p_1⋯p_w`, `κ_W = φ(W)/W`.

---

## 3. What each algorithm already emits

### 3.1 Algorithm A — the top end

Theorem 3.1 of `algorithm.md`: the streams `Σ_b = { b·q : q prime, q ≥ P(b) }` partition the composites, and a pop of
`Σ_b` at value `m` carries the pair `(b, q)` with `q = P(m)`, `b = m/P(m)`.

> **Claim FC-A1.** Algorithm A is a **streaming largest-prime-factor oracle**: every composite is emitted exactly
> once, together with `P(m)` and `m/P(m)`, with no division and no range array.
>
> _Status: `[T]` from Theorem 3.1 (uniqueness of the pair `(b,q)`)._

This is the exact dual of `min_factor.md`'s Claim M11, and it is the one the smoothness literature cares about, because
smoothness is a statement about `P(m)`.

### 3.2 Algorithm B — the hit list

A `W`-coprime composite `m` is popped once per prime factor `p ≤ √m` (`algorithm.md` §4.5), and the popped record is
`(m, p, m/p)`.

> **Claim FC-B1 (flat completeness).** For every `W`-coprime composite `m`,
> `{ p : p ∣ m } = claimants_B(m) ⊎ { L(m) }` when `L(m) > 1`, and `= claimants_B(m)` otherwise; `L(m)` is `1` or
> prime, and at most one prime factor of `m` exceeds `√m`, necessarily to the first power.
>
> _Status: `[T]`._ _Proof._ If `p ∣ m` and `p ≤ √m` then `p² ≤ m`, so `p` claims. If two prime factors (with
> multiplicity) exceed `√m` their product exceeds `m`. Hence the unclaimed part is `1` or a single prime. ∎

So **B's drain already knows every prime factor of `m` except at most one, and that one is a quotient away.** What it
does not know is the exponents: the record carries `m/p`, not `m/p^{v_p}`.

### 3.3 Algorithm C — the bottom end, one prime deep

Claim M11: the minimum claimant of the drain carries `(spf(m), v_spf(m), m/spf^v)` exactly. That is one line of the
factorization, exactly, with no division — and, as §5 shows, only one line.

### 3.4 The symmetry worth remembering

```
A   splits at P(m)     →  smoothness   →  y-smooth = union of truncated A-streams
C   splits at spf(m)   →  roughness    →  y-rough  = union of C-layers
B   splits at every p ≤ √m, no exponents
D   splits at every p ≤ √m, with exponents          (§6)
```

`min_factor.md` §8 claims both smooth and rough enumeration for C; only half of that is true. See §7.2.

---

## 4. What "factor a range" actually requires

Three resources, and every method in §11's table pays for at least two:

1. **A factor base.** Primes `≤ √N` if you are willing to divide out and inspect the residual; primes `≤ N/2` if you
   insist that every prime factor announce itself. `π(√N)` versus `π(N)` is the whole game, and the reason all four
   algorithms cut off at `p² ≤ m`.
2. **A place to accumulate.** Either a residual array over the segment (classic factoring sieve: `Δ` words), or a
   per-candidate accumulator that is filled in one drain (B, C, D: `O(Ω(m))` transient), or an ancestry structure (A:
   `S(N)` persistent, §8).
3. **Exponents.** Either by repeated division (`Σ_m Ω(m) ≈ N log log N` divisions over `[1,N]`), by marking `p, p²,
p³, …` separately (`Σ_p Σ_e N/p^e = N Σ_p 1/(p−1)` touches — strictly more than `N Σ_p 1/p`), or structurally, by
   indexing streams with the exponent so that a claim _means_ `v_p(m) = e`. The last is what the min-factor normal form
   is for, and it is the one place where `min_factor.md`'s refinement pays a dividend that is not
   `10⁻⁴`.

The reason `min_factor.md` reports "no cheaper than B" is that it measured touches. Measured in _divisions_, the
`(p,e)` index is a strict win: **zero**, against `Θ(N log log N)`.

---

## 5. Why Algorithm C is not the factorizer (and 847 again)

### 5.1 The inversion

Claim M10 states `claimants_C(m) ⊆ claimants_B(m)`, strictly, and presents this as C's structural advantage. For
factorization it is exactly the defect.

> **Claim FC1 (drain incompleteness of C).** There are composites `m` and primes `p ∣ m` with `p² ≤ m` such that no
> layer of `p` claims `m`. Least witness at `W = 30`: `m = 847 = 7·11²`, `p = 11`, `11² = 121 ≤ 847`, but
> `847 / 11² = 7 < 11` and `847 ≠ 11²`, so the condition `m/p^{v_p} ∈ B̃_p` fails.
>
> _Status: `[T]`; machine-checked as `MinFac.not_claims_847_eleven` together with `MinFac.claimsB_847_eleven`._

Consequences, stated bluntly:

- **The C-drain does not determine `m`.** At `m = 847` the drain reports `(7, 1, 121)` and nothing else. Dividing out
  the claimed part leaves `121`, which is neither `1` nor prime, so Claim FC-B1's readout fails for C.
- **C is a recursive factorizer, not a flat one.** `847 → 121 → 1` is the cofactor chain, and each link needs the normal
  form of a _smaller, already-scanned_ value. That is Claim M4 (causality) doing exactly what it promises — and §5.3
  shows what it costs.
- **The two properties are the same property.** The tail `r < p` that C discards to shrink its claimant set _is_
  the set of claims by primes that are not `spf`. You cannot have the smaller claimant set and the flat readout.

### 5.2 The cofactor chain

> **Claim FC2 (chain length).** For `W`-coprime `n`, iterate `n_0 = n`, `n_{i+1} = n_i / spf(n_i)^{v}`. The chain is
> strictly decreasing with `n_{i+1} ≤ n_i / p_{w+1}`, terminates at `1`, and has length `≤ log_{p_{w+1}} n`
> (`≤ ω(n) ≤ log₂ n` always; `≈ 15` for `n ≈ 10^{18}`, `w = 6`).
>
> _Status: `[T]` from Claim M1 plus `spf(n) > p_w`._

So C's output determines the full factorization of every candidate — _given random access to its own earlier output_.
The question `min_factor.md` open problem 5 asks is how large a window suffices.

### 5.3 Correction to `min_factor.md` §8 / open problem 5: the window is Θ (range)

`min_factor.md` §8 says of the cofactor "`r < n` by Claim M4, so a bounded window suffices if the consumer runs a second
pass". That is false as stated.

> **Claim FC3 (no bounded window).** Fix a range `[X, 2X)`. The set of cofactors required to factor every
> `W`-coprime `n ∈ [X, 2X)` from C's output is spread across `[√X, 2X/p_{w+1}]`, and meets a positive proportion of
> the dyadic scales in between.
>
> _Status: `[T]`._ _Proof._ For `n = p·q` with `p = spf(n)`, the cofactor is `q = n/p`. Taking `p = p_{w+1}` gives a
> cofactor `≈ n/17`; taking `p ≈ q ≈ √n` gives a cofactor `≈ √n`; the semiprimes with `spf` in any fixed dyadic
> band have positive density in `[X,2X)` by Mertens. ∎

Two honest consequences:

- **Depth, not width.** Only `O(Δ)` cofactor _values_ are needed for a segment of length `Δ`, but they are scattered
  over a range of width `Θ(X)`. A hash table of `Δ` entries suffices _if you can produce the values_; producing them is
  the single-target problem of Claim FC0, so the "second pass" must be a pass over the whole prefix, i.e. over `Θ(X)`
  integers, once per level of the chain.
- **Therefore: don't chase cofactors.** The chain is elegant and it is a trap. §6 removes the need for it.

The corrected statement for `min_factor.md` §8 should read: _the cofactor `r` is the next input and `r < n`, but the set
of needed `r` is not confined to a window; a flat readout requires the tail-restored index of §6._

---

## 6. Algorithm D — the flat factorizer

### 6.1 One character of design

Algorithm C's admissible multiplier set is

```
B̃_p = {1} ∪ { r ≥ p : gcd(r, W) = 1, p ∤ r } .
```

Two constraints, and `min_factor.md` §4 explains both. `p ∤ r` keeps the layers of one prime disjoint and forces
`e = v_p(m)`: **load-bearing, keep it**. `r ≥ p` is there so that a layer never claims a number whose smallest factor is
`r` rather than `p` — i.e. it is there to preserve the _min-factor_ reading. For factorization we want exactly those
claims. Replace it with the weaker cutoff that keeps the memory bound:

```
D̃_{p,e} = { r ≥ 1 : gcd(r, W) = 1, p ∤ r, p^e·r ≥ p² } ,
```

and let **layer `(p,e)`** be the stream `p^e · D̃_{p,e}`, minus the non-composite element `p`.

Note what this does and does not change:

- For `e = 1` the cutoff `p·r ≥ p²` _is_ `r ≥ p`, so layer `(p,1)` is unchanged from C. No claims are lost there either:
  `v_p(m) = 1` and `p² ≤ m` already force `m/p ≥ p`.
- For `e ≥ 2` the cutoff is automatic, so the multiplier set opens up to every admissible `r ≥ 1`. Layer `(p,2)`
  emits `p², p²·p_{w+1}, p²·p_{w+2}, …` instead of jumping to `p²·r` with `r > p`.
- The head of every layer is still `≥ p²`, so activation still fires exactly at `n = p²` and Claim M8 survives verbatim.

The only line that differs from `min_factor.md` §5 is the multiplier seed when a spine pop opens its cloud:
`next_adm(p, 1, p)` in place of `next_adm(p, p, p)`.

### 6.2 Specification

```
D():                                    # unbounded; no N anywhere
emit p_1 … p_w
primes := []            # primes > p_w, in order
Q      := empty         # min-queue of Rec = (p, pe, e, r, mp), key = pe*r
act    := 0
n      := p_{w+1}

loop forever:
while act < len(primes) and primes[act]^2 <= n:
p := primes[act] ; act := act + 1
(r1, mp1) := next_adm(p, p, p)                  # least admissible > p
push (p*p,   p, p*p, 2, 1,  p  )                # spine head p^2
push (p*r1,  p, p,   1, r1, mp1)                # layer-1 cloud (r >= p)

      if Q empty or min_key(Q) > n:
          emit prime n ; primes.append(n)
      else:
          F := [] ; K := 1                                # the factorization, and its product
          while Q nonempty and min_key(Q) = n:
              (v, p, pe, e, r, mp) := pop_min(Q)
              F.append((p, e)) ; K := K * pe              # exponent is exact: p does not divide r
              if r = 1:                                   # n = p^e : a pure power
                  push (pe*p, p, pe*p, e+1, 1, p)         # extend the spine
                  (r1, mp1) := next_adm(p, 1, p)          # <<< the only difference from C
                  push (pe*r1, p, pe, e, r1, mp1)
              else:
                  (r, mp) := next_adm(p, r, mp)
                  push (pe*r, p, pe, e, r, mp)
          if K < n: F.append((n / K, 1))                  # the single large prime, one division
          report(n, F)                                    # complete factorization of n

      n := next_coprime(n)
```

`next_adm` is verbatim from `min_factor.md` §4.1 (wheel step plus skip cursor), and is `O(1)` amortised for the same
reason.

### 6.3 Correctness

> **Claim FC4 (claimant identity).** For every `W`-coprime composite `m`, layer `(p,e)` claims `m` iff `p ∣ m`,
> `e = v_p(m)` and `p² ≤ m`. Hence `claimants_D(m) = { (p, v_p(m)) : p ∈ claimants_B(m) }`, a bijection onto
> `claimants_B(m)`.
>
> _Status: `[P]`, routine._ _Proof._ Layer `(p,e)` claims `m` iff `m = p^e r` with `r` admissible, i.e.
> `gcd(r,W)=1` (automatic, `r ∣ m`), `p ∤ r` (forcing `e = v_p(m)`), and `p^e r = m ≥ p²`. ∎

> **Claim FC5 (flat completeness).** The drain at `m` yields `{ (p, v_p(m)) : p ∣ m, p ≤ √m }`; the residual
> `L = m / ∏ p^{v_p}` is `1` or a prime, and the full factorization of `m` is the drain plus `L`.
>
> _Status: `[P]` from FC4 + FC-B1. No division except the single `m / K`, and that one is exact._

> **Claim FC6 (soundness, decision rule).** Every key in `Q` is a `W`-coprime composite `≥ n` and `≥ p²`; a
> `W`-coprime candidate is prime iff no key equals it. `D()` emits exactly the primes, forever.
>
> _Status: `[P]`; the arguments are M6–M9 of `min_factor.md` with `B̃_p` replaced by `D̃_{p,e}`, and only the head
> computation changes.\_

### 6.4 Cost — and the point of the whole document

> **Claim FC7 (touch identity).** `ops_D(N) = ops_B(N)` **exactly**, not merely to leading order.
>
> _Status: `[T]` given FC4._ _Proof._ Layers of a fixed `p` partition the `W`-coprime multiples of `p` in `[p², N]`
> by `v_p`, and B's stream of `p` emits exactly those (`m = p·a`, `a ≥ p` `W`-coprime `⟺` `m ≥ p²`, `m`
> `W`-coprime). Summing over `p`:
>
> ```
> ops_D(N) = Σ_p Σ_e #{ r admissible : p^e r ≤ N, p^e r ≥ p² }
>          = Σ_p #{ m ≤ N : m W-coprime, p ∣ m, m ≥ p² }
>          = ops_B(N)  ≈  κ_W·N·( ln ln √N − ln ln p_w ) . ∎
> ```

| resource                   | B                   | C                          | **D**                           |
| -------------------------- | ------------------- | -------------------------- | ------------------------------- |
| touches                    | `ops_B`             | `ops_B − Θ(N^{2/3}/log N)` | `ops_B` exactly                 |
| records (uniform)          | `π(√n)`             | `2π(√n) + O(n^{1/3})`      | `2π(√n) + O(n^{1/3})`           |
| records (thinned spine)    | `π(√n)`             | `(1+o(1))π(√n)`            | `(1+o(1))π(√n)`                 |
| words per record           | 2                   | 4 (+byte)                  | 4 (+byte)                       |
| divisions over `[1,N]`     | `Θ(N log log N)`    | `0` (but incomplete)       | `1` per composite, only for `L` |
| output per composite       | rejection (+ `spf`) | `(spf, v_p, cofactor)`     | **complete factorization**      |
| `O(1)` restart / segmented | yes                 | yes                        | yes (layer by layer, §7.4 of M) |

The thinned-spine trick of `min_factor.md` §7.3 transfers unchanged (handle `n = p²` inline at activation; gate
`e ≥ 3` on a second cursor over primes with `p³ ≤ n`), as does the restart formula with `r_min = p` for `e = 1` and
`r_min = 1` for `e ≥ 2`.

**So the honest ledger for D is:** same touches as B, same asymptotic memory as B up to a constant in the record width,
and a complete factorization instead of a rejection. Against the classical segmented factoring sieve it trades a `Δ`
-word residual array for `π(√N)` four-word records and removes `Θ(N log log N)` divisions. That is a real, if
unspectacular, engineering win, and it is the first place in this family where the exponent index earns its keep.

_Status of every number above: **model, not measurement.** `min_factor.md` §7 flags each of its cost statements the same
way, and this document inherits the flag. Instrument `primes_D` against `primes_B` before quoting anything._

### 6.5 Reference sketch

Mirrors `algorithm.md` §6 (`primes_C`); the diff is one argument.

```python
def primes_D(w=6, report=None):
    """Streaming complete factorization of the W-coprime integers.
       report(m, [(p, e), ...]) receives the full factorization of every
       W-coprime composite m, with all p <= sqrt(m) plus the large prime."""
    small = [2, 3, 5, 7, 11, 13, 17, 19][:w]
    W, step, gte = build_wheel(small)
    for p in small:
        yield p
    primes, Q, act = [], [], 0
    n = 1 + step[1]
    while True:
        while act < len(primes) and primes[act] ** 2 <= n:
            p = primes[act];
            act += 1
            r1, mp1 = next_adm(p, p, p, W, step)
            heapq.heappush(Q, (p * p, p, p * p, 2, 1, p))
            heapq.heappush(Q, (p * r1, p, p, 1, r1, mp1))
        if not Q or Q[0][0] > n:
            primes.append(n);
            yield n
        else:
            F, K = [], 1
            while Q and Q[0][0] == n:
                v, p, pe, e, r, mp = heapq.heappop(Q)
                F.append((p, e));
                K *= pe
                if r == 1:
                    heapq.heappush(Q, (pe * p, p, pe * p, e + 1, 1, p))
                    r1, mp1 = next_adm(1, p, p, W, step)  # <<< seed at 1, not p
                    heapq.heappush(Q, (pe * r1, p, pe, e, r1, mp1))
                else:
                    r, mp = next_adm(r, mp, p, W, step)
                    heapq.heappush(Q, (pe * r, p, pe, e, r, mp))
            if K < n:
                F.append((n // K, 1))
            if report is not None:
                report(n, sorted(F))
        n += step[n % W]
```

The self-check to write first, in the spirit of `pops == composites`:

```python
assert prod(p ** e for p, e in F) == m and all(is_prime(p) for p, e in F)
assert sorted(F) == sorted(trial_factor(m))
```

If that assertion survives to `10^7` the claimant identity FC4 is not wrong.

---

## 7. Smooth and rough, by index rather than by test

### 7.1 Rough numbers are C-layers

`spf(m) > y` iff `m` lies in a layer `(p,e)` with `p > y`. So enumerating the `y`-rough integers in increasing order is
C (or D) with the queue truncated below `y`: no test, no filter, and the count is `Φ(x,y)` by construction. This is
`min_factor.md` §8's bullet, and it is correct.

### 7.2 Correction M8′ — smooth numbers are A-streams, not C-layers

`min_factor.md` §8 writes: _"`y`-smooth and `y`-rough streams are unions of layers, selected by index rather than
filtered by test."_ The smooth half is false. Smoothness is a condition on `P(m)`, and C indexes by `spf(m)`;
`2·10^9 + 11` is in layer `(2,1)` and is about as far from smooth as an even number gets.

> **Correction M8′.** `y`-rough integers are a union of C-layers (§7.1). `y`-smooth integers are a union of
> **truncated Algorithm A streams**:
>
> ```
> { m > 1 : P(m) ≤ y }  =  ⨄_{ b ≥ 1, P(b) ≤ y } { b·q : q prime, P(b) ≤ q ≤ y } ,
> ```
>
> with the convention `P(1) = 2`. Each stream contributes an _initial segment_, cut at `q ≤ y`, so smooth
> enumeration is A with the prime cursor clamped.
>
> _Status: `[T]` from Theorem 3.1._

> **Claim FC8 (smooth enumeration).** Running Algorithm A with every prime cursor clamped at `y` enumerates the
> `y`-smooth integers `≤ N` in increasing order, one touch each, with live-stream count equal to the number of
> `y`-smooth bases `b` with `b·P(b) ≤ N` — at most `Ψ(N, y)` and in practice `Ψ(√N, y)`-ish.
>
> _Status: `[P]`; prior art `[K]`, see §11 — this is the Hamming-number heap generalised, and Bernstein's
> enumeration work supersedes it for counting._

The pleasant part is that A's clamp is _free_: the spawn/emit cursors are indices into the prime array, so "stop at
`y`" is a bound check that also retires streams early, shrinking `S(N)` dramatically. The `y`-smooth variant of A is
much cheaper than A itself, which is the opposite of the usual situation where the sieve pays for smoothness testing.

### 7.3 Both ends at once?

The obvious question: is there a bicone index `m = p^{e} · s · q` with `p = spf(m)`, `q = P(m)`, giving smoothness _and_
roughness _and_ the exponent spine in one traversal? The bases would be indexed by `(p, e, q)` and the stream count is
the unknown, exactly as `min_factor.md` open problem 3 for C∞. Filed as open problem 5 below.

---

## 8. Ancestry factorization in Algorithm A

A different, and rather prettier, way to get complete factorizations with **no divisions at all**.

Recall `algorithm.md` §3.2: a base `b'` is _created_ by a `SPAWN` of its parent `b = b'/P(b')` at the trigger value
`b·q²`. So the bases form a tree: the root children are the primes, and the edge `b → b·q` is labelled `q`, with labels
non-decreasing along every root-to-node path.

> **Claim FC9 (ancestry).** Give every base record a parent pointer and its own label `q`. Then for every composite
> `m` emitted by stream `Σ_b` at prime `q`, the multiset of prime factors of `m` is `{q}` together with the labels
> on the path from `b` to the root, read off in non-increasing order. No division, no residual array, one touch per
> composite, output in increasing order of `m`.
>
> _Status: `[T]` from Theorem 3.1 (the pair `(b,q)` is unique) plus induction on the spawn tree._

Cost, honestly:

| quantity                     | value at `N = 10^{12}`                         |
| ---------------------------- | ---------------------------------------------- |
| tree nodes = distinct bases  | `≈ S(N) ≈ N^{0.75} ≈ 10^9`                     |
| bytes at 2 words/node        | `≈ 16 GB`                                      |
| full `spf` table for `[1,N]` | `≈ 1 TB` (one byte per position is not enough) |
| Algorithm D                  | `π(√N) ≈ 78 498` records `+ Δ`                 |

So ancestry-A is **~60× smaller than a materialised factor table and infinitely larger than D**. Retention is the
awkward part: a node must outlive all of its descendants, and a parent's own stream may retire first, so the tree is a
persistent DAG with reference counting or arena allocation, not a stack. And, as always with A, segments are not
independent (`algorithm.md` §3.7), so none of this parallelises.

**Verdict.** Keep it as the mathematically clean statement — _in Algorithm A, the factorization of a composite is its
position in the tree_ — and as the object that makes `fractal.md`'s "graph-directed grammar" reading concrete (the path
_is_ the word in the language of non-decreasing prime sequences, `min_factor.md` §2.2). Ship D.

---

## 9. Downstream: what a factorization stream is worth

Everything below is `O(1)` per composite on top of D's drain, streaming, with `π(√N)` persistent state.

| target                                | from D's drain                                          |
| ------------------------------------- | ------------------------------------------------------- |
| `ω(n)`                                | `#claimants + [L > 1]`                                  |
| `Ω(n)`                                | `Σ e + [L > 1]`                                         |
| `μ(n)`                                | `0` if any `e ≥ 2`, else `(−1)^{ω}`                     |
| squarefree test                       | all `e = 1` (and `L` is automatically squarefree)       |
| radical, `σ`, `σ_k`, `φ`, `λ`, `τ`    | multiplicative, one factor at a time                    |
| `spf`, `P(m)`                         | min and max claimant, `L` when `L > 1`                  |
| prime powers `p^e`, `e ≥ 2`, in order | the spine records, for free (`MinFac.spine_claims`)     |
| perfect-power test                    | single claimant with `L = 1`                            |
| `y`-smooth test                       | `max(claimants ∪ {L}) ≤ y`                              |
| aliquot `s(n) = σ(n) − n`             | direct; abundant/perfect/amicable searches over a range |
| `Λ(n)` (von Mangoldt), Chebyshev `ψ`  | spine plus primes                                       |

Two honest caveats:

- **Summatory functions are the wrong customer.** `Σ_{n≤N} μ(n)`, `Σ φ(n)`, `π(N)` itself all have sublinear algorithms
  (Meissel–Lehmer, Lucy_Hedgehog, `O(N^{2/3})` hyperbola methods) that never enumerate `n`. D is
  `Θ(N log log N)` and loses to all of them. Use D when you want the **values**, not the sums.
- **Only the `W`-coprime integers get factored.** In the array-free streaming form the scan skips non-candidates by
  construction, and recovering `n` from its `W`-free part is a cofactor lookup — the trap of §5.3 again. Either run with
  `w = 0` (`κ_W = 1`, all integers scanned, layers for every prime including 2), or use the bucketed segment form of
  §5.1 where small primes step directly through the array and no lookup is needed. The wheel is a scan optimisation for
  _primality_; for a complete factor table it partially cancels against the small-prime work it was avoiding
  (`Σ_{p ≤ 13} 1/p ≈ 1.34`). **Measure the crossover; do not assume `w = 6` is right for D.**

---

## 10. Where this cannot help

### 10.1 Single targets

Claim FC0. Nothing in Pollard ρ, `p−1`, ECM, SQUFOF, CFRAC, QS or NFS has an analogue here, and no amount of re-indexing
the ownership partition produces one: the partition is _by_ the answer.

### 10.2 QS / NFS relation collection — explained, not improved

Tempting analogy: the sieving phase of QS/NFS looks exactly like Algorithm B. Sieve positions `x`, factor-base primes
`p`, and the positions hit by `p` form arithmetic progressions — one per root of `f mod p`. That _is_ the stream
architecture, with `(p, root)` in place of `p`, and the bucket queue of `algorithm.md` §5.1 is precisely the
bucket/lattice sieve of the NFS literature.

But:

- the objects factored are **polynomial values** `f(x)`, not the integers `x`, so no layer/ownership statement
  transfers: `spf(f(x))` has no relation to the position `x`;
- the wheel transfers only in the weak form "small primes hit dense progressions, handle them separately", which is
  standard;
- and the expensive residue is **cofactorization** — the `L` of Claim FC-B1 for a _polynomial value_ that survived
  sieving — which is per-target ECM, i.e. §10.1.

So the framework offers vocabulary (`ownership`, `claimant set`, `O(1) restart`, `κ_W`) for something the NFS
implementers already do, and nothing more. That is prior art, not a contribution; see §11.

### 10.3 Pre-factored random integers

The generator produces factored integers _in order_; Bach's algorithm and Kalai's simpler variant produce a **uniformly
random** factored integer `≤ N` in expected polylog time, without factoring anything. Different problem, but worth
naming so nobody proposes the stream as a substitute.

---

## 11. Prior art

| item                                                                                    | relation                                                                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Gries & Misra, linear sieve (1978)                                                      | ownership by `spf`; the classic `spf` table in `O(N)` memory. D is this with `π(√N)` state instead.            |
| Pritchard, wheel sieves (1982, 1983)                                                    | the wheel `Ã_p`, `κ_W`; `theory.md` T55.                                                                       |
| O'Neill, _The Genuine Sieve of Eratosthenes_ (2009)                                     | the priority-queue merge; B/C/D are this plus orthogonalisation.                                               |
| Bengelloun (1986); Pritchard, incremental sieves                                        | bucketing (`algorithm.md` §5.1), unbounded streaming.                                                          |
| Segmented factoring sieve (folklore)                                                    | the standard competitor to D: `O(√N + Δ)` memory, `Θ(N log log N)` divisions.                                  |
| Dijkstra, Hamming numbers; Bernstein, _Enumerating and counting smooth integers_ (1996) | Claim FC8 is the Hamming heap generalised; Bernstein is the reference for counting `Ψ`.                        |
| Bernstein, _How to find smooth parts of integers_ (2004)                                | batch smoothness by product/remainder trees — the right tool for a _sparse_ target set; D is for dense ranges. |
| Franke–Kleinjung line sieving; Aoki–Ueda bucket sieve                                   | §10.2: the stream/bucket architecture, already in NFS.                                                         |
| Bach (1988); Kalai (2003)                                                               | random factored integers in polylog — §10.3.                                                                   |
| Meissel–Lehmer, LMO, Lucy_Hedgehog                                                      | sublinear summatory methods that beat D whenever only a sum is wanted (§9).                                    |

**Novelty assessment, honestly.** Claims FC-B1, FC2, FC8 are folklore. Correction M8′ and Claims FC1/FC3 are corrections
to this repository's own documents, not to the literature. Algorithm D is, mathematically, the classical
`p^e`-marking factoring sieve; what is new is only that the `(p,e)` index makes each `(prime, candidate)` pair a
_single_ touch with an _exact_ exponent, and that the min-factor architecture supplies it with `π(√N)` state and
`O(1)` restart. Claim FC7 (`ops_D = ops_B` exactly) is the statement worth checking, because it says the complete
factorization is free relative to the primality decision.

---

## 12. Honest summary

| question                                               | answer                                                                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does this help factor a single large `N`?              | **No**, and it cannot (FC0). Stop reading if that was the hope.                                                                                                                                             |
| Is Algorithm C the factorizer of the family?           | No — its drain is incomplete (FC1, `847`). It is a _recursive_ factorizer only.                                                                                                                             |
| Can the cofactor chain be followed in bounded memory?  | No; the needed values span `Θ(range)` (FC3). This corrects `min_factor.md` OP5.                                                                                                                             |
| Is there a flat, array-free, division-free factorizer? | Yes: Algorithm D (§6), at exactly `ops_B` touches and `(1+o(1))π(√N)` records.                                                                                                                              |
| Is D faster than a segmented factoring sieve?          | Unknown. Fewer divisions, no `Δ`-word residual array, wider records. **Measure.**                                                                                                                           |
| Does the exponent index finally pay for itself?        | Yes, here and only here: exact valuations for free, `Θ(N log log N)` divisions removed.                                                                                                                     |
| Does A factorize?                                      | Yes, by ancestry, with no divisions — at `N^{0.75}` memory and no parallelism.                                                                                                                              |
| Smooth enumeration?                                    | Algorithm A with clamped cursors (FC8), **not** C's layers (Correction M8′).                                                                                                                                |
| Rough enumeration?                                     | C/D layers, by index, exactly as advertised.                                                                                                                                                                |
| Summatory `μ`, `φ`, `π`?                               | Use the sublinear methods. D loses.                                                                                                                                                                         |
| Segment-parallel?                                      | B, C, D yes (`O(1)` restart). A no.                                                                                                                                                                         |
| What is the one-line pitch for the bucketed form?      | **Factorization is a byte-width change, not an algorithmic one:** write `p` (or `log p`) into the segment slot instead of a bit, and the primality sieve becomes a factoring sieve at the same touch count. |

---

## 13. Open problems

1. **Verify FC4/FC7 by measurement.** Implement `primes_D` alongside `primes_B` and `primes_C` (the JS references make
   this a ten-line edit to `algorithm-c.js`: seed the reopened cloud at `1`, accumulate `F` and `K` in the drain, and
   emit `n/K`). Assert `ops_D == ops_B` exactly at `N = 10^6 … 10^9`, and assert
   `∏ p^e == n` for every reported factorization. Any discrepancy in the first assertion falsifies FC7; any in the
   second falsifies FC4.
2. **Optimal `w` for D.** The wheel saves `1 − κ_W` of the scan but suppresses the small-prime layers that a _complete_
   factor table needs (§9, second caveat). The trade is not B's trade. Re-derive it, and measure the crossover between
   `w = 0` (all integers factored) and `w = 6` (`W`-coprime only, cofactor problem for the rest).
3. **Record width.** D's record is `(p, pe, e, r, mp)`. `pe` is recomputable from `(p,e)` and `mp` from `(p,r)` by a
   division; is a two-word record with a recomputed skip cursor faster in the bucketed form, where the record is touched
   once per segment rather than once per advance?
4. **Batch/sparse variant.** Given a sorted set `S` of `T` targets in `[1,N]`, factor all of them. D over the whole
   range is `Θ(N log log N)`; Bernstein's remainder tree is near-linear in the total bit size of `S` plus the factor
   base. Is there a stream-shaped algorithm that interpolates — bucket-scattering claimants only onto positions present
   in `S`, at cost `Σ_p (T·p/N + 1)` plus merge overhead? For `T ≫ N/√N` the sieve should win; find the crossover.
5. **The bicone index (§7.3).** Index composites by `(spf, v_spf, P(m))` — the min-factor spine at one end and A's
   largest-prime split at the other. Live-stream count? If it is `O(π(√N)·polylog)`, the result is a single traversal
   that is simultaneously a smoothness oracle, a roughness oracle and a complete factorizer with segment restart, which
   would supersede all four current algorithms for this purpose. If it is `N^{θ}`, it is Algorithm A again and should be
   abandoned. `min_factor.md` OP3 is the same question for C∞.
6. **Ancestry with retirement (§8).** A parent base may retire before its descendants. Design the arena/refcount scheme,
   and measure the _live_ node count against `S(N)`: if live nodes are `o(S(N))` the memory verdict of §8 improves and
   ancestry-A becomes worth benchmarking against a materialised `spf` table.
7. **Streaming `σ`-based searches.** Aliquot sequences, amicable pairs, abundance density over `[X, X+Δ)` are all direct
   consumers of D with `O(1)` restart. Is the parallel segmented form competitive with the published
   `σ`-table computations? This is the cheapest experiment on the list and the one most likely to produce a usable
   artefact.

---

## 14. What to formalise

`lean/Primegen/MinFactor.lean` already contains everything §5 needs. The new statements are small:

| claim here                         | proposed Lean name                     | input                                                                  |
| ---------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| FC-B1 flat completeness of B       | `Factor.large_part_prime_or_one`       | `AlgB.claims_iff` + "at most one prime factor `> √m`"                  |
| FC1 C's drain is incomplete        | —                                      | **done**: `MinFac.not_claims_847_eleven` + `MinFac.claimsB_847_eleven` |
| FC2 chain length                   | `Factor.cofactor_chain_length`         | `MinFac.exists_unique_normal_form` + `spf > p_w`                       |
| FC4 claimant identity for D        | `Factor.claimsD_iff`                   | mirror of `AlgB.claims_iff`; the statement that makes D correct        |
| FC5 flat completeness of D         | `Factor.factorization_of_drain`        | FC4 + FC-B1                                                            |
| FC7 touch identity `ops_D = ops_B` | `Factor.claimantsD_equiv_claimantsB`   | FC4; a bijection, not a cardinality argument                           |
| FC9 ancestry                       | `Factor.ancestry_spells_factorization` | Theorem 3.1 uniqueness + induction on the spawn tree                   |
| Correction M8′                     | `Factor.smooth_eq_union_of_A_streams`  | `P(m)` split; the rough half is already `MinFac`'s layer index         |

The one worth doing first is **FC4**, because it is the whole of Algorithm D: if `claimsD_iff` is the exact analogue of
`AlgB.claims_iff` with an exponent attached, then FC5 and FC7 are corollaries and the "complete factorization at B's
price" claim is in the kernel rather than in a table. As everywhere in this family: the structural claims belong to the
kernel, and every cost statement in §6.4 is a model awaiting a measurement.
