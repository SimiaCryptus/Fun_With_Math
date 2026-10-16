# RibbonEngine

A Lean 4 formalization library for the **knot-ribbons** experiment, built on top of
[Mathlib](https://github.com/leanprover-community/mathlib4).

## Requirements

- [elan](https://github.com/leanprover/elan) (the Lean toolchain manager)
- `git` (to fetch Mathlib)

## Getting started

From this directory (`experiments/knot-ribbons/lean`):

```sh
# Download prebuilt Mathlib artifacts (strongly recommended; avoids a multi-hour build)
lake exe cache get

# Build the library (default target: RibbonEngine)
lake build
```

To check a single file:

```sh
lake env lean RibbonEngine/Basic/ArtinBraid.lean
```

## Project layout

```text
lean/
├── lakefile.lean          # Lake package config (depends on Mathlib)
├── lean-toolchain         # Pinned Lean version
├── RibbonEngine.lean      # Root module; imports all submodules
└── RibbonEngine/
    ├── Basic/
    │   ├── ArtinBraid.lean
    │   ├── CycleCalculus.lean
    │   └── SwitchingLaw.lean
     ├── Compiler/
     │   ├── RibbonIR.lean
     │   ├── Typechecker.lean
     │   └── AncillaGuard.lean
    ├── Framing/
    │   ├── CWF.lean
     │   ├── BisectionAudit.lean
     │   └── MagneticHelicity.lean
     ├── Garside/
      │   ├── DiagramInvolution.lean
      │   ├── SimpleElements.lean
      │   └── LeftNormalForm.lean
      ├── DoubleCategory/
      │   ├── HorizontalGauge.lean
      │   └── TorusReciprocity.lean
      ├── Certificates/
      │   ├── MarkovTrace.lean
      │   └── FoxRibbon.lean
     └── Wreath/
         ├── Monodromy.lean
         └── CascadeParity.lean
```

### Modules


| Module | Purpose |
|---|---|
| `Basic.ArtinBraid` | Artin generators, braid words, right-action strand tracing (**T1**) |
| `Basic.CycleCalculus` | Executable orbit cycle counter, `numCycles`, Figure-Eight Möbius fracture (**T2–T4**) |
| `Basic.SwitchingLaw` | Fundamental Switching Law (`Δk = ±1`) and concrete instances (**T5**) |
| `Framing.CWF` | Călugăreanu–White–Fuller `Lk = Tw + Wr` state and Fuller uncoiling (**T6**) |
| `Framing.BisectionAudit` | Reconciliation of `4m₀` (Seifert) vs `2m₀ + 2` (planar) framing (**T7**) |
| `Framing.MagneticHelicity` | Moffatt–Berger–Field helicity conservation and reconnection quanta (**T8–T9**) |
| `Compiler.RibbonIR` | Dependently typed `RibbonIR` indexed by `(n, τ, pol, m)` |
| `Compiler.Typechecker` | Compile-time knot and `5' → 3'` DNA polarity verification (**T10**) |
| `Compiler.AncillaGuard` | Pure-braid ancilla checksum and single-fault detection (**T11**) |
| `Garside.DiagramInvolution` | Garside mirror involution `Δₙ σᵢ Δₙ⁻¹ = σ_{n-i}` (**T12**) |
| `Garside.SimpleElements` | Simple elements `[1, Δₙ] ≅ Sₙ`, descent sets, and `IsLeftWeighted` |
| `Garside.LeftNormalForm` | `GarsideBraid` and the Bruhat walk knot criterion (**T13**) |
| `DoubleCategory.HorizontalGauge` | Relational ribbon states, conjugation invariance, and stabilization (**T14**) |
| `DoubleCategory.TorusReciprocity` | Torus axis duality `T(p,q) ≃ T(q,p)` and modular reciprocity (**T15**) |
| `Certificates.MarkovTrace` | Explicit Markov certificate reducing `4₁ + Δ₃` to the Hopf link (**T16**) |
| `Certificates.FoxRibbon` | Symmetric union palindromes and Fox slice-ribbon certificates (**T17**) |
| `Wreath.Monodromy` | Symbolic wreath product `S_{n₂} ≀ S_{n₁}` and monodromy conjugacy (**T18**) |
| `Wreath.CascadeParity` | Bisection death (`n = 2`) vs. immortal trisection (`n = 3`) parity |

To use the whole library from another Lean file:

```lean
import RibbonEngine
```

## Configuration notes

- **`autoImplicit` is disabled.** Every variable must be declared explicitly
  (e.g. with `variable {n : ℕ}`). This catches typos that would otherwise
  silently become implicit arguments.
- **Mathlib is unpinned.** The Mathlib dependency tracks the default branch, and
  the exact revision is recorded in `lake-manifest.json`. Commit that file for
  reproducible builds. When upgrading, bump `lean-toolchain` to match Mathlib's,
  then run:

  ```sh
  lake update
  lake exe cache get
  ```

## Contributing

- Add each new file under `RibbonEngine/` and import it from `RibbonEngine.lean`.
  Otherwise `lake build` will not check it.
- Keep `lake build` free of errors. Avoid leaving `sorry` in merged code, or
  document any that remain.
- Toolchain: `leanprover/lean4:v4.35.0` (pinned in `lean-toolchain`, selected automatically by elan)