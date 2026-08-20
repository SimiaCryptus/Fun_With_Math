import { loadGraph } from './data.js';
import { indexGraph } from './graph-model.js';
import { Store } from './store.js';
import { readRoute, writeRoute, onRoute } from './router.js';
import { waitForMarked } from './render.js';
import { createSidebar } from './views/sidebar.js';
import { createDetailView } from './views/detail.js';
import { createMapView } from './views/map.js';
import { createIssuesView, createCorpusView } from './views/panels.js';

const VIEWS = ['node', 'map', 'issues', 'corpus'];

boot();

async function boot() {
  const content = document.getElementById('content');
  let graph;
  try {
    graph = await loadGraph('./theory_graph.json');
  } catch (err) {
    content.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'fatal';
    p.textContent =
      `Could not load theory_graph.json (${err.message}). ` +
      `Serve this directory over HTTP, e.g. "python3 -m http.server" from experiments/primegen/analysis.`;
    content.appendChild(p);
    return;
  }

  await waitForMarked(4000);

  const idx = indexGraph(graph);
  const route = readRoute();

  const store = new Store({
    view: route.view,
    selected: route.id && idx.nodes.has(route.id) ? route.id : null,
    query: '',
    kinds: new Set(),
    statuses: new Set(),
    domains: new Set(),
    cluster: '',
    minConfidence: 0,
    sort: 'kind',
    mapScope: 'neighborhood',
    mapDepth: 2,
  });

  // header ------------------------------------------------------------
  const firstDoc = graph.corpus?.documents?.[0];
  document.getElementById('brand-title').textContent = 'Theory Browser';
  document.getElementById('brand-sub').textContent = firstDoc?.title || 'theory_graph.json';
  document.getElementById('appbar-meta').textContent = [
    `v${graph.version ?? '?'}`,
    `${graph.nodes.length} nodes`,
    `${(graph.edges || []).length} edges`,
    `${(graph.clusters || []).length} clusters`,
    `${(graph.unresolved || []).length} unresolved`,
  ].join('  ·  ');

  const tabs = [...document.querySelectorAll('#tabs .tab')];
  for (const t of tabs) {
    t.addEventListener('click', () => store.set({ view: t.dataset.view }));
  }

  // views -------------------------------------------------------------
  const panes = Object.fromEntries(VIEWS.map((v) => [v, document.getElementById(`view-${v}`)]));

  const sidebar = createSidebar(document.getElementById('sidebar'), idx, store);
  const detail = createDetailView(panes.node, idx, store);
  const map = createMapView(panes.map, idx, store);
  const issues = createIssuesView(panes.issues, idx, store);
  const corpus = createCorpusView(panes.corpus, idx, store);

  const views = { node: detail, map, issues, corpus };

  let last = {};
  store.subscribe((s) => {
    const viewChanged = s.view !== last.view;
    for (const v of VIEWS) panes[v].hidden = v !== s.view;
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.view === s.view));

    sidebar.update(s);
    views[s.view].update(s, { activated: viewChanged });

    // keep the map warm so switching to it is instant
    if (s.view !== 'map' && s.selected !== last.selected) map.invalidate();

    writeRoute(
      { view: s.view, id: s.view === 'issues' || s.view === 'corpus' ? '' : s.selected },
      true
    );
    last = { view: s.view, selected: s.selected };
  });

  onRoute((r) => {
    const patch = { view: r.view };
    if (r.id && idx.nodes.has(r.id)) patch.selected = r.id;
    store.set(patch);
  });

  // global keys --------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      sidebar.focusSearch();
    } else if (e.key === 'Escape' && typing) {
      e.target.blur();
    } else if (!typing && e.key.toLowerCase() === 'm') {
      store.set({ view: store.get().view === 'map' ? 'node' : 'map' });
    }
  });

  store.emit();
}
