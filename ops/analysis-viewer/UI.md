# Theory Graph Viewer

A zero-dependency HTML + ES6 viewer for `*.theory_graph.json` files produced by
`analyze.op.md` against `ops/theory_graph.schema.ts`.

## Run

ES modules cannot be imported over `file://`, so serve the directory:

```sh
cd docs            # or the repo root
python3 -m http.server 8000
# then open:
# http://localhost:8000/viewer/?src=../generator.theory_graph.json
```

You can also just open the page and drop a `.json` file onto it, or use
**Open file…**, or paste a path into the fetch box.
The viewed file is always mirrored in the address bar as `?src=…`, so any
loaded graph can be linked or bookmarked, and browser back/forward moves
between the graphs you have visited. Files opened from disk clear `?src`
(there is nothing to link to).
The quick-access sample buttons are declared in `index.html`:
```html
<span class="samples" id="samples">
   <button class="btn" data-src="../generator.theory_graph.json">generator</button>
</span>
```
Add or remove a `data-src` button there; `app.js` wires them automatically.


## What it shows

* **Lanes** — one column per layer, in the schema's order:
  `social | inspiration | fuzzy | symbolic | deductive | numeric | ecological`.
  Node position inside a lane is computed by barycentric ordering over the
  edge + morphism adjacency, so cross-layer descent chains read top-to-bottom.
* **Shapes** — triangle = inspiration, circle = fuzzy, rounded square = symbolic,
  square = deductive, diamond = numeric, hexagon = social/ecological.
  Marker size scales with `confidence`; dashed outline = `proposed` /
  `pre_formal` / `unknown`; faded = `refuted` / `abandoned` / `superseded`.
* **Link colouring** — logical/structural (grey), evidential (amber),
  conflict (red), cross-layer `formalizes`/`abstracts` (violet),
  contextual `steers`/`selects_for`/`constrains` (teal), morphisms (dashed
  cyan), coherence obligations (dotted pink, chained across their `refs`).
* **Inspector** — statement, `formal`, representation + cross-ontology
  interfaces, attributes, shape/similarity, social & ecological context,
  incident edges/morphisms/obligations, and every `SourceRef` with its quote.
* **Diagnostics tab** — a JS port of `validateTheoryGraph`, `findCycles`
  (over `ACYCLIC_RELATIONS`) and the advisory `findMissingMorphisms`,
  including layer-discipline checks such as “`formalizes` must descend the
  cognitive axis” and “pre-truth-apt node carries a truth-apt status”.

## Notes

* `docs/generator.theory_graph.json` stores many edges and morphisms inside
  `nodes[]`. `normalizeGraph()` detects objects with `from`/`to` and moves them
  into `edges[]` / `morphisms[]`, reporting what it moved in **Diagnostics**.
* `Export` downloads the currently visible subgraph as a valid theory graph
  with recomputed `stats`.

## Shortcuts

| key | action |
| --- | --- |
| `f` | fit to view |
| `/` | focus search |
| `Esc` | clear selection |
| wheel / drag | zoom / pan; drag a node to pin it |