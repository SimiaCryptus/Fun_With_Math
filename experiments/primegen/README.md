# The Prime Sieve as a Stack of Orthogonal Periodic Fields

I recently finished building an interactive page around the oldest nontrivial algorithm in mathematics, and the thing that kept surprising me is how much structure appears once you stop treating the sieve as a procedure and start treating it as an object. The page is not a library, not a benchmark, and not a new prime-finding tool; it is an interactive essay, intended for anyone who wants to see the periodic machinery underneath the primes rather than simply enumerate them.

## What You Are Looking At

The central idea is that every prime <em>p</em> emits a perfectly periodic exclusion field <em>M<sub>p</sub></em> that kills exactly the multiples of <em>p</em>. When you stack the first <em>k</em> of these fields together, their combined period is the primorial

<div style="text-align:center"><em>L<sub>k</sub> = p<sub>1</sub> p<sub>2</sub> ··· p<sub>k</sub></em>.</div>

The sieve is the pointwise product of the individual masks. The crucial part, and the part the visualization makes explicit, is that the genuinely new information contributed by prime <em>p<sub>k</sub></em> is not its raw periodic field; it is the subset of multiples that no smaller prime would have killed anyway. I call that subset <em>C<sub>k</sub></em>, the orthogonal component of <em>p<sub>k</sub></em>.

Because the primes are coprime, the Chinese Remainder Theorem turns each position into an independent tuple of residues — one coordinate per prime. From that single fact, several properties fall out cleanly: survivor density updates as a multiplicative attenuation, joint entropy of the per-prime indicators is exactly additive, and the finite Fourier decomposition of the sieve acquires a neat spectral anatomy.

## The Interface at a Glance

The page is organized around a set of linked panels; almost every control feeds into more than one view, which is deliberate — the point is to build intuition by cross-reference rather than by reading a single plot.

- **Prime-by-prime components** — Clicking a prime highlights its raw field <em>M<sub>p</sub></em>, the newly killed set <em>C<sub>k</sub></em>, and the survivors that remain at that stage. This is the heart of the orthogonality idea; a smaller prime may create a dead cell, but each dead cell has exactly one owner.

- **Sieve stack in position space** — A row per prime shows the full periodic field faintly and the orthogonal contribution brightly, with the bottom row giving the survivors. I think of this as the particle picture: primes are discrete, irregular holes in the integer line.

- **Prime spectrum in frequency space** — Each prime contributes a comb of nonzero harmonics at rational frequencies <em>m/p</em>, with amplitude <em>1/p</em>; distinct primes occupy disjoint nonzero spectral support, while all share a single DC component. This is the wave picture, and it is the most unexpected part of the project. Multiplication in position space becomes convolution in frequency space, but the CRT-dual indexing keeps the per-prime supports cleanly separated.

- **Interference field** — The divisibility indicator <em>[p | n]</em> is literally a sum of cosines per prime. Summing a few harmonics from each basis prime produces a signal whose ripples sharpen into spikes at composites as you add more primes; the remaining exact zeros are the survivors.

- **Density and entropy flows** — The survivor density follows the Mertens product, while the joint entropy of the independent per-prime indicators grows additively; the per-prime entropy increment <em>H(p<sub>k</sub>)</em> decays like <em>log p<sub>k</sub> / p<sub>k</sub></em>. The visualization lets you watch both flows move as the basis changes.

- **CRT product structure** — A small canvas plots two coordinates of the product space <em>ℤ/L<sub>k</sub>ℤ ≅ ∏ ℤ/p<sub>i</sub>ℤ</em>, making the independence of the residue coordinates concrete.

- **Survivor gaps** — A histogram of gaps among wheel survivors in the selected window gives a local view of how interference between small primes bunches the remaining positions.

## A Brief Background

Eratosthenes' sieve is usually stated as a crossing-out recipe. That statement is complete, but it buries the fact that the combined pattern is exactly periodic at every stage, with a period that grows as the primorial of the primes already included. This periodicity is not an approximation; a block of length <em>L<sub>k</sub></em> repeats forever until a larger prime is installed to break the symmetry.

The pieces of this view are not new. The Mertens product for survivor density, the CRT factorization of the residue lattice, and Fourier expansions tied to divisibility all have long histories; wheel factorization in practical sieving is essentially the compact periodic representation described here. What the project attempts is a synthesis — to put the pieces in one place, link them through the same orthogonal-field language, and let the reader adjust the basis interactively.

## Why This Is Interesting

The most useful thing here is not faster computation; it is conceptual unification. Four apparently different facts become one mechanism:

- Density is multiplicative because each independent filter attenuates whatever survives before it; <em>ρ<sub>k</sub> = ρ<sub>k−1</sub>(1 − 1/p<sub>k</sub>)</em>.
- Entropy is additive because the CRT coordinates are independent; the joint entropy is exactly the sum of the marginal <em>H(p<sub>k</sub>)</em>.
- Spectral supports are disjoint except at DC because each prime's native harmonic comb occupies a different set of nonzero frequencies.
- Prime gaps can be read as interference patterns: a large gap is a run of constructive destructive alignment among small-prime waves; a twin prime is a place where the waves fail to align.

There is also something pleasantly honest about the display: it shows the primes as exceptions in an expanding periodic lattice, not as random points that merely happen to survive a messy procedure. Each new prime is a break in the current symmetry, but it immediately becomes a fresh generator of the next, larger symmetry.

## Who Might Find It Useful

- Students and educators in number theory: the page gives a direct visual handle for CRT, Mertens' product, and the periodicity of the sieve.
- People interested in Fourier analysis or signal processing: it is a concrete discrete spectrum built from rational frequencies, without the usual abstraction of a continuous transform.
- Information-theory-curious learners: the additive entropy decomposition is an exact toy model of how independent coordinates compress into a structured pattern.
- Visual thinkers who already know the usual prime-generation algorithms and want to see the underlying lattice rather than another benchmark.

It is probably not the page for someone who needs a production prime generator; standard segmented sieves remain the right tool for bulk enumeration. The value here is architectural, and for that it is aimed at the reader who wants to understand rather than to optimize.

## Honest Caveats

The visualization is a pedagogical object; it does not claim to compute primes faster than a segmented sieve, and the compact representation it reveals is essentially wheel factorization. The frequencies are rational points of <em>ℚ/ℤ</em>, not zeta zeros, and the underlying dynamical system is a zero-entropy profinite odometer; those are categorically different from the transcendental spectral objects that appear in Riemann Hypothesis-adjacent heuristics. In other words, the page is a clean way to see the periodic order of the primes, but it is not a secret path to the fine pseudorandomness of the primes.

## More Soon

I'm curious whether this framing helps others see the primes as less random and more like an expanding lattice with predictable, locally broken symmetries. If the wave picture clicks for you, or if you find a control that should behave differently, I'd love to hear about it.
