/**
 * app.js — wiring: loading, filtering, inspector, tables, request queue.
 */
import * as K from './schema.js';
import { GraphView } from './graph.js';

/* ------------------------------ helpers ------------------------------ */

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat(3)) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

const fmt = (v) => (v == null ? '—' : String(v));
const conf = (v) => (typeof v === 'number' ? v.toFixed(2) : '—');

/* ------------------------------- state ------------------------------- */

const state = {
  raw: null,
  src: null,
  graph: null,
  repairs: [],
  requests: [],
  requestsDerived: false,
  index: new Map(), // id -> {type, data}
  incident: new Map(), // entry id -> {out:[], in:[], requests:[]}
  selection: null,
  tab: 'entries',
  filters: {
    statuses: new Set(), // empty ⇒ all
    groups: new Set(),
    kinds: new Set(),
    roles: new Set(),
    layers: new Set(),
    relGroups: new Set(),
    minMentions: 0,
    query: '',
    labels: true,
    hideOrphans: false,
    needsOnly: false,
    depth: 0,
    laneMode: 'status',
  },
};

const view = new GraphView($('#graph-host'));
view.onSelect = (id, type) => selectItem(id, type);

/* ------------------------------ loading ------------------------------ */

function buildSamples() {
  for (const btn of document.querySelectorAll('#samples [data-src]')) {
    const src = btn.dataset.src;
    if (!btn.title) btn.title = src;
    btn.addEventListener('click', () => loadUrl(src));
  }
}

function markActiveSample() {
  for (const btn of document.querySelectorAll('#samples [data-src]')) {
    btn.classList.toggle('on', !!state.src && btn.dataset.src === state.src);
  }
}

const currentSrc = () => new URLSearchParams(location.search).get('src');

function setUrlSrc(src, { replace = false } = {}) {
  const url = new URL(location.href);
  if (src) url.searchParams.set('src', src);
  else url.searchParams.delete('src');
  const qs = url.searchParams.toString();
  const next = url.pathname + (qs ? `?${qs}` : '') + url.hash;
  const method = replace || currentSrc() === (src || null) ? 'replaceState' : 'pushState';
  history[method]({ src: src || null }, '', next);
}

async function loadUrl(url, { history: track = true, replace = false } = {}) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    loadJson(json, url);
    state.src = url;
    $('#url-input').value = url;
    if (track) setUrlSrc(url, { replace });
    markActiveSample();
  } catch (err) {
    alert(
      `Could not load ${url}\n\n${err.message}\n\n` +
        `If you opened this page via file://, serve the directory instead:\n  python3 -m http.server`
    );
  }
}

function loadFile(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      loadJson(JSON.parse(String(fr.result)), file.name);
      state.src = null;
      setUrlSrc(null, { replace: true });
      markActiveSample();
    } catch (err) {
      alert(`Not valid JSON: ${err.message}`);
    }
  };
  fr.readAsText(file);
}

function loadJson(raw, label) {
  const { graph, repairs } = K.normalizeGraph(raw);
  state.raw = raw;
  state.graph = graph;
  state.repairs = repairs;
  state.selection = null;

  state.requestsDerived = !(graph.requests && graph.requests.length);
  state.requests = state.requestsDerived ? K.findDefinitionGaps(graph) : graph.requests;

  indexGraph(graph);
  document.body.classList.add('has-graph');
  renderDocMeta(label);
  buildFilterChips();
  view.setData(graph);
  view.setLaneMode(state.filters.laneMode);
  applyFilters();
  view.fit();
  renderTab();
  renderInspector(null);
}

function indexGraph(g) {
  state.index.clear();
  state.incident.clear();
  for (const e of g.entries) {
    state.index.set(e.id, { type: 'entry', data: e });
    state.incident.set(e.id, { out: [], in: [], requests: [] });
  }
  for (const edge of g.edges || []) {
    state.index.set(edge.id, { type: 'edge', data: edge });
    state.incident.get(edge.from)?.out.push(edge);
    state.incident.get(edge.to)?.in.push(edge);
  }
  for (const r of state.requests) {
    state.index.set(r.id, { type: 'request', data: r });
    state.incident.get(r.entry)?.requests.push(r);
  }
  for (const t of g.topics || []) state.index.set(t.id, { type: 'topic', data: t });
}

function renderDocMeta(label) {
  const g = state.graph;
  const docs = (g.corpus && g.corpus.documents) || [];
  const st = K.computeStats({ ...g, requests: state.requests });
  const companion = g.companion && g.companion.theory_graph;
  $('#doc-meta').replaceChildren(
    el('b', {}, docs.map((d) => d.title || d.path || d.id).join(', ') || label || 'untitled'),
    ` · v${g.version || '?'} · ${st.entries}e / ${st.edges}r / ${st.requests}q · ` +
      `${st.undefined_entries} undefined`,
    companion
      ? el(
          'a',
          {
            class: 'lnk',
            style: 'margin-left:8px',
            href: `../theory/index.html?src=${encodeURIComponent(resolveCompanion(companion))}`,
            title: companion,
          },
          '→ theory graph'
        )
      : null,
    state.repairs.length
      ? el('span', { class: 'sev-warn' }, ` · ${state.repairs.length} repair(s)`)
      : null
  );
}

/** Companion paths are written relative to the graph file, not the page. */
function resolveCompanion(p) {
  if (!state.src || /^([a-z]+:)?\/\//i.test(p) || p.startsWith('/')) return p;
  const base = state.src.slice(0, state.src.lastIndexOf('/') + 1);
  return base + p;
}

/* ------------------------------ filters ------------------------------ */

function counter(list, keyFn) {
  const m = new Map();
  for (const x of list) {
    for (const k of [].concat(keyFn(x))) m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function chip(host, label, color, count, isOn, toggle) {
  const c = el(
    'span',
    {
      class: 'chip' + (isOn() ? ' on' : ''),
      onclick: () => {
        toggle();
        applyFilters();
        refreshChipStates();
      },
    },
    color ? el('span', { class: 'dot', style: `background:${color}` }) : null,
    String(label).replace(/_/g, ' '),
    count != null ? el('span', { class: 'n' }, count) : null
  );
  c._sync = () => c.classList.toggle('on', isOn());
  host.append(c);
  return c;
}

let chipEls = [];
function refreshChipStates() {
  chipEls.forEach((c) => c._sync && c._sync());
}

function buildFilterChips() {
  chipEls = [];
  const g = state.graph;
  const f = state.filters;

  const statusCount = counter(g.entries, (e) => e.definition_status || 'unknown');
  const groupCount = counter(g.entries, (e) => K.groupOf(e));
  const kindCount = counter(g.entries, (e) => e.kind);
  const roleCount = counter(g.entries, (e) => e.role || '—');
  const layerCount = counter(g.entries, (e) => (e.layers && e.layers.length ? e.layers : [K.NO_LAYER]));
  const relGroupCount = counter(g.edges || [], (e) => K.RELATION_GROUP[e.relation] || 'discourse');

  const mk = (hostSel, items, set) => {
    const host = $(hostSel);
    host.replaceChildren();
    for (const [key, count, color] of items) {
      chipEls.push(
        chip(
          host,
          key,
          color,
          count,
          () => (set.size === 0 ? true : set.has(key)),
          () => {
            if (set.size === 0) items.forEach(([k]) => set.add(k));
            set.has(key) ? set.delete(key) : set.add(key);
            if (set.size === items.length) set.clear();
          }
        )
      );
    }
    host.append(
      el(
        'span',
        {
          class: 'chip',
          onclick: () => {
            set.clear();
            applyFilters();
            refreshChipStates();
          },
        },
        'all'
      )
    );
  };

  mk(
    '#f-status',
    K.DEFINITION_STATUSES.filter((s) => statusCount.get(s)).map((s) => [
      s,
      statusCount.get(s),
      K.STATUS_COLOR[s],
    ]),
    f.statuses
  );
  mk(
    '#f-groups',
    K.ENTRY_GROUPS.filter((s) => groupCount.get(s)).map((s) => [s, groupCount.get(s), K.GROUP_COLOR[s]]),
    f.groups
  );
  mk(
    '#f-kinds',
    [...kindCount].sort().map(([k, c]) => [k, c, K.GROUP_COLOR[K.ENTRY_KIND_GROUP[k]]]),
    f.kinds
  );
  mk(
    '#f-roles',
    [...roleCount].sort().map(([k, c]) => [k, c, null]),
    f.roles
  );
  mk(
    '#f-layers',
    [...layerCount].sort().map(([k, c]) => [k, c, K.LAYER_COLOR[k] || '#64748b']),
    f.layers
  );
  mk(
    '#f-relations',
    K.RELATION_GROUPS.filter((s) => relGroupCount.get(s)).map((s) => [
      s,
      relGroupCount.get(s),
      K.RELATION_GROUP_COLOR[s],
    ]),
    f.relGroups
  );

  $('#legend').replaceChildren(
    ...K.RELATION_GROUPS.map((grp) =>
      el(
        'div',
        { class: 'row' },
        el('span', { class: 'sw', style: `border-color:${K.RELATION_GROUP_COLOR[grp]}` }),
        grp
      )
    ),
    el('div', { class: 'row sep' }, '◇ language   ○ content   ⬡ context'),
    el('div', { class: 'row' }, 'dashed outline = needs a definition'),
    el('div', { class: 'row' }, 'size = mention count')
  );
}

function matchesQuery(e, q) {
  if (!q) return false;
  const hay = [
    e.id,
    e.label,
    e.kind,
    e.definition_status,
    e.role,
    e.domain,
    e.gloss && e.gloss.text,
    e.layer_drift,
    ...(e.aliases || []),
    ...(e.symbols || []),
    ...(e.tags || []),
    ...(e.senses || []).map((s) => `${s.discriminator || ''} ${(s.gloss && s.gloss.text) || ''}`),
    ...(e.mentions || []).map((m) => `${m.source?.file} ${m.source?.heading} ${m.source?.quote}`),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

function passes(e, f) {
  if (f.statuses.size && !f.statuses.has(e.definition_status || 'unknown')) return false;
  if (f.groups.size && !f.groups.has(K.groupOf(e))) return false;
  if (f.kinds.size && !f.kinds.has(e.kind)) return false;
  if (f.roles.size && !f.roles.has(e.role || '—')) return false;
  if (f.layers.size) {
    const ls = e.layers && e.layers.length ? e.layers : [K.NO_LAYER];
    if (!ls.some((l) => f.layers.has(l))) return false;
  }
  if (K.mentionCount(e) < f.minMentions) return false;
  if (f.needsOnly && !K.needsDefinition(e)) return false;
  return true;
}

function applyFilters() {
  if (!state.graph) return;
  const g = state.graph;
  const f = state.filters;
  const q = f.query.trim().toLowerCase();

  let visible = new Set(g.entries.filter((e) => passes(e, f)).map((e) => e.id));
  const matches = new Set(g.entries.filter((e) => matchesQuery(e, q)).map((e) => e.id));

  if (q) {
    const keep = new Set(matches);
    for (const e of g.edges || []) {
      if (matches.has(e.from)) keep.add(e.to);
      if (matches.has(e.to)) keep.add(e.from);
    }
    visible = new Set([...visible].filter((id) => keep.has(id)));
  }

  if (f.depth > 0 && state.selection && state.index.get(state.selection)?.type === 'entry') {
    const reach = new Set([state.selection]);
    let frontier = [state.selection];
    for (let d = 0; d < f.depth; d++) {
      const next = [];
      for (const id of frontier) {
        const inc = state.incident.get(id);
        if (!inc) continue;
        for (const e of [...inc.out, ...inc.in])
          for (const o of [e.from, e.to])
            if (!reach.has(o)) {
              reach.add(o);
              next.push(o);
            }
      }
      frontier = next;
    }
    visible = new Set([...visible].filter((id) => reach.has(id)));
  }

  const links = [];
  for (const e of g.edges || []) {
    const grp = K.RELATION_GROUP[e.relation] || 'discourse';
    if (f.relGroups.size && !f.relGroups.has(grp)) continue;
    if (!visible.has(e.from) || !visible.has(e.to)) continue;
    links.push({
      id: e.id,
      from: e.from,
      to: e.to,
      kind: 'edge',
      cls: K.RELATION_CLASS[e.relation] || 'rel-discourse',
      title:
        `${e.relation}  (${grp})\n${e.from}\n→ ${e.to}` +
        (e.strength != null ? `\nstrength ${conf(e.strength)}` : '') +
        (e.sources?.[0]?.quote ? `\n\n“${e.sources[0].quote}”` : ''),
    });
  }

  if (f.hideOrphans) {
    const touched = new Set(links.flatMap((l) => [l.from, l.to]));
    visible = new Set([...visible].filter((id) => touched.has(id)));
  }

  view.render(
    visible,
    links.filter((l) => visible.has(l.from) && visible.has(l.to)),
    matches
  );
  view.setLabels(f.labels);

  $('#counts').textContent = `${visible.size}/${g.entries.length} entries · ${links.length} relations shown`;
  renderTab();
}

/* ----------------------------- inspector ----------------------------- */

function link(id, label) {
  const entry = state.index.get(id);
  const text = label || (entry ? entry.data.label || entry.data.id : id);
  return el(
    'span',
    {
      class: 'lnk',
      title: id,
      onclick: () => selectItem(id, entry ? entry.type : 'entry', true),
    },
    text
  );
}

function badge(text, style) {
  return el('span', { class: 'badge' + (style?.cls ? ' ' + style.cls : ''), style: style?.css }, text);
}

function kv(pairs) {
  const rows = pairs.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!rows.length) return null;
  const dl = el('dl', { class: 'kv' });
  for (const [k, v] of rows) {
    dl.append(el('dt', {}, k));
    dl.append(el('dd', {}, v && v.nodeType ? v : String(v)));
  }
  return dl;
}

function sourceBlock(s, extra) {
  return el(
    'div',
    { class: 'src' },
    el(
      'div',
      { class: 'loc' },
      [s.file, s.heading, s.lines ? `L${s.lines[0]}–${s.lines[1]}` : null, extra]
        .filter(Boolean)
        .join(' › ')
    ),
    s.quote ? el('blockquote', {}, `“${s.quote}”`) : null
  );
}

function renderInspector(id) {
  const host = $('#inspector');
  host.replaceChildren();
  if (!id || !state.index.has(id)) {
    host.append(el('div', { class: 'placeholder' }, 'Select an entry, relation, request or topic.'));
    return;
  }
  const { type, data } = state.index.get(id);
  if (type === 'entry') renderEntryInspector(host, data);
  else if (type === 'edge') renderEdgeInspector(host, data);
  else if (type === 'request') renderRequestInspector(host, data);
  else renderTopicInspector(host, data);
}

function renderEntryInspector(host, e) {
  const grp = K.groupOf(e);
  const status = e.definition_status || 'unknown';
  host.append(
    el('h2', {}, e.label || e.id),
    el(
      'div',
      { class: 'badges' },
      badge(status, { cls: 'status', css: `background:${K.STATUS_COLOR[status]}` }),
      badge(e.kind),
      badge(grp, { css: `border-color:${K.GROUP_COLOR[grp]}` }),
      e.role ? badge(e.role) : null,
      badge(`${K.mentionCount(e)} mention${K.mentionCount(e) === 1 ? '' : 's'}`),
      typeof e.confidence === 'number' ? badge(`conf ${conf(e.confidence)}`) : null,
      ...(e.layers || []).map((l) => badge(l, { css: `border-color:${K.LAYER_COLOR[l]}` })),
      ...(e.tags || []).map((t) => badge('#' + t))
    ),
    el('div', { class: 'mono', style: 'color:#66748c' }, e.id)
  );

  if (e.gloss) {
    host.append(
      el(
        'div',
        { class: 'gloss' + (e.gloss.provisional ? ' provisional' : '') },
        el('div', { class: 'gloss-tag' }, e.gloss.verbatim ? 'verbatim from the corpus' : 'provisional paraphrase'),
        e.gloss.text
      )
    );
  } else {
    host.append(el('div', { class: 'gloss empty' }, 'No gloss — the corpus never says what this is.'));
  }

  host.append(
    kv([
      ['aliases', (e.aliases || []).join(', ')],
      ['symbols', (e.symbols || []).join('  ')],
      ['domain', e.domain],
      ['layer drift', e.layer_drift],
      ['first seen', e.first_seen],
    ])
  );

  if (e.definition_ref) {
    const d = e.definition_ref;
    host.append(el('h3', {}, 'Definition'));
    host.append(
      kv([
        ['where', d.where],
        ['entry', d.entry ? link(d.entry) : null],
        ['theory node', d.node],
        ['citation', d.citation ? d.citation.text : null],
      ])
    );
    if (d.source) host.append(sourceBlock(d.source));
  }

  if ((e.senses || []).length) {
    host.append(el('h3', {}, `Senses (${e.senses.length})`));
    for (const s of e.senses) {
      host.append(
        el(
          'div',
          { class: 'sense' },
          el(
            'div',
            { class: 'badges' },
            badge(s.id.split('#')[1] || s.id),
            s.layer ? badge(s.layer, { css: `border-color:${K.LAYER_COLOR[s.layer]}` }) : null,
            s.definition_status ? badge(s.definition_status) : null
          ),
          s.gloss ? el('p', {}, s.gloss.text) : null,
          s.discriminator ? el('p', { class: 'discrim' }, `tell apart by: ${s.discriminator}`) : null
        )
      );
    }
  }

  const inc = state.incident.get(e.id) || { out: [], in: [], requests: [] };
  if (inc.out.length || inc.in.length) {
    host.append(el('h3', {}, `Relations (${inc.out.length + inc.in.length})`));
    host.append(
      el(
        'ul',
        { class: 'plain' },
        ...inc.out.map((r) =>
          el(
            'li',
            {},
            el('span', { class: `rel-tag ${K.RELATION_CLASS[r.relation]}` }, '→ ' + r.relation),
            link(r.to)
          )
        ),
        ...inc.in.map((r) =>
          el(
            'li',
            {},
            el('span', { class: `rel-tag ${K.RELATION_CLASS[r.relation]}` }, '← ' + r.relation),
            link(r.from)
          )
        )
      )
    );
  }

  if (inc.requests.length) {
    host.append(el('h3', {}, 'Definition request'));
    host.append(
      el(
        'ul',
        { class: 'plain' },
        ...inc.requests.map((r) =>
          el(
            'li',
            {},
            el('span', { class: `pill prio-${r.priority || 'low'}` }, r.priority || '—'),
            link(r.id, `${r.wants || 'gloss'} · ${r.score ?? '—'}`)
          )
        )
      )
    );
  }

  if ((e.grounds || []).length) {
    host.append(el('h3', {}, `Grounds (${e.grounds.length} theory node${e.grounds.length === 1 ? '' : 's'})`));
    host.append(el('div', { class: 'mono' }, e.grounds.join('\n')));
  }

  if ((e.references || []).length) {
    host.append(el('h3', {}, 'References'));
    host.append(
      el(
        'ul',
        { class: 'plain' },
        ...e.references.map((r) =>
          el('li', {}, r.url ? el('a', { class: 'lnk', href: r.url, target: '_blank' }, r.text) : r.text)
        )
      )
    );
  }

  if ((e.mentions || []).length) {
    host.append(el('h3', {}, `Mentions (${e.mentions.length})`));
    for (const m of e.mentions) {
      host.append(sourceBlock(m.source || {}, [m.role, m.sense && m.sense.split('#')[1]].filter(Boolean).join(' · ')));
    }
  }

  if (e.notes) {
    host.append(el('h3', {}, 'Extractor notes'));
    host.append(el('p', {}, e.notes));
  }
}

function renderEdgeInspector(host, e) {
  const grp = K.RELATION_GROUP[e.relation] || '?';
  host.append(
    el('h2', {}, e.relation.replace(/_/g, ' ')),
    el(
      'div',
      { class: 'badges' },
      badge('relation'),
      badge(grp, { css: `border-color:${K.RELATION_GROUP_COLOR[grp]}` }),
      K.isSymmetric(e.relation) ? badge('symmetric') : null,
      typeof e.strength === 'number' ? badge(`strength ${conf(e.strength)}`) : null,
      typeof e.confidence === 'number' ? badge(`conf ${conf(e.confidence)}`) : null
    ),
    el('div', { class: 'mono', style: 'color:#66748c' }, e.id),
    kv([
      ['from', link(e.from)],
      ['to', link(e.to)],
      ['from sense', e.from_sense],
      ['to sense', e.to_sense],
      ['label', e.label],
      ['notes', e.notes],
    ])
  );
  if ((e.sources || []).length) {
    host.append(el('h3', {}, 'Evidence'));
    for (const s of e.sources) host.append(sourceBlock(s));
  }
}

function renderRequestInspector(host, r) {
  host.append(
    el('h2', {}, `Wanted: ${r.wants || 'gloss'}`),
    el(
      'div',
      { class: 'badges' },
      badge('request'),
      el('span', { class: `badge prio-${r.priority || 'low'}` }, r.priority || '—'),
      badge(`score ${r.score ?? '—'}`),
      badge(r.status || 'open')
    ),
    el('div', { class: 'mono', style: 'color:#66748c' }, r.id),
    el('p', {}, r.reason || ''),
    kv([
      ['entry', link(r.entry)],
      [
        'blocked by',
        (r.blocked_by || []).length
          ? el('span', {}, ...(r.blocked_by || []).flatMap((b, i) => [i ? ', ' : '', link(b)]))
          : null,
      ],
      ['candidates', (r.candidates || []).map((c) => c.text).join('; ')],
      ['notes', r.notes],
    ])
  );
  if ((r.sources || []).length) {
    host.append(el('h3', {}, 'Where it is used'));
    for (const s of r.sources) host.append(sourceBlock(s));
  }
}

function renderTopicInspector(host, t) {
  host.append(
    el('h2', {}, t.name || t.id),
    el('div', { class: 'badges' }, badge('topic'), t.kind ? badge(t.kind) : null),
    el('div', { class: 'mono', style: 'color:#66748c' }, t.id),
    t.summary ? el('p', {}, t.summary) : null,
    kv([
      ['root', t.root ? link(t.root) : null],
      ['layers', (t.layers || []).join(', ')],
    ]),
    el('h3', {}, `Members (${(t.members || []).length})`),
    el('ul', { class: 'plain' }, ...(t.members || []).map((m) => el('li', {}, link(m))))
  );
}

function selectItem(id, type, center = false) {
  state.selection = id;
  if (!id) {
    view.select(null, true);
    renderInspector(null);
    markTableSelection();
    return;
  }
  if (type === 'entry') {
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
  const t = el('table', { class: 'grid' });
  t.append(
    el('thead', {}, el('tr', {}, ...cols.map((c) => el('th', { class: c.mono ? 'mono' : null }, c.label))))
  );
  const tb = el('tbody');
  for (const r of rows) {
    const tr = el('tr', { dataset: { id: r._id || '' }, onclick: () => onRow && onRow(r) });
    for (const c of cols) {
      const v = c.get(r);
      tr.append(
        el(
          'td',
          {
            class: [c.mono ? 'mono' : null, c.trunc ? 'trunc' : null].filter(Boolean).join(' ') || null,
            title: c.trunc ? String(v ?? '') : null,
          },
          v && v.nodeType ? v : fmt(v)
        )
      );
    }
    tb.append(tr);
  }
  t.append(tb);
  return t;
}

function markTableSelection() {
  document.querySelectorAll('#tab-body tbody tr').forEach((tr) => {
    tr.classList.toggle('sel', tr.dataset.id && tr.dataset.id === state.selection);
  });
}

function statusPill(s) {
  return el('span', { class: 'pill', style: `color:${K.STATUS_COLOR[s] || '#888'}` }, s);
}

function renderTab() {
  const body = $('#tab-body');
  body.replaceChildren();
  const g = state.graph;
  if (!g) {
    body.append(el('div', { class: 'empty-note' }, 'No graph loaded.'));
    return;
  }
  const pick = (r) => selectItem(r._id, r._type, true);

  switch (state.tab) {
    case 'entries': {
      const rows = g.entries.map((e) => ({ ...e, _id: e.id, _type: 'entry' }));
      body.append(
        table(
          [
            { label: 'status', get: (r) => statusPill(r.definition_status) },
            { label: 'kind', get: (r) => r.kind, mono: true },
            { label: 'label', get: (r) => r.label },
            { label: 'n', get: (r) => K.mentionCount(r), mono: true },
            { label: 'role', get: (r) => r.role, mono: true },
            { label: 'layers', get: (r) => (r.layers || []).join(', '), mono: true },
            { label: 'gloss', get: (r) => r.gloss?.text, trunc: true },
            { label: 'id', get: (r) => r.id, mono: true, trunc: true },
          ],
          rows,
          pick
        )
      );
      break;
    }
    case 'edges': {
      const rows = (g.edges || []).map((e) => ({ ...e, _id: e.id, _type: 'edge' }));
      body.append(
        table(
          [
            { label: 'relation', get: (r) => r.relation, mono: true },
            {
              label: 'group',
              get: (r) =>
                el(
                  'span',
                  { class: 'pill', style: `color:${K.RELATION_GROUP_COLOR[K.RELATION_GROUP[r.relation]]}` },
                  K.RELATION_GROUP[r.relation] || '?'
                ),
            },
            { label: 'from', get: (r) => link(r.from), trunc: true },
            { label: 'to', get: (r) => link(r.to), trunc: true },
            { label: 'str', get: (r) => conf(r.strength), mono: true },
            { label: 'evidence', get: (r) => r.sources?.[0]?.quote || r.notes, trunc: true },
          ],
          rows,
          pick
        )
      );
      break;
    }
    case 'requests': {
      const rows = state.requests.map((r) => ({ ...r, _id: r.id, _type: 'request' }));
      body.append(
        el(
          'div',
          { class: 'mono', style: 'margin:2px 0 6px;color:#8b98ab' },
          state.requestsDerived
            ? 'derived from the graph (no requests[] in the file) — score = ½·centrality + ½·mentions'
            : `declared in the file (${rows.length})`
        )
      );
      body.append(
        rows.length
          ? table(
              [
                {
                  label: 'prio',
                  get: (r) => el('span', { class: `pill prio-${r.priority || 'low'}` }, r.priority || '—'),
                },
                { label: 'score', get: (r) => r.score, mono: true },
                { label: 'entry', get: (r) => link(r.entry), trunc: true },
                { label: 'wants', get: (r) => r.wants, mono: true },
                { label: 'reason', get: (r) => r.reason, trunc: true },
                {
                  label: 'blocked by',
                  get: (r) =>
                    el('span', {}, ...(r.blocked_by || []).flatMap((b, i) => [i ? ', ' : '', link(b)])),
                  trunc: true,
                },
              ],
              rows,
              pick
            )
          : el('div', { class: 'empty-note' }, 'Nothing owed — every load-bearing term is defined.')
      );
      break;
    }
    case 'topics': {
      const rows = (g.topics || []).map((t) => ({ ...t, _id: t.id, _type: 'topic' }));
      body.append(
        rows.length
          ? table(
              [
                { label: 'name', get: (r) => r.name },
                { label: 'kind', get: (r) => r.kind, mono: true },
                { label: 'root', get: (r) => (r.root ? link(r.root) : '—'), trunc: true },
                { label: 'layers', get: (r) => (r.layers || []).join(', '), mono: true },
                {
                  label: 'members',
                  get: (r) =>
                    el('span', {}, ...(r.members || []).flatMap((m, i) => [i ? ', ' : '', link(m)])),
                  trunc: true,
                },
                { label: 'summary', get: (r) => r.summary, trunc: true },
              ],
              rows,
              pick
            )
          : el('div', { class: 'empty-note' }, 'No topics.')
      );
      break;
    }
    case 'issues': {
      const rows = g.unresolved || [];
      body.append(
        rows.length
          ? table(
              [
                { label: 'kind', get: (r) => el('span', { class: 'pill sev-warn' }, r.kind) },
                { label: 'description', get: (r) => r.description, trunc: true },
                {
                  label: 'refs',
                  get: (r) => el('span', {}, ...(r.refs || []).flatMap((m, i) => [i ? ', ' : '', link(m, m)])),
                  trunc: true,
                },
                { label: 'layers', get: (r) => (r.layers || []).join(', '), mono: true },
              ],
              rows,
              null
            )
          : el('div', { class: 'empty-note' }, 'No unresolved issues recorded.')
      );
      break;
    }
    case 'diagnostics': {
      const problems = K.validateKnowledgeGraph(g);
      const advisory = K.findAdvisoryIssues(g);
      const wrap = el('div');
      wrap.append(
        el(
          'h3',
          { style: 'margin:2px 0 6px;font-size:11px;color:#8b98ab' },
          problems.length ? `${problems.length} structural problem(s)` : 'Structurally valid ✓'
        )
      );
      if (state.repairs.length) {
        wrap.append(
          el(
            'div',
            { class: 'sev-warn', style: 'margin-bottom:6px' },
            `Repaired on load: ` + state.repairs.map((r) => `${r.id} (${r.as})`).join(', ')
          )
        );
      }
      if (problems.length) {
        wrap.append(
          el('ul', { class: 'plain' }, ...problems.map((p) => el('li', { class: 'sev-error mono' }, p)))
        );
      }
      if (advisory.length) {
        wrap.append(
          el('h3', { style: 'margin:12px 0 6px;font-size:11px;color:#8b98ab' }, `${advisory.length} advisory`)
        );
        wrap.append(
          el(
            'ul',
            { class: 'plain' },
            ...advisory.map((a) => el('li', { class: 'sev-warn' }, `${a.kind}: ${a.description}`))
          )
        );
      }
      body.append(wrap);
      break;
    }
    case 'stats': {
      const computed = K.computeStats({ ...g, requests: state.requests });
      const declared = g.stats || {};
      const dist = (title, obj) =>
        el(
          'div',
          { style: 'margin-bottom:10px' },
          el('h3', { style: 'margin:2px 0 4px;font-size:11px;color:#8b98ab' }, title),
          el(
            'div',
            { class: 'mono' },
            Object.entries(obj || {})
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${k}: ${v}`)
              .join('   ') || '—'
          )
        );
      body.append(
        el(
          'div',
          { class: 'mono', style: 'margin-bottom:8px' },
          `computed  entries=${computed.entries} relations=${computed.edges} requests=${computed.requests} ` +
            `mentions=${computed.mentions} undefined=${computed.undefined_entries} bridged=${computed.bridged_entries}`
        ),
        el(
          'div',
          { class: 'mono', style: 'margin-bottom:12px;color:#8b98ab' },
          `declared  ${
            Object.entries(declared)
              .filter(([, v]) => typeof v !== 'object')
              .map(([k, v]) => `${k}=${v}`)
              .join(' ') || '—'
          }`
        ),
        dist('by definition status', computed.by_definition_status),
        dist('by group', computed.by_group),
        dist('by kind', computed.by_kind),
        dist('by relation group', computed.by_relation_group),
        dist('by relation', computed.by_relation),
        dist('by layer', computed.by_layer)
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
  const vis = new Set([...view.entries.keys()].filter((id) => view.visible?.has(id)));
  const out = {
    ...g,
    entries: g.entries.filter((e) => vis.has(e.id)),
    edges: (g.edges || []).filter((e) => vis.has(e.from) && vis.has(e.to)),
    requests: state.requests.filter((r) => vis.has(r.entry)),
    topics: (g.topics || [])
      .map((t) => ({ ...t, members: (t.members || []).filter((m) => vis.has(m)) }))
      .filter((t) => t.members.length),
  };
  out.stats = K.computeStats(out);
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'subgraph.knowledge_graph.json' });
  document.body.append(a);
  a.click();
  a.remove();
}

/* ------------------------------- wiring ------------------------------ */

function wire() {
  buildSamples();

  $('#file-input').addEventListener('change', (e) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = '';
  });
  $('#url-load').addEventListener('click', () => {
    const u = $('#url-input').value.trim();
    if (u) loadUrl(u);
  });
  $('#url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#url-load').click();
  });

  $('#q').addEventListener('input', (e) => {
    state.filters.query = e.target.value;
    applyFilters();
  });
  $('#mentions').addEventListener('input', (e) => {
    state.filters.minMentions = Number(e.target.value);
    $('#mentions-val').textContent = String(state.filters.minMentions);
    applyFilters();
  });
  $('#depth').addEventListener('input', (e) => {
    state.filters.depth = Number(e.target.value);
    $('#depth-val').textContent = state.filters.depth ? `${state.filters.depth} hop(s)` : 'off';
    applyFilters();
  });
  $('#lane-mode').addEventListener('change', (e) => {
    state.filters.laneMode = e.target.value;
    view.setLaneMode(e.target.value);
    applyFilters();
    view.fit();
  });

  const toggles = {
    '#o-labels': 'labels',
    '#o-orphans': 'hideOrphans',
    '#o-needs': 'needsOnly',
  };
  for (const [sel, key] of Object.entries(toggles)) {
    $(sel).addEventListener('change', (e) => {
      state.filters[key] = e.target.checked;
      applyFilters();
    });
  }

  $('#btn-fit').addEventListener('click', () => view.fit());
  $('#btn-relayout').addEventListener('click', () => {
    view.layout();
    applyFilters();
    view.fit();
  });
  $('#btn-export').addEventListener('click', exportVisible);
  $('#btn-queue').addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    document.querySelector('.tab[data-tab="requests"]').classList.add('active');
    state.tab = 'requests';
    document.body.classList.remove('bottom-collapsed');
    renderTab();
  });

  for (const t of document.querySelectorAll('.tab')) {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      state.tab = t.dataset.tab;
      document.body.classList.remove('bottom-collapsed');
      renderTab();
    });
  }
  $('#bottom-toggle').addEventListener('click', (e) => {
    document.body.classList.toggle('bottom-collapsed');
    e.target.textContent = document.body.classList.contains('bottom-collapsed') ? '▴' : '▾';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (++dragDepth === 1) document.body.classList.add('dragging');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => {
    if (--dragDepth <= 0) {
      dragDepth = 0;
      document.body.classList.remove('dragging');
    }
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    const f = e.dataTransfer?.files?.[0];
    if (f) loadFile(f);
  });

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }
    if (e.key === 'f') view.fit();
    if (e.key === 'Escape') selectItem(null, null);
    if (e.key === 'q') $('#btn-queue').click();
    if (e.key === '/') {
      e.preventDefault();
      $('#q').focus();
    }
  });

  window.addEventListener('popstate', (e) => {
    const src = e.state && 'src' in e.state ? e.state.src : currentSrc();
    if (src && src !== state.src) {
      $('#url-input').value = src;
      loadUrl(src, { history: false });
    } else if (!src) {
      state.src = null;
      markActiveSample();
    }
  });

  const src = currentSrc();
  if (src) {
    $('#url-input').value = src;
    loadUrl(src, { replace: true });
  } else markActiveSample();
}

wire();