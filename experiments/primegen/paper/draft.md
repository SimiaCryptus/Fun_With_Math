# Orthogonal Stream Prime Generation: Min-Factor Spines, Wheels as Structures, and a Localised Twin-Prime Reduction

**Draft.** Follows `outline.md`. Sources: `paper.md` (specification), `algorithm.md` (construction and proofs),
`min_factor.md` (Algorithm C), `twin_prime.md` (pair lattice), `fractal.md` (lattice reading), `observation.md`
(multiplier sets), `idea.md` (spectral reading), `theory.md` (statement inventory), `lean/` (machine-checked core).

---

## Abstract

We present a family of prime generators built from a single structural fact: the composites partition by smallest prime
factor, so each prime owns an infinite, strictly increasing stream of composites, and prime generation is the merge of
those streams. Refining the split by the full `p`-adic valuation gives the **min-factor normal form** `n = p^e·r` with
`p = spf(n)`, `e = v_p(n)`, `r` coprime to every prime `≤ p`, and hence a generator — we call it **SPINE** — that emits,
for every composite it rejects, the triple `(spf, valuation, cofactor)`. There are no trial divisions anywhere in the
construction: the only operations are a table lookup, a multiplication, and a comparison.

The multiplier sets of these streams are exactly coprime wheels, and we argue that this makes the wheel a *defined
structure* rather than a precomputed array. The wheel lattices `S_k` modulo the primorials satisfy an exact recursion
whose deleted set is precisely one composite stream; a static wheel sieve is that recursion materialised and truncated,
and the three generators of this paper — **CASCADE**, **RIM**, **SPINE** — are three choices of where materialisation
stops and generation begins. The costs of those choices are stated exactly and separated from the theorems.

Applying the same promotion recursion to admissible pairs gives the **pair lattice** `S_k^{(2)}`, whose count obeys
`T_{k+1} = (p_{k+1} − 2)·T_k` and whose density is the Hardy–Littlewood singular series materialised as a finite residue
set. We show that its promotion performs exactly two deletions per class, rigidly linked by a stage invariant
`δ_k ≡ −2·P_k^{-1} (mod p_{k+1})` that is independent of the class — so the pair sieve is one strike plus a fixed
translate, not two independent strikes. We then isolate what this structure does and does not say about twin primes: it
counts exactly over the *period* `P_k`, but certifies primality only on the *window* `[p_{k+1}, p_{k+1}²)`, and the two
are separated by a doubly exponential factor. On the certified side we prove a reduction: a window-occupancy statement
**W** implies the twin prime conjecture, and that implication is machine-checked in Lean 4 (three lines, citing only
phase separation). We do not claim W is easier than TPC; we claim it is sharper, localised, finitely verifiable at each
prime, and implied by a measurable pair-Jacobsthal bound calibrated against Iwaniec's theorem.

---

## 1. Introduction

A prime generator can be built in two classical shapes. It can **mark**: allocate a bit array over the range and cross
out multiples, as Eratosthenes does. Or it can **test**: take a candidate and divide by everything up to its square
root. Both answer a *decision* question — "is `n` composite?" — when the arithmetic offers a *construction* question:
"what is the next composite that each prime is responsible for?"

The construction question has an exact answer, because responsibility can be assigned without ambiguity. Write `spf(m)`
for the smallest prime factor of a composite `m`. Every composite has exactly one, so the sets

```
Θ_p = { m composite : spf(m) = p }
```

are pairwise disjoint and cover the composites. Call this **orthogonality**. If each prime can name the next element of
its own `Θ_p`, then generating primes is a merge: scan the integers, and emit those that no stream claims.

This paper develops that idea to its natural conclusion and then applies the resulting structure to twin primes. Four
contributions, in the order they appear.

1. **Durable naming and one recursion (§2, §4.4).** The three generators previously known in these notes as Algorithms
   A, B and C are renamed **CASCADE**, **RIM** and **SPINE**, and are shown to be three stopping points of a single
   lattice recursion. The letters were an accident of drafting order; the names describe the indexing structure and are
   meant to survive.

2. **The min-factor foundation (§3).** Splitting at the smallest prime factor *with its multiplicity* gives a unique
   normal form `n = p^e·r`. This refines the ownership partition at no mathematical cost, and it is the most intuitive
   entry point to the whole construction because it makes the generator's state a direct image of the factorisation
   tree. SPINE, the generator built on it, performs no trial division and emits factorisation data rather than a
   primality bit.

3. **Wheels as structures (§4).** The multiplier set of a stream is a coprime wheel. The wheel lattices `S_k` obey an
   exact recursion `S_{k+1} = (p tilings of S_k) \ p·S_k` whose *deleted set is a stream*. So the wheel is not an
   optimisation bolted onto a sieve; it is stage `k` of the same recursion the generator runs, and the choice of where
   to stop tabulating is the only design freedom in the family. §4.5 states the obstruction that forces the choice.

4. **Twin primes (§5).** The pair lattice `S_k^{(2)}` satisfies the same promotion recursion with two rigidly linked
   deletions per class. Its count and density are exact and elementary; its relation to `π_2` is a one-way containment,
   with equality only on a doubly exponentially thin window. On that window we give a reduction of the twin prime
   conjecture to a window-occupancy statement, machine-checked, together with a sharper conjecture that implies it and
   is measurable with the generator of §3.

Throughout, structural claims are separated from cost claims. The structural core is formalised in Lean 4 / Mathlib
(`lean/`, `sorry`-free); every cost statement is a measurement and is flagged as such. This separation is not decorum.
The interesting failure mode in this subject is a correct recursion over residue classes being quoted as though it were
a statement about integers, and §5.5 is entirely about where that line falls.

---

## 2. Names

The three generators differ in *what indexes a stream*. The names below record that, and are used from here on.

| former label | **name**    | a stream is indexed by                              | mnemonic                                                        |
|--------------|-------------|-----------------------------------------------------|-----------------------------------------------------------------|
| Algorithm A  | **CASCADE** | a base `b ≥ 2`, split at the *largest* prime factor | streams spawn streams; multipliers cascade down the factor tree |
| Algorithm B  | **RIM**     | a prime `p`, with a shared wheel                    | every prime is a spoke borrowing one common rim                 |
| Algorithm C  | **SPINE**   | a layer `(p, e)`, `e = v_p`                         | streams are indexed along the exponent spine `p, p², p³, …`     |

Collectively: **orthogonal stream generators**. Their exact variants are written `CASCADE`, `SPINE∞`; the wheeled forms
are `RIM(w)` and `SPINE(w)` when the wheel depth matters. The letters A/B/C are retired.

Three secondary terms are also fixed, because the generator's data structures recur in all three:

- the **register** — the collection of currently live streams, each with its cursor;
- the **front** — the sorted structure holding the current head of each live stream (a binary heap, or the bucket table
  of §4.7);
- the **scan** — the monotone cursor `n` over candidate integers.

---

## 3. The min-factor spine

### 3.1 The normal form

Ownership splits a composite once. Splitting repeatedly at the same place — i.e. taking the full valuation — costs
nothing and gives a strictly finer index. Write

```
B_p = { r ≥ 1 : q prime, q ∣ r  ⟹  q > p }
```

for the multiplicative monoid generated by the primes greater than `p`; equivalently `B_p = { r : gcd(r, P_{≤p}) = 1 }`
where `P_{≤p}` is the primorial through `p`.

> **Theorem 1 (min-factor normal form).** Every integer `n > 1` factors **uniquely** as
> ```
> n = p^e · r ,     p prime,  e ≥ 1,  r ∈ B_p ,
> ```
> and then necessarily `p = spf(n)`, `e = v_p(n)`, `r = n/p^e`. Consequently
> ```
> ℕ_{>1} = ⨄_p ⨄_{e ≥ 1} p^e·B_p ,        Θ_p = ( ⨄_{e ≥ 1} p^e·B_p ) \ {p} .
> ```
> *Status: unique factorisation, re-bracketed. Machine-checked as `MinFac.exists_unique_normal_form`.*

*Proof.* Existence: take `p = spf(n)`, `e = v_p(n)`, `r = n/p^e`. Then `p ∤ r`, and every prime factor of `r` divides
`n`, hence is `≥ p`, hence `> p`; so `r ∈ B_p`. Uniqueness: in any such factorisation `p` divides `n` and every other
prime factor of `n` exceeds `p`, so `p = spf(n)`; and `p ∤ r` forces `e = v_p(n)`. ∎

Call `p^e·B_p` the **layer** `(p, e)`. Theorem 1 says the layers partition `ℕ_{>1}`, and that summing the layers of a
fixed `p` re-assembles the ownership stream `Θ_p`. Nothing about the partition has changed; only the index has, from
"prime" to "prime with multiplicity".

Two facts about `B_p` do the work of the whole construction.

> **Theorem 2 (cone recursion).** For every prime `p`,
> ```
> B_p = {1} ⊎ ⨄_{q > p} ⨄_{e ≥ 1} q^e·B_q .
> ```
> *Status: routine; machine-checked as `MinFac.cone_recursion`.*

The naive one-step form `B_p = {1} ⊎ ⨄_{q>p} q·B_q` is **false**, and the least witness is small: `9 ∈ B_2` with
`spf(9) = 3 > 2`, but `9 = 3·3` and `3 ∉ B_3`, so `9` lies in no `q·B_q`. The repair is precisely the run-length
encoding above — and the run lengths are the exponents `e`. This is worth stating, because it is the cleanest
justification for the layer index: *the exponent is not an optimisation, it is what makes the cone recursion true.*

> **Theorem 3 (strict phase separation).** If `r ∈ B_p` and `1 < r < (p+1)²`, then `r` is prime (and `r > p`).
> *Status: machine-checked as `MinFac.prime_of_bmono_of_lt_sq`.*

*Proof.* Every prime factor of `r` exceeds `p`, hence is `≥ p+1`; a composite `r` has at least two, so `r ≥ (p+1)². ∎

Theorem 2 says the multiplier cloud of `p` is **generated by the clouds of the larger primes**. No residue system modulo
`P_{≤p}` is ever built. Coprimality is a consequence of *where you entered the factor tree*, not a precondition tested
on the way in. Theorem 3 says that near the bottom of a layer the cloud contains nothing but primes, so advancement
there is an index increment into the prime array already in hand.

### 3.2 Causality: the generator is self-hosting

> **Theorem 4 (causality).** Let `m = p^e·r` be a value of layer `(p,e)` with `r > 1`, and let `r'` be the next element
> of the cloud after `r`. Then `r ≤ m/p ≤ m/2` and `r' < m`, and `r'` is determined by the multiplicative structure of
> integers `< m` only.
> *Status: Bertrand's postulate; machine-checked as `MinFac.causality`.*

Nothing the generator needs at scan position `n` depends on any integer `≥ n`. Its own output supplies every multiplier
it will ever consume, strictly in advance. This is the realisability check for the whole design: the sequences are
*streams*, never stored objects, and no list is ever retroactively extended.

### 3.3 The core generation method: a register of sequences and a sorted front

All three generators of this paper run the same loop. It is worth stating once, abstractly, before instantiating it.

```
G():
  Register := ∅                        # live sequences, each strictly increasing
  Front    := ∅                        # sorted heads of the live sequences
  n        := first candidate

  loop forever:
      activate(n)                                  # admit sequences whose head has been reached
      if Front is empty or min(Front) > n:
          emit n                                   # n is unclaimed ⇒ prime
      else:
          drain(n)                                 # pop every head equal to n, advance, reinsert
      n := next candidate
```

Three invariants make this correct, and they are the only things that need checking for any instantiation:

- **soundness** — every value in the front is composite;
- **no early claims** — every value in the front is `≥ n`;
- **coverage** — every composite candidate is a value of some sequence, whose cursor reaches it exactly.

Two implementation points carry the cost of the loop.

**Deferred activation.** A sequence indexed by `p` contributes nothing below `p²` (Theorem 3 with the layer heads of
§3.4). Admitting it exactly at `n = p²` — never earlier — bounds the front at `π(√n)` records forever, with no global
limit and no pre-pass. This single trick is why the generator is unbounded: it never needs to know how far it will run.

**The front need not be a heap.** Keys are consumed in increasing order of `n`, so the priority queue may be replaced by
a bucket table over a fixed-length segment: each record is filed under the segment its next value falls in, drained when
the scan reaches that segment, and refiled. All operations become `O(1)` amortised and sequential in memory. This
reintroduces a *segment*-sized array — which is the point at which "array-free" must be qualified to "array-free in the
range sense" — but never an array proportional to the output range.

### 3.4 SPINE

Fix a small wheel modulus `W = p_1⋯p_w` (the reference setting is `w = 6`, `W = 30030`; §4 explains what a wheel is and
why this is the right relaxation). Candidates run over `W`-coprime integers only. For `p > p_w`, relax the exact cloud
`B_p` to the tabulated

```
B̃_p = {1} ∪ { r ≥ p : gcd(r, W) = 1,  p ∤ r }   ⊇   B_p ,
```

and let layer `(p, e)` be the sequence `p^e·B̃_p` minus its single non-composite element `p`. Both retained constraints
are load-bearing. `r ≥ p` stops a layer from claiming numbers whose smallest factor is `r` rather than `p`. `p ∤ r`
keeps the layers of one prime disjoint from each other; drop it and a prime power `p^k` is claimed `k` times, which is
the naive reading of the idea and the expensive one.

Heads are `p^e` for `e ≥ 2` and `p·r₁(p)` for `e = 1`, where `r₁(p)` is the least admissible multiplier above 1. All
heads are `≥ p²`, so deferred activation still fires exactly at `n = p²`.

```
SPINE(w):                                # unbounded; no limit N anywhere
  emit p_1 … p_w
  primes := [] ; Front := ∅ ; act := 0 ; n := p_{w+1}

  loop forever:
      while act < len(primes) and primes[act]² ≤ n:
          p := primes[act] ; act := act + 1
          (r₁, mp₁) := next_adm(p, p, p)
          push (p·p,   p, p·p, 2, 1,  p  )          # spine head: the pure power p²
          push (p·r₁,  p, p,   1, r₁, mp₁)          # layer-1 cloud head

      if Front empty or min(Front) > n:
          emit n ; primes.append(n)
      else:
          owner := ⊥
          while Front nonempty and min(Front) = n:
              (v, p, pe, e, r, mp) := pop_min(Front)
              owner := min(owner, (p, e, r))        # by p
              if r = 1:                             # n = p^e, a pure power
                  push (pe·p, p, pe·p, e+1, 1, p)           # extend the spine
                  (r₁, mp₁) := next_adm(p, p, p)
                  push (pe·r₁, p, pe, e, r₁, mp₁)           # open this layer's cloud
              else:
                  (r, mp) := next_adm(p, r, mp)
                  push (pe·r, p, pe, e, r, mp)
          report(n, owner)                          # (spf, valuation, cofactor)

      n := next_coprime(n)
```

Two design points are the only non-obvious parts. **A layer is created by the layer below it**: popping a spine element
`p^e` both extends the spine to `p^{e+1}` and opens the cloud of layer `e`, so the register never holds a layer whose
head has not been reached, and nothing decides in advance how many layers a prime gets. And **the drain is over all
claimants**, because the wheel relaxation lets several layers present the same key; the claimant carrying the smallest
`p` is the one that matters (§3.6).

The advance primitive is one wheel step plus a skip cursor over the multiples of `p`:

```
next_adm(p, r, mp):                      # mp is a multiple of p with mp ≥ r
    r := r + step[r mod W]
    loop:
        while mp < r: mp := mp + p
        if mp = r: r := r + step[r mod W]
        else: return (r, mp)
```

Over a layer running to `X` the wheel takes `≈ κ_W·X/p^e` steps while `mp` takes at most `X/p^{e+1}` increments; the
ratio `1/(κ_W·p)` is below 1 for every `p > p_w ≥ 13`, so the skip cursor adds strictly less than one increment per
advance, amortised, and its branch is taken with probability `≈ 1/p`.

### 3.5 Correctness, and the absence of trial division

> **Theorem 5.** Every `W`-coprime composite `m` is a value of layer `(p,e)` with `p = spf(m)`, `e = v_p(m)`
> (*coverage*). Every key in the front is a `W`-coprime composite (*soundness*), and is `≥ n` and `≥ p²` for its owning
> prime (*no early claims*). Hence a `W`-coprime candidate `n` is prime iff no key equals `n`, and `SPINE(w)` emits
> exactly the primes, in increasing order, forever.
> *Status: proved in `min_factor.md` §6; coverage, soundness, the `≥ p²` head bound and the set form of the decision
> rule are machine-checked (`MinFac.coverage`, `MinFac.not_prime_of_claims`, `MinFac.sq_le_of_claims`,
> `MinFac.prime_iff_forall_not_claims`). The loop-level `≥ n` invariant is the analogue of `AlgB.inv_step` and is the
> one remaining piece.*

The point the outline asks to be made plainly is this. **There is no trial division anywhere in the construction, and no
divisibility test of any kind on a candidate.** The inner loop consists of:

- one table lookup, `step[r mod W]`;
- one comparison and at most one addition for the skip cursor;
- one multiplication, `pe · r`;
- one comparison against the front.

No `gcd`, no `%` by a prime under test, no `while p*p ≤ n` loop, no square root, no marking array over the range. A
composite is rejected because *something constructed it*, not because a test failed to clear it. That is the difference
between a decision procedure and a generator, and it is what makes the object analytically simple: every question about
running time is a question about how many values the streams emit, which is a counting problem in elementary number
theory rather than a question about the behaviour of a test.

Determinism is the second half of the same point. The state of the generator at scan position `n` is exactly a finite
list of layer records, each of which is a function of `n` and the primes below `√n`; there is no search, no fallback
path, and no randomisation. Restart is therefore an arithmetic exercise rather than a replay (§4.6).

### 3.6 What SPINE emits

> **Theorem 6 (streaming min-factor oracle).** When the drain at candidate `n` pops the claimant with the smallest `p`,
> that record's `(p, e, r)` satisfies `p = spf(n)`, `e = v_p(n)`, `r = n/p^e`.
> *Status: machine-checked as `MinFac.oracle`.*

*Proof.* Every claimant's `p` divides `n`, so every claimant is `≥ spf(n)`; and `spf(n)` claims, by coverage. The
exponent is exact because `p ∤ r`. ∎

So the output of `SPINE(w)` is not a stream of primality bits but the sequence

```
n  ↦  ( spf(n),  v_{spf}(n),  n / spf(n)^{v} )     for every W-coprime n,
```

with the primes appearing as the fixed points `(e, r) = (1, 1)`. This is available at no cost beyond the drain that was
happening anyway, and it is the actual case for the construction. Direct consumers: smallest-prime-factor tables without
a range array; streaming `ω`, `Ω`, `μ`, `λ`, radical and squarefree tests; smooth and rough number enumeration by
*selecting layers* rather than by testing candidates; and prime-power enumeration for free, since the spine records are
exactly the prime powers `p^e`, `e ≥ 2`, in order.

RIM (§4.4) recovers `spf` — its minimum claimant is also the smallest prime factor, since `spf(m)² ≤ m` always — but not
the valuation, and not the cofactor without a division. CASCADE produces `m = b·P(m)`, i.e. the *largest* prime factor,
which is the harder end to iterate on.

---

## 4. Wheels

### 4.1 A stream is a prime times a wheel

Return to the unrefined ownership statement, because it is where the wheel appears.

> **Theorem 7 (ownership).** For every prime `p`, with `P_{<p}` the primorial below `p`,
> ```
> Θ_p = p · A_p ,      A_p = { a ≥ p : gcd(a, P_{<p}) = 1 } ,
> ```
> and `a ↦ pa` is a bijection `A_p → Θ_p`. The `Θ_p` partition the composites.
> *Status: machine-checked as `Primegen.theta_eq_image`, `theta_disjoint`, `exists_unique_owner`.*

Membership in `A_p` depends only on `a mod P_{<p}`. So `A_p ∪ {1}` is periodic with `φ(P_{<p}) = ∏_{q<p}(q−1)` residues
per period: it is the **reduced residue system modulo the primorial**, lifted to `ℤ`. That is a coprime wheel, exactly
as in Pritchard's sense. A stream is a prime times a wheel, and the only primitive the generator needs is the wheel
successor:

```
NextOwnedComposite(p, x) = p · NextRough( p, max(p−1, ⌊x/p⌋) ) .
```

There is no other formula to look for. Every cost question in the family is a question about this successor.

### 4.2 The promotion recursion

Now look at the wheels as objects in their own right. Let `P_k = p_1⋯p_k` and

```
S_k = { r mod P_k : gcd(r, P_k) = 1 } ,     |S_k| = φ(P_k),   κ_k = φ(P_k)/P_k ~ e^{−γ}/log p_k .
```

> **Theorem 8 (lattice recursion).** For every `k ≥ 0`, with `p = p_{k+1}` and all sets taken mod `P_{k+1} = p·P_k`,
> ```
> S_{k+1} = ( ⋃_{j=0}^{p−1} (S_k + j·P_k) )  \  p·S_k
> ```
> — tile the previous lattice `p` times, then delete one **dilated copy of it**. Counting: `p·φ(P_k) − φ(P_k) =
> φ(P_{k+1})`.
> *Status: routine (CRT plus counting); its algorithmic content is machine-checked, since the deleted set is
> `Θ_p = p·A_p` read modulo `P_{k+1}` (`Primegen.theta_eq_image`).*

Worked, at stage 3: tiling `S_2 = {1,5}` five times gives `{1,5,7,11,13,17,19,23,25,29}`; deleting `5·S_2 = {5,25}`
leaves the eight spokes of the mod-30 wheel. No primality test occurred anywhere. The lattice also names its own
successor — the smallest hole above 1 at stage `k` is `p_{k+1}` — which is Theorem 4 seen from the outside.

Two consequences deserve their own sentences.

**The stream decomposition and the lattice recursion are the same theorem.** "Prime times a wheel" and "affine copy of
the previous stage" are two readings of one identity. Anything proved about one transfers.

**The wheel is a defined structure, not a table.** A wheel of modulus `W` is stage `k(W)` of a recursion the generator
is already running. What a static wheel sieve does is *stop* that recursion at some depth, *store* the stage, and hand
every deeper stage to a marking pass over the range. That is a legitimate engineering choice, but it is a choice about
where to stop, not a different algorithm, and stating it that way makes the design space visible.

### 4.3 Reading the classical wheel bound honestly

Pritchard's wheel sieve is usually quoted at `O(N / log log N)`, and that figure is the one most often held up against
constructions like this one. Four points, in order of how badly the short quotation misleads.

**(a) A wheel is not a primality test; it is a candidate enumerator.** The holes of `S_k` are certified prime exactly on
`[p_{k+1}, p_{k+1}²)` and nowhere else — this is Theorem 3 restated, and the first failure is small and explicit:
`121 = 11²` is coprime to `210`, so the mod-210 wheel has a composite hole *inside its own first period*. To decide all
of `[2, N]` from wheel membership alone one needs `p_{k+1} > √N`, i.e. a modulus `P_k = e^{(1+o(1))√N} ≫ N`:
superpolynomially more space than writing down the answer. Every wheel sieve is therefore a wheel **plus** a
composite-removal mechanism, and all of the correctness lives in the second component. Pritchard's construction is
non-circular precisely because it respects the window: the prime needed to extend `S_k` is the least hole above 1, which
lies inside the range `S_k` has already certified. A wheel-based generator that trusts holes outside its window is
simply wrong; one that consults an external primality test to patch that has assumed what it set out to compute.

**(b) The `log log` is Mertens, and it is a ceiling on the family rather than a trend.** Touch count is proportional to
the candidate density `κ_k ~ e^{−γ}/log p_k`, so the bound is attained only by letting the modulus grow with `N`, and
the return on space is doubly logarithmic. Numerically: `w = 6` gives `κ = 0.1918` at `W = 30 030`; `w = 8` gives
`κ = 0.1636` at `W = 9 699 690` — a 323× larger table for 15% fewer touches — and halving `κ` to `≈ 0.10` requires
primes up to `≈ 274`, i.e. a modulus of order `10^{117}`. No member of the family beats `log log`, and no *storable*
member beats a small constant.

**(c) The table is part of the cost.** At the quoted bound the wheel array is proportional to the range, built stage by
stage at `Θ(P_k)` each, with no access locality. This is why every production sieve runs a small fixed wheel — i.e. in
RIM's regime, not in the regime whose bound is quoted.

**(d) So a fixed wheel is this construction, truncated.** Which is §4.4.

### 4.4 Three stopping points

The generators differ only in how far they follow Theorem 8 before switching from tabulation to generation.

| construction        | recursion followed to | deeper stages handled by                                          | price                                            |
|---------------------|-----------------------|-------------------------------------------------------------------|--------------------------------------------------|
| static wheel sieve  | depth `w`, stored     | a marking pass over the range                                     | array over the range; density gain only          |
| growing wheel sieve | depth `k(N)`, stored  | —                                                                 | `Θ(N/log log N)` wheel array, `Θ(P_k)` per stage |
| **RIM**             | depth `w`, stored     | one `O(1)`-state stream per prime, reusing the depth-`w` template | duplicate touches: a `ln ln` factor              |
| **SPINE**           | depth `w`, stored     | one `O(1)`-state stream per **layer** `(p,e)`, same template      | as RIM, minus `Θ(N^{2/3}/log N)`, plus output    |
| **CASCADE**         | full depth, streamed  | —                                                                 | `S(N) ≈ N^{0.75}` live streams                   |

The three generators of this paper, side by side as instantiations of the loop of §3.3:

| generator   | a sequence is indexed by | the sequence                                | candidates  | claims per composite     |
|-------------|--------------------------|---------------------------------------------|-------------|--------------------------|
| **CASCADE** | a base `b ≥ 2`           | `b·{ q prime : q ≥ P(b) }`                  | all `n`     | exactly 1                |
| **RIM**     | a prime `p > p_w`        | `p·{ a ≥ p : gcd(a,W) = 1 }`                | `W`-coprime | `ω_{>p_w}(m)` (≈ 2–2.5)  |
| **SPINE**   | a layer `(p, e)`         | `p^e·({1} ∪ { r ≥ p : gcd(r,W)=1, p ∤ r })` | `W`-coprime | one per *claiming prime* |

**CASCADE** splits a composite at its *largest* prime factor: `m = b·q` with `q = P(m)`, `b = m/q`, and the streams are
`Σ_b = { b·q : q prime, q ≥ P(b) }`. These partition the composites — machine-checked as `AlgA.exists_unique_split` — so
**every composite is touched exactly once**, which is the information-theoretic optimum for any method that certifies
each composite. Its successor operation is "advance one index in the prime array", so it needs no roughness oracle at
all; the composite bases are precisely the delegates that supply the rough multipliers. The identity
`pops == composites` is a machine-checkable certificate of exact orthogonality, which is the reason to keep CASCADE
around even though it is not the production choice.

**RIM** replaces each exact multiplier set `A_p` by the shared `Ã_p = { a ≥ p : gcd(a, W) = 1 } ⊇ A_p`. Instead of every
prime demanding its own wheel — which is primorial space — every prime borrows the same one. The advance becomes
`a += step[a % W]; v = p*a`: one gather, one multiply, genuinely `O(1)` time with two words of state per prime. Streams
then over-claim slightly, because `p·a` may have a prime factor between `p_w` and `p`, so the drain must pop *all* keys
equal to `n`.

**SPINE** applies the same relaxation to the layers of Theorem 1 rather than to the primes.

### 4.5 The obstruction that forces the fork

Why not simply implement the exact successor?

> **Conjecture X1 (obstruction).** There is no algorithm computing `NextRough(p, y)` in `O(1)` time and
> `poly(log p, log y)` space, given only the primes `< p`.

Deciding `a ∈ A_p` is deciding `gcd(a, P_{<p}) = 1`, a function of `a mod P_{<p}` alone. Tabulate it and the table has
`φ(P_{<p}) = e^{(1+o(1))p}` entries — past `p ≈ 29` it exceeds `10^9`. Do not tabulate it and testing roughness is trial
division by `π(p) − 1` primes, which is `Θ(π(p))`, not `O(1)`; and by Jacobsthal-type lower bounds the gap to the next
rough number can be `≫ p log p log log log p / (log log p)²`, so "scan and test" is superlinear in `p` in the worst
case. A fixed-size table therefore serves only finitely many primes, and past that boundary exactly one of two things
must happen: **derive** the rough multipliers from other streams (CASCADE, exact, many streams) or **relax** the
multiplier set to a shared tabulated wheel (RIM and SPINE, inexact, bounded duplication).

The min-factor reframing does not escape this. Deciding `r ∈ B_p` is deciding `gcd(r, P_{≤p}) = 1`; X1 applies verbatim
with `P_{≤p}` for `P_{<p}`. The reframing relocates the cost, it does not remove it — and the interesting consequence is
therefore not a cheaper generator but a richer output (§3.6).

On the lattice, X1 has a one-line statement: **stage `k` cannot be tabulated in `poly(k)` space**, because its period is
`P_k = e^{(1+o(1))p_k}`. The lattice is cheap to *generate* and expensive to *store*, which is exactly why the generator
streams it.

### 4.6 Costs

Stated exactly, and separated from the theorems above. Every figure here is a measurement or an asymptotic estimate.

**Duplicate accounting for RIM.** A `W`-coprime composite `m` is popped once for each prime factor `p | m` with
`p_w < p ≤ √m` — the claimant set is exactly `{ p prime : p ∣ m, p² ≤ m }`, machine-checked as `AlgB.claims_iff`. Hence

```
ops_RIM(N) ≈ κ_W · N · ( ln ln √N − ln ln p_w + o(1) ) .
```

At `w = 6`, `N = 10^12`: `κ_W = 0.1918`, `ln ln √N ≈ 3.32`, `ln ln 13 ≈ 0.94`, so `ops ≈ 0.46·N` against the one-touch
ideal `≈ 0.19·N` — a factor `≈ 2.4`. In the language of §4.4 this factor is the accumulated error of truncating the
recursion at depth `w`, and the fact that it grows only like `ln ln` is Mertens again. Exactness costs `N^{0.75}`
memory; near-exactness costs `ln ln √N − ln ln p_w` touches. The second is obviously the better bargain.

**SPINE against RIM.** The claimant sets shrink strictly: `claimants_SPINE(m) ⊆ claimants_RIM(m)`, with smallest strict
witness `847 = 7·11²`, claimed twice by RIM (`7·121`, `11·77`) and once by SPINE (layer `(7,1)`, `r = 121`). But summing
over layers gives `κ_W·N/p` per prime, which is RIM's figure to leading order — the layers merely partition the
multiples RIM handles in one stream. The whole difference is the discarded tail `r < p`, paid once per layer instead of
once per prime:

```
ops_SPINE(N) = ops_RIM(N) − Θ( N^{2/3} / log N ) ,
```

which at `N = 10^12`, `w = 6` is a gap of `≈ 10^{−4}·N`. **SPINE is not a faster prime generator.** Anyone quoting it as
"fewer touches" is quoting a `10^{−4}` effect; the case for it is §3.6.

**Memory.** RIM: `π(√n)` records of two words, plus `Θ(W)` bytes of table. SPINE uniform: `2π(√n) + O(n^{1/3})` records
of four words. SPINE thinned — handle `n = p²` inline at activation, since the activation event already knows the normal
form, and gate the rest of the spine on a second activation cursor at `p³ ≤ n` — gives `(1 + o(1))·π(√n)`, i.e.
`≈ 78 500 + 5·10³` records at `N = 10^12`. CASCADE: `S(N) = π(√N) + #{ b ≥ 2 : b·P(b) ≤ N }`, empirically
`N^{θ+o(1)}` with `θ ≈ 0.75`; a Dickman saddle-point estimate maximises near `β ≈ 0.6`, but this should be measured
before being quoted.

**Restart and parallelism.** For a segment beginning at `X`, RIM recomputes the state of stream `p` in `O(1)`:
`a₀ = max(p, next_coprime_ge(⌈X/p⌉))`. SPINE does the same layer by layer, at `O(π(√X) + X^{1/3})` total. So both are
fully segment-independent and parallelise exactly like a segmented sieve while keeping `π(√N)` state. CASCADE has no
such property: the set of live bases at an arbitrary `X` cannot be reconstructed in `o(X)` work, so a segment cannot be
started in isolation. This, not the touch count, is the decisive practical difference.

**Time.** `O(events · log π(√N))` with a binary heap; `O(events)` amortised with the bucket front of §3.3. None of this
is a new complexity class: a good segmented sieve is also `O(N log log N)`. The claim is structural — orthogonal,
incremental, division-free, array-free in the range sense, unbounded, restartable — not asymptotic.

### 4.7 The fractal reading, briefly

Theorem 8 is a Moran/IFS construction: `p_{k+1} − 1` children per parent, contraction ratio `1/p_{k+1}`, with a
*non-constant, unbounded* ratio sequence, so zooming proceeds by primorials, i.e. doubly exponentially. Rescaling stage
`k` to `[0,1]` gives `φ(P_k)` intervals of length `1/P_k`: Lebesgue measure `κ_k → 0`, so the limit set is null, but box
dimension is `lim_k log φ(P_k)/log P_k = 1`, since `log κ_k ~ −log log p_k` while `log P_k ~ p_k`.

So the object is **measure-zero and dimension-one**: the fractality is real but invisible to dimension. "Fractal" here
means *hierarchical self-generation with affine deletion sets*, not *non-integer dimension*, and anyone reaching for a
dimension estimate as evidence is measuring the wrong invariant. The informative invariants are the deletion ratios
`1/p_k`, the density `κ_k`, and the Buchstab oscillation `ω(u)` governing how many stage-`k` holes below `x` survive as
primes.

Theorem 1 refines the picture. The single Moran copy deleted at each stage is itself an infinite geometric tower
`⨄_{e≥1} p^e·B_p` at ratios `p^{−1}, p^{−2}, …`, and Theorem 2 makes the whole system **graph-directed**: nodes are the
primes, edges are "next prime factor", loops are "same prime again", and SPINE is the priority traversal of that grammar
with the loops run-length encoded. The generator *is* a self-similar sequence generator, and the exponent index is the
loop counter. One caution: do not read a dimension off that grammar. The naive Moran equation `Σ_{q>p} q^{−s} = 1` has a
root `s > 1`, which is nonsense as a dimension, because the pieces here are arithmetic progressions inside a residue
lattice rather than nested intervals with disjoint convex hulls.

Note also what the recursion does *not* give: since the ratio changes at every stage, there is no scaling map
`x ↦ λx` fixing the limit object. Claims of log-periodicity in prime statistics do not follow from Theorem 8 and must be
measured, not asserted.

---

## 5. Twin primes

### 5.1 The pair lattice

Everything above concerns a single coordinate. Run the same recursion on two.

```
S_k^{(2)} = { r mod P_k : gcd( r(r+2), P_k ) = 1 } ,     T_k = |S_k^{(2)}| ,   τ_k = T_k / P_k .
```

`S_k^{(2)}` is the set of twin- **candidate** residue classes modulo `P_k`. Exact values:

| `k` | `p_k` | `P_k`     | `φ(P_k)`  | `κ_k`   | `T_k`   | `τ_k`   | `T_k/φ(P_k)` |
|-----|-------|-----------|-----------|---------|---------|---------|--------------|
| 1   | 2     | 2         | 1         | 0.50000 | 1       | 0.50000 | 1.0000       |
| 2   | 3     | 6         | 2         | 0.33333 | 1       | 0.16667 | 0.5000       |
| 3   | 5     | 30        | 8         | 0.26667 | 3       | 0.10000 | 0.3750       |
| 4   | 7     | 210       | 48        | 0.22857 | 15      | 0.07143 | 0.3125       |
| 5   | 11    | 2 310     | 480       | 0.20779 | 135     | 0.05844 | 0.2813       |
| 6   | 13    | 30 030    | 5 760     | 0.19181 | 1 485   | 0.04945 | 0.2578       |
| 7   | 17    | 510 510   | 92 160    | 0.17950 | 22 275  | 0.04363 | 0.2417       |
| 8   | 19    | 9 699 690 | 1 658 880 | 0.16967 | 378 675 | 0.03904 | 0.2283       |

By hand: mod 6 the only pair class is `5` (giving `5,7`); mod 30 there are three — `11`, `17`, `29`.

The single most important thing to fix before going further is the direction of the relation to actual twin primes.

> **Theorem 9 (one-way containment).** For every `k` and every `x`,
> ```
> #{ q ≤ x : q, q+2 both prime, q > p_k }  ≤  #{ q ≤ x : q mod P_k ∈ S_k^{(2)} } .
> ```
> Equality holds on `q ∈ [p_{k+1}, p_{k+1}² − 2)` and, in general, nowhere else.
> *Status: trivial; the rough half is machine-checked as `Twin.rough_pair_of_twin`, and the equality range is Theorem 3
> applied to both coordinates.*

Counts of pair-holes bound `π_2` **from above**. They become counts of twin primes only on the certified window.

### 5.2 Pair duplication dynamics

Now the promotion. This is the "pair duplication dynamics in wheel duplication" of the outline: what happens to a twin
class when the wheel is duplicated `p` times and punched.

> **Theorem 10 (pair count).** `T_1 = 1` and, for `k ≥ 1` with `p = p_{k+1}`, `T_{k+1} = (p − 2)·T_k`. Hence
> `T_k = ∏_{3 ≤ p_i ≤ p_k} (p_i − 2)`.
> *Status: CRT. The per-stage factor is machine-checked (`Twin.card_pairLattice_prime`); joining the stages is
> mechanical CRT counting and is currently verified by evaluation.*

*Proof.* By CRT, `r mod P_{k+1}` is the pair `(r mod P_k, r mod p)`, and `gcd(r(r+2), P_{k+1}) = 1` iff
`r mod P_k ∈ S_k^{(2)}` and `r ≢ 0, −2 (mod p)`. For `p ≥ 3` the two excluded classes are distinct, so exactly `p − 2`
of the `p` lifts of each class survive. ∎

> **Theorem 11 (pair lattice recursion).** Let `p = p_{k+1}`, `P = P_k`, `p̄ = p^{-1} mod P`. Then, mod `P_{k+1}`,
> ```
> S_{k+1}^{(2)} = ( ⋃_{j=0}^{p−1} (S_k^{(2)} + j·P) )  \  ( D ⊎ D' )
> D  = p·{ s : gcd( s(s + 2p̄), P ) = 1 }
> D' = p·{ s : gcd( s(s − 2p̄), P ) = 1 } − 2
> ```
> with `|D| = |D'| = T_k` and `D ∩ D' = ∅` for `p ≥ 3`.
> *Status: routine CRT; the algorithmic content is `Primegen.theta_eq_image`, since `D` is `Θ_p` mod `P_{k+1}` and `D'`
> is `Θ_p − 2`.*

Three constants are easy to misremember, so state them: the multiplier is `p − 2`, not `p`; the per-stage deletion is
`2/p`, not `1/p`; and the density falls, `τ_{k+1} = τ_k(1 − 2/p)`, while `T_k` grows only because `P_k` grows faster. At
`p = 3` the factor is `1`: stage 3 adds no new pair classes at all.

There is one structural difference from Theorem 8 worth flagging. In the single-hole recursion the deleted set is a
dilated copy *of the previous stage itself*. Here it is a dilated copy of a *shifted twin* of the previous stage, and
there are two of them. Self-similarity is therefore weaker; any argument leaning on exact self-similarity has to be
rechecked. §5.3 removes half of the difficulty.

The generator reading is one sentence: a pair `(n, n+2)` is deleted at stage `k+1` exactly when `n ∈ Θ_p` or
`n+2 ∈ Θ_p`. **Twin sieving is the single sieve run against two shifted copies of itself**; nothing more.

### 5.3 Deletion geometry: two strikes, rigidly linked

Which of the `p` replicated copies of a given class die? This has a complete elementary answer, sharper than "two of
them".

> **Theorem 12 (deletion geometry).** Let `p = p_{k+1}`, `P = P_k`, `P̄ = P^{-1} mod p`, and index the `p` tiles of the
> promotion by `j ∈ ℤ_p`, tile `j` being `S_k^{(2)} + jP`. Fix `r ∈ S_k^{(2)}`. The lift `r + jP` is deleted iff
> ```
> j = j₀(r) := −r·P̄     (mod p)      # left coordinate hit
> j = j₁(r) := −(r+2)·P̄ (mod p)      # right coordinate hit
> ```
> and `j₁(r) − j₀(r) ≡ −2P̄ =: δ_k (mod p)`, **independent of `r`**. Hence:
> **(a)** no copy is deleted twice, so exactly `p − 2` copies survive and no pair class ever dies;
> **(b)** `D' = D + δ_k·P (mod P_{k+1})` — the second deletion set is a rigid translate of the first;
> **(c)** the surviving tiles of each class form two cyclic arcs of lengths `δ_k − 1` and `p − δ_k − 1`, so every class
> survives on a run of at least `⌈(p−2)/2⌉` **consecutive** copies.
> *Status: CRT plus one unit multiplication. (a) and (b) are machine-checked (`Twin.deleted_tiles_ne`,
> `Twin.deleted_tile_offset_eq`); (c) is not.*

*Proof.* `r + jP ≡ 0 (mod p) ⟺ j ≡ −rP̄`, since `P` is a unit mod `p`; likewise for `r + jP + 2`. Subtracting gives
`δ_k`, and `δ_k ≢ 0` because `p ∤ 2`, which is (a) — and counting `p − 2` survivors per class over all `T_k` classes
re-derives Theorem 10. For (b), the element of `D` in the lift of class `r` is `r + j₀(r)P` and the element of `D'` is
`r + j₁(r)P = (r + j₀(r)P) + δ_k P`, and every element of `D'` arises this way. For (c), two distinct points cut `ℤ_p`
into arcs of lengths `δ_k − 1` and `p − δ_k − 1`. ∎

What this pins down: the loss is exactly 2 per class, so the two strikes can neither coincide (which would give `p − 1`)
nor cascade (`p − 3`); the second deletion set is not an independent object; and `δ_k` is a computable invariant of the
stage with no analogue in the single-hole recursion, where there is only one strike.

The two deleted copies are cyclically **adjacent** exactly when `δ_k ≡ ±1 (mod p)`, i.e. `P_k ≡ ∓2 (mod p_{k+1})`. This
occurs: at `k = 3`, mod 210, every class loses copies `j = 4` and `j = 5`. Take `r = 11 mod 30`, lifting to
`11, 41, 71, 101, 131, 161, 191`; the deletions are `131` (because `133 = 7·19`) and `161 = 7·23`. Since `Σ_k 2/p_{k+1}`
diverges, adjacency should be expected infinitely often, and nothing here depends on the answer.

Everything in Theorem 12 is about *copies of residue classes*. §5.5 records how it relates — or fails to relate — to the
window.

### 5.4 Admissibility and the fractal reading

> **Theorem 13 (admissibility).** For a finite `H ⊂ ℤ_{≥0}`, let `S_k^{(H)} = { r : gcd( ∏_{h∈H}(r+h), P_k ) = 1 }`.
> Then `|S_k^{(H)}| = ∏_{i≤k} (p_i − ν_i)` with `ν_i = #{ h mod p_i : h ∈ H }`, and `S_k^{(H)} ≠ ∅` for all `k` iff `H`
> is admissible. *Status: CRT.*

The class-level theory is complete and pattern-uniform, and it self-corrects: run the recursion on `{0,2,4}` and it dies
at `p = 3`, as it must, since there is exactly one prime triple of that shape.

The fractal reading of §4.7 extends with a twist. Theorem 12 (b) halves the problem — the two deletion sets are
translates — but the residual twist remains: `D` is a dilate of `{ s : gcd(s(s + 2p̄), P) = 1 }`, a pair lattice with a
*stage-dependent shift* `2p̄`, rather than of `S_k^{(2)}` itself. So the open structural question is whether there is an
exact recursion on a finite family of shifted lattices closed under promotion — a genuine graph-directed IFS on a finite
alphabet. If so, the Moran reading extends to pairs and its transfer operator is computable. This is a question about
the lattice; nothing in §5.5 or §5.6 depends on the answer.

### 5.5 The period–window dichotomy

This is the boundary of what an exact period-wide count can express, and it is where the subject is most often
misreported. Four separate facts.

**Holes are candidates.** The holes of `S_k` are certified prime on `[p_{k+1}, p_{k+1}²)` and nowhere else, and the
boundary is reached inside the first period (`121 ∈ S_4`, `121 < P_4 = 210`). For pairs the same happens, in both
flavours: `(167, 169) ∈ S_4^{(2)}` with `169 = 13²` (one coordinate composite); `(527, 529) ∈ S_5^{(2)}` with
`527 = 17·31` and `529 = 23²` (both composite), and `527 < 2310`. Composite pair-holes exist inside the first period at
every stage `k ≥ 4`, for the same reason `p_{k+1}² < P_k` from `k = 4` on.

**Classes are not integers.** `T_k` counts residue classes; a class is an infinite arithmetic progression. Promotion
never empties a class (Theorem 13), so the class-level theory separates cleanly into two statements it cannot connect:
"this class is admissible and full of candidates", true for every class at every stage, and "this class contains a twin
prime pair", the conjecture. The single-coordinate analogue is `φ(P_k) → ∞` versus the infinitude of primes.

**The inequality has a direction.** By Theorem 9, growth of the pair-hole count is growth of an **upper** bound, which
is compatible with `π_2(x)` bounded. Two classical facts frame this rather than excuse it: Brun's sieve gives
`π_2(x) ≪ x/log²x`, an upper bound of exactly the shape Theorems 10 and 14 predict, and Brun's theorem (convergence of
`Σ 1/q` over twins) shows the twins are sparse enough that density arguments of this kind cannot force infinitude. In
the other direction, the parity problem — Selberg's example, Bombieri's asymptotic sieve — is the theorem-level
statement that a sieve of this shape **cannot** produce a positive lower bound for a two-variable pattern, because it
cannot separate "both coordinates prime" from "both coordinates have an odd number of prime factors". Chen's theorem
marks where pure sieve stops.

**The density gap is a computable constant, and it does not vanish.**

> **Theorem 14 (density = singular series).** Exactly, `τ_k = ½ · C_2(p_k) · ∏_{3≤p≤p_k}(1 − 1/p)²`, where
> `C_2(y) = ∏_{3≤p≤y}(1 − 1/(p−1)²)`; asymptotically `τ_k ~ 2 C_2 e^{−2γ} / log² p_k`.
> *Status: classical (Mertens, plus `(1−2/p)/(1−1/p)² = 1 − 1/(p−1)²`).*

Check at `k = 6`: `∏_{3≤p≤13}(1−1/p) = 0.383616`, squared `0.147161`; `C_2(13) = 0.672059`; half the product is
`0.049450 = 1485/30030`. ✔ So **the pair lattice is the Hardy–Littlewood singular series, materialised as a finite set
of residues** — a genuine and pleasant identification, and one that also fixes the register the object speaks in. The
singular series is a heuristic density, and the gap between it and a prime count is provably nonzero: sieving by all
`p ≤ √x` leaves survivor density `~ 2e^{−γ}/log x ≈ 1.1229/log x` against `π(x)/x ~ 1/log x`, so the pair lattice at
level `√x` gives `≈ 1.6634/log²x` against the conjectured truth `2C_2/log²x ≈ 1.3203/log²x`: a factor
`(2e^{−γ})² ≈ 1.2599`, constant in `k`.

**Summary of the dichotomy.**

| what the wheel gives you | where                               | strength                   |
|--------------------------|-------------------------------------|----------------------------|
| exact counts             | over the full period `P_k`          | upper bound only           |
| exact certification      | on the window `[p_{k+1}, p_{k+1}²)` | equality, but **no count** |

The window has relative length `p_{k+1}²/P_k = e^{−(1+o(1))p_k}` inside the period. The two ranges do not overlap, and
the gap between them is doubly exponential. Converting a period-wide count into occupancy of the window is exactly an
equidistribution problem at scale `e^{−p_k}` — the input that GPY, Zhang, Maynard and Polymath8 obtain only in averaged
form, which is why the theorems available are *bounded gaps* (`≤ 246`) rather than gap 2. The wheel recursion supplies
none of it.

Theorem 12 sits on the period side too, and it is worth seeing exactly how. For `k ≥ 4` we have `p_{k+1}² < P_k`, so the
certified window lies inside tile `j = 0` alone; the other `p − 1` copies of every class sit at positive multiples of
`P_k` and are invisible to the window. Theorem 12 fixes the *offset* between the two deleted copies, not their
*position*: `j₀(r) = −rP̄` sweeps all of `ℤ_p` as `r` sweeps `S_k^{(2)}`, so tile 0 loses its share like every other
tile. A guaranteed run of `⌈(p−2)/2⌉` surviving consecutive copies is a guarantee about residues far out in the period.
The geometry is **transverse** to the window: period-wide structure, window silence.

### 5.6 The reduction

On the certified side there is one honest, well-posed target.

> **Claim W (window occupancy).** For every prime `p > 2` there exists `h` with `p ≤ h`, `h + 2 < p²`, and both `h` and
> `h + 2` coprime to `P_{<p}` — equivalently, `p`-rough. Equivalently: at every stage, the pair lattice has a hole-pair
> inside the certified window.
> *Status: open. Formalised as a statement, `Twin.Window`; verified at every prime `2 < p < 60`.*

The restriction to `p > 2` is forced, not cosmetic: the window of `p = 2` is `[2,4)`, which has no room for a pair at
distance 2, so the unrestricted form is outright false. This is the one place where formalising the prose changed it.

> **Theorem 15 (W ⟹ TPC).** Claim W implies there are infinitely many twin primes.
> *Status: **machine-checked** — `Twin.infinite_twins_of_window`, with the unbounded form `Twin.exists_twin_ge`. The
> proof is three lines and cites only phase separation.*

*Proof.* Given a prime `p > 2`, Claim W produces `h` with `p ≤ h < h + 2 < p²`, both `p`-rough. By phase separation
(Theorem 3, in the form `prime_of_rough_of_lt_sq`) applied to each coordinate, both `h` and `h+2` are prime, so
`(h, h+2)` is a twin pair with `h ≥ p`. Letting `p` run over the primes gives twin pairs above every bound. ∎

Three remarks on the standing of this, because the shape of the result is easy to overstate.

1. **W is not weaker than TPC.** Theorem 15 gives `W ⟹ TPC`, and no implication is known in the other direction, so W
   sits at or above TPC in strength. It is a *reformulation with a sharper localisation*, in the family of
   Legendre/Brocard-type short-interval statements — Brocard's conjecture asserts at least four primes between
   consecutive prime squares, and W is its twin analogue. It is **not** available as a lemma toward TPC.
2. **What the reduction actually buys.** Three things. It replaces an asymptotic statement about infinitely many
   integers by a *family of finite verifications*, one per prime, each of which is a finite search in `[p, p²)`. It
   isolates the *entire* primality content of the twin question in one certified window and shows the promotion
   recursion contributes none of it — the Lean proof term for Theorem 15 mentions Theorems 10, 11 and 12 nowhere. And it
   is implied by a clean, measurable gap conjecture, below.
3. **The pair-Jacobsthal calibration.** Define `g_2(n)` to be the maximal gap between consecutive elements of `S^{(2)}`
   mod `n`. Then

   > **Conjecture TP-J.** `g_2(P_k) ≪ log² P_k ≍ p_k²`.

   `TP-J ⟹ W` up to constants — a gap bound below the window length `p_{k+1}²` forces a hole-pair inside the window —
   hence `TP-J ⟹ W ⟹ TPC`, hence TP-J is hard. But note the calibration: for the **single**-coordinate analogue the
   corresponding bound is *Iwaniec's theorem*, `g(P_k) ≪ log² P_k`, and it lands exactly at the window length. The
   single-coordinate version of the required input is a theorem; the pair version is the conjecture. And the lower bound
   of Ford–Green–Konyagin–Maynard–Tao shows there is no slack to spare.

That last point is the most useful thing the framework contributes here, because TP-J is **measurable**. `g_2(P_k)` is
computable exactly for `k ≤ 8` (period `9 699 690`) and by segmented enumeration well beyond, using the generator of
§3.4 with one extra register:

```
twins():                       # unbounded; same memory as SPINE
  prev := none
  for q in SPINE(w):
      if prev ≠ none and q − prev = 2:  emit (prev, q)
      prev := q
```

Fitting `g_2(P_k)` against `p_k^α` either supports TP-J with a credible exponent or kills it. Measure before quoting.

### 5.7 Window occupancy, measured

The enumeration of window witnesses at every prime below 60, against the period-wide prediction `τ·(p² − p)` with `τ`
the pair density of the stage below `p`:

| `p` | `τ` (stage below `p`) | window length | predicted | hole-pairs found |
|-----|-----------------------|---------------|-----------|------------------|
| 2   | 1.00000               | 2             | —         | **0**            |
| 3   | 0.50000               | 6             | 3.0       | 2                |
| 5   | 0.16667               | 20            | 3.3       | 3                |
| 7   | 0.10000               | 42            | 4.2       | 4                |
| 11  | 0.07143               | 110           | 7.9       | 8                |
| 13  | 0.05844               | 156           | 9.1       | 9                |
| 17  | 0.04945               | 272           | 13.4      | 16               |
| 19  | 0.04363               | 342           | 14.9      | 17               |
| 23  | 0.03904               | 506           | 19.8      | 21               |
| 29  | 0.03565               | 812           | 28.9      | 29               |
| 31  | 0.03319               | 930           | 30.9      | 30               |
| 37  | 0.03105               | 1 332         | 41.4      | 41               |
| 41  | 0.02937               | 1 640         | 48.2      | 48               |
| 43  | 0.02794               | 1 806         | 50.5      | 50               |
| 47  | 0.02664               | 2 162         | 57.6      | 61               |
| 53  | 0.02550               | 2 756         | 70.3      | 74               |
| 59  | 0.02454               | 3 422         | 84.0      | 87               |

Three readings, and only the first is a theorem. **W holds for every prime `2 < p < 60`**, each row being a finite
certificate. **`p = 2` is the sole failure**, on width alone, exactly as the formalisation says. And there is **no
systematic deficit yet**: observed/predicted stays in `0.66 … 1.19` and exceeds 1 for the larger half of the range. That
is expected — the doubly exponential separation of §5.5 has barely begun by `p = 59` — and the interesting range starts
where the counts are in the thousands.

---

## 6. Conclusion

The whole construction rests on one line: composites partition by smallest prime factor. Taking that seriously turns
generation into a merge of disjoint streams; refining it by the valuation turns the merge into a streaming factoriser;
and reading the multiplier sets as coprime wheels turns the wheel from a precomputed array into stage `k` of an exact
recursion whose deleted set is a stream. The three generators are three choices of where to stop tabulating that
recursion and start generating it: **CASCADE** at full depth, paying `N^{0.75}` live streams for one touch per composite
and no segment parallelism; **RIM** at depth `w`, paying a `ln ln` duplicate factor for `π(√N)` records,
`O(1)` state, `O(1)` restart and exact parallelism; **SPINE** likewise, indexed by layers rather than primes, paying
nothing further and gaining the min-factor normal form of every composite it rejects. Static wheel sieves occupy the
same axis, one step earlier: they store the same stage and hand the deeper ones to a marking pass over the range.

Nothing here is a new complexity class, and the paper does not claim one. What it claims is that the *structure* is
worth stating precisely: there are no trial divisions, no divisibility tests, no array over the range and no global
limit, and the state at any point is a direct image of the factorisation tree. That is what makes the cost model
elementary — every running-time question reduces to counting stream emissions — and it is what makes the object usable
as a foundation rather than only as a program.

Applied to twins, the same recursion gives the pair lattice: exact count `T_{k+1} = (p_{k+1} − 2)T_k`, exact promotion
with two rigidly linked deletions per class at a class-independent offset `δ_k`, and density equal to the
Hardy–Littlewood singular series. All of that is period-wide, where hole counts bound `π_2` from above by a factor that
provably does not vanish. The one region where holes *are* primes is the window `[p_{k+1}, p_{k+1}²)`, of relative
length `e^{−(1+o(1))p_k}` inside the period, and it carries a certificate but no count. Bridging the two is a
short-interval equidistribution problem, obtained today only in averaged form, and one that the parity problem forbids a
pure sieve from converting into a lower bound.

On the certified side the framework contributes something concrete: a window-occupancy statement W whose implication of
the twin prime conjecture is itself machine-checked and cites only phase separation; a sharper conjecture TP-J that
implies W and is calibrated against Iwaniec's theorem, which settles the single-coordinate analogue exactly at the
window length; occupancy data at every prime below 60 with no deficit yet visible; and a twin generator that costs one
register on top of SPINE. The formalisation also corrected the claim it formalised — W is false at `p = 2`, for width
reasons — which is the kind of return that justifies the exercise.

**Open, in order of value.** Measure `g_2(P_k)` and fit `α` in `g_2(P_k) ≍ p_k^α` (TP-J). Push the window-occupancy
table to `p ≤ 10^4` and look for the predicted deficit. Settle or refute Conjecture X1, which is the pivot of the whole
architecture: a disproof gives an exact `O(1)` generator with `π(√N)` memory and makes the fork obsolete. Measure `S(N)`
for CASCADE and fit `θ`. Determine whether the pair recursion closes on a finite family of shifted lattices — a genuine
graph-directed IFS. And finish the outer induction for the wheeled generators, wiring the per-candidate decision and the
invariant preservation, both already machine-checked, into a loop invariant.

---

## References

1. Atkin, A. O. L. and Bernstein, D. J. *Prime sieves using binary quadratic forms.* Math. Comp. **73** (2004),
   1023–1030.
2. Bengelloun, S. A. *An incremental primal sieve.* Acta Informatica **23** (1986), 119–125.
3. Bombieri, E. *The asymptotic sieve.* Rend. Accad. Naz. XL (5) **1/2** (1975/76), 243–269.
4. Brun, V. *La série 1/5 + 1/7 + 1/11 + 1/13 + … est convergente ou finie.* Bull. Sci. Math. **43** (1919), 100–104,
   124–128.
5. Buchstab, A. A. *Asymptotic estimates of a general number-theoretic function.* Mat. Sb. **44** (1937), 1239–1246.
6. Chen, J. R. *On the representation of a larger even integer as the sum of a prime and the product of at most two
   primes.* Sci. Sinica **16** (1973), 157–176.
7. Dickman, K. *On the frequency of numbers containing prime factors of a certain relative magnitude.* Ark. Mat. Astr.
   Fys. **22A** (1930), 1–14.
8. Ford, K., Green, B., Konyagin, S., Maynard, J. and Tao, T. *Long gaps between primes.* J. Amer. Math. Soc. **31**
   (2018), 65–105.
9. Goldston, D. A., Pintz, J. and Yıldırım, C. Y. *Primes in tuples I.* Ann. of Math. **170** (2009), 819–862.
10. Good, I. J. *The interaction algorithm and practical Fourier analysis.* J. Roy. Statist. Soc. B **20** (1958),
    361–372. (With Thomas, L. H., 1963 — the prime-factor FFT.)
11. Gries, D. and Misra, J. *A linear sieve algorithm for finding prime numbers.* Comm. ACM **21** (1978), 999–1003.
12. Hardy, G. H. and Littlewood, J. E. *Some problems of 'Partitio numerorum' III: On the expression of a number as a
    sum of primes.* Acta Math. **44** (1923), 1–70.
13. Iwaniec, H. *On the problem of Jacobsthal.* Demonstratio Math. **11** (1978), 225–231.
14. Jacobsthal, E. *Über Sequenzen ganzer Zahlen, von denen keine zu n teilerfremd ist.* Norske Vid. Selsk. Forh. **33**
    (1960), 117–139.
15. Maynard, J. *Small gaps between primes.* Ann. of Math. **181** (2015), 383–413.
16. Mauldin, R. D. and Williams, S. C. *Hausdorff dimension in graph directed constructions.* Trans. Amer. Math. Soc.
    **309** (1988), 811–829.
17. Mertens, F. *Ein Beitrag zur analytischen Zahlentheorie.* J. Reine Angew. Math. **78** (1874), 46–62.
18. Moran, P. A. P. *Additive functions of intervals and Hausdorff measure.* Proc. Cambridge Philos. Soc. **42** (1946),
    15–23.
19. Moura, L. de and Ullrich, S. *The Lean 4 theorem prover and programming language.* CADE-28 (2021), 625–635.
20. O'Neill, M. E. *The genuine sieve of Eratosthenes.* J. Funct. Programming **19** (2009), 95–106.
21. Polymath, D. H. J. *Variants of the Selberg sieve, and bounded intervals containing many primes.* Res. Math. Sci.
    **1** (2014), Art. 12.
22. Pritchard, P. *Explaining the wheel sieve.* Acta Informatica **17** (1982), 477–485.
23. Pritchard, P. *Fast compact prime number sieves (among others).* J. Algorithms **4** (1983), 332–344.
24. Pritchard, P. *Linear prime-number sieves: a family tree.* Sci. Comput. Programming **9** (1987), 17–35.
25. Sarnak, P. *Möbius randomness and dynamics.* Notices S. Afr. Math. Soc. **43** (2012), 89–97.
26. Selberg, A. *Collected Papers, Vol. II.* Springer, 1991. (Parity obstruction.)
27. Sorenson, J. *An analysis of two prime number sieves.* Tech. Rep. 1028, Univ. of Wisconsin–Madison, 1991.
28. Tenenbaum, G. *Introduction to Analytic and Probabilistic Number Theory*, 3rd ed. AMS, 2015.
29. The mathlib Community. *The Lean mathematical library.* CPP 2020, 367–381.
30. Zhang, Y. *Bounded gaps between primes.* Ann. of Math. **179** (2014), 1121–1174.

---

## Appendix A. Formal status

`lean/` is `sorry`-free against the pinned toolchain. The table below is the claim → theorem map for this draft; the
full inventory, including dependencies and prior art per statement, is `theory.md`.

| statement here                      | Lean name                                                                                                       | file                               |
|-------------------------------------|-----------------------------------------------------------------------------------------------------------------|------------------------------------|
| Thm 1, min-factor normal form       | `MinFac.exists_unique_normal_form`, `MinFac.minFac_eq_of_normal_form`                                           | `MinFactor.lean`                   |
| Thm 2, cone recursion (run-length)  | `MinFac.cone_recursion`; refutation of the one-step form: `MinFac.not_one_step_cone`                            | `MinFactor.lean`                   |
| Thm 3, phase separation             | `Primegen.prime_of_rough_of_lt_sq`, `MinFac.prime_of_bmono_of_lt_sq`                                            | `Ownership.lean`, `MinFactor.lean` |
| Thm 4, causality                    | `Primegen.causality`, `MinFac.causality`, `Primegen.mult_le_half`                                               | `Ownership.lean`, `MinFactor.lean` |
| Thm 5, coverage / soundness / heads | `MinFac.coverage`, `MinFac.not_prime_of_claims`, `MinFac.sq_le_of_claims`, `MinFac.prime_iff_forall_not_claims` | `MinFactor.lean`                   |
| Thm 6, min-factor oracle            | `MinFac.oracle`; spine = prime powers: `MinFac.spine_claims`                                                    | `MinFactor.lean`                   |
| Thm 7, ownership and partition      | `Primegen.theta_eq_image`, `theta_disjoint`, `exists_unique_owner`                                              | `Ownership.lean`                   |
| Thm 8, lattice recursion            | algorithmic content only, via `Primegen.theta_eq_image`                                                         | `Ownership.lean`                   |
| CASCADE one-touch                   | `AlgA.exists_unique_split`, `AlgA.sigma_disjoint`                                                               | `AlgorithmA.lean`                  |
| RIM coverage / decision / claimants | `AlgB.coverage`, `AlgB.emit_iff`, `AlgB.claims_iff`, `AlgB.inv_step`                                            | `AlgorithmB.lean`                  |
| SPINE ⊆ RIM claimants (strict)      | `MinFac.claimants_subset`, `MinFac.not_claims_847_eleven`                                                       | `MinFactor.lean`                   |
| Thm 9, containment (rough half)     | `Twin.rough_pair_of_twin`                                                                                       | `Twin.lean`                        |
| Thm 10, per-prime factor `p − 2`    | `Twin.card_pairLattice_prime`                                                                                   | `Twin.lean`                        |
| Thm 12(a),(b), deletion geometry    | `Twin.deleted_tiles_ne`, `Twin.deleted_tile_offset_eq`                                                          | `Twin.lean`                        |
| Claim W, statement and witnesses    | `Twin.Window`, `Twin.windowWitnesses`, `Twin.not_windowAt_two`                                                  | `Twin.lean`                        |
| **Thm 15, W ⟹ TPC**                 | `Twin.infinite_twins_of_window`, `Twin.exists_twin_ge`                                                          | `Twin.lean`                        |

Deliberately **not** formalised: Conjecture X1; Conjecture TP-J; Claim W; all cost statements (§4.6, §5.7 predictions);
the outer loop induction for the wheeled generators; the CRT joining of Theorem 10's stages; Theorems 11, 13 and 12 (c).
The pattern is worth noting: everything machine-checked lies on the *certified* side of the period–window dichotomy, and
everything exact and period-wide is checked only in fragments — not because the exact material is hard, but because it
is not on the path to anything.