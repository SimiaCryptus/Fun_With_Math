# The Multiplier Set of a Prime

**Document map.** `paper.md` is the primary specification; `algorithm.md` is the full normative construction with proofs
and a reference implementation; `generator.md` is the architectural narrative; `idea.md` is the spectral/entropy
reading; `fractal.md` is the lattice reading; `theory.md` inventories every statement with its status, dependencies and
prior art. This note is the concrete, worked description of the single object all of them are built on: the multiplier
set \(A_N\) of one prime \(N\), and the orthogonal composite stream it generates.

---

## Overview

The **orthogonal stream** of a prime \(N\) is \(N\) times a multiplier set:

\[ \Theta*N \;=\; N \cdot A_N, \qquad A_N \;=\; \{\, a \ge N \;:\; \gcd (a, P*{<N}) = 1 \,\}, \qquad P*{<N} \;=\; \prod*
{p \text{ prime},\ p < N} p , \]

with the empty-product convention \(P\_{<2} = 1\).

The elements of \(A*N\) are the **\(N\)-rough** numbers from \(N\) up: integers with no prime factor below \(N\).
Equivalently \(A_N \cup \{1\}\) is one period of a **wheel** of modulus \(P*{<N}\), namely the reduced residue system
mod \(P\_{<N}\), lifted periodically to \(\mathbb{Z}\).

In the compact notation used throughout the companion documents,

\[ N \* \{1,\ N,\ \ldots,\ M\}, \]

the braces denote one period of the wheel: the number \(1\), then \(N\) itself, then every further totative of \(P*{<
N}\) up to the largest one \(M < P*{<N}\). The multiplier \(1\) generates the residue class of \(N\) itself and is
dropped when the object is used as a stream of _composites_; the stream proper begins at \(a = N\), i.e. at \(N^2\).

---

## 1. Statement

Let \(N\) be prime.

> **Ownership.** \(\Theta_N\) is exactly the set of composites whose smallest prime factor is \(N\), and
> \(a \mapsto N a\) is a bijection \(A_N \to \Theta_N\).

_Proof._ If \(m\) is composite with \(\operatorname{spf} (m) = N\) and \(a = m/N\), then \(a > 1\) and every prime
factor of \(a\) is \(\ge N\), so \(\gcd (a, P*{<N}) = 1\) and \(a \ge N\). Conversely if \(a \ge N\) and \(\gcd (a,P*{<
N}) = 1\) then \(Na\) is composite and every prime factor of \(Na\) is \(\ge N\). ∎

Because every composite has exactly one smallest prime factor, the streams \(\{\Theta_p\}\_p\) are pairwise disjoint and
together cover all composites. That is the orthogonality the whole architecture rests on (`paper.md` Claim O1,
`algorithm.md` Theorem 2.1).

> **First element.** \(\min \Theta_N = N^2\) — always, not merely typically, since the least multiplier is \(N\).

---

## 2. \(A_N\) is a wheel

Membership \(\gcd (a, P*{<N}) = 1\) depends only on \(a \bmod P*{<N}\). Hence:

- \(A*N \cup \{1\}\) is periodic modulo \(P*{<N}\);
- one period contains \(\varphi (P*{<N}) = \prod*{p<N} (p-1)\) residues;
- \(A_N\) is **infinite**, and the finite list above is one period, not the whole set;
- the least element of one period above \(1\) is \(N\) itself, so no special case is needed to "insert \(N\)": any \(1 <
  t < N\) coprime to every prime \(< N\) would satisfy \(\operatorname{spf} (t) \ge N > t\), which is impossible.

The full stream is the periodic extension

\[ \Theta*N \;=\; \{\, N\, (t + jP*{<N}) \;:\; t \in A*N \cap [1, P*{<N}],\ j \ge 0,\ t + jP\_{<N} \ge N \,\}, \]

a union of \(\varphi (P*{<N})\) arithmetic progressions of common difference \(N \cdot P*{<N}\).

---

## 3. Phase separation: when the multipliers are primes

> **Phase separation.** If \(a \in A_N\) and \(a < N^2\), then \(a\) is prime.

_Proof._ \(a > 1\) and all prime factors of \(a\) are \(\ge N\); a composite such \(a\) would have at least two of them,
hence \(a \ge N^2\). ∎

So the multipliers split into two phases:

- the **prime phase** \([N, N^2)\), where \(A_N\) is exactly the list of primes in that range, and advancing the stream
  is a single index increment into the already-known prime array;
- the **rough phase** \([N^2, \infty)\), where composite multipliers appear: \(N^2\), \(N\cdot N'\), \(N'^2\), …

> **Coincidence window.** One period of \(A*N\) consists of \(1\) together with primes only **iff**
> \(P*{<N} \le N^2\), i.e. iff \(N \le 7\) (\(P*{<7} = 30 < 49\), but \(P*{<11} = 210 > 121\)).

This is why the compact prime-list description of one period is exact for \(N \in \{2,3,5,7\}\) and becomes a
description of the _prime phase only_ from \(N = 11\) on. The first composite multiplier anywhere is \(121 = 11^2\),
which yields \(11 \cdot 121 = 1331 = 11^3 \in \Theta\_{11}\).

Since a composite multiplier of \(N\) forces \(Na \ge N^3\), the rough phase is reachable below a bound \(X\) only for
\(N \le X^{1/3}\); for larger primes the stream is a pure prime-index walk.

---

## 4. Worked Examples

### \(N = 2\)

- \(P\_{<2} = 1\), \(\varphi (1) = 1\): the wheel is trivial, every integer is a spoke.
- \(A_2 = \{2,3,4,5,\ldots\}\).
- \(\Theta_2 = 2 \cdot A_2 = \{4, 6, 8, 10, \ldots\}\) — the even composites.
- Prime phase \([2,4)\): \(2, 3\). First composite multiplier: \(4 = 2^2\).

```
2 -> 2 * {1, 2, 3, 4, 5, ...}   (period 1)
```

### \(N = 3\)

- \(P\_{<3} = 2\), spokes \(\{1\}\), \(\varphi (2) = 1\).
- \(A_3 = \{3, 5, 7, 9, 11, \ldots\}\) — the odd numbers from 3 up.
- \(\Theta_3 = \{9, 15, 21, 27, 33, \ldots\}\).
- Prime phase \([3,9)\): \(3,5,7\). First composite multiplier: \(9 = 3^2\).

```
3 -> 3 * {1, 3, 5, 7, 9, ...}   (period 2, spokes {1})
```

### \(N = 5\)

- \(P\_{<5} = 6\), spokes \(\{1,5\}\), \(\varphi (6) = 2\).
- \(A_5 = \{5, 7, 11, 13, 17, 19, 23, 25, 29, \ldots\}\).
- \(\Theta_5 = \{25, 35, 55, 65, 85, 95, 115, 125, 145, \ldots\}\).
- Prime phase \([5,25)\): \(5,7,11,13,17,19,23\). First composite multiplier: \(25\).

```
5 -> 5 * {1, 5}   (period 6)
```

### \(N = 7\)

- \(P\_{<7} = 30\), spokes \(\{1,7,11,13,17,19,23,29\}\), \(\varphi (30) = 8\).
- \(A_7 = \{7,11,13,17,19,23,29,31,37,41,43,47,49,\ldots\}\).
- \(\Theta_7 = \{49, 77, 91, 119, 133, 161, 203, 217, \ldots\}\).
- Prime phase \([7,49)\): all primes. First composite multiplier: \(49\).

```
7 -> 7 * {1, 7, 11, 13, 17, 19, 23, 29}   (period 30)
   -> 49, 77, 91, 119, 133, 161, 203, 217, ...
```

\(N = 7\) is the last prime for which one full period of the multiplier set is "1 plus primes"
(\(P\_{<7} = 30 \le 49 = 7^2\)).

### \(N = 11\)

- \(P\_{<11} = 210\), \(\varphi (210) = 48\).
- One period of \(A\_{11} \cup \{1\}\) is

  \[ \{1\} \;\cup\; \{\text{the } 42 \text{ primes in } [11,199]\} \;\cup\; \{121,\ 143,\ 169,\ 187,\ 209\}, \]

  since \(48 = 1 + 42 + 5\). The five composite totatives are \(11^2,\ 11\cdot13,\ 13^2,\ 11\cdot17,\ 11\cdot19\).

- \(\Theta\_{11} = \{121, 143, 187, 209, 253, 319, 341, \ldots\}\), and further out \(11 \cdot 121 = 1331 = 11^3\), \(11
  \cdot 143 = 1573\), …
- Prime phase \([11,121)\): all primes. First composite multiplier: \(121\).

This is the first prime whose multiplier period is _not_ a prime list, and it is exactly the point at which the wheel
and the prime list part company.

---

## 5. Causality: there is no forward dependence

The multiplier set of \(N\) is determined by the primes **strictly below \(N\)** — through \(P\_{<N}\) — all of which are
known at the moment \(N\) is discovered. Nothing about \(A_N\) requires knowledge of primes larger than \(N\).

Concretely, the multipliers are consumed in increasing order, and the multiplier needed to emit a composite at scan
position \(n\) is

\[ a \;=\; n/N \;\le\; n/2 , \]

while the _next_ multiplier \(a' = \operatorname{NextRough} (N, a)\) satisfies \(a' < n\) (the primes are \(N\)-rough,
and Bertrand gives a prime in \( (a, 2a]\)). Hence:

- no step ever consults an integer \(\ge n\);
- no list is ever retroactively extended;
- multiplier lists are **streams**, not stored objects, and they are generated as the sieve advances.

This is the self-hosting property: the generator's own output supplies every multiplier it will ever need, always
strictly in advance (`paper.md` Claim C1, `algorithm.md` Theorem 2.8, `theory.md` T21).

---

## 6. Streaming form

```
stream(p):
    a := p                        # least multiplier; first emission is p*p
    loop:
        emit p * a
        a := next_rough(p, a)     # least a' > a with gcd(a', P_{<p}) = 1
```

The only nontrivial operation is `next_rough`, i.e. the successor on the wheel of modulus \(P\_{<p}\):

- **prime phase** (`a < p*p`): `next_rough` is the next prime after `a` — one index increment into the prime array, O
  (1) with no arithmetic;
- **rough phase** (`a >= p*p`): either derive the composite multipliers from other streams — exact, one touch per
  composite (Algorithm A, `paper.md` §3) — or relax the multiplier set to a single shared wheel of small modulus \(W\),
  giving O (1) time and O (1) state per prime at the cost of a bounded number of duplicate claims (Algorithm B,
  `paper.md` §4).

Tabulating the exact wheel per prime is not an option: it has \(\varphi (P\_{<p}) = e^{ (1+o (1))p}\) entries
(`theory.md` T30). That constraint, and nothing else, is what forces the two-algorithm fork.

---

## 7. Where this object appears

| reading                            | the same set \(A_N\), seen as…                                                          |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `paper.md` §2.2, `algorithm.md` §2 | the multiplier set of the stream owned by \(N\)                                         |
| `idea.md` §2                       | the survivors of the first \(\pi(N)-1\) periodic exclusion fields                       |
| `fractal.md` §2                    | the stage-\(k\) lattice \(S_k\) whose dilate \(N\cdot S_k\) is deleted at stage \(k+1\) |
| `theory.md` T15/T18                | the newly-killed residue classes of \(N\); the totatives of \(P\_{<N}\)                 |

One object, four vocabularies. The deletion set of the lattice recursion _is_ \(\Theta_N = N \cdot A_N\).
