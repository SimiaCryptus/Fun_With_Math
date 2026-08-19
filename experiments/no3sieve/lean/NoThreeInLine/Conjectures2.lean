import NoThreeInLine.Library
import NoThreeInLine.Seams
import NoThreeInLine.MeanField

/-!
# §15–§18 — Conjectures C13–C22

Same rules as `Conjectures.lean`: **nothing here is proved and nothing here may be used as a
hypothesis.**  A conjecture you cannot state formally is a conjecture you cannot falsify, and
§19 is a falsification programme.

Note the gap `C16`, `C17`: `theory_2.md` §17 carries only **H**-tags, deliberately.
-/

namespace No3

open Filter Topology
open scoped Classical

variable (P : Set Pt)

/-- **C13 (stationary field).**  Every finite patch has a frequency.  The caveat of §15.3 is the
site-class one: this average includes the seams, whose weight is `Θ(W/R) → 0`, so the limit is
the *bulk* frequency and any measurement must be restricted accordingly (P31). -/
def C13 : Prop :=
  ∀ (s : ℕ) (C : Set Pt), ∃ f : ℝ,
    Tendsto (fun R : ℕ =>
        (((ballF R).filter (fun v => patternAt P v s = C)).card : ℝ) / ((2 * R + 1) ^ 2))
      atTop (𝓝 f)

/-- **C14 (hyperuniformity).**  `σ²_W(s) = o(s²)`: long-wavelength density fluctuations are
suppressed relative to Poisson.  A *super*-Poissonian variance would mean phase separation and
would invalidate treating far-field windows as independent samples (P25). -/
def C14 : Prop :=
  ∀ ε > (0 : ℝ), ∃ s₀ : ℕ, ∀ s ≥ s₀, ∃ R₀ : ℕ, ∀ R ≥ R₀,
    winVar P s R ≤ ε * (s : ℝ) ^ 2

/-- **C12 test (P25).**  A Bragg peak is a periodic far field; by `langP_finite_of_biperiodic`
that is exactly the negation of universality. -/
def BiPeriodic : Prop :=
  ∃ a b : ℤ, 0 < a ∧ 0 < b ∧ (∀ p, p ∈ P ↔ p + (a, 0) ∈ P) ∧ (∀ p, p ∈ P ↔ p + (0, b) ∈ P)

/-- **C15 (seam covariance), schematic.**  For a traversal gauge whose unit ball has corner set
`K`, the cells at which the history census departs from its bulk value lie within `O(W)` of the
rays `ℝ₊·K` — and nowhere else.  Mechanism (A) of §16.1 predicts a feature on the lattice
diagonals in *every* row of the C15 table; mechanism (B) predicts this.  P24 runs one experiment
per row and settles it; the `L²` row (`K = ∅`) is the strongest form. -/
def C15 (K : Set Pt) (H : ℕ → Pt → ℕ) (bulk : ℕ → ℕ) : Prop :=
  ∀ W c, H W c ≠ bulk W → ∃ k ∈ K, ∃ t : ℕ, nrm (c - t • k) ≤ 2 * W

/-- **C18 (occurrence / U1).**  Every saturable valid pattern of side `≤ W+1` occurs somewhere. -/
def C18 (W : ℕ) : Prop :=
  ∀ s ≤ W + 1, ∀ C ∈ LangX (W : ℕ∞) s, Saturable W s C → C ∈ LangP P s

/-- **C19 (frequency and equidistribution / U2).**  Occurrences have positive density in the
bulk: the waiting radius is set by the frequency alone (a first-success time, not a search). -/
def C19 (W : ℕ) : Prop :=
  ∀ s ≤ W + 1, ∀ C ∈ LangP P s, ∃ ε > (0 : ℝ), ∃ R₀ : ℕ, ∀ R ≥ R₀,
    ε * ((2 * (R : ℝ) + 1) ^ 2)
      ≤ (((ballF R).filter (fun v => patternAt P v s = C)).card : ℝ)

/-- **C20 (language maximality / U3).**  The greedy orbit is dense in the saturated part of the
subshift, up to side `s*(W) = Θ(W)`. -/
def C20 (W : ℕ) : Prop :=
  ∃ c : ℝ, 0 < c ∧ ∀ s ≤ ⌊c * (W : ℝ)⌋₊,
    {C | C ∈ LangX (W : ℕ∞) s ∧ Saturable W s C} = LangP P s

/-- **C21 (harvest).**  The operational core: at `W = s-1` the field's best `s`-window attains the
true optimum, at a radius exponential in `s` with a *measurable* constant (P27, P28).  Note the
inversion of instinct in §18.4: for harvesting, `W` is **tuned to the target**, not maximised. -/
def C21 (field : ℕ → Set Pt) : Prop :=
  ∀ s : ℕ, 1 ≤ s → ∃ R₁ : ℕ, ∀ R ≥ R₁, maxpop (field (s - 1)) s R = opt s

/-- **C22 (spoke harvest).**  Records are over-represented on the diagonal spokes: the optimum is
attained among spoke-centred windows strictly before it is attained in the bulk.  Equality of the
two harvest curves refutes C22 and H16.4 together (P29). -/
def C22 (spoke : Pt → Prop) : Prop :=
  ∀ s : ℕ, ∃ Rs Rb : ℕ, Rs < Rb ∧
    ((ballF Rs).filter (fun v => spoke v)).sup (fun v => winCount P s v) = opt s ∧
    ((ballF Rb).filter (fun v => ¬ spoke v)).sup (fun v => winCount P s v) = opt s

/-- **T18.4, as a `Prop` pairing.**  C12 (periodicity) and C18 (universality) cannot both hold;
`langP_finite_of_biperiodic` + `entropy_lower` is the proof, and P25/P26 is the experiment. -/
def PeriodicityExcludesUniversality (W : ℕ) : Prop := BiPeriodic P → ¬ C18 P W

end No3