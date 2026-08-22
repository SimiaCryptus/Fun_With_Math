/**
 * app.js — wiring: loading, filtering, inspector, tables, diagnostics.
 */
import * as S from "./schema.js";
import { GraphView } from "./graph.js";

/* ------------------------------ helpers ------------------------------ */

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const fmt = (v) => (v == null ? "—" : typeof v === "number" ? String(v) : String(v));
const conf = (v) => (typeof v === "number" ? v.toFixed(2) : "—");

/* ------------------------------- state ------------------------------- */

const state = {
  raw: null,
   src: null,              // URL the current graph came from (null ⇒ local file)
  graph: null,
  misplaced: [],
  index: new Map(),        // id -> { type, data }
  incident: new Map(),     // node id -> { out:[], in:[], morph:[], coh:[] }
  selection: null,
  tab: "nodes",
  filters: {
    layers: new Set(S.LAYERS),
    kinds: new Set(),      // empty ⇒ all
    statuses: new Set(),   // empty ⇒ all
    relations: new Set(),  // empty ⇒ all
    minConf: 0,
    query: "",
    edges: true,
    morphisms: true,
    coherence: false,
    labels: true,
    hideOrphans: false,
    depth: 0,              // 0 ⇒ focus mode off
  },
};

const view = new GraphView($("#graph-host"));
view.onSelect = (id, type) => selectItem(id, type);

/* ------------------------------ loading ------------------------------ */




/** Samples are declared in index.html as `#samples [data-src]` buttons. */
function buildSamples() {
   for (const btn of document.querySelectorAll("#samples [data-src]")) {
     const src = btn.dataset.src;
     if (!btn.title) btn.title = src;
     btn.addEventListener("click", () => loadUrl(src));
   }
}

function markActiveSample() {
   for (const btn of document.querySelectorAll("#samples [data-src]")) {
     btn.classList.toggle("on", !!state.src && btn.dataset.src === state.src);
   }
}

/* ----------------------- address-bar bookkeeping ---------------------- */

const currentSrc = () => new URLSearchParams(location.search).get("src");

/** Keep `?src=…` in sync with what is on screen, so the view is linkable. */
function setUrlSrc(src, { replace = false } = {}) {
   const url = new URL(location.href);
   if (src) url.searchParams.set("src", src);
   else url.searchParams.delete("src");
   const qs = url.searchParams.toString();
   const next = url.pathname + (qs ? `?${qs}` : "") + url.hash;
   const method = (replace || currentSrc() === (src || null)) ? "replaceState" : "pushState";
   history[method]({ src: src || null }, "", next);
}

/**
  * @param {string} url
  * @param {{history?: boolean, replace?: boolean}} opts
  *   history:false ⇒ we are *responding* to a URL change (popstate), don't push.
  */
async function loadUrl(url, { history: track = true, replace = false } = {}) {
   try {
     const res = await fetch(url, { cache: "no-store" });
     if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
     const json = await res.json();
     loadJson(json, url);
     state.src = url;
     $("#url-input").value = url;
     if (track) setUrlSrc(url, { replace });
     markActiveSample();
   } catch (err) {
     alert(`Could not load ${url}\n\n${err.message}\n\n` +
       `If you opened this page via file://, serve the directory instead:\n  python3 -m http.server`);
   }
}

function loadFile(file) {
   const fr = new FileReader();
   fr.onload = () => {
     try {
       loadJson(JSON.parse(String(fr.result)), file.name);
       // A local file has no address; drop a stale ?src so the bar never lies.
       state.src = null;
       setUrlSrc(null, { replace: true });
       markActiveSample();
     } catch (err) { alert(`Not valid JSON: ${err.message}`); }
   };
   fr.readAsText(file);
}

function loadJson(raw, label) {
  const { graph, misplaced } = S.normalizeGraph(raw);
  state.raw = raw;
  state.graph = graph;
  state.misplaced = misplaced;
  state.selection = null;

  indexGraph(graph);
  document.body.classList.add("has-graph");
  renderDocMeta(label);
  buildFilterChips();
  view.setData(graph);
  applyFilters();
  view.fit();
  renderTab();
  renderInspector(null);
}

function indexGraph(g) {
  state.index.clear();
  state.incident.clear();
  for (const n of g.nodes) {
    state.index.set(n.id, { type: "node", data: n });
    state.incident.set(n.id, { out: [], in: [], morph: [], coh: [] });
  }
  for (const e of g.edges || []) {
    state.index.set(e.id, { type: "edge", data: e });
    state.incident.get(e.from)?.out.push(e);
    state.incident.get(e.to)?.in.push(e);
  }
  for (const m of g.morphisms || []) {
    state.index.set(m.id, { type: "morphism", data: m });
    state.incident.get(m.from)?.morph.push(m);
    state.incident.get(m.to)?.morph.push(m);
  }
  for (const c of g.coherence || []) {
    state.index.set(c.id, { type: "coherence", data: c });
    for (const r of c.refs || []) state.incident.get(r)?.coh.push(c);
  }
}

function renderDocMeta(label) {
  const g = state.graph;
  const docs = (g.corpus && g.corpus.documents) || [];
  const st = S.computeStats(g);
  $("#doc-meta").replaceChildren(
    el("b", {}, docs.map((d) => d.title || d.path || d.id).join(", ") || label || "untitled"),
    ` · v${g.version || "?"} · ${st.nodes}n / ${st.edges}e / ${st.morphisms}m / ${st.obligations}c`,
    state.misplaced.length ? el("span", { class: "sev-warn" }, ` · ${state.misplaced.length} link(s) recovered from nodes[]`) : null,
  );
}

/* ------------------------------ filters ------------------------------ */

function counter(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    const k = keyFn(x);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function chip(host, label, color, count, isOn, toggle) {
  const c = el("span", { class: "chip" + (isOn() ? " on" : ""), onclick: () => { toggle(); applyFilters(); refreshChipStates(); } },
    color ? el("span", { class: "dot", style: `background:${color}` }) : null,
    label,
    count != null ? el("span", { class: "n" }, count) : null,
  );
  c._sync = () => c.classList.toggle("on", isOn());
  host.append(c);
  return c;
}

let chipEls = [];
function refreshChipStates() { chipEls.forEach((c) => c._sync && c._sync()); }

function buildFilterChips() {
  chipEls = [];
  const g = state.graph;
  const f = state.filters;

  const layerCount = counter(g.nodes, S.layerOf);
  const kindCount = counter(g.nodes, (n) => n.kind);
  const statusCount = counter(g.nodes, (n) => n.status || "unknown");
  const relCount = counter(g.edges || [], (e) => e.relation);

  const mk = (hostSel, items, set) => {
    const host = $(hostSel);
    host.replaceChildren();
    for (const [key, count, color] of items) {
      chipEls.push(chip(host, key, color, count,
        () => (set.size === 0 ? true : set.has(key)),
        () => {
          if (set.size === 0) { // "all" ⇒ isolate the clicked one
            items.forEach(([k]) => set.add(k));
          }
          set.has(key) ? set.delete(key) : set.add(key);
          if (set.size === items.length) set.clear();
        }));
    }
    host.append(el("span", {
      class: "chip", onclick: () => { set.clear(); applyFilters(); refreshChipStates(); },
    }, "all"));
  };

  // layers use an explicit set (all-on by default)
  const lHost = $("#f-layers");
  lHost.replaceChildren();
  for (const l of S.LANE_ORDER) {
    if (!layerCount.get(l)) continue;
    chipEls.push(chip(lHost, l, S.LAYER_COLOR[l], layerCount.get(l),
      () => f.layers.has(l),
      () => (f.layers.has(l) ? f.layers.delete(l) : f.layers.add(l))));
  }

  mk("#f-kinds", [...kindCount].sort().map(([k, c]) => [k, c, S.LAYER_COLOR[S.NODE_KIND_LAYER[k]]]), f.kinds);
  mk("#f-status", [...statusCount].sort().map(([k, c]) => [k, c, null]), f.statuses);
  mk("#f-relations", [...relCount].sort().map(([k, c]) => [k, c, null]), f.relations);

  // legend
  $("#legend").replaceChildren(
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#7f8ea3" }), "logical / structural"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#fbbf24" }), "evidential"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#ff6b6b" }), "conflict"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#a78bfa" }), "cross-layer"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#2dd4bf" }), "contextual"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#38bdf8;border-top-style:dashed" }), "morphism"),
    el("div", { class: "row" }, el("span", { class: "sw", style: "border-color:#f472b6;border-top-style:dotted" }), "coherence"),
  );
}

function matchesQuery(n, q) {
  if (!q) return false;
  const hay = [
    n.id, n.name, n.statement, n.formal, n.kind, n.status, n.domain,
    ...(n.aliases || []), ...(n.tags || []),
    ...(n.sources || []).map((s) => `${s.file} ${s.heading} ${s.quote}`),
  ].join(" ").toLowerCase();
  return hay.includes(q);
}

function passes(n, f) {
  if (!f.layers.has(S.layerOf(n))) return false;
  if (f.kinds.size && !f.kinds.has(n.kind)) return false;
  if (f.statuses.size && !f.statuses.has(n.status || "unknown")) return false;
  if (typeof n.confidence === "number" && n.confidence < f.minConf) return false;
  return true;
}

function applyFilters() {
  if (!state.graph) return;
  const g = state.graph;
  const f = state.filters;
  const q = f.query.trim().toLowerCase();

  let visible = new Set(g.nodes.filter((n) => passes(n, f)).map((n) => n.id));
  const matches = new Set(g.nodes.filter((n) => matchesQuery(n, q)).map((n) => n.id));

  if (q) {
    // keep matches plus their immediate context
    const keep = new Set(matches);
    for (const e of g.edges || []) {
      if (matches.has(e.from)) keep.add(e.to);
      if (matches.has(e.to)) keep.add(e.from);
    }
    visible = new Set([...visible].filter((id) => keep.has(id)));
  }

  if (f.depth > 0 && state.selection && state.index.get(state.selection)?.type === "node") {
    const reach = new Set([state.selection]);
    let frontier = [state.selection];
    for (let d = 0; d < f.depth; d++) {
      const next = [];
      for (const id of frontier) {
        const inc = state.incident.get(id);
        if (!inc) continue;
        for (const e of [...inc.out, ...inc.in]) for (const o of [e.from, e.to]) if (!reach.has(o)) { reach.add(o); next.push(o); }
        for (const m of inc.morph) for (const o of [m.from, m.to]) if (!reach.has(o)) { reach.add(o); next.push(o); }
      }
      frontier = next;
    }
    visible = new Set([...visible].filter((id) => reach.has(id)));
  }

  const links = [];
  if (f.edges) {
    for (const e of g.edges || []) {
      if (f.relations.size && !f.relations.has(e.relation)) continue;
      if (!visible.has(e.from) || !visible.has(e.to)) continue;
      links.push({
        id: e.id, from: e.from, to: e.to, kind: "edge",
        cls: S.RELATION_CLASS[e.relation] || "rel-logic",
        title: `${e.relation}  (${conf(e.confidence)})\n${e.from}\n→ ${e.to}${e.notes ? "\n\n" + e.notes : ""}`,
      });
    }
  }
  if (f.morphisms) {
    for (const m of g.morphisms || []) {
      if (!visible.has(m.from) || !visible.has(m.to)) continue;
      links.push({
        id: m.id, from: m.from, to: m.to, kind: "morphism", cls: "morphism",
        title: `⟿ ${m.kind} [${m.state || "?"}]\n${m.from}\n→ ${m.to}${m.loss ? "\n\nloss: " + m.loss : ""}`,
      });
    }
  }
  if (f.coherence) {
    for (const c of g.coherence || []) {
      const refs = (c.refs || []).filter((r) => visible.has(r));
      for (let i = 0; i + 1 < refs.length; i++) {
        links.push({
          id: `${c.id}#${i}`, from: refs[i], to: refs[i + 1], kind: "coherence", cls: "coherence",
          title: `${c.kind} coherence [${c.status}]\n${c.requirement || ""}`,
        });
      }
    }
  }

  if (f.hideOrphans) {
    const touched = new Set(links.flatMap((l) => [l.from, l.to]));
    visible = new Set([...visible].filter((id) => touched.has(id)));
  }

  view.render(visible, links.filter((l) => visible.has(l.from) && visible.has(l.to)), matches);
  view.setLabels(f.labels);

  $("#counts").textContent =
    `${visible.size}/${g.nodes.length} nodes · ${links.length} links shown`;
  renderTab();
}

/* ----------------------------- inspector ----------------------------- */

function link(id, label) {
  const entry = state.index.get(id);
  const text = label || (entry ? (entry.data.name || entry.data.id) : id);
  return el("span", {
    class: "lnk", title: id,
    onclick: () => selectItem(id, entry ? entry.type : "node", true),
  }, text);
}

function badge(text, style) { return el("span", { class: "badge" + (style ? " " + style.cls : ""), style: style?.css }, text); }

function sourcesBlock(sources) {
  if (!sources || !sources.length) return null;
  return [
    el("h3", {}, "Sources"),
    ...sources.map((s) => el("div", { class: "src" },
      el("div", { class: "loc" }, [s.file, s.heading, s.lines ? `L${s.lines[0]}–${s.lines[1]}` : null].filter(Boolean).join(" › ")),
      s.quote ? el("blockquote", {}, `“${s.quote}”`) : null,
    )),
  ];
}

function kv(pairs) {
  const rows = pairs.filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!rows.length) return null;
  const dl = el("dl", { class: "kv" });
  for (const [k, v] of rows) {
    dl.append(el("dt", {}, k));
    dl.append(el("dd", {}, v.nodeType ? v : String(v)));
  }
  return dl;
}

function renderInspector(id) {
  const host = $("#inspector");
  host.replaceChildren();
  if (!id || !state.index.has(id)) {
    host.append(el("div", { class: "placeholder" }, "Select a node, edge, morphism or obligation."));
    return;
  }
  const { type, data } = state.index.get(id);
  if (type === "node") renderNodeInspector(host, data);
  else if (type === "edge") renderEdgeInspector(host, data);
  else if (type === "morphism") renderMorphismInspector(host, data);
  else renderCoherenceInspector(host, data);
}

function renderNodeInspector(host, n) {
  const layer = S.layerOf(n);
  host.append(
    el("h2", {}, n.name || n.id),
    el("div", { class: "badges" },
      badge(layer, { cls: "layer", css: `background:${S.LAYER_COLOR[layer]}` }),
      badge(n.kind),
      badge(n.status || "unknown"),
      typeof n.confidence === "number" ? badge(`conf ${conf(n.confidence)}`) : null,
      n.domain ? badge(n.domain) : null,
      ...(n.tags || []).map((t) => badge("#" + t)),
    ),
    el("div", { class: "mono", style: "color:#66748c" }, n.id),
    el("p", {}, n.statement || ""),
    n.formal ? el("div", { class: "code" }, n.formal) : null,
    kv([
      ["aliases", (n.aliases || []).join(", ")],
      ["notation", (n.notation || []).join(", ")],
      ["scope", n.scope],
      ["first seen", n.first_seen],
      ["layer rationale", n.layer_rationale],
    ]),
  );

  if (n.representation) {
    const r = n.representation;
    host.append(el("h3", {}, "Representation"));
    host.append(kv([["layer", r.layer], ["form", r.form]]));
    if (r.content) host.append(el("div", { class: "code" }, r.content));
    if (r.interfaces?.length) {
      host.append(el("ul", { class: "plain" }, ...r.interfaces.map((i) => el("li", {},
        el("span", { class: "rel-tag" }, `→${i.to}${i.via ? " via " + i.via : ""}${i.available ? "" : " (unavailable)"}${i.lossy ? " lossy" : ""}`),
        i.target ? link(i.target) : el("span", { style: "color:#8b98ab" }, i.note || "—"),
      ))));
    }
  }

  if (n.attributes?.length) {
    host.append(el("h3", {}, "Attributes"));
    host.append(kv(n.attributes.map((a) => [
      a.key,
      `${fmt(a.value)}${a.unit ? " " + a.unit : ""}${a.error != null ? " ±" + a.error : ""}${a.layer ? "  [" + a.layer + "]" : ""}`,
    ])));
  }

  if (n.shape) {
    host.append(el("h3", {}, "Shape"));
    host.append(kv([["descriptor", n.shape.descriptor], ["dims", (n.shape.dims || []).join(", ")]]));
  }

  if (n.similar_to?.length) {
    host.append(el("h3", {}, "Similar to"));
    host.append(el("ul", { class: "plain" }, ...n.similar_to.map((s) =>
      el("li", {}, el("span", { class: "rel-tag" }, `${s.score?.toFixed?.(2) ?? s.score}${s.basis ? " " + s.basis : ""}`), link(s.to)))));
  }

  if (n.social) {
    host.append(el("h3", {}, "Social"));
    host.append(kv([
      ["program", n.social.program],
      ["norms", (n.social.norms || []).join("; ")],
      ["folklore", (n.social.folklore || []).join("; ")],
      ["blind spots", (n.social.blind_spots || []).join("; ")],
      ["references", (n.social.references || []).map((r) => r.text).join("; ")],
    ]));
  }
  if (n.ecological) {
    host.append(el("h3", {}, "Ecological"));
    host.append(kv([
      ["substrate", n.ecological.substrate],
      ["constraints", (n.ecological.constraints || []).join("; ")],
      ["resources", (n.ecological.resources || []).join("; ")],
      ["affordances", (n.ecological.affordances || []).join("; ")],
    ]));
  }

  const inc = state.incident.get(n.id) || { out: [], in: [], morph: [], coh: [] };
  if (inc.out.length || inc.in.length) {
    host.append(el("h3", {}, `Relations (${inc.out.length + inc.in.length})`));
    host.append(el("ul", { class: "plain" },
      ...inc.out.map((e) => el("li", {}, el("span", { class: "rel-tag" }, "→ " + e.relation), link(e.to))),
      ...inc.in.map((e) => el("li", {}, el("span", { class: "rel-tag" }, "← " + e.relation), link(e.from))),
    ));
  }
  if (inc.morph.length) {
    host.append(el("h3", {}, `Morphisms (${inc.morph.length})`));
    host.append(el("ul", { class: "plain" }, ...inc.morph.map((m) => el("li", {},
      el("span", { class: "rel-tag" }, `${m.from === n.id ? "⟿" : "⟽"} ${m.kind}`),
      link(m.from === n.id ? m.to : m.from),
    ))));
  }
  if (inc.coh.length) {
    host.append(el("h3", {}, `Obligations (${inc.coh.length})`));
    host.append(el("ul", { class: "plain" }, ...inc.coh.map((c) => el("li", {},
      el("span", { class: "rel-tag" }, `${c.kind}/${c.status}`), link(c.id, c.id)))));
  }

  if (n.notes) { host.append(el("h3", {}, "Extractor notes")); host.append(el("p", {}, n.notes)); }
  const sb = sourcesBlock(n.sources);
  if (sb) host.append(...sb);
}

function renderEdgeInspector(host, e) {
  host.append(
    el("h2", {}, e.relation),
    el("div", { class: "badges" }, badge("edge"), badge(S.RELATION_CLASS[e.relation] || "?"),
      typeof e.confidence === "number" ? badge(`conf ${conf(e.confidence)}`) : null,
      typeof e.strength === "number" ? badge(`strength ${conf(e.strength)}`) : null),
    el("div", { class: "mono", style: "color:#66748c" }, e.id),
    kv([
      ["from", link(e.from)],
      ["to", link(e.to)],
      ["label", e.label],
      ["conditions", e.conditions],
      ["notes", e.notes],
    ]),
  );
  const sb = sourcesBlock(e.sources);
  if (sb) host.append(...sb);
}

function renderMorphismInspector(host, m) {
  const sig = S.MORPHISM_SIGNATURE[m.kind];
  host.append(
    el("h2", {}, `⟿ ${m.kind}`),
    el("div", { class: "badges" }, badge("morphism"), badge(m.state || "unknown"),
      typeof m.confidence === "number" ? badge(`conf ${conf(m.confidence)}`) : null),
    el("div", { class: "mono", style: "color:#66748c" }, m.id),
    kv([
      ["signature", sig ? `${sig.from.join("|")} → ${sig.to.join("|")}` : "—"],
      ["from", link(m.from)],
      ["to", link(m.to)],
      ["loss", m.loss],
      ["cost", m.cost ? `${m.cost.measure}${m.cost.value != null ? " " + m.cost.value : ""}${m.cost.unit ? " " + m.cost.unit : ""}${m.cost.note ? " — " + m.cost.note : ""}` : null],
      ["obligations", (m.obligations || []).length ? el("span", {}, ...(m.obligations || []).map((o) => [link(o, o), " "])) : null],
      ["notes", m.notes],
    ]),
  );
  const sb = sourcesBlock(m.sources);
  if (sb) host.append(...sb);
}

function renderCoherenceInspector(host, c) {
  const law = S.COHERENCE_LAW[c.kind];
  host.append(
    el("h2", {}, `${c.kind} coherence`),
    el("div", { class: "badges" }, badge(c.status || "unknown"),
      law ? badge(law.between.join(" ↔ ")) : null,
      typeof c.confidence === "number" ? badge(`conf ${conf(c.confidence)}`) : null),
    el("div", { class: "mono", style: "color:#66748c" }, c.id),
    law ? el("p", { style: "color:#8b98ab" }, law.requirement) : null,
    el("p", {}, c.requirement || ""),
    kv([
      ["cost", c.cost ? `${c.cost.measure}${c.cost.note ? " — " + c.cost.note : ""}` : null],
      ["notes", c.notes],
    ]),
    el("h3", {}, "Refs"),
    el("ul", { class: "plain" }, ...(c.refs || []).map((r) => el("li", {}, link(r, r)))),
  );
  const sb = sourcesBlock(c.sources);
  if (sb) host.append(...sb);
}

function selectItem(id, type, center = false) {
  state.selection = id;
  if (!id) { view.select(null, true); renderInspector(null); markTableSelection(); return; }
  if (type === "node") {
    view.select(id, true);
    if (center) view.centerOn(id);
  } else {
    view.selection = null;
    view.highlight(null);
  }
  renderInspector(id);
  markTableSelection();
  if (state.filters.depth > 0) applyFilters();
}

/* ------------------------------- tables ------------------------------ */

function table(cols, rows, onRow) {
  const t = el("table", { class: "grid" });
  t.append(el("thead", {}, el("tr", {}, ...cols.map((c) => el("th", { class: c.mono ? "mono" : null }, c.label)))));
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr", { dataset: { id: r._id || "" }, onclick: () => onRow && onRow(r) });
    for (const c of cols) {
      const v = c.get(r);
      tr.append(el("td", { class: [c.mono ? "mono" : null, c.trunc ? "trunc" : null].filter(Boolean).join(" ") || null, title: c.trunc ? String(v ?? "") : null },
        v && v.nodeType ? v : fmt(v)));
    }
    tb.append(tr);
  }
  t.append(tb);
  return t;
}

function markTableSelection() {
  document.querySelectorAll("#tab-body tbody tr").forEach((tr) => {
    tr.classList.toggle("sel", tr.dataset.id && tr.dataset.id === state.selection);
  });
}

function renderTab() {
  const body = $("#tab-body");
  body.replaceChildren();
  const g = state.graph;
  if (!g) { body.append(el("div", { class: "empty-note" }, "No graph loaded.")); return; }
  const pick = (r) => selectItem(r._id, r._type, true);

  switch (state.tab) {
    case "nodes": {
      const rows = g.nodes.map((n) => ({ ...n, _id: n.id, _type: "node", _layer: S.layerOf(n) }));
      body.append(table([
        { label: "layer", get: (r) => el("span", { class: "pill", style: `color:${S.LAYER_COLOR[r._layer]}` }, r._layer) },
        { label: "kind", get: (r) => r.kind, mono: true },
        { label: "name", get: (r) => r.name },
        { label: "status", get: (r) => r.status, mono: true },
        { label: "conf", get: (r) => conf(r.confidence), mono: true },
        { label: "statement", get: (r) => r.statement, trunc: true },
        { label: "id", get: (r) => r.id, mono: true, trunc: true },
      ], rows, pick));
      break;
    }
    case "edges": {
      const rows = (g.edges || []).map((e) => ({ ...e, _id: e.id, _type: "edge" }));
      body.append(table([
        { label: "relation", get: (r) => r.relation, mono: true },
        { label: "from", get: (r) => link(r.from), trunc: true },
        { label: "to", get: (r) => link(r.to), trunc: true },
        { label: "conf", get: (r) => conf(r.confidence), mono: true },
        { label: "notes", get: (r) => r.notes || (r.sources?.[0]?.quote ?? ""), trunc: true },
      ], rows, pick));
      break;
    }
    case "morphisms": {
      const rows = (g.morphisms || []).map((m) => ({ ...m, _id: m.id, _type: "morphism" }));
      body.append(rows.length ? table([
        { label: "kind", get: (r) => r.kind, mono: true },
        { label: "state", get: (r) => r.state, mono: true },
        { label: "from", get: (r) => link(r.from), trunc: true },
        { label: "to", get: (r) => link(r.to), trunc: true },
        { label: "loss", get: (r) => r.loss, trunc: true },
        { label: "conf", get: (r) => conf(r.confidence), mono: true },
      ], rows, pick) : el("div", { class: "empty-note" }, "No morphisms in this graph."));
      break;
    }
    case "coherence": {
      const rows = (g.coherence || []).map((c) => ({ ...c, _id: c.id, _type: "coherence" }));
      body.append(rows.length ? table([
        { label: "kind", get: (r) => r.kind, mono: true },
        { label: "status", get: (r) => el("span", { class: "pill " + (r.status === "violated" ? "sev-error" : r.status === "discharged" ? "sev-ok" : "sev-warn") }, r.status) },
        { label: "requirement", get: (r) => r.requirement, trunc: true },
        { label: "refs", get: (r) => (r.refs || []).join(", "), mono: true, trunc: true },
        { label: "cost", get: (r) => r.cost?.note || r.cost?.measure, trunc: true },
      ], rows, pick) : el("div", { class: "empty-note" }, "No coherence obligations."));
      break;
    }
    case "clusters": {
      const rows = (g.clusters || []).map((c) => ({ ...c, _id: c.root || "", _type: "node" }));
      body.append(rows.length ? table([
        { label: "name", get: (r) => r.name },
        { label: "kind", get: (r) => r.kind, mono: true },
        { label: "root", get: (r) => (r.root ? link(r.root) : "—"), trunc: true },
        { label: "layers", get: (r) => (r.layers || []).join(", "), mono: true },
        { label: "members", get: (r) => el("span", {}, ...(r.members || []).flatMap((m, i) => [i ? ", " : "", link(m)])), trunc: true },
        { label: "summary", get: (r) => r.summary, trunc: true },
      ], rows, pick) : el("div", { class: "empty-note" }, "No clusters."));
      break;
    }
    case "issues": {
      const rows = g.unresolved || [];
      body.append(rows.length ? table([
        { label: "kind", get: (r) => el("span", { class: "pill sev-warn" }, r.kind) },
        { label: "description", get: (r) => r.description, trunc: true },
        { label: "refs", get: (r) => el("span", {}, ...(r.refs || []).flatMap((m, i) => [i ? ", " : "", link(m, m)])), trunc: true },
        { label: "layers", get: (r) => (r.layers || []).join(", "), mono: true },
      ], rows, null) : el("div", { class: "empty-note" }, "No unresolved issues recorded."));
      break;
    }
    case "diagnostics": {
      const problems = S.validateTheoryGraph(g);
      const advisory = S.findMissingMorphisms(g);
      const wrap = el("div");
      wrap.append(el("h3", { style: "margin:2px 0 6px;font-size:11px;color:#8b98ab" },
        problems.length ? `${problems.length} structural problem(s)` : "Structurally valid ✓"));
      if (state.misplaced.length) {
        wrap.append(el("div", { class: "sev-warn", style: "margin-bottom:6px" },
          `Recovered ${state.misplaced.length} link object(s) that were stored inside nodes[]: `
          + state.misplaced.map((m) => `${m.id} (${m.as})`).join(", ")));
      }
      if (problems.length) {
        wrap.append(el("ul", { class: "plain" }, ...problems.map((p) =>
          el("li", { class: "sev-error mono" }, p))));
      }
      if (advisory.length) {
        wrap.append(el("h3", { style: "margin:12px 0 6px;font-size:11px;color:#8b98ab" }, `${advisory.length} advisory`));
        wrap.append(el("ul", { class: "plain" }, ...advisory.map((a) =>
          el("li", { class: "sev-warn" }, `${a.kind}: ${a.description}`))));
      }
      body.append(wrap);
      break;
    }
    case "stats": {
      const computed = S.computeStats(g);
      const declared = g.stats || {};
      const dist = (title, obj) => el("div", { style: "margin-bottom:10px" },
        el("h3", { style: "margin:2px 0 4px;font-size:11px;color:#8b98ab" }, title),
        el("div", { class: "mono" }, Object.entries(obj || {}).sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k}: ${v}`).join("   ") || "—"));
      body.append(
        el("div", { class: "mono", style: "margin-bottom:8px" },
          `computed  nodes=${computed.nodes} edges=${computed.edges} morphisms=${computed.morphisms} ` +
          `obligations=${computed.obligations} cross_layer_edges=${computed.cross_layer_edges}`),
        el("div", { class: "mono", style: "margin-bottom:12px;color:#8b98ab" },
          `declared  ${Object.entries(declared).filter(([, v]) => typeof v !== "object")
            .map(([k, v]) => `${k}=${v}`).join(" ") || "—"}`),
        dist("by layer", computed.by_layer),
        dist("by kind", computed.by_kind),
        dist("by relation", computed.by_relation),
        dist("by morphism", computed.by_morphism),
        dist("by coherence", computed.by_coherence),
      );
      break;
    }
  }
  markTableSelection();
}

/* ------------------------------- export ------------------------------ */

function exportVisible() {
  if (!state.graph) return;
  const g = state.graph;
  const vis = new Set([...view.nodes.keys()].filter((id) => view.visible?.has(id)));
  const out = {
    ...g,
    nodes: g.nodes.filter((n) => vis.has(n.id)),
    edges: (g.edges || []).filter((e) => vis.has(e.from) && vis.has(e.to)),
    morphisms: (g.morphisms || []).filter((m) => vis.has(m.from) && vis.has(m.to)),
    coherence: (g.coherence || []).filter((c) => (c.refs || []).some((r) => vis.has(r))),
    clusters: (g.clusters || []).map((c) => ({ ...c, members: (c.members || []).filter((m) => vis.has(m)) }))
      .filter((c) => c.members.length),
  };
  out.stats = S.computeStats(out);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = el("a", { href: URL.createObjectURL(blob), download: "subgraph.theory_graph.json" });
  document.body.append(a); a.click(); a.remove();
}

/* ------------------------------- wiring ------------------------------ */

function wire() {
  buildSamples();

  $("#file-input").addEventListener("change", (e) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = "";
  });
  $("#url-load").addEventListener("click", () => {
    const u = $("#url-input").value.trim();
    if (u) loadUrl(u);
  });
  $("#url-input").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#url-load").click(); });

  $("#q").addEventListener("input", (e) => { state.filters.query = e.target.value; applyFilters(); });
  $("#conf").addEventListener("input", (e) => {
    state.filters.minConf = Number(e.target.value);
    $("#conf-val").textContent = state.filters.minConf.toFixed(2);
    applyFilters();
  });
  $("#depth").addEventListener("input", (e) => {
    state.filters.depth = Number(e.target.value);
    $("#depth-val").textContent = state.filters.depth ? `${state.filters.depth} hop(s)` : "off";
    applyFilters();
  });

  const toggles = { "#o-edges": "edges", "#o-morphisms": "morphisms", "#o-coherence": "coherence", "#o-labels": "labels", "#o-orphans": "hideOrphans" };
  for (const [sel, key] of Object.entries(toggles)) {
    $(sel).addEventListener("change", (e) => { state.filters[key] = e.target.checked; applyFilters(); });
  }

  $("#btn-fit").addEventListener("click", () => view.fit());
  $("#btn-relayout").addEventListener("click", () => { view.layout(); applyFilters(); view.fit(); });
  $("#btn-export").addEventListener("click", exportVisible);

  for (const t of document.querySelectorAll(".tab")) {
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
      t.classList.add("active");
      state.tab = t.dataset.tab;
      document.body.classList.remove("bottom-collapsed");
      renderTab();
    });
  }
  $("#bottom-toggle").addEventListener("click", (e) => {
    document.body.classList.toggle("bottom-collapsed");
    e.target.textContent = document.body.classList.contains("bottom-collapsed") ? "▴" : "▾";
  });

  // drag & drop anywhere
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); if (++dragDepth === 1) document.body.classList.add("dragging"); });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  window.addEventListener("drop", (e) => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  window.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "f") view.fit();
    if (e.key === "Escape") selectItem(null, null);
    if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
  });

  window.addEventListener("resize", () => { /* svg is 100% — nothing to do */ });

   // Back/forward between graphs.
   window.addEventListener("popstate", (e) => {
     const src = (e.state && "src" in e.state) ? e.state.src : currentSrc();
     if (src && src !== state.src) {
       $("#url-input").value = src;
       loadUrl(src, { history: false });
     } else if (!src) {
       state.src = null;
       markActiveSample();
     }
   });

   const src = currentSrc();
   if (src) { $("#url-input").value = src; loadUrl(src, { replace: true }); }
   else markActiveSample();
}

wire();