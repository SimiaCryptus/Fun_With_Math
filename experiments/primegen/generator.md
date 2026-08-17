# Generational Rings of Primes: An Orthogonal Composite Stream Sieve with O(1) Per-Prime Advancement

## Abstract

This paper describes a structurally clean prime-generation architecture. The central idea is that primes can be viewed as exception points in an expanding periodic lattice. Each prime emits a periodic field of composite numbers, orthogonalized against all smaller primes. If each prime has an O(1) pointer rule that returns its next orthogonal composite beyond a given threshold, then prime generation reduces to a single sorted merge of independent composite streams. The result is a sieve with no marking array, no trial division, and no deep conditional branching. We formalize the generational-ring model, state the assumed pointer rule, present the consuming algorithm, prove its correctness, and discuss why the architecture is novel and useful.

---

## 1. Introduction

A classical observation about primes is that every composite number up to \(N^2\) has a prime factor at most \(N\). Therefore, if all primes up to \(N\) are known, those primes form a complete divisor basis for the entire band up to \(N^2\).

From that fact, one can already describe a layered prime engine: sieve to \(N\), then extend the search to \(N^2\) using only the existing primes. The structure is correct, but naive application leads to trial division by \(\pi(N)\) primes for roughly \(N^2\) candidates. That is not asymptotically optimal for bulk generation.

This paper is not about that naive extension. It is about a different representation: instead of testing candidates, we assign every composite to exactly one prime stream and then merge those streams. If the streams are orthogonal — meaning a composite is claimed only by its smallest prime factor — then the next prime is simply the next integer not claimed by any stream.

The key contribution discussed here is the assumption and use of an O(1) per-prime pointer rule that computes the next orthogonal composite owned by a given prime. Under that assumption, prime generation collapses into a clean priority-queue merge without the weaknesses of classical sieves.

---

## 2. Generational Rings of Primes

### 2.1 The Basic Structural Fact

**Lemma 1.** Let \(m\) be composite with \(2 \le m \le N^2\). Then \(m\) has a prime factor \(p \le N\).

**Proof.** Write \(m = ab\) with \(1 < a \le b\). Then

\[
a^2 \le ab = m \le N^2,
\]

so \(a \le N\). The smallest prime factor of \(m\) is at most \(a\), hence at most \(N\). \(\square\)

This lemma means that the primes up to \(N\) are a complete divisor basis for all numbers up to \(N^2\).

### 2.2 Periodic Fields

Each prime \(p\) can be thought of as emitting a periodic field of nonprimes: the multiples of \(p\), with period \(p\). Smaller primes define earlier periodic fields. The combined periodic structure of primes \(p_1, p_2, \dots, p_k\) has period

\[
\mathrm{lcm}(p_1, p_2, \dots, p_k).
\]

Because the primes are distinct, this is simply the product

\[
P_k = \prod_{i=1}^{k} p_i.
\]

The next prime is the smallest integer not eliminated by this combined periodic structure. Once it appears, it emits its own periodic field, and the ring expands.

### 2.3 Generational Structure

This suggests a natural genealogy:

- **Generation 0:** \(\{2\}\)  
  The first nontrivial periodic field is the set of multiples of \(2\), with period \(2\).

- **Generation 1:** \(\{3\}\)  
  The first integer not eliminated by the field of \(2\) is \(3\). The combined period becomes \(\mathrm{lcm}(2,3)=6\).

- **Generation 2:** \(\{5,7\}\)  
  The next integers not eliminated by the fields of \(2\) and \(3\) are \(5\) and \(7\). The combined period becomes \(\mathrm{lcm}(2,3,5,7)=210\).

- **Generation 3 and beyond:**  
  The next primes are the remaining integers not eliminated by the expanded periodic lattice.

This is not merely a computational observation. It is a structural fact about how primes propagate: each new prime is a break in the current periodic structure, and at the same time becomes a new generator that extends the structure.

### 2.4 Orthogonal Streams

For this paper, we adopt the following ownership convention:

> A composite number \(m\) is **owned** by the prime \(p\) if \(p\) is the smallest prime factor of \(m\).

Every composite has exactly one owner. Therefore, if we build one stream per prime, and if the stream for prime \(p\) contains exactly the composites owned by \(p\), then the streams are disjoint and together cover all composite numbers.

This is the orthogonalization property: a prime does not re-emit composites already killed by a smaller prime.

---

## 3. The Assumed O(1) Pointer Rule

The consuming algorithm below does not depend on the internal details of how the next composite is computed. We assume the following primitive.

**Primitive: `NextOwnedComposite(p, x)`**

For a prime \(p\) and an integer \(x\), let

\[
\text{NextOwnedComposite}(p, x)
\]

be the smallest integer \(m > x\) such that:

1. \(m\) is composite,
2. \(p\) is the smallest prime factor of \(m\),
3. \(m\) is not owned by any prime smaller than \(p\).

Equivalently, it is the next composite in the orthogonal stream of prime \(p\) strictly after \(x\).

For a newly discovered prime \(p\), its first owned composite is typically \(p^2\), since every smaller multiple of \(p\) is divisible by some smaller prime.

We assume that this primitive can be evaluated in O(1) time using only a few multiply, modulo, and division operations. The derivation of the precise formula is outside the scope of this paper; the focus is on what becomes possible once such a rule exists.

---

## 4. The Consuming Algorithm

### 4.1 Data Structures

The algorithm maintains the following state:

- \(P\): a sorted list of primes discovered so far.
- \(H\): a min-heap or sorted priority queue of pairs \((p, c_p)\), where:
  - \(p\) is a known prime,
  - \(c_p\) is the next composite owned by \(p\).
- \(n\): the current candidate integer.

At all times, the heap \(H\) is ordered by \(c_p\), so the smallest entry gives the next composite that is known to be claimed by its owner.

### 4.2 Algorithm Description

The algorithm is a single merge of orthogonal composite streams.

```
H := empty min-heap
n := 2

while generating primes:
    if H is empty or n < min_composite(H):
        emit n as prime
        c := NextOwnedComposite(n, n)
        insert (n, c) into H
        n := n + 1
    else:
        // By invariant, n == min_composite(H)
        (p, c) := extract_min(H)
        advanced := NextOwnedComposite(p, c)
        insert (p, advanced) into H
        n := n + 1
```

### 4.3 Worked Beginning

The first few steps are:

- \(n=2\): heap empty, so \(2\) is prime. Insert \((2,4)\).
- \(n=3\): heap minimum is \(4\), so \(3<4\). Emit \(3\). Insert \((3,9)\).
- \(n=4\): heap minimum is \(4\), so \(n=4\) is composite. Remove \((2,4)\), advance to \((2,6)\).
- \(n=5\): heap minimum is \(6\), so \(5<6\). Emit \(5\). Insert \((5,25)\).
- \(n=6\): heap minimum is \(6\), consume it, advance \(2\) to \(8\).
- \(n=7\): heap minimum is \(8\), so \(7<8\). Emit \(7\). Insert \((7,49)\).
- \(n=8\): heap minimum is \(8\), consume it, advance \(2\) to \(10\).
- Continue.

This is the entire algorithm. There is no divisibility testing, no array marking, and no branching over candidate factors.

### 4.4 Correctness

**Theorem 1.** The consuming algorithm emits all primes in increasing order and all composites are removed exactly once by their smallest prime factor.

**Proof sketch.** We maintain the invariant:

> After processing all integers less than \(n\), the heap \(H\) contains, for each prime \(p < n\), the smallest composite owned by \(p\) that is at least \(n\).

For a candidate \(n\), there are two cases.

- If \(n\) is prime, no prime smaller than \(n\) owns \(n\). Therefore no heap entry can equal \(n\), and because the heap minimum is the smallest claimed composite at or after \(n\), we must have \(n < \min(H)\).

- If \(n\) is composite, let \(p^_\) be its smallest prime factor. Then \(p^_ < n\), so \(p^_\) has already been emitted. Since all composites less than \(n\) have already been processed, \(p^_\)'s next owned composite must be exactly \(n\). Thus \(n = \min(H)\).

Therefore the algorithm emits exactly the primes, in increasing order. Each composite is assigned to its unique smallest prime factor and is consumed exactly once. \(\square\)

### 4.5 Complexity

Assume the `NextOwnedComposite` primitive is O(1). Each prime insertion and each composite removal requires one heap operation. The heap size is proportional to the number of primes discovered so far.

Let \(N\) be the current search limit. The number of primes up to \(N\) is \(\pi(N) \sim N / \log N\). The total number of heap operations is therefore

\[
O(N)
\]

in number, but each heap operation costs \(O(\log \pi(N))\) time. The total time becomes

\[
O(N \log \pi(N)) \approx O(N \log N).
\]

The memory requirement is \(O(\pi(N))\), because only primes and one heap entry per prime must be stored. No marking array for the full range is required.

This is a substantial structural improvement in memory and control flow, even if it is not necessarily the fastest possible sieve for raw throughput on a single processor.

---

## 5. Why This Is Novel and Interesting

### 5.1 Comparison with Classical Sieves

Classical sieve methods have one or more of the following drawbacks:

- **Eratosthenes:** requires a marking array proportional to the search range; orthogonalization is implicit, not per-prime.
- **Atkin:** uses quadratic forms and heavy branching; conceptually opaque.
- **Wheel sieves:** precompute residue tables; orthogonalization is global rather than per-prime.
- **Priority-queue multiple tracking:** tracks multiples per prime, but the streams are usually not pre-orthogonalized. Many generated multiples are discarded because smaller primes own them.

The architecture described here is different. Each prime is a pure generator of its orthogonal composite stream. The streams are independent, and interaction happens only through the global minimum.

### 5.2 Branchless Behavior

The inner loop has a single comparison:

- If the candidate is less than the next claimed composite, it is prime.
- Otherwise, it is the claimed composite.

There are no chains of conditional logic, no residue tests, no “try every prime up to \(\sqrt{n}\)” checks, and no need to skip values that were already killed by a smaller prime.

This kind of structure maps cleanly onto streaming, SIMD, GPU, and deterministic pointer-based execution environments.

### 5.3 Generational Ring Clarity

The algorithm does not merely generate primes; it reveals the generational ring structure of the primes. Each new prime appears as an unclaimed gap in the expanding periodic lattice, and then it begins emitting a new orthogonal field into the heap.

This makes the structure explicit:

- Primes are not random exceptions.
- Primes are the exception points in an expanding periodic lattice.
- Each exception becomes a new generator of the next periodic structure.

### 5.4 Limitations

The framework depends on the existence of an O(1) `NextOwnedComposite` primitive. The paper intentionally does not derive that formula. It also does not claim that this method beats highly optimized segmented sieves on raw CPU throughput. The value is architectural: lower memory, lower branching, clean ownership, and direct alignment with the mathematics of periodic fields.

---

## 6. Conclusion

We have described a prime-generation architecture based on generational rings and orthogonal composite streams. Under the assumption of an O(1) per-prime pointer rule, the next prime is simply the next integer not claimed by any known prime stream. The resulting consuming algorithm is compact, low-branch, low-memory, and structurally faithful to how primes actually propagate.

This paper identifies the central missing piece in most sieve formulations: an explicit per-prime orthogonal composite generator. Once that primitive exists, prime generation becomes a clean merge of independent periodic fields. Future work should derive, verify, and optimize the O(1) `NextOwnedComposite` rule and investigate its performance in practice.
