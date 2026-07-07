# Arithmetic Dynamics

    See `idea.md` for the design and `plan.md` for the roadmap.

    ## Status — Milestone M1 (Core engine)

    Implemented and unit-tested (no UI yet):

    - `src/core/expression.js` — AST node types + tree helpers.
    - `src/core/value.js` — exact-integer evaluation (division gated).
    - `src/core/serialize.js` — parse / serialize + round-trip.
    - `src/core/transformations.js` — split, swap, group, ungroup,
      combine, cancel. All value-preserving by construction.
    - `src/core/legality.js` — which verbs apply to a selection.
    - `src/util/{id,events}.js` — id generation + tiny emitter.

    ## Running tests

    Requires Node 18+ (uses the built-in `node:test` runner). No build step.

    ```sh
    cd games/arithmatic-dynamics
    npm test
    ```

    ## Next

     ## Status — Milestones M2 & M3 (Playable + Gestures)

     Implemented on top of the M1 core:

     - `src/game/session.js` — current expression, unlimited undo/redo,
       move-count + verbs-used tracking, `changed`/`solved` events.
     - `src/game/level.js` + `src/game/stars.js` — level schema, star
       builders, pure star evaluation.
     - `src/game/levels/*` — additive and multiplicative level packs.
     - `src/ui/*` — tile stage (FLIP animation), history ribbon, radial
       verb menu, split chooser, pointer-event gesture recognizer, and the
       `app.js` bootstrap wiring it all together.
     - `styles/*` — touch-first, calm visual language (round-number glow,
       +/− vs ×/÷ color pairings, reduced-motion support).

     Open `index.html` in a browser (served over http for module loading)
     to play. Choose a level from the top-right selector.

     ## Next

     - M4: richer history rewind + polished merge/pop animations.
     - M5: progression/unlocks + persistence.