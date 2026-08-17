# The Prime Sieve as a Stack of Orthogonal Periodic Fields: A Density, Entropy, and Spectral Analysis

## Abstract

The sieve of Eratosthenes is usually presented as a procedure: cross out multiples, move to the next survivor, repeat. This paper reframes the sieve as an algebraic and analytic object — a finite (and in the limit, infinite) product of orthogonal periodic exclusion fields, one per prime, acting on the residue lattice \(\mathbb{Z}/L_k\mathbb{Z}\) where \(L_k = p_1 p_2 \cdots p_k\). From this single structural reframing, three classical quantities fall out with unusual clarity: the density of survivors becomes a multiplicative attenuation process (recovering the Mertens product), the entropy of the sieve pattern becomes additive across primes (via the CRT product decomposition of \(\mathbb{Z}/L_k\mathbb{Z}\)), and the sieve itself admits an exact finite Fourier expansion whose harmonics are contributed, disjointly prime by prime — with the important caveat that all masks share the zero (DC) frequency; the disjointness holds only for nonzero frequencies. We show that this last fact turns the sieve into an infinite series in frequency space — a genuine "spectrum of the primes" — and we argue that the resulting picture supports a productive, if informal, wave/particle duality: primes as discrete survivors in position space, and primes as pure periodic tones in frequency space. We situate this construction against existing literature (Mertens' theorem, entropy of arithmetic functions, CRT dynamical systems, sieve-theoretic Fourier analysis, Ramanujan–Fourier expansions, wheel factorization, and the circle method) and argue that while each piece has antecedents, the specific unification — orthogonal periodic projectors, multiplicative density, additive entropy, and disjoint (nonzero-frequency) spectral support, all indexed transparently by the primes — has not been articulated in this form. The paper is best read as a pedagogical and expository synthesis of established results rather than as a claim of new mathematical discovery. We close with a discussion of possible uses: prime gaps as interference patterns, a renormalization-flow reading of sieve construction, compression schemes for sieve data (explicitly compared with standard wheel factorization), and speculative connections to spectral heuristics around the distribution of primes — while carefully distinguishing the rational CRT frequencies of this construction from the transcendental zeta zeros of the Riemann Hypothesis.

---

## 1. Introduction

The sieve of Eratosthenes is arguably the oldest nontrivial algorithm in mathematics, and it is easy to underestimate precisely because it is so old and so simple. Cross out multiples of 2, then multiples of 3, then multiples of 5, and so on; whatever remains is prime. The procedural description is complete and correct, but it is also analytically flat: it tells you *what to do* without telling you much about *what kind of object* you are building.

This paper is about making that object explicit. The central observation — simple to state, but with more mileage in it than one might expect — is this:

> Each prime \(p\) emits a perfectly periodic field of exclusions on the integers, with period \(p\). The sieve, at any finite stage, is the product (equivalently: the pointwise AND) of these fields. Crucially, the *new* information contributed by each successive prime is not the whole periodic field — it is only the part of that field that is *orthogonal* to the exclusion fields of all smaller primes.

Once this is stated precisely, three things happen almost for free:

1. **Density becomes multiplicative.** The fraction of survivors after incorporating \(p_k\) is the previous fraction scaled by \((1 - 1/p_k)\). This is not new — it is the Mertens product — but the *mechanism* by which it happens becomes transparent: each new periodic field removes a fixed proportion of whatever remains, independent of the fine structure of what remains.

2. **Entropy becomes additive.** Because the combined period \(L_k = p_1 p_2 \cdots p_k\) decomposes, via the Chinese Remainder Theorem, as a product \(\mathbb{Z}/L_k\mathbb{Z} \cong \mathbb{Z}/p_1\mathbb{Z} \times \cdots \times \mathbb{Z}/p_k\mathbb{Z}\), the sieve pattern over one period is literally a product distribution over independent coordinates. The Shannon entropy of a product distribution is the sum of the marginal entropies — so the entropy of the sieve is exactly the sum, over primes, of the entropy contributed by each prime's residue coordinate. (Here "entropy" refers to the joint entropy of the independent per-prime indicators; other entropy-like quantities are discussed in Section 4.)

3. **The sieve has an exact finite Fourier expansion, and each prime's contribution is spectrally disjoint from every other prime's *nonzero-frequency* contribution.** This is the least obvious and, we will argue, the most novel part of the picture: the sieve is not just periodic, it is a sum of harmonics, and the harmonics can be partitioned by which prime "owns" them — except at the single shared DC frequency. In the limit, this produces an infinite Fourier-type series whose support structure encodes the primes — a genuine frequency-space representation of primality.

The remainder of this paper develops each of these points carefully, discusses precedents in the literature, and closes with a survey of applications and interpretive directions, including a deliberately provocative but mathematically grounded "wave–particle duality" reading of the construction.

---

## 2. Construction: Orthogonal Periodic Exclusion Fields

### 2.1 The single-prime field

For a prime \(p\), define the periodic mask

\[
M_p(n) = \begin{cases} 0 & n \equiv 0 \pmod{p} \\ 1 & \text{otherwise.} \end{cases}
\]

This is a period-\(p\) function on \(\mathbb{Z}\): \(M_p(n + p) = M_p(n)\) for all \(n\). It is the "field of nonprimes" that \(p\) emits — a perfectly periodic exclusion pattern with exactly one dead residue class per period, out of \(p\) classes total.

### 2.2 Stacking fields and the orthogonality condition

Given the first \(k\) primes \(p_1, \ldots, p_k\), the naive combined sieve is the pointwise product

\[
S_k(n) = \prod_{i=1}^{k} M_{p_i}(n).
\]

Because the \(p_i\) are pairwise coprime, \(S_k\) is periodic with period

\[
L_k = \operatorname{lcm}(p_1, \ldots, p_k) = p_1 p_2 \cdots p_k.
\]

This is the first structural fact worth pausing on: *the sieve is always exactly periodic, at every finite stage*, with a period that grows as the primorial of the primes incorporated so far. There is no asymptotic approximation here — within one block of length \(L_k\), the pattern of survivors repeats exactly forever.

Now consider what is genuinely *new* when we move from stage \(k-1\) to stage \(k\), i.e. when we incorporate \(p_k\). The mask \(M_{p_k}\), taken in isolation, kills every \(n \equiv 0 \pmod{p_k}\). But many of those positions are already dead — killed by some smaller prime. The *new* contribution of \(p_k\) is only the set of positions that \(p_k\) kills for the first time:

\[
C_k = \left\{ n \in [1, L_k] : n \equiv 0 \pmod{p_k},\ \ n \not\equiv 0 \pmod{p_i} \text{ for all } i < k \right\}.
\]

This is the sense in which \(p_k\)'s contribution is **orthogonal** to the lesser primes: \(C_k\) is disjoint, by construction, from the union of all earlier kill-sets. It is still a perfectly periodic set — periodic with period \(L_k\) — it is simply a *longer-period* pattern than \(p_k\)'s raw period-\(p_k\) mask, because it has been filtered through the residues already excluded by \(p_1, \ldots, p_{k-1}\).

### 2.3 Algorithmic restatement

This gives a clean recursive construction of the sieve, equivalent to Eratosthenes but explicit about periodicity at every step:

1. Initialize \(P = [\,]\), \(L_0 = 1\), and a trivial pattern (everything alive) on \([1, L_0]\).
2. For each new prime \(p_k\) (found as the smallest surviving integer greater than 1 at the current stage):
    - Set \(L_k = L_{k-1} \cdot p_k\).
    - Lift the current pattern from period \(L_{k-1}\) to period \(L_k\) by repetition (\(p_k\) copies).
    - Kill every position \(n \in [1, L_k]\) with \(n \equiv 0 \pmod {p_k}\) that is *still alive* under the lifted pattern. This is exactly \(C_k\).
3. The survivors greater than 1 in \([1, L_k]\), once the sieve has been carried out to a sufficient bound, are precisely the primes.

This is nothing more than the sieve of Eratosthenes — but re-expressed so that periodicity and orthogonality are load-bearing, explicit structural claims rather than incidental procedural facts.

### 2.4 CRT reading

The reason the orthogonality condition is so clean is the Chinese Remainder Theorem: since the \(p_i\) are distinct primes,

\[
\mathbb{Z}/L_k\mathbb{Z} \;\cong\; \mathbb{Z}/p_1\mathbb{Z} \times \mathbb{Z}/p_2\mathbb{Z} \times \cdots \times \mathbb{Z}/p_k\mathbb{Z}.
\]

Every residue \(n \bmod L_k\) corresponds to a unique tuple of residues \((n \bmod p_1, \ldots, n \bmod p_k)\). The mask \(M_{p_i}\) depends *only* on the \(i\)-th coordinate of this tuple. So the global sieve pattern

\[
S_k(n) = \prod_{i=1}^k M_{p_i}(n)
\]

is literally a product of functions, each depending on a single, independent CRT coordinate. This single fact is the reason density becomes multiplicative and entropy becomes additive — both are standard consequences of working with a product measure over independent coordinates. The prime sieve, reframed this way, is a set of independent coordinate functions on a product space, not a monolithic pattern.

---

## 3. Density: A Multiplicative Attenuation Process

The density of survivors in \([1, L_k]\) is immediate from the product structure:

\[
\rho_k = \frac{\#\{n \in [1, L_k] : S_k(n) = 1\}}{L_k} = \prod_{i=1}^{k} \left(1 - \frac{1}{p_i}\right).
\]

This is the classical Mertens product (itself a refinement of Legendre's sieve). What the orthogonal-fields framing adds is not a new formula but a new *reading* of the formula: density updates locally and multiplicatively,

\[
\rho_k = \rho_{k-1} \left(1 - \frac{1}{p_k}\right),
\]

because each new prime removes a fixed fraction of *whatever survives so far*, regardless of the internal structure of the survivor set. This is exactly the "attenuation" picture: each periodic field is an independent filter, and independent filters compose multiplicatively in the fraction of signal they pass through. No recomputation of the whole pattern is conceptually necessary — only the marginal effect of the new filter.

---

## 4. Entropy: An Additive Information Process

Because \(S_k\) factors over independent CRT coordinates, the sieve pattern over one period can be treated as a product distribution, and the Shannon entropy of a product distribution is the sum of the marginal entropies. However, some care is needed with the word "entropy," as several distinct quantities are easily conflated.

For a single coordinate \(\mathbb{Z}/p\mathbb{Z}\), the "alive/dead" split induced by \(M_p\) has probabilities \(1/p\) (dead) and \((p-1)/p\) (alive). The **marginal entropy of that single coordinate** is

\[
H(p) = -\left(\frac{1}{p}\log\frac{1}{p} + \frac{p-1}{p}\log\frac{p-1}{p}\right).
\]

Because the \(k\) coordinates are independent under the CRT, the **joint entropy** of the \(k\) per-prime alive/dead indicators is exactly additive:

\[
H_{\text{joint}}(k) = \sum_{i=1}^{k} H(p_i).
\]

This is the quantity that the earlier informal statement "entropy becomes additive" refers to. It is not the entropy of the single binary output \(S_k(n)\). That output entropy is

\[
H_{\text{out}}(k) = -\rho_k\log\rho_k - (1-\rho_k)\log(1-\rho_k),
\]

and because \(\rho_k \to 0\) for large \(k\), this tends to zero. The sieve pattern does not become "more random" in the sense of its one-bit output; rather, it becomes increasingly imbalanced (almost all positions are dead), so the output bit is increasingly predictable.

Additionally, the measure of the underlying residue \(n\) itself corresponds to \(\log L_k\) bits (or \(L_k\) equiprobable states). This is a separate information-theoretic measure and should not be confused with either \(H_{\text{joint}}\) or \(H_{\text{out}}\). Finally, the descriptive (Kolmogorov) complexity of the pattern is yet another currency: the per-prime product representation is compact, but reconstructing any particular position still requires knowing the residue coordinates, which we discuss in Section 8.5.

Two derived quantities are worth naming:

- **Entropy density** (joint entropy per integer over the period):
  \[
  h_k = \frac{H_{\text{joint}}(k)}{L_k} = \frac{1}{L_k}\sum_{i=1}^{k} H(p_i).
  \]
  Since \(L_k\) grows super-exponentially (as a primorial) while \(H_{\text{joint}}(k)\) grows only linearly in \(k\) (and each term shrinks like \(\log p_i / p_i\)), \(h_k \to 0\) rapidly. The sieve pattern becomes overwhelmingly *structured* — low joint entropy per position — relative to its period, even though the absolute amount of joint entropy keeps growing.

- **Marginal entropy contribution** of the \(k\)-th prime:
  \[
  \Delta h_k = H(p_k) \sim \frac{\log p_k}{p_k} \quad (p_k \to \infty),
  \]
  a strictly decreasing sequence. Early primes (2, 3, 5) inject comparatively large amounts of entropy into the joint distribution; later, larger primes inject vanishingly small amounts. This gives a natural, quantitative sense in which "small primes matter more" to the local statistical texture of the sieve, even though every prime matters equally to which specific integers end up marked as composite.

---

## 5. The Spectral Decomposition: An Infinite Series for the Primes

This is the least classical part of the construction, but it requires a careful correction: the per-prime spectra are not disjoint at all frequencies; they all share the zero (DC) frequency. The correct statement is that their **nonzero-frequency supports are disjoint**, and this is best expressed via the CRT-dual factorization.

### 5.1 Fourier expansion of a single mask

Since \(M_p\) is periodic (lifted to period \(L_k\)), it has a finite discrete Fourier expansion:

\[
M_p(n) = \sum_{m=0}^{L_k - 1} c_{p,m}\, e^{2\pi i m n / L_k}.
\]

Each per-prime mask \(M_p\) has average value \((p-1)/p\), so its coefficient at \(m=0\) is \(c_{p,0} = (p-1)/p\). Thus every prime contributes to the same DC term, and no disjointness is possible there.

For \(m \neq 0\), however, the support of \(c_{p,m}\) is precisely the set of frequencies that are multiples of \(L_k/p\) but not multiples of \(L_k\) — i.e., the harmonics of the prime's native period, excluding the DC component. Because the \(p_i\) are distinct primes, these nonzero supports are disjoint: a frequency \(m\) that is a nonzero multiple of \(L_k/p_i\) cannot also be a nonzero multiple of \(L_k/p_j\) for \(i \neq j\). This is the frequency-domain expression of orthogonality: **disjoint nonzero spectral support**, not merely disjoint kill-sets in position space.

### 5.2 The global sieve as a product of spectra — and a convolution

The combined sieve is

\[
S_k(n) = \prod_{i=1}^{k} M_{p_i}(n) = \prod_{i=1}^{k}\left(\sum_{m} c_{p_i,m}\, e^{2\pi i m n/L_k}\right).
\]

Because multiplication in position space corresponds to **convolution** in frequency space, the coefficients of \(S_k\) are not obtained by simply summing per-prime coefficients. Instead, they arise from the convolution of the individual coefficient sequences. The clean statement uses the CRT-dual indexing: rather than a single frequency index \(m \in \{0,\ldots,L_k-1\}\), we index frequencies by tuples \((m_1,\ldots,m_k)\) with \(m_i \in \mathbb{Z}/p_i\mathbb{Z}\), via the isomorphism \(\widehat{\mathbb{Z}/L_k\mathbb{Z}} \cong \widehat{\mathbb{Z}/p_1\mathbb{Z}} \times \cdots \times \widehat{\mathbb{Z}/p_k\mathbb{Z}}\). Then

\[
C_{(m_1,\ldots,m_k)} = \prod_{i=1}^k \hat M_{p_i}(m_i),
\]

where \(\hat M_{p_i}\) is the discrete Fourier transform of \(M_{p_i}\) on \(\mathbb{Z}/p_i\mathbb{Z}\). This factorization is exact and replaces the earlier informal "interleaving" language.

Under this dual indexing, the support of each prime's nonzero coefficients appears only in coordinates where \(m_i \neq 0\). Distinct primes influence distinct coordinates; their nonzero contributions are disjoint in the tuple space. The single shared DC term corresponds to the tuple \((0,\ldots,0)\), where every coordinate contributes \((p_i-1)/p_i\).

### 5.3 Passing to the limit: a prime spectrum in the profinite integers

Taking \(k \to \infty\) formally requires a rigorous ground. The natural ambient space is the **profinite integers**

\[
\widehat{\mathbb{Z}} = \varprojlim_k \mathbb{Z}/L_k\mathbb{Z},
\]

equipped with the profinite topology and its Haar probability measure. This is the standard inverse limit of the finite CRT groups. Its Pontryagin dual is the discrete group \(\mathbb{Q}/\mathbb{Z}\), so the Fourier transform of a function on \(\widehat{\mathbb{Z}}\) is a function on \(\mathbb{Q}/\mathbb{Z}\) — not on a single integer frequency axis.

In this limit, the finite product \(S_k\) converges (in the Haar-\(L^2\) sense) to a function \(S\) on \(\widehat{\mathbb{Z}}\), and its Fourier transform is a function on \(\mathbb{Q}/\mathbb{Z}\). Each prime \(p\) contributes a specific, localized set of frequencies in \(\mathbb{Q}/\mathbb{Z}\), and these sets are disjoint except for the zero element. One can then define a frequency-indexed object that encodes the per-prime contributions, legitimately called a **prime spectrum**, but its domain is this profinite dual, not the rational multiples of a single infinitely long period.

This is the precise sense in which the construction is "an infinite series for the primes in frequency space": not a metaphor, but a literal finite-then-limiting Fourier decomposition in which each prime is a spectral generator with identifiable, disjoint nonzero support.

---

## 6. Relation to Existing Literature

It is important to be precise about what in this picture is classical and what, to the best of our knowledge, is a new synthesis.

**Classical / well precedented:**
- The Mertens product for the density of integers coprime to the first \(k\) primes is a foundational and thoroughly studied result in analytic number theory (Legendre, Mertens).
- The entropy of multiplicative arithmetic functions (Möbius, Liouville, squarefree indicators) has been studied, generally in a probabilistic or ergodic-theoretic framework (e.g., Cramér's model, Kubilius' work on weakly dependent arithmetic functions).
- **Ramanujan–Fourier expansions** of arithmetic functions (Ramanujan, Carmichael, Wintner; see also Gadiyar & Padma for twin primes) provide the canonical Fourier-analytic treatment of functions defined via prime-divisibility rules, and are a direct antecedent of the spectral decomposition in Section 5.
- CRT-based dynamical systems on \(\mathbb{Z}/N\mathbb{Z}\) for highly composite or primorial \(N\) appear in dynamical systems and ergodic theory literature.
- Fourier and spectral analysis of prime-indicator-like functions and sieve weights appears throughout sieve theory and analytic number theory, especially in connection with the large sieve, exponential sums, and the explicit formula relating primes to zeta zeros.
- The **circle method** (Hardy–Littlewood) and its singular series express local densities as products over primes, precisely encoding the same CRT-local independence used here.
- **Wheel factorization** (Pritchard and standard sieve engineering practice) is the computational embodiment of the compact periodic representation of the first \(k\) primes; it is essentially the algorithm of Section 2.3, and the "compression" idea of Section 8.5 is a rediscovery of this well-known technique.
- The **Good–Thomas Prime-Factor FFT** is a CRT-based tensor factorization of the discrete Fourier transform, structurally identical to the CRT-dual factorization used in Section 5.2 to separate per-prime spectral supports.

**What appears to be a genuine — though modest — new synthesis:**
- The explicit treatment of each prime as an *orthogonal periodic projector* acting on a growing CRT product space, with the orthogonality condition stated combinatorially (each prime's contribution is the newly-killed residue set, disjoint from all previous kill-sets) rather than as an approximation.
- The resulting *exact* (not asymptotic) multiplicative density recursion read as a filter-attenuation process, with each prime as an independent filter stage.
- The *additive* entropy decomposition, derived directly from the CRT product structure rather than from an independence assumption imposed probabilistically — here, independence is a structural fact (product measure on independent coordinates), not a modeling approximation. (The additive decomposition refers to the joint entropy of the per-prime indicators.)
- The claim that each prime's exclusion field has **spectrally disjoint nonzero support** in the finite Fourier expansion of the sieve indicator, and the resulting notion of a frequency-indexed "prime spectrum" built additively, prime by prime — with the explicit caveat that all primes share the DC term.
- The interpretive unification of all of the above as a single renormalization-style flow: adding a prime simultaneously (a) extends the period, (b) multiplicatively reduces density, (c) additively increases joint entropy, and (d) injects new, disjoint nonzero harmonics into the spectrum.

We are not aware of a source that assembles these observations into a single structural lens in the way presented here, although we note that sieve theory is a vast field and it is possible that isolated pieces of this picture exist under different terminology (for instance, in the study of "sieve weights" in Selberg's sieve, or in the Fourier-analytic treatment of the Möbius function used in some proofs related to the Prime Number Theorem). The contribution of this paper is the *unification for expository and pedagogical purposes*, not the invention of any single piece in isolation.

---

## 7. Interpretation: Wave–Particle Duality on the Prime Field

It is tempting — and, we argue, mathematically defensible rather than merely cute — to describe this construction as exhibiting a wave/particle duality. However, this duality should be understood as an informal interpretive device, not a claim of physical or arithmetic deep structure.

**Particle picture (position space).** In the integers, primes are discrete, isolated points. Their spacing is irregular; locally they look unpredictable; globally they thin out according to the Prime Number Theorem. This is the classical, "particle-like" view of primes: discrete objects with a statistical but not exact local law.

**Wave picture (frequency space).** In the Fourier decomposition above, each prime is instead a pure periodic generator — a tone with a specific, computable frequency (multiples of \(L/p\), except DC) and a specific amplitude. There is nothing irregular about a single prime's contribution in frequency space: it is exactly periodic, exactly localized to its own nonzero harmonic comb, and exactly orthogonal to every other prime's nonzero contribution.

**Duality.** The *same* object — the sieve indicator function — is irregular and particle-like when read in position space, and regular, structured, and wave-like when read in frequency space. The passage between the two pictures is literally a Fourier transform. Prime gaps, in this reading, are not primitive facts about primes; they are **interference patterns** produced by the superposition of many pure periodic waves, one per prime. A large gap is a stretch of destructive interference (many small-prime waves happening to align to exclude a long run of integers); a small gap (e.g., twin primes) is a stretch where the waves fail to align.

This duality is not merely decorative. It suggests several concrete lines of analysis, taken up in the next section — while also inviting caution, as discussed in Section 8.7, about conflating these rational CRT frequencies with the zeta zeros.

---

## 8. Uses, Insights, and Directions for Further Work

**8.1 Spectral fingerprint of a prime.** Each prime \(p\) can be assigned a canonical, computable set of nonzero harmonics (\(L/p\) and its multiples, within any fixed period \(L\) divisible by \(p\)) and an amplitude. This gives a "spectral fingerprint" that could, in principle, be used to measure how much spectral complexity a given prime contributes relative to its size.

**8.2 Prime gaps as interference.** Reframing gaps as interference phenomena between periodic exclusion waves suggests studying gap statistics via spectral/interference methods (constructive vs. destructive alignment of small-prime waves) rather than purely combinatorially. This is a plausible bridge between sieve methods and Fourier/harmonic analysis of gap distributions. However, one must distinguish between the *local* interference from small primes and the deeper, unresolved arithmetic of long gaps.

**8.3 Density as attenuation; entropy as information flow.** The multiplicative density recursion and additive joint-entropy decomposition give two independent, exactly computable "flows" indexed by the sequence of primes. Studying the joint behavior of \(\rho_k\) (density) and \(H_{\text{joint}}(k)\) (entropy) as \(k \to \infty\) — e.g., the rate at which entropy density \(h_k\) collapses to zero relative to the rate at which \(\rho_k\) decays via Mertens — offers a concrete, fully computable toy model of "structure vs. randomness" trade-offs, potentially useful pedagogically or as a sandbox for information-theoretic heuristics about prime distribution.

**8.4 Renormalization-flow reading.** Each step of incorporating a new prime (a) rescales the period by a factor \(p_k\), (b) attenuates density by \((1 - 1/p_k)\), (c) adds a fixed increment of joint entropy \(H(p_k)\), and (d) injects a new, disjoint comb of nonzero harmonics. This four-fold simultaneous update has the shape of a renormalization-group step: a rescaling of scale, an update to a coupling-like quantity (density), an entropy increment, and new modes appearing at finer resolution. Whether this analogy can be made precise enough to import RG techniques (fixed points, flow equations) is an open question, but the structural resemblance is suggestive — and must be treated as metaphor until a rigorous mapping is found.

**8.5 Compression — and its limitations.** Because each prime's exclusion field is periodic and can be represented compactly (a period and a single excluded residue class, or equivalently a short list of Fourier coefficients), the sieve up to a given bound can be represented as a product/composite of compact per-prime objects rather than as an explicit bit array. This is a form of structured compression that reconstructs the full sieve pattern on demand at any scale. **However**, this is precisely the idea behind **wheel factorization**, a standard technique in computational number theory since at least the 1980s (Pritchard). The compact representation is not a new compression algorithm; it is the wheel data structure. Moreover, using it to test a single integer \(n\) for primality requires checking divisibility by each prime in the basis — i.e., trial division. For enumerating primes up to \(N\), the storage and update costs of the full period \(L_k\) grow doubly exponentially (by the prime number theorem, \(L_k \approx e^{(1+o(1))p_k}\)), so materializing full periods is infeasible for more than a handful of primes. Standard segmented Eratosthenes (\(O(N \log \log N)\)) and Atkin's sieve are strictly more practical. Thus the "compression" idea is conceptually valid but computationally inferior to existing methods; its value is expository, not algorithmic.

**8.6 A frequency-space object worth naming.** The CRT-dual function on \(\mathbb{Q}/\mathbb{Z}\) defined in Section 5.3 — call it \(P(\chi) = \sum_p \hat M_p(\chi)\) — is a legitimate frequency-indexed encoding of which primes contribute which harmonics. Studying its support, decay, and correlation properties might offer a genuinely new descriptive statistic for prime distribution, complementary to (though clearly related to) classical exponential-sum and zeta-function approaches. This object lives on the profinite dual, not on the real line, and its properties are different in kind from the zeta zeros.

**8.7 Caution regarding RH-adjacent speculation — strengthened.** It is tempting to reach for a connection to the Riemann Hypothesis, given that both the explicit formula and this construction relate primes to frequency-like data. We flag this only as a speculative direction, not a claim, and we now add two specific reasons for caution beyond the surface-level resemblance:

1. The harmonics here are indexed by rational points in \(\mathbb{Q}/\mathbb{Z}\) — a purely combinatorial/CRT structure — whereas the zeta zeros are transcendental frequencies tied to the analytic continuation of \(\sum n^{-s}\). The two frequency sets are categorically different.
2. The natural dynamical system underlying this construction is the **profinite odometer** \(n \mapsto n+1\) on \(\widehat{\mathbb{Z}}\), which is a textbook example of a **zero-entropy, equicontinuous** dynamical system. By contrast, the Möbius function (and the prime counting function) is conjectured to exhibit pseudorandomness compatible with **Sarnak's Möbius Disjointness Conjecture**, which asserts that the Möbius function is orthogonal to *all* zero-entropy deterministic sequences. If the primes were fully captured by this sieve construction, they would be too regular to be orthogonal to zero-entropy systems. Hence there are principled dynamical reasons why this exact construction **cannot** capture the fine pseudorandomness of the primes, and cannot serve as a step toward Hilbert–Pólya-style spectral interpretations of the zeta zeros. This is a sharp, citable obstruction to RH-adjacent optimism.

**8.8 Pedagogical value.** Despite the computational and spectral caveats, the reframing of density as attenuation, CRT as independence, and entropy additivity remains a clear and useful teaching device for Mertens' theorem, the Chinese Remainder Theorem, and Shannon entropy in a single coherent example. This is the document's most defensible contribution.

---

## 9. Conclusion

Reframing the sieve of Eratosthenes as a stack of orthogonal periodic exclusion fields — one per prime, each contributing only the residues not already excluded by smaller primes — turns a procedural algorithm into a structured algebraic and analytic object. This reframing is not merely notational: it makes the classical Mertens density product mechanistically transparent as a multiplicative attenuation process, it exposes an exact additive entropy decomposition rooted in the CRT product structure of \(\mathbb{Z}/L_k\mathbb{Z}\) (for the joint entropy of the independent per-prime indicators), and — with the necessary correction — it yields an exact finite Fourier decomposition of the sieve in which each prime's contribution occupies disjoint nonzero spectral support, while all primes share the single DC term. In the limit, properly grounded in the profinite integers \(\widehat{\mathbb{Z}}\) and its dual \(\mathbb{Q}/\mathbb{Z}\), this produces a genuine frequency-space representation of the primes: an infinite series whose harmonics are contributed, one disjoint nonzero comb at a time, by each prime in turn.

We have argued that while individual ingredients of this picture have precedents (Mertens' theorem, entropy of arithmetic functions, CRT dynamics, sieve-theoretic Fourier methods, Ramanujan–Fourier expansions, wheel factorization, and the circle method), the specific unification presented here — density as multiplicative attenuation, entropy as additive information flow, and primality as a disjoint-support (nonzero) Fourier series, all governed by a single notion of orthogonal periodic projectors — has not, to our knowledge, been previously articulated as a single structural lens for **expository purposes**. The paper is best read as a pedagogical synthesis of classical results, not as a claim of new mathematical or computational discovery. The more speculative directions (interference-based gap analysis, a renormalization-flow interpretation, RH-adjacent spectral heuristics) remain exactly that — speculative — and must be pursued with the limitations made explicit in Sections 8.7–8.8.

Whether or not the speculative directions prove fruitful, the core construction stands on its own as a clean, exact, and pedagogically useful reformulation of one of the oldest algorithms in mathematics.