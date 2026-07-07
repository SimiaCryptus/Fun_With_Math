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

    - M2: minimal playable stage (`src/game/session.js`, `src/ui/*`).