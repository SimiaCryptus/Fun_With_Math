# Ribbon Engine Sandbox

A browser "topological IDE" for the Ribbon Engine (see theory.md / plan.md).

- Run: serve this folder statically (e.g. `npx serve .`) and open `index.html`.
  ES modules + Workers do not work from `file://`.
- Test: `npm test` (Node ≥ 18, no dependencies).

Word syntax: `s1 s2^-1`, `σ1 σ2⁻¹`, `D` / `Δ` (Garside half twist), parentheses with
powers `(s1 s2^-1)^2`, or Sage-style integers `1 -2 1 -2`.
Cascade lines (Advanced): `2: s1` = slice every component into 2 with engine σ1.