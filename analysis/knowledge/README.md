# Knowledge Graph

A relational map of the vocabulary a corpus is written in — and a zero-dependency viewer for it.

```
notes/*.md ──▶ parse.op.md ──▶ *.knowledge_graph.json ──▶ viewer (index.html)
               (LLM extraction)  (knowledge_graph.schema.ts)
```

The theory graph records _claims_; this one records the _terms the claims are phrased in_, and — the point of the
exercise — the ranked queue of definitions the corpus never supplies. See `idea.md` for the argument and
`parse.op.md` for the extraction contract.

## Files

| File                        | Role                                                                                                 |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `idea.md`                   | The paper: relations before definitions, and why the map is a queue.                                 |
| `knowledge_graph.schema.ts` | Canonical types + constants + validators, `findDefinitionGaps`, `computeStats`. Imports only layers. |
| `parse.op.md`               | The extraction op: entry kinds, the status lattice, the relation taxonomy, the hard rules.           |
| `schema.js`                 | Runtime ES6 mirror used by the viewer. Also `normalizeGraph()`.                                      |
| `graph.js`                  | `GraphView`: SVG lane renderer with switchable lanes, barycentric layout, pan/zoom/drag.             |
| `app.js`                    | Wiring: loading, `?src=` routing, filters, inspector, tables, queue, export.                         |
| `index.html` / `styles.css` | Shell and theme (the theme extends the theory viewer's).                                             |

## Run

ES modules cannot be imported over `file://`, so serve the directory:

```sh
python3 -m http.server 8000
# http://localhost:8000/knowledge/?src=idea.knowledge_graph.json
```

Load a graph three ways: `?src=…` (kept in sync in the address bar, so views are linkable and back/forward works),
**Open file… / drag & drop**, or the fetch box. Samples are `#samples [data-src]` buttons in `index.html`.

## What the viewer shows

- **Lanes** — switchable. Default is `definition status`
  (`defined_here | defined_elsewhere | gestured | assumed_known | ambiguous | conflicting | undefined | unknown`),
  which reads left-to-right as _settled → owed_. Also available: group, entry kind, metaontology layer. Vertical
  position is a barycentric ordering over the relation adjacency.
- **Nodes** — colour = definition status; shape = group (◇ language, ○ content, ⬡ context); size = mention count;
  dashed outline = needs a definition; faint ring = `role: central`.
- **Links** — coloured by the evidence group that licenses them: lexical (violet), taxonomic (green), definitional
  (amber, thicker — this is what orders the queue), functional (blue), discourse (grey, dotted, faint), provenance
  (teal, dashed).
- **Inspector** — label, aliases, symbols, gloss (badged _verbatim_ or _provisional_, or explicitly absent),
  definition reference, senses with discriminators and layers, layer drift, incident relations, the entry's
  definition request, grounded theory nodes, references, and every mention with its quote.
- **Tables** — Entries, Relations, **Requests**, Topics, Issues, Diagnostics, Stats.
- **Requests** — the file's `requests[]` if present, otherwise derived live with `findDefinitionGaps`
  (`score = ½·centrality + ½·mentions`), with priority, `wants` and `blocked_by`.
- **Diagnostics** — a JS port of `validateKnowledgeGraph`, `findCycles` (over `ACYCLIC_RELATIONS`) and
  `findAdvisoryIssues`: phantom entries, alias collisions, notation clashes, endpoint violations, unreconciled layer
  drift, orphan and unbridged entries.
- **Export** — the visible subgraph as a valid knowledge graph with recomputed `stats`.

If the graph declares `companion.theory_graph`, the header shows a link that opens it in the theory viewer.

## Shortcuts

| key          | action                            |
| ------------ | --------------------------------- |
| `f`          | fit to view                       |
| `q`          | jump to the definition queue      |
| `/`          | focus search                      |
| `Esc`        | clear selection                   |
| wheel / drag | zoom / pan; drag a node to pin it |

## Notes and known quirks

- `normalizeGraph()` moves objects carrying `from`/`to` out of `entries[]`, defaults a missing
  `definition_status` to `unknown`, backfills `mention_count`, and reports every repair in **Diagnostics**.
- `schema.js` is a faithful port of the TypeScript original and imports `LAYERS` / `LAYER_COLOR` from
  `../theory/schema.js`; keep all three in sync when the schema changes.
- No build step, no dependencies — plain ES modules, plain SVG, plain CSS.
