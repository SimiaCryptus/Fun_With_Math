import Lake
open Lake DSL

abbrev ribbonLeanOptions : Array LeanOption := #[
  ⟨`autoImplicit, false⟩,
  ⟨`relaxedAutoImplicit, false⟩,
  ⟨`linter.unusedVariables, true⟩,
  ⟨`linter.unusedTactic, true⟩,
  ⟨`linter.unreachableTactic, true⟩,
  ⟨`linter.dupNamespace, true⟩,
⟨`weak.linter.mathlibStandardSet, true⟩,
⟨`weak.linter.style.header, false⟩,
⟨`weak.linter.style.whitespace, false⟩,
⟨`weak.linter.style.emptyLine, false⟩,
⟨`weak.linter.style.longLine, false⟩
]

package «RibbonEngine» where
  leanOptions := ribbonLeanOptions
  lintDriver := "batteries/runLinter"

require mathlib from git
  "https://github.com/leanprover-community/mathlib4.git"

@[default_target]
lean_lib «RibbonEngine» where