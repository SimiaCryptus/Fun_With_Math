# The Orthogonal Stream Prime Generator: A Complete Algorithm

**Status:** normative specification + reference implementation. **Companions:** `paper.md` (primary specification),
`generator.md` (architecture), `observation.md` (worked multiplier sets), `idea.md` (spectral/entropy framing),
`fractal.md` (lattice reading), `theory.md` (statement inventory). This document supplies the exact construction of the
per-prime composite streams, the proof that the construction is causally realisable as a _stream_ (no forward
dependencies), two concrete algorithms, and an honest cost model.

---

## 0. TL;DR

1. **Ownership is exact.** The composites owned by prime \(p\) (i.e. those whose smallest prime factor is \(p\)) are
   exactly \(p \cdot A_p\) where \(A_p = \{a \ge p : \gcd (a, P_{<p}) = 1\}\), the \(p\)- **rough** numbers from \(p\)
   up. \(A_p\) is a wheel, not a list of primes (§2.2); it is infinite, and its elements below \(p^2\) are exactly the
   primes in \([p,p^2)\) (§2.3).

2. **`NextOwnedComposite` reduces exactly to a rough-successor** (Prop. 2.6):
   \[ \mathrm{NextOwnedComposite} (p,x) \;=\; p \cdot \mathrm{NextRough}\!\big (p,\ \max (p-1,\lfloor x/p\rfloor)
   \big). \] There is no additional mystery formula to find. The primitive cannot be simultaneously exact, O (1) in time
   and O (1) in state per prime (§2.7); one must pay for it in exactly one of two currencies.

3. **Algorithm A** (§3) pays in _streams_: perfectly orthogonal, **each composite touched exactly once**, O (1)
   advancement, no divisibility, no marking array — but the number of live streams grows like \(N^{\theta}\), \(\theta
   \approx 0.75\), not \(\pi (\sqrt N)\).

4. **Algorithm B** (§4) pays in _duplicate touches_: fix a wheel modulus \(W = p_1\cdots p_w\), use \(W\)-coprime
   multipliers instead of \(p\)-rough ones. Advancement is a genuine O (1)
   table lookup with **O (1) state per prime**, memory is \(O (\pi (\sqrt N) + W)\), and each surviving composite is
   touched \(\omega_{>p_w} (\cdot)\lesssim 2\) times instead of once.

5. **Recommendation:** ship Algorithm B (+ bucket queue, §5) for production; keep Algorithm A as the mathematically
   pure, one-touch reference generator and as the object of study for the generational-ring narrative.

---

## 1. Notation

| symbol                                  | meaning                                                                                   |
|-----------------------------------------|-------------------------------------------------------------------------------------------|
| \(p_1=2 < p_2=3 < \dots\)               | the primes; `primes[i]` is \(p_{i+1}\) in code (0-based)                                  |
| \(\mathrm{spf}(m)\)                     | smallest prime factor of \(m>1\)                                                          |
| \(P(m)\)                                | **largest** prime factor of \(m>1\)                                                       |
| \(P_{<p} = \prod_{q<p} q\)              | primorial of the primes strictly below \(p\) (\(P_{<2}=1\))                               |
| \(R_p = \{m\ge 1 : \gcd(m,P_{<p})=1\}\) | the \(p\)-**rough** numbers: no prime factor \(< p\)                                      |
| \(\Theta_p\)                            | the composites _owned_ by \(p\), i.e. \(\{m : m \text{ composite},\ \mathrm{spf}(m)=p\}\) |
| \(\kappa_W = \varphi(W)/W\)             | density of \(W\)-coprime integers                                                         |
| \(N\)                                   | generation limit (Algorithm A); Algorithm B is unbounded                                  |

Throughout, "the scan position" \(n\) is the candidate integer currently under consideration; the algorithms scan \(n\)
upward and never revisit.

---

## 2. Exact structure of the orthogonal streams

### 2.1 Ownership theorem

> **Theorem 2.1 (multiplier set).** For every prime \(p\),
> \[
> \Theta_p \;=\; p \cdot A_p, \qquad A_p \;=\; R_p \cap [p,\infty)
> \;=\; \{\, a \ge p \;:\; \gcd (a, P_{<p}) = 1 \,\}.
> \]
> The map \(a \mapsto pa\) is a bijection \(A_p \to \Theta_p\), and
> \(\{\Theta_p\}_p\) partitions the composites.

_Proof._ Let \(m\) be composite with \(\mathrm{spf} (m)=p\) and put \(a = m/p\). Since \(m\) is composite, \(a>1\);
every prime factor of \(a\) divides \(m\), hence is \(\ge p\), so \(\gcd (a,P_{<p})=1\) and \(a \ge \mathrm{spf} (a) \ge
p\). Conversely if \(a \ge p\) and \(\gcd (a,P_{<p})=1\) then \(pa\) is composite and every prime factor of \(pa\) is
\(\ge p\), so \(\mathrm{spf} (pa)=p\). Injectivity is clear. Every composite \(m\) lies in exactly one \(\Theta_
{\mathrm{spf} (m)}\). \(\square\)

This is the precise version of the "orthogonality" postulate of `generator.md` §2.4:
the streams are disjoint **by construction**, and a stream is a prime times a wheel.

### 2.2 \(A_p\) is a wheel, not a prime list

\(\gcd (a,P_{<p})=1\) depends only on \(a \bmod P_{<p}\). Hence:

> **Corollary 2.2.** \(A_p \cup \{1\}\) is periodic modulo \(P_{<p}\) with
> \(\varphi (P_{<p}) = \prod_{q<p} (q-1)\) residues per period. It is completely determined by
> its intersection with \([1, P_{<p}]\), and it is **infinite**.

This is the same object as the wheel of `idea.md` §2 and Pritchard's wheel: the survivors of the first \(\pi (p)-1\)
periodic exclusion fields.

### 2.3 Phase separation: when the multipliers are primes

> **Lemma 2.3 (phase separation).** If \(a \in A_p\) and \(a < p^2\), then \(a\) is prime.

_Proof._ \(a>1\) and all prime factors of \(a\) are \(\ge p\); if \(a\) were composite it would have at least two such
factors, so \(a \ge p^2\). \(\square\)



> **Corollary 2.4.** \(A_p \cap [p, p^2) = \{\text{primes in that range}\}\). Consequently one period of \(A_p\)
> consists of \(1\) together with primes only **iff** \(P_{<p} \le p^2\), which holds iff \(p \le 7\)
> (\(P_{<7}=30<49\), but \(P_{<11}=210>121\)).

First composite multiplier: \(121 = 11^2\) is \(11\)-rough and \(<210\), so \(121 \in A_{11}\) and \(11\cdot 121 =
1331 = 11^3\) is owned by \(11\). Likewise \(143 = 11\cdot 13,\ 169,\ 187,\ 209 \in A_{11}\) — five composites among the
\(\varphi (210)=48\) residues of one period, the remaining \(43\) being \(1\) and the \(42\) primes in \([11,199]\).
Since a composite multiplier forces the emitted value \(\ge p^3\), the rough phase matters below \(N\) only for \(p \le
N^{1/3}\).

> **Corollary 2.5 (no forward dependency).** \(A_p\) is determined by the primes strictly
> below \(p\), all of which are known the moment \(p\) is discovered; and to emit composites
> up to \(n\), the stream of \(p\) needs multipliers only up to \(n/p \le n/2\). Multipliers
> are consumed in increasing order, so the lists are _streams_, never stored objects. See
> Theorem 2.8.

### 2.4 The primitive of `generator.md`, derived

> **Proposition 2.6.** Define \(\mathrm{NextRough} (p,y) = \min\{a \in R_p : a > y\}\). Then for
> every prime \(p\) and every \(x \ge 0\),
> \[
> \mathrm{NextOwnedComposite} (p,x)
> \;=\; p \cdot \mathrm{NextRough}\!\big (p,\; \max (p-1,\ \lfloor x/p \rfloor)\big).
> \]

_Proof._ By Theorem 2.1 the owned composites are \(pa\), \(a\in A_p\), and \(pa > x \iff a > x/p \iff a > \lfloor
x/p\rfloor\) (as \(a\) is an integer). Intersecting with \(a \ge p\) gives the \(\max\). Monotonicity of \(a \mapsto
pa\) turns "smallest \(m\)" into
"smallest \(a\)". \(\square\)

So the sought-after primitive is _exactly_ a rough-successor. Two immediate consequences:

- Any implementation of the primitive is an implementation of a wheel successor and conversely. There is nothing else to
- The "first owned composite is \(p^2\)" statement of `generator.md` §3.2 is Prop. 2.6 at \(x=p\), and it holds always,
  not merely typically. derive.

### 2.5 Advancement inside a stream

> **Lemma 2.7 (prime phase).** For \(a \in A_p\) with \(a < p^2\), \(\mathrm{NextRough} (p,a)\) is
> the next **prime** after \(a\), unless that prime exceeds \(p^2\), in which case the successor
> may be \(p^2\) itself. Hence while the emitted composite is \(< p^3\), advancing the stream of
> \(p\) is a single **index increment into the prime array** — genuinely O (1), no arithmetic.

This means the expensive part of the primitive (rough numbers that are composite) is only ever needed for primes with
\(p^3 \le N\), i.e. for \(p \le N^{1/3}\).

### 2.6 Causality: everything needed is already known

> **Theorem 2.8 (causality).** Suppose all primes \(< n\) have been emitted and the scan is at
> \(n\), and suppose \(n = pa\) is an owned composite of \(p\) with multiplier \(a\). Then
> (i) \(a \le n/2\); (ii) the next multiplier \(a' = \mathrm{NextRough} (p,a)\) satisfies \(a' < n\);
> (iii) \(a'\) is determined by data about integers \(< n\) only.

_Proof._ (i) \(a = n/p \le n/2\). (ii) The primes are \(p\)-rough, so \(a'\) is at most the next prime after \(a\),
which by Bertrand's postulate is \(< 2a \le n\). (iii) \(a'\) is determined by the multiplicative structure of the
integers in \( (a, a']\subseteq (0,n)\). \(\square\)

Therefore an _online, unbounded stream_ generator is possible in principle: no step ever requires knowledge of an
integer \(\ge n\). This is the formal content of "the sieve is self-hosting", and it is the realisability check
underlying `generator.md` §3.4 and §4.4.

### 2.7 Why "O (1) time **and** O (1) state per prime" is not available

> **Remark 2.9 (obstruction).** Deciding \(a \in R_p\) is deciding
> \(\gcd (a, P_{<p}) = 1\). A branch-free O (1) decision procedure with no auxiliary state must
> therefore be a function of \(a \bmod P_{<p}\); tabulating it costs \(\Theta (P_{<p})\) space,
> and \(P_{<p} = e^{ (1+o (1))p}\). Any _stateless_ alternative amounts to trial division by the
> \(\pi (p)-1\) primes below \(p\) (cost \(\Theta (\pi (p))\), not O (1)). Hence a fixed-size table
> can serve only finitely many primes, and beyond that boundary an exact orthogonal stream must
> _derive_ its rough multipliers from other streams.

This is the fork in the road, and it produces exactly the two algorithms below:

- **Algorithm A** derives the rough multipliers from other streams (exact, more streams).
- **Algorithm B** replaces \(R_p\) by the tabulated wheel \(R_{p_{w+1}}\) for all \(p > p_w\) (inexact ownership,
  bounded duplication, O (1) state per prime).

---

## 3. Algorithm A — exact one-touch orthogonal generator

### 3.1 The idea: recurse on the multiplier, not on divisibility

Iterating Theorem 2.1 on the multiplier gives, for any composite \(m\), the canonical factorisation \[ m = q_1 q_2
\cdots q_{r-1} \cdot q_r, \qquad q_1 \le q_2 \le \cdots \le q_r,\ r \ge 2 . \] Split off the **largest** factor: with
\(b = m/P (m)\) and \(q = P (m)\) we get \(m = bq\), \(b \ge 2\), \(P (b) \le q\). The pair \( (b,q)\) is uniquely
determined by \(m\), and conversely every pair \( (b,q)\) with \(b\ge 2\), \(q\) prime, \(P (b)\le q\) yields a distinct
composite. Hence:

> **Theorem 3.1 (stream tree).** For \(b \ge 2\) define the **stream**
> \[
> \Sigma_b \;=\; \{\, b\cdot q \;:\; q \text{ prime},\ q \ge P (b) \,\}.
> \]
> Then \(\{\Sigma_b\}_{b\ge 2}\) is a partition of the composites, each \(\Sigma_b\) is
> increasing, and its successor operation is "advance one index in the prime array".

Relation to §2: \(\Sigma_b\) with \(b=p\) prime is the "prime phase" of \(\Theta_p\) (Lemma 2.7); the composite bases
\(b\) are precisely the delegates that supply the rough, composite multipliers. Equivalently \[ \Theta_p = p\cdot\{q
\text{ prime}, q \ge p\} \;\uplus\; \biguplus_{p' \ge p} p\cdot\Theta_{p'}, \] which is Theorem 3.1 read from the small
end. Orthogonality is preserved exactly.

### 3.2 Lazy creation (keeping the queue small)

The base \(b' = bq\) of a child stream must be _created_ by the time its first element \(b'\cdot q = b q^2\) is reached.
Creating children eagerly (one per emitted composite)
costs \(\Theta (N)\) memory. Instead each stream carries **two** cursors:

- an **emit cursor** \(c\): next output \(b\cdot p_{c}\);
- a **spawn cursor** \(s\): next child \(b\cdot p_{s}\), triggered at value \(b\cdot p_s^2\).

Because \(p_s^2 > p_s\), spawn triggers always lie beyond the corresponding emission, and both cursors advance
monotonically. A spawn trigger is itself the first element of the new child stream, so _the trigger event consumes a
composite_ — no work is wasted.

### 3.3 Data structures

```
primes : dynamic array of primes discovered so far (0-based)
Q      : min-priority queue of records keyed by value
         EMIT  (v, b, c)   with v = b * primes[c]
         SPAWN (v, b, s)   with v = b * primes[s]^2
n      : scan position, starts at 2
```

### 3.4 Pseudocode

```
A(N):
primes := [] ; Q := empty ; n := 2
while n <= N:
    if Q is empty or min_key(Q) > n:
        # ---- n is prime -------------------------------------------------
        emit n ; i := len(primes) ; primes.append(n)
        if n*n <= N:      push EMIT (n*n,      n, i)      # multipliers q >= n
        if n*n*n <= N:    push SPAWN(n*n*n,    n, i)      # child base n*n
    else:
        # ---- n is composite; by Thm 3.1 exactly one record has key n ----
        (v, kind, b, k) := pop_min(Q)                      # v = n
        if kind = EMIT:
            j := k+1                                       # primes[j] exists, Thm 3.5
            if b*primes[j] <= N:  push EMIT (b*primes[j], b, j)
        else:                                              # SPAWN
            q := primes[k] ; child := b*q                  # child base, P(child)=q
            if child*primes[k+1] <= N:
                push EMIT (child*primes[k+1], child, k+1)  # q-element already consumed
                if child*q*q <= N:
                    push SPAWN(child*q*q, child, k)        # grandchild base child*q
            if b*primes[k+1]*primes[k+1] <= N:
                push SPAWN(b*primes[k+1]^2, b, k+1)        # parent's next child
    n := n + 1
```

Note what is absent: no marking array, no divisibility test, no square roots, no
`while p*p <= n` loop. Every arithmetic operation is one multiplication plus one comparison.

### 3.5 Correctness

> **Invariant I1.** Every key in \(Q\) is \(> n\) or \(= n\); never \(< n\).
> **Invariant I2.** At scan position \(n\), for every pair \( (b,q)\) with \(b\ge2\), \(P (b)\le q\)
> and \(bq \ge n\), \(bq \le N\), the composite \(bq\) will be produced exactly once: either by
> an `EMIT` record already in \(Q\) (if \(q > P (b)\) or \(b\) is prime), or by the `SPAWN`
> record of \(b/P (b)\) (if \(b\) is composite and \(q = P (b)\)).

_Proof of I1._ Records are pushed with keys \(b\,p_{j}\) or \(b\,p_{s}^2\) that strictly exceed the popped key, and
prime-discovery pushes \(n^2, n^3 > n\). \(\square\)

_Proof of I2 (sketch, by induction on \(n\))._ Root streams: when \(p\) is emitted, `EMIT`
\( (p^2,p,\mathrm{idx} (p))\) is inserted and its cursor subsequently visits every prime \(\ge p\), producing all \(pq,\
q\ge p\). Composite bases: a base \(b'=bq\) is created exactly at the trigger \(bq^2 = b'q\), which is the \(q\)-element
of \(\Sigma_{b'}\); the child's emit cursor then starts at \(q\)'s successor, so \(\Sigma_{b'}\) is produced without gap
or repetition. The parent's spawn cursor visits every \(s \ge \mathrm{idx} (P (b))\), so every legal base \(b\cdot p_s\)
is created. Uniqueness of \( (b,q)\) (Theorem 3.1) gives "exactly once". \(\square\)

> **Theorem 3.2 (correctness).** `A(N)` emits precisely the primes \(\le N\), in increasing
> order, and pops exactly one queue record per composite in \([4,N]\).

_Proof._ By I2, at scan position \(n\) the minimum key equals \(n\) iff \(n\) is composite, and is \(>n\) iff \(n\) is
prime (I1 forbids \(<n\)). The emit branch is therefore taken exactly on primes. The pop count is the number of
composites, by I2's "exactly once". \(\square\)

> **Theorem 3.5 (causality, Algorithm A).** Every array access `primes[j]` performed while
> processing \(n\) satisfies `primes[j] < n`, hence is legal.

_Proof._ In the `EMIT` branch \(p_{k} = v/b \le v/2\) so \(p_{k+1} < 2p_k \le v = n\) by Bertrand. In the `SPAWN` branch
\(p_k^2 = v/b \le v/2\), so \(p_{k+1} < 2p_k \le 2\sqrt{v/2} = \sqrt{2v} < v\) for \(v \ge 8\); the smallest spawn
trigger is \(8\). \(\square\)

### 3.6 Worked trace (\(N = 50\))

| \(n\) | action                                                                                        |
|-------|-----------------------------------------------------------------------------------------------|
| 2     | prime; push EMIT(4,2,0), SPAWN(8,2,0)                                                         |
| 3     | min 4 > 3 ⇒ prime; push EMIT(9,3,1), SPAWN(27,3,1)                                            |
| 4     | pop EMIT(4,2,0) ⇒ EMIT(6,2,1)                                                                 |
| 5     | prime; push EMIT(25,5,2) (\(5^3>50\), no SPAWN)                                               |
| 6     | pop EMIT(6,2,1) ⇒ EMIT(10,2,2)                                                                |
| 7     | prime; push EMIT(49,7,3)                                                                      |
| 8     | pop SPAWN(8,2,0): \(q=2\), child base 4 ⇒ EMIT(12,4,1), SPAWN(16,4,0); parent ⇒ SPAWN(18,2,1) |
| 9     | pop EMIT(9,3,1) ⇒ EMIT(15,3,2)                                                                |
| 16    | pop SPAWN(16,4,0): child base 8 ⇒ EMIT(24,8,1), SPAWN(32,8,0); parent ⇒ SPAWN(36,4,1)         |
| 18    | pop SPAWN(18,2,1): \(q=3\), child base 6 ⇒ EMIT(30,6,2); parent ⇒ SPAWN(50,2,2)               |
| 27    | pop SPAWN(27,3,1): child base 9 ⇒ EMIT(45,9,2)                                                |
| 50    | pop SPAWN(50,2,2): \(q=5\), child base 10 (all continuations \(>50\))                         |

All 34 composites in \([4,50]\) are consumed exactly once; the 15 primes are emitted. Ownership examples: \(50 = 10\cdot
5\) (\(b=10,q=5\)), \(45 = 9\cdot5\), \(32 = 16\cdot2\), \(30 = 6\cdot5\), \(49 = 7\cdot 7\).

### 3.7 Cost

- **Touches:** exactly \(N - \pi (N) - 1\) pops and at most as many pushes. This is the _optimal_ one-touch behaviour
  and is what `generator.md` §4.5 assumes.
- **Time:** \(O\!\big (N\log S (N)\big)\) with a binary heap; \(O (N)\) amortised with the bucket queue of §5.1.
- **Live streams:**
  \[ S (N) \;=\; \pi (\sqrt N) \;+\; \#\{\,b \ge 2 : b\cdot P (b) \le N \,\} \;=\; \pi (\sqrt N) + \#\{ (b',q): P (b')
  \le q,\ b'q^2 \le N\}. \] A saddle-point estimate using Dickman's \(\rho\) (\(\#\{b\approx N^\beta\} \approx N^\beta
  \rho (2\beta/ (1-\beta))\) times \(\pi (N^{ (1-\beta)/2})\))
  maximises near \(\beta \approx 0.6\) and gives \(S (N) = N^{\theta+o (1)}\) with \(\theta \approx 0.75\). **This is
  sublinear but decisively worse than \(\pi (\sqrt N)\)**; it is the price of exact orthogonality (Remark 2.9). Measure
  it with the `stats` mode of the reference implementation before trusting the exponent.
- **Memory:** \(O (S (N))\) records; no array proportional to \(N\).
- **Not parallel-friendly:** a segment cannot be started in isolation, because the set of live bases at an arbitrary
  \(X\) cannot be reconstructed in \(o (X)\) work.

### 3.8 Variant A+wheel

Combine with §4: fix \(W=p_1\cdots p_w\), emit \(p_1..p_w\) directly, step \(n\) over \(W\)-coprime candidates only, and
build bases only from primes \(> p_w\). Streams then require \(b\) to be \(p_{w+1}\)-rough, which removes the smooth
bases that dominate \(S (N)\); the reduction is large (empirically an order of magnitude at \(w=6\)) though we do not
attempt a sharp exponent. One-touch behaviour is preserved for all \(W\)-coprime composites.

---

## 4. Algorithm B — wheeled streaming generator (recommended)

### 4.1 Design

Fix \(w\) and \(W = p_1\cdots p_w\) (e.g. \(w=6\), \(W=30030\), \(\kappa_W = 0.1918\); or \(w=7\), \(W=510510\),
\(\kappa_W=0.1795\)). Then:

- Candidates \(n\) run over \(W\)-coprime integers only; the streams of \(p_1..p_w\) are _structurally absent_ (their
  composites are never candidates). This is `idea.md`'s wheel as a data structure.
- For \(p > p_w\), replace the exact multiplier set \(A_p = R_p\cap[p,\infty)\) by the tabulated relaxation \(\tilde
  A_p = \{a \ge p : \gcd (a,W)=1\}\supseteq A_p\). Stream of \(p\): \(p\cdot\tilde A_p\), starting at \(p^2\).
- Advancement is exact O (1) with O (1) state: `a += step[a % W]`, `v = p*a`.

### 4.2 Wheel tables

```
spokes  = sorted { r in [0,W) : gcd(r,W)=1 }            # spokes[0] = 1
step[r] = (smallest spoke > r, in Z, possibly r' + W) - r        for r in [0,W)
gte[r]  = (smallest spoke >= r, likewise) - r                   for r in [0,W)
next_coprime(x)    = x + step[x mod W]      # strictly greater
next_coprime_ge(x) = x + gte[x mod W]       # greater or equal (used for segment restart)
```

Both tables are built in one backward pass over \([0,W)\); the first \(W\)-coprime integer \(>1\) is \(p_{w+1}\).

### 4.3 Pseudocode (unbounded stream)

```
B():
  emit p_1 ... p_w
  primes := []          # primes > p_w, in order
  Q      := empty       # records (value, p, a) keyed by value; value = p*a
  act    := 0           # index of next stream to activate
  n      := p_{w+1}
  loop forever:
      # deferred activation: a stream is inserted exactly when its head p^2 is reached
      while act < len(primes) and primes[act]^2 <= n:
          p := primes[act] ; act := act + 1
          push (p*p, p, p)
      if Q is empty or min_key(Q) > n:
          emit n ; primes.append(n)
      else:
          while Q nonempty and min_key(Q) = n:     # >=1 owner: duplicates allowed
              (v, p, a) := pop_min(Q)
              a := next_coprime(a)
              push (p*a, p, a)
      n := next_coprime(n)
```

### 4.4 Correctness

> **Lemma 4.1 (coverage).** Let \(m \le\) any bound be a \(W\)-coprime composite. Then
> \(p=\mathrm{spf} (m) > p_w\), \(a=m/p\) is \(W\)-coprime, and \(a \ge p\). Hence \(m = p\cdot a\)
> with \(a\in\tilde A_p\): \(m\) is a value of the stream of \(p\).

> **Lemma 4.2 (no early claims).** Every key in \(Q\) is \(\ge n\), and every key is a
> \(W\)-coprime composite \(\ge p^2\) for its owner \(p\).

_Proof._ Heads \(p^2\) are inserted at \(n = p^2\) exactly (\(p^2\) is \(W\)-coprime, hence a candidate, so the
activation test fires at \(n=p^2\), never later). Advancement strictly increases the key. \(W\)-coprimality of \(p\) and
\(a\) gives \(W\)-coprimality of \(pa\). \(\square\)

> **Theorem 4.3.** `B()` emits exactly the primes, in increasing order, forever.

_Proof._ By Lemma 4.2 the minimum key never precedes \(n\). If \(n\) is a \(W\)-coprime composite, Lemma 4.1 puts it in
some stream, whose cursor has by monotonicity reached exactly \(n\) (it visits every \(W\)-coprime multiplier and its
head \(p^2 \le n\) was activated in time), so \(\min Q = n\) and \(n\) is rejected. If \(n\) is prime, no key can equal
\(n\) since all keys are composite, so \(\min Q > n\) and \(n\) is emitted. Non-candidates are skipped by the wheel and
are composite (divisible by some \(p_i\), \(i\le w\)) as long as \(n > p_w\). \(\square\)

> **Theorem 4.4 (state).** Advancement uses no prime lookups at all; activation uses
> `primes[act]` with \(\mathrm{primes[act]}^2 \le n\), hence \(\mathrm{primes[act]} \le \sqrt n < n\).
> Algorithm B is a genuine online stream with \(O (1)\) state per prime.

### 4.5 Duplicate accounting (the honest cost of the relaxation)

A \(W\)-coprime composite \(m\) is popped once for every prime factor \(p\) of \(m\) with \(p_w < p \le \sqrt m\) — i.e.
\(\omega_{>p_w} (m)\) times, minus one if the largest prime factor exceeds \(\sqrt m\). Total queue operations up to
\(N\):
\[ \mathrm{ops} (N) \;=\; \sum_{p_w < p \le \sqrt N} \#\{a\ W\text{-coprime}: p \le a \le N/p\} \;\approx\; \kappa_W\, N
\sum_{p_w<p\le\sqrt N}\frac1p \;=\; \kappa_W\, N\big (\ln\ln\sqrt N - \ln\ln p_w + o (1)\big). \] For \(w=6\)
(\(p_w=13\)) and \(N=10^{12}\): \(\kappa_W = 0.1918\), \(\ln\ln\sqrt{N}\approx 3.32\), \(\ln\ln 13 \approx 0.94\), so
\(\mathrm{ops} \approx 0.46\,N\) — versus the one-touch ideal \(\kappa_W N - \pi (N) \approx 0.19\,N\). **Roughly a
factor \(2.4\) more touches than Algorithm A, in exchange for \(\pi (\sqrt N)=78\,498\) records instead of \(\sim
10^{9}\).**
Increasing \(w\) reduces both \(\kappa_W\) and the \(\ln\ln\) span, at the cost of a \(\Theta (W)\)-byte table;
\(w\in\{6,7,8\}\) is the practical range.

### 4.6 Cost summary

- **Time:** \(O (\mathrm{ops} (N)\log \pi (\sqrt N))\) with a binary heap; \(O (\mathrm{ops} (N)) = O (\kappa_W N
  \log\log N)\) with the bucket queue of §5.1.
- **Memory:** \(\pi (\sqrt N)\) records (16 bytes each suffices to \(2^{63}\)) \(+\ 2W\) bytes of tables \(+\) one
  segment. At \(N=10^{18}\): \(\pi (10^9)\approx 5.08\times10^7\) records.
- **Random-access restart (parallelism):** for a segment beginning at \(X\), the state of stream \(p\) is recomputed in
  O (1):
  \(a_0 = \max\big (p,\ \texttt{next\_coprime\_ge} (\lceil X/p\rceil)\big)\), value \(p a_0\). Segments are therefore
  independent and the generator parallelises exactly like a segmented sieve — a property Algorithm A lacks.

---

## 5. Engineering layer

### 5.1 Bucket priority queue (removes the \(\log\) factor)

Choose a segment length \(\Delta\) (typically L1/L2-sized, e.g. \(\Delta = 2^{18}\) candidates)
and maintain, for each future segment index \(s\), a bucket list `bucket[s]` of stream records whose next value lies in
segment \(s\). Processing segment \(s\):

1. Drain `bucket[s]`: for each record, mark offset \(v-X\) in a \(\Delta\)-bit segment array, advance the record
   (possibly several times while it stays inside the segment), then append it to `bucket[s']` for its new segment
   \(s'\).
2. Walk the segment's \(W\)-coprime offsets; unmarked ⇒ prime.

All operations are O (1) amortised and sequential in memory. Costs: \(+\Delta/8\) bytes for the mark array, \(+O
(\#\text{buckets})\) pointers. This is the standard "bucket sieve" layout and makes Algorithm B competitive with
production segmented sieves while retaining \(\pi (\sqrt N)\) state. If a strictly array-free generator is required,
keep the binary heap and accept the \(\log\) factor.

### 5.2 Numeric hygiene

- Guard every product before computing it: test `p > limit / a` rather than `p*a > limit`.
- Algorithm A's spawn keys are \(b p_s^2\); check `b > limit / (p*p)` first.
- With \(N \le 2^{63}\) all keys fit in `uint64`; use 128-bit or the division form for larger.

### 5.3 Deferred activation and unbounded operation

Algorithm B is already unbounded (§4.3): stream \(p\) is inserted only when \(n\) reaches \(p^2\), so the queue holds
\(\pi (\sqrt n)\) records and never needs a global \(N\). Algorithm A becomes unbounded by dropping the `<= N` guards,
but then \(S (n)\) grows with \(n\) as in §3.7; in practice run it with a limit and double.

### 5.4 SIMD / GPU remarks

`generator.md` §5.2 claims branchless streaming friendliness. Concretely: the _advance_
step of Algorithm B (`a += step[a % W]; v = p*a`) is a gather plus a multiply and vectorises across streams; the _merge_
does not vectorise well as a heap but does as bucket drains, which are independent scatter-writes into the segment
bitmap. That is the vectorisable formulation.

---

## 6. Reference implementation (Python, executable and self-checking)

```python
import heapq
from math import isqrt


# ---------- wheel -----------------------------------------------------------

def build_wheel(w_primes):
    W = 1
    for p in w_primes:
        W *= p
    is_spoke = bytearray(W)
    for r in range(W):
        v = r
        if all(v % p for p in w_primes):
            is_spoke[r] = 1
    step = [0] * W  # distance to next spoke strictly greater
    gte = [0] * W  # distance to next spoke greater or equal
    nxt = W + 1  # spokes[0] == 1
    for r in range(W - 1, -1, -1):
        step[r] = nxt - r
        gte[r] = 0 if is_spoke[r] else nxt - r
        if is_spoke[r]:
            nxt = r
    return W, step, gte


# ---------- Algorithm B: unbounded wheeled stream ---------------------------

def primes_B(w=6):
    """Unbounded prime generator. O(pi(sqrt n)) memory, O(1) state per prime."""
    small = [2, 3, 5, 7, 11, 13, 17, 19][:w]
    W, step, gte = build_wheel(small)
    for p in small:
        yield p
    primes, Q, act = [], [], 0
    n = 1 + step[1]  # = p_{w+1}
    while True:
        while act < len(primes) and primes[act] * primes[act] <= n:
            p = primes[act];
            act += 1
            heapq.heappush(Q, (p * p, p, p))
        if not Q or Q[0][0] > n:
            primes.append(n)
            yield n
        else:
            while Q and Q[0][0] == n:
                _, p, a = heapq.heappop(Q)
                a += step[a % W]
                heapq.heappush(Q, (p * a, p, a))
        n += step[n % W]


# ---------- Algorithm A: exact one-touch orthogonal generator ---------------

EMIT, SPAWN = 0, 1


def primes_A(limit, stats=False):
    """Every composite popped exactly once. No wheel, no marking, no division."""
    if limit < 2:
        return ([], {}) if stats else []
    primes, Q, out = [], [], []
    pops = streams = peak = 0
    n = 2
    while n <= limit:
        if not Q or Q[0][0] > n:
            i = len(primes);
            primes.append(n);
            out.append(n)
            if n <= limit // n:  # n*n <= limit
                heapq.heappush(Q, (n * n, EMIT, n, i));
                streams += 1
                if n * n <= limit // n:  # n^3 <= limit
                    heapq.heappush(Q, (n * n * n, SPAWN, n, i))
        else:
            v, kind, b, k = heapq.heappop(Q);
            pops += 1
            assert v == n
            if kind == EMIT:
                q2 = primes[k + 1]  # Theorem 3.5: exists
                if b <= limit // q2:
                    heapq.heappush(Q, (b * q2, EMIT, b, k + 1))
            else:
                q = primes[k];
                child = b * q  # new base, P(child) = q
                nq = primes[k + 1]
                if child <= limit // nq:
                    heapq.heappush(Q, (child * nq, EMIT, child, k + 1));
                    streams += 1
                    if child <= limit // (q * q):
                        heapq.heappush(Q, (child * q * q, SPAWN, child, k))
                if b <= limit // (nq * nq):
                    heapq.heappush(Q, (b * nq * nq, SPAWN, b, k + 1))
        peak = max(peak, len(Q))
        n += 1
    if stats:
        return out, {"pops": pops, "composites": limit - len(out) - 1,
                     "streams_created": streams, "peak_queue": peak}
    return out


# ---------- validation ------------------------------------------------------

def sieve_ref(limit):
    s = bytearray([1]) * (limit + 1)
    s[0:2] = b"\x00\x00"
    for i in range(2, isqrt(limit) + 1):
        if s[i]:
            s[i * i::i] = bytearray(len(s[i * i::i]))
    return [i for i, f in enumerate(s) if f]


if __name__ == "__main__":
    LIM = 200_000
    ref = sieve_ref(LIM)
    a, st = primes_A(LIM, stats=True)
    assert a == ref, "Algorithm A mismatch"
    assert st["pops"] == st["composites"], (st, "one-touch property violated")
    g = primes_B()
    b = [next(g) for _ in range(len(ref))]
    assert b == ref, "Algorithm B mismatch"
    print("ok", st)
```

The assertion `pops == composites` is the machine-checkable statement of exact orthogonality (Theorem 3.2): it fails
immediately if any composite is claimed twice or missed. `st["peak_queue"]` is the empirical \(S (N)\) of §3.7 — use it
to fit \(\theta\) rather than trusting the heuristic exponent.

---

## 7. Comparison

| method                                       | touches / time                                                                            | working memory           | array over range             | segment-parallel |
|----------------------------------------------|-------------------------------------------------------------------------------------------|--------------------------|------------------------------|------------------|
| Trial division extension (`generator.md` §1) | \(\Theta(N\pi(\sqrt N))\)                                                                 | \(O(\pi(\sqrt N))\)      | no                           | yes              |
| Eratosthenes, segmented                      | \(O(N\log\log N)\)                                                                        | \(O(\sqrt N + \Delta)\)  | yes (segment)                | yes              |
| Pritchard wheel sieve                        | \(O(N/\log\log N)\)                                                                       | \(O(\sqrt N)\)           | yes                          | partly           |
| Atkin                                        | \(O(N/\log\log N)\)                                                                       | \(O(\sqrt N + \Delta)\)  | yes                          | yes              |
| O'Neill priority-queue sieve                 | \(O(N\log N\log\log N)\)                                                                  | \(O(\pi(\sqrt N))\)      | no                           | no               |
| **Algorithm A**                              | \(N-\pi(N)\) touches (**optimal**), \(\times\log S\) or \(O(1)\) bucketed                 | \(S(N)\approx N^{0.75}\) | no                           | no               |
| **Algorithm B**                              | \(\kappa_W N(\ln\ln\sqrt N-\ln\ln p_w)\), \(\times\log\pi(\sqrt N)\) or \(O(1)\) bucketed | \(O(\pi(\sqrt N)+W)\)    | no (heap) / segment (bucket) | **yes**          |

Reading: Algorithm A is the unique member of this table that touches each composite exactly once _and_ uses no
range-proportional array — that is the real content of the
`generator.md` architecture. Algorithm B is the practical instantiation: it keeps the \(\pi (\sqrt N)\) memory and O (1)
per-prime state, at a small constant factor of redundant touches, and it is the only version that supports independent
segment restart.

---

## 8. Relation to the companion documents

1. **`paper.md` (primary specification).** Same objects, different names: Claim O1 = Theorem 2.1, Claim O2 = Lemma 2.3,
   Claim C1 = Theorem 2.8, Claim A1 = Theorem 3.1, Claims B1–B5 = §4.4–§4.5, Conjecture X1 = Remark 2.9. The structural
   half of both documents is machine-checked in `lean/`; see `paper.md` §9 for the claim → theorem table.
2. **`generator.md` (architecture).** Its `NextOwnedComposite` is exactly \(p\cdot\mathrm{NextRough} (p,\cdot)\) (Prop.
   2.6), and its consuming merge is the loop of §3.4/§4.3 here. Under exact orthogonality the composite branch pops a
   _single_ record (Algorithm A); under the wheel relaxation it drains all records equal to \(n\) (Algorithm B). Its
   complexity statement is the one restated in §3.7/§4.6: heap size \(\pi (\sqrt N)\) under deferred activation, never
   \(\pi (N)\), since only primes \(\le\sqrt N\) own a composite \(\le N\).
3. **`observation.md` (multiplier sets).** The multiplier set is \(A_p\), the \(p\)-rough numbers from \(p\) up: a
   wheel, infinite, periodic mod \(P_{<p}\) with \(\varphi (P_{<p})\) residues per period. Its elements below \(p^2\)
   are exactly the primes in \([p,p^2)\) (Lemma 2.3), which is why one period is "1 plus primes" precisely for \(p \le
   7\) (Cor. 2.4). Multipliers are consumed in increasing order and the one needed at scan position \(n\) is \(\le n/2\)
   (Theorem 2.8), so nothing is stored and nothing is retroactively extended.
4. **`idea.md` (wheels and spectra).** Both algorithms here are, structurally, the wheel of `idea.md` §2.3 made
   incremental: Algorithm B materialises the first \(w\) exclusion fields as a table and the remaining ones as
   lazily-advanced pointers, so the doubly-exponential primorial blow-up noted in `idea.md` §8.5 never occurs.
5. **`fractal.md` (lattice reading).** The set deleted by the lattice recursion \(S_{k+1} = (p\text{ tilings of } S_k)
   \setminus p\cdot S_k\) is exactly \(\Theta_p = p\cdot A_p\) (Theorem 2.1). Algorithm A follows that recursion to full
   depth; Algorithm B truncates it at depth \(w\), and the duplicate factor of §4.5 is precisely the truncation error.
6. **`theory.md` (inventory).** Statement-by-statement status, dependency graph and prior art for everything above.

---

## 9. Open items

1. Sharp asymptotics for \(S (N) = \#\{b\ge2 : b\,P (b)\le N\}\) — the memory of Algorithm A. Measure with
   `primes_A(..., stats=True)` and compare with the Dickman saddle estimate.
2. Same question for the wheeled variant A+wheel (bases restricted to \(p_{w+1}\)-rough), where the smooth bases that
   dominate \(S (N)\) are suppressed. Is the exponent driven below \(1/2\)?
3. Optimal \(w\) as a function of \(N\) and cache size for Algorithm B, trading \(\kappa_W\) and the \(\ln\ln\) span
   against the \(\Theta (W)\) table.
4. A hybrid: run Algorithm A's exact streams for \(p \le N^{1/3}\) (where composite rough multipliers actually occur)
   and Algorithm B's index-increment prime phase for \(N^{1/3} < p \le \sqrt N\) (Lemma 2.7 guarantees the latter needs
   nothing else). This should get one-touch behaviour with much smaller \(S (N)\); the accounting is not yet done.