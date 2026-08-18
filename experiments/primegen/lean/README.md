# Lean companion to `paper.md`

Lean 4 + Mathlib. Build with `lake exe cache get && lake build`.
The development is `sorry`-free; every claim below is checked by the kernel.

## What is proved

| paper claim                       | Lean name                                                             | file              |
| --------------------------------- | --------------------------------------------------------------------- | ----------------- |
| O1 ownership `Θ_p = p·A_p`        | `theta_eq_image`                                                      | `Ownership.lean`  |
| orthogonality (disjointness)      | `theta_disjoint`, `exists_unique_owner`                               | `Ownership.lean`  |
| O2 phase separation               | `prime_of_rough_of_lt_sq`                                             | `Ownership.lean`  |
| `min Θ_p = p²`                    | `sq_mem_theta`, `sq_le_of_mem_theta`                                  | `Ownership.lean`  |
| C1 causality (no lookahead)       | `causality`, `mult_le_half`                                           | `Ownership.lean`  |
| §4.2 wheel successor spec         | `Wheel.lt_nextCoprime`, `coprime_nextCoprime`, `nextCoprime_le`       | `Wheel.lean`      |
| A1 stream tree / one-touch        | `AlgA.exists_unique_split`, `AlgA.sigma_disjoint`                     | `AlgorithmA.lean` |
| B1 coverage                       | `AlgB.coverage`                                                       | `AlgorithmB.lean` |
| keys are composite (B3 soundness) | `AlgB.not_prime_of_claims`                                            | `AlgorithmB.lean` |
| B2 no early claims, `≥ p²` heads  | `AlgB.Inv.ahead` preserved by `AlgB.inv_step`; `AlgB.sq_le_of_claims` | `AlgorithmB.lean` |
| B3 decision rule (kernel)         | `AlgB.emit_iff`, `AlgB.prime_iff_forall_not_claims`                   | `AlgorithmB.lean` |
| deferred activation is complete   | `AlgB.inv_step` (`complete` field), `AlgB.inv_init`                   | `AlgorithmB.lean` |
| B5 duplicate accounting §4.5      | `AlgB.claims_iff`, `AlgB.mem_claimants`                               | `AlgorithmB.lean` |
| W window occupancy (statement)    | `Twin.WindowAt`, `Twin.Window`, `Twin.windowAt_of_twin`               | `Twin.lean`       |
| TP7 `W ⟹ TPC`                     | `Twin.infinite_twins_of_window`, `Twin.exists_twin_ge`                | `Twin.lean`       |
| TP0 containment (rough half)      | `Twin.rough_pair_of_twin`                                             | `Twin.lean`       |
| TP8(a) no copy dies twice         | `Twin.deleted_tiles_ne`, `Twin.deleted_tiles_ne_tile`                 | `Twin.lean`       |
| TP8(b) deletion offset `δ_k`      | `Twin.deleted_tile_offset`, `Twin.deleted_tile_offset_eq`             | `Twin.lean`       |
| TP1, prime-modulus factor `p − 2` | `Twin.pairLattice_prime`, `Twin.card_pairLattice_prime`               | `Twin.lean`       |

Two facts are worth singling out, because they are the paper's structural claims and nothing else:

- `AlgA.exists_unique_split` is the "pops == composites" certificate of §3.4 in mathematical
  form: _exactly one_ `(b, q)` per composite.
- `AlgB.claims_iff` says the claimant set of a `W`-coprime composite `m` is precisely
  `{p prime : p ∣ m, p² ≤ m}`. Every duplicate the wheeled relaxation pays for is accounted
  here; §4.5's `κ_W · N · (ln ln √N − ln ln p_w)` is the sum of these cardinalities.
- `Twin.infinite_twins_of_window` is `twin_prime.md`'s Claim TP7, and its proof is three lines:
  apply `prime_of_rough_of_lt_sq` to each coordinate. The promotion recursion appears nowhere,
  which is exactly the period–window dichotomy of `twin_prime.md` §5 made machine-visible — the
  certified window carries all of the primality content, and the exact period-wide counts carry
  none of it.
  Formalising the statement of Claim W also turns up an edge case the prose glosses: W as literally
  stated ("for every prime `p`") is false at `p = 2`, since the window `[2, 4)` is too short to hold
  a pair at distance 2 (`Twin.not_windowAt_two`). `Twin.Window` therefore quantifies over `p > 2`,
  which is all TP7 consumes.

## What is _not_ proved (deliberately)

- **Conjecture X1** (no O(1)-time, polylog-space `NextRough`) and **Conjecture A4**
  (`S(N) = N^{θ+o(1)}`) — open, and out of scope for a formalisation.
- All cost statements: `ops(N)`, `O(N log log N)`, `S(N)`, the comparison table of §6. These are
- **Claim W** itself, and **Conjecture TP-J** (`g_2(P_k) ≪ log² P_k`): open, and `W ⟹ TPC`, so
  not lemmas one proves on the way to anything. `Twin.lean` states W and proves only the
  implication; `Twin.windowWitnesses` computes witnesses for small primes.
- The **full TP1 recursion** `T_{k+1} = (p_{k+1} − 2)·T_k`. The per-prime factor is proved
  (`Twin.card_pairLattice_prime`); joining the stages needs CRT counting over `ZMod (P·p)`, which
  is mechanical but unwritten. The recursion is checked numerically by `#eval` instead.
  asymptotics about running times, not statements about the objects defined here.
- The **outer induction** for Algorithm B: "the emitted list equals the primes below `n`". The
  per-candidate decision (`emit_iff`) and the invariant preservation (`inv_step`, `inv_init`)
  are proved; wiring them into a loop invariant over the whole run needs the self-hosting
  argument (every `p ≤ √n'` has already been emitted, which is `causality`/Bertrand again) and
  is the obvious next piece of work.
- Algorithm A's queue mechanics (§3.3), the bucket priority queue (§5.1) and segment restart
  (§4.6). Restart is a one-line consequence of `Wheel.nextCoprime_le` plus `AlgB.Inv.minimal`,
  but the segmented driver itself is unformalised.

## Modelling notes

- `Rough p m` is stated in the bounded form `∀ q < p, prime q → ¬ q ∣ m`, which is decidable and
  equivalent (`rough_iff`) to "every prime factor is `≥ p`".
- `Wheel.nextCoprime` is the _specification_ of the paper's `step` table (least `W`-coprime
  integer `> x`), proved total via `exists_coprime_gt` — the wheel never stalls because the class
  `1 mod W` is always coprime to `W`. A table-driven implementation refines this.
- `AlgB.Rec` carries exactly `(p, a)` — two words — which is Claim B4 made structural: nothing in
  `advance` reads the prime array.
- `Impl.lean` runs the same `activate`/`advance` that the proofs are about, with `W = 30`, and
  `#eval`s the duplicate factor of §4.5.

API drift: names are for Mathlib at the pinned toolchain; if a lemma name moves, only the small
bridging lemmas (`minFac_mul_self_le`, `Wheel.coprime_mul_add_one`) should need touching — they
were proved from first principles precisely to keep that surface small.
