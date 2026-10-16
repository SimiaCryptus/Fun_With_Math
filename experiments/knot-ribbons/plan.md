# plan.md — Ribbon Engine Interactive Sandbox

## 0. Goal & Scope
Build a browser-based "topological IDE" for the Ribbon Engine (theory.md): type a braid word + framing, see the 3D ribbon, slice it, and get its permutation, cycle structure, component count and Garside normal form. It should also work the other way: a ribbon's state can be exported as an algebraic word.

**In scope (MVP):** braid words in B_n (n ≤ 12), global framing m (half-twists), longitudinal slicing into n strands, S_n projection, cycle → component coloring, Garside left normal form, recursive (wreath) slicing to depth 3, URL state sharing, and export (SageMath, braid word, OBJ/STL).

**Out of scope (initially):** free-form physical dragging with braid-word re-extraction, a repulsive-curve relaxation solver, a full knot-invariant suite (that work is delegated to SnapPy/Sage), and n > 15.

These limits guard against the risks named in idea.md: scope creep into CAD/CAS, ghosting, and desynchronization between the 3D view and the algebra.

---

## 1. Architecture

- **Stack:** plain HTML plus native ES6 modules (no bundler for the MVP), with Three.js loaded via an importmap.
  - Renderer: WebGPU (`three/webgpu`), falling back to WebGL2.
- **Data flow:** one-directional.
  - Source of truth: `State { n, word[], m, cuts[] }`.
  - `State` goes to the algebra layer, which produces derived data: permutation, cycles, normal form.
  - Derived data goes to the geometry layer (meshes), which goes to the renderer.
  - The UI only edits `State`, so the 3D view and the algebra can never desynchronize.
- **Workers:** the algebra runs in a Web Worker, pure JS first, with a WASM (Rust) swap-in later behind the same message API.

```
/index.html
/css/app.css
/src/main.js                 bootstrap, renderer detect, wiring
/src/state.js                State model, undo/redo, URL (de)serialize
/src/algebra/
    braid.js                 word parsing, generators, inverse, concat
    perm.js                  S_n ops, π: B_n→S_n, cycles, sign
    garside.js               Δ_n, left normal form, twist pushing
    wreath.js                recursive slicing / framing propagation
    worker.js                message-based facade
/src/geometry/
    frames.js                Bishop / parallel-transport frames
    layout.js                braid word → strand splines on ribbon
    ribbon.js                ribbon surface mesh (width w, twist m)
    foliate.js               slice into k sub-ribbons (w/k), inherit frame
    closure.js               glue ends via τ, build component curves
/src/render/
    scene.js                 camera, lights, controls
    materials.js             per-component colors, x-ray/section shader
    views.js                 3D view, 2D braid diagram, cycle panel
/src/ui/
    panel.js                 word input, n, m, slice controls
    readout.js               τ, cycles, k, normal form, Lk/Tw/Wr
/src/export/
    sage.js  pd.js  mesh.js  url.js
/tests/                      node --test unit tests for algebra
```

---

## 2. Algebra Core (Milestone 1, no graphics)

1. **Braid words**
   - Parse `s1 s2^-1 D^3` and `σ` syntax, with validation against n.
   - Represent each generator as an int: +i for σ_i, −i for σ_i⁻¹.
2. **Projection π**
   - Fold the transpositions to get τ.
   - Compute the cycle decomposition, the component count k = #cycles, and the cycle lengths.
3. **Garside elements**
   - Δ_n as a word, and the conjugation flip σ_i ↔ σ_{n−i}.
   - Δ_n^m is appended for the framing: β_total = β_int · Δ_n^m.
4. **Left normal form**
   - Use permutation braids, with left-weighting via starting/finishing sets (the standard El-Rifai–Morton algorithm).
   - Output Δ^p A_1…A_r.
5. **Free reduction and twist-pushing peephole**
   - Cancel σσ⁻¹ pairs.
   - Push Δ factors to the front using the flip.
6. **Tests** — must reproduce every row of the theory.md taxonomy table:

   | Input | n | m | Expected τ | Expected k |
   |---|---|---|---|---|
   | Möbius bisection σ_1^3 | 2 | – | (1 2) | 1 |
   | id | 3 | 3 | (1 3)(2) | 2 |
   | (σ1σ2⁻¹)² | 3 | 0 | 3-cycle | 1 |
   | (σ1σ2⁻¹)² | 3 | 1 | 1-cycle + 2-cycle | 2 |

   - **Switching law:** inserting one σ_i^{±1} changes k by exactly ±1. This is checked with a randomized property test.

⚠️ **Convention check:** fix one composition convention (left-to-right word = top-to-bottom). Then re-verify theory.md's hand calculations against code and document any discrepancy instead of trusting the prose.

---

## 3. Geometry (Milestone 2)

1. **Core curve**
   - Start with a circle of radius R; optionally use a torus-knot core later.
   - Compute the Bishop frame by parallel transport.
   - Add the twist angle θ(s) = π·m·s, plus a holonomy correction so the closure is exact (this fixes frame drift).
2. **Layout**
   - The braid word is laid out along the arc length in L+1 slots.
   - Strand transverse positions x_i(s) are piecewise-smooth (smoothstep swaps).
   - Over/under is rendered as a small normal offset ±h. This implements the "switched foliation" model of theory.md §4, avoiding true collisions.
3. **Ribbon mesh**
   - Build a BufferGeometry triangle strip.
   - Resolution scales with L and n; cap the total vertex count.
4. **Foliation**
   - Each strand gets its own sub-ribbon of width w/n − gap, oriented by the inherited frame.
5. **Closure**
   - Follow τ to concatenate strand segments into k closed component curves.
   - Color each component by its cycle.
6. **Animation**
   - Animate a "slice" knife sweeping s ∈ [0,1].
   - Morph from the uncut ribbon to the separated components (an exploded view to fight occlusion).

---

## 4. Rendering & UI (Milestone 3)

**Layout:**
- Left: input panel.
- Center: 3D viewport (OrbitControls).
- Right: readouts.
- Bottom strip: 2D braid diagram (SVG) synced with a word cursor.

**Readouts:**
- τ in cycle notation.
- k and the cycle lengths.
- Whether β is pure (the P_n flag).
- Normal form.
- Orientable vs. Möbius.
- Framing integer.

**Interaction:**
- Hovering a generator highlights its crossing in 2D and 3D.
- Clicking a strand highlights its cycle.

**Visual aids:**
- X-ray / cross-section shader toggle.
- Per-component transparency.

**Presets:** Möbius bisection, trefoil, Hopf, Borromean, figure-eight, twisted hyperbolic, cascade.

**Progressive disclosure:**
- The "Basic" mode shows the word, m, the slice action, and k.
- The "Advanced" mode adds Garside, wreath, and export.

---

## 5. Recursive Slicing / Wreath Cascade (Milestone 4)

- Treat each closed component as a new ribbon. Its core is the component curve; its framing is given by m_1 = 2m_0 + 2 for n = 2 bisections.
  - For general n, derive the framing from Lk computed numerically. Do not hard-code the formula; compute Lk of the edge curves (Gauss integral) and compare it to theory.
- Each child gets its own engine β_2. Display the combined permutation in S_{n1·n2} and the block structure (S_{n2} ≀ S_{n1}).
- **Performance budget:** depth ≤ 3. Use LOD and instancing. Warn the user when the vertex count exceeds 2M.
- **Test cases:**
  - A trefoil bisection yields a 2-component cable link.
  - A 3-cycle engine cascade stays at a single component.

---

## 6. Export & Sharing (Milestone 5)

- **URL:** base64url-encoded JSON of `State`. The URL is restored on load.
- **SageMath:**
  ```
  B = BraidGroup(n)
  b = B([...])
  b.components_in_closure()
  L = Link(b)
  ```
- **SnapPy:** `Link(braid_closure=[...])`.
- **PD code** from the 2D layout.
- **OBJ/STL** of the current meshes (for 3D printing).

---

## 7. Later / Stretch

- Rust→WASM algebra core: n up to ~30 for normal forms, and super summit sets.
- WebGPU compute: tangent-point repulsive energy relaxation, with a CCD guard. The braid word is re-validated after each relaxation step, and the step is rejected if the crossing parity changes (anti-ghosting).
- A 3D → word parser that works from a user-chosen projection axis. Ambiguous crossings are flagged rather than guessed.
- Linking number, writhe, and twist readouts verifying Lk = Tw + Wr live.
- Ancilla/parity-check strand demo for the fault-tolerance section.

---

## 8. Milestones & Estimates (1 dev)

| # | Deliverable | Est. |
|---|---|---|
| M1 | Algebra core + tests | 1–2 wk |
| M2 | Ribbon/foliation/closure geometry | 2–3 wk |
| M3 | UI, 2D diagram, presets, readouts | 2 wk |
| M4 | Recursive slicing cascade | 2 wk |
| M5 | Export + URL sharing | 1 wk |
| — | Stretch items | open |

---

## 9. Risks → Mitigations

| Risk | Mitigation |
|---|---|
| Desync of 3D vs. algebra | One-way data flow; geometry is derived from State only |
| Frame drift | Bishop frame + closure holonomy correction |
| Geometry blow-up under slicing | Depth cap, LOD, instancing, vertex budget |
| Ghosting in physics | No physics in MVP; when added, a crossing-parity validator |
| UI overload | Basic/Advanced modes, presets |
| Scope creep | Delegate invariants to Sage/SnapPy via export |
| Theory errors in prose | Unit tests are the arbiter; log corrections in `NOTES.md` |

---

## 10. Definition of Done (MVP)

- Typing `(s1 s2^-1)^2` with n = 3 and m = 0 shows a ribbon. Pressing "Slice" animates it into one figure-eight-colored component.
- Setting m = 1 instantly re-colors the result into 2 components, with τ = (1)(2 3)-type cycle readout.
- The URL reproduces the state, and the Sage export runs and agrees on the component count.
- All algebra tests pass.