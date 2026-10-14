# Rotor: A Rotatable Notebook

*Product and technical specification for a self-contained HTML utility that treats notes as a multidimensional cube rather than a page, a folder, or a fixed table. It works fully offline, has an optional PWA build, and offers optional bring-your-own-key AI agents.*

---

## 1. The Thesis

Notes are multidimensional. A single thought belongs to a topic, a project, a moment in time, a person, a priority, a state of completion. Every mainstream note-taking tool forces that thought into exactly one primary dimension:
- a folder hierarchy;
- a page in an outline;
- a node in a backlink graph;
- a row in a database with a fixed schema.

The other dimensions are demoted to tags and filters. Tags and filters let you *find* things. They don't let you *see* the space differently.

Rotor's thesis is a single sentence:

> **The cube is the truth; every view is a projection, and every projection is writable.**

You write notes once. You assign them coordinates along named dimensions. You then look at the same body of notes through any pair (or nesting) of dimensions laid out as rows and columns.

You rotate that view freely and edit directly inside it. If you choose, you can also ask an agent to propose edits, which you accept through the same projection. Rotation is not a report. It is not an aggregation. It is not a separate "pivot" artifact that goes stale. It is simply another way of standing in front of the same data.

The deliverable is deliberately humble in form:
- one HTML file, written in modern ES modules and CSS;
- no server, no account, nothing to install;
- one optional library, a Markdown renderer loaded from a CDN, pinned and integrity-checked, with a built-in fallback, so that the notebook never depends on it;
- downloadable, emailable, and openable from a USB stick twenty years from now;
- optional AI agents that run on *your* API key, talk directly from your browser to your chosen provider, and only ever *propose* changes;
- an installable Progressive Web App built from the same source.

## 2. Lineage: What We Are Reviving

This idea has been shipped before, briefly, and then abandoned by the industry.

### Lotus Improv (1991)

The clearest precedent is **Lotus Improv**. It shipped on NeXT in 1991 and on Windows in 1993.

Improv separated three things that Lotus 1-2-3 and VisiCalc had fused together:
- the data;
- the formulas;
- the presentation.

Data lived in named **categories**, which today we would call dimensions. Categories could be dragged between the row axis, the column axis and a "page" axis. The entire worksheet re-laid itself out as you dragged. Formulas referred to names ("Profit = Revenue − Cost"), not cell addresses.

It was widely admired and commercially unsuccessful. It was discontinued within a few years. Its model survives today mainly in niche financial-modeling tools.

### What else Lotus tried

Lotus 1-2-3 itself experimented with dimensionality from the other direction. Release 3 (1989) introduced 3D workbooks: stacked sheets that formulas could address across. Lotus spent much of the early '90s shipping late and fighting *Lotus v. Borland* over whether its menu hierarchy was copyrightable. Excel won the decade.

### What the industry kept instead

Excel introduced **PivotTables** in 1993 and established the model the industry kept. In that model:
- the sheet is two-dimensional;
- multidimensionality is a *derived report* that summarizes the sheet.

PivotTables aggregate. They are read-mostly. You don't take notes inside one. Everything since has inherited this split: Google Sheets, LibreOffice, Airtable, and Notion databases. In all of them, the grid is the storage and the pivot is the lens.

### Rotor's position

Rotor takes Improv's side of the argument and applies it to a domain Improv never targeted: **unstructured personal knowledge**. Rotor's cells hold prose, not numbers. Its dimensions are categories of meaning, not fiscal quarters. Its primary operation is not "compute" but "re-see."

Improv's formulas derived new numbers from names. Rotor's optional agents derive new *coordinates* from meaning. A Classifier fills in a dimension you left half-assigned. A Mapper proposes an entirely new dimension for you to rotate onto. The agents serve the same verb: they help you re-see, and you decide what is kept.

## 3. Goals and Non-Goals

### Goals

1. **Rotation as a first-class, instantaneous operation.** Changing which dimensions sit on rows, columns and filters is a single gesture or keystroke and completes in well under 100 ms for realistic notebooks.
2. **Every view is writable.**
    - Creating a note inside a cell assigns it that cell's coordinates.
    - Dragging a note between cells reassigns its coordinates.
    - Renaming a header renames the value everywhere.
3. **Self-contained artifact.**
    - One `.html` file contains the application and, optionally, the user's data.
    - It works from `file://` with no network access. Every core feature works offline. The network only enriches Markdown rendering and powers agents; it never gates the notebook.
    - "Save" produces a new self-contained file.
4. **Zero install, zero build required to run.** The shipped artifact is plain HTML, CSS and ES2020+ JavaScript.
    - Its single external library is [marked](https://marked.js.org) for Markdown. It is loaded from a CDN at a pinned version with Subresource Integrity, and backed by a built-in fallback renderer.
    - A trivial build step bundles sources for development convenience. The product never requires one.
5. **Optional PWA distribution.** The same codebase, served over HTTPS, installs as an offline-capable app with a service worker and manifest.
6. **Data durability and portability.**
    - Autosave to browser storage.
    - Explicit export to a documented JSON format.
    - Explicit save to self-contained HTML.
    - The format is versioned and human-readable.
7. **Provably bounded network.**
    - A Content Security Policy enumerates every origin the file may ever contact: one pinned script URL and the AI provider endpoints. Nothing else is reachable, and users can verify that by reading the file's first lines.
    - No request leaves the machine for an AI provider unless the user has supplied a key and invoked an agent.
    - A strict `rotor-local.html` build sets `connect-src 'none'` and omits the CDN entirely, for users who need the absolute guarantee.
8. **Optional, reviewable AI agents.**
    - Users who supply their own API key get agents that synthesize, classify, plan, critique, expand, reduce and map their notes.
    - Agents never mutate the cube directly. They return proposals made of the same operations a human gesture produces, and the user reviews and accepts them (§8).

### Non-Goals (for v1)

- Real-time collaboration, sync, accounts, or any server component.
- WYSIWYG rich text. Content is stored as plain Markdown text and rendered for display. Editing happens in the source.
- Numeric spreadsheet formulas. Rotor is a notebook first. Aggregates are limited to counts.
- A mobile-first editing experience. It must work on phones; it is designed for keyboard and pointer.
- Hosted AI. Rotor bundles no model in the core artifact, runs no proxy, holds no keys server-side and sells no AI account. You bring the key; the browser talks to your provider directly.
- Autonomous agents. Agents never apply changes without review, never delete, and never run in the background.

## 4. Core Concepts

Six primitives. Everything else is derived from them, including everything an agent does.

### 4.1 Item

An **item** is the atomic unit of content: a note, fragment, task, quote or idea. An item has:
- a stable ID;
- text content (Markdown source);
- timestamps;
- a set of **coordinates**.

Items are the only things that hold user prose.

### 4.2 Dimension

A **dimension** is a named axis, for example *Topic*, *Project*, *Status*, *Person* or *Week*. A dimension owns an ordered list of **values** (Improv called these *items*; we call them values to avoid collision).

Dimensions come in kinds:

| Kind | Values | Ordering | Phase |
|---|---|---|---|
| `categorical` | User-defined labels | Manual (drag to reorder) | MVP |
| `ordinal` | User-defined labels with inherent order (Low/Med/High) | Fixed, meaningful | v1 |
| `date` | Derived from an item timestamp or date field, bucketed by granularity (day/week/month/quarter/year) | Chronological | v1 |
| `derived` | Computed from rules over content or other coordinates | Rule-defined | v2 |

A dimension proposed by the Mapper agent is an ordinary `categorical` dimension once accepted. It is not a fifth kind: an accepted proposal leaves no trace of AI in the model beyond optional provenance (§5.1).

### 4.3 Coordinates

An item's **coordinates** map dimension IDs to *sets* of value IDs. Three cases:
- **Unassigned.** The set for a dimension is empty, or the key is absent. The item renders in that dimension's implicit "—" (unassigned) bucket.
- **Single-valued.** The common case.
- **Multi-valued.** A note can be about two topics. It then appears in both places in any view that puts *Topic* on an axis (§6.3).

### 4.4 Cube

The **cube** is the set of all items plus all dimensions. It is the document. It is the only thing that is persisted as truth.

### 4.5 View

A **view** is a named, persisted *projection specification*. It contains:
- `rows`: an ordered list of zero or more dimensions, nested left to right.
- `cols`: an ordered list of zero or more dimensions, nested top to bottom.
- `pages`: a filter mapping dimension IDs to selected value sets. These are the "slice."
- Presentation options: cell display mode, whether to show empty rows/columns, whether to show the unassigned bucket.

A view contains **no content**. Deleting a view never deletes an item.

### 4.6 Rotation

**Rotation** is any change to a view's `rows`, `cols` or `pages` assignment. It includes:
- transposing rows and columns;
- swapping a dimension from rows to filter;
- nesting a second dimension under the first.

Rotation is the product's signature move and gets the most design attention.

## 5. Data Model

### 5.1 Document Format (`rotor/1`)

```json
{
  "format": "rotor/1",
  "id": "doc_8f3a…",
  "title": "Research notebook",
  "rev": 142,
  "savedAt": "2026-01-14T18:22:05.000Z",
  "dimensions": [
    {
      "id": "d_topic",
      "name": "Topic",
      "kind": "categorical",
      "values": [
        { "id": "v_ai",    "label": "AI" },
        { "id": "v_hist",  "label": "History of computing" }
      ]
    },
    {
      "id": "d_status",
      "name": "Status",
      "kind": "ordinal",
      "values": [
        { "id": "v_open",  "label": "Open" },
        { "id": "v_wip",   "label": "In progress" },
        { "id": "v_done",  "label": "Done" }
      ]
    },
    {
      "id": "d_week",
      "name": "Week",
      "kind": "date",
      "source": "created",
      "granularity": "week"
    }
  ],
  "items": [
    {
      "id": "i_01h…",
      "content": "Improv separated data, formulas and presentation. Rotor separates content, coordinates and views.",
      "coords": { "d_topic": ["v_hist", "v_ai"], "d_status": ["v_open"] },
      "created": "2026-01-14T17:05:11.000Z",
      "modified": "2026-01-14T17:09:40.000Z"
    }
  ],
  "views": [
    {
      "id": "w_main",
      "name": "Topic × Status",
      "rows": ["d_topic"],
      "cols": ["d_status"],
      "pages": {},
      "options": { "cellMode": "stack", "showEmpty": true, "showUnassigned": true }
    }
  ],
  "activeView": "w_main"
}
```

Notes on the format:
- **IDs are opaque strings.** Generate them with `crypto.randomUUID()` where available, with a fallback for older contexts. They are prefixed by type for debuggability.
- **Date dimensions store no values.** Their values are computed at projection time from the item field named in `source`. Coordinates for date dimensions are never written by hand. This keeps "Week" honest.
- **`rev` increments on every committed mutation.** It is used for conflict detection between embedded file data and the browser's working copy (§9.4).
- **Unknown fields are preserved** on load and save. This provides forward compatibility for a newer file opened in an older build.
- **Content is Markdown source.** The document stores exactly what you typed. Rendering is a display concern, so swapping the renderer (marked or the fallback) never changes the data.
- **Agent provenance is optional and informational.** Items created or rewritten by an accepted agent proposal may carry a `provenance` field:

  ```json
  "provenance": {
    "agent": "synthesizer",
    "sources": ["i_01h…", "i_02k…"],
    "model": "provider/model-name",
    "at": "2026-01-15T09:12:44.000Z"
  }
  ```

  Provenance never constrains other operations. `sources` may outlive the items it names: it is history, not a reference. Editing the item by hand keeps the field but marks it `"edited": true`.
- **AI settings and keys are not part of the document.** They live in a separate per-origin store and are never serialized into JSON exports or saved HTML (§8.4).

### 5.2 Invariants

The store enforces these on every mutation, whether the mutation originates from a gesture or from an accepted agent proposal. Unit tests assert them after every operation in randomized sequences.

1. Every key in `item.coords` references an existing, non-derived dimension. Every value ID in it references a value of that dimension.
2. Deleting a value removes that value ID from every item's coordinates. Items that lose their last value for a dimension become unassigned on it. **No item is ever deleted as a side effect.**
3. Deleting a dimension removes it from all coordinates and all views.
4. View operations (rotate, filter, rename view, delete view) never mutate items.
5. Value labels are unique within a dimension, compared case-insensitively. Dimension names are unique within a document.

### 5.3 Migrations

`format` is checked on load. Each format version has a pure `migrate_N_to_N+1(doc)` function. Loading runs the chain. Files from the future (a higher major version) open read-only with a warning, rather than being silently downgraded.

## 6. Projection

Projection turns `(cube, view)` into a renderable grid. It is a pure function with no DOM access, so it can be tested exhaustively in Node.

### 6.1 Algorithm

```
project(cube, view):
  1. Filter
     candidates = items where for every (dim, selected) in view.pages:
                  selected is empty OR coords(item, dim) ∩ selected ≠ ∅
     (plus any transient text-search predicate)

  2. Build axis keys
     rowKeys = cartesian product of values(d) for d in view.rows
               (each dimension contributes its values + the "—" unassigned member
                if options.showUnassigned)
     colKeys = same for view.cols
     If an axis has zero dimensions, it has exactly one key: the empty tuple.

  3. Place
     for item in candidates:
       rowTuples = product of coordsOrUnassigned(item, d) for d in view.rows
       colTuples = product of coordsOrUnassigned(item, d) for d in view.cols
       for r in rowTuples, c in colTuples:
         cell[r][c].push({ item, primary: isFirstPlacement })

  4. Prune
     if !options.showEmpty: drop rowKeys / colKeys with no placements

  5. Return { rowKeys, colKeys, cells, headers, counts }
```

The same projection also defines an agent's **scope**. When you invoke an agent on a cell, a row or a view, the items it may read are exactly the items that projection places there (§8.3).

### 6.2 Complexity

Placement is O(N × F), where N is the number of candidate items and F is each item's fan-out. Fan-out is the product of its coordinate set sizes across axis dimensions, which is almost always 1.

Axis-key generation is the product of value counts across nested dimensions. That product is the one place combinatorial explosion lives, and §12 addresses it.

### 6.3 Multi-Valued Items

An item with two Topic values appears in two Topic rows. This is correct and essential: a note about both AI and History *is* in both places. But it must never be confusing.

- One placement is designated **primary**: the first value in coordinate order. The others render as **echoes**, with identical content, a subtle visual marker and a tooltip listing all placements.
- Editing any placement edits the one underlying item. All placements update live.
- Counts in headers count **distinct items**, not placements. Cell counts count placements, because that is what you see.

### 6.4 Date Dimensions

Date values are computed during projection. The item's timestamp is bucketed by granularity, using ISO weeks and the local time zone. Only buckets that occur, or that lie between the min and max when `showEmpty` is on, are generated.

Dragging an item between date buckets is **disallowed in v1**: the cursor shows a not-allowed state. Rewriting `created` timestamps by drag is a footgun. A later `date` kind sourced from a user-editable `due` field may permit it.

## 7. Writable Views: Edit Semantics

This is where Rotor diverges from every pivot table ever shipped. Each gesture has one precise meaning defined in terms of coordinates.

Let a cell's **address** be the union of:
- its row tuple;
- its column tuple;
- every page filter that selects exactly one value.

| Gesture | Effect on the cube |
|---|---|
| **Create in cell**: double-click empty space or press `Enter` on a focused cell | New item whose coordinates equal the cell's address. "—" members contribute nothing. Multi-value page filters contribute nothing. |
| **Edit content** | Updates `content` and `modified` only. |
| **Drag item: cell A → cell B** | For each dimension where A's and B's addresses differ, *replace* A's value with B's value in the item's coordinate set. Other values of a multi-valued dimension are preserved. Dragging into "—" removes the value. |
| **Alt/Option-drag A → B** | *Add* B's values instead of replacing. This creates an echo, so the item now lives in both places. |
| **Remove from cell**: `Backspace` on a focused card | Removes this cell's values from the item's coordinates. The item survives elsewhere, or falls into "—". |
| **Delete item**: `Shift+Delete`, or the editor's delete button | Deletes the item from the cube. Undoable. Confirmation is required only when the item has echoes. |
| **Rename header** | Renames the value globally. |
| **Drag header** | Reorders values within the dimension (categorical) or is disallowed (ordinal/date). |
| **Type in the trailing "+" header** | Creates a new value in that dimension. |
| **Drop item onto a header** | Assigns that header's value to the item, keeping its other coordinates. |

The guiding principle is that **a gesture changes only the dimensions that are visible in the gesture**. Dragging between two columns never touches the row dimension or any hidden dimension. Users can therefore trust that rotating to a view, making edits and rotating back leaves everything they couldn't see untouched.

Agents inherit this rule rather than escaping it. Each agent declares which dimensions it may touch, and any proposal that reaches beyond that declaration is rejected before you ever see it (§8.2).

## 8. Agents: Bring Your Own Key

Rotation lets you re-see your notes. Agents let you ask for help re-seeing them.

Agents are entirely optional, off by default, and inert until you paste an API key. Rotor ships no model in the core artifact, runs no server and holds no account. Requests go straight from your browser to the provider you configure, and nowhere else.

The design rests on one principle:

> **An agent is just another writer, and it writes through the same door you do.**

An agent never touches the cube. It returns a **proposal**: a list of the same operation objects that gestures produce (§9.3). You review the proposal, edit it, accept part or all of it, or discard it. An accepted proposal is dispatched as a single operation group, so it is one undo step no matter how many items it touched.

### 8.1 The Agents

| Agent | Purpose | Reads | May propose | Typical scope |
|---|---|---|---|---|
| **Synthesizer** | Merges related cells into a synthesis | Items in the selected cells | New item(s) whose coordinates are the shared address of the sources, with `provenance.sources` | Two or more cells; a row or column |
| **Classifier** | Assigns dimension values | Items in scope + the target dimension's values | Coordinate assignments on the target dimension only; new values, flagged for attention | A dimension's "—" bucket; a cell; a view |
| **Planner** | Builds sequences of cells | A goal you type + items in scope | New step items placed along an ordinal dimension (existing or proposed), one value per step | A view plus a goal |
| **Critic** | Finds contradictions | Items in scope | Findings: sets of item references with an explanation, each optionally accepted as a new note | A view; a dimension value |
| **Expander** | Elaborates ideas | One item + its neighbours in the cell | New items sharing the source's coordinates, or appended content | An item |
| **Reducer** | Compresses ideas | An item or a cell | A tighter rewrite of one item's content (shown as a diff), or one condensed item for the cell | An item; a cell |
| **Mapper** | Creates new dimensions | Items in scope | A new categorical dimension, its values, and an assignment for each item | A view; a filtered slice |

A few of these deserve a sentence more:

- **Synthesizer and Reducer never delete or hide the sources.** The synthesis appears beside them, and you decide whether the originals move to *Done*, an *Archive* value, or nowhere.
- **Planner produces a path you can rotate onto.** It works in three steps:
    1. It proposes an ordinal dimension such as *Step* (or uses one you name).
    2. It places new items along it.
    3. It suggests a view with *Step* on columns.

  Accept, rotate, and the plan reads left to right, while each step keeps its Topic and Project coordinates.
- **Critic is read-only by construction.** Its findings live in the review panel with links to the items involved. A finding enters the cube only if you accept it as a note. That note is coordinated with the shared address of the items it cites, so the critique lands where the contradiction lives.
- **Mapper delivers "rotate by meaning" today.** It reads a slice and proposes a dimension that was never written down, such as *Kind: Question / Claim / Evidence* or *Horizon: Now / Soon / Someday*. Accepting it adds the dimension to the Unused shelf, ready for you to drag onto an axis. It is the agent most aligned with the thesis: a new way of standing in front of the same data.

### 8.2 Proposals, Not Mutations

Every agent output passes through `model/proposals.js`, a pure validator, before a human sees it. The validator enforces five rules:

- **Structured output only.** The agent must return JSON matching its schema. Malformed output is retried once with the validation error attached, then fails visibly. It is never partially applied.
- **Per-agent operation allowlists.** The Classifier cannot edit content. The Expander cannot touch coordinates outside its source's address. **No agent can propose deleting an item, a value or a dimension.** Deletion is not in any allowlist.
- **Locality.** A proposal may only touch the dimensions its agent declared for this run. For example, the Classifier touches only the target dimension. References to IDs outside the scope, or to IDs that do not exist, are rejected.
- **Invariants.** Proposals are dry-run against a copy of the document, and §5.2 is asserted before the review panel opens.
- **Views are suggestions.** An agent may suggest a rotation, such as "show *Step* on columns". Rotations go through navigation history and apply only when you click.

The **review panel** groups changes by kind: new items, coordinate changes, content rewrites, new dimensions and values. Each change has a checkbox and inline editing. Content rewrites show a diff. "Accept selected" dispatches one operation group stamped with provenance. "Discard" leaves no trace.

### 8.3 The Agent Loop

Agents are *agentic* in a bounded, inspectable way. A run is a short loop in which the model may call **read-only tools** before it returns its proposal:

- `listDimensions()` returns names, kinds and value labels;
- `getCell(address)` returns the items placed at an address;
- `getItem(alias)` returns one item's content and coordinates;
- `search(text)` performs text search over the scope.

All tools are confined to the run's **scope**, the slice of the projection you invoked the agent on. A tool cannot read past it, so the scope preview you approve is a true upper bound on what the model can see.

Runs have hard budgets: a maximum number of steps (default 6), a token budget and a wall-clock limit. Progress streams into the panel ("Reading cell AI × Open…"). `Esc` aborts at any point. An aborted run produces no proposal.

### 8.4 Providers and Keys

- **Adapters.** Two wire formats are supported:
    - OpenAI-compatible Chat Completions, which also covers many hosted services and local servers such as Ollama and LM Studio;
    - the Anthropic Messages API.

  The selectable providers are exactly the origins in the build's CSP allowlist (§14).
- **Local models.** Pointing the OpenAI-compatible adapter at `http://localhost` keeps every note on your machine while still enabling agents.
- **Key storage.** Keys live in a dedicated store, separate from documents:
    - never in the document;
    - never in a JSON export;
    - never in save-as-HTML.
- **Session-only keys.** "Remember for this session only" holds the key in memory and forgets it on close.
- **Shared `file://` storage.** Under `file://`, some browsers share storage across *all* local HTML files. The settings panel says so plainly and defaults to session-only there.

### 8.5 What Leaves the Machine

- **Nothing, until you invoke an agent.** There are no background runs, no auto-classification and no prefetching.
- **Scope preview before every run.** The preview shows the provider, the model, the number of items, an estimated token count and therefore approximate cost. The first run against each provider requires explicit consent.
- **Minimal payloads.**
    - Only the content and labels of items in scope are sent.
    - Document and item IDs are replaced with short per-run aliases (`i1`, `i2`, …) and mapped back during validation. This saves tokens, leaks nothing structural, and makes hallucinated IDs trivially detectable.
- **A local run log** records metadata: agent, provider, model, item count, tokens and outcome. It never records prompt content, so you can audit what you have sent.

## 9. Persistence

### 9.1 Layers

1. **Working copy (automatic).**
    - Stored in IndexedDB, keyed by document ID.
    - Every committed mutation schedules a debounced write (300–500 ms) plus a flush on `visibilitychange`/`pagehide`.
    - If IndexedDB is unavailable, which happens in some browsers for `file://` origins and in private modes, fall back to `localStorage` with a size warning.
2. **Embedded data (explicit).**
    - The HTML file carries a `<script type="application/json" id="rotor-data">` block.
    - On boot, if present, it seeds the document.
3. **Export/import (explicit).**
    - `rotor.json` export of the full document.
    - Import validates against the schema, runs migrations, and either opens the file as a new document or merges it into the current one (merge is v2).

AI settings (provider, model, key, run log) form a fourth, deliberately separate store. They belong to the browser, not the notebook, and never travel with it.

### 9.2 Save as Self-Contained HTML

This is the feature that makes Rotor a *utility* rather than a web page. You can email someone a notebook that is also the app.

Mechanism:

1. At the very start of boot, before any rendering mutates the DOM, capture the pristine document source as a string. The app shell is static HTML, so `document.documentElement.outerHTML` at that moment is faithful. Prefix the doctype. The capture includes the pinned `<script src>` tag for marked, so saved copies render Markdown the same way.
2. On save, serialize the document to JSON and escape it for safe embedding. Replace `<` with `\u003c`, so that no `</script>` sequence can appear. Also escape U+2028 and U+2029.
3. Replace the contents of the `rotor-data` block in the captured source with the escaped JSON. AI keys and settings are never part of the serialized document, so they cannot leak into a shared file.
4. Write the result:
    - **Chromium:** via the File System Access API (`showSaveFilePicker`). Retain the file handle so that subsequent `Ctrl/Cmd+S` saves in place.
    - **Elsewhere:** trigger a download via `Blob` and an `<a download>` link.

`fetch(location.href)` is *not* used to obtain the source. It fails under `file://` in Chromium.

### 9.3 Undo/Redo

Every mutation is an **operation object**, `{ type, payload, inverse }`, applied through a single `dispatch`. Operations of this shape:
- make undo/redo trivial (a bounded stack, 500 entries);
- make persistence incremental;
- give a future sync layer a natural log to replay;
- give agents a vocabulary. A proposal is simply a list of operations awaiting consent.

Rapid sequential text edits to the same item coalesce into one undo step, on a 1 s idle boundary. An accepted agent proposal is an **operation group**: one undo step, however many items it created or reassigned.

View rotations are recorded too, but in a *separate* navigation history (`Alt+←/→`), not the undo stack. Undoing a typo should not also un-rotate your view.

### 9.4 Conflict Detection

Opening an HTML file whose embedded document ID already has a working copy in IndexedDB compares `rev` and `savedAt`:
- **Equal:** open silently.
- **Working copy newer:** "You have unsaved changes from [time]. Continue them, or open the file as saved?"
- **File newer:** open the file and keep the old working copy as a recoverable snapshot for 30 days.

### 9.5 Durability Posture

Browser storage is evictable. The product must be honest about this:
- Call `navigator.storage.persist()` on first meaningful edit.
- Show a quiet, persistent indicator: "Saved in browser · Last file save: 3 days ago".
- After a configurable threshold of unsaved revisions or elapsed time, surface a single non-modal nudge to save to file. Accepting a large agent proposal counts toward that threshold.

## 10. Interface

### 10.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ Rotor · Research notebook        [view: Topic × Status ▾]  ⌘K  ✦  ☰  │
├──────────────────────────────────────────────────────────────────────┤
│ Filter:  [Project: Cognotik ×]  [+]           Search: [__________]   │
│ Rows:    [Topic ⠿]                                                   │
│ Columns: [Status ⠿]                         Unused: [Person] [Week]  │
├────────────┬──────────────┬──────────────┬──────────────┬────────────┤
│            │ Open (12)    │ In progress  │ Done (31)    │ — (2)      │
├────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ AI (18)    │ ▢ card       │ ▢ card       │ ▢ card       │            │
│            │ ▢ card ↺     │              │ ▢ card       │            │
├────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ History    │ ▢ card ↺     │              │ ▢ card       │            │
├────────────┼──────────────┼──────────────┼──────────────┼────────────┤
│ + new…     │              │              │              │            │
└────────────┴──────────────┴──────────────┴──────────────┴────────────┘
│ Quick capture: [Call Bob re budget  topic:finance status:open      ⏎]│
└──────────────────────────────────────────────────────────────────────┘
                                                  ↺ = echo (multi-valued)
                                                  ✦ = agents (your key)
```

The ✦ button opens the agents panel for the current selection. It is hidden entirely in the strict `rotor-local.html` build, and dimmed with a "Add a key to enable" hint until a key exists.

### 10.2 Shelves

Dimensions appear as draggable chips on four shelves: **Filter**, **Rows**, **Columns** and **Unused**. Dragging a chip between shelves *is* rotation.

Order within the Rows and Columns shelves defines nesting. Dropping *Person* to the right of *Topic* on Rows nests Person within each Topic.

Clicking a filter chip opens a value checklist with "only" shortcuts. Dimensions accepted from a Mapper proposal arrive on the Unused shelf with a brief highlight, inviting the first rotation.

### 10.3 Rotation Animation

Rotation must preserve the user's spatial orientation, or it feels like a page reload instead of turning an object in your hands.

- Cards animate from their old positions to their new ones using the FLIP technique (First, Last, Invert, Play) on a keyed set of card elements.
- Duration is around 180 ms. The animation is skipped under `prefers-reduced-motion` and for views with more than ~1,500 visible cards.

### 10.4 Cells

Cell display modes, set per view:
- **Stack** (default): item cards showing the first ~3 rendered lines of Markdown, with an overflow count ("+7") that expands in place.
- **List:** first lines only, dense.
- **Count:** just the number, as a heat-shaded cell. This turns the notebook momentarily into a pivot table, which is useful for seeing where your thinking is thin, and for deciding where to point an Expander or Critic.

Cards whose item carries unedited agent provenance show a small ✦ badge with a text equivalent ("drafted by Synthesizer"). The badge is cleared visually once you edit the item.

### 10.5 Item Editor

Selecting a card opens a side panel containing:
- a plain-text Markdown editor with a live preview:
    - When marked is available, the preview renders CommonMark plus GitHub-flavored extensions: tables, task lists, strikethrough and fenced code.
    - Offline, the built-in renderer covers the safe core subset: emphasis, inline code, code blocks, links and lists.
    - Either way, output passes through the same sanitizer (§14);
- one row per dimension, showing coordinate chips with autocomplete. Typing a nonexistent label offers "Create value '…'";
- metadata: created, modified, provenance (if any), and the list of placements in the current view;
- an agent strip with one-click **Expand**, **Reduce** and **Classify…** for this item, each opening the usual review flow.

The editor is non-modal. The grid stays live, and edits reflect immediately.

### 10.6 Quick Capture

A persistent input at the bottom of the window, focused with `N` or `/n`. It parses inline coordinate tokens:

```
Call Bob re budget  topic:finance  who:bob  status:open
Read the Improv retrospective  topic:"history of computing"
```

Token rules:
- `dim:value` matches dimensions by case-insensitive name prefix ("top" → Topic) and values by label. An unknown value is created; an unknown dimension is left as literal text.
- Quoted values allow spaces.
- Tokens are stripped from the stored content.
- Coordinates not mentioned default to the active view's single-value filters, so capture "lands" where you are looking.

Capture never calls an agent on its own. If you want new captures classified, select the "—" bucket afterwards and run the Classifier. One deliberate gesture covers the whole batch.

### 10.7 Command Palette: a Deliberate Homage

Pressing `/` with focus on the grid, or `Ctrl/Cmd+K` anywhere, opens a command line with fuzzy matching. This nods to 1-2-3's slash menus while behaving like a modern palette:

- `/rotate` (transpose), `/rows topic`, `/cols status`, `/filter project cognotik`
- `/view new`, `/view rename`, `/view duplicate`
- `/dim add Person`, `/dim kind week date`
- `/save`, `/save as`, `/export json`, `/import`
- `/ai synthesize`, `/ai classify status`, `/ai plan "ship the beta"`, `/ai critique`, `/ai expand`, `/ai reduce`, `/ai map`
- `/ai settings`, `/ai log`

### 10.8 Keyboard Model

| Key | Action |
|---|---|
| Arrow keys | Move focus between cells; inside a cell, between cards |
| `Enter` | Edit focused card / create in focused empty cell |
| `Esc` | Close editor / clear selection / abort a running agent |
| `Ctrl/Cmd+T` | Transpose rows and columns |
| `Ctrl/Cmd+Shift+←/→` | Move focused card to adjacent column (reassigns coordinate) |
| `Ctrl/Cmd+Shift+↑/↓` | Move focused card to adjacent row |
| `Ctrl/Cmd+Z` / `Shift+Z` | Undo / redo (an accepted proposal undoes as one step) |
| `Alt+←/→` | View navigation history |
| `Ctrl/Cmd+S` | Save (in place if a file handle exists) |
| `Ctrl/Cmd+J` | Open the agents menu for the focused card, cell or view |
| `1`–`9` | Switch to saved view N |

In the review panel, `Space` toggles the focused change, `Ctrl/Cmd+Enter` accepts the selection and `Esc` discards.

Every pointer operation has a keyboard equivalent. Drag is never the only way to reassign a coordinate.

### 10.9 First Run

A blank cube is the hardest possible onboarding. Rotor opens instead with a small starter document:
- two dimensions (*Topic*, *Status*);
- six example items, which explain the product by being in it ("Drag me to Done", "I'm in two topics: notice the ↺", "Select my cell and press ⌘J to see what agents would suggest");
- two saved views.

A single "Start empty" action clears it. Agents stay dormant on first run: the starter document explains them, but nothing is sent anywhere until a key is added.

## 11. Architecture

### 11.1 Source Layout and Build

The source is authored as ES modules for clarity. A ~50-line Node build script inlines them into the HTML template.

Why bundle at all: inline `<script type="module">` works from `file://`, but module *imports* from `file://` are blocked by browser CORS policy. The shipped artifact therefore contains one inline module script and one inline stylesheet.

marked is the one exception, and deliberately so. It is referenced by a classic `<script defer src="…" integrity="sha384-…" crossorigin="anonymous">` tag pointing at a pinned CDN URL. Keeping it external has three benefits:
- marked's ~40 KB stays outside the size budget;
- browsers can cache it across notebooks;
- the strict build can omit it by deleting one tag.

The app never waits for it. First paint uses the built-in renderer, and visible cards re-render once `window.marked` arrives.

```
src/
  model/
    schema.js        // types, validation, migrations
    invariants.js    // assertInvariants(doc)
    ops.js           // operation constructors + apply + inverse (pure)
    project.js       // projection (pure)
    capture.js       // quick-capture token parser (pure)
    markdown.js      // escape-first fallback Markdown renderer (pure)
    proposals.js     // validate agent output → operation groups (pure)
  store/
    store.js         // state, dispatch, subscribe, undo/redo, nav history
    persist.js       // IndexedDB / localStorage, debounce, conflict check
    file.js          // save-as-HTML, FS Access, export/import
  ai/
    providers.js     // OpenAI-compatible + Anthropic adapters (fetch injected)
    agents.js        // agent definitions: prompts, tools, allowed ops, schemas
    runner.js        // bounded tool loop, budgets, abort, ID aliasing
    keys.js          // key + settings storage, separate from documents
  ui/
    grid.js          // keyed render of projection, FLIP animation
    shelves.js       // dimension chips, drag between shelves
    editor.js        // side panel
    markdown-view.js // marked (if loaded) or fallback → sanitize → DOM
    sanitize.js      // allowlist DOM sanitizer
    agents-panel.js  // scope preview, run progress, proposal review
    palette.js       // command palette
    capture-bar.js
    keys.js          // keyboard model
    drag.js          // pointer-events drag (no HTML5 DnD; touch-friendly)
  pwa/
    register.js      // conditional SW registration
    sw.js            // service worker (PWA build only)
    manifest.webmanifest
    icons/
  main.js
  shell.html         // template with <style>, <script>, marked tag, rotor-data placeholder
build.js             // → dist/rotor.html, dist/rotor-local.html, dist/pwa/*
test/
  model.test.js      // node --test, no DOM
  proposals.test.js  // agent output validation, mocked transcripts
```

### 11.2 Layering Rules

- **`model/` is pure.** No DOM, no storage, no network, no globals. Everything in it is deterministic given its inputs, except ID generation, which is injected. Proposal validation lives here precisely so that it can be tested without a model or a browser.
- **`store/` owns state.** UI never mutates state directly; it calls `dispatch(op)`.
- **`ai/` never dispatches.** It receives a scope, talks to a provider through an injected `fetch`, and returns a validated proposal. Only the user's acceptance in the UI turns a proposal into dispatched operations.
- **`ui/` subscribes to the store and to derived projections.**
    - Projection is memoized on `(doc.rev, view, searchTerm)`.
    - Rendering is batched into one `requestAnimationFrame` per change burst.
- **No framework.** The grid uses a small keyed reconciliation: cards keyed by `itemId:placementIndex`, cells keyed by address. That is sufficient for this problem and keeps the artifact small and permanent.

### 11.3 Rendering Strategy

- The grid itself is a CSS Grid. Row and column header tracks are sticky.
- For large views (more than ~200 rows or 2,000 visible cards), rows virtualize: only rows intersecting the viewport, plus overscan, are rendered, and an `IntersectionObserver` drives the window.
- Card heights are clamped (`-webkit-line-clamp`), so row heights stay predictable enough for virtualization without measurement thrash.
- Rendered Markdown is cached per `(itemId, modified, renderer)`, so rotation never re-parses unchanged notes.

## 12. Scale, Performance and Limits

| Metric | Target |
|---|---|
| Artifact size (MVP, uncompressed, no data) | < 80 KB |
| Artifact size (v1, including agents) | < 200 KB (marked excluded: fetched once, cached) |
| Cold open to interactive (1,000 items) | < 200 ms on a mid-range laptop, independent of CDN latency |
| Rotation, re-projection + render (5,000 items) | < 100 ms |
| Keystroke-to-paint in editor | < 16 ms |
| Comfortable document size | 10,000 items / 5 MB JSON |
| Default agent scope cap | 200 items or ~50k tokens per run; larger scopes require confirmation |

**Nested-axis explosion** is the main scaling hazard. Three dimensions of 20 values each on rows yields 8,000 row keys. Mitigations:
- `showEmpty` defaults to **off** whenever more than one dimension is nested on an axis.
- A soft cap at 2,000 rendered row×column keys shows a notice offering to collapse or filter.
- Nested headers are collapsible per outer value.

**Agent scope** is the second hazard, measured in cost and privacy rather than milliseconds. The scope cap, the preview and the filter shelf work together: narrowing a view before invoking an agent is both cheaper and more private.

## 13. Distribution

### 13.1 Artifact A: Single-File Utility (`rotor.html`)

This is the primary distribution:
- download it, double-click it, and it works;
- no install, and no network required. With a connection it fetches only the pinned Markdown library and, if you configured a key, your AI provider;
- "Save as" yields another single file containing both the app and your notes;
- the file is its own backup format and its own viewer.

The constraint is that a service worker cannot be registered from a `file://` origin, nor from a `blob:` or `data:` URL. Artifact A is therefore not a PWA, and doesn't need to be: its core is already offline by construction.

### 13.2 Artifact A′: Strict Local (`rotor-local.html`)

The same build emits a sibling with:
- no CDN tag;
- no `ai/` modules;
- `connect-src 'none'`.

Markdown renders through the built-in subset. This is the artifact for air-gapped machines, sensitive notebooks and anyone who wants the guarantee to be absolute rather than bounded. Documents move freely between A and A′: the format is identical, and provenance fields are simply preserved.

### 13.3 Artifact B: PWA (`dist/pwa/`)

The same build emits:
- `index.html`, identical in app code to `rotor.html`;
- `sw.js`;
- `manifest.webmanifest`;
- icons (an SVG plus 192 px and 512 px PNGs, including maskable variants).

This bundle can be hosted on any static HTTPS host. `register.js` checks `location.protocol` and `'serviceWorker' in navigator` before registering, so the same app code is inert under `file://`.

- **Service worker:**
    - Cache-first for the app shell, including the pinned marked script, which is cached as a CORS response.
    - The cache name is versioned with a build hash.
    - Requests to AI providers are never intercepted or cached; they pass straight through.
    - On update, the new worker waits and the app shows "Update available, reload". It never hot-swaps under an open document.
- **Manifest:**
    - `display: standalone`, theme colors, `start_url: "."`;
    - `file_handlers` for `.rotor.json` and `.rotor.html` where supported (Chromium), so installed users can open notebooks from the OS;
    - `launch_handler: { client_mode: "focus-existing" }`.
- **Storage caveat:** some browsers aggressively evict storage for sites that are visited but not installed. The PWA must surface the durability posture from §9.5 even more prominently than Artifact A does.

### 13.4 The Bridge Between Them

Each artifact can produce the other's portable form:
- the PWA has **"Download standalone copy"**, which runs the same save-as-HTML routine and emits a self-contained file with your notebook embedded;
- the standalone file can export `rotor.json`, which the installed PWA opens;
- any artifact can export a strict-local copy of the current notebook.

Users are never locked into a distribution channel, and never locked into agents either.

## 14. Security and Privacy

- **Content is untrusted** even though it is your own. Imported files and shared notebooks are untrusted input. So is anything a model returns.
    - Markdown rendering follows one pipeline regardless of renderer:
        1. marked is configured so that raw HTML tokens render as escaped text, so `<div>` in a note shows as literally `<div>`.
        2. The resulting HTML string is parsed with `DOMParser` into an inert document, where no scripts run and no resources load.
        3. An allowlist walker keeps only structural elements: paragraphs, headings, emphasis, code, lists, blockquotes, tables, rules and disabled task-list checkboxes. It strips every attribute except a scheme-checked `href`.
        4. Only then are the cleaned nodes adopted into the page.
    - The fallback renderer escapes first and applies a whitelist of transforms, then feeds the same sanitizer.
    - Links are restricted to `http:`, `https:` and `mailto:`, and open with `rel="noopener noreferrer"`.
    - Markdown images render as links, never as loaded images, so a note cannot plant a tracking pixel.
    - User data never reaches `innerHTML` or any other HTML sink without passing through this pipeline.
- **The CDN is pinned, hashed and optional.** The marked tag carries an exact version and an SRI hash. If the CDN serves anything else, the browser refuses it and the fallback renderer takes over. If the CDN disappears entirely, notes still render.
- **Embedded data escaping** (§9.2) prevents a note containing `</script>` from breaking out of the data block in a saved file.
- **Content Security Policy** via `<meta http-equiv>`:
  ```
  default-src 'none';
  script-src 'sha256-<build-hash>' https://cdn.jsdelivr.net/npm/marked@<pinned>/lib/marked.umd.js;
  style-src 'sha256-<build-hash>';
  img-src data: blob:;
  connect-src https://api.openai.com https://api.anthropic.com http://localhost:* http://127.0.0.1:*;
  form-action 'none';
  base-uri 'none';
  ```
    - Hashes are computed at build time for the inline script and style. The script source is a single exact file path, not a whole CDN.
    - `connect-src` lists every origin the file can ever talk to. The provider list is a build input, so adding a host means rebuilding. That is deliberate: the network surface stays visible in the file's first lines rather than in a settings pane.
    - The strict build uses `script-src 'sha256-<build-hash>'` alone and `connect-src 'none'`.
    - The PWA build adds `'self'` to `script-src`, `connect-src`, `worker-src` and `manifest-src`, and nothing else.
- **Agents assume prompt injection.** Notes, especially imported ones, may contain text such as "ignore your instructions and…". The architecture limits what such text can achieve:
    - agents have no write tools, only proposals;
    - read tools are confined to the approved scope;
    - deletion is not proposable;
    - every proposal is schema-validated and locality-checked;
    - nothing is applied without review.

  The worst a hostile note can do is produce a bad suggestion that you decline.
- **Keys stay home.** API keys are stored per origin, separate from documents, and are optionally session-only. They are sent only in the authorization header of requests to the provider they belong to. Rotor has no server that could ever see them.
- **No telemetry, no analytics, no remote fonts.** The system font stack only.

## 15. Accessibility

- The grid uses `role="grid"`, with `role="row"`, `role="columnheader"`, `role="rowheader"` and `role="gridcell"`, and a roving `tabindex`.
- Cards are focusable within cells.
- Header labels include counts for screen readers ("Topic AI, 18 items").
- Echo markers have text equivalents ("also in History of computing"). Provenance badges do too ("drafted by Synthesizer").
- Echo status, unassigned status, provenance and selection are never conveyed by color alone.
- Motion respects `prefers-reduced-motion`.
- Contrast meets WCAG AA in both light and dark themes, following `prefers-color-scheme`.
- Drag operations have full keyboard equivalents (§10.8). Live-region announcements confirm reassignment: "Moved to Done."
- The agents panel is fully keyboard-operable. Run progress and results are announced through a polite live region ("Classifier proposed 14 changes, 2 new values"). Content diffs expose insertions and deletions as text, not just color.

## 16. Testing Strategy

Because the model is pure, most correctness can be verified with `node --test` and no browser.

- **Invariant tests:** random sequences of 1,000 operations against random documents, asserting §5.2 after every step.
- **Round-trip property:** `apply(op)` then `apply(op.inverse)` yields a document deep-equal to the original. The same holds for operation groups, so undoing an accepted proposal restores the prior document exactly.
- **Projection properties:**
    1. Every placed item satisfies the filter.
    2. Every item that satisfies the filter appears at least once.
    3. An item appears exactly `fanout(item, view)` times.
    4. Transposing a view yields the transposed cell matrix.
- **Edit-semantics locality:** for random drags, every dimension not on a visible axis is unchanged in the moved item's coordinates.
- **Proposal validation:** fuzzed agent outputs are fed to `model/proposals.js`, covering:
    - malformed JSON;
    - unknown or out-of-scope aliases;
    - disallowed operation types, including every form of deletion;
    - coordinates on undeclared dimensions;
    - duplicate value labels.

  None may reach dispatch. Recorded provider transcripts replay through a mocked `fetch` to test the loop, the budgets and abort.
- **Markdown safety:** an XSS corpus runs through both renderers and the sanitizer, in the browser. The corpus covers script tags, event attributes, `javascript:` links, SVG payloads, nested encodings and image beacons. No executable or resource-loading output may survive.
- **Serialization:** save-as-HTML output, re-parsed, yields an identical document. This includes adversarial content: `</script>`, U+2028, emoji, RTL text, and 1 MB items. A dedicated test asserts that no configured key or AI setting appears anywhere in the saved HTML or exported JSON.
- **Manual browser matrix:** Chromium, Firefox and Safari, each under `file://` and `https://`. Checks cover:
    - persistence fallback paths;
    - the FS Access fallback;
    - the CDN-blocked path (fallback rendering);
    - the strict build with no network at all.

## 17. Roadmap

### M0: The Hour (proof of thesis)

- Single HTML file, hand-written, no build.
- Categorical dimensions only. One view with one row dimension and one column dimension, chosen from dropdowns, plus a transpose button.
- Create in cell, edit inline, drag between cells (replace semantics), unassigned bucket.
- `localStorage` persistence; JSON export/import.

**Success criterion:** rotating your own real notes feels like a different and better way of seeing them.

### M1: The Utility

- Shelves with drag-to-rotate; nested axes; page filters; multiple saved views.
- Operation-based undo/redo with operation groups; IndexedDB persistence with fallback.
- Save as self-contained HTML; conflict detection.
- Item editor panel, quick capture with `dim:value` tokens, command palette.
- Markdown via pinned marked with SRI, the escape-first fallback, and the shared sanitizer.
- Multi-valued coordinates with echoes; ordinal dimensions.
- Source split into modules plus the build script; model test suite.

### M2: The Product

- PWA build: service worker, manifest, file handlers, update flow.
- File System Access save-in-place.
- Date dimensions; count cell mode; FLIP rotation animation; virtualization.
- Complete keyboard model and accessibility pass; starter document; dark theme.
- **Agents, phase one:**
    - key settings, both provider adapters, localhost endpoints;
    - proposal validator, review panel, provenance, run log;
    - the single-scope agents: **Classifier**, **Expander** and **Reducer**;
    - the strict `rotor-local.html` build.

### M3: Dimension Algebra

- **Derived dimensions**: rules over content and coordinates, e.g. "contains a URL → *Kind: Link*", or "Status = Done AND Week < this week → *Archive*".
- **Value hierarchy**: groups within a dimension (*AI* → *ML*, *Robotics*), collapsible on axes. This is Improv's "groups," revived.
- **Merge import** of another notebook, with dimension/value reconciliation.
- **Agents, phase two:**
    - the cross-cell, multi-step agents: **Synthesizer**, **Planner**, **Critic** and **Mapper**;
    - Mapper proposals that can target value hierarchies;
    - a Mapper option to propose a *derived* rule instead of a static assignment, so that the dimension keeps itself current.

### M4: On-Device Semantic Dimensions (separate build)

The Mapper already offers "rotate by meaning" through a remote or localhost model. M4 brings it fully inside the file: clusters computed from text embeddings by a model running in the browser via WebGPU or WASM.

The model weights break the size budget by orders of magnitude, so this ships as a **separately built and separately named artifact**. It is never a toggle that bloats the core. It is never a reason to widen the core's network surface.

## 18. Risks

| Risk | Mitigation |
|---|---|
| **Cognitive load.** "Dimensions" is an abstract idea; users stall on a blank cube. | Starter document that teaches by example; quick capture that defaults to where you are; two default dimensions; never require a coordinate to save a note; Classifier for users who would rather sort later. |
| **Echo confusion.** Multi-valued items look like duplicates. | Distinct echo styling; header counts of distinct items; a placements list in the editor; Alt-drag as the only way to create echoes by gesture. |
| **Data loss** from browser storage eviction. | `storage.persist()`; a visible durability indicator; save nudges; recoverable snapshots on conflict. |
| **Combinatorial explosion** from nested axes. | Hide-empty default when nesting; render caps; collapsible groups. |
| **Surprising edits** in rotated views. | Strict locality rule (§7): gestures touch only visible dimensions; full undo. |
| **Agent overreach.** Hallucinated assignments, confident nonsense, or edits nobody asked for. | Proposals only; per-agent operation allowlists; no deletion; locality and invariant checks before review; diffs; one-step undo; provenance badges. |
| **Privacy leakage** to AI providers. | Off until a key is added; explicit scope preview with item counts; aliased IDs; localhost endpoints; strict-local build; no background runs. |
| **CDN dependency** for Markdown. | Pinned version, SRI, a path-exact CSP entry, built-in fallback renderer, and a strict build with no CDN at all. |
| **Scope creep toward a spreadsheet**, or toward an AI product. | Formulas are explicitly out of scope until M3+, and only over coordinates, never cell addresses. Agents serve rotation and never replace it: every agent output is coordinates and notes you can see and edit. |

## 19. Open Questions

1. **Title vs. body.** Should items have a distinct title field, or is the first line the title? *Leaning: first line, Markdown-style (a leading `#` heading if present); no schema change needed.*
2. **Numeric payloads.** Should items optionally carry a number (hours, cost, score) so that count mode can become sum or average mode? This is a step toward Improv proper. *Leaning: yes, as a single optional `value` field in M3.*
3. **Item ordering within a cell.** Manual (drag), or by modified time? Manual ordering per cell requires storing order per *placement address*, which is complex. *Leaning: sort options per view (modified, created, alphabetical), with no manual order in v1. The Planner sidesteps this by expressing order as an ordinal dimension.*
4. **File extension.** Should embedded documents save as `.rotor.html` to signal "this is a notebook" while remaining a plain HTML file? *Leaning: yes.*
5. **Custom agents.** Should users be able to write their own agent prompts and save them in the document? *Leaning: yes in M3, as data rather than code. A custom agent can only choose from existing operation allowlists and can never grant itself deletion.*
6. **Provenance lifetime.** Should provenance badges persist forever, or fade once a human has edited the item? *Leaning: the badge fades on edit; the field stays, marked `edited`, for anyone who wants the history.*
7. **Name.** "Rotor" is a working title, chosen because rotation is the verb at the heart of the product.

---

## Appendix A: Why HTML Is the Right Substrate

A single HTML file is one of the most durable, portable, inspectable executable formats available:
- It runs on every desktop and phone made in the last decade, and will run on those made in the next.
- It needs no installer, survives being emailed, and can be read in a text editor if all else fails. The data block is plain JSON, and the notes inside it are plain Markdown.
- Its few reaches outward are optional: one pinned library and the AI provider you chose. If the CDN is gone in twenty years, the built-in renderer still displays every note. If your AI provider is gone, you lose suggestions, not notes.

The Lotus products that pioneered this interaction died with their platforms. A notebook that carries its own viewer inside the same file cannot be orphaned that way.

## Appendix B: Glossary

- **Item**: a note; the only holder of prose.
- **Dimension**: a named axis with an ordered set of values.
- **Value**: a member of a dimension (a row or column header).
- **Coordinates**: an item's value sets, per dimension.
- **Unassigned ("—")**: the implicit bucket for items with no value on a dimension.
- **Cube**: all items plus all dimensions; the document.
- **View**: a persisted projection spec (rows, cols, pages, options).
- **Slice / Filter / Page**: the subset of the cube a view admits.
- **Rotation**: any change to which dimensions occupy rows, columns or filters.
- **Placement**: one appearance of an item in a cell.
- **Echo**: a non-primary placement of a multi-valued item.
- **Address**: the coordinate set implied by a cell's position in a view.
- **Agent**: an optional, key-powered helper (Synthesizer, Classifier, Planner, Critic, Expander, Reducer, Mapper) that reads a scope and returns a proposal.
- **Scope**: the slice of the projection an agent run may read; shown in the preview before anything is sent.
- **Proposal**: a validated list of operations awaiting review; accepted as one undoable operation group.
- **Provenance**: optional, informational record on an item of which agent drafted it and from which sources.

